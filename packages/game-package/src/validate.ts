import {
  JsonTextSyntaxError,
  WireValidationError,
  assertJsonValue,
  parseJsonText,
  utf8ByteLength,
  type JsonObject,
  type JsonValue,
  type WirePathSegment,
} from "@loomrealm/wire";
import {
  RealmStateError,
  prepareRealmStateDefinition,
} from "@loomrealm/realm-state";
import { GamePackageError, type GamePackageErrorCode } from "./errors.js";
import type { ValidatedGameEntryV1 } from "./model.js";
import { createValidatedGameEntrySnapshot } from "./snapshot.js";

const TOP_LEVEL_REQUIRED_KEYS = ["formatVersion", "initial", "subsystems"] as const;
const TOP_LEVEL_KEYS = [...TOP_LEVEL_REQUIRED_KEYS, "state"] as const;
const INITIAL_KEYS = ["subsystem", "input"] as const;
const DESCRIPTOR_KEYS = ["key"] as const;
const STATE_KEYS = ["records"] as const;
const SUBSYSTEM_KEY_MAX_BYTES = 256;

function fail(
  code: GamePackageErrorCode,
  path: readonly WirePathSegment[] = [],
  cause?: unknown,
): never {
  throw new GamePackageError(code, path, cause === undefined ? undefined : { cause });
}

function wireCode(path: readonly WirePathSegment[]): GamePackageErrorCode {
  if (path[0] === "initial" && path[1] === "input") {
    return "INITIAL_INPUT_INVALID";
  }
  if (
    path[0] === "subsystems" &&
    typeof path[1] === "number" &&
    path[2] === "key"
  ) {
    return "SUBSYSTEM_KEY_INVALID";
  }
  return "GAME_ENTRY_INVALID";
}

function validateRepresentation(value: unknown): asserts value is JsonValue {
  try {
    assertJsonValue(value);
  } catch (error) {
    if (error instanceof WireValidationError) {
      fail(wireCode(error.path), error.path, error);
    }
    throw error;
  }
}

function validSubsystemKey(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0) return false;
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
  return utf8ByteLength(value) <= SUBSYSTEM_KEY_MAX_BYTES;
}

function ownValue(object: JsonObject, key: string): JsonValue {
  const descriptor = Object.getOwnPropertyDescriptor(object, key);
  if (descriptor === undefined || !("value" in descriptor)) {
    fail("GAME_ENTRY_INVALID", [key]);
  }
  return descriptor.value;
}

function exactObject(
  value: JsonValue,
  requiredKeys: readonly string[],
  path: readonly WirePathSegment[],
  allowedKeys: readonly string[] = requiredKeys,
): JsonObject {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail("GAME_ENTRY_INVALID", path);
  }

  for (const key of requiredKeys) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) {
      fail("GAME_ENTRY_INVALID", [...path, key]);
    }
  }

  const allowed = new Set(allowedKeys);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) fail("GAME_ENTRY_INVALID", [...path, key]);
  }
  return value as JsonObject;
}

function member(object: JsonObject, key: string, path: readonly WirePathSegment[]): JsonValue {
  const descriptor = Object.getOwnPropertyDescriptor(object, key);
  if (descriptor === undefined || !("value" in descriptor)) {
    fail("GAME_ENTRY_INVALID", [...path, key]);
  }
  return descriptor.value;
}

function isDuplicateInitialRecordFailure(
  records: JsonValue,
  error: RealmStateError,
): boolean {
  if (
    error.code !== "INVALID_REQUEST" ||
    !Array.isArray(records) ||
    error.path?.length !== 2 ||
    error.path[0] !== "records" ||
    typeof error.path[1] !== "number"
  ) {
    return false;
  }
  const index = error.path[1];
  const candidate = records[index];
  if (
    candidate === null ||
    typeof candidate !== "object" ||
    Array.isArray(candidate) ||
    Object.keys(candidate).length !== 3 ||
    !Object.prototype.hasOwnProperty.call(candidate, "namespace") ||
    !Object.prototype.hasOwnProperty.call(candidate, "key") ||
    !Object.prototype.hasOwnProperty.call(candidate, "value")
  ) {
    return false;
  }
  const namespace = Object.getOwnPropertyDescriptor(candidate, "namespace")?.value;
  const key = Object.getOwnPropertyDescriptor(candidate, "key")?.value;
  if (typeof namespace !== "string" || typeof key !== "string") return false;
  for (let prior = 0; prior < index; prior += 1) {
    const entry = records[prior];
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) continue;
    if (
      Object.getOwnPropertyDescriptor(entry, "namespace")?.value === namespace &&
      Object.getOwnPropertyDescriptor(entry, "key")?.value === key
    ) {
      return true;
    }
  }
  return false;
}

