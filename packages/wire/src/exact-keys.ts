import { WireValidationError, type WirePathSegment } from "./errors.js";
import type { JsonObject } from "./json-value.js";
import { assertJsonObjectAt } from "./validation.js";

export function assertExactKeysAt(
  object: unknown,
  requiredKeys: readonly string[],
  optionalKeys: readonly string[] = [],
  path: readonly WirePathSegment[] = [],
): asserts object is JsonObject {
  assertJsonObjectAt(object, path);
  const allowed = new Set([...requiredKeys, ...optionalKeys]);

  for (const required of requiredKeys) {
    if (!Object.prototype.hasOwnProperty.call(object, required)) {
      throw new WireValidationError("Missing required member", [...path, required]);
    }
  }

  for (const key of Object.keys(object)) {
    if (!allowed.has(key)) {
      throw new WireValidationError("Unknown member", [...path, key]);
    }
  }
}

export function assertExactKeys(
  object: JsonObject,
  requiredKeys: readonly string[],
  optionalKeys: readonly string[] = [],
): void {
  assertExactKeysAt(object, requiredKeys, optionalKeys);
}
