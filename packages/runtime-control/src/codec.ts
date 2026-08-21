import {
  assertJsonValue,
  decodeJsonRpcMessage,
  parseJsonText,
  stringifyJson,
  utf8ByteLength,
  type JsonRpcMessage,
  type JsonValue,
} from "@loomrealm/wire";

export const MESSAGE_BYTES = 1_048_576;
export const BUSINESS_BYTES = 524_288;
export const MAX_DEPTH = 64;

export class ProfileError extends TypeError {}

function fail(message: string): never {
  throw new ProfileError(message);
}
function invalidUnicode(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true;
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) return true;
  }
  return false;
}

export function stringValue(
  value: unknown,
  name: string,
  maxBytes: number,
  empty = false,
): string {
  if (
    typeof value !== "string" ||
    (!empty && value.length === 0) ||
    invalidUnicode(value) ||
    utf8ByteLength(value) > maxBytes
  ) {
    fail(`Invalid ${name}`);
  }
  return value;
}

export function asciiCode(value: unknown, name: string): string {
  const text = stringValue(value, name, 128);
  for (let index = 0; index < text.length; index += 1)
    if (text.charCodeAt(index) > 0x7f) fail(`Invalid ${name}`);
  return text;
}

export function frameFailureCode(value: unknown): string {
  const text = asciiCode(value, "FrameFailure.code");
  if (!/^[A-Za-z][A-Za-z0-9._:-]{0,127}$/.test(text)) {
    fail("Invalid FrameFailure.code");
  }
  return text;
}

export function objectValue(
  value: unknown,
  name = "object",
): Record<string, JsonValue> {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    fail(`Expected ${name}`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null)
    fail(`Expected plain ${name}`);
  return value as Record<string, JsonValue>;
}

export function member(
  object: Record<string, JsonValue>,
  key: string,
): JsonValue {
  const descriptor = Object.getOwnPropertyDescriptor(object, key);
  if (descriptor === undefined || !("value" in descriptor))
    fail(`Missing data member ${key}`);
  return descriptor.value as JsonValue;
}

export function exact(
  object: Record<string, JsonValue>,
  required: readonly string[],
  optional: readonly string[] = [],
): void {
  const allowed = new Set([...required, ...optional]);
  for (const key of required)
    if (!Object.prototype.hasOwnProperty.call(object, key))
      fail(`Missing member ${key}`);
  for (const key of Object.keys(object))
    if (!allowed.has(key)) fail(`Unexpected member ${key}`);
}

export function measure(value: unknown, limit = MESSAGE_BYTES): number {
  assertJsonValue(value);
  type Work = { value: JsonValue; depth: number } | { token: string };
  const stack: Work[] = [{ value: value as JsonValue, depth: 1 }];
  let bytes = 0;
  const add = (count: number): void => {
    bytes += count;
    if (bytes > limit) fail("Serialized JSON exceeds byte limit");
  };
  while (stack.length > 0) {
    const work = stack.pop()!;
    if ("token" in work) {
      add(utf8ByteLength(work.token));
      continue;
    }
    const item = work.value;
    if (item === null) {
      add(4);
      continue;
    }
    if (typeof item === "boolean") {
      add(item ? 4 : 5);
      continue;
    }
    if (typeof item === "number") {
      add(utf8ByteLength(JSON.stringify(item)));
      continue;
    }
    if (typeof item === "string") {
      stringValue(item, "JSON string", 262_144, true);
      add(utf8ByteLength(JSON.stringify(item)));
      continue;
    }
    if (work.depth > MAX_DEPTH) fail("JSON depth exceeds limit");
    if (Array.isArray(item)) {
      if (item.length > 16_384) fail("Array item limit exceeded");
      add(2);
      for (let index = item.length - 1; index >= 0; index -= 1) {
        stack.push({ value: item[index]!, depth: work.depth + 1 });
        if (index > 0) stack.push({ token: "," });
      }
    } else {
      const keys = Object.keys(item);
      if (keys.length > 16_384) fail("Object member limit exceeded");
      add(2);
      for (let index = keys.length - 1; index >= 0; index -= 1) {
        const key = keys[index]!;
        stringValue(key, "object key", 256, true);
        const descriptor = Object.getOwnPropertyDescriptor(item, key);
        if (descriptor === undefined || !("value" in descriptor))
          fail("Expected own data member");
        stack.push({
          value: descriptor.value as JsonValue,
          depth: work.depth + 1,
        });
        stack.push({ token: ":" });
        stack.push({ token: JSON.stringify(key) });
        if (index > 0) stack.push({ token: "," });
      }
    }
  }
  return bytes;
}

export function businessValue(value: unknown): JsonValue {
  measure(value, BUSINESS_BYTES);
  return value as JsonValue;
}

export function encode(value: JsonValue): string {
  measure(value);
  return stringifyJson(value);
}

export function decode(text: unknown): JsonRpcMessage {
  if (
    typeof text !== "string" ||
    invalidUnicode(text) ||
    utf8ByteLength(text) > MESSAGE_BYTES
  )
    fail("Invalid carrier message");
  const value = parseJsonText(text);
  measure(value);
  return decodeJsonRpcMessage(value);
}