export function validateGameEntryV1(value: unknown): ValidatedGameEntryV1 {
  validateRepresentation(value);
  const entry = exactObject(value, TOP_LEVEL_REQUIRED_KEYS, [], TOP_LEVEL_KEYS);

  const version = ownValue(entry, "formatVersion");
  if (typeof version !== "number") {
    fail("GAME_ENTRY_INVALID", ["formatVersion"]);
  }
  if (version !== 1) {
    fail("GAME_ENTRY_VERSION_UNSUPPORTED", ["formatVersion"]);
  }

  const initial = exactObject(member(entry, "initial", []), INITIAL_KEYS, ["initial"]);
  const initialSubsystem = member(initial, "subsystem", ["initial"]);
  if (typeof initialSubsystem !== "string") {
    fail("GAME_ENTRY_INVALID", ["initial", "subsystem"]);
  }
  const initialInput = member(initial, "input", ["initial"]);

  const subsystemValue = member(entry, "subsystems", []);
  if (!Array.isArray(subsystemValue)) {
    fail("GAME_ENTRY_INVALID", ["subsystems"]);
  }

  const keys: string[] = [];
  const seen = new Set<string>();
  let duplicateIndex: number | undefined;
  for (let index = 0; index < subsystemValue.length; index += 1) {
    const descriptor = exactObject(
      subsystemValue[index] as JsonValue,
      DESCRIPTOR_KEYS,
      ["subsystems", index],
    );
    const key = member(descriptor, "key", ["subsystems", index]);
    if (!validSubsystemKey(key)) {
      fail("SUBSYSTEM_KEY_INVALID", ["subsystems", index, "key"]);
    }
    if (seen.has(key) && duplicateIndex === undefined) duplicateIndex = index;
    seen.add(key);
    keys.push(key);
  }

  if (duplicateIndex !== undefined) {
    fail("SUBSYSTEM_KEY_DUPLICATE", ["subsystems", duplicateIndex, "key"]);
  }
  if (!seen.has(initialSubsystem)) {
    fail("INITIAL_TARGET_UNDECLARED", ["initial", "subsystem"]);
  }


  let stateRecords: readonly { readonly namespace: string; readonly key: string; readonly value: JsonValue }[] | undefined;
  if (Object.prototype.hasOwnProperty.call(entry, "state")) {
    const state = exactObject(member(entry, "state", []), STATE_KEYS, ["state"]);
    const records = member(state, "records", ["state"]);
    try {
      const prepared = prepareRealmStateDefinition(records);
      const byNamespace = new Map<string, Map<string, (typeof prepared.records)[number]>>();
      for (const record of prepared.records) {
        let collection = byNamespace.get(record.key.namespace);
        if (collection === undefined) {
          collection = new Map();
          byNamespace.set(record.key.namespace, collection);
        }
        collection.set(record.key.key, record);
      }
      stateRecords = Object.freeze((records as readonly JsonValue[]).map((entry, index) => {
        const record = entry as JsonObject;
        const namespace = member(record, "namespace", ["state", "records", index]) as string;
        const key = member(record, "key", ["state", "records", index]) as string;
        const preparedRecord = byNamespace.get(namespace)!.get(key)!;
        return Object.freeze({ namespace, key, value: preparedRecord.value });
      }));
    } catch (error) {
      if (error instanceof RealmStateError) {
        const path = Object.freeze(["state", ...(error.path ?? [])] as WirePathSegment[]);
        const code = error.code === "LIMIT_EXCEEDED"
          ? "REALM_STATE_INITIAL_LIMIT_EXCEEDED"
          : isDuplicateInitialRecordFailure(records, error)
            ? "REALM_STATE_INITIAL_DUPLICATE"
            : "REALM_STATE_INITIAL_INVALID";
        fail(code, path, error);
      }
      throw error;
    }
  }

  return createValidatedGameEntrySnapshot(1, initialSubsystem, initialInput, keys, stateRecords);
}

export function parseGameEntryV1(text: string): ValidatedGameEntryV1 {
  let value: JsonValue;
  try {
    value = parseJsonText(text);
  } catch (error) {
    if (error instanceof WireValidationError) {
      fail(wireCode(error.path), error.path, error);
    }
    if (error instanceof JsonTextSyntaxError) {
      fail("GAME_ENTRY_INVALID", [], error);
    }
    throw error;
  }
  return validateGameEntryV1(value);
}
