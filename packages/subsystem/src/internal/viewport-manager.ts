import type { DataInboundDisposition, ViewportStateV1 } from "@loomrealm/data";
import type { Viewport, ViewportSize } from "../model.js";

type ViewportListener = (value: ViewportSize | null) => void;

const accepted = Object.freeze({ kind: "accepted" } as const);
const inertUnsubscribe = (): void => {};

/**
 * Runtime-scoped retained readonly viewport observation.
 *
 * - Created before the definition factory runs, initial current=null.
 * - Live subscribe synchronously delivers the current value once.
 * - The getter is updated before subscriber callbacks run.
 * - Listener throw/reject is contained locally; it is never protocol evidence.
 * - Runtime terminal closes the manager: late subscribers become inert.
 */
export class ViewportManager implements Viewport {
  private currentValue: ViewportSize | null = null;
  private listeners: ViewportListener[] = [];
  private live = true;

  get current(): ViewportSize | null {
    const value = this.currentValue;
    return value === null ? null : Object.freeze({ width: value.width, height: value.height });
  }

  subscribe(listener: ViewportListener): () => void {
    if (!this.live) return inertUnsubscribe;
    if (typeof listener !== "function") throw new TypeError("Viewport listener must be a function");
    // Getter is already updated before the synchronous initial delivery.
    this.invoke(listener, this.currentValue);
    if (!this.live) return inertUnsubscribe;
    this.listeners.push(listener);
    let subscribed = true;
    return () => {
      if (!subscribed) return;
      subscribed = false;
      const index = this.listeners.indexOf(listener);
      if (index >= 0) this.listeners.splice(index, 1);
    };
  }

  onState(message: ViewportStateV1): DataInboundDisposition {
    if (!this.live) return accepted;
    const next = Object.freeze({ width: message.width, height: message.height });
    const current = this.currentValue;
    if (current !== null && current.width === next.width && current.height === next.height) {
      // Equal retained size, e.g. a fresh-carrier baseline, suppresses callbacks.
      return accepted;
    }
    this.currentValue = next;
    this.notify(next);
    return accepted;
  }

  close(): void {
    this.live = false;
    this.listeners = [];
    this.currentValue = null;
  }

  private notify(size: ViewportSize): void {
    // Stable snapshot: subscribe/unsubscribe inside a callback takes effect
    // during this broadcast without duplicating the initial delivery.
    for (const listener of this.listeners.slice()) {
      if (!this.live || !this.listeners.includes(listener)) continue;
      this.invoke(listener, size);
    }
  }

  private invoke(listener: ViewportListener, value: ViewportSize | null): void {
    try {
      const result: unknown = listener(value);
      if (result === null || (typeof result !== "object" && typeof result !== "function")) return;
      const then = (result as { then?: unknown }).then;
      if (typeof then === "function") void Promise.resolve(result).catch(() => undefined);
    } catch {
      // Listener failure is contained and never blocks other observers.
    }
  }
}
