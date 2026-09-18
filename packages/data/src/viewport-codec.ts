import type { ViewportStateV1 } from "./model.js";
import { exact, fail, positiveSafe } from "./validation-common.js";

export function validateViewportState(raw: unknown): ViewportStateV1 {
  if (raw !== null && typeof raw === "object") {
    for (const key of Reflect.ownKeys(raw)) {
      if (typeof key === "symbol") fail("viewport", "symbol own keys are not allowed");
    }
    for (const key of ["type", "width", "height"] as const) {
      if (!Object.prototype.hasOwnProperty.call(raw, key)) continue;
      let descriptor: PropertyDescriptor | undefined;
      try {
        descriptor = Object.getOwnPropertyDescriptor(raw, key);
      } catch (cause) {
        fail("viewport", `unable to inspect ${key}: ${String(cause)}`);
      }
      if (descriptor !== undefined && (descriptor.get !== undefined || descriptor.set !== undefined)) {
        fail("viewport", `${key} must be a data property`);
      }
    }
  }
  const o = exact(raw, ["type", "width", "height"], [], "viewport");
  if (o.type !== "viewport.state") fail("viewport", "type must be viewport.state");
  const width = positiveSafe(o.width, "viewport", "width");
  const height = positiveSafe(o.height, "viewport", "height");
  return Object.freeze({ type: "viewport.state", width, height });
}
