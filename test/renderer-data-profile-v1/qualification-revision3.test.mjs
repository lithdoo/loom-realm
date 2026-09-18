// Renderer Data Application Profile v1 Conformance — revision 3 (P3-01..P3-09).
//
// This runner exercises the revised four-child Profile composition with REAL
// Data peers over REAL memory carriers. Raw wire injection uses the same
// inbound-carrier fixture pattern as the existing qualification suites
// (test/render-update-v1, test/user-input-v1); every message still passes the
// real codec, dispatcher, writer and terminal mechanics.
//
// P3-08 (existing revision2 obligations + Connection/Input/Render child
// conformance) is discharged by executing, on the SAME final executable SHA:
//   npm run test:data
//   npm run test:m10:qualification
//   npm run test:m11:qualification
//   npm run test:regression
// Those suites are unchanged by this revision and their PASS is recorded in
// the freeze evidence; it is not re-implemented (nor weakened) here.
//
// P3-09's full real-host vertical (fake source → real holder → real Data
// peers → real carrier → real runSubsystem host → scope.viewport) lives in
// test/viewport-state-v1/qualification.test.mjs (V-14) and runs from the same
// `npm run test:viewport` entry; the compact cross-check below re-verifies the
// holder→peers→handler segment of that chain inside this runner.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createMemoryCarrierPair } from "@loomrealm/foundation/testing";
import {
  createRendererDataPeer,
  createSubsystemDataPeer,
  RENDERER_DATA_PROFILE_V1,
} from "@loomrealm/data";
import {
  createRendererControlHolder,
} from "@loomrealm/renderer";
import {
  createMainRendererControlPeer,
  prepareRendererHelloResultV1,
} from "@loomrealm/renderer-control";

const accepted = () => ({ kind: "accepted" });
const subsystemHandlers = (extra = {}) => ({
  onInputState: accepted,
  onInputEvent: accepted,
  onInputReset: accepted,
  onViewportState: extra.onViewportState ?? accepted,
});
const rendererHandlers = () => ({
  onInputInterest: accepted,
  onRenderDomains: accepted,
  onRenderSnapshot: accepted,
  onRenderPatch: accepted,
  onRenderEvent: accepted,
});

const tick = () => new Promise((resolve) => setImmediate(resolve));

async function waitFor(predicate, message = "condition") {
  for (let i = 0; i < 200; i += 1) {
    if (predicate()) return;
    await tick();
  }
  assert.fail(`Timed out waiting for ${message}`);
}

/** Inbound-injectable carrier with an observable, gateable outbound send. */
function createProfileCarrier() {
  let resolveClosed;
  const closed = new Promise((resolve) => { resolveClosed = resolve; });
  const sent = [];
  const inbound = [];
  const waiters = [];
  let closedSettled = false;
  let active = 0;
  let maxActive = 0;
  let gate = Promise.resolve();
  let releaseGate = () => {};
  const flush = () => { for (const waiter of waiters.splice(0)) waiter(); };
  return {
    closed,
    sent,
    get maxActive() { return maxActive; },
    hold() { gate = new Promise((resolve) => { releaseGate = resolve; }); },
    release() { releaseGate(); gate = Promise.resolve(); },
    deliver(text) { inbound.push(text); flush(); },
    async send(text) {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await gate;
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
        await new Promise((resolve) => { waiters.push(resolve); });
      }
    },
    async close() { closedSettled = true; resolveClosed({ kind: "closed" }); flush(); },
    lose(cause) { closedSettled = true; resolveClosed({ kind: "lost", cause }); flush(); },
  };
}

const viewport = (width, height) => ({ type: "viewport.state", width, height });
const viewportText = (width, height) => JSON.stringify({ type: "viewport.state", width, height });
const viewportUnits = (carrier) => carrier.sent.filter((text) => text.includes("viewport.state"));

