import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PresentationFrameGate } from "../../packages/renderer/dist/internal/presentation-frame-gate.js";
import { PresentationEventManager } from "../../packages/subsystem/dist/internal/presentation-event-manager.js";
import * as publicApi from "@loomrealm-game/common-controls";
import {
  CONTROLS_BUTTONS_V1, CONTROLS_INPUT_CHANNELS, CONTROLS_STATE_REFRESH_MS, CONTROLS_STATE_STALE_MS,
  DEVICE_INPUT_CHANNELS, EMPTY_CONTROLS_STATE_V1, createFreshControlsStateTracker, createFreshDeviceStateTracker,
} from "@loomrealm-game/common-controls";
import {
  controlsButtonFromGamepadIndex, controlsButtonFromKeyboardCode, createControlsMachine, gamepadControlPressed,
} from "../../game-libs/game-common-controls/dist/controls-machine.js";

const root = new URL("../../", import.meta.url);
const source = (path) => readFile(new URL(path, root), "utf8");
const turn = () => new Promise((resolve) => setImmediate(resolve));

test("unified controls ABI is exact and raw device channels stay closed", () => {
  assert.deepEqual([...DEVICE_INPUT_CHANNELS], [
    "keyboard.state", "keyboard.event", "pointer.state", "pointer.event", "gamepad.state", "gamepad.event",
  ]);
  assert.deepEqual([...CONTROLS_INPUT_CHANNELS], ["controls.state", "controls.event"]);
  assert.deepEqual([...CONTROLS_BUTTONS_V1], [
    "up", "down", "left", "right", "south", "east", "west", "north",
    "leftBumper", "rightBumper", "leftTrigger", "rightTrigger", "start", "select",
  ]);
  assert.equal(CONTROLS_STATE_REFRESH_MS, 1000);
  assert.equal(CONTROLS_STATE_STALE_MS, 2500);
  assert.deepEqual(EMPTY_CONTROLS_STATE_V1, { down: [] });
  assert.equal(Object.isFrozen(EMPTY_CONTROLS_STATE_V1), true);
  assert.equal(Object.isFrozen(EMPTY_CONTROLS_STATE_V1.down), true);
  assert.equal(publicApi.createControlsMachine, undefined);
  assert.equal(typeof publicApi.createFreshControlsStateTracker, "function");
  assert.equal(typeof publicApi.createFreshDeviceStateTracker, "function");
});

test("raw fresh tracker still falls back to its own empty device State", async () => {
  const seen = [];
  const tracker = createFreshDeviceStateTracker("keyboard.state", (payload) => seen.push(payload), { staleAfterMs: 20 });
  tracker.accept({ down: ["KeyZ"] });
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.deepEqual(seen, [{ down: ["KeyZ"] }, { down: [] }]);
  tracker.close();
});

test("default controls fresh tracker falls back after 2500ms", async () => {
  const seen = [];
  const tracker = createFreshControlsStateTracker((payload) => seen.push(payload));
  tracker.accept({ down: ["north"] });
  await new Promise((resolve) => setTimeout(resolve, 2600));
  assert.deepEqual(seen, [{ down: ["north"] }, EMPTY_CONTROLS_STATE_V1]);
  tracker.close();
});

test("bundle collision guard names the fourth controls element and raw sources stay raw", async () => {
  const [bundle, keyboard, pointer, gamepad] = await Promise.all([
    source("game-libs/game-common-controls/dist/browser/device-input.browser.js"),
    source("game-libs/game-common-controls/browser/keyboard-source.ts"),
    source("game-libs/game-common-controls/browser/pointer-source.ts"),
    source("game-libs/game-common-controls/browser/gamepad-source.ts"),
  ]);
  assert.match(bundle, /game-keyboard-input/);
  assert.match(bundle, /game-pointer-input/);
  assert.match(bundle, /game-gamepad-input/);
  assert.match(bundle, /game-controls-input/);
  assert.match(bundle, /broadcast:\s*"top-frame"/);
  for (const raw of [keyboard, pointer, gamepad]) {
    assert.equal(raw.includes("controls.state"), false);
    assert.equal(raw.includes("top-frame"), false);
  }
});

