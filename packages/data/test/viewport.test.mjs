import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryCarrierPair } from "@loomrealm/foundation/testing";
import {
  createRendererDataPeer,
  createSubsystemDataPeer,
  RENDERER_DATA_PROFILE_V1,
} from "../dist/index.js";
import { decodeForRole, encodeForRole } from "../dist/profile-codec.js";
import { DataProtocolError } from "../dist/validation-common.js";

const accepted = () => ({ kind: "accepted" });
const binding = (carrier) => ({
  carrier,
  subsystemKey: "map",
  generation: 1,
  dataProfile: RENDERER_DATA_PROFILE_V1,
});
const rendererHandlers = {
  onInputInterest: accepted,
  onRenderDomains: accepted,
  onRenderSnapshot: accepted,
  onRenderPatch: accepted,
  onRenderEvent: accepted,
};
const tick = () => new Promise((resolve) => setImmediate(resolve));

async function waitFor(predicate, message = "condition") {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (predicate()) return;
    await tick();
  }
  assert.fail(`timed out waiting for ${message}`);
}

function subsystemHandlers(overrides = {}) {
  return {
    onInputState: accepted,
    onInputEvent: accepted,
    onInputReset: accepted,
    onViewportState: accepted,
    ...overrides,
  };
}

function deferred() {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
}

function inboundCarrier(units) {
  let resolveClosed;
  const closed = new Promise((resolve) => { resolveClosed = resolve; });
  let messageCalls = 0;
  return {
    closed,
    get messageCalls() { return messageCalls; },
    async send() {},
    messages() {
      messageCalls += 1;
      return {
        async *[Symbol.asyncIterator]() {
          for (const unit of units) yield unit;
          await closed;
        },
      };
    },
    async close() { resolveClosed({ kind: "closed" }); },
  };
}

/**
 * Carrier whose `send()` can be held globally (`hold()`) or per next send
 * (`arm()`), with observable concurrency and sent text.
 */
function steppingCarrier() {
  let resolveClosed;
  const closed = new Promise((resolve) => { resolveClosed = resolve; });
  const sent = [];
  let active = 0;
  let maxActive = 0;
  let hold = false;
  const holdWaiters = [];
  let armedGate = null;
  const carrier = {
    closed,
    sent,
    get maxActive() { return maxActive; },
    hold() { hold = true; },
    release() {
      hold = false;
      for (const resolve of holdWaiters.splice(0)) resolve();
    },
    arm() {
      const gate = deferred();
      armedGate = gate;
      return gate;
    },
    async send(text) {
      active += 1;
      maxActive = Math.max(maxActive, active);
      try {
        if (hold) await new Promise((resolve) => holdWaiters.push(resolve));
        if (armedGate !== null) {
          const gate = armedGate;
          armedGate = null;
          await gate.promise;
        }
      } finally {
        active -= 1;
      }
      sent.push(text);
    },
    async *messages() { await closed; },
    async close() { resolveClosed({ kind: "closed" }); },
  };
  return carrier;
}

function wireTypes(carrier) {
  return carrier.sent.map((text) => JSON.parse(text));
}

// ---------------------------------------------------------------------------
// P3-01 / P3-03 — four-child direction routing, one reader, exact dispatch
// ---------------------------------------------------------------------------

test("P3-01 viewport.state routes Renderer→Subsystem and reverse direction is viewport-fatal", async () => {
  const inbound = inboundCarrier([JSON.stringify({ type: "viewport.state", width: 640, height: 480 })]);
  const seen = [];
  const subsystem = createSubsystemDataPeer({
    binding: binding(inbound),
    handlers: subsystemHandlers({
      onViewportState(message) { seen.push(message); return accepted(); },
    }),
  });
  await waitFor(() => seen.length === 1, "viewport dispatch");
  assert.deepEqual(seen[0], { type: "viewport.state", width: 640, height: 480 });
  assert.equal(inbound.messageCalls, 1);

  const reverse = inboundCarrier([JSON.stringify({ type: "viewport.state", width: 640, height: 480 })]);
  const renderer = createRendererDataPeer({ binding: binding(reverse), handlers: rendererHandlers });
  const terminal = await renderer.terminal;
  assert.equal(terminal.kind, "protocol-fatal");
  assert.equal(terminal.protocol, "viewport");
  assert.equal(reverse.messageCalls, 1);

  await subsystem.close();
});

