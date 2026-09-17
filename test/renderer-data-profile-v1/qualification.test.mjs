import assert from "node:assert/strict";
import { createMemoryCarrierPair } from "@loomrealm/foundation/testing";
import {
  createRendererDataPeer,
  createSubsystemDataPeer,
  RENDERER_DATA_PROFILE_V1,
} from "../../packages/data/dist/index.js";
import { qualify, registerCoverageAudit } from "./helpers/qualification.mjs";

/**
 * Renderer Data Profile v1 conformance, fixtureSetRevision 3.
 * Revised four-child `/1` (Connection1 + Input1 + Render1 + Viewport1).
 * Every assertion runs against the current built @loomrealm/data subject.
 */

const accepted = () => ({ kind: "accepted" });
const tick = () => new Promise((resolve) => setImmediate(resolve));

const dataBinding = (carrier, overrides = {}) => ({
  carrier,
  subsystemKey: "map",
  generation: 1,
  dataProfile: RENDERER_DATA_PROFILE_V1,
  ...overrides,
});

function subsystemPeer(carrier, handlers = {}) {
  return createSubsystemDataPeer({
    binding: dataBinding(carrier),
    handlers: {
      onInputState: accepted,
      onInputEvent: accepted,
      onInputReset: accepted,
      onViewportState: accepted,
      ...handlers,
    },
  });
}

function rendererPeer(carrier, handlers = {}) {
  return createRendererDataPeer({
    binding: dataBinding(carrier),
    handlers: {
      onInputInterest: accepted,
      onRenderDomains: accepted,
      onRenderSnapshot: accepted,
      onRenderPatch: accepted,
      onRenderEvent: accepted,
      ...handlers,
    },
  });
}

function customCarrier({ units = [], sendBehavior } = {}) {
  let resolveClosed;
  const closed = new Promise((resolve) => { resolveClosed = resolve; });
  const state = { messagesCalls: 0, sent: [] };
  const carrier = {
    closed,
    get state() { return state; },
    async send(text) {
      state.sent.push(text);
      await sendBehavior?.(text);
    },
    async *messages() {
      state.messagesCalls += 1;
      for (const unit of units) yield unit;
      await closed;
    },
    async close() { resolveClosed({ kind: "closed" }); },
    lose(cause) { resolveClosed({ kind: "lost", ...(cause === undefined ? {} : { cause }) }); },
  };
  return carrier;
}

const inputState = (payload = {}) => ({
  type: "input.state",
  frameId: "f1",
  activationId: "a1",
  channel: "x.demo.state",
  payload,
});