test("P3-01 revised /1 binds exactly four children with viewport.state Renderer→Subsystem only", async () => {
  assert.equal(RENDERER_DATA_PROFILE_V1, "loomrealm.renderer-data/1");

  const rendererCarrier = createProfileCarrier();
  const renderer = createRendererDataPeer({ binding: { carrier: rendererCarrier, subsystemKey: "demo", generation: 1, dataProfile: RENDERER_DATA_PROFILE_V1 }, handlers: rendererHandlers() });
  renderer.viewport.publishState(viewport(640, 480));
  await waitFor(() => rendererCarrier.sent.length === 1);
  assert.equal(rendererCarrier.sent[0], viewportText(640, 480));
  await renderer.close();

  // Reverse direction on the wire: Subsystem reader receiving viewport is legal
  // inbound for the renderer role only in the opposite role; here the
  // Subsystem outbound encode of viewport.state must fail closed locally.
  const subsystemCarrier = createProfileCarrier();
  const subsystem = createSubsystemDataPeer({ binding: { carrier: subsystemCarrier, subsystemKey: "demo", generation: 1, dataProfile: RENDERER_DATA_PROFILE_V1 }, handlers: subsystemHandlers() });
  subsystem.render.sendDomains({ type: "render.domains", domains: ["hud"] });
  subsystem.input.sendInterest({ type: "input.interest", frames: [] });
  assert.equal(subsystem.viewport, undefined, "Subsystem peers expose no viewport publisher");
  await waitFor(() => subsystemCarrier.sent.length === 2);
  assert.ok(subsystemCarrier.sent.every((text) => !text.includes("viewport.state")));
  await subsystem.close();
});

test("P3-02 real terminals classify invalid JSON vs recognized viewport violations vs trusted local invalid", async () => {
  const cases = [
    { raw: '{"type":"viewport.state","width":NaN,"height":480}', family: "profile" },
    { raw: '{"type":"viewport.foo","width":640,"height":480}', family: "profile" },
    { raw: '{"type":"unknown.kind"}', family: "profile" },
    { raw: '{"type":"viewport.state","width":640}', family: "viewport" },
    { raw: '{"type":"viewport.state","width":640,"height":480,"extra":1}', family: "viewport" },
    { raw: '{"type":"viewport.state","width":640.5,"height":480}', family: "viewport" },
    { raw: '{"type":"viewport.state","width":0,"height":480}', family: "viewport" },
    { raw: '{"type":"viewport.state","width":-1,"height":480}', family: "viewport" },
  ];
  for (const { raw, family } of cases) {
    const carrier = createProfileCarrier();
    let calls = 0;
    const peer = createSubsystemDataPeer({
      binding: { carrier, subsystemKey: "demo", generation: 1, dataProfile: RENDERER_DATA_PROFILE_V1 },
      handlers: subsystemHandlers({ onViewportState() { calls += 1; return accepted(); } }),
    });
    carrier.deliver(raw);
    const terminal = await peer.terminal;
    assert.equal(terminal.kind, "protocol-fatal", raw);
    assert.equal(terminal.protocol, family, raw);
    assert.equal(calls, 0, "zero role mutation for invalid units");
    await peer.close();
  }

  // Trusted local invalid outbound → local-fatal, never a remote family.
  const localCarrier = createProfileCarrier();
  const localRenderer = createRendererDataPeer({ binding: { carrier: localCarrier, subsystemKey: "demo", generation: 1, dataProfile: RENDERER_DATA_PROFILE_V1 }, handlers: rendererHandlers() });
  localRenderer.viewport.publishState(viewport(Number.NaN, 480));
  const localTerminal = await localRenderer.terminal;
  assert.equal(localTerminal.kind, "local-fatal");
  assert.deepEqual(localCarrier.sent, []);
  await localRenderer.close();
});

test("P3-03 one reader dispatches a valid unit exactly once", async () => {
  const carrier = createProfileCarrier();
  const seen = [];
  const peer = createSubsystemDataPeer({
    binding: { carrier, subsystemKey: "demo", generation: 1, dataProfile: RENDERER_DATA_PROFILE_V1 },
    handlers: subsystemHandlers({ onViewportState(message) { seen.push(message); return accepted(); } }),
  });
  carrier.deliver(viewportText(640, 480));
  await waitFor(() => seen.length === 1);
  await tick();
  assert.deepEqual(seen, [{ type: "viewport.state", width: 640, height: 480 }]);
  await peer.close();
});

