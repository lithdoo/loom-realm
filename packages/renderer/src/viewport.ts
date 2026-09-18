export interface RendererViewportSource {
  start(emit: (sample: Readonly<{ width: number; height: number }>) => void): () => void;
}

export type NormalizedViewportSize = {
  readonly width: number;
  readonly height: number;
};

function isDataProperty(
  sample: object,
  key: "width" | "height",
): number | null {
  let descriptor: PropertyDescriptor | undefined;
  try {
    descriptor = Object.getOwnPropertyDescriptor(sample, key);
  } catch {
    return null;
  }
  if (descriptor === undefined) return null;
  if (descriptor.get !== undefined || descriptor.set !== undefined) return null;
  if (typeof descriptor.value !== "number") return null;
  return descriptor.value;
}

/** Trusted raw source sample → normalized CSS logical size, or null if ignored. */
export function normalizeViewportSample(sample: unknown): NormalizedViewportSize | null {
  if (sample === null || typeof sample !== "object") return null;
  let ownKeys: string[];
  try {
    ownKeys = Object.getOwnPropertyNames(sample);
  } catch {
    return null;
  }
  if (ownKeys.length !== 2 || !ownKeys.includes("width") || !ownKeys.includes("height")) {
    return null;
  }
  const widthRaw = isDataProperty(sample, "width");
  const heightRaw = isDataProperty(sample, "height");
  if (widthRaw === null || heightRaw === null) return null;
  if (!Number.isFinite(widthRaw) || !Number.isFinite(heightRaw)) return null;
  if (!(widthRaw > 0) || !(heightRaw > 0)) return null;
  const width = Math.floor(widthRaw);
  const height = Math.floor(heightRaw);
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height)) return null;
  if (width <= 0 || height <= 0) return null;
  return Object.freeze({ width, height });
}

export function sameViewportSize(
  left: NormalizedViewportSize,
  right: NormalizedViewportSize,
): boolean {
  return left.width === right.width && left.height === right.height;
}
