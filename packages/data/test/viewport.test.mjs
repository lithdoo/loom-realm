import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryCarrierPair } from "@loomrealm/foundation/testing";
import {
  createRendererDataPeer,
  createSubsystemDataPeer,
  RENDERER_DATA_PROFILE_V1,
} from "../dist/index.js";
import { validateViewportState } from "../dist/viewport-codec.js";

const accepted = () => ({ kind: "accepted" });
const binding = (carrier) => ({
  carrier,
  subsystemKey: "map",
  generation: 1,
  dataProfile: RENDERER_DATA_PROFILE_V1,
});
const tick = () => new Promise((resolve) => setImmediate(resolve));
const size = (width, height) => ({ type: "viewport.state", width, height });

function subsystemPeer(carrier, onViewportState = accepted) {
  return createSubsystemDataPeer({
    binding: binding(carrier),
    handlers: {
      onInputState: accepted,
      onInputEvent: accepted,
      onInputReset: accepted,
      onViewportState,
    },
  });
}

function rendererPeer(carrier) {
  return createRendererDataPeer({
    binding: binding(carrier),
    handlers: {
      onInputInterest: accepted,
      onRenderDomains: accepted,
      onRenderSnapshot: accepted,
      onRenderPatch: accepted,
      onRenderEvent: accepted,
    },
  });
}

test("viewport codec accepts exact positive safe integers only", () => {
  assert.deepEqual(validateViewportState({ type: "viewport.state", width: 640, height: 480 }), {
    type: "viewport.state",
    width: 640,
    height: 480,
  });
  assert.equal(validateViewportState(size(Number.MAX_SAFE_INTEGER, 1)).width, Number.MAX_SAFE_INTEGER);
  for (const bad of [
    { type: "viewport.state", width: 0, height: 480 },
    { type: "viewport.state", width: -1, height: 480 },
    { type: "viewport.state", width: 640.5, height: 480 },
    { type: "viewport.state", width: "640", height: 480 },
    { type: "viewport.state", width: Number.MAX_SAFE_INTEGER + 1, height: 480 },
    { type: "viewport.state", width: 640 },
    { type: "viewport.state", width: 640, height: 480, extra: true },
    { type: "viewport.size", width: 640, height: 480 },
  ]) {
    assert.throws(
      () => validateViewportState(bad),
      (error) => error instanceof Error && error.protocol === "viewport",
      `expected viewport family failure for ${JSON.stringify(bad)}`,
    );
  }
});

test("viewport.state travels renderer to subsystem through shared profile connection", async () => {
  const pair = createMemoryCarrierPair();
  const seen = [];
  const subsystem = subsystemPeer(pair.left, (message) => {
    seen.push([message.width, message.height]);
    return accepted();
  });
  const renderer = rendererPeer(pair.right);
  assert.deepEqual(await renderer.viewport.sendState(size(640, 480)), { kind: "sent" });
  await tick();
  assert.deepEqual(seen, [[640, 480]]);
  await subsystem.close();
  await renderer.terminal;
});

test("recognized viewport child-invalid inbound is protocol-fatal viewport family", async () => {
  const pair = createMemoryCarrierPair();
  const subsystem = subsystemPeer(pair.left);
  await pair.right.send(JSON.stringify({ type: "viewport.state", width: 0, height: 100 }));
  const terminal = await subsystem.terminal;
  assert.equal(terminal.kind, "protocol-fatal");
  assert.equal(terminal.protocol, "viewport");
});

test("unknown viewport-ish type stays a common profile failure", async () => {
  const pair = createMemoryCarrierPair();
  const subsystem = subsystemPeer(pair.left);
  await pair.right.send(JSON.stringify({ type: "viewport.ready", width: 640, height: 480 }));
  const terminal = await subsystem.terminal;
  assert.equal(terminal.kind, "protocol-fatal");
  assert.equal(terminal.protocol, "profile");
});

test("viewport.state toward renderer role is a direction failure in viewport family", async () => {
  const pair = createMemoryCarrierPair();
  const renderer = rendererPeer(pair.right);
  await pair.left.send(JSON.stringify({ type: "viewport.state", width: 640, height: 480 }));
  const terminal = await renderer.terminal;
  assert.equal(terminal.kind, "protocol-fatal");
  assert.equal(terminal.protocol, "viewport");
});

test("invalid local viewport send is local-fatal without wire emission", async () => {
  const pair = createMemoryCarrierPair();
  const subsystem = subsystemPeer(pair.left);
  const renderer = rendererPeer(pair.right);
  const result = await renderer.viewport.sendState({ type: "viewport.state", width: 0, height: 480 });
  assert.equal(result.kind, "terminal");
  assert.equal(result.terminal.kind, "local-fatal");
  await subsystem.terminal;
});

