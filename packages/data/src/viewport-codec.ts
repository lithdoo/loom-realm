import type { ViewportStateV1 } from "./model.js";
import { exact, fail, positiveSafe } from "./validation-common.js";

export function validateViewportState(raw: unknown): ViewportStateV1 {
  const parsed = exact(raw, ["type", "width", "height"], [], "viewport");
  if (parsed.type !== "viewport.state") fail("viewport", "wrong type");
  const width = positiveSafe(parsed.width, "viewport", "width");
  const height = positiveSafe(parsed.height, "viewport", "height");
  return Object.freeze({ type: "viewport.state", width, height });
}
