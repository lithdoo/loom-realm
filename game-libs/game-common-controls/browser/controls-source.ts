import {
  CONTROLS_BUTTONS_V1,
  type ControlsButtonV1,
  type ControlsEventPayloadV1,
  type ControlsStatePayloadV1,
} from "../src/model.js";
import { windowUsable } from "./source-types.js";

export type ControlsInputChange =
  | { readonly kind: "state"; readonly payload: ControlsStatePayloadV1 }
  | { readonly kind: "event"; readonly payload: ControlsEventPayloadV1 };

export interface ControlsInputSource {
  start(emit: (change: ControlsInputChange) => void): () => void;
}

const keyboardButtons = new Map<string, ControlsButtonV1>([
  ["ArrowUp", "up"], ["ArrowDown", "down"], ["ArrowLeft", "left"], ["ArrowRight", "right"],
  ["KeyZ", "south"], ["KeyX", "east"], ["KeyC", "west"], ["KeyV", "north"],
  ["KeyQ", "leftBumper"], ["KeyE", "rightBumper"],
  ["ShiftLeft", "leftTrigger"], ["ControlLeft", "rightTrigger"],
  ["Enter", "start"], ["Tab", "select"],
]);

const gamepadButtons: readonly (readonly [number, ControlsButtonV1])[] = Object.freeze([
  [12, "up"], [13, "down"], [14, "left"], [15, "right"],
  [0, "south"], [1, "east"], [2, "west"], [3, "north"],
  [4, "leftBumper"], [5, "rightBumper"], [6, "leftTrigger"], [7, "rightTrigger"],
  [9, "start"], [8, "select"],
]);

const GAMEPAD_DOWN_THRESHOLD = 500_000;

function normalizedButtonValue(gamepad: Gamepad, index: number): number {
  const value = gamepad.buttons[index]?.value ?? 0;
  return Math.round(Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0)) * 1_000_000);
}

function sampleGamepad(gamepad: Gamepad): ReadonlySet<ControlsButtonV1> {
  return new Set(gamepadButtons.filter(([index]) => normalizedButtonValue(gamepad, index) >= GAMEPAD_DOWN_THRESHOLD).map(([, button]) => button));
}

function deepestActiveElement(document: Document): Element | null {
  let active = document.activeElement;
  while (active?.shadowRoot?.activeElement != null) active = active.shadowRoot.activeElement;
  return active;
}

function composedParent(element: Element): Element | null {
  if (element.parentElement !== null) return element.parentElement;
  const root = element.getRootNode();
  return root instanceof ShadowRoot ? root.host : null;
}

function isBlockedElement(element: Element): boolean {
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement ||
      element instanceof HTMLSelectElement || element instanceof HTMLButtonElement) return true;
  if (element instanceof HTMLAnchorElement && element.hasAttribute("href")) return true;
  return element instanceof HTMLElement && element.isContentEditable;
}

export function keyboardCaptureAvailable(target: Window): boolean {
  if (!windowUsable(target)) return false;
  for (let element = deepestActiveElement(target.document); element !== null; element = composedParent(element)) {
    if (isBlockedElement(element)) return false;
  }
  return true;
}

function sameSet(left: ReadonlySet<ControlsButtonV1>, right: ReadonlySet<ControlsButtonV1>): boolean {
  return left.size === right.size && [...left].every((button) => right.has(button));
}