test("P3-01 unknown viewport namespace stays profile; Subsystem outbound viewport is viewport-fatal", () => {
  assert.throws(
    () => decodeForRole(JSON.stringify({ type: "viewport.foo", width: 1 }), "subsystem"),
    (error) => error instanceof DataProtocolError && error.protocol === "profile",
  );
  assert.throws(
    () => encodeForRole({ type: "viewport.state", width: 640, height: 480 }, "subsystem"),
    (error) => error instanceof DataProtocolError && error.protocol === "viewport",
  );
  assert.equal(
    JSON.parse(encodeForRole({ type: "viewport.state", width: 640, height: 480 }, "renderer"))
      .type,
    "viewport.state",
  );
});

test("P3-01 onViewportState is a required Subsystem handler", () => {
  const carrier = inboundCarrier([]);
  assert.throws(
    () => createSubsystemDataPeer({
      binding: binding(carrier),
      handlers: { onInputState: accepted, onInputEvent: accepted, onInputReset: accepted },
    }),
    /Invalid handler onViewportState/,
  );
});

test("P3-03 one reader dispatches one valid unit exactly once and common gate precedes child", async () => {
  const calls = [];
  const inbound = inboundCarrier([
    JSON.stringify({ type: "viewport.state", width: 1, height: 2 }),
  ]);
  const subsystem = createSubsystemDataPeer({
    binding: binding(inbound),
    handlers: subsystemHandlers({
      onInputState(message) { calls.push(["input", message.type]); return accepted(); },
      onViewportState(message) { calls.push(["viewport", message.width, message.height]); return accepted(); },
    }),
  });
  await waitFor(() => calls.length === 1);
  assert.deepEqual(calls, [["viewport", 1, 2]]);
  assert.equal(inbound.messageCalls, 1);
  await subsystem.close();
});

// ---------------------------------------------------------------------------
// P3-02 / V-04 — wire classification families
// ---------------------------------------------------------------------------

const viewportWireCases = [
  ["missing width", JSON.stringify({ type: "viewport.state", height: 480 }), "viewport"],
  ["missing height", JSON.stringify({ type: "viewport.state", width: 640 }), "viewport"],
  ["extra member", JSON.stringify({ type: "viewport.state", width: 640, height: 480, extra: 1 }), "viewport"],
  ["zero width", JSON.stringify({ type: "viewport.state", width: 0, height: 480 }), "viewport"],
  ["negative height", JSON.stringify({ type: "viewport.state", width: 640, height: -480 }), "viewport"],
  ["fraction width", JSON.stringify({ type: "viewport.state", width: 640.5, height: 480 }), "viewport"],
  ["unsafe width", JSON.stringify({ type: "viewport.state", width: 2 ** 53, height: 480 }), "viewport"],
  ["string width", JSON.stringify({ type: "viewport.state", width: "640", height: 480 }), "viewport"],
  ["null height", JSON.stringify({ type: "viewport.state", width: 640, height: null }), "viewport"],
  ["literal NaN", '{"type":"viewport.state","width":NaN,"height":480}', "profile"],
  ["literal Infinity", '{"type":"viewport.state","width":Infinity,"height":480}', "profile"],
  ["unknown viewport.foo", JSON.stringify({ type: "viewport.foo", width: 640, height: 480 }), "profile"],
  ["unknown top-level type", JSON.stringify({ type: "other.state", width: 640, height: 480 }), "profile"],
  ["malformed JSON", "{", "profile"],
  ["oversized unit", JSON.stringify({ type: "viewport.state", width: 640, height: 480, pad: "x".repeat(1_100_000) }), "profile"],
];

for (const [label, unit, family] of viewportWireCases) {
  test(`V-04/P3-02 inbound ${label} becomes ${family} protocol-fatal with zero role mutation`, async () => {
    const mutations = [];
    const inbound = inboundCarrier([unit]);
    const subsystem = createSubsystemDataPeer({
      binding: binding(inbound),
      handlers: subsystemHandlers({
        onViewportState(message) { mutations.push(message); return accepted(); },
      }),
    });
    const terminal = await subsystem.terminal;
    assert.equal(terminal.kind, "protocol-fatal");
    assert.equal(terminal.protocol, family);
    assert.equal(mutations.length, 0);
  });
}

