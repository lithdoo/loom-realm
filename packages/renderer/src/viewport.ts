/**
 * Platform-neutral Renderer viewport observation seam.
 *
 * The platform adapter owns sampling a physical surface; Core only consumes
 * the injected source and never hardcodes DOM/Window/DPR or a default size.
 */
export interface RendererViewportSource {
  start(emit: (sample: Readonly<{ width: number; height: number }>) => void): () => void;
}

export type RendererViewportSize = Readonly<{ width: number; height: number }>;

/**
 * Trusted raw sample validation: plain object with exactly the own numeric
 * data properties `width` and `height`. Accessor (getter/setter) and
 * inherited/Proxy-poisoned observations are ignored without being invoked.
 */
export function normalizeViewportSample(value: unknown): RendererViewportSize | null {
  try {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return null;
    const names = Object.getOwnPropertyNames(value);
    if (names.length !== 2 || !names.includes("width") || !names.includes("height")) return null;
    const width = dimension(value, "width");
    const height = dimension(value, "height");
    if (width === null || height === null) return null;
    return Object.freeze({ width, height });
  } catch {
    return null;
  }
}

function dimension(object: object, key: "width" | "height"): number | null {
  const descriptor = Object.getOwnPropertyDescriptor(object, key);
  if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) return null;
  const value = descriptor.value;
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  const floored = Math.floor(value);
  if (!Number.isSafeInteger(floored) || floored <= 0) return null;
  return floored;
}
