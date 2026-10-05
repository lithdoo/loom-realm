import {
  WireValidationError,
  assertJsonValue,
  stringifyJson,
  utf8ByteLength,
  type JsonObject,
  type JsonValue,
} from "@loomrealm/wire";
import { realmStateError } from "./failure.js";
import type {
  PreparedRealmStateDefinition,
  RealmStateCondition,
  RealmStateKey,
  RealmStateTransaction,
  RealmStatePut,
} from "./model.js";

export const REALM_STATE_LIMITS = Object.freeze({
  namespaceBytes: 64,
  keyBytes: 256,
  valueBytes: 256 * 1024,
  valueDepth: 64,
  initialRecords: 4096,
  initialPayloadBytes: 8 * 1024 * 1024,
  materializedRecords: 16384,
  readKeys: 256,
  subscribeKeys: 256,
  transactionConditions: 128,
  transactionWrites: 128,
  transactionPayloadBytes: 2 * 1024 * 1024,
  subscriptionPendingEvents: 64,
  subscriptionPendingPayloadBytes: 8 * 1024 * 1024,
} as const);

export interface JsonValueMetrics {
  readonly encodedBytes: number;
  readonly depth: number;
}

function ownDataValue(object: object, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(object, key);
  if (descriptor === undefined || !("value" in descriptor)) {
    throw realmStateError("INVALID_REQUEST", "Expected an own data property", [key]);
  }
  return descriptor.value;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(
  value: unknown,
  keys: readonly string[],
  path: readonly (string | number)[],
): asserts value is Record<string, unknown> {
  if (!isPlainRecord(value)) {
    throw realmStateError("INVALID_REQUEST", "Expected an object", path);
  }
  const actual = Object.keys(value);
  if (
    actual.length !== keys.length ||
    keys.some((key) => !Object.prototype.hasOwnProperty.call(value, key))
  ) {
    throw realmStateError("INVALID_REQUEST", "Unexpected object shape", path);
  }
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

function validateIdentityPart(
  value: unknown,
  maximumBytes: number,
  path: readonly (string | number)[],
): asserts value is string {
  if (!isUnicodeScalarString(value) || value.length === 0) {
    throw realmStateError("INVALID_REQUEST", "Invalid Realm State identity", path);
  }
  for (const scalar of value) {
    const codePoint = scalar.codePointAt(0)!;
    if (
      scalar === "/" ||
      (codePoint >= 0 && codePoint <= 0x1f) ||
      codePoint === 0x7f
    ) {
      throw realmStateError("INVALID_REQUEST", "Forbidden Realm State identity character", path);
    }
  }
  if (utf8ByteLength(value) > maximumBytes) {
    throw realmStateError("LIMIT_EXCEEDED", "Realm State identity is too large", path);
  }
}

export function validateNamespace(
  value: unknown,
  path: readonly (string | number)[] = ["namespace"],
): string {
  validateIdentityPart(value, REALM_STATE_LIMITS.namespaceBytes, path);
  return value;
}

export function validateRealmStateKey(
  value: unknown,
  path: readonly (string | number)[] = [],
): RealmStateKey {
  exactKeys(value, ["namespace", "key"], path);
  const namespace = ownDataValue(value, "namespace");
  const key = ownDataValue(value, "key");
  validateIdentityPart(namespace, REALM_STATE_LIMITS.namespaceBytes, [...path, "namespace"]);
  validateIdentityPart(key, REALM_STATE_LIMITS.keyBytes, [...path, "key"]);
  return Object.freeze({ namespace, key });
}

export function identityToken(key: RealmStateKey): string {
  return `${key.namespace.length}:${key.namespace}${key.key}`;
}

function compareUtf8(left: string, right: string): number {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  const length = Math.min(leftBytes.length, rightBytes.length);
  for (let index = 0; index < length; index += 1) {
    const difference = leftBytes[index]! - rightBytes[index]!;
    if (difference !== 0) return difference;
  }
  return leftBytes.length - rightBytes.length;
}

export function compareRealmStateKeys(left: RealmStateKey, right: RealmStateKey): number {
  const namespace = compareUtf8(left.namespace, right.namespace);
  return namespace === 0 ? compareUtf8(left.key, right.key) : namespace;
}

export function jsonValueMetrics(value: unknown): JsonValueMetrics {
  try {
    assertJsonValue(value);
  } catch (error) {
    const path = error instanceof WireValidationError ? error.path : [];
    throw realmStateError("INVALID_REQUEST", "Expected a JsonValue", path);
  }
  let depth = 0;
  const stack: Array<{ readonly value: JsonValue; readonly depth: number }> = [
    { value, depth: 0 },
  ];
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current.value === null || typeof current.value !== "object") continue;
    const containerDepth = current.depth + 1;
    if (containerDepth > depth) depth = containerDepth;
    if (Array.isArray(current.value)) {
      for (const child of current.value) stack.push({ value: child, depth: containerDepth });
    } else {
      for (const child of Object.values(current.value)) {
        stack.push({ value: child, depth: containerDepth });
      }
    }
  }
  return Object.freeze({ encodedBytes: utf8ByteLength(stringifyJson(value)), depth });
}