test("V-04 trusted local invalid outbound viewport value becomes local-fatal with zero bytes", async () => {
  const carrier = steppingCarrier();
  const renderer = createRendererDataPeer({ binding: binding(carrier), handlers: rendererHandlers });
  const cases = [
    { type: "viewport.state", width: 0, height: 1 },
    { type: "viewport.state", width: -1, height: 1 },
    { type: "viewport.state", width: 1.5, height: 1 },
    { type: "viewport.state", width: 1, height: Number.NaN },
    { type: "viewport.state", width: 1, height: 2, extra: true },
  ];
  for (const message of cases) {
    // Each offer is delivered to a still-live publisher until the first fatal.
    renderer.viewport.publishState(message);
  }
  const terminal = await renderer.terminal;
  assert.equal(terminal.kind, "local-fatal");
  // The first invalid admission fails before any bytes reach the carrier.
  assert.equal(carrier.sent.length, 0);
  // A late offer after terminal is inert.
  renderer.viewport.publishState({ type: "viewport.state", width: 10, height: 10 });
  await tick();
  assert.equal(carrier.sent.length, 0);
});

// ---------------------------------------------------------------------------
// P3-04 / V-05 / V-06 — bounded publisher and serialized writer
// ---------------------------------------------------------------------------

test("V-05 in-flight A plus offered B then A cancels B and never duplicates A", async () => {
  const carrier = steppingCarrier();
  const renderer = createRendererDataPeer({ binding: binding(carrier), handlers: rendererHandlers });
  const gate = carrier.arm();
  const a = { type: "viewport.state", width: 640, height: 480 };
  renderer.viewport.publishState(a);
  await waitFor(() => carrier.maxActive === 1, "A admitted");
  renderer.viewport.publishState({ type: "viewport.state", width: 800, height: 600 });
  renderer.viewport.publishState(a);
  gate.resolve();
  await waitFor(() => carrier.sent.length === 1, "single admitted send");
  await tick();
  assert.equal(carrier.sent.length, 1);
  assert.deepEqual(JSON.parse(carrier.sent[0]), a);
  await renderer.close();
});

test("V-06 admitted FIFO with latest pending: A and B admitted, C arrives, B never revoked", async () => {
  const carrier = steppingCarrier();
  const renderer = createRendererDataPeer({ binding: binding(carrier), handlers: rendererHandlers });
  const gateA = carrier.arm();
  renderer.viewport.publishState({ type: "viewport.state", width: 1, height: 1 }); // A admitted
  await waitFor(() => carrier.maxActive === 1, "A blocked");
  renderer.viewport.publishState({ type: "viewport.state", width: 2, height: 2 }); // pending B
  const gateB = carrier.arm();
  gateA.resolve();
  await waitFor(() => carrier.sent.length === 1, "A settled, B admitted");
  renderer.viewport.publishState({ type: "viewport.state", width: 3, height: 3 }); // C after B admitted
  gateB.resolve();
  await waitFor(() => carrier.sent.length === 3, "B and C settled");
  assert.deepEqual(
    wireTypes(carrier).map(({ width, height }) => [width, height]),
    [[1, 1], [2, 2], [3, 3]],
  );
  assert.equal(carrier.maxActive, 1);
  await renderer.close();
});

test("V-06 10000-sample burst keeps at most 1 in-flight + 1 pending and converges to the latest", async () => {
  const carrier = steppingCarrier();
  const renderer = createRendererDataPeer({ binding: binding(carrier), handlers: rendererHandlers });
  carrier.hold();
  for (let i = 1; i <= 10_000; i += 1) {
    renderer.viewport.publishState({ type: "viewport.state", width: i, height: i });
  }
  await tick();
  assert.equal(carrier.sent.length, 0);
  assert.equal(carrier.maxActive, 1);
  carrier.release();
  await waitFor(() => carrier.sent.length === 2, "first plus latest");
  await tick();
  assert.deepEqual(
    wireTypes(carrier).map(({ width }) => width),
    [1, 10_000],
  );
  assert.equal(carrier.maxActive, 1);
  await renderer.close();
});