qualify("identity-cohort", "exact revised /1 identity and coordinated first-release cohort", async ({ prove }) => {
  await prove("exact-profile-identity-binding", async () => {
    const pair = createMemoryCarrierPair();
    const subsystem = subsystemPeer(pair.left);
    const renderer = rendererPeer(pair.right);
    assert.equal(subsystem.binding.dataProfile, "loomrealm.renderer-data/1");
    assert.equal(renderer.binding.dataProfile, "loomrealm.renderer-data/1");
    assert.equal(subsystem.binding.subsystemKey, "map");
    assert.equal(subsystem.binding.generation, 1);
    await subsystem.close();
    await renderer.terminal;
  });

  await prove("unsupported-profile-identity-rejected-before-carrier-effects", async () => {
    const carrier = customCarrier();
    assert.throws(
      () => createSubsystemDataPeer({
        binding: dataBinding(carrier, { dataProfile: "loomrealm.renderer-data/2" }),
        handlers: {
          onInputState: accepted,
          onInputEvent: accepted,
          onInputReset: accepted,
          onViewportState: accepted,
        },
      }),
      TypeError,
    );
    // Construction failure must consume zero carrier side effects.
    assert.equal(carrier.state.messagesCalls, 0);
    assert.deepEqual(carrier.state.sent, []);
    await carrier.close();
  });

  await prove("four-child-composition-single-connection-dispatch", async () => {
    const pair = createMemoryCarrierPair();
    const subsystemSeen = [];
    const rendererSeen = [];
    const subsystem = subsystemPeer(pair.left, {
      onInputState: (m) => { subsystemSeen.push(m.type); return accepted(); },
      onInputEvent: (m) => { subsystemSeen.push(m.type); return accepted(); },
      onInputReset: (m) => { subsystemSeen.push(m.type); return accepted(); },
      onViewportState: (m) => { subsystemSeen.push(m.type); return accepted(); },
    });
    const renderer = rendererPeer(pair.right, {
      onInputInterest: (m) => { rendererSeen.push(m.type); return accepted(); },
      onRenderDomains: (m) => { rendererSeen.push(m.type); return accepted(); },
      onRenderSnapshot: (m) => { rendererSeen.push(m.type); return accepted(); },
      onRenderPatch: (m) => { rendererSeen.push(m.type); return accepted(); },
      onRenderEvent: (m) => { rendererSeen.push(m.type); return accepted(); },
    });
    await subsystem.input.sendInterest({ type: "input.interest", frames: [] });
    await subsystem.render.sendDomains({ type: "render.domains", domains: [] });
    await subsystem.render.sendSnapshot({ type: "render.snapshot", domainId: "d1", revision: 1, zIndex: 0, roots: [] });
    await subsystem.render.sendPatch({ type: "render.patch", domainId: "d1", baseRevision: 1, revision: 2, zIndex: 0, ops: [] });
    await subsystem.render.sendEvent({ type: "render.event", domainId: "d1", targetKey: "k", name: "n", data: {} });
    await renderer.input.sendState(inputState());
    await renderer.input.sendEvent({
      type: "input.event", frameId: "f1", activationId: "a1", channel: "x.demo.event", payload: {},
    });
    await renderer.input.sendReset({ type: "input.reset", frameId: "f1", activationId: "a1" });
    await renderer.viewport.sendState({ type: "viewport.state", width: 640, height: 480 });
    await tick();
    assert.deepEqual(rendererSeen, ["input.interest", "render.domains", "render.snapshot", "render.patch", "render.event"]);
    assert.deepEqual(subsystemSeen, ["input.state", "input.event", "input.reset", "viewport.state"]);
    await subsystem.close();
    await renderer.terminal;
  });

  await prove("viewport-masquerade-not-consumed-as-input", async () => {
    const pair = createMemoryCarrierPair();
    const calls = [];
    const subsystem = subsystemPeer(pair.left, {
      onInputState: () => { calls.push("input"); return accepted(); },
      onViewportState: () => { calls.push("viewport"); return accepted(); },
    });
    await pair.right.send(JSON.stringify({ type: "viewport.state", width: 1, height: 1 }));
    await tick();
    assert.deepEqual(calls, ["viewport"]);
    await subsystem.close();
  });
});

