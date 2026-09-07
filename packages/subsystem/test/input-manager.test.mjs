import { test } from "node:test";
import assert from "node:assert/strict";
import { InputManager } from "../dist/internal/input-manager.js";

function deferred() {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
}

function harness() {
  const manager = new InputManager();
  const frame = Object.freeze({
    id: "root",
    params: null,
    signal: new AbortController().signal,
    async call() {},
  });
  const view = {
    kind: "live",
    frameId: "root",
    activationId: "a1",
    deliveryOpen: true,
  };
  manager.bindRuntime({
    inspect(value) {
      return value === frame ? view : { kind: "foreign" };
    },
    inspectById(frameId) {
      return frameId === "root" ? view : null;
    },
  });
  const interests = [];
  const peer = {
    input: {
      async sendInterest(message) {
        interests.push(message);
        return { kind: "sent" };
      },
    },
  };
  manager.setDataPeer(peer);
  return { manager, frame, view, interests };
}

async function tick() {
  await new Promise((resolve) => setImmediate(resolve));
}

test("listener contributions own Interest while registrations remain independent", async () => {
  const { manager, frame, interests } = harness();
  await tick();
  assert.deepEqual(interests, [{ type: "input.interest", frames: [] }]);

  const first = manager.createListener({
    frame,
    channels: ["pointer.state", "keyboard.event"],
  });
  const second = manager.createListener({ frame, channels: ["pointer.state"] });
  await tick();
  assert.deepEqual(interests.at(-1), {
    type: "input.interest",
    frames: [{
      frameId: "root",
      channels: ["keyboard.event", "pointer.state"],
    }],
  });

  const unsubscribe = first.on("pointer.state", () => {});
  unsubscribe();
  unsubscribe();
  await tick();
  assert.equal(interests.length, 2);

  first.setChannels([]);
  await tick();
  assert.deepEqual(interests.at(-1).frames[0].channels, ["pointer.state"]);
  first.close();
  first.close();
  assert.throws(() => first.on("pointer.state", () => {}), TypeError);
  assert.throws(() => first.setChannels([]), TypeError);

  second.close();
  await tick();
  assert.deepEqual(interests.at(-1), { type: "input.interest", frames: [] });
});

test("invalid configuration is atomic and preserves the previous contribution", async () => {
  const { manager, frame, interests } = harness();
  const listener = manager.createListener({ frame, channels: ["keyboard.state"] });
  await tick();
  const count = interests.length;

  assert.throws(
    () => listener.setChannels(["keyboard.state", "keyboard.state"]),
    /Duplicate/,
  );
  assert.throws(() => listener.setChannels(["x.Bad.state"]), /Invalid/);
  assert.throws(
    () => manager.createListener({ frame: { ...frame }, channels: [] }),
    /Foreign/,
  );
  await tick();
  assert.equal(interests.length, count);
  assert.doesNotThrow(() => listener.on("keyboard.state", () => {}));
});

test("retained State is detached, deeply immutable, replayed synchronously, and cleared on true union removal", () => {
  const { manager, frame } = harness();
  const listener = manager.createListener({ frame, channels: ["pointer.state"] });
  const source = { pointers: [{ pointerId: 1, kind: "mouse", x: 4, y: 5, buttons: [] }] };
  manager.onState({
    type: "input.state",
    frameId: "root",
    activationId: "a1",
    channel: "pointer.state",
    payload: source,
  });
  source.pointers[0].x = 99;

  let baseline;
  listener.on("pointer.state", (value) => { baseline = value; });
  assert.equal(baseline.pointers[0].x, 4);
  assert.equal(Object.isFrozen(baseline), true);
  assert.equal(Object.isFrozen(baseline.pointers[0]), true);

  listener.setChannels([]);
  listener.setChannels(["pointer.state"]);
  let replayed = false;
  listener.on("pointer.state", () => { replayed = true; });
  assert.equal(replayed, false);
});

test("dormant handlers reactivate with baseline while another contribution keeps State live", () => {
  const { manager, frame } = harness();
  const first = manager.createListener({ frame, channels: ["keyboard.state"] });
  const keeper = manager.createListener({ frame, channels: ["keyboard.state"] });
  const values = [];
  first.on("keyboard.state", (value) => values.push(value.down.join(",")));
  manager.onState({
    type: "input.state",
    frameId: "root",
    activationId: "a1",
    channel: "keyboard.state",
    payload: { down: ["KeyA"] },
  });
  first.setChannels([]);
  manager.onState({
    type: "input.state",
    frameId: "root",
    activationId: "a1",
    channel: "keyboard.state",
    payload: { down: ["KeyB"] },
  });
  first.setChannels(["keyboard.state"]);
  assert.deepEqual(values, ["KeyA", "KeyB"]);
  keeper.close();
});