test("P3-04/P3-05 viewport burst does not starve Input and stays on one serialized writer", async () => {
  const carrier = steppingCarrier();
  const renderer = createRendererDataPeer({ binding: binding(carrier), handlers: rendererHandlers });
  carrier.hold();
  renderer.viewport.publishState({ type: "viewport.state", width: 10, height: 10 });
  for (let i = 0; i < 100; i += 1) {
    renderer.viewport.publishState({ type: "viewport.state", width: 10 + i, height: 10 });
  }
  const inputSend = renderer.input.sendEvent({
    type: "input.event",
    frameId: "root",
    activationId: "a1",
    channel: "keyboard.event",
    payload: { action: "down", code: "KeyA", repeat: false },
  });
  await tick();
  assert.equal(carrier.maxActive, 1);
  carrier.release();
  assert.deepEqual(await inputSend, { kind: "sent" });
  await waitFor(() => carrier.sent.length === 3, "viewport first, input event, viewport latest");
  const types = wireTypes(carrier).map(({ type }) => type);
  assert.equal(types.filter((type) => type === "viewport.state").length, 2);
  assert.equal(types.includes("input.event"), true);
  assert.equal(carrier.maxActive, 1);
  await renderer.close();
});

// ---------------------------------------------------------------------------
// P3-06 / V-07 — fresh peer baselines, retirement, late settlement
// ---------------------------------------------------------------------------

test("P3-06 fresh peer re-sends the equal baseline and suppresses only true duplicates", async () => {
  const firstCarrier = steppingCarrier();
  const first = createRendererDataPeer({ binding: binding(firstCarrier), handlers: rendererHandlers });
  const size = { type: "viewport.state", width: 640, height: 480 };
  first.viewport.publishState(size);
  first.viewport.publishState(size);
  await waitFor(() => firstCarrier.sent.length === 1, "first baseline");
  await tick();
  assert.equal(firstCarrier.sent.length, 1, "equal offer suppressed inside one cursor");
  await first.close();

  const secondCarrier = steppingCarrier();
  const second = createRendererDataPeer({ binding: binding(secondCarrier), handlers: rendererHandlers });
  second.viewport.publishState(size);
  await waitFor(() => secondCarrier.sent.length === 1, "fresh baseline even if equal");
  assert.deepEqual(JSON.parse(secondCarrier.sent[0]), size);
  await second.close();
});

test("V-07 terminal retires the cursor, late settlement is inert, and no retry or rejection escapes", async () => {
  const pair = createMemoryCarrierPair();
  const sendGate = deferred();
  const sent = [];
  const carrier = {
    closed: pair.left.closed,
    send(text) {
      sent.push(text);
      return sendGate.promise;
    },
    messages: () => pair.left.messages(),
    close: () => pair.left.close(),
  };
  const renderer = createRendererDataPeer({ binding: binding(carrier), handlers: rendererHandlers });
  renderer.viewport.publishState({ type: "viewport.state", width: 5, height: 5 });
  renderer.viewport.publishState({ type: "viewport.state", width: 6, height: 6 });
  await tick();
  pair.lose(new Error("carrier lost"));
  const terminal = await renderer.terminal;
  assert.equal(terminal.kind, "carrier-lost");
  assert.equal(sent.length, 1);
  sendGate.resolve(); // old Promise settles after retirement
  await tick();
  assert.equal(sent.length, 1, "no retry and no migration after retire");
  renderer.viewport.publishState({ type: "viewport.state", width: 7, height: 7 });
  await tick();
  assert.equal(sent.length, 1);
});

test("P3-07 recognized viewport child failure retires only the Data peer with first-wins terminal", async () => {
  const inbound = inboundCarrier([
    JSON.stringify({ type: "viewport.state", width: 640, height: 480 }),
    JSON.stringify({ type: "viewport.state", width: 0, height: 480 }),
  ]);
  const seen = [];
  const subsystem = createSubsystemDataPeer({
    binding: binding(inbound),
    handlers: subsystemHandlers({
      onViewportState(message) { seen.push(message); return accepted(); },
    }),
  });
  const terminal = await subsystem.terminal;
  assert.equal(terminal.kind, "protocol-fatal");
  assert.equal(terminal.protocol, "viewport");
  assert.equal(seen.length, 1, "valid unit delivered before the invalid one retired the peer");
  assert.equal(await subsystem.terminal, terminal, "terminal first-wins");
  await subsystem.close();
  assert.equal(await subsystem.terminal, terminal);
});