function targetFor(value: JsonObject | readonly JsonValue[]): JsonObject | JsonValue[] {
  return Array.isArray(value) ? new Array<JsonValue>(value.length) : {};
}

export function snapshotJsonValue(value: JsonValue): JsonValue {
  if (value === null || typeof value !== "object") return value;
  const root = targetFor(value);
  const memo = new WeakMap<object, JsonObject | JsonValue[]>([[value, root]]);
  const stack: Array<{ source: JsonObject | readonly JsonValue[]; target: JsonObject | JsonValue[]; leave: boolean }> = [
    { source: value, target: root, leave: false },
  ];
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

export function validateAndSnapshotValue(
  value: unknown,
  path: readonly (string | number)[] = [],
): { readonly value: JsonValue; readonly metrics: JsonValueMetrics } {
  let metrics: JsonValueMetrics;
  try {
    metrics = jsonValueMetrics(value);
  } catch (error) {
    if (error instanceof Error && "path" in error) {
      const suffix = (error as { path?: readonly (string | number)[] }).path ?? [];
      throw realmStateError(
        (error as { code?: "INVALID_REQUEST" | "LIMIT_EXCEEDED" }).code ?? "INVALID_REQUEST",
        error.message,
        [...path, ...suffix],
      );
    }
    throw error;
  }
  if (metrics.depth > REALM_STATE_LIMITS.valueDepth || metrics.encodedBytes > REALM_STATE_LIMITS.valueBytes) {
    throw realmStateError("LIMIT_EXCEEDED", "Realm State value exceeds a limit", path);
  }
  return Object.freeze({ value: snapshotJsonValue(value as JsonValue), metrics });
}

export function validateKeyList(
  raw: unknown,
  maximum: number,
  path: readonly (string | number)[] = ["keys"],
): readonly RealmStateKey[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw realmStateError("INVALID_REQUEST", "Expected a non-empty key array", path);
  }
  if (raw.length > maximum) {
    throw realmStateError("LIMIT_EXCEEDED", "Too many Realm State keys", path);
  }
  const seen = new Set<string>();
  const keys = raw.map((entry, index) => {
    const key = validateRealmStateKey(entry, [...path, index]);
    const token = identityToken(key);
    if (seen.has(token)) {
      throw realmStateError("INVALID_REQUEST", "Duplicate Realm State key", [...path, index]);
    }
    seen.add(token);
    return key;
  });
  return Object.freeze(keys);
}

export interface ValidatedRealmStateTransaction {
  readonly conditions: readonly RealmStateCondition[];
  readonly writes: readonly RealmStatePut[];
}