test("P3-04 one serialized writer keeps FIFO and concurrency ≤ 1 across Input and Viewport", async () => {
  const carrier = createProfileCarrier();
  const renderer = createRendererDataPeer({ binding: { carrier, subsystemKey: "demo", generation: 1, dataProfile: RENDERER_DATA_PROFILE_V1 }, handlers: rendererHandlers() });
  carrier.hold();
  const sends = [];
  sends.push(renderer.input.sendState({
    type: "input.state", frameId: "root", activationId: "a1", channel: "keyboard.state", payload: { down: [] },
  }));
  renderer.viewport.publishState(viewport(100, 100));
  renderer.viewport.publishState(viewport(200, 200));
  sends.push(renderer.input.sendReset({ type: "input.reset", frameId: "root", activationId: "a1" }));
  carrier.release();
  await Promise.all(sends);
  await waitFor(() => viewportUnits(carrier).length === 2);
  const types = carrier.sent.map((text) => JSON.parse(text).type);
  assert.deepEqual(types, ["input.state", "viewport.state", "input.reset", "viewport.state"]);
  assert.deepEqual(viewportUnits(carrier), [viewportText(100, 100), viewportText(200, 200)]);
  assert.equal(carrier.maxActive, 1);
  await renderer.close();
});

test("P3-05 bounded viewport burst with concurrent bidirectional child traffic", async () => {
  const pair = createMemoryCarrierPair();
  const rendererSent = [];
  const rawRendererSend = pair.right.send.bind(pair.right);
  pair.right.send = async (text) => {
    rendererSent.push(text);
    return rawRendererSend(text);
  };
  const viewportSeen = [];
  const renderSeen = [];
  const subsystem = createSubsystemDataPeer({
    binding: { carrier: pair.left, subsystemKey: "demo", generation: 1, dataProfile: RENDERER_DATA_PROFILE_V1 },
    handlers: subsystemHandlers({ onViewportState(message) { viewportSeen.push(`${message.width}x${message.height}`); return accepted(); } }),
  });
  const renderer = createRendererDataPeer({
    binding: { carrier: pair.right, subsystemKey: "demo", generation: 1, dataProfile: RENDERER_DATA_PROFILE_V1 },
    handlers: {
      ...rendererHandlers(),
      onRenderDomains(message) { renderSeen.push(message); return accepted(); },
    },
  });

  const renderSends = [];
  renderSends.push(subsystem.render.sendDomains({ type: "render.domains", domains: ["hud"] }));
  for (let i = 0; i < 20; i += 1) {
    renderSends.push(subsystem.render.sendEvent({
      type: "render.event", domainId: "hud", targetKey: "root", name: "tick", data: { i },
    }));
  }
  renderer.viewport.publishState(viewport(10, 10));
  for (let i = 0; i < 10000; i += 1) {
    renderer.viewport.publishState(viewport(1000 + (i % 500), 2000 + (i % 500)));
  }
  await Promise.all(renderSends);
  await waitFor(() => viewportSeen.length >= 1 && viewportSeen.at(-1) === "1499x2499", "viewport convergence");
  await waitFor(() => renderSeen.length === 1, "render baseline delivered");
  const wireViewportUnits = rendererSent.filter((text) => text.includes("viewport.state"));
  assert.ok(wireViewportUnits.length <= 2, `viewport burst stays bounded on the shared writer, saw ${wireViewportUnits.length}`);
  assert.equal(wireViewportUnits[0], viewportText(10, 10));
  assert.equal(wireViewportUnits.at(-1), viewportText(1499, 2499));
  await renderer.close();
  await subsystem.close();
});

test("P3-06 fresh peers republish the viewport baseline and never migrate old pending work", async () => {
  const oldCarrier = createProfileCarrier();
  const oldRenderer = createRendererDataPeer({ binding: { carrier: oldCarrier, subsystemKey: "demo", generation: 1, dataProfile: RENDERER_DATA_PROFILE_V1 }, handlers: rendererHandlers() });
  oldCarrier.hold();
  oldRenderer.viewport.publishState(viewport(640, 480));

  const freshCarrier = createProfileCarrier();
  const freshRenderer = createRendererDataPeer({ binding: { carrier: freshCarrier, subsystemKey: "demo", generation: 1, dataProfile: RENDERER_DATA_PROFILE_V1 }, handlers: rendererHandlers() });
  freshRenderer.viewport.publishState(viewport(640, 480));
  await waitFor(() => freshCarrier.sent.length === 1);
  assert.equal(freshCarrier.sent[0], viewportText(640, 480), "fresh peer resends an equal baseline");
  assert.deepEqual(viewportUnits(oldCarrier), [], "old peer stays blocked and does not leak into the fresh peer");

  oldCarrier.release();
  await waitFor(() => viewportUnits(oldCarrier).length === 1);
  assert.deepEqual(viewportUnits(freshCarrier), [viewportText(640, 480)], "old pending settlement does not touch the fresh cursor");
  await oldRenderer.close();
  await freshRenderer.close();
});