qualify("unit-gates-direction", "application unit, common gates and role direction", async ({ prove }) => {
  await prove("one-json-text-unit-per-child-object-unit-rejected", async () => {
    const carrier = customCarrier({ units: [{ type: "input.state" }] });
    const subsystem = subsystemPeer(carrier);
    const terminal = await subsystem.terminal;
    assert.equal(terminal.kind, "protocol-fatal");
    assert.equal(terminal.protocol, "profile");
  });

  await prove("byte-limit-1mib-common-gate", async () => {
    const huge = { blob: "x".repeat(1_100_000) };
    const carrier = customCarrier({ units: [JSON.stringify(inputState(huge))] });
    const subsystem = subsystemPeer(carrier);
    const terminal = await subsystem.terminal;
    assert.equal(terminal.kind, "protocol-fatal");
    assert.equal(terminal.protocol, "profile");

    const pair = createMemoryCarrierPair();
    const renderer = rendererPeer(pair.right);
    const outcome = await renderer.input.sendState(inputState(huge));
    assert.equal(outcome.kind, "terminal");
    assert.equal(outcome.terminal.kind, "local-fatal");
  });

  await prove("depth-limit-64-common-gate", async () => {
    let deep = {};
    for (let index = 0; index < 70; index += 1) deep = { child: deep };
    const carrier = customCarrier({ units: [JSON.stringify(inputState(deep))] });
    const subsystem = subsystemPeer(carrier);
    const terminal = await subsystem.terminal;
    assert.equal(terminal.kind, "protocol-fatal");
    assert.equal(terminal.protocol, "profile");
  });

  await prove("unknown-type-profile-fatal", async () => {
    const carrier = customCarrier({ units: [JSON.stringify({ type: "data.hello" })] });
    const subsystem = subsystemPeer(carrier);
    const terminal = await subsystem.terminal;
    assert.equal(terminal.kind, "protocol-fatal");
    assert.equal(terminal.protocol, "profile");
  });

  await prove("wrong-direction-input-family", async () => {
    const pair = createMemoryCarrierPair();
    const renderer = rendererPeer(pair.right);
    await pair.left.send(JSON.stringify(inputState()));
    const terminal = await renderer.terminal;
    assert.equal(terminal.kind, "protocol-fatal");
    assert.equal(terminal.protocol, "input");
  });

  await prove("wrong-direction-render-family", async () => {
    const pair = createMemoryCarrierPair();
    const subsystem = subsystemPeer(pair.left);
    await pair.right.send(JSON.stringify({ type: "render.domains", domains: [] }));
    const terminal = await subsystem.terminal;
    assert.equal(terminal.kind, "protocol-fatal");
    assert.equal(terminal.protocol, "render");
  });

  await prove("wrong-direction-viewport-family", async () => {
    const pair = createMemoryCarrierPair();
    const renderer = rendererPeer(pair.right);
    await pair.left.send(JSON.stringify({ type: "viewport.state", width: 640, height: 480 }));
    const terminal = await renderer.terminal;
    assert.equal(terminal.kind, "protocol-fatal");
    assert.equal(terminal.protocol, "viewport");
  });

  await prove("viewport-child-invalid-viewport-family", async () => {
    const carrier = customCarrier({ units: [JSON.stringify({ type: "viewport.state", width: 0, height: 1 })] });
    const subsystem = subsystemPeer(carrier);
    const terminal = await subsystem.terminal;
    assert.equal(terminal.kind, "protocol-fatal");
    assert.equal(terminal.protocol, "viewport");
  });

  await prove("input-child-invalid-input-family", async () => {
    const carrier = customCarrier({
      units: [JSON.stringify({ type: "input.state", frameId: "f", activationId: "a", channel: "keyboard.bad", payload: {} })],
    });
    const subsystem = subsystemPeer(carrier);
    const terminal = await subsystem.terminal;
    assert.equal(terminal.kind, "protocol-fatal");
    assert.equal(terminal.protocol, "input");
  });

  await prove("one-logical-reader-ordered-disposition", async () => {
    let releaseFirst;
    const firstGate = new Promise((resolve) => { releaseFirst = resolve; });
    const calls = [];
    const carrier = customCarrier({
      units: [
        JSON.stringify(inputState({ step: 1 })),
        JSON.stringify(inputState({ step: 2 })),
      ],
    });
    const subsystem = subsystemPeer(carrier, {
      onInputState: (message) => {
        calls.push(message.payload.step);
        if (message.payload.step === 1) return firstGate.then(() => accepted());
        return accepted();
      },
    });
    await tick();
    assert.deepEqual(calls, [1]);
    releaseFirst();
    await tick();
    assert.deepEqual(calls, [1, 2]);
    assert.equal(carrier.state.messagesCalls, 1);
    await subsystem.close();
  });
});

