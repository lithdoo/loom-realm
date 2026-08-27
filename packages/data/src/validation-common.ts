import type { JsonObject, JsonValue } from "@loomrealm/wire";
import {
  assertExactKeys,
  assertJsonArray,
  assertJsonObject,
  jsonDepth,
  stringifyJson,
  utf8ByteLength,
} from "@loomrealm/wire";
import type { DataProtocolFamily } from "./model.js";

export const MAX_MESSAGE_BYTES = 1_048_576;
export const MAX_JSON_DEPTH = 64;
export const MAX_PAYLOAD_BYTES = 262_144;
export const MAX_PAYLOAD_DEPTH = 32;
export const MAX_CONTAINER_MEMBERS = 16_384;

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

function validUnicodeScalarString(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const c = value.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const n = value.charCodeAt(i + 1);
      if (!(n >= 0xdc00 && n <= 0xdfff)) return false;
      i += 1;
    } else if (c >= 0xdc00 && c <= 0xdfff) {
      return false;
    }
  }
  return true;
}

export function boundedString(
  value: unknown,
  protocol: DataProtocolFamily,
  label: string,
  min: number,
  max: number,
): string {
  const text = stringValue(value, protocol, label);
  if (!validUnicodeScalarString(text)) {
    fail(protocol, `${label} has invalid Unicode scalar sequence`);
  }
  const bytes = utf8ByteLength(text);
  if (bytes < min || bytes > max) fail(protocol, `${label} byte length out of range`);
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

export function int32(
  value: unknown,
  protocol: DataProtocolFamily,
  label: string,
): number {
  if (
    !Number.isInteger(value) ||
    (value as number) < -2147483648 ||
    (value as number) > 2147483647
  ) {
    fail(protocol, `${label} must be int32`);
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
    assertJsonObject(value);
    assertExactKeys(value, required, optional);
    return value;
  } catch (cause) {
    fail(protocol, `invalid closed schema: ${String(cause)}`);
  }
}

export function array(
  value: unknown,
  protocol: DataProtocolFamily,
  label: string,
): readonly JsonValue[] {
  try {
    assertJsonArray(value);
    return value;
  } catch {
    fail(protocol, `${label} must be array`);
  }
}

export function object(
  value: unknown,
  protocol: DataProtocolFamily,
  label: string,
): JsonObject {
  try {
    assertJsonObject(value);
    return value;
  } catch {
    fail(protocol, `${label} must be object`);
  }
}

export function assertBoundedJson(
  value: JsonValue,
  protocol: DataProtocolFamily,
  maxDepth = MAX_PAYLOAD_DEPTH,
): void {
  if (jsonDepth(value) > maxDepth) fail(protocol, "JSON depth limit exceeded");
  const stack: JsonValue[] = [value];
  while (stack.length) {
    const current = stack.pop();
    if (current === undefined || current === null || typeof current !== "object") continue;
    if (Array.isArray(current)) {
      if (current.length > MAX_CONTAINER_MEMBERS) fail(protocol, "array member limit exceeded");
      for (const child of current) stack.push(child);
    } else {
      const keys = Object.keys(current);
      if (keys.length > MAX_CONTAINER_MEMBERS) fail(protocol, "object member limit exceeded");
      for (const key of keys) stack.push((current as JsonObject)[key] as JsonValue);
    }
  }
}

export function assertPayload(
  payload: unknown,
  protocol: DataProtocolFamily,
): JsonObject {
  const result = object(payload, protocol, "payload");
  assertBoundedJson(result, protocol);
  if (utf8ByteLength(stringifyJson(result)) > MAX_PAYLOAD_BYTES) {
    fail(protocol, "payload byte limit exceeded");
  }
  return result;
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
