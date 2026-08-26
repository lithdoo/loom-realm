import type { JsonObject } from "@loomrealm/wire";
import {
  KEYBOARD_CODES_V1,
  type InputChannelV1,
  type InputEventV1,
  type InputInterestV1,
  type InputResetV1,
  type InputStateV1,
} from "./model.js";
import {
  array,
  assertPayload,
  boundedString,
  exact,
  fail,
  int32,
  object,
  positiveSafe,
  stringValue,
  utf8LexicalLess,
} from "./validation-common.js";

const STANDARD_CHANNELS = new Set([
  "keyboard.state",
  "keyboard.event",
  "pointer.state",
  "pointer.event",
  "gamepad.state",
  "gamepad.event",
]);
const CUSTOM = /^x\.[a-z][a-z0-9-]{0,31}(?:\.[a-z][a-z0-9-]{0,31})*\.(?:state|event)$/;
const KEYBOARD_CODE_SET = new Set<string>(KEYBOARD_CODES_V1);
const POINTER_BUTTONS = ["primary", "auxiliary", "secondary", "back", "forward"] as const;
const GP_BUTTONS = [
  "south", "east", "west", "north",
  "leftBumper", "rightBumper", "leftTrigger", "rightTrigger",
  "select", "start", "leftStick", "rightStick",
  "dpadUp", "dpadDown", "dpadLeft", "dpadRight", "home",
] as const;

function channel(value: unknown, expected: "state" | "event" | "any"): InputChannelV1 {
  const text = boundedString(value, "input", "channel", 1, 128);
  if (!/^[\x00-\x7f]+$/.test(text)) fail("input", "channel must be ASCII");
  if (!STANDARD_CHANNELS.has(text) && !CUSTOM.test(text)) fail("input", "invalid channel grammar");
  if (expected !== "any" && !text.endsWith(`.${expected}`)) {
    fail("input", `channel suffix must be .${expected}`);
  }
  return text as InputChannelV1;
}

function keyboardPayload(payload: JsonObject, event: boolean): void {
  if (!event) {
    const p = exact(payload, ["down"], [], "input");
    const down = array(p.down, "input", "down");
    if (down.length > 128) fail("input", "keyboard down limit");
    const seen = new Set<string>();
    let prev = "";
    for (const raw of down) {
      const code = stringValue(raw, "input", "code");
      if (!KEYBOARD_CODE_SET.has(code) || seen.has(code) || (prev && prev >= code)) {
        fail("input", "invalid keyboard state");
      }
      seen.add(code);
      prev = code;
    }
    return;
  }
  const p = exact(payload, ["action", "code", "repeat"], [], "input");
  if (p.action !== "down" && p.action !== "up") fail("input", "invalid keyboard action");
  if (typeof p.code !== "string" || !KEYBOARD_CODE_SET.has(p.code)) {
    fail("input", "invalid keyboard code");
  }
  if (typeof p.repeat !== "boolean" || (p.action === "up" && p.repeat)) {
    fail("input", "invalid keyboard repeat");
  }
}

function pointerSample(raw: unknown): void {
  const p = exact(raw, ["pointerId", "kind", "x", "y", "buttons"], [], "input");
  positiveSafe(p.pointerId, "input", "pointerId");
  if (p.kind !== "mouse" && p.kind !== "touch" && p.kind !== "pen") {
    fail("input", "invalid pointer kind");
  }
  int32(p.x, "input", "x");
  int32(p.y, "input", "y");
  const buttons = array(p.buttons, "input", "buttons");
  let last = -1;
  const seen = new Set<string>();
  for (const b of buttons) {
    if (typeof b !== "string") fail("input", "invalid pointer button");
    const idx = POINTER_BUTTONS.indexOf(b as (typeof POINTER_BUTTONS)[number]);
    if (idx < 0 || idx <= last || seen.has(b)) fail("input", "invalid pointer button order");
    seen.add(b);
    last = idx;
  }
}

function pointerPayload(payload: JsonObject, event: boolean): void {
  if (!event) {
    const p = exact(payload, ["pointers"], [], "input");
    const list = array(p.pointers, "input", "pointers");
    if (list.length > 32) fail("input", "pointer count limit");
    let prev = 0;
    const ids = new Set<number>();
    for (const item of list) {
      pointerSample(item);
      const id = (item as JsonObject).pointerId as number;
      if (ids.has(id) || id <= prev) fail("input", "pointer ids not ascending unique");
      ids.add(id);
      prev = id;
    }
    return;
  }
  const p = exact(payload, ["action", "pointer", "button"], [], "input");
  if (p.action !== "down" && p.action !== "up" && p.action !== "cancel") {
    fail("input", "invalid pointer action");
  }
  pointerSample(p.pointer);
  if (p.action === "cancel") {
    if (p.button !== null) fail("input", "cancel button must be null");
  } else if (typeof p.button !== "string" || !POINTER_BUTTONS.includes(p.button as never)) {
    fail("input", "invalid pointer button");
  }
}

function rangedInt(value: unknown, min: number, max: number, label: string): void {
  if (!Number.isInteger(value) || (value as number) < min || (value as number) > max) {
    fail("input", `${label} out of range`);
  }
}