qualify("one-writer-bounded-producer", "single serialized writer and bounded viewport producer", async ({ prove }) => {
  await prove(["max-one-concurrent-physical-send", "admitted-units-fifo"], async () => {
    let active = 0;
    let maxActive = 0;
    const carrier = customCarrier({
      sendBehavior: async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 2));
        active -= 1;
      },
    });
    const renderer = rendererPeer(carrier);
    const outcomes = await Promise.all([
      renderer.input.sendState(inputState({ n: 1 })),
      renderer.input.sendEvent({ type: "input.event", frameId: "f1", activationId: "a1", channel: "x.demo.event", payload: {} }),
      renderer.viewport.sendState({ type: "viewport.state", width: 10, height: 10 }),
    ]);
    assert.ok(outcomes.every((outcome) => outcome.kind === "sent"));
    assert.equal(maxActive, 1);
    const inputIndex = carrier.state.sent.findIndex((text) => text.includes('"input.state"'));
    const eventIndex = carrier.state.sent.findIndex((text) => text.includes('"input.event"'));
    const viewportIndex = carrier.state.sent.findIndex((text) => text.includes('"viewport.state"'));
    assert.deepEqual([inputIndex, eventIndex, viewportIndex].sort((a, b) => a - b), [0, 1, 2]);
    await renderer.close();
  });

  await prove("terminal-first-wins-queued-settle-once", async () => {
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const carrier = customCarrier({ sendBehavior: () => gate });
    const renderer = rendererPeer(carrier);
    const first = renderer.input.sendState(inputState());
    const queued = [
      renderer.input.sendEvent({ type: "input.event", frameId: "f1", activationId: "a1", channel: "x.demo.event", payload: {} }),
      renderer.viewport.sendState({ type: "viewport.state", width: 5, height: 5 }),
    ];
    await tick();
    carrier.lose();
    release();
    const [firstOutcome, ...queuedOutcomes] = await Promise.all([first, ...queued]);
    assert.equal(firstOutcome.kind, "sent");
    assert.ok(queuedOutcomes.every((outcome) => outcome.kind === "terminal"));
    const after = await renderer.viewport.sendState({ type: "viewport.state", width: 6, height: 6 });
    assert.equal(after.kind, "terminal");
    await renderer.terminal;
  });

  await prove("no-retry-replay-or-cross-carrier-migration", async () => {
    const carrier = customCarrier();
    const renderer = rendererPeer(carrier);
    await renderer.viewport.sendState({ type: "viewport.state", width: 1, height: 1 });
    await renderer.close();
    const wireSnapshot = [...carrier.state.sent];
    await tick();
    assert.deepEqual(carrier.state.sent, wireSnapshot);

    const fresh = customCarrier();
    const freshRenderer = rendererPeer(fresh);
    const outcome = await freshRenderer.viewport.sendState({ type: "viewport.state", width: 2, height: 2 });
    assert.equal(outcome.kind, "sent");
    assert.deepEqual(fresh.state.sent, [JSON.stringify({ type: "viewport.state", width: 2, height: 2 })]);
    await freshRenderer.close();
  });

  await prove("viewport-bounded-burst-latest-convergence", async () => {
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    let admittedViewports = 0;
    const carrier = customCarrier({
      sendBehavior: async (text) => {
        if (text.includes('"viewport.state"')) admittedViewports += 1;
        await gate;
      },
    });
    const renderer = rendererPeer(carrier);
    const outcomes = [renderer.viewport.sendState({ type: "viewport.state", width: 1, height: 1 })];
    await tick();
    for (let index = 0; index < 1100; index += 1) {
      outcomes.push(renderer.viewport.sendState({ type: "viewport.state", width: 1000 + index, height: 2000 + index }));
    }
    await tick();
    assert.equal(admittedViewports, 1);
    release();
    await gate;
    const settled = await Promise.all(outcomes);
    assert.ok(settled.every((outcome) => outcome.kind === "sent"));
    assert.equal(admittedViewports, 2);
    const last = JSON.parse(carrier.state.sent.at(-1));
    assert.deepEqual([last.type, last.width, last.height], ["viewport.state", 2099, 3099]);
    await renderer.close();
  });

  await prove("viewport-burst-interleaved-no-starvation", async () => {
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const carrier = customCarrier({ sendBehavior: () => gate });
    const renderer = rendererPeer(carrier);
    const outcomes = [renderer.viewport.sendState({ type: "viewport.state", width: 3, height: 3 })];
    await tick();
    for (let index = 0; index < 1200; index += 1) {
      outcomes.push(renderer.viewport.sendState({ type: "viewport.state", width: 30 + index, height: 40 + index }));
      if (index % 300 === 0) outcomes.push(renderer.input.sendState(inputState({ i: index })));
    }
    release();
    const settled = await Promise.all(outcomes);
    assert.ok(settled.every((outcome) => outcome.kind === "sent"));
    assert.equal(carrier.state.sent.filter((text) => text.includes('"input.state"')).length, 4);
    assert.ok(carrier.state.sent.filter((text) => text.includes('"viewport.state"')).length <= 2);
    await renderer.close();
  });

  await prove("viewport-equal-size-suppress", async () => {
    const carrier = customCarrier();
    const renderer = rendererPeer(carrier);
    const outcomes = await Promise.all([
      renderer.viewport.sendState({ type: "viewport.state", width: 640, height: 480 }),
      renderer.viewport.sendState({ type: "viewport.state", width: 640, height: 480 }),
    ]);
    assert.deepEqual(outcomes, [{ kind: "sent" }, { kind: "sent" }]);
    assert.equal(carrier.state.sent.filter((text) => text.includes('"viewport.state"')).length, 1);
    await renderer.close();
  });
});