test("P3-07 terminal families are exact, first-wins, and retire only the Data peer", async () => {
  const familyCases = [
    { raw: '{"type":"input.state","frameId":"root","activationId":"a1","channel":"keyboard.state","payload":{"down":["Nope"]}}', family: "input" },
    { raw: '{"type":"render.domains","domains":[5]}', family: "render" },
    { raw: '{"type":"viewport.state","width":0,"height":480}', family: "viewport" },
    { raw: '{"type":"viewport.foo"}', family: "profile" },
  ];
  for (const { raw, family } of familyCases) {
    const carrier = createProfileCarrier();
    const peer = createSubsystemDataPeer({
      binding: { carrier, subsystemKey: "demo", generation: 1, dataProfile: RENDERER_DATA_PROFILE_V1 },
      handlers: subsystemHandlers(),
    });
    carrier.deliver(raw);
    const terminal = await peer.terminal;
    assert.equal(terminal.kind, "protocol-fatal", raw);
    assert.equal(terminal.protocol, family, raw);
    carrier.deliver('{"type":"viewport.state","width":0,"height":0}');
    await tick();
    assert.deepEqual(await peer.terminal, terminal, "terminal is first-wins");
    await peer.close();
  }

  // Carrier-loss terminal differs from protocol families.
  const lost = createProfileCarrier();
  const lostPeer = createSubsystemDataPeer({ binding: { carrier: lost, subsystemKey: "demo", generation: 1, dataProfile: RENDERER_DATA_PROFILE_V1 }, handlers: subsystemHandlers() });
  lost.lose(new Error("transport gone"));
  const lostTerminal = await lostPeer.terminal;
  assert.equal(lostTerminal.kind, "carrier-lost");
});

test("P3-09 compact cross-check: holder-driven real peers deliver viewport.state to a real Subsystem handler", async () => {
  const authority = { subsystemKey: "demo", generation: 1, dataProfile: RENDERER_DATA_PROFILE_V1 };
  const snapshot = {
    sessionId: "p3",
    revision: 1,
    runtimes: [{ subsystemKey: "demo", state: "ready" }],
    stack: [],
    inputTarget: null,
    dataAuthorities: [authority],
  };
  const controlPair = createMemoryCarrierPair();
  createMainRendererControlPeer({
    carrier: controlPair.left,
    acceptHello() {
      return { kind: "accepted", snapshot, preparedHelloText: prepareRendererHelloResultV1(snapshot) };
    },
  });
  const received = [];
  const peers = [];
  const binding = {
    async acquire(subsystemKey, generation, dataProfile) {
      const pair = createMemoryCarrierPair();
      const peer = createSubsystemDataPeer({
        binding: { carrier: pair.left, subsystemKey, generation, dataProfile },
        handlers: subsystemHandlers({ onViewportState(message) { received.push(`${message.width}x${message.height}`); return accepted(); } }),
      });
      peers.push(peer);
      return pair.right;
    },
  };
  let emit = null;
  const holder = createRendererControlHolder(binding, undefined, {
    start(onEmit) {
      emit = onEmit;
      return () => { emit = null; };
    },
  });
  await holder.connect({ carrier: controlPair.right, rendererControlToken: "t" });
  emit({ width: 1280.7, height: 720.3 });
  await waitFor(() => received.length === 1);
  assert.deepEqual(received, ["1280x720"]);
  emit({ width: 1280, height: 720 });
  await tick();
  assert.deepEqual(received, ["1280x720"], "equal resample is suppressed through the real holder chain");
  await Promise.allSettled(peers.map((peer) => peer.close()));
});
