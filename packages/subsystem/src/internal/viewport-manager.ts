import type { DataInboundDisposition, ViewportStateV1 } from "@loomrealm/data";
import type { Viewport, ViewportSize } from "../viewport.js";

const accepted: DataInboundDisposition = Object.freeze({ kind: "accepted" });

type ViewportListener = (value: ViewportSize | null) => void;

function containedNotify(listener: ViewportListener, value: ViewportSize | null): void {
  try {
    const result = listener(value) as unknown;
    if (
      result !== null &&
      typeof result === "object" &&
      typeof (result as PromiseLike<unknown>).then === "function"
    ) {
      // Returned rejecting thenables are contained locally: no unhandled
      // rejection, no reader blocking, no Data/Runtime terminal.
      void (result as PromiseLike<unknown>).then(undefined, () => undefined);
    }
  } catch {
    // Synchronous listener throws are contained locally; delivery to other
    // listeners and the Data reader continues unaffected.
  }
}

/**
 * Runtime-scoped retained viewport observation.
 *
 * - `onState` is the Data-peer ingress: equal sizes are suppressed without a
 *   duplicate callback; a new size updates the getter BEFORE notifying
 *   listeners; fencing of stale carriers happens in the host (only the
 *   current Data peer's messages reach this manager).
 * - `close()` models Runtime terminal: listeners stop receiving anything,
 *   later `subscribe` calls return an inert unsubscribe without an initial
 *   callback, and `current` remains readable as a purely historical value.
 */
export class ViewportManager {
  private currentValue: ViewportSize | null = null;
  private readonly listeners = new Set<ViewportListener>();
  private terminated = false;
  private readonly viewportView: Viewport;

  constructor() {
    const manager = this;
    this.viewportView = Object.freeze({
      get current(): ViewportSize | null {
        return manager.currentValue;
      },
      subscribe(listener: ViewportListener): () => void {
        if (typeof listener !== "function") {
          throw new TypeError("Viewport listener must be a function");
        }
        if (manager.terminated) {
          // Inert, idempotent unsubscribe; the initial callback never runs.
          return () => undefined;
        }
        manager.listeners.add(listener);
        // Synchronous first delivery of the latest committed current value,
        // including null; a synchronous throw stays contained.
        containedNotify(listener, manager.currentValue);
        let done = false;
        return () => {
          if (done) return;
          done = true;
          manager.listeners.delete(listener);
        };
      },
    });
  }

  get viewport(): Viewport {
    return this.viewportView;
  }

  onState(message: ViewportStateV1): DataInboundDisposition {
    if (this.terminated) return accepted;
    if (
      typeof message.width !== "number" ||
      typeof message.height !== "number" ||
      !Number.isSafeInteger(message.width) ||
      !Number.isSafeInteger(message.height) ||
      message.width <= 0 ||
      message.height <= 0
    ) {
      // The Data child validator already rejects illegal observations; this
      // guard only protects the manager against untrusted direct calls.
      return accepted;
    }
    const size: ViewportSize = Object.freeze({ width: message.width, height: message.height });
    if (
      this.currentValue !== null &&
      this.currentValue.width === size.width &&
      this.currentValue.height === size.height
    ) {
      return accepted;
    }
    this.currentValue = size;
    for (const listener of [...this.listeners]) {
      containedNotify(listener, size);
    }
    return accepted;
  }

  close(): void {
    if (this.terminated) return;
    this.terminated = true;
    this.listeners.clear();
  }
}
