import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryCarrierPair } from "@loomrealm/foundation/testing";
import {
  createRendererDataPeer,
  createSubsystemDataPeer,
  RENDERER_DATA_PROFILE_V1,
} from "../dist/index.js";
import { decodeForRole, encodeForRole } from "../dist/profile-codec.js";

const accepted = () => ({ kind: "accepted" });
const binding = (carrier) => ({
  carrier,
  subsystemKey: "map",
  generation: 1,
  dataProfile: RENDERER_DATA_PROFILE_V1,
});
const subsystemHandlers = { onInputState: accepted, onInputEvent: accepted, onInputReset: accepted, onViewportState: accepted };
const rendererHandlers = {
  onInputInterest: accepted,
  onRenderDomains: accepted,
  onRenderSnapshot: accepted,
  onRenderPatch: accepted,
  onRenderEvent: accepted,
};

const tick = () => new Promise((resolve) => setImmediate(resolve));

async function waitFor(predicate, message = "condition") {
  for (let i = 0; i < 200; i += 1) {
    if (predicate()) return;
    await tick();
  }
  assert.fail(`Timed out waiting for ${message}`);
}

/** Carrier with observable serialized sends, hold/release gate and injectable inbound units. */
function createViewportCarrier() {
  let resolveClosed;
  const closed = new Promise((resolve) => { resolveClosed = resolve; });
  const sent = [];
  const inbound = [];
  const pushWaiters = [];
  let closedSettled = false;
  let active = 0;
  let maxActive = 0;
  let sendGate = Promise.resolve();
  let releaseGate = () => {};
  const flush = () => { for (const waiter of pushWaiters.splice(0)) waiter(); };
  const carrier = {
    closed,
    sent,
    get maxActive() { return maxActive; },
    holdSend() {
      sendGate = new Promise((resolve) => { releaseGate = resolve; });
    },
    releaseSend() {
      releaseGate();
      sendGate = Promise.resolve();
    },
    deliver(text) {
      inbound.push(text);
      flush();
    },
    async send(text) {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await sendGate;
      sent.push(text);
      active -= 1;
    },
    async *messages() {
      for (;;) {
        const next = inbound.shift();
        if (next !== undefined) {
          yield next;
          continue;
        }
        if (closedSettled) return;
        await new Promise((resolve) => { pushWaiters.push(resolve); });
      }
    },
    async close() {
      closedSettled = true;
      resolveClosed({ kind: "closed" });
      flush();
    },
    closeNow() {
      closedSettled = true;
      resolveClosed({ kind: "closed" });
      flush();
    },
  };
  return carrier;
}

const viewportMessage = (width, height) => ({ type: "viewport.state", width, height });
const wireText = (width, height) => JSON.stringify({ type: "viewport.state", width, height });
const viewportUnits = (carrier) => carrier.sent.filter((text) => text.includes("viewport.state"));

test("P3-02/V-04 codec classifies viewport wire violations into the viewport family and profile-level invalids into profile", () => {
  // Recognized, valid-JSON viewport.state with child schema violations → `viewport`.
  for (const raw of [
    '{"type":"viewport.state","width":640}',
    '{"type":"viewport.state","width":640,"height":480,"extra":1}',
    '{"type":"viewport.state","width":640.5,"height":480}',
    '{"type":"viewport.state","width":0,"height":480}',
    '{"type":"viewport.state","width":-640,"height":480}',
    '{"type":"viewport.state","width":9007199254740992,"height":480}',
    '{"type":"viewport.state","width":"640","height":480}',
  ]) {
    assert.throws(
      () => decodeForRole(raw, "subsystem"),
      (error) => error.protocol === "viewport",
      raw,
    );
  }
  // Invalid raw JSON (NaN/Infinity literals are not JSON) and unknown viewport kinds → `profile`.
  for (const raw of [
    '{"type":"viewport.state","width":NaN,"height":480}',
    '{"type":"viewport.state","width":Infinity,"height":480}',
    '{"type":"viewport.state","width":640,height:480}',
    '{"type":"viewport.foo","width":640,"height":480}',
    '{"type":"viewport"}',
  ]) {
    assert.throws(
      () => decodeForRole(raw, "subsystem"),
      (error) => error.protocol === "profile",
      raw,
    );
  }
  // Valid exact message decodes for the Subsystem reader.
  assert.deepEqual(
    decodeForRole(wireText(640, 480), "subsystem"),
    { type: "viewport.state", width: 640, height: 480 },
  );
  // Wrong direction for the role → exact child family `viewport`.
  assert.throws(
    () => decodeForRole(wireText(640, 480), "renderer"),
    (error) => error.protocol === "viewport",
  );
  // Renderer outbound encode of a valid viewport state is the exact wire text.
  assert.equal(encodeForRole(viewportMessage(640, 480), "renderer"), wireText(640, 480));
  // Subsystem outbound viewport.state is a direction violation.
  assert.throws(
    () => encodeForRole(viewportMessage(640, 480), "subsystem"),
    (error) => error.protocol === "viewport",
  );
});

