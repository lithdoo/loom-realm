import {
  KEYBOARD_CODES_V1,
  type GamepadButtonNameV1,
  type GamepadButtonsV1,
  type GamepadSampleV1,
  type KeyboardCodeV1,
  type PointerButtonV1,
  type PointerKindV1,
  type PointerSampleV1,
} from "@loomrealm/data";
import type { RendererInputSource, RendererInputSourceChange } from "./input.js";

const keyboardCodes = new Set<string>(KEYBOARD_CODES_V1);
const pointerButtons: readonly (readonly [number, PointerButtonV1])[] = Object.freeze([
  [1, "primary"], [4, "auxiliary"], [2, "secondary"], [8, "back"], [16, "forward"],
]);
const gamepadButtonNames: readonly GamepadButtonNameV1[] = Object.freeze([
  "south", "east", "west", "north", "leftBumper", "rightBumper", "leftTrigger",
  "rightTrigger", "select", "start", "leftStick", "rightStick", "dpadUp", "dpadDown",
  "dpadLeft", "dpadRight", "home",
]);

interface TrackedPointer {
  readonly canonicalId: number;
  readonly kind: PointerKindV1;
  sample: PointerSampleV1;
}

interface TrackedGamepad {
  readonly canonicalId: number;
  sample: GamepadSampleV1;
  pressed: ReadonlySet<GamepadButtonNameV1>;
}

export interface BrowserRendererInputSourceOptions {
  readonly onKeyboardCapture?: (code: KeyboardCodeV1, at: number) => void;
}

function clampInteger(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const rounded = Math.round(value);
  return Math.max(-2_147_483_648, Math.min(2_147_483_647, rounded));
}

function coordinate(value: number, extent: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(extent) || extent <= 0) return 0;
  return clampInteger(value / extent * 1_000_000);
}

function normalized(value: number, minimum: number, maximum: number): number {
  return Math.round(Math.max(minimum, Math.min(maximum, Number.isFinite(value) ? value : 0)) * 1_000_000);
}

function pointerKind(value: string): PointerKindV1 | null {
  return value === "mouse" || value === "touch" || value === "pen" ? value : null;
}

