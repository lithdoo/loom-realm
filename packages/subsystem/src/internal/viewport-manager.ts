import type {
  Viewport,
  ViewportSize,
} from "../model.js";

type Listener = (value: ViewportSize | null) => void;

function detachedSize(width: number, height: number): ViewportSize {
  return Object.freeze({ width, height });
}

function sameSize(left: ViewportSize | null, right: ViewportSize | null): boolean {
  if (left === null || right === null) return left === right;
  return left.width === right.width && left.height === right.height;
}

function deliver(listener: Listener, value: ViewportSize | null): void {
  let result: unknown;
  try {
    result = listener(value);
  } catch {
    return;
  }
  if (
    result !== null &&
    typeof result === "object" &&
    typeof (result as { then?: unknown }).then === "function"
  ) {
    void Promise.resolve(result as PromiseLike<unknown>).then(
      () => undefined,
      () => undefined,
    );
  }
}

export class ViewportManager {
  private live = true;
  private currentValue: ViewportSize | null = null;
  private readonly listeners = new Set<Listener>();
  readonly viewport: Viewport;

  constructor() {
    const manager = this;
    this.viewport = Object.freeze({
      get current(): ViewportSize | null {
        return manager.currentValue;
      },
      subscribe(listener: Listener): () => void {
        if (typeof listener !== "function") {
          throw new TypeError("Viewport subscribe listener must be a function");
        }
        if (!manager.live) {
          return () => undefined;
        }
        manager.listeners.add(listener);
        deliver(listener, manager.currentValue);
        let active = true;
        return () => {
          if (!active) return;
          active = false;
          manager.listeners.delete(listener);
        };
      },
    });
  }

  applyState(width: number, height: number): void {
    if (!this.live) return;
    const next = detachedSize(width, height);
    if (sameSize(this.currentValue, next)) return;
    this.currentValue = next;
    const snapshot = [...this.listeners];
    for (const listener of snapshot) {
      if (!this.live || !this.listeners.has(listener)) continue;
      deliver(listener, this.currentValue);
    }
  }

  close(): void {
    if (!this.live) return;
    this.live = false;
    this.listeners.clear();
  }
}