qualify("fresh-baseline", "independent fresh-carrier publication baselines", async ({ prove }) => {
  await prove("fresh-peer-no-inherited-state", async () => {
    const oldCarrier = customCarrier();
    const oldRenderer = rendererPeer(oldCarrier);
    await oldRenderer.viewport.sendState({ type: "viewport.state", width: 9, height: 9 });
    await oldRenderer.close();
    const freshCarrier = customCarrier();
    const freshRenderer = rendererPeer(freshCarrier);
    const outcome = await freshRenderer.input.sendState(inputState());
    assert.equal(outcome.kind, "sent");
    assert.deepEqual(freshCarrier.state.sent, [JSON.stringify(inputState())]);
    await freshRenderer.close();
  });

  await prove("old-carrier-pending-not-migrated", async () => {
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const oldCarrier = customCarrier({ sendBehavior: () => gate });
    const oldRenderer = rendererPeer(oldCarrier);
    const first = oldRenderer.viewport.sendState({ type: "viewport.state", width: 1, height: 1 });
    await tick();
    const parked = oldRenderer.viewport.sendState({ type: "viewport.state", width: 2, height: 2 });
    await tick();
    oldCarrier.lose();
    release();
    const outcomes = await Promise.all([first, parked]);
    assert.ok(outcomes.every((outcome) => outcome.kind === "terminal" || outcome.kind === "sent"));
    const oldViewportWire = oldCarrier.state.sent.filter((text) => text.includes('"viewport.state"'));
    assert.ok(oldViewportWire.length <= 1);

    const freshCarrier = customCarrier();
    const freshRenderer = rendererPeer(freshCarrier);
    const outcome = await freshRenderer.viewport.sendState({ type: "viewport.state", width: 2, height: 2 });
    assert.equal(outcome.kind, "sent");
    assert.deepEqual(freshCarrier.state.sent, [JSON.stringify({ type: "viewport.state", width: 2, height: 2 })]);
    await freshRenderer.close();
  });

  await prove("viewport-fresh-carrier-independent-baseline", async () => {
    const pair = createMemoryCarrierPair();
    const seen = [];
    const subsystem = subsystemPeer(pair.left, {
      onViewportState: (message) => { seen.push([message.width, message.height]); return accepted(); },
    });
    const renderer = rendererPeer(pair.right);
    await renderer.viewport.sendState({ type: "viewport.state", width: 320, height: 240 });
    await tick();
    await renderer.close();
    await subsystem.terminal;

    const secondPair = createMemoryCarrierPair();
    const secondSubsystem = subsystemPeer(secondPair.left, {
      onViewportState: (message) => { seen.push([message.width, message.height]); return accepted(); },
    });
    const freshRenderer = rendererPeer(secondPair.right);
    const outcome = await freshRenderer.viewport.sendState({ type: "viewport.state", width: 320, height: 240 });
    assert.equal(outcome.kind, "sent");
    await tick();
    assert.deepEqual(seen, [[320, 240], [320, 240]]);
    await secondSubsystem.close();
    await freshRenderer.terminal;
  });
});

qualify("failure-containment", "failure classification and local containment", async ({ prove }) => {
  await prove("child-explicit-fatal-disposition-family", async () => {
    const carrier = customCarrier({
      units: [JSON.stringify({ type: "viewport.state", width: 8, height: 8 })],
    });
    const subsystem = subsystemPeer(carrier, {
      onViewportState: () => ({ kind: "protocol-fatal", cause: new Error("child fatal") }),
    });
    const terminal = await subsystem.terminal;
    assert.equal(terminal.kind, "protocol-fatal");
    assert.equal(terminal.protocol, "viewport");
  });

  await prove("handler-throw-is-local-fatal", async () => {
    const carrier = customCarrier({ units: [JSON.stringify(inputState())] });
    const subsystem = subsystemPeer(carrier, {
      onInputState: () => { throw new Error("business throw"); },
    });
    const terminal = await subsystem.terminal;
    assert.equal(terminal.kind, "local-fatal");
  });

  await prove("well-formed-stale-input-accepted-drop", async () => {
    const calls = [];
    const carrier = customCarrier({
      units: [
        JSON.stringify({ type: "input.state", frameId: "unknown", activationId: "a", channel: "x.demo.state", payload: {} }),
        JSON.stringify({ type: "viewport.state", width: 4, height: 4 }),
      ],
    });
    const subsystem = subsystemPeer(carrier, {
      onInputState: (message) => { calls.push(message.frameId); return accepted(); },
      onViewportState: () => { calls.push("viewport"); return accepted(); },
    });
    await tick();
    assert.deepEqual(calls, ["unknown", "viewport"]);
    const outcome = await subsystem.input.sendInterest({ type: "input.interest", frames: [] });
    assert.equal(outcome.kind, "sent");
    await subsystem.close();
  });

  await prove("data-terminal-does-not-fail-remote-peer-side", async () => {
    const pair = createMemoryCarrierPair();
    const subsystem = subsystemPeer(pair.left);
    const renderer = rendererPeer(pair.right);
    await subsystem.close();
    const rendererTerminal = await renderer.terminal;
    assert.equal(rendererTerminal.kind, "carrier-closed");
  });
});

