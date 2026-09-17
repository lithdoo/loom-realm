import type { ViewportStateV1 } from "@loomrealm/data";
import type { Viewport, ViewportListener, ViewportSize } from "../viewport.js";

interface Registration {
  readonly listener: ViewportListener;
  active: boolean;
}

export class ViewportManager implements Viewport {
  private value: ViewportSize | null = null;
  private terminated = false;
  private readonly listeners = new Set<Registration>();

  get current(): ViewportSize | null {
    return this.value;
  }

  accept(message: ViewportStateV1): void {
    if (this.terminated) return;
    if (message === null || typeof message !== "object") return;
    const width = (message as { width?: unknown }).width;
    const height = (message as { height?: unknown }).height;
    if (!Number.isSafeInteger(width) || Number(width) <= 0 || !Number.isSafeInteger(height) || Number(height) <= 0) {
      return;
    }
    if (this.value !== null && this.value.width === width && this.value.height === height) {
      return;
    }
    const snapshot = Object.freeze({ width: width as number, height: height as number });
    this.value = snapshot;
    for (const registration of [...this.listeners]) {
      if (registration.active) this.deliver(registration, snapshot);
    }
  }

  subscribe(listener: ViewportListener): () => void {
    if (typeof listener !== "function") throw new TypeError("Invalid viewport listener");
    if (this.terminated) return () => {};
    const registration: Registration = { listener, active: true };
    this.listeners.add(registration);
    const unsubscribe = (): void => {
      registration.active = false;
      this.listeners.delete(registration);
    };
    this.deliver(registration, this.value);
    return unsubscribe;
  }

  terminate(): void {
    this.terminated = true;
    for (const registration of this.listeners) registration.active = false;
    this.listeners.clear();
  }

  private deliver(registration: Registration, value: ViewportSize | null): void {
    if (!registration.active) return;
    try {
      const result = registration.listener(value);
      if (result !== undefined && result !== null && typeof (result as Promise<void>).then === "function") {
        void Promise.resolve(result).then(undefined, () => undefined);
      }
    } catch {
      // Listener failure is contained at the Viewport author boundary.
    }
  }
}