test("bounded latest-wins sender: burst far beyond writer capacity converges without overflow", async () => {
  const sent = [];
  let maxConcurrent = 0;
  let active = 0;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let resolveClosed;
  const closed = new Promise((resolve) => { resolveClosed = resolve; });
  const carrier = {
    closed,
    async send(text) {
      active += 1;
      maxConcurrent = Math.max(maxConcurrent, active);
      sent.push(text);
      await gate;
      active -= 1;
    },
    async *messages() { await closed; },
    async close() { resolveClosed({ kind: "closed" }); },
  };
  const renderer = rendererPeer(carrier);

  const outcomes = [];
  outcomes.push(renderer.viewport.sendState(size(10, 10)));
  await tick();
  // First unit is admitted and blocked inside carrier.send.
  assert.equal(sent.length, 1);
  // Far more resizes than the shared writer capacity (MAX_PENDING_SENDS = 1024),
  // interleaved with ordinary Input traffic on the same shared writer.
  for (let index = 0; index < 1500; index += 1) {
    outcomes.push(renderer.viewport.sendState(size(100 + index, 200 + index)));
    if (index % 250 === 0) {
      outcomes.push(renderer.input.sendState({
        type: "input.state",
        frameId: "f1",
        activationId: "a1",
        channel: "x.demo.state",
        payload: { i: index },
      }));
    }
  }
  await tick();
  // While blocked: exactly one viewport unit in flight; every later call parked
  // in the single pending latest slot — nothing reached the shared writer queue.
  assert.equal(sent.length, 1);
  release();
  const settled = await Promise.all(outcomes);
  assert.ok(settled.every((outcome) => outcome.kind === "sent"));
  // Interleaved Input units are never starved or dropped.
  const inputUnits = sent.filter((text) => text.includes("input.state"));
  assert.equal(inputUnits.length, 6);
  // Viewport wire units stay bounded (first admitted + converging latest), never 1500.
  const viewportUnits = sent.filter((text) => text.includes("viewport.state"));
  assert.equal(viewportUnits.length, 2);
  const last = JSON.parse(viewportUnits[viewportUnits.length - 1]);
  assert.equal(last.width, 1599);
  assert.equal(last.height, 1699);
  assert.equal(maxConcurrent, 1);
  await renderer.close();
});

test("equal pending size is suppressed and callers still settle sent", async () => {
  const sent = [];
  let resolveClosed;
  const closed = new Promise((resolve) => { resolveClosed = resolve; });
  const carrier = {
    closed,
    async send(text) { sent.push(text); },
    async *messages() { await closed; },
    async close() { resolveClosed({ kind: "closed" }); },
  };
  const renderer = rendererPeer(carrier);
  const [first, second, third] = await Promise.all([
    renderer.viewport.sendState(size(640, 480)),
    renderer.viewport.sendState(size(640, 480)),
    renderer.viewport.sendState(size(640, 480)),
  ]);
  assert.deepEqual([first, second, third], [{ kind: "sent" }, { kind: "sent" }, { kind: "sent" }]);
  const viewportUnits = sent.filter((text) => text.includes("viewport.state"));
  assert.equal(viewportUnits.length, 1);
  await renderer.close();
});

test("terminal settles parked viewport callers exactly once", async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let resolveClosed;
  const closed = new Promise((resolve) => { resolveClosed = resolve; });
  const carrier = {
    closed,
    async send() { await gate; },
    async *messages() { await closed; },
    async close() { resolveClosed({ kind: "closed" }); },
  };
  const renderer = rendererPeer(carrier);
  const first = renderer.viewport.sendState(size(10, 10));
  await tick();
  const parked = renderer.viewport.sendState(size(20, 20));
  await tick();
  resolveClosed({ kind: "lost" });
  release();
  const [firstOutcome, parkedOutcome, lateOutcome] = await Promise.all([
    first,
    parked,
    renderer.viewport.sendState(size(30, 30)),
  ]);
  assert.equal(firstOutcome.kind, "sent");
  assert.equal(parkedOutcome.kind, "terminal");
  assert.equal(parkedOutcome.terminal.kind, "carrier-lost");
  assert.equal(lateOutcome.kind, "terminal");
  await renderer.terminal;
});

test("fresh carrier republishes viewport baseline independently of old pending", async () => {
  const seen = [];
  const firstPair = createMemoryCarrierPair();
  const firstSubsystem = subsystemPeer(firstPair.left, (message) => {
    seen.push([message.width, message.height]);
    return accepted();
  });
  const oldRenderer = rendererPeer(firstPair.right);
  await oldRenderer.viewport.sendState(size(320, 240));
  await tick();
  await oldRenderer.close();
  await firstSubsystem.terminal;

  const secondPair = createMemoryCarrierPair();
  const secondSubsystem = subsystemPeer(secondPair.left, (message) => {
    seen.push([message.width, message.height]);
    return accepted();
  });
  const freshRenderer = rendererPeer(secondPair.right);
  await freshRenderer.viewport.sendState(size(800, 600));
  await tick();
  assert.deepEqual(seen, [[320, 240], [800, 600]]);
  await secondSubsystem.close();
  await freshRenderer.terminal;
});
