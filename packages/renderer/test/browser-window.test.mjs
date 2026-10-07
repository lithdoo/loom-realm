import assert from "node:assert/strict";
import test from "node:test";
import { KEYBOARD_CODES_V1 } from "@loomrealm/data";
import { validateInputEvent, validateInputState } from "../../data/dist/input-codec.js";
import {
  createBrowserRendererInputSource,
  createBrowserRendererViewportSource,
} from "../dist/browser-window.js";

class Events {
  listeners = new Map();
  addEventListener = (name, listener) => {
    const values = this.listeners.get(name) ?? new Set();
    values.add(listener);
    this.listeners.set(name, values);
  };
  removeEventListener = (name, listener) => this.listeners.get(name)?.delete(listener);
  dispatch(name, event = {}) {
    for (const listener of this.listeners.get(name) ?? []) listener({ type: name, ...event });
  }
}

function standardPad(index, options = {}) {
  const values = options.values ?? Array(17).fill(0);
  return {
    index,
    connected: options.connected ?? true,
    mapping: options.mapping ?? "standard",
    axes: options.axes ?? [0, 0, 0, 0],
    buttons: values.map((value) => ({ value })),
  };
}

function fakeWindow() {
  const events = new Events();
  const document = new Events();
  document.visibilityState = "visible";
  document.focused = true;
  document.hasFocus = () => document.focused;
  let pads = [standardPad(7)];
  let nextFrame = 0;
  const frames = new Map();
  return {
    ...events,
    document,
    innerWidth: 200,
    innerHeight: 100,
    navigator: { getGamepads: () => pads },
    performance: { now: () => 123 },
    requestAnimationFrame(callback) { const id = ++nextFrame; frames.set(id, callback); return id; },
    cancelAnimationFrame(id) { frames.delete(id); },
    dispatch: events.dispatch.bind(events),
    setPads(value) { pads = value; },
    runFrame() { const pending = [...frames.values()]; frames.clear(); for (const callback of pending) callback(0); },
  };
}

function assertCodec(change) {
  if (change.kind === "state") {
    assert.deepEqual(validateInputState({
      type: "input.state", frameId: "root", activationId: "a1",
      channel: change.channel, payload: change.payload,
    }).payload, change.payload);
  } else if (change.kind === "event") {
    assert.deepEqual(validateInputEvent({
      type: "input.event", frameId: "root", activationId: "a1",
      channel: change.channel, payload: change.payload,
    }).payload, change.payload);
  }
}

test("shared browser input realizes every Keyboard code and focus/visibility reset through the Input v1 codec", () => {
  const window = fakeWindow();
  const changes = [];
  const captures = [];
  const source = createBrowserRendererInputSource(window, { onKeyboardCapture: (code, at) => captures.push([code, at]) });
  const stop = source.start((change) => { assertCodec(change); changes.push(change); });
  for (const code of KEYBOARD_CODES_V1) {
    window.dispatch("keydown", { isTrusted: true, code, repeat: false });
    window.dispatch("keydown", { isTrusted: true, code, repeat: false });
    window.dispatch("keyup", { isTrusted: true, code });
  }
  const events = changes.filter(({ kind, channel }) => kind === "event" && channel === "keyboard.event");
  assert.equal(events.length, KEYBOARD_CODES_V1.length * 3);
  for (let index = 0; index < events.length; index += 3) {
    assert.equal(events[index].payload.repeat, false);
    assert.equal(events[index + 1].payload.repeat, true);
    assert.equal(events[index + 2].payload.action, "up");
  }
  assert.equal(captures.length, KEYBOARD_CODES_V1.length);

  window.dispatch("keydown", { isTrusted: true, code: "KeyA" });
  window.document.focused = false;
  window.dispatch("blur");
  assert.deepEqual(changes.filter(({ kind, channel }) => kind === "state" && channel === "keyboard.state").at(-1).payload, { down: [] });
  assert.deepEqual(changes.filter(({ kind }) => kind === "availability").slice(-6).map(({ available }) => available), [false, false, false, false, false, false]);
  window.document.focused = true;
  window.document.visibilityState = "hidden";
  window.dispatch("focus");
  assert.equal(changes.filter(({ kind }) => kind === "availability").at(-1).available, false);
  window.document.visibilityState = "visible";
  window.document.dispatch("visibilitychange");
  assert.equal(changes.filter(({ kind }) => kind === "availability").at(-1).available, true);
  stop();
});

