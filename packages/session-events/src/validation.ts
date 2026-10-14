import {
  WireValidationError,
  assertJsonValue,
  stringifyJson,
  utf8ByteLength,
  type JsonObject,
  type JsonValue,
} from "@loomrealm/wire";
import { sessionEventError } from "./failure.js";

export const SESSION_EVENT_LIMITS = Object.freeze({
  channelBytes: 256,
  typeBytes: 128,
  payloadBytes: 256 * 1024,
  payloadDepth: 64,
  channelsPerSubscription: 64,
  subscriptionsPerClient: 64,
  pendingEventsPerSubscription: 64,
  pendingBytesPerSubscription: 8 * 1024 * 1024,
} as const);

export interface ValidatedSessionEventInput {
  readonly channel: string;
  readonly type: string;
  readonly payload: JsonValue;
  readonly payloadBytes: number;
}

function ownDataValue(object: object, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(object, key);
  if (descriptor === undefined || !("value" in descriptor)) {
    throw sessionEventError("INVALID_REQUEST", "Expected an own data property", [key]);
  }
  return descriptor.value;
}

export function isUnicodeScalarString(value: unknown): value is string {
  if (typeof value !== "string") return false;
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      return false;
    }
  }
  return true;
}

function validateText(
  value: unknown,
  maximumBytes: number,
  path: readonly (string | number)[],
  label: string,
): string {
  if (!isUnicodeScalarString(value) || value.length === 0) {
    throw sessionEventError("INVALID_REQUEST", `Invalid ${label}`, path);
  }
  for (const scalar of value) {
    const point = scalar.codePointAt(0)!;
    if ((point >= 0 && point <= 0x1f) || point === 0x7f) {
      throw sessionEventError("INVALID_REQUEST", `Forbidden ${label} character`, path);
    }
  }
  if (utf8ByteLength(value) > maximumBytes) {
    throw sessionEventError("LIMIT_EXCEEDED", `${label} is too large`, path);
  }
  return value;
}

export function validateChannel(
  value: unknown,
  path: readonly (string | number)[] = ["channel"],
): string {
  return validateText(value, SESSION_EVENT_LIMITS.channelBytes, path, "Session Event channel");
}

export function validateEventType(
  value: unknown,
  path: readonly (string | number)[] = ["type"],
): string {
  return validateText(value, SESSION_EVENT_LIMITS.typeBytes, path, "Session Event type");
}

function targetFor(value: JsonObject | readonly JsonValue[]): JsonObject | JsonValue[] {
  return Array.isArray(value) ? new Array<JsonValue>(value.length) : {};
}

export function snapshotJsonValue(value: JsonValue): JsonValue {
  if (value === null || typeof value !== "object") return value;
  const root = targetFor(value);
  const memo = new WeakMap<object, JsonObject | JsonValue[]>([[value, root]]);
  const stack: Array<{
    readonly source: JsonObject | readonly JsonValue[];
    readonly target: JsonObject | JsonValue[];
    readonly leave: boolean;
  }> = [{ source: value, target: root, leave: false }];
  while (stack.length > 0) {
    const frame = stack.pop()!;
    if (frame.leave) {
      Object.freeze(frame.target);
      continue;
    }
    stack.push({ ...frame, leave: true });
    const keys = Array.isArray(frame.source)
      ? Array.from({ length: frame.source.length }, (_, index) => String(index))
      : Object.keys(frame.source);
    for (let index = keys.length - 1; index >= 0; index -= 1) {
      const key = keys[index]!;
      const child = ownDataValue(frame.source, key) as JsonValue;
      let detached = child;
      if (child !== null && typeof child === "object") {
        let known = memo.get(child);
        if (known === undefined) {
          known = targetFor(child);
          memo.set(child, known);
          stack.push({ source: child, target: known, leave: false });
        }
        detached = known;
      }
      Object.defineProperty(frame.target, key, {
        value: detached,
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }
  }
  return root;
}

export function validateAndSnapshotPayload(value: unknown): {
  readonly value: JsonValue;
  readonly encodedBytes: number;
} {
  try {
    assertJsonValue(value);
  } catch (error) {
    const path = error instanceof WireValidationError ? error.path : [];
    throw sessionEventError("INVALID_REQUEST", "Expected a JsonValue", ["payload", ...path]);
  }
  let depth = 0;
  const stack: Array<{ readonly value: JsonValue; readonly depth: number }> = [
    { value: value as JsonValue, depth: 0 },
  ];
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current.value === null || typeof current.value !== "object") continue;
    const containerDepth = current.depth + 1;
    depth = Math.max(depth, containerDepth);
    if (depth > SESSION_EVENT_LIMITS.payloadDepth) {
      throw sessionEventError("LIMIT_EXCEEDED", "Session Event payload depth exceeded", ["payload"]);
    }
    const children = Array.isArray(current.value)
      ? current.value
      : Object.values(current.value);
    for (const child of children) stack.push({ value: child, depth: containerDepth });
  }
  const encodedBytes = utf8ByteLength(stringifyJson(value as JsonValue));
  if (encodedBytes > SESSION_EVENT_LIMITS.payloadBytes) {
    throw sessionEventError("LIMIT_EXCEEDED", "Session Event payload is too large", ["payload"]);
  }
  return Object.freeze({
    value: snapshotJsonValue(value as JsonValue),
    encodedBytes,
  });
}

export function validatePublish(
  channel: unknown,
  type: unknown,
  payload: unknown,
): ValidatedSessionEventInput {
  const detached = validateAndSnapshotPayload(payload);
  return Object.freeze({
    channel: validateChannel(channel),
    type: validateEventType(type),
    payload: detached.value,
    payloadBytes: detached.encodedBytes,
  });
}

export function validateChannels(raw: unknown): readonly string[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw sessionEventError("INVALID_REQUEST", "Expected a non-empty channel array", ["channels"]);
  }
  if (raw.length > SESSION_EVENT_LIMITS.channelsPerSubscription) {
    throw sessionEventError("LIMIT_EXCEEDED", "Too many subscription channels", ["channels"]);
  }
  const seen = new Set<string>();
  const channels = raw.map((entry, index) => {
    const channel = validateChannel(entry, ["channels", index]);
    if (seen.has(channel)) {
      throw sessionEventError("INVALID_REQUEST", "Duplicate subscription channel", ["channels", index]);
    }
    seen.add(channel);
    return channel;
  });
  return Object.freeze(channels);
}

export function eventLogicalBytes(event: {
  readonly channel: string;
  readonly type: string;
  readonly payload: JsonValue;
  readonly source: { readonly subsystemKey: string };
}): number {
  return utf8ByteLength(event.channel) + utf8ByteLength(event.type) +
    utf8ByteLength(stringifyJson(event.payload)) +
    utf8ByteLength(event.source.subsystemKey);
}