test("handler delivery uses global registration order, a stable snapshot, and async isolation", async () => {
  const { manager, frame } = harness();
  const first = manager.createListener({ frame, channels: ["keyboard.event"] });
  const second = manager.createListener({ frame, channels: ["keyboard.event"] });
  const order = [];
  let unsubscribeThird;
  second.on("keyboard.event", () => {
    order.push(1);
    unsubscribeThird();
    first.close();
    throw new Error("contained");
  });
  first.on("keyboard.event", () => {
    order.push(2);
    return new Promise(() => {});
  });
  unsubscribeThird = second.on("keyboard.event", async () => {
    order.push(3);
    throw new Error("contained rejection");
  });

  manager.onEvent({
    type: "input.event",
    frameId: "root",
    activationId: "a1",
    channel: "keyboard.event",
    payload: { action: "down", code: "KeyA", repeat: false },
  });
  assert.deepEqual(order, [1, 2, 3]);
  await tick();
});

test("mutation gate retains latest State, drops Event, and converges State on reopen", () => {
  const { manager, frame, view } = harness();
  const listener = manager.createListener({
    frame,
    channels: ["keyboard.state", "keyboard.event"],
  });
  const observed = [];
  listener.on("keyboard.state", (value) => observed.push(`state:${value.down.join(",")}`));
  listener.on("keyboard.event", () => observed.push("event"));
  view.deliveryOpen = false;
  manager.onState({
    type: "input.state",
    frameId: "root",
    activationId: "a1",
    channel: "keyboard.state",
    payload: { down: ["KeyA"] },
  });
  manager.onState({
    type: "input.state",
    frameId: "root",
    activationId: "a1",
    channel: "keyboard.state",
    payload: { down: ["KeyB"] },
  });
  manager.onEvent({
    type: "input.event",
    frameId: "root",
    activationId: "a1",
    channel: "keyboard.event",
    payload: { action: "down", code: "KeyB", repeat: false },
  });
  assert.deepEqual(observed, []);
  view.deliveryOpen = true;
  manager.mutationReopened("root", "a1");
  assert.deepEqual(observed, ["state:KeyB"]);
});

test("Reset clears suppressed State and multi-channel convergence is canonical", () => {
  const { manager, frame, view } = harness();
  const listener = manager.createListener({
    frame,
    channels: ["pointer.state", "keyboard.state"],
  });
  const observed = [];
  listener.on("pointer.state", () => observed.push("pointer"));
  listener.on("keyboard.state", () => observed.push("keyboard"));
  view.deliveryOpen = false;
  manager.onState({
    type: "input.state", frameId: "root", activationId: "a1",
    channel: "pointer.state", payload: { pointers: [] },
  });
  manager.onState({
    type: "input.state", frameId: "root", activationId: "a1",
    channel: "keyboard.state", payload: { down: [] },
  });
  view.deliveryOpen = true;
  manager.mutationReopened("root", "a1");
  assert.deepEqual(observed, ["keyboard", "pointer"]);

  observed.length = 0;
  view.deliveryOpen = false;
  manager.onState({
    type: "input.state", frameId: "root", activationId: "a1",
    channel: "keyboard.state", payload: { down: ["KeyA"] },
  });
  manager.onReset({ type: "input.reset", frameId: "root", activationId: "a1" });
  view.deliveryOpen = true;
  manager.mutationReopened("root", "a1");
  assert.deepEqual(observed, []);
});

test("Interest publisher keeps only the latest full Registry behind one in-flight send", async () => {
  const manager = new InputManager();
  const frame = Object.freeze({
    id: "root", params: null, signal: new AbortController().signal, async call() {},
  });
  const view = { kind: "live", frameId: "root", activationId: "a1", deliveryOpen: true };
  manager.bindRuntime({
    inspect: (value) => value === frame ? view : { kind: "foreign" },
    inspectById: (id) => id === "root" ? view : null,
  });
  const sends = [];
  const gates = [];
  manager.setDataPeer({
    input: {
      sendInterest(message) {
        sends.push(message);
        const gate = deferred();
        gates.push(gate);
        return gate.promise;
      },
    },
  });
  const listener = manager.createListener({ frame, channels: ["keyboard.state"] });
  listener.setChannels(["pointer.state"]);
  assert.equal(sends.length, 1);
  gates[0].resolve({ kind: "sent" });
  await tick();
  assert.equal(sends.length, 2);
  assert.deepEqual(sends[1], {
    type: "input.interest",
    frames: [{ frameId: "root", channels: ["pointer.state"] }],
  });
});