test("missing exact Interest drops the controls edge and a later State reaches the new Activation", async () => {
  const sent = [];
  const peer = {
    binding: { subsystemKey: "game", generation: 1, dataProfile: "loomrealm.renderer-data/3" },
    viewport: { sendState: async () => ({ kind: "sent" }) },
    presentation: { sendEvent: async (message) => { sent.push(message); return { kind: "sent" }; } },
    terminal: new Promise(() => {}),
    close: async () => {},
  };
  const gate = new PresentationFrameGate(() => true);
  const snapshot = (activationId) => ({
    sessionId: "S", revision: 1, runtimes: [], dataAuthorities: [],
    stack: [{ frameId: "play", subsystemKey: "game", lifecycle: "active", activationId }],
  });
  const event = (activationId, channel, data) => ({
    sourceSessionId: "S", sourceSubsystemKey: "world", sourceGeneration: 1, sourcePeer: peer,
    targetSubsystemKey: "game", targetPeer: peer, frameId: "play", activationId,
    channel, name: channel === "controls.state" ? "input.state" : "input.event",
    domainId: "hud", targetKey: "controls", data,
  });
  gate.setControl(snapshot("a1"));
  gate.installData("game", peer);
  gate.offer(event("a1", "controls.event", { action: "down", button: "south", repeat: false }));
  await turn();
  assert.equal(sent.length, 0);
  gate.replaceInterest("game", peer, { type: "presentation.interest", frames: [{ frameId: "play", channels: ["controls.state", "controls.event"] }] });
  gate.setControl(snapshot("a2"));
  gate.offer(event("a1", "controls.event", { action: "down", button: "south", repeat: false }));
  await turn();
  assert.equal(sent.length, 0);
  gate.offer(event("a2", "controls.state", { down: ["south"] }));
  await turn();
  assert.equal(sent.length, 1);
  assert.equal(sent[0].activationId, "a2");
  assert.equal(sent[0].channel, "controls.state");
  assert.deepEqual(sent[0].data, { down: ["south"] });

  const manager = new PresentationEventManager();
  const views = new WeakMap();
  const byId = new Map();
  manager.bindRuntime({
    inspect(frame) { return views.get(frame) ?? { kind: "foreign" }; },
    inspectById(frameId) { return byId.get(frameId) ?? null; },
  });
  const frame = Object.freeze({ id: "play", params: null, signal: new AbortController().signal, call: async () => ({ type: "cancelled" }) });
  const view = { kind: "live", frameId: "play", activationId: "a2", deliveryOpen: true };
  views.set(frame, view);
  byId.set("play", view);
  const seen = [];
  const listener = manager.createListener({ frame, channels: ["controls.state", "controls.event"] });
  listener.on("controls.event", (entry) => seen.push(entry.activationId ?? entry.channel));
  listener.on("controls.state", (entry) => seen.push(entry.data.down));
  manager.onEvent({ ...sent[0], type: "presentation.event", activationId: "a1", channel: "controls.event", name: "input.event", data: { action: "down", button: "south", repeat: false }, sourceSubsystemKey: "world", domainId: "hud", targetKey: "controls", frameId: "play" });
  manager.onEvent(sent[0]);
  assert.deepEqual(seen, [["south"]]);
});

function readyMachine() {
  const machine = createControlsMachine();
  machine.setWindowUsable(true);
  machine.setKeyboardCapture(true);
  return machine;
}

function published(publication) {
  return {
    state: publication.state?.down ?? null,
    events: publication.events.map((event) => [event.action, event.button, event.repeat]),
  };
}

