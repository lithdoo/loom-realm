import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createMemoryCarrierPair } from "@loomrealm/foundation/testing";
import {
  createRendererDataPeer,
  createSubsystemDataPeer,
  RENDERER_DATA_PROFILE_V1,
} from "../../packages/data/dist/index.js";
import { fixtureSetRevision } from "./fixtures-v3.mjs";
import { qualify, registerCoverageAudit } from "./helpers/qualification.mjs";

const accepted = () => ({ kind: "accepted" });
const binding = (carrier) => ({
  carrier,
  subsystemKey: "demo",
  generation: 1,
  dataProfile: RENDERER_DATA_PROFILE_V1,
});
const tick = () => new Promise((resolve) => setImmediate(resolve));

qualify("identity-cohort", "corrected /1 identity and coordinated product composition", async ({ prove }) => {
  await prove("profile-identity-four-child", async () => {
    assert.equal(RENDERER_DATA_PROFILE_V1, "loomrealm.renderer-data/1");
    const pair = createMemoryCarrierPair();
    const seen = [];
    const subsystem = createSubsystemDataPeer({
      binding: binding(pair.left),
      handlers: {
        onInputState(message) { seen.push(message.type); return accepted(); },
        onInputEvent: accepted,
        onInputReset(message) { seen.push(message.type); return accepted(); },
        onViewportState(message) { seen.push(message.type); return accepted(); },
      },
    });
    const renderer = createRendererDataPeer({
      binding: binding(pair.right),
      handlers: {
        onInputInterest(message) { seen.push(message.type); return accepted(); },
        onRenderDomains(message) { seen.push(message.type); return accepted(); },
        onRenderSnapshot: accepted,
        onRenderPatch: accepted,
        onRenderEvent: accepted,
      },
    });
    await subsystem.input.sendInterest({ type: "input.interest", frames: [] });
    await subsystem.render.sendDomains({ type: "render.domains", domains: [] });
    await renderer.input.sendReset({ type: "input.reset", frameId: "f1", activationId: "a1" });
    await renderer.viewport.sendState({ type: "viewport.state", width: 320, height: 240 });
    await tick();
    assert.deepEqual(seen, ["input.interest", "render.domains", "input.reset", "viewport.state"]);
    await renderer.close();
    await subsystem.terminal;
  });

  await prove("fixture-set-revision-3", async () => {
    assert.equal(fixtureSetRevision, 3);
    const conformance = await readFile(new URL("../../doc/15-contracts/renderer-data-profile-conformance-v1.md", import.meta.url), "utf8");
    assert.match(conformance, /fixtureSetRevision = 3/);
  });

  await prove("no-renderer-data-2-identity", async () => {
    const dataIndex = await readFile(new URL("../../packages/data/src/model.ts", import.meta.url), "utf8");
    assert.match(dataIndex, /loomrealm\.renderer-data\/1/);
    assert.doesNotMatch(dataIndex, /renderer-data\/2/);
    const runtime = await readFile(new URL("../../packages/data/src/runtime.ts", import.meta.url), "utf8");
    assert.doesNotMatch(runtime, /featureFlag|compatMode|dual parser|handshake/i);
  });

  await prove("main-selects-profile-without-size", async () => {
    const main = await readFile(new URL("../../packages/main/src/internal/main-session.ts", import.meta.url), "utf8");
    assert.match(main, /RENDERER_DATA_PROFILE_V1 = "loomrealm\.renderer-data\/1"/);
    assert.doesNotMatch(main, /viewport\.state|innerWidth|innerHeight/);
  });

  await prove("desktop-unified-holder-construction", async () => {
    const entry = await readFile(new URL("../../apps/desktop/src/renderer-entry.ts", import.meta.url), "utf8");
    assert.match(entry, /createRendererControlHolder\(dataBinding, inputSource, viewportSource\)/);
  });
});

