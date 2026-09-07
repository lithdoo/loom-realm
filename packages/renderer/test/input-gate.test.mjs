import test from "node:test";
import assert from "node:assert/strict";
import { RendererInputGate } from "../dist/internal/input-gate.js";

function deferred() {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
}

function peerHarness() {
  const sent = [];
  const gates = [];
  const send = (message) => {
    sent.push(message);
    const gate = deferred();
    gates.push(gate);
    return gate.promise;
  };
  return {
    sent,
    gates,
    peer: {
      input: { sendState: send, sendEvent: send, sendReset: send },
    },
  };
}

const snapshot = (revision, frameId = "root", activationId = "a1") => ({
  sessionId: "s",
  revision,
  runtimes: [{ subsystemKey: "demo", state: "ready" }],
  stack: [{
    frameId,
    subsystemKey: "demo",
    lifecycle: "active",
    activationId,
  }],
  inputTarget: { subsystemKey: "demo", frameId, activationId },
  dataAuthorities: [{
    subsystemKey: "demo",
    generation: 1,
    dataProfile: "loomrealm.renderer-data/1",
  }],
});

async function turn() {
  await new Promise((resolve) => setImmediate(resolve));
}

async function release(harness, index) {
  harness.gates[index].resolve({ kind: "sent" });
  await turn();
}

test("Interest-first and authority-first both produce one fresh State baseline", () => {
  for (const order of ["interest-first", "authority-first"]) {
    const gate = new RendererInputGate();
    const harness = peerHarness();
    gate.installData("demo", harness.peer);
    gate.updateState("keyboard.state", { down: ["KeyA"] });
    gate.setAvailability("keyboard.state", true);
    if (order === "interest-first") {
      gate.replaceInterest("demo", harness.peer, {
        type: "input.interest",
        frames: [{ frameId: "root", channels: ["keyboard.state"] }],
      });
      assert.equal(harness.sent.length, 0);
      gate.setControl(snapshot(1));
    } else {
      gate.setControl(snapshot(1));
      assert.equal(harness.sent.length, 0);
      gate.replaceInterest("demo", harness.peer, {
        type: "input.interest",
        frames: [{ frameId: "root", channels: ["keyboard.state"] }],
      });
    }
    assert.deepEqual(harness.sent, [{
      type: "input.state",
      frameId: "root",
      activationId: "a1",
      channel: "keyboard.state",
      payload: { down: ["KeyA"] },
    }]);
  }
});

test("publisher coalesces State only within Event barriers and keeps one send in flight", async () => {
  const gate = new RendererInputGate();
  const harness = peerHarness();
  gate.installData("demo", harness.peer);
  gate.updateState("keyboard.state", { down: [] });
  gate.setAvailability("keyboard.state", true);
  gate.setAvailability("keyboard.event", true);
  gate.setControl(snapshot(1));
  gate.replaceInterest("demo", harness.peer, {
    type: "input.interest",
    frames: [{ frameId: "root", channels: ["keyboard.event", "keyboard.state"] }],
  });
  gate.updateState("keyboard.state", { down: ["KeyA"] });
  gate.updateState("keyboard.state", { down: ["KeyB"] });
  gate.emitEvent("keyboard.event", { action: "down", code: "KeyB", repeat: false });
  gate.updateState("keyboard.state", { down: ["KeyC"] });
  assert.equal(harness.sent.length, 1);

  await release(harness, 0);
  await release(harness, 1);
  await release(harness, 2);
  assert.deepEqual(harness.sent.map((message) =>
    message.type === "input.state"
      ? `${message.type}:${message.payload.down.join(",")}`
      : message.type
  ), [
    "input.state:",
    "input.state:KeyB",
    "input.event",
    "input.state:KeyC",
  ]);
});

test("same-carrier lease replacement emits Reset before the fresh lease baseline", async () => {
  const gate = new RendererInputGate();
  const harness = peerHarness();
  gate.installData("demo", harness.peer);
  gate.updateState("keyboard.state", { down: ["KeyA"] });
  gate.setAvailability("keyboard.state", true);
  gate.setControl(snapshot(1));
  gate.replaceInterest("demo", harness.peer, {
    type: "input.interest",
    frames: [
      { frameId: "child", channels: ["keyboard.state"] },
      { frameId: "root", channels: ["keyboard.state"] },
    ],
  });
  gate.setControl(snapshot(2, "child", "a2"));
  assert.equal(harness.sent.length, 1);
  await release(harness, 0);
  await release(harness, 1);
  assert.deepEqual(harness.sent.map(({ type, frameId, activationId }) =>
    `${type}:${frameId}:${activationId}`
  ), [
    "input.state:root:a1",
    "input.reset:root:a1",
    "input.state:child:a2",
  ]);
});