test("P3-02/V-04 trusted local invalid outbound publish is local-fatal, never a remote viewport violation", async () => {
  const carrier = createViewportCarrier();
  const renderer = createRendererDataPeer({ binding: binding(carrier), handlers: rendererHandlers });
  renderer.viewport.publishState(viewportMessage(Number.NaN, 480));
  const terminal = await renderer.terminal;
  assert.equal(terminal.kind, "local-fatal");
  assert.deepEqual(carrier.sent, []);
  await renderer.close();
});

test("P3-01 renderer publishes exact viewport.state wire, Subsystem dispatches it once; Subsystem peers expose no viewport publisher", async () => {
  const pair = createMemoryCarrierPair();
  const sentTexts = [];
  const rendererCarrier = pair.right;
  const originalSend = rendererCarrier.send.bind(rendererCarrier);
  rendererCarrier.send = async (text) => {
    sentTexts.push(text);
    return originalSend(text);
  };
  const seen = [];
  const subsystem = createSubsystemDataPeer({
    binding: binding(pair.left),
    handlers: {
      ...subsystemHandlers,
      onViewportState(message) { seen.push({ ...message }); return accepted(); },
    },
  });
  assert.equal(subsystem.viewport, undefined);

  const renderer = createRendererDataPeer({ binding: binding(rendererCarrier), handlers: rendererHandlers });
  renderer.viewport.publishState(viewportMessage(640, 480));
  await waitFor(() => seen.length === 1);
  assert.deepEqual(sentTexts, [wireText(640, 480)]);
  assert.deepEqual(seen, [{ type: "viewport.state", width: 640, height: 480 }]);

  await renderer.close();
  await subsystem.close();
});

test("P3-03 invalid inbound unit dispatches zero times and only retires Data", async () => {
  const carrier = createViewportCarrier();
  let calls = 0;
  const subsystem = createSubsystemDataPeer({
    binding: binding(carrier),
    handlers: {
      ...subsystemHandlers,
      onViewportState() { calls += 1; return accepted(); },
    },
  });
  carrier.deliver('{"type":"viewport.state","width":0,"height":480}');
  const terminal = await subsystem.terminal;
  assert.equal(terminal.kind, "protocol-fatal");
  assert.equal(terminal.protocol, "viewport");
  assert.equal(calls, 0);
  await subsystem.close();
});

test("P3-04 viewport shares the single serialized writer without starving Input", async () => {
  const carrier = createViewportCarrier();
  const renderer = createRendererDataPeer({ binding: binding(carrier), handlers: rendererHandlers });
  carrier.holdSend();
  const inputSends = [];
  for (let i = 0; i < 32; i += 1) {
    inputSends.push(renderer.input.sendEvent({
      type: "input.event",
      frameId: "root",
      activationId: "a1",
      channel: "keyboard.event",
      payload: { action: "down", code: "KeyA", repeat: false },
    }));
  }
  renderer.viewport.publishState(viewportMessage(100, 100));
  renderer.viewport.publishState(viewportMessage(200, 200));
  renderer.viewport.publishState(viewportMessage(300, 300));
  assert.deepEqual(carrier.sent, []);
  carrier.releaseSend();
  await Promise.all(inputSends);
  await waitFor(() => carrier.sent.includes(wireText(300, 300)));
  assert.equal(carrier.maxActive, 1);
  const types = carrier.sent.map((text) => JSON.parse(text).type);
  assert.equal(types.filter((type) => type === "input.event").length, 32);
  assert.equal(types[0], "input.event");
  assert.deepEqual(viewportUnits(carrier), [wireText(100, 100), wireText(300, 300)]);
  await renderer.close();
});

