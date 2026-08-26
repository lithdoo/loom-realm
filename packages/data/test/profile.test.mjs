import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryCarrierPair } from "@loomrealm/foundation/testing";
import {
  createRendererDataPeer,
  createSubsystemDataPeer,
  RENDERER_DATA_PROFILE_V1,
} from "../dist/index.js";

const accepted = () => ({ kind: "accepted" });
const binding = (carrier) => ({
  carrier,
  subsystemKey: "map",
  generation: 1,
  dataProfile: RENDERER_DATA_PROFILE_V1,
});
const tick = () => new Promise((resolve) => setImmediate(resolve));

test("routes Input and Render over one shared profile connection", async () => {
  const pair = createMemoryCarrierPair();
  const seen = [];
  const subsystem = createSubsystemDataPeer({
    binding: binding(pair.left),
    handlers: {
      onInputState(message) { seen.push(["state", message.channel]); return accepted(); },
      onInputEvent: accepted,
      onInputReset: accepted,
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

  assert.deepEqual(
    await subsystem.input.sendInterest({
      type: "input.interest",
      frames: [{ frameId: "f1", channels: ["x.demo.state"] }],
    }),
    { kind: "sent" },
  );
  assert.deepEqual(
    await subsystem.render.sendDomains({ type: "render.domains", domains: ["hud"] }),
    { kind: "sent" },
  );
  assert.deepEqual(
    await renderer.input.sendState({
      type: "input.state",
      frameId: "f1",
      activationId: "a1",
      channel: "x.demo.state",
      payload: { hp: 3 },
    }),
    { kind: "sent" },
  );

  await tick();
  assert.deepEqual(seen, [["interest", 1], ["domains", 1], ["state", "x.demo.state"]]);
  await subsystem.close();
  await renderer.terminal;
});

test("wrong-direction inbound message fails the current Data peer closed", async () => {
  const pair = createMemoryCarrierPair();
  const subsystem = createSubsystemDataPeer({
    binding: binding(pair.left),
    handlers: { onInputState: accepted, onInputEvent: accepted, onInputReset: accepted },
  });
  await pair.right.send(JSON.stringify({ type: "render.domains", domains: [] }));
  const terminal = await subsystem.terminal;
  assert.equal(terminal.kind, "protocol-fatal");
  assert.equal(terminal.protocol, "render");
});

test("invalid local message becomes local-fatal without wire emission", async () => {
  const pair = createMemoryCarrierPair();
  const subsystem = createSubsystemDataPeer({
    binding: binding(pair.left),
    handlers: { onInputState: accepted, onInputEvent: accepted, onInputReset: accepted },
  });
  const result = await subsystem.input.sendInterest({
    type: "input.interest",
    frames: [{ frameId: "f1", channels: ["keyboard.bad"] }],
  });
  assert.equal(result.kind, "terminal");
  assert.equal(result.terminal.kind, "local-fatal");
});

test("shared writer keeps at most one carrier.send pending", async () => {
  let active = 0;
  let maxActive = 0;
  let resolveClosed;
  const closed = new Promise((resolve) => { resolveClosed = resolve; });
  async function* messages() { await closed; }
  const carrier = {
    closed,
    messages,
    async send() {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
    },
    async close() { resolveClosed({ kind: "closed" }); },
  };
  const subsystem = createSubsystemDataPeer({
    binding: binding(carrier),
    handlers: { onInputState: accepted, onInputEvent: accepted, onInputReset: accepted },
  });
  const [render, input] = await Promise.all([
    subsystem.render.sendDomains({ type: "render.domains", domains: [] }),
    subsystem.input.sendInterest({ type: "input.interest", frames: [] }),
  ]);
  assert.equal(render.kind, "sent");
  assert.equal(input.kind, "sent");
  assert.equal(maxActive, 1);
  await subsystem.close();
});
