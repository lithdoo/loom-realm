import type { ViewportStateV1 } from "./model.js";
import { exact, fail, positiveSafe } from "./validation-common.js";

export function validateViewportState(raw: unknown): ViewportStateV1 {
  const o = exact(raw, ["type", "width", "height"], [], "viewport");
  if (o.type !== "viewport.state") fail("viewport", "type must be viewport.state");
  const width = positiveSafe(o.width, "viewport", "width");
  const height = positiveSafe(o.height, "viewport", "height");
  return Object.freeze({ type: "viewport.state", width, height });
}