function buttonsOf(bits: number): readonly PointerButtonV1[] {
  return Object.freeze(pointerButtons.filter(([bit]) => (bits & bit) !== 0).map(([, button]) => button));
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function samePointer(left: PointerSampleV1, right: PointerSampleV1): boolean {
  return left.pointerId === right.pointerId && left.kind === right.kind && left.x === right.x && left.y === right.y &&
    sameStrings(left.buttons, right.buttons);
}

function gamepadSample(gamepad: Gamepad, canonicalId: number): GamepadSampleV1 {
  const value = (index: number) => normalized(gamepad.buttons[index]?.value ?? 0, 0, 1);
  const buttons: GamepadButtonsV1 = Object.freeze({
    south: value(0), east: value(1), west: value(2), north: value(3),
    leftBumper: value(4), rightBumper: value(5), leftTrigger: value(6), rightTrigger: value(7),
    select: value(8), start: value(9), leftStick: value(10), rightStick: value(11),
    dpadUp: value(12), dpadDown: value(13), dpadLeft: value(14), dpadRight: value(15), home: value(16),
  });
  return Object.freeze({
    gamepadId: canonicalId,
    axes: Object.freeze({
      leftX: normalized(gamepad.axes[0] ?? 0, -1, 1),
      leftY: normalized(gamepad.axes[1] ?? 0, -1, 1),
      rightX: normalized(gamepad.axes[2] ?? 0, -1, 1),
      rightY: normalized(gamepad.axes[3] ?? 0, -1, 1),
    }),
    buttons,
  });
}

function pressedOf(sample: GamepadSampleV1): ReadonlySet<GamepadButtonNameV1> {
  return new Set(gamepadButtonNames.filter((name) => sample.buttons[name] >= 500_000));
}

function sameGamepad(left: GamepadSampleV1, right: GamepadSampleV1): boolean {
  return gamepadButtonNames.every((name) => left.buttons[name] === right.buttons[name]) &&
    left.axes.leftX === right.axes.leftX && left.axes.leftY === right.axes.leftY &&
    left.axes.rightX === right.axes.rightX && left.axes.rightY === right.axes.rightY;
}

export function createBrowserRendererInputSource(
  target: Window,
  options: BrowserRendererInputSourceOptions = {},
): RendererInputSource {
  if (target === null || typeof target !== "object") throw new TypeError("Invalid browser input Window");
  const document = target.document;
  const addWindow = target.addEventListener.bind(target);
  const removeWindow = target.removeEventListener.bind(target);
  const addDocument = document.addEventListener.bind(document);
  const removeDocument = document.removeEventListener.bind(document);
  const requestFrame = target.requestAnimationFrame.bind(target);
  const cancelFrame = target.cancelAnimationFrame.bind(target);
  const readGamepads = typeof target.navigator.getGamepads === "function"
    ? target.navigator.getGamepads.bind(target.navigator)
    : null;
  let subscribed = false;

  return Object.freeze({
    start(emit: (change: RendererInputSourceChange) => void): () => void {
      if (typeof emit !== "function") throw new TypeError("Invalid browser input sink");
      if (subscribed) throw new TypeError("Browser input source already started");
      subscribed = true;
      let active = true;
      let usable: boolean | null = null;
      let pointerAvailable = false;
      let animationFrame: number | null = null;
      let nextPointerId = 1;
      let nextGamepadId = 1;
      const held = new Set<KeyboardCodeV1>();
      const pointers = new Map<number, TrackedPointer>();
      const gamepads = new Map<number, TrackedGamepad>();

      const send = (change: RendererInputSourceChange) => { if (active) emit(change); };
      const keyboardState = () => send({ kind: "state", channel: "keyboard.state", payload: { down: Object.freeze([...held].sort()) } });
      const pointerState = () => send({ kind: "state", channel: "pointer.state", payload: { pointers: Object.freeze([...pointers.values()].map(({ sample }) => sample).sort((a, b) => a.pointerId - b.pointerId)) } });
      const gamepadState = () => send({ kind: "state", channel: "gamepad.state", payload: { gamepads: Object.freeze([...gamepads.values()].map(({ sample }) => sample).sort((a, b) => a.gamepadId - b.gamepadId)) } });
      const available = (prefix: "keyboard" | "pointer" | "gamepad", value: boolean) => {
        if (prefix === "keyboard") {
          send({ kind: "availability", channel: "keyboard.state", available: value });
          send({ kind: "availability", channel: "keyboard.event", available: value });
        } else if (prefix === "pointer") {
          send({ kind: "availability", channel: "pointer.state", available: value });
          send({ kind: "availability", channel: "pointer.event", available: value });
        } else {
          send({ kind: "availability", channel: "gamepad.state", available: value });
          send({ kind: "availability", channel: "gamepad.event", available: value });
        }
      };
      const surfaceValid = () => target.innerWidth > 0 && target.innerHeight > 0;
      const windowUsable = () => document.visibilityState === "visible" && document.hasFocus();

      const stopPolling = () => {
        if (animationFrame !== null) cancelFrame(animationFrame);
        animationFrame = null;
      };

      const pollGamepads = () => {
        if (!active || usable !== true || readGamepads === null) return;
        const seen = new Set<number>();
        let changed = false;
        const crossings: Array<{ tracked: TrackedGamepad; button: GamepadButtonNameV1; action: "down" | "up" }> = [];
        for (const pad of readGamepads()) {
          if (!pad || !pad.connected || pad.mapping !== "standard") continue;
          let tracked = gamepads.get(pad.index);
          if (tracked === undefined && gamepads.size >= 16) continue;
          seen.add(pad.index);
          if (tracked === undefined) {
            const sample = gamepadSample(pad, nextGamepadId++);
            tracked = { canonicalId: sample.gamepadId, sample, pressed: pressedOf(sample) };
            gamepads.set(pad.index, tracked);
            changed = true;
            continue;
          }
          const sample = gamepadSample(pad, tracked.canonicalId);
          const pressed = pressedOf(sample);
          if (!sameGamepad(sample, tracked.sample)) changed = true;
          for (const button of gamepadButtonNames) {
            if (pressed.has(button) !== tracked.pressed.has(button)) {
              crossings.push({ tracked, button, action: pressed.has(button) ? "down" : "up" });
            }
          }
          tracked.sample = sample;
          tracked.pressed = pressed;
        }
        for (const [index] of gamepads) if (!seen.has(index)) { gamepads.delete(index); changed = true; }
        if (changed) gamepadState();
        crossings.sort((a, b) => a.tracked.canonicalId - b.tracked.canonicalId || gamepadButtonNames.indexOf(a.button) - gamepadButtonNames.indexOf(b.button));
        for (const crossing of crossings) send({ kind: "event", channel: "gamepad.event", payload: {
          action: crossing.action,
          gamepadId: crossing.tracked.canonicalId,
          button: crossing.button,
          value: crossing.tracked.sample.buttons[crossing.button],
        } });
        animationFrame = requestFrame(pollGamepads);
      };

      const baselineGamepads = () => {
        gamepads.clear();
        if (readGamepads === null) return;
        for (const pad of readGamepads()) {
          if (!pad || !pad.connected || pad.mapping !== "standard" || gamepads.size >= 16) continue;
          const sample = gamepadSample(pad, nextGamepadId++);
          gamepads.set(pad.index, { canonicalId: sample.gamepadId, sample, pressed: pressedOf(sample) });
        }
      };

      const enterUsable = () => {
        usable = true;
        held.clear();
        pointers.clear();
        baselineGamepads();
        keyboardState();
        available("keyboard", true);
        pointerAvailable = surfaceValid();
        pointerState();
        available("pointer", pointerAvailable);
        gamepadState();
        available("gamepad", readGamepads !== null);
        if (readGamepads !== null) animationFrame = requestFrame(pollGamepads);
      };

      const leaveUsable = () => {
        usable = false;
        stopPolling();
        held.clear();
        pointers.clear();
        gamepads.clear();
        keyboardState();
        pointerState();
        gamepadState();
        available("keyboard", false);
        available("pointer", false);
        available("gamepad", false);
        pointerAvailable = false;
      };

      const reconcileUsable = () => {
        const next = windowUsable();
        if (next && usable !== true) enterUsable();
        else if (!next && usable !== false) leaveUsable();
      };

      const onResize = () => {
        if (usable !== true) return;
        const next = surfaceValid();
        if (next === pointerAvailable) return;
        pointers.clear();
        pointerState();
        pointerAvailable = next;
        available("pointer", next);
      };

      const onKeyDown = (event: KeyboardEvent) => {
        if (usable !== true || !event.isTrusted || !keyboardCodes.has(event.code)) return;
        const code = event.code as KeyboardCodeV1;
        const repeat = held.has(code);
        if (!repeat) {
          held.add(code);
          keyboardState();
          try { options.onKeyboardCapture?.(code, target.performance.now()); }
          catch { /* An optional observer cannot change input protocol behavior. */ }
        }
        send({ kind: "event", channel: "keyboard.event", payload: { action: "down", code, repeat } });
      };

      const onKeyUp = (event: KeyboardEvent) => {
        if (usable !== true || !event.isTrusted || !keyboardCodes.has(event.code)) return;
        const code = event.code as KeyboardCodeV1;
        if (!held.delete(code)) return;
        keyboardState();
        send({ kind: "event", channel: "keyboard.event", payload: { action: "up", code, repeat: false } });
      };

      const onPointer = (event: PointerEvent) => {
        if (usable !== true || !pointerAvailable || !event.isTrusted) return;
        const kind = pointerKind(event.pointerType);
        if (kind === null) return;
        let tracked = pointers.get(event.pointerId);
        if (tracked === undefined) {
          if (event.type !== "pointerdown" || pointers.size >= 32) return;
          const empty: PointerSampleV1 = Object.freeze({
            pointerId: nextPointerId++, kind,
            x: coordinate(event.clientX, target.innerWidth),
            y: coordinate(event.clientY, target.innerHeight),
            buttons: Object.freeze([]),
          });
          tracked = { canonicalId: empty.pointerId, kind, sample: empty };
          pointers.set(event.pointerId, tracked);
        }
        const nextButtons = event.type === "pointercancel" ? Object.freeze([]) : buttonsOf(event.buttons);
        const next: PointerSampleV1 = Object.freeze({
          pointerId: tracked.canonicalId,
          kind: tracked.kind,
          x: coordinate(event.clientX, target.innerWidth),
          y: coordinate(event.clientY, target.innerHeight),
          buttons: nextButtons,
        });
        if (event.type === "pointercancel") {
          pointers.delete(event.pointerId);
          pointerState();
          send({ kind: "event", channel: "pointer.event", payload: { action: "cancel", pointer: next, button: null } });
          return;
        }
        const removed = pointerButtons.map(([, button]) => button).filter((button) => tracked.sample.buttons.includes(button) && !nextButtons.includes(button));
        const added = pointerButtons.map(([, button]) => button).filter((button) => !tracked.sample.buttons.includes(button) && nextButtons.includes(button));
        const changed = !samePointer(tracked.sample, next);
        tracked.sample = next;
        if (nextButtons.length === 0) pointers.delete(event.pointerId);
        if (changed) pointerState();
        for (const button of removed) send({ kind: "event", channel: "pointer.event", payload: { action: "up", pointer: next, button } });
        for (const button of added) send({ kind: "event", channel: "pointer.event", payload: { action: "down", pointer: next, button } });
      };

      addWindow("focus", reconcileUsable);
      addWindow("blur", reconcileUsable);
      addWindow("resize", onResize);
      addWindow("keydown", onKeyDown);
      addWindow("keyup", onKeyUp);
      addWindow("pointerdown", onPointer);
      addWindow("pointermove", onPointer);
      addWindow("pointerup", onPointer);
      addWindow("pointercancel", onPointer);
      addDocument("visibilitychange", reconcileUsable);
      reconcileUsable();

      return () => {
        if (!active) return;
        active = false;
        subscribed = false;
        stopPolling();
        removeWindow("focus", reconcileUsable);
        removeWindow("blur", reconcileUsable);
        removeWindow("resize", onResize);
        removeWindow("keydown", onKeyDown);
        removeWindow("keyup", onKeyUp);
        removeWindow("pointerdown", onPointer);
        removeWindow("pointermove", onPointer);
        removeWindow("pointerup", onPointer);
        removeWindow("pointercancel", onPointer);
        removeDocument("visibilitychange", reconcileUsable);
        held.clear();
        pointers.clear();
        gamepads.clear();
      };
    },
  });
}
