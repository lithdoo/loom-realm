import type { Viewport, ViewportSize } from "../model.js";

type ViewportListener = (value: ViewportSize | null) => void;

/**
 * Runtime-scoped Viewport manager: one instance per Runtime, created before the
 * definition factory runs, initial `current = null`.
 *
 * Semantics (Viewport State v1 §6): live `subscribe()` synchronously delivers
 * the current value once; the getter is updated before any callback; equal
 * sizes are suppressed; values are frozen detached objects; listener throws
 * and rejecting thenables are contained locally and never block other
 * observers or the Data reader; broadcasts iterate a stable snapshot and skip
 * listeners that unsubscribed mid-broadcast; after `close()` (Runtime
 * terminal) subscriptions are cleared, late peer messages are ignored and
 * `subscribe()` returns an inert unsubscribe without an initial callback.
 */
export class ViewportManager implements Viewport {
  private currentSize: ViewportSize | null = null;
  private readonly listeners = new Set<ViewportListener>();
  private closed = false;

  get current(): ViewportSize | null {
    return this.currentSize;
  }

  subscribe(listener: ViewportListener): () => void {
    if (typeof listener !== "function") throw new TypeError("Invalid Viewport listener");
    if (this.closed) return () => undefined;
    this.listeners.add(listener);
    this.invoke(listener, this.currentSize);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Only the current Data peer's messages reach here (host-side gating). */
  onViewportState(size: Readonly<{ width: number; height: number }>): void {
    if (this.closed) return;
    const current = this.currentSize;
    if (current !== null && current.width === size.width && current.height === size.height) return;
    this.currentSize = Object.freeze({ width: size.width, height: size.height });
    this.broadcast();
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.listeners.clear();
  }

  private broadcast(): void {
    const snapshot = [...this.listeners];
    for (const listener of snapshot) {
      if (this.closed || !this.listeners.has(listener)) continue;
      this.invoke(listener, this.currentSize);
    }
  }

  private invoke(listener: ViewportListener, value: ViewportSize | null): void {
    try {
      const result = listener(value);
      if (result !== undefined && result !== null) {
        void Promise.resolve(result).catch(() => undefined);
      }
    } catch {
      // Viewport listener failures are contained locally.
    }
  }
}