qualify("application-unit", "shared reader, writer, direction and viewport diagnostics", async ({ prove }) => {
  await prove("one-json-text-unit", async () => {
    const pair = createMemoryCarrierPair();
    const renderer = createRendererDataPeer({
      binding: binding(pair.right),
      handlers: {
        onInputInterest: accepted,
        onRenderDomains: accepted,
        onRenderSnapshot: accepted,
        onRenderPatch: accepted,
        onRenderEvent: accepted,
      },
    });
    await pair.left.send(JSON.stringify({ type: "viewport.state", width: 1, height: 1 }));
    const terminal = await renderer.terminal;
    assert.equal(terminal.kind, "protocol-fatal");
    assert.equal(terminal.protocol, "viewport");
  });

  await prove("one-logical-reader", async () => {
    let messagesCalls = 0;
    let resolveClosed;
    const closed = new Promise((resolve) => { resolveClosed = resolve; });
    const carrier = {
      closed,
      async send() {},
      messages() {
        messagesCalls += 1;
        return { async *[Symbol.asyncIterator]() { await closed; } };
      },
      async close() { resolveClosed({ kind: "closed" }); },
    };
    const peer = createSubsystemDataPeer({
      binding: binding(carrier),
      handlers: {
        onInputState: accepted,
        onInputEvent: accepted,
        onInputReset: accepted,
        onViewportState: accepted,
      },
    });
    await tick();
    assert.equal(messagesCalls, 1);
    await peer.close();
  });

  await prove("ordered-child-disposition", async () => {
    const pair = createMemoryCarrierPair();
    const seen = [];
    const subsystem = createSubsystemDataPeer({
      binding: binding(pair.left),
      handlers: {
        onInputState(message) { seen.push(message.type); return accepted(); },
        onInputEvent: accepted,
        onInputReset(message) { seen.push(message.type); return accepted(); },
        onViewportState(message) { seen.push(message.type); return accepted(); },
      },
    });
    const renderer = createRendererDataPeer({
      binding: binding(pair.right),
      handlers: {
        onInputInterest: accepted,
        onRenderDomains: accepted,
        onRenderSnapshot: accepted,
        onRenderPatch: accepted,
        onRenderEvent: accepted,
      },
    });
    await renderer.viewport.sendState({ type: "viewport.state", width: 10, height: 10 });
    await renderer.input.sendReset({ type: "input.reset", frameId: "f1", activationId: "a1" });
    await tick();
    assert.deepEqual(seen, ["viewport.state", "input.reset"]);
    await renderer.close();
    await subsystem.terminal;
  });

  await prove("one-writer-max-one-physical-send", async () => {
    let active = 0;
    let maxActive = 0;
    let resolveClosed;
    const closed = new Promise((resolve) => { resolveClosed = resolve; });
    const carrier = {
      closed,
      async send() {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active -= 1;
      },
      async *messages() { await closed; },
      async close() { resolveClosed({ kind: "closed" }); },
    };
    const renderer = createRendererDataPeer({
      binding: binding(carrier),
      handlers: {
        onInputInterest: accepted,
        onRenderDomains: accepted,
        onRenderSnapshot: accepted,
        onRenderPatch: accepted,
        onRenderEvent: accepted,
      },
    });
    await Promise.all([
      renderer.viewport.sendState({ type: "viewport.state", width: 11, height: 11 }),
      renderer.input.sendReset({ type: "input.reset", frameId: "f1", activationId: "a1" }),
    ]);
    assert.equal(maxActive, 1);
    await renderer.close();
  });

  await prove("viewport-direction-renderer-to-subsystem", async () => {
    const pair = createMemoryCarrierPair();
    const subsystem = createSubsystemDataPeer({
      binding: binding(pair.left),
      handlers: {
        onInputState: accepted,
        onInputEvent: accepted,
        onInputReset: accepted,
        onViewportState: accepted,
      },
    });
    await pair.right.send(JSON.stringify({ type: "render.domains", domains: [] }));
    const terminal = await subsystem.terminal;
    assert.equal(terminal.protocol, "render");
  });

  await prove("viewport-diagnostic-family", async () => {
    const pair = createMemoryCarrierPair();
    const subsystem = createSubsystemDataPeer({
      binding: binding(pair.left),
      handlers: {
        onInputState: accepted,
        onInputEvent: accepted,
        onInputReset: accepted,
        onViewportState: accepted,
      },
    });
    await pair.right.send(JSON.stringify({ type: "viewport.state", width: 0, height: 1 }));
    const terminal = await subsystem.terminal;
    assert.equal(terminal.protocol, "viewport");
  });

  await prove("unknown-type-profile-family", async () => {
    const pair = createMemoryCarrierPair();
    const subsystem = createSubsystemDataPeer({
      binding: binding(pair.left),
      handlers: {
        onInputState: accepted,
        onInputEvent: accepted,
        onInputReset: accepted,
        onViewportState: accepted,
      },
    });
    await pair.right.send(JSON.stringify({ type: "not-a-child" }));
    const terminal = await subsystem.terminal;
    assert.equal(terminal.kind, "protocol-fatal");
    assert.equal(terminal.protocol, "profile");
  });
});

qualify("inherited-children", "revision 3 keeps Connection, Input and Render as current children", async ({ prove }) => {
  await prove("connection-input-render-remain-current", async () => {
    const pair = createMemoryCarrierPair();
    const seen = [];
    const subsystem = createSubsystemDataPeer({
      binding: binding(pair.left),
      handlers: {
        onInputState(message) { seen.push(["state", message.channel]); return accepted(); },
        onInputEvent: accepted,
        onInputReset: accepted,
        onViewportState: accepted,
      },
    });
    const renderer = createRendererDataPeer({
      binding: binding(pair.right),
      handlers: {
        onInputInterest(message) { seen.push(["interest", message.frames.length]); return accepted(); },
        onRenderDomains(message) { seen.push(["domains", message.domains.length]); return accepted(); },
        onRenderSnapshot: accepted,
        onRenderPatch: accepted,
        onRenderEvent: accepted,
      },
    });
    await subsystem.input.sendInterest({
      type: "input.interest",
      frames: [{ frameId: "f1", channels: ["x.demo.state"] }],
    });
    await subsystem.render.sendDomains({ type: "render.domains", domains: ["hud"] });
    await renderer.input.sendState({
      type: "input.state",
      frameId: "f1",
      activationId: "a1",
      channel: "x.demo.state",
      payload: { hp: 3 },
    });
    await tick();
    assert.deepEqual(seen, [["interest", 1], ["domains", 1], ["state", "x.demo.state"]]);
    await subsystem.close();
    await renderer.terminal;
  });
});

registerCoverageAudit();