function gamepadSample(raw: unknown): void {
  const p = exact(raw, ["gamepadId", "axes", "buttons"], [], "input");
  positiveSafe(p.gamepadId, "input", "gamepadId");
  const axes = exact(p.axes, ["leftX", "leftY", "rightX", "rightY"], [], "input");
  for (const k of Object.keys(axes)) rangedInt(axes[k], -1_000_000, 1_000_000, `axis ${k}`);
  const buttons = exact(p.buttons, GP_BUTTONS, [], "input");
  for (const k of GP_BUTTONS) rangedInt(buttons[k], 0, 1_000_000, `button ${k}`);
}

function gamepadPayload(payload: JsonObject, event: boolean): void {
  if (!event) {
    const p = exact(payload, ["gamepads"], [], "input");
    const list = array(p.gamepads, "input", "gamepads");
    if (list.length > 16) fail("input", "gamepad count limit");
    let prev = 0;
    const ids = new Set<number>();
    for (const item of list) {
      gamepadSample(item);
      const id = (item as JsonObject).gamepadId as number;
      if (ids.has(id) || id <= prev) fail("input", "gamepad ids not ascending unique");
      ids.add(id);
      prev = id;
    }
    return;
  }
  const p = exact(payload, ["action", "gamepadId", "button", "value"], [], "input");
  if (p.action !== "down" && p.action !== "up") fail("input", "invalid gamepad action");
  positiveSafe(p.gamepadId, "input", "gamepadId");
  if (typeof p.button !== "string" || !GP_BUTTONS.includes(p.button as never)) {
    fail("input", "invalid gamepad button");
  }
  rangedInt(p.value, 0, 1_000_000, "gamepad value");
}

function standardPayload(ch: string, payload: JsonObject): void {
  if (ch === "keyboard.state") keyboardPayload(payload, false);
  else if (ch === "keyboard.event") keyboardPayload(payload, true);
  else if (ch === "pointer.state") pointerPayload(payload, false);
  else if (ch === "pointer.event") pointerPayload(payload, true);
  else if (ch === "gamepad.state") gamepadPayload(payload, false);
  else if (ch === "gamepad.event") gamepadPayload(payload, true);
}

export function validateInputInterest(raw: unknown): InputInterestV1 {
  const p = exact(raw, ["type", "frames"], [], "input");
  if (p.type !== "input.interest") fail("input", "wrong type");
  const frames = array(p.frames, "input", "frames");
  if (frames.length > 128) fail("input", "interest frame limit");
  const frameIds = new Set<string>();
  let previousFrameId: string | undefined;
  let pairs = 0;
  for (const item of frames) {
    const f = exact(item, ["frameId", "channels"], [], "input");
    const id = boundedString(f.frameId, "input", "frameId", 1, 128);
    if (frameIds.has(id)) fail("input", "duplicate frameId");
    if (previousFrameId !== undefined && !utf8LexicalLess(previousFrameId, id)) {
      fail("input", "interest frames are not in canonical order");
    }
    frameIds.add(id);
    previousFrameId = id;
    const channels = array(f.channels, "input", "channels");
    if (channels.length < 1 || channels.length > 64) fail("input", "channels per frame limit");
    const seen = new Set<string>();
    let previousChannel: string | undefined;
    for (const c of channels) {
      const ch = channel(c, "any");
      if (seen.has(ch)) fail("input", "duplicate channel");
      if (previousChannel !== undefined && previousChannel >= ch) {
        fail("input", "interest channels are not in canonical order");
      }
      seen.add(ch);
      previousChannel = ch;
      pairs += 1;
      if (pairs > 4096) fail("input", "interest pair limit");
    }
  }
  return p as unknown as InputInterestV1;
}

export function validateInputState(raw: unknown): InputStateV1 {
  const p = exact(raw, ["type", "frameId", "activationId", "channel", "payload"], [], "input");
  if (p.type !== "input.state") fail("input", "wrong type");
  boundedString(p.frameId, "input", "frameId", 1, 128);
  boundedString(p.activationId, "input", "activationId", 1, 128);
  const ch = channel(p.channel, "state");
  const payload = assertPayload(p.payload, "input");
  standardPayload(ch, payload);
  return p as unknown as InputStateV1;
}

export function validateInputEvent(raw: unknown): InputEventV1 {
  const p = exact(raw, ["type", "frameId", "activationId", "channel", "payload"], [], "input");
  if (p.type !== "input.event") fail("input", "wrong type");
  boundedString(p.frameId, "input", "frameId", 1, 128);
  boundedString(p.activationId, "input", "activationId", 1, 128);
  const ch = channel(p.channel, "event");
  const payload = assertPayload(p.payload, "input");
  standardPayload(ch, payload);
  return p as unknown as InputEventV1;
}

export function validateInputReset(raw: unknown): InputResetV1 {
  const p = exact(raw, ["type", "frameId", "activationId"], [], "input");
  if (p.type !== "input.reset") fail("input", "wrong type");
  boundedString(p.frameId, "input", "frameId", 1, 128);
  boundedString(p.activationId, "input", "activationId", 1, 128);
  return p as unknown as InputResetV1;
}