test("V-05 A→B→A while in flight cancels B and equal resends are suppressed", async () => {
  const carrier = createViewportCarrier();
  const renderer = createRendererDataPeer({ binding: binding(carrier), handlers: rendererHandlers });
  carrier.holdSend();
  renderer.viewport.publishState(viewportMessage(640, 480));
  renderer.viewport.publishState(viewportMessage(800, 600));
  renderer.viewport.publishState(viewportMessage(640, 480));
  assert.deepEqual(carrier.sent, []);
  carrier.releaseSend();
  await waitFor(() => carrier.sent.length === 1);
  await tick();
  assert.deepEqual(carrier.sent, [wireText(640, 480)]);
  renderer.viewport.publishState(viewportMessage(640, 480));
  await tick();
  assert.deepEqual(carrier.sent, [wireText(640, 480)]);
  await renderer.close();
});

test("V-06/P3-05 10000-sample burst stays bounded and converges to the latest size", async () => {
  const carrier = createViewportCarrier();
  const renderer = createRendererDataPeer({ binding: binding(carrier), handlers: rendererHandlers });
  carrier.holdSend();
  const concurrent = [];
  for (let i = 0; i < 64; i += 1) {
    concurrent.push(renderer.input.sendState({
      type: "input.state",
      frameId: "root",
      activationId: "a1",
      channel: "keyboard.state",
      payload: { down: [] },
    }));
  }
  renderer.viewport.publishState(viewportMessage(10, 10));
  for (let i = 0; i < 10000; i += 1) {
    renderer.viewport.publishState(viewportMessage(1000 + (i % 500), 2000 + (i % 500)));
  }
  assert.deepEqual(carrier.sent, []);
  carrier.releaseSend();
  await Promise.all(concurrent);
  await waitFor(() => carrier.sent.includes(wireText(1499, 2499)));
  await tick();
  const units = viewportUnits(carrier);
  assert.ok(units.length <= 2, `viewport units must stay bounded, saw ${units.length}`);
  assert.deepEqual(units, [wireText(10, 10), wireText(1499, 2499)]);
  assert.equal(carrier.maxActive, 1);
  assert.equal(carrier.sent.filter((text) => text.includes("input.state")).length, 64);
  await renderer.close();
});

test("V-07/P3-07 send terminal retires the cursor; late settlement and later offers stay inert without unhandled rejections", async () => {
  const carrier = createViewportCarrier();
  const renderer = createRendererDataPeer({ binding: binding(carrier), handlers: rendererHandlers });
  carrier.holdSend();
  renderer.viewport.publishState(viewportMessage(640, 480));
  await renderer.close();
  carrier.releaseSend();
  await tick();
  const terminal = await renderer.terminal;
  assert.equal(terminal.kind, "carrier-closed");
  // The already-admitted 640x480 unit belongs to carrier history and may still land;
  // the retired cursor must not accept anything new.
  renderer.viewport.publishState(viewportMessage(800, 600));
  await tick();
  assert.ok(!viewportUnits(carrier).includes(wireText(800, 600)));
  assert.ok(viewportUnits(carrier).length <= 1);

  const freshCarrier = createViewportCarrier();
  const freshRenderer = createRendererDataPeer({ binding: binding(freshCarrier), handlers: rendererHandlers });
  freshRenderer.viewport.publishState(viewportMessage(800, 600));
  await waitFor(() => freshCarrier.sent.length === 1);
  assert.deepEqual(freshCarrier.sent, [wireText(800, 600)]);
  await freshRenderer.close();
});

test("P3-06 fresh peer cursor is independent and republishes even an equal value", async () => {
  const carrier = createViewportCarrier();
  const renderer = createRendererDataPeer({ binding: binding(carrier), handlers: rendererHandlers });
  renderer.viewport.publishState(viewportMessage(640, 480));
  await waitFor(() => carrier.sent.length === 1);
  await renderer.close();

  const freshCarrier = createViewportCarrier();
  const freshRenderer = createRendererDataPeer({ binding: binding(freshCarrier), handlers: rendererHandlers });
  freshRenderer.viewport.publishState(viewportMessage(640, 480));
  await waitFor(() => freshCarrier.sent.length === 1);
  assert.deepEqual(freshCarrier.sent, [wireText(640, 480)]);
  await freshRenderer.close();
});

test("P3-07 recognized viewport violation from the remote retires only Data with family viewport", async () => {
  const carrier = createViewportCarrier();
  const subsystem = createSubsystemDataPeer({ binding: binding(carrier), handlers: subsystemHandlers });
  carrier.deliver('{"type":"viewport.state","width":640,"height":-1}');
  const terminal = await subsystem.terminal;
  assert.equal(terminal.kind, "protocol-fatal");
  assert.equal(terminal.protocol, "viewport");
  await subsystem.close();
});
