import type { Frame, PresentationEventClient, PresentationFrameEvent } from "@loomrealm/subsystem";
import {
  CONTROLS_BUTTONS_V1,
  EMPTY_CONTROLS_STATE_V1,
  type ControlsEventPayloadV1,
  type ControlsStatePayloadV1,
} from "./model.js";
import { createFreshControlsStateTracker, type FreshControlsStateTracker } from "./fresh-state.js";

export interface ControlsConsumerHandlers {
  readonly onState?: (state: ControlsStatePayloadV1) => void | Promise<void>;
  readonly onEvent?: (event: ControlsEventPayloadV1) => void | Promise<void>;
}

export interface ControlsConsumer {
  close(): void;
}

const BUTTON_INDEX = new Map<string, number>(CONTROLS_BUTTONS_V1.map((button, index) => [button, index]));

function invoke(callback: (value: never) => void | Promise<void>, value: never): void {
  try {
    const result = callback(value);
    if (result !== undefined && result !== null && typeof (result as Promise<void>).then === "function") {
      Promise.resolve(result).catch(() => {});
    }
  } catch {
    // Callback failure stays local. The consumer, freshness timer, and later deliveries continue.
  }
}

function isCanonicalState(data: unknown): data is ControlsStatePayloadV1 {
  if (data === null || typeof data !== "object" || Array.isArray(data)) return false;
  const record = data as Record<string, unknown>;
  if (Object.keys(record).length !== 1 || !Object.hasOwn(record, "down") || !Array.isArray(record.down)) return false;
  let previous = -1;
  const seen = new Set<string>();
  for (const button of record.down) {
    if (typeof button !== "string" || seen.has(button)) return false;
    const index = BUTTON_INDEX.get(button);
    if (index === undefined || index <= previous) return false;
    previous = index;
    seen.add(button);
  }
  return true;
}

function isCanonicalEvent(data: unknown): data is ControlsEventPayloadV1 {
  if (data === null || typeof data !== "object" || Array.isArray(data)) return false;
  const record = data as Record<string, unknown>;
  if (Object.keys(record).length !== 3) return false;
  if ((record.action !== "down" && record.action !== "up") || typeof record.repeat !== "boolean") return false;
  return typeof record.button === "string" && BUTTON_INDEX.has(record.button);
}

export function createControlsConsumer(
  presentationEvents: PresentationEventClient,
  frame: Frame,
  handlers: ControlsConsumerHandlers,
): ControlsConsumer {
  if (presentationEvents === null || typeof presentationEvents !== "object" || typeof presentationEvents.createListener !== "function") {
    throw new TypeError("Invalid controls presentation client");
  }
  if (frame === null || typeof frame !== "object" || frame.signal === null || typeof frame.signal !== "object") {
    throw new TypeError("Invalid controls consumer frame");
  }
  if (handlers === null || typeof handlers !== "object") throw new TypeError("Invalid controls consumer handlers");
  if (handlers.onState !== undefined && typeof handlers.onState !== "function") throw new TypeError("Invalid controls state handler");
  if (handlers.onEvent !== undefined && typeof handlers.onEvent !== "function") throw new TypeError("Invalid controls event handler");

  const channels: string[] = [];
  if (handlers.onState) channels.push("controls.state");
  if (handlers.onEvent) channels.push("controls.event");
  const listener = presentationEvents.createListener({ frame, channels });
  let closed = false;
  const deliverState = (state: ControlsStatePayloadV1) => {
    if (!closed && handlers.onState) invoke(handlers.onState as (value: never) => void | Promise<void>, state as never);
  };
  const tracker: FreshControlsStateTracker | undefined = handlers.onState
    ? createFreshControlsStateTracker(deliverState)
    : undefined;

  const close = () => {
    if (closed) return;
    closed = true;
    tracker?.close();
    listener.close();
    frame.signal.removeEventListener("abort", close);
  };
  frame.signal.addEventListener("abort", close);

  if (handlers.onState) {
    listener.on("controls.state", (event: PresentationFrameEvent) => {
      if (closed || event.name !== "input.state" || !isCanonicalState(event.data)) return;
      tracker?.accept(event.data);
    });
  }
  if (handlers.onEvent) {
    listener.on("controls.event", (event: PresentationFrameEvent) => {
      if (closed || event.name !== "input.event" || !isCanonicalEvent(event.data)) return;
      invoke(handlers.onEvent as (value: never) => void | Promise<void>, event.data as never);
    });
  }

  if (frame.signal.aborted) close();
  else if (handlers.onState) invoke(handlers.onState as (value: never) => void | Promise<void>, EMPTY_CONTROLS_STATE_V1 as never);

  return Object.freeze({ close });
}
