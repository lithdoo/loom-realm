import type { ViewportStateV1 } from "./model.js";
import { exact, fail, positiveSafe } from "./validation-common.js";

/**
 * Viewport State v1 exact child validation.
 *
 * Recognized `viewport.state` with any shape/value violation is a child
 * protocol failure classified `protocol:"viewport"` — never `"profile"` and
 * never a silent default/zero substitution. Width/height must be positive
 * finite safe integers (CSS logical px); the wire never carries fractions.
 */
export function validateViewportState(raw: unknown): ViewportStateV1 {
  const value = exact(raw, ["type", "width", "height"], [], "viewport");
  if (value.type !== "viewport.state") fail("viewport", "type must be viewport.state");
  const width = positiveSafe(value.width, "viewport", "width");
  const height = positiveSafe(value.height, "viewport", "height");
  return Object.freeze({ type: "viewport.state", width, height });
}
