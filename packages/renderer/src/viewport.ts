/**
 * Platform-agnostic logical presentation surface observation seam.
 *
 * Core observes CSS logical pixels only: no host surface API, no pixel ratio,
 * no device pixels and no product defaults are part of this contract. A source
 * is owned by one Renderer Control participant and MUST synchronously emit the
 * current size from `start()` when a legal observation is already available.
 */
export interface RendererViewportSource {
  start(emit: (sample: Readonly<{ width: number; height: number }>) => void): () => void;
}

export interface ViewportSample {
  readonly width: number;
  readonly height: number;
}

/**
 * Normalize one trusted raw JS sample. The exact own `width`/`height` pair of a
 * plain object is read through property descriptors so prototype members and
 * accessors (including Proxy traps) are rejected without ever being invoked.
 * Both values must be finite positive numbers; each is floored and the result
 * must stay a positive safe integer. Anything else is an ignorable sample: the
 * previous valid observation is retained and nothing is published.
 */
export function normalizeViewportSample(raw: unknown): ViewportSample | null {
  try {
    if (raw === null || typeof raw !== "object") return null;
    if (Reflect.ownKeys(raw).length !== 2) return null;
    const widthDescriptor = Object.getOwnPropertyDescriptor(raw, "width");
    const heightDescriptor = Object.getOwnPropertyDescriptor(raw, "height");
    if (widthDescriptor === undefined || heightDescriptor === undefined) return null;
    if (!("value" in widthDescriptor) || !("value" in heightDescriptor)) return null;
    const width = widthDescriptor.value;
    const height = heightDescriptor.value;
    if (typeof width !== "number" || typeof height !== "number") return null;
    if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
    if (width <= 0 || height <= 0) return null;
    const flooredWidth = Math.floor(width);
    const flooredHeight = Math.floor(height);
    if (!Number.isSafeInteger(flooredWidth) || flooredWidth <= 0) return null;
    if (!Number.isSafeInteger(flooredHeight) || flooredHeight <= 0) return null;
    return Object.freeze({ width: flooredWidth, height: flooredHeight });
  } catch {
    return null;
  }
}