test("physical edges, baseline, and reconciliation stay distinct for the 14 controls", () => {
  const keyboard = [
    ["ArrowUp", "up"], ["ArrowDown", "down"], ["ArrowLeft", "left"], ["ArrowRight", "right"],
    ["KeyZ", "south"], ["KeyX", "east"], ["KeyC", "west"], ["KeyV", "north"],
    ["KeyQ", "leftBumper"], ["KeyE", "rightBumper"], ["ShiftLeft", "leftTrigger"], ["ControlLeft", "rightTrigger"],
    ["Enter", "start"], ["Tab", "select"],
  ];
  assert.deepEqual(keyboard.map(([code]) => controlsButtonFromKeyboardCode(code)), [...CONTROLS_BUTTONS_V1]);
  assert.equal(controlsButtonFromKeyboardCode("KeyA"), null);
  const gamepad = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 12, 13, 14, 15].map((index) => controlsButtonFromGamepadIndex(index));
  assert.deepEqual(gamepad, [
    "south", "east", "west", "north", "leftBumper", "rightBumper", "leftTrigger", "rightTrigger",
    "select", "start", "up", "down", "left", "right",
  ]);
  for (const index of [10, 11, 16]) assert.equal(controlsButtonFromGamepadIndex(index), null);
  assert.equal(gamepadControlPressed(0.5), true);
  assert.equal(gamepadControlPressed(0.4), false);

  const machine = readyMachine();
  assert.deepEqual(published(machine.keydown("south", false)), { state: ["south"], events: [["down", "south", false]] });
  assert.deepEqual(published(machine.applyGamepadFrame([{ index: 0, pressed: ["south"] }])), { state: null, events: [] });
  assert.deepEqual(published(machine.keyup("south")), { state: null, events: [] });
  assert.deepEqual(published(machine.applyGamepadFrame([{ index: 0, pressed: [] }])), {
    state: [], events: [["up", "south", false]],
  });
  assert.deepEqual(published(machine.applyGamepadFrame([{ index: 1, pressed: ["up", "start"] }])), {
    state: ["up", "start"], events: [],
  });
  assert.deepEqual(published(machine.applyGamepadFrame([
    { index: 1, pressed: ["up", "start"] },
    { index: 2, pressed: ["up"] },
  ])), { state: null, events: [] });
  assert.deepEqual(published(machine.applyGamepadFrame([])), {
    state: [], events: [["up", "up", false], ["up", "start", false]],
  });

  assert.deepEqual(published(machine.keydown("left", false)), { state: ["left"], events: [["down", "left", false]] });
  assert.deepEqual(published(machine.setWindowUsable(false)), { state: [], events: [] });
  assert.deepEqual(published(machine.setWindowUsable(true, [{ index: 0, pressed: ["east"] }])), {
    state: ["east"], events: [],
  });
  machine.setKeyboardCapture(true);
  assert.deepEqual(published(machine.keydown("west", false)), { state: ["east", "west"], events: [["down", "west", false]] });
  assert.deepEqual(published(machine.setKeyboardCapture(false)), { state: ["east"], events: [] });
  assert.deepEqual(published(machine.keydown("west", false)), { state: null, events: [] });
  assert.deepEqual(published(machine.setKeyboardCapture(true)), { state: null, events: [] });
  assert.deepEqual(published(machine.keydown("west", true)), { state: ["east", "west"], events: [["down", "west", false]] });
  assert.deepEqual(published(machine.keydown("west", true)), { state: null, events: [["down", "west", true]] });
  assert.deepEqual(published(machine.applyGamepadFrame([{ index: 0, pressed: ["east", "west"] }])), { state: null, events: [] });
  assert.deepEqual(published(machine.keydown("west", true)), { state: null, events: [] });
});

test("controls element publishes top-frame on its own duplicate key and keeps capture local", async () => {
  const [element, capture] = await Promise.all([
    source("game-libs/game-common-controls/browser/device-input.browser.ts"),
    source("game-libs/game-common-controls/browser/controls-source.ts"),
  ]);
  assert.match(element, /customElements\.define\("game-controls-input"/);
  assert.match(element, /registry\.get\("controls"\)/);
  assert.match(element, /data-input-disabled", "duplicate"/);
  assert.match(element, /broadcast: "top-frame", channel: "controls\.state"/);
  assert.match(element, /broadcast: "top-frame", channel: "controls\.event"/);
  assert.equal(element.includes("input.reset"), false);
  assert.match(capture, /queueMicrotask\(reconcile\)/);
  assert.match(capture, /event\.isTrusted !== true/);
  assert.match(capture, /event\.preventDefault\(\)/);
  assert.match(capture, /mapping !== "standard"/);
  for (const token of ["HTMLInputElement", "HTMLTextAreaElement", "HTMLSelectElement", "HTMLButtonElement", "HTMLAnchorElement", "isContentEditable"]) {
    assert.equal(capture.includes(token), true, token);
  }
});