export function createControlsInputSource(target: Window): ControlsInputSource {
  let subscribed = false;
  const read = typeof target.navigator.getGamepads === "function" ? target.navigator.getGamepads.bind(target.navigator) : null;
  return Object.freeze({
    start(emit: (change: ControlsInputChange) => void): () => void {
      if (subscribed) throw new TypeError("Controls input source already started");
      subscribed = true;
      let active = true;
      let usable: boolean | null = null;
      let captureAvailable: boolean | null = null;
      let frame: number | null = null;
      const keyboardDown = new Set<ControlsButtonV1>();
      const trackedGamepads = new Map<number, ReadonlySet<ControlsButtonV1>>();
      let gamepadDown: ReadonlySet<ControlsButtonV1> = new Set();
      let effective: ReadonlySet<ControlsButtonV1> = new Set();

      const send = (change: ControlsInputChange) => { if (active) emit(change); };
      const ordered = (buttons: ReadonlySet<ControlsButtonV1>) => Object.freeze(CONTROLS_BUTTONS_V1.filter((button) => buttons.has(button)));
      const aggregateGamepads = (): ReadonlySet<ControlsButtonV1> => {
        const aggregate = new Set<ControlsButtonV1>();
        for (const pressed of trackedGamepads.values()) for (const button of pressed) aggregate.add(button);
        return aggregate;
      };
      const nextEffective = (): ReadonlySet<ControlsButtonV1> => new Set([...keyboardDown, ...gamepadDown]);
      const state = () => send({ kind: "state", payload: { down: ordered(effective) } });
      const applyEffective = (physicalButtons?: ReadonlySet<ControlsButtonV1>, alwaysState = false) => {
        const previous = effective;
        const next = nextEffective();
        const changed = !sameSet(previous, next);
        effective = next;
        if (changed || alwaysState) state();
        if (!changed || physicalButtons === undefined) return;
        for (const button of CONTROLS_BUTTONS_V1) {
          if (!physicalButtons.has(button) || previous.has(button) === next.has(button)) continue;
          send({ kind: "event", payload: { action: next.has(button) ? "down" : "up", button, repeat: false } });
        }
      };
      const stopPolling = () => {
        if (frame !== null) target.cancelAnimationFrame(frame);
        frame = null;
      };
      const baselineGamepads = () => {
        trackedGamepads.clear();
        if (read !== null) for (const pad of read()) {
          if (pad && pad.connected && pad.mapping === "standard") trackedGamepads.set(pad.index, sampleGamepad(pad));
        }
        gamepadDown = aggregateGamepads();
      };
      const poll = () => {
        if (!active || usable !== true || read === null) return;
        const seen = new Set<number>();
        const physicalButtons = new Set<ControlsButtonV1>();
        for (const pad of read()) {
          if (!pad || !pad.connected || pad.mapping !== "standard") continue;
          seen.add(pad.index);
          const next = sampleGamepad(pad);
          const previous = trackedGamepads.get(pad.index);
          trackedGamepads.set(pad.index, next);
          if (previous === undefined) continue;
          for (const button of CONTROLS_BUTTONS_V1) if (previous.has(button) !== next.has(button)) physicalButtons.add(button);
        }
        for (const [index, previous] of trackedGamepads) {
          if (seen.has(index)) continue;
          trackedGamepads.delete(index);
          for (const button of previous) physicalButtons.add(button);
        }
        const previousGamepadDown = gamepadDown;
        gamepadDown = aggregateGamepads();
        if (!sameSet(previousGamepadDown, gamepadDown)) applyEffective(physicalButtons);
        frame = target.requestAnimationFrame(poll);
      };
      const reconcileWindow = () => {
        const next = windowUsable(target);
        if (next === usable) return;
        usable = next;
        stopPolling();
        keyboardDown.clear();
        trackedGamepads.clear();
        gamepadDown = new Set();
        captureAvailable = next ? keyboardCaptureAvailable(target) : false;
        if (next) baselineGamepads();
        applyEffective(undefined, true);
        if (next && read !== null) frame = target.requestAnimationFrame(poll);
      };
      const reconcileCapture = () => {
        if (usable !== true) return;
        const next = keyboardCaptureAvailable(target);
        if (next === captureAvailable) return;
        const previous = captureAvailable;
        captureAvailable = next;
        if (previous === true && !next) {
          keyboardDown.clear();
          applyEffective();
        }
      };
      const keydown = (event: KeyboardEvent) => {
        const button = keyboardButtons.get(event.code);
        if (captureAvailable !== true || !event.isTrusted || button === undefined) return;
        if (event.cancelable) event.preventDefault();
        if (!keyboardDown.has(button)) {
          keyboardDown.add(button);
          const previous = effective;
          applyEffective();
          if (!previous.has(button) && effective.has(button)) {
            send({ kind: "event", payload: { action: "down", button, repeat: false } });
          }
          return;
        }
        if (event.repeat && !gamepadDown.has(button)) {
          send({ kind: "event", payload: { action: "down", button, repeat: true } });
        }
      };
      const keyup = (event: KeyboardEvent) => {
        const button = keyboardButtons.get(event.code);
        if (captureAvailable !== true || !event.isTrusted || button === undefined || !keyboardDown.delete(button)) return;
        const previous = effective;
        applyEffective();
        if (previous.has(button) && !effective.has(button)) {
          send({ kind: "event", payload: { action: "up", button, repeat: false } });
        }
      };
      const focusout = () => queueMicrotask(reconcileCapture);

      target.addEventListener("focus", reconcileWindow);
      target.addEventListener("blur", reconcileWindow);
      target.addEventListener("keydown", keydown);
      target.addEventListener("keyup", keyup);
      target.document.addEventListener("focusin", reconcileCapture);
      target.document.addEventListener("focusout", focusout);
      target.document.addEventListener("visibilitychange", reconcileWindow);
      reconcileWindow();
      return () => {
        if (!active) return;
        active = false;
        subscribed = false;
        stopPolling();
        target.removeEventListener("focus", reconcileWindow);
        target.removeEventListener("blur", reconcileWindow);
        target.removeEventListener("keydown", keydown);
        target.removeEventListener("keyup", keyup);
        target.document.removeEventListener("focusin", reconcileCapture);
        target.document.removeEventListener("focusout", focusout);
        target.document.removeEventListener("visibilitychange", reconcileWindow);
        keyboardDown.clear();
        trackedGamepads.clear();
      };
    },
  });
}
