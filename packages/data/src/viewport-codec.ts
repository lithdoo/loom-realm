import type { ViewportStateV1 } from "./model.js";
import { exact, fail, positiveSafe, stringValue } from "./validation-common.js";

/**
 * Exact `viewport.state` wire/schema validation.
 *
 * Recognized `viewport.state` shape/value/direction violations belong to the
 * `viewport` protocol family; callers reach this only after top-level type
 * discrimination, so unknown `viewport.*` types never arrive here.
 */
export function validateViewportState(raw: unknown): ViewportStateV1 {
  const object = exact(raw, ["type", "width", "height"], [], "viewport");
  const type = stringValue(object.type, "viewport", "type");
  if (type !== "viewport.state") fail("viewport", "invalid viewport message type");
  return {
    type: "viewport.state",
    width: positiveSafe(object.width, "viewport", "width"),
    height: positiveSafe(object.height, "viewport", "height"),
  };
}