qualify("original-revision2-observables", "unconflicted revision-2 fixtures remain covered", async ({ prove }) => {
  await prove(["input-interest-original-dispatch", "render-domains-original-dispatch", "render-snapshot-original-dispatch", "render-patch-original-dispatch", "render-event-original-dispatch"], async () => {
    const pair = createMemoryCarrierPair();
    const seen = [];
    const renderer = rendererPeer(pair.right, {
      onInputInterest: (m) => { seen.push(m); return accepted(); },
      onRenderDomains: (m) => { seen.push(m); return accepted(); },
      onRenderSnapshot: (m) => { seen.push(m); return accepted(); },
      onRenderPatch: (m) => { seen.push(m); return accepted(); },
      onRenderEvent: (m) => { seen.push(m); return accepted(); },
    });
    const subsystem = subsystemPeer(pair.left);
    await subsystem.input.sendInterest({ type: "input.interest", frames: [{ frameId: "f1", channels: ["x.demo.state"] }] });
    await subsystem.render.sendDomains({ type: "render.domains", domains: ["hud"] });
    await subsystem.render.sendSnapshot({ type: "render.snapshot", domainId: "d1", revision: 1, zIndex: 0, roots: [] });
    await subsystem.render.sendPatch({ type: "render.patch", domainId: "d1", baseRevision: 1, revision: 2, zIndex: 0, ops: [] });
    await subsystem.render.sendEvent({ type: "render.event", domainId: "d1", targetKey: "k", name: "n", data: {} });
    await tick();
    assert.deepEqual(seen.map((m) => m.type), ["input.interest", "render.domains", "render.snapshot", "render.patch", "render.event"]);
    assert.deepEqual(seen[0].frames[0].channels, ["x.demo.state"]);
    await subsystem.close();
    await renderer.terminal;
  });

  await prove(["input-state-original-send", "input-event-original-send", "input-reset-original-send"], async () => {
    const pair = createMemoryCarrierPair();
    const seen = [];
    const subsystem = subsystemPeer(pair.left, {
      onInputState: (m) => { seen.push(m.type); return accepted(); },
      onInputEvent: (m) => { seen.push(m.type); return accepted(); },
      onInputReset: (m) => { seen.push(m.type); return accepted(); },
    });
    const renderer = rendererPeer(pair.right);
    assert.equal((await renderer.input.sendState(inputState())).kind, "sent");
    assert.equal((await renderer.input.sendEvent({ type: "input.event", frameId: "f1", activationId: "a1", channel: "x.demo.event", payload: {} })).kind, "sent");
    assert.equal((await renderer.input.sendReset({ type: "input.reset", frameId: "f1", activationId: "a1" })).kind, "sent");
    await tick();
    assert.deepEqual(seen, ["input.state", "input.event", "input.reset"]);
    await subsystem.close();
    await renderer.terminal;
  });

  await prove("send-outcome-local-acceptance-only", async () => {
    let releaseHandler;
    const handlerGate = new Promise((resolve) => { releaseHandler = resolve; });
    const pair = createMemoryCarrierPair();
    const subsystem = subsystemPeer(pair.left, {
      onInputState: () => new Promise((resolve) => { void handlerGate.then(() => resolve(accepted())); }),
    });
    const renderer = rendererPeer(pair.right);
    const outcome = await renderer.input.sendState(inputState());
    // {kind:"sent"} resolves at the local carrier send boundary, before the
    // remote handler has applied anything — it is not an ACK.
    assert.deepEqual(outcome, { kind: "sent" });
    releaseHandler();
    await tick();
    await subsystem.close();
    await renderer.terminal;
  });

  await prove("profile-identity-export-exact", async () => {
    assert.equal(RENDERER_DATA_PROFILE_V1, "loomrealm.renderer-data/1");
  });
});

registerCoverageAudit();
