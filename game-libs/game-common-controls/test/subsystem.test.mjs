import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { EMPTY_CONTROLS_STATE_V1 } from "../dist/index.js";
import { createControlsConsumer, createDirectionalControlsTracker } from "../dist/subsystem.js";

const ROOT_VALUES = Object.freeze([
  "CONTROLS_BUTTONS_V1",
  "CONTROLS_INPUT_CHANNELS",
  "CONTROLS_STATE_REFRESH_MS",
  "CONTROLS_STATE_STALE_MS",
  "DEVICE_INPUT_CHANNELS",
  "DEVICE_STATE_REFRESH_MS",
  "DEVICE_STATE_STALE_MS",
  "EMPTY_CONTROLS_STATE_V1",
  "KEYBOARD_CODES_V1",
  "createFreshControlsStateTracker",
  "createFreshDeviceStateTracker",
  "emptyDeviceState",
  "isNonEmptyDeviceState",
]);

function frame() {
  const controller = new AbortController();
  return { signal: controller.signal, abort: () => controller.abort() };
}

function presentation() {
  const listeners = [];
  return {
    listeners,
    createListener({ frame: bound, channels }) {
      const handlers = new Map();
      const record = { frame: bound, channels: [...channels], handlers, closed: false };
      listeners.push(record);
      return {
        on(channel, handler) { handlers.set(channel, handler); return () => handlers.delete(channel); },
        setChannels(next) { record.channels = [...next]; },
        close() { record.closed = true; },
      };
    },
    emit(record, channel, name, data) {
      record.handlers.get(channel)?.({
        channel, name, data,
        source: { subsystemKey: "base", domainId: "domain", targetKey: "game-controls-input" },
      });
    },
  };
}

test("root ABI stays exact and subsystem is a separate public surface", async () => {
  const root = await import("@loomrealm-game/common-controls");
  const subsystem = await import("@loomrealm-game/common-controls/subsystem");
  assert.deepEqual(Object.keys(root).sort(), [...ROOT_VALUES].sort());
  for (const name of ["createControlsConsumer", "createDirectionalControlsTracker", "ControlsConsumer", "DirectionalControlsTracker"]) {
    assert.equal(Object.hasOwn(root, name), false);
  }
  assert.deepEqual(Object.keys(subsystem).sort(), ["createControlsConsumer", "createDirectionalControlsTracker"]);
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(pkg.dependencies["@loomrealm/subsystem"], "0.1.0-alpha.0");
  assert.equal(pkg.dependencies["@loomrealm-game/map"], undefined);
  assert.equal(pkg.dependencies["@loomrealm-game/rpg-dialogue"], undefined);
  assert.deepEqual(pkg.exports["./subsystem"], { types: "./dist/subsystem.d.ts", import: "./dist/subsystem.js" });
  const index = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");
  assert.equal(index.includes("subsystem"), false);
  assert.equal(index.includes("createControlsConsumer"), false);
  const consumer = readFileSync(new URL("../src/consumer.ts", import.meta.url), "utf8");
  assert.equal(consumer.includes("activationId"), false);
  assert.equal(consumer.includes("@loomrealm-game/map"), false);
  assert.equal(consumer.includes("rpg-dialogue"), false);
});

test("consumer subscribes only requested channels and starts from neutral state", () => {
  const bus = presentation();
  const bound = frame();
  const states = [];
  const consumer = createControlsConsumer(bus, bound, { onState: (state) => { states.push(state.down); } });
  assert.deepEqual(bus.listeners[0].channels, ["controls.state"]);
  assert.deepEqual(states, [[]]);
  assert.equal(states[0], EMPTY_CONTROLS_STATE_V1.down);
  bus.emit(bus.listeners[0], "controls.state", "input.state", { down: ["right", "south"] });
  assert.deepEqual(states, [[], ["right", "south"]]);
  consumer.close();
});

test("event-only consumer does not create a state subscription or replay events", () => {
  const bus = presentation();
  const events = [];
  createControlsConsumer(bus, frame(), { onEvent: (event) => { events.push(event.button); } });
  assert.deepEqual(bus.listeners[0].channels, ["controls.event"]);
  assert.deepEqual(events, []);
  bus.emit(bus.listeners[0], "controls.event", "input.event", { action: "down", button: "south", repeat: false });
  assert.deepEqual(events, ["south"]);
});

test("malformed controls payloads fail closed without polluting state or handlers", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const bus = presentation();
  const states = [];
  const events = [];
  createControlsConsumer(bus, frame(), {
    onState: (state) => { states.push([...state.down]); },
    onEvent: (event) => { events.push(event.button); },
  });
  const record = bus.listeners[0];
  bus.emit(record, "controls.state", "input.state", { down: ["up"] });
  bus.emit(record, "controls.state", "input.state", { down: ["left", "up"] });
  bus.emit(record, "controls.state", "input.state", { down: ["up", "up"] });
  bus.emit(record, "controls.state", "input.state", { down: ["nope"] });
  bus.emit(record, "controls.state", "other", { down: ["down"] });
  bus.emit(record, "controls.state", "input.state", null);
  bus.emit(record, "controls.state", "input.state", { down: ["down"], extra: true });
  bus.emit(record, "controls.event", "input.event", { action: "down", button: "south", repeat: false, extra: 1 });
  bus.emit(record, "controls.event", "input.event", { action: "hold", button: "south", repeat: false });
  bus.emit(record, "controls.event", "input.event", { action: "down", button: "south", repeat: "false" });
  bus.emit(record, "controls.event", "other", { action: "down", button: "east", repeat: false });
  assert.deepEqual(states, [[], ["up"]]);
  assert.deepEqual(events, []);
  t.mock.timers.tick(2499);
  assert.deepEqual(states, [[], ["up"]]);
  t.mock.timers.tick(1);
  assert.deepEqual(states.at(-1), []);
});

