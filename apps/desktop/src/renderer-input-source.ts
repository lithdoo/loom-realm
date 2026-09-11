import {
  type GamepadButtonNameV1,
  type GamepadButtonsV1,
  type GamepadSampleV1,
  type KeyboardCodeV1,
  type PointerButtonV1,
  type PointerKindV1,
  type PointerSampleV1,
} from "@loomrealm/data";
import type { RendererInputSource, RendererInputSourceChange } from "@loomrealm/renderer";

const namedKeyboardCodes = new Set<string>([
  "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "Enter", "Escape", "Tab", "Backspace",
  "ShiftLeft", "ShiftRight", "ControlLeft", "ControlRight", "AltLeft", "AltRight", "MetaLeft", "MetaRight", "CapsLock",
  "Insert", "Delete", "Home", "End", "PageUp", "PageDown", "Minus", "Equal", "BracketLeft", "BracketRight", "Backslash",
  "Semicolon", "Quote", "Backquote", "Comma", "Period", "Slash", "NumpadAdd", "NumpadSubtract", "NumpadMultiply",
  "NumpadDivide", "NumpadDecimal", "NumpadEnter",
]);

function isKeyboardCode(code: string): code is KeyboardCodeV1 {
  if (/^(?:Key[A-Z]|Digit[0-9]|Numpad[0-9])$/.test(code) || namedKeyboardCodes.has(code)) return true;
  const functionKey = /^F([1-9]|1[0-9]|2[0-4])$/.exec(code);
  return functionKey !== null;
}
const pointerButtons: readonly [number, PointerButtonV1][] = Object.freeze([
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
  pressed: Readonly<Record<GamepadButtonNameV1, boolean>>;
}

function clampInteger(value: number): number {
  const rounded = Math.round(value);
  return Math.max(-2_147_483_648, Math.min(2_147_483_647, rounded));
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
  const values = gamepadButtonNames.map((_, index) => normalized(gamepad.buttons[index]?.value ?? 0, 0, 1));
  const buttons = Object.freeze(Object.fromEntries(gamepadButtonNames.map((name, index) => [name, values[index]!])) as unknown as GamepadButtonsV1);
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

function pressedOf(sample: GamepadSampleV1): Readonly<Record<GamepadButtonNameV1, boolean>> {
  return Object.freeze(Object.fromEntries(gamepadButtonNames.map((name) => [name, sample.buttons[name] >= 500_000])) as unknown as Record<GamepadButtonNameV1, boolean>);
}

function sameGamepad(left: GamepadSampleV1, right: GamepadSampleV1): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function createDesktopRendererInputSource(target: Window): RendererInputSource {
  if (target === null || typeof target !== "object") throw new TypeError("Invalid Desktop input Window");
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
      if (typeof emit !== "function") throw new TypeError("Invalid Desktop input sink");
      if (subscribed) throw new TypeError("Desktop input source already started");
      subscribed = true;
      let active = true;
      let usable = false;
      let pointerAvailable = false;
      let animationFrame: number | null = null;
      let nextPointerId = 1;
      let nextGamepadId = 1;
      const held = new Set<KeyboardCodeV1>();
      const pointers = new Map<number, TrackedPointer>();
      const gamepads = new Map<number, TrackedGamepad>();

      const send = (change: RendererInputSourceChange) => { if (active) emit(change); };
      const keyboardState = () => send({ kind: "state", channel: "keyboard.state", payload: { down: Object.freeze([...held].sort()) } });
      const pointerState = () => send({ kind: "state", channel: "pointer.state", payload: { pointers: Object.freeze([...pointers.values()].map(({ sample }) => sample).sort((a, b) => a.pointerId - b.pointerId)) } } as unknown as RendererInputSourceChange);
      const gamepadState = () => send({ kind: "state", channel: "gamepad.state", payload: { gamepads: Object.freeze([...gamepads.values()].map(({ sample }) => sample).sort((a, b) => a.gamepadId - b.gamepadId)) } } as unknown as RendererInputSourceChange);
      const available = (prefix: "keyboard" | "pointer" | "gamepad", value: boolean) => {
        send({ kind: "availability", channel: `${prefix}.state`, available: value });
        send({ kind: "availability", channel: `${prefix}.event`, available: value });
      };
      const surfaceValid = () => target.innerWidth > 0 && target.innerHeight > 0;
      const windowUsable = () => document.visibilityState === "visible" && document.hasFocus();

      const stopPolling = () => {
        if (animationFrame !== null) cancelFrame(animationFrame);
        animationFrame = null;
      };

      const pollGamepads = () => {
        if (!active || !usable || readGamepads === null) return;
        const seen = new Set<number>();
        let changed = false;
        const crossings: Array<{ tracked: TrackedGamepad; button: GamepadButtonNameV1; action: "down" | "up" }> = [];
        for (const pad of readGamepads()) {
          if (!pad || !pad.connected || pad.mapping !== "standard") continue;
          seen.add(pad.index);
          let tracked = gamepads.get(pad.index);
          if (!tracked) {
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
            if (pressed[button] !== tracked.pressed[button]) crossings.push({ tracked, button, action: pressed[button] ? "down" : "up" });
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
          if (!pad || !pad.connected || pad.mapping !== "standard") continue;
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
        if (next && !usable) enterUsable();
        else if (!next && usable) leaveUsable();
      };

      const onResize = () => {
        if (!usable) return;
        const next = surfaceValid();
        if (next === pointerAvailable) return;
        pointers.clear();
        pointerState();
        pointerAvailable = next;
        available("pointer", next);
      };

      const onKeyDown = (event: KeyboardEvent) => {
        if (!usable || !event.isTrusted || !isKeyboardCode(event.code)) return;
        const code = event.code as KeyboardCodeV1;
        const repeat = held.has(code);
        if (!repeat) { held.add(code); keyboardState(); }
        send({ kind: "event", channel: "keyboard.event", payload: { action: "down", code, repeat } });
      };
      const onKeyUp = (event: KeyboardEvent) => {
        if (!usable || !event.isTrusted || !isKeyboardCode(event.code)) return;
        const code = event.code as KeyboardCodeV1;
        if (!held.delete(code)) return;
        keyboardState();
        send({ kind: "event", channel: "keyboard.event", payload: { action: "up", code, repeat: false } });
      };

      const onPointer = (event: PointerEvent) => {
        if (!usable || !pointerAvailable || !event.isTrusted) return;
        const kind = pointerKind(event.pointerType);
        if (kind === null) return;
        let tracked = pointers.get(event.pointerId);
        if (!tracked) {
          if (event.type !== "pointerdown") return;
          const empty: PointerSampleV1 = Object.freeze({ pointerId: nextPointerId++, kind, x: 0, y: 0, buttons: Object.freeze([]) });
          tracked = { canonicalId: empty.pointerId, kind, sample: empty };
          pointers.set(event.pointerId, tracked);
        }
        if (event.type === "pointercancel") {
          const final = Object.freeze({ ...tracked.sample, x: clampInteger(event.clientX / target.innerWidth * 1_000_000), y: clampInteger(event.clientY / target.innerHeight * 1_000_000) });
          pointers.delete(event.pointerId);
          pointerState();
          send({ kind: "event", channel: "pointer.event", payload: { action: "cancel", pointer: final, button: null } });
          return;
        }
        const nextButtons = buttonsOf(event.buttons);
        const next: PointerSampleV1 = Object.freeze({
          pointerId: tracked.canonicalId,
          kind: tracked.kind,
          x: clampInteger(event.clientX / target.innerWidth * 1_000_000),
          y: clampInteger(event.clientY / target.innerHeight * 1_000_000),
          buttons: nextButtons,
        });
        const removed = pointerButtons.map(([, button]) => button).filter((button) => tracked!.sample.buttons.includes(button) && !nextButtons.includes(button));
        const added = pointerButtons.map(([, button]) => button).filter((button) => !tracked!.sample.buttons.includes(button) && nextButtons.includes(button));
        const changed = !samePointer(tracked.sample, next);
        tracked.sample = next;
        if (nextButtons.length === 0) pointers.delete(event.pointerId);
        if (changed) pointerState();
        for (const button of removed) send({ kind: "event", channel: "pointer.event", payload: { action: "up", pointer: next, button } } as unknown as RendererInputSourceChange);
        for (const button of added) send({ kind: "event", channel: "pointer.event", payload: { action: "down", pointer: next, button } } as unknown as RendererInputSourceChange);
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
        held.clear(); pointers.clear(); gamepads.clear();
      };
    },
  });
}