test("shared browser input canonicalizes pointer ids, buttons, cancellation, multipointer, and surface loss", () => {
  const window = fakeWindow();
  const changes = [];
  const stop = createBrowserRendererInputSource(window).start((change) => { assertCodec(change); changes.push(change); });
  window.dispatch("pointerdown", { isTrusted: true, pointerType: "mouse", pointerId: 99, clientX: 100, clientY: 25, buttons: 31 });
  const down = changes.filter(({ kind, channel }) => kind === "event" && channel === "pointer.event").slice(-5);
  assert.deepEqual(down.map(({ payload }) => payload.button), ["primary", "auxiliary", "secondary", "back", "forward"]);
  assert.deepEqual(down[0].payload.pointer, {
    pointerId: 1, kind: "mouse", x: 500_000, y: 250_000,
    buttons: ["primary", "auxiliary", "secondary", "back", "forward"],
  });
  window.dispatch("pointerdown", { isTrusted: true, pointerType: "touch", pointerId: 4, clientX: 25, clientY: 50, buttons: 1 });
  assert.deepEqual(changes.filter(({ kind, channel }) => kind === "state" && channel === "pointer.state").at(-1).payload.pointers.map(({ pointerId }) => pointerId), [1, 2]);
  window.dispatch("pointercancel", { isTrusted: true, pointerType: "touch", pointerId: 4, clientX: 20, clientY: 30, buttons: 1 });
  assert.deepEqual(changes.filter(({ kind, channel }) => kind === "event" && channel === "pointer.event").at(-1).payload, {
    action: "cancel",
    pointer: { pointerId: 2, kind: "touch", x: 100_000, y: 300_000, buttons: [] },
    button: null,
  });
  window.dispatch("pointerup", { isTrusted: true, pointerType: "mouse", pointerId: 99, clientX: -20, clientY: 120, buttons: 0 });
  assert.deepEqual(changes.filter(({ kind, channel }) => kind === "event" && channel === "pointer.event").slice(-5).map(({ payload }) => payload.button), ["primary", "auxiliary", "secondary", "back", "forward"]);
  window.innerWidth = 0;
  window.dispatch("resize");
  assert.deepEqual(changes.filter(({ kind }) => kind === "availability").slice(-2), [
    { kind: "availability", channel: "pointer.state", available: false },
    { kind: "availability", channel: "pointer.event", available: false },
  ]);
  stop();
});

test("shared browser input maps standard gamepads, threshold crossings, disconnect, and reset through the codec", () => {
  const window = fakeWindow();
  const changes = [];
  const stop = createBrowserRendererInputSource(window).start((change) => { assertCodec(change); changes.push(change); });
  const values = Array(17).fill(0);
  values[0] = 0.5;
  values[16] = 1;
  window.setPads([standardPad(7, { values, axes: [-1, -0.25, 0.5, 2] })]);
  window.runFrame();
  const state = changes.filter(({ kind, channel }) => kind === "state" && channel === "gamepad.state").at(-1).payload.gamepads[0];
  assert.deepEqual(state.axes, { leftX: -1_000_000, leftY: -250_000, rightX: 500_000, rightY: 1_000_000 });
  assert.equal(state.buttons.south, 500_000);
  assert.equal(state.buttons.home, 1_000_000);
  assert.deepEqual(changes.filter(({ kind, channel }) => kind === "event" && channel === "gamepad.event").slice(-2).map(({ payload }) => [payload.button, payload.action]), [["south", "down"], ["home", "down"]]);
  values[0] = 0.499999;
  window.setPads([standardPad(7, { values })]);
  window.runFrame();
  assert.deepEqual(changes.filter(({ kind, channel }) => kind === "event" && channel === "gamepad.event").at(-1).payload, { action: "up", gamepadId: 1, button: "south", value: 499_999 });
  window.setPads([]);
  window.runFrame();
  assert.deepEqual(changes.filter(({ kind, channel }) => kind === "state" && channel === "gamepad.state").at(-1).payload, { gamepads: [] });
  window.setPads([standardPad(7)]);
  window.runFrame();
  assert.equal(changes.filter(({ kind, channel }) => kind === "state" && channel === "gamepad.state").at(-1).payload.gamepads[0].gamepadId, 2);
  window.document.focused = false;
  window.dispatch("blur");
  assert.deepEqual(changes.filter(({ kind, channel }) => kind === "state" && channel === "gamepad.state").at(-1).payload, { gamepads: [] });
  stop();
});

test("shared browser viewport preserves layout viewport semantics and coalesces resize", () => {
  const window = fakeWindow();
  window.innerWidth = 640.5;
  window.innerHeight = 480.25;
  const samples = [];
  const stop = createBrowserRendererViewportSource(window).start((sample) => samples.push(sample));
  assert.deepEqual(samples, [{ width: 640.5, height: 480.25 }]);
  window.innerWidth = 800;
  window.dispatch("resize");
  window.innerWidth = 900;
  window.dispatch("resize");
  window.runFrame();
  assert.deepEqual(samples.at(-1), { width: 900, height: 480.25 });
  window.document.visibilityState = "hidden";
  window.document.dispatch("visibilitychange");
  assert.equal(samples.length, 2);
  window.document.visibilityState = "visible";
  window.document.dispatch("visibilitychange");
  assert.equal(samples.length, 3);
  stop();
});
