import type { KeyboardCodeV1, PointerButtonV1, PointerKindV1, PointerSampleV1 } from "@loomrealm/data";
import type { RendererInputSource, RendererInputSourceChange } from "@loomrealm/renderer";

const keyboardCodes = new Set<string>([
  ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map((letter) => `Key${letter}`),
  ..."0123456789".split("").map((digit) => `Digit${digit}`),
  "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "Enter", "Escape", "Tab", "Backspace",
  "ShiftLeft", "ShiftRight", "ControlLeft", "ControlRight", "AltLeft", "AltRight", "MetaLeft", "MetaRight",
]);
const pointerButtons: ReadonlyArray<readonly [number, PointerButtonV1]> = Object.freeze([[1, "primary"], [2, "secondary"], [4, "auxiliary"], [8, "back"], [16, "forward"]]);

function pointerKind(value: string): PointerKindV1 | null {
  return value === "mouse" || value === "touch" || value === "pen" ? value : null;
}

function buttons(value: number): readonly PointerButtonV1[] {
  return Object.freeze(pointerButtons.filter(([mask]) => (value & mask) !== 0).map(([, name]) => name));
}

function coordinate(value: number, extent: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(extent) || extent <= 0) return 0;
  return Math.max(0, Math.min(1_000_000, Math.round(value / extent * 1_000_000)));
}

export function createPwaInputSource(target: Window): RendererInputSource {
  let started = false;
  return Object.freeze({
    start(emit: (change: RendererInputSourceChange) => void): () => void {
      if (started || typeof emit !== "function") throw new TypeError("Invalid PWA input source start");
      started = true;
      let active = true;
      const held = new Set<KeyboardCodeV1>();
      const pointers = new Map<number, PointerSampleV1>();
      const sendKeyboard = () => emit({ kind: "state", channel: "keyboard.state", payload: { down: Object.freeze([...held].sort()) } });
      const sendPointers = () => emit({ kind: "state", channel: "pointer.state", payload: { pointers: Object.freeze([...pointers.values()]) } } as unknown as RendererInputSourceChange);
      const reset = () => { held.clear(); pointers.clear(); sendKeyboard(); sendPointers(); };
      const onKeyDown = (event: KeyboardEvent) => {
        if (!active || !event.isTrusted || !keyboardCodes.has(event.code)) return;
        const code = event.code as KeyboardCodeV1;
        if (!event.repeat && !held.has(code)) { held.add(code); sendKeyboard(); }
        emit({ kind: "event", channel: "keyboard.event", payload: { action: "down", code, repeat: event.repeat } });
      };
      const onKeyUp = (event: KeyboardEvent) => {
        if (!active || !event.isTrusted || !keyboardCodes.has(event.code)) return;
        const code = event.code as KeyboardCodeV1;
        if (!held.delete(code)) return;
        sendKeyboard();
        emit({ kind: "event", channel: "keyboard.event", payload: { action: "up", code, repeat: false } });
      };
      const onPointer = (event: PointerEvent) => {
        if (!active || !event.isTrusted) return;
        const kind = pointerKind(event.pointerType);
        if (kind === null) return;
        const sample = Object.freeze({ pointerId: event.pointerId, kind, x: coordinate(event.clientX, target.innerWidth), y: coordinate(event.clientY, target.innerHeight), buttons: buttons(event.buttons) });
        if (event.type === "pointercancel" || event.type === "pointerup" && sample.buttons.length === 0) pointers.delete(event.pointerId);
        else pointers.set(event.pointerId, sample);
        sendPointers();
        if (event.type !== "pointermove") emit({ kind: "event", channel: "pointer.event", payload: { action: event.type === "pointerdown" ? "down" : event.type === "pointercancel" ? "cancel" : "up", pointer: sample, button: null } } as unknown as RendererInputSourceChange);
      };
      emit({ kind: "availability", channel: "keyboard.state", available: true });
      emit({ kind: "availability", channel: "keyboard.event", available: true });
      emit({ kind: "availability", channel: "pointer.state", available: true });
      emit({ kind: "availability", channel: "pointer.event", available: true });
      sendKeyboard(); sendPointers();
      target.addEventListener("keydown", onKeyDown);
      target.addEventListener("keyup", onKeyUp);
      target.addEventListener("pointerdown", onPointer);
      target.addEventListener("pointermove", onPointer);
      target.addEventListener("pointerup", onPointer);
      target.addEventListener("pointercancel", onPointer);
      target.addEventListener("blur", reset);
      return () => {
        if (!active) return;
        active = false; started = false;
        target.removeEventListener("keydown", onKeyDown);
        target.removeEventListener("keyup", onKeyUp);
        target.removeEventListener("pointerdown", onPointer);
        target.removeEventListener("pointermove", onPointer);
        target.removeEventListener("pointerup", onPointer);
        target.removeEventListener("pointercancel", onPointer);
        target.removeEventListener("blur", reset);
      };
    },
  });
}
