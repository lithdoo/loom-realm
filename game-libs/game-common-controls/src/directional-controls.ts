import type { ControlsEventPayloadV1, ControlsStatePayloadV1 } from "./model.js";

export type ControlsDirection = "up" | "down" | "left" | "right";

export interface DirectionalControlsTracker {
  readonly direction: ControlsDirection | null;
  acceptState(state: ControlsStatePayloadV1): void;
  acceptEvent(event: ControlsEventPayloadV1): void;
  reset(): void;
}

const CANONICAL_DIRECTIONS = Object.freeze(["up", "down", "left", "right"] as const);

function isDirection(button: string): button is ControlsDirection {
  return button === "up" || button === "down" || button === "left" || button === "right";
}

export function createDirectionalControlsTracker(): DirectionalControlsTracker {
  const freshDown = new Set<ControlsDirection>();
  let heldOrder: ControlsDirection[] = [];

  const acceptState = (state: ControlsStatePayloadV1) => {
    const next = new Set<ControlsDirection>();
    const down = Array.isArray(state?.down) ? state.down : [];
    for (const button of down) if (isDirection(button)) next.add(button);
    freshDown.clear();
    for (const direction of next) freshDown.add(direction);
    heldOrder = heldOrder.filter((direction) => freshDown.has(direction));
    for (const direction of CANONICAL_DIRECTIONS) {
      if (freshDown.has(direction) && !heldOrder.includes(direction)) heldOrder.push(direction);
    }
  };

  const acceptEvent = (event: ControlsEventPayloadV1) => {
    if (!isDirection(event?.button)) return;
    const direction = event.button;
    if (event.action === "up") {
      heldOrder = heldOrder.filter((item) => item !== direction);
      return;
    }
    if (event.action !== "down" || event.repeat !== false || !freshDown.has(direction)) return;
    heldOrder = heldOrder.filter((item) => item !== direction);
    heldOrder.push(direction);
  };

  return Object.freeze({
    get direction() { return heldOrder.at(-1) ?? null; },
    acceptState,
    acceptEvent,
    reset() {
      freshDown.clear();
      heldOrder = [];
    },
  });
}