export function validateTransaction(raw: unknown): ValidatedRealmStateTransaction {
  exactKeys(raw, ["conditions", "writes"], []);
  const rawConditions = ownDataValue(raw, "conditions");
  const rawWrites = ownDataValue(raw, "writes");
  if (!Array.isArray(rawConditions) || rawConditions.length === 0 || !Array.isArray(rawWrites) || rawWrites.length === 0) {
    throw realmStateError("INVALID_REQUEST", "Transaction requires conditions and writes");
  }
  if (rawConditions.length > REALM_STATE_LIMITS.transactionConditions || rawWrites.length > REALM_STATE_LIMITS.transactionWrites) {
    throw realmStateError("LIMIT_EXCEEDED", "Transaction count limit exceeded");
  }
  const conditionTokens = new Set<string>();
  const conditions = rawConditions.map((entry, index) => {
    exactKeys(entry, ["key", "version"], ["conditions", index]);
    const key = validateRealmStateKey(ownDataValue(entry, "key"), ["conditions", index, "key"]);
    const version = ownDataValue(entry, "version");
    if (!Number.isSafeInteger(version) || (version as number) < 0) {
      throw realmStateError("INVALID_REQUEST", "Invalid Record version", ["conditions", index, "version"]);
    }
    const token = identityToken(key);
    if (conditionTokens.has(token)) throw realmStateError("INVALID_REQUEST", "Duplicate condition", ["conditions", index]);
    conditionTokens.add(token);
    return Object.freeze({ key, version: version as number });
  });
  let payloadBytes = 0;
  const writeTokens = new Set<string>();
  const writes = rawWrites.map((entry, index) => {
    exactKeys(entry, ["type", "key", "value"], ["writes", index]);
    if (ownDataValue(entry, "type") !== "put") {
      throw realmStateError("INVALID_REQUEST", "Unknown write type", ["writes", index, "type"]);
    }
    const key = validateRealmStateKey(ownDataValue(entry, "key"), ["writes", index, "key"]);
    const token = identityToken(key);
    if (writeTokens.has(token)) throw realmStateError("INVALID_REQUEST", "Duplicate write", ["writes", index]);
    writeTokens.add(token);
    const detached = validateAndSnapshotValue(ownDataValue(entry, "value"), ["writes", index, "value"]);
    payloadBytes += detached.metrics.encodedBytes;
    if (payloadBytes > REALM_STATE_LIMITS.transactionPayloadBytes) {
      throw realmStateError("LIMIT_EXCEEDED", "Transaction payload limit exceeded", ["writes", index, "value"]);
    }
    return Object.freeze({ type: "put" as const, key, value: detached.value });
  });
  for (let index = 0; index < writes.length; index += 1) {
    if (!conditionTokens.has(identityToken(writes[index]!.key))) {
      throw realmStateError("INVALID_REQUEST", "Write has no matching condition", ["writes", index, "key"]);
    }
  }
  return Object.freeze({ conditions: Object.freeze(conditions), writes: Object.freeze(writes) });
}

export function prepareRealmStateDefinition(rawRecords: unknown): PreparedRealmStateDefinition {
  if (!Array.isArray(rawRecords)) throw realmStateError("INVALID_REQUEST", "Expected State records", ["records"]);
  if (rawRecords.length > REALM_STATE_LIMITS.initialRecords) {
    throw realmStateError("LIMIT_EXCEEDED", "Initial Record count exceeded", ["records"]);
  }
  let payload = 0;
  const seen = new Set<string>();
  const records = rawRecords.map((entry, index) => {
    exactKeys(entry, ["namespace", "key", "value"], ["records", index]);
    const key = validateRealmStateKey(
      Object.freeze({
        namespace: ownDataValue(entry, "namespace"),
        key: ownDataValue(entry, "key"),
      }),
      ["records", index],
    );
    const token = identityToken(key);
    if (seen.has(token)) throw realmStateError("INVALID_REQUEST", "Duplicate initial Record", ["records", index]);
    seen.add(token);
    const detached = validateAndSnapshotValue(ownDataValue(entry, "value"), ["records", index, "value"]);
    payload += utf8ByteLength(key.namespace) + utf8ByteLength(key.key) + detached.metrics.encodedBytes;
    if (payload > REALM_STATE_LIMITS.initialPayloadBytes) {
      throw realmStateError("LIMIT_EXCEEDED", "Initial State payload exceeded", ["records", index]);
    }
    return Object.freeze({ key, value: detached.value });
  });
  records.sort((left, right) => compareRealmStateKeys(left.key, right.key));
  return Object.freeze({ records: Object.freeze(records) });
}

export function subscriptionRecordPayloadBytes(record: {
  readonly key: RealmStateKey;
  readonly value: JsonValue;
}): number {
  return utf8ByteLength(record.key.namespace) + utf8ByteLength(record.key.key) + jsonValueMetrics(record.value).encodedBytes;
}
