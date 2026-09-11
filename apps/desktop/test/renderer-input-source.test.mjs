import assert from "node:assert/strict";
import test from "node:test";
import { createDesktopRendererInputSource } from "../dist/renderer-input-source.js";

class Events {
  listeners = new Map();
  addEventListener = (name, listener) => {
    const values = this.listeners.get(name) ?? new Set(); values.add(listener); this.listeners.set(name, values);
  };
  removeEventListener = (name, listener) => this.listeners.get(name)?.delete(listener);
  dispatch(name, event = {}) { for (const listener of this.listeners.get(name) ?? []) listener({ type: name, ...event }); }
}

function standardPad(index, south = 0) {
  return { index, connected: true, mapping: "standard", axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, (_, button) => ({ value: button === 0 ? south : 0 })) };
}

function fakeWindow() {
  const events = new Events();
  const document = new Events();
  document.visibilityState = "visible";
  document.focused = true;
  document.hasFocus = () => document.focused;
  let pads = [standardPad(0)];
  let nextFrame = 0;
  const frames = new Map();
  return {
    ...events,
    document,
    innerWidth: 100,
    innerHeight: 100,
    navigator: { getGamepads: () => pads },
    requestAnimationFrame(callback) { const id = ++nextFrame; frames.set(id, callback); return id; },
    cancelAnimationFrame(id) { frames.delete(id); },
    dispatch: events.dispatch.bind(events),
    setPads(value) { pads = value; },
    runFrame() { const pending = [...frames.values()]; frames.clear(); for (const callback of pending) callback(0); },
  };
}

test("Desktop input source preserves trust, State-before-Event and physical mappings", () => {
  const window = fakeWindow();
  const changes = [];
  const source = createDesktopRendererInputSource(window);
  const stop = source.start((change) => changes.push(change));
  assert.throws(() => source.start(() => {}), /already started/);

  const gamepadStateIndex = changes.findIndex((change) => change.kind === "state" && change.channel === "gamepad.state");
  const gamepadAvailableIndex = changes.findIndex((change) => change.kind === "availability" && change.channel === "gamepad.state" && change.available);
  assert.ok(gamepadStateIndex >= 0 && gamepadStateIndex < gamepadAvailableIndex);
  assert.equal(changes[gamepadStateIndex].payload.gamepads[0].gamepadId, 1);

  let before = changes.length;
  window.dispatch("keydown", { isTrusted: false, code: "ArrowRight" });
  assert.equal(changes.length, before);
  window.dispatch("keydown", { isTrusted: true, code: "ArrowRight" });
  assert.deepEqual(changes.slice(-2).map(({ kind, channel }) => [kind, channel]), [["state", "keyboard.state"], ["event", "keyboard.event"]]);
  assert.deepEqual(changes.at(-1).payload, { action: "down", code: "ArrowRight", repeat: false });
  window.dispatch("keydown", { isTrusted: true, code: "ArrowRight" });
  assert.deepEqual(changes.at(-1).payload, { action: "down", code: "ArrowRight", repeat: true });

  before = changes.length;
  window.dispatch("pointerdown", { isTrusted: false, pointerType: "mouse", pointerId: 4, clientX: 50, clientY: 25, buttons: 1 });
  assert.equal(changes.length, before);
  window.dispatch("pointerdown", { isTrusted: true, pointerType: "mouse", pointerId: 4, clientX: 50, clientY: 25, buttons: 1 });
  assert.deepEqual(changes.slice(-2).map(({ kind, channel }) => [kind, channel]), [["state", "pointer.state"], ["event", "pointer.event"]]);
  assert.deepEqual(changes.at(-1).payload.pointer, { pointerId: 1, kind: "mouse", x: 500_000, y: 250_000, buttons: ["primary"] });
  window.dispatch("pointermove", { isTrusted: true, pointerType: "mouse", pointerId: 4, clientX: 60, clientY: 30, buttons: 3 });
  assert.deepEqual(changes.at(-1).payload, { action: "down", pointer: { pointerId: 1, kind: "mouse", x: 600_000, y: 300_000, buttons: ["primary", "secondary"] }, button: "secondary" });
  window.dispatch("pointerup", { isTrusted: true, pointerType: "mouse", pointerId: 4, clientX: 60, clientY: 30, buttons: 0 });
  assert.deepEqual(changes.slice(-2).map((change) => change.payload.button), ["primary", "secondary"]);

  window.setPads([standardPad(0, 0.6)]);
  window.runFrame();
  assert.deepEqual(changes.slice(-2).map(({ kind, channel }) => [kind, channel]), [["state", "gamepad.state"], ["event", "gamepad.event"]]);
  assert.deepEqual(changes.at(-1).payload, { action: "down", gamepadId: 1, button: "south", value: 600_000 });
  window.setPads([]); window.runFrame();
  window.setPads([standardPad(0)]); window.runFrame();
  assert.equal(changes.filter((change) => change.kind === "state" && change.channel === "gamepad.state").at(-1).payload.gamepads[0].gamepadId, 2);

  window.document.focused = false;
  window.dispatch("blur");
  assert.deepEqual(changes.filter((change) => change.kind === "availability").slice(-6).map(({ available }) => available), [false, false, false, false, false, false]);
  stop();
  assert.doesNotThrow(() => source.start(() => {})());
});