test("state producer loss Reset-rebaselines remaining effective State", async () => {
  const gate = new RendererInputGate();
  const harness = peerHarness();
  gate.installData("demo", harness.peer);
  gate.updateState("keyboard.state", { down: [] });
  gate.updateState("pointer.state", { pointers: [] });
  gate.setAvailability("keyboard.state", true);
  gate.setAvailability("pointer.state", true);
  gate.setControl(snapshot(1));
  gate.replaceInterest("demo", harness.peer, {
    type: "input.interest",
    frames: [{ frameId: "root", channels: ["keyboard.state", "pointer.state"] }],
  });
  await release(harness, 0);
  gate.setAvailability("keyboard.state", false);
  await release(harness, 1);
  await release(harness, 2);
  assert.deepEqual(harness.sent.map(({ type, channel }) => `${type}:${channel ?? ""}`), [
    "input.state:keyboard.state",
    "input.state:pointer.state",
    "input.reset:",
    "input.state:pointer.state",
  ]);
});

test("retired Data publisher discards not-started work and cannot resurrect", async () => {
  const gate = new RendererInputGate();
  const harness = peerHarness();
  gate.installData("demo", harness.peer);
  gate.updateState("keyboard.state", { down: [] });
  gate.setAvailability("keyboard.state", true);
  gate.setControl(snapshot(1));
  gate.replaceInterest("demo", harness.peer, {
    type: "input.interest",
    frames: [{ frameId: "root", channels: ["keyboard.state"] }],
  });
  gate.updateState("keyboard.state", { down: ["KeyA"] });
  gate.retireData("demo", harness.peer);
  await release(harness, 0);
  assert.equal(harness.sent.length, 1);
});

test("Event overflow is bounded and surviving not-yet-emitted Events preserve order", async () => {
  const gate = new RendererInputGate();
  const harness = peerHarness();
  gate.installData("demo", harness.peer);
  gate.setAvailability("x.test.event", true);
  gate.setControl(snapshot(1));
  gate.replaceInterest("demo", harness.peer, {
    type: "input.interest",
    frames: [{ frameId: "root", channels: ["x.test.event"] }],
  });
  for (let index = 0; index < 400; index += 1) {
    gate.emitEvent("x.test.event", { marker: index });
  }
  assert.equal(harness.sent.length, 1);
  for (let index = 0; index < 257; index += 1) {
    await release(harness, index);
  }
  assert.equal(harness.sent.length, 257);
  assert.deepEqual(
    harness.sent.map((message) => message.payload.marker),
    Array.from({ length: 257 }, (_, index) => index),
  );
});

test("producer return requires fresh State while Event return remains future-only", async () => {
  const gate = new RendererInputGate();
  const harness = peerHarness();
  gate.installData("demo", harness.peer);
  gate.setControl(snapshot(1));
  gate.replaceInterest("demo", harness.peer, {
    type: "input.interest",
    frames: [{ frameId: "root", channels: ["keyboard.event", "keyboard.state"] }],
  });
  gate.setAvailability("keyboard.state", true);
  gate.setAvailability("keyboard.event", true);
  assert.equal(harness.sent.length, 0);
  gate.emitEvent("keyboard.event", { action: "down", code: "KeyA", repeat: false });
  assert.equal(harness.sent.length, 1);
  await release(harness, 0);

  gate.setAvailability("keyboard.event", false);
  gate.emitEvent("keyboard.event", { action: "up", code: "KeyA", repeat: false });
  gate.setAvailability("keyboard.event", true);
  assert.equal(harness.sent.length, 1);
  gate.updateState("keyboard.state", { down: ["KeyA"] });
  gate.setAvailability("keyboard.state", true);
  assert.equal(harness.sent.length, 2);
  assert.equal(harness.sent[1].type, "input.state");
});
