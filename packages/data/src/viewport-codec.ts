import type { ViewportStateV1 } from "./model.js";
import { exact, fail, positiveSafe } from "./validation-common.js";

/**
 * Viewport State v1 child codec: exact own-key `{type,width,height}` wire schema.
 *
 * Wire authority is the parsed JSON object (never a raw JS source object): missing or
 * extra members and non-positive-safe-integer values are child (`viewport`) protocol
 * violations. Invalid raw JSON text, bytes/depth and unknown types stay in the
 * `profile` family and are rejected before this validator runs; trusted local
 * outbound callers with invalid values follow the existing local-fatal send rule.
 */
export function validateViewportState(raw: unknown): ViewportStateV1 {
  const p = exact(raw, ["type", "width", "height"], [], "viewport");
  if (p.type !== "viewport.state") fail("viewport", "wrong type");
  positiveSafe(p.width, "viewport", "width");
  positiveSafe(p.height, "viewport", "height");
  return p as unknown as ViewportStateV1;
}
