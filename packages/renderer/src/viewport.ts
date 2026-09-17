/**
 * Renderer-side logical presentation surface observation seam
 * (Viewport State v1 SS1/SS5, product-composition-owned).
 *
 * The Core never requires a DOM `Window`: the trusted product composition
 * designates exactly ONE stable logical presentation surface and supplies a
 * source that reports its CSS logical geometry. Raw samples may be finite
 * positive fractions (e.g. 640.9); illegal observations (non-finite, <= 0,
 * or flooring to 0 / unsafe integers) are discarded by the normalizer —
 * never turned into zero, defaults or fabricated nulls. DPR changes that do
 * not alter the CSS logical size surface as equal samples and are
 * suppressed downstream. The physical source owns listener/rAF cleanup;
 * replacement sources fence late emits through the holder subscription.
 */
export interface RendererViewportSample {
  readonly width: number;
  readonly height: number;
}

export interface RendererViewportSource {
  start(emit: (sample: RendererViewportSample) => void): () => void;
}

/**
 * Normalize a raw physical sample into a legal wire size, or return null
 * when the observation is illegal (discard, keep last legal retained).
 */
export function normalizeViewportSample(sample: unknown): { readonly width: number; readonly height: number } | null {
  if (sample === null || typeof sample !== "object") return null;
  const { width, height } = sample as { width?: unknown; height?: unknown };
  if (typeof width !== "number" || typeof height !== "number") return null;
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
  if (width <= 0 || height <= 0) return null;
  const floorWidth = Math.floor(width);
  const floorHeight = Math.floor(height);
  if (!Number.isSafeInteger(floorWidth) || !Number.isSafeInteger(floorHeight)) return null;
  if (floorWidth <= 0 || floorHeight <= 0) return null;
  return Object.freeze({ width: floorWidth, height: floorHeight });
}
