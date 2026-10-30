import type { JsonObject, JsonValue } from "@loomrealm/wire";
import type { DataProtocolFamily } from "./model.js";

export class DataProtocolError extends Error {
  constructor(
    readonly protocol: DataProtocolFamily,
    message: string,
  ) {
    super(message);
  }
}

export function fail(protocol: DataProtocolFamily, message: string): never {
  throw new DataProtocolError(protocol, message);
}

export function stringValue(
  value: unknown,
  protocol: DataProtocolFamily,
  label: string,
): string {
  if (typeof value !== "string") fail(protocol, `${label} must be string`);
  return value;
}

export function scalarString(
  value: unknown,
  protocol: DataProtocolFamily,
  label: string,
  allowEmpty = false,
): string {
  const text = stringValue(value, protocol, label);
  for (let index = 0; index < text.length; index += 1) {
    const unit = text.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = text.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) {
        fail(protocol, `${label} has invalid Unicode scalar sequence`);
      }
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      fail(protocol, `${label} has invalid Unicode scalar sequence`);
    }
  }
  if (!allowEmpty && text.length === 0) fail(protocol, `${label} must be non-empty`);
  return text;
}

export function positiveSafe(
  value: unknown,
  protocol: DataProtocolFamily,
  label: string,
): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    fail(protocol, `${label} must be positive safe integer`);
  }
  return value as number;
}

export function signedSafe(
  value: unknown,
  protocol: DataProtocolFamily,
  label: string,
): number {
  if (
    !Number.isSafeInteger(value)
  ) {
    fail(protocol, `${label} must be signed safe integer`);
  }
  return value as number;
}

export function exact(
  value: unknown,
  required: readonly string[],
  optional: readonly string[],
  protocol: DataProtocolFamily,
): JsonObject {
  try {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      fail(protocol, "expected plain JSON object");
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      fail(protocol, "expected plain JSON object");
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const allowed = new Set([...required, ...optional]);
    for (const key of Reflect.ownKeys(descriptors)) {
      if (typeof key !== "string") fail(protocol, "schema object cannot contain symbol members");
      const descriptor = descriptors[key];
      if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) {
        fail(protocol, `schema member must be enumerable data property: ${key}`);
      }
      if (!allowed.has(key)) fail(protocol, `unknown member: ${key}`);
    }
    for (const key of required) {
      if (!Object.prototype.hasOwnProperty.call(descriptors, key)) {
        fail(protocol, `missing required member: ${key}`);
      }
    }
    return value as JsonObject;
  } catch (cause) {
    if (cause instanceof DataProtocolError) throw cause;
    fail(protocol, `invalid closed schema: ${String(cause)}`);
  }
}

export function array(
  value: unknown,
  protocol: DataProtocolFamily,
  label: string,
): readonly JsonValue[] {
  if (!Array.isArray(value)) fail(protocol, `${label} must be array`);
  return value as readonly JsonValue[];
}

export function object(
  value: unknown,
  protocol: DataProtocolFamily,
  label: string,
): JsonObject {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail(protocol, `${label} must be object`);
  }
  try {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) fail(protocol, `${label} must be plain object`);
  } catch (cause) {
    if (cause instanceof DataProtocolError) throw cause;
    fail(protocol, `${label} must be plain object`);
  }
  return value as JsonObject;
}

/** UTF-8 byte lexicographic order, equivalent to Unicode code-point order for valid scalars. */
export function utf8LexicalLess(left: string, right: string): boolean {
  const leftIter = left[Symbol.iterator]();
  const rightIter = right[Symbol.iterator]();
  for (;;) {
    const a = leftIter.next();
    const b = rightIter.next();
    if (a.done && b.done) return false;
    if (a.done) return true;
    if (b.done) return false;
    const ac = a.value.codePointAt(0) ?? 0;
    const bc = b.value.codePointAt(0) ?? 0;
    if (ac !== bc) return ac < bc;
  }
}