test("canonical stale fallback uses 2500ms and malformed input does not reset it", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const bus = presentation();
  const states = [];
  createControlsConsumer(bus, frame(), { onState: (state) => { states.push([...state.down]); } });
  bus.emit(bus.listeners[0], "controls.state", "input.state", { down: ["up"] });
  t.mock.timers.tick(1000);
  bus.emit(bus.listeners[0], "controls.state", "input.state", { down: ["not-a-button"] });
  t.mock.timers.tick(1499);
  assert.deepEqual(states, [[], ["up"]]);
  t.mock.timers.tick(1);
  assert.deepEqual(states.at(-1), []);
});

test("callback throw and rejection stay local and do not block later delivery", async () => {
  const unhandled = [];
  const onUnhandled = (error) => { unhandled.push(error); };
  process.on("unhandledRejection", onUnhandled);
  try {
    const bus = presentation();
    const states = [];
    const events = [];
    let pending;
    createControlsConsumer(bus, frame(), {
      onState: (state) => {
        states.push([...state.down]);
        if (states.length === 1) throw new Error("initial");
        if (state.down[0] === "up") return Promise.reject(new Error("state"));
        if (state.down[0] === "down") pending = new Promise(() => {});
        return pending;
      },
      onEvent: () => { events.push("event"); throw new Error("event"); },
    });
    const record = bus.listeners[0];
    bus.emit(record, "controls.state", "input.state", { down: ["up"] });
    bus.emit(record, "controls.event", "input.event", { action: "down", button: "south", repeat: false });
    bus.emit(record, "controls.state", "input.state", { down: ["down"] });
    bus.emit(record, "controls.state", "input.state", { down: ["left"] });
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(states, [[], ["up"], ["down"], ["left"]]);
    assert.deepEqual(events, ["event"]);
    assert.deepEqual(unhandled, []);
  } finally {
    process.off("unhandledRejection", onUnhandled);
  }
});

test("close is idempotent and a terminal frame abort stops delivery", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const bus = presentation();
  const bound = frame();
  const states = [];
  const consumer = createControlsConsumer(bus, bound, { onState: (state) => { states.push([...state.down]); } });
  bus.emit(bus.listeners[0], "controls.state", "input.state", { down: ["up"] });
  consumer.close();
  consumer.close();
  bus.emit(bus.listeners[0], "controls.state", "input.state", { down: ["down"] });
  t.mock.timers.tick(2500);
  assert.equal(bus.listeners[0].closed, true);
  assert.deepEqual(states, [[], ["up"]]);

  const aborted = presentation();
  const ending = frame();
  const later = [];
  createControlsConsumer(aborted, ending, { onState: (state) => { later.push([...state.down]); } });
  ending.abort();
  aborted.emit(aborted.listeners[0], "controls.state", "input.state", { down: ["right"] });
  assert.equal(aborted.listeners[0].closed, true);
  assert.deepEqual(later, [[]]);
});

test("an already aborted frame does not deliver a baseline", () => {
  const bus = presentation();
  const bound = frame();
  bound.abort();
  const states = [];
  createControlsConsumer(bus, bound, { onState: (state) => { states.push(state); } });
  assert.equal(bus.listeners[0].closed, true);
  assert.deepEqual(states, []);
});

test("a fresh activation consumer starts neutral and ignores the closed activation", () => {
  const bus = presentation();
  const firstFrame = frame();
  const first = [];
  const retired = createControlsConsumer(bus, firstFrame, { onState: (state) => { first.push([...state.down]); } });
  bus.emit(bus.listeners[0], "controls.state", "input.state", { down: ["up"] });
  retired.close();
  const second = [];
  createControlsConsumer(bus, frame(), {
    onState: (state) => { second.push([...state.down]); },
    onEvent: () => { second.push("event"); },
  });
  bus.emit(bus.listeners[0], "controls.state", "input.state", { down: ["left"] });
  bus.emit(bus.listeners[1], "controls.event", "input.event", { action: "down", button: "south", repeat: false });
  assert.deepEqual(first, [[], ["up"]]);
  assert.deepEqual(second, [[], "event"]);
});

test("directional tracker uses state as truth and events as last-pressed recency", () => {
  const tracker = createDirectionalControlsTracker();
  assert.equal(tracker.direction, null);
  tracker.acceptState({ down: ["up"] });
  assert.equal(tracker.direction, "up");
  tracker.acceptState({ down: [] });
  assert.equal(tracker.direction, null);
  tracker.acceptState({ down: ["down"] });
  tracker.acceptState({ down: ["down", "right"] });
  tracker.acceptEvent({ action: "down", button: "right", repeat: false });
  assert.equal(tracker.direction, "right");
  tracker.acceptEvent({ action: "down", button: "down", repeat: false });
  assert.equal(tracker.direction, "down");
  tracker.acceptEvent({ action: "down", button: "down", repeat: true });
  assert.equal(tracker.direction, "down");
  tracker.acceptEvent({ action: "up", button: "down", repeat: false });
  assert.equal(tracker.direction, "right");
  tracker.acceptEvent({ action: "down", button: "left", repeat: false });
  assert.equal(tracker.direction, "right");
  tracker.acceptState({ down: ["left"] });
  assert.equal(tracker.direction, "left");
  tracker.acceptEvent({ action: "down", button: "south", repeat: false });
  tracker.acceptState({ down: ["south"] });
  assert.equal(tracker.direction, null);
  const simultaneous = createDirectionalControlsTracker();
  simultaneous.acceptState({ down: ["right", "up", "left"] });
  assert.equal(simultaneous.direction, "right");
  simultaneous.reset();
  assert.equal(simultaneous.direction, null);
});
