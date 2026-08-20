import { WireValidationError, type WirePathSegment } from "./errors.js";
import type { JsonArray, JsonObject, JsonValue } from "./json-value.js";

interface VisitFrame {
  readonly kind: "visit";
  readonly value: unknown;
  readonly path: PathNode | null;
}

interface LeaveFrame {
  readonly kind: "leave";
  readonly value: object;
}

type ValidationFrame = VisitFrame | LeaveFrame;

interface PathNode {
  readonly parent: PathNode | null;
  readonly segment: WirePathSegment;
}

function pathFromSegments(segments: readonly WirePathSegment[]): PathNode | null {
  let path: PathNode | null = null;
  for (const segment of segments) path = { parent: path, segment };
  return path;
}

function childPath(parent: PathNode | null, segment: WirePathSegment): PathNode {
  return { parent, segment };
}

function materializePath(path: PathNode | null): WirePathSegment[] {
  const reversed: WirePathSegment[] = [];
  for (let cursor = path; cursor !== null; cursor = cursor.parent) {
    reversed.push(cursor.segment);
  }
  reversed.reverse();
  return reversed;
}

function fail(message: string, path: PathNode | null): never {
  throw new WireValidationError(message, materializePath(path));
}

function inspectObject(
  value: object,
  path: PathNode | null,
): { readonly array: boolean; readonly descriptors: PropertyDescriptorMap } {
  try {
    const array = Array.isArray(value);
    const prototype = Object.getPrototypeOf(value);
    if (!array && prototype !== Object.prototype && prototype !== null) {
      fail("Expected a plain JSON object", path);
    }

    return {
      array,
      descriptors: Object.getOwnPropertyDescriptors(value),
    };
  } catch (error) {
    if (error instanceof WireValidationError) throw error;
    fail("Unable to inspect JSON container", path);
  }
}

function arrayIndex(key: string): number | null {
  if (key === "" || key === "-0") return null;
  const index = Number(key);
  if (!Number.isInteger(index) || index < 0 || index >= 0xffff_ffff) return null;
  return String(index) === key ? index : null;
}

function validateJsonValueAt(value: unknown, rootPath: readonly WirePathSegment[]): void {
  const activeAncestors = new WeakSet<object>();
  const stack: ValidationFrame[] = [
    { kind: "visit", value, path: pathFromSegments(rootPath) },
  ];

  while (stack.length > 0) {
    const frame = stack.pop();
    if (frame === undefined) break;

    if (frame.kind === "leave") {
      activeAncestors.delete(frame.value);
      continue;
    }

    const current = frame.value;
    if (
      current === null ||
      typeof current === "string" ||
      typeof current === "boolean"
    ) {
      continue;
    }

    if (typeof current === "number") {
      if (!Number.isFinite(current)) fail("Expected a finite number", frame.path);
      continue;
    }

    if (typeof current !== "object") {
      fail("Expected a JSON value", frame.path);
    }

    if (activeAncestors.has(current)) {
      fail("Cyclic JSON value", frame.path);
    }

    const { array, descriptors } = inspectObject(current, frame.path);
    const keys = Reflect.ownKeys(descriptors);
    activeAncestors.add(current);
    stack.push({ kind: "leave", value: current });

    if (array) {
      const length = (current as unknown[]).length;
      const elements: Array<{ index: number; value: unknown }> = [];

      for (const key of keys) {
        if (typeof key === "symbol") {
          fail("JSON arrays cannot have symbol properties", frame.path);
        }
        if (key === "length") continue;

        const index = arrayIndex(key);
        const propertyPath = childPath(frame.path, index === null ? key : index);
        if (index === null || index >= length) {
          fail("JSON arrays cannot have extra properties", propertyPath);
        }

        const descriptor = descriptors[key];
        if (
          descriptor === undefined ||
          !descriptor.enumerable ||
          !("value" in descriptor)
        ) {
          fail("JSON array elements must be enumerable data properties", propertyPath);
        }
        elements.push({ index, value: descriptor.value });
      }

      if (elements.length !== length) {
        let missing = 0;
        const present = new Set(elements.map(({ index }) => index));
        while (missing < length && present.has(missing)) missing += 1;
        fail("Sparse JSON arrays are not supported", childPath(frame.path, missing));
      }

      elements.sort((left, right) => right.index - left.index);
      for (const element of elements) {
        stack.push({
          kind: "visit",
          value: element.value,
          path: childPath(frame.path, element.index),
        });
      }
      continue;
    }

    const members: Array<{ key: string; value: unknown }> = [];
    for (const key of keys) {
      if (typeof key === "symbol") {
        fail("JSON objects cannot have symbol properties", frame.path);
      }

      const descriptor = descriptors[key];
      const propertyPath = childPath(frame.path, key);
      if (
        descriptor === undefined ||
        !descriptor.enumerable ||
        !("value" in descriptor)
      ) {
        fail("JSON object members must be enumerable data properties", propertyPath);
      }
      members.push({ key, value: descriptor.value });
    }

    for (let index = members.length - 1; index >= 0; index -= 1) {
      const member = members[index];
      if (member === undefined) continue;
      stack.push({
        kind: "visit",
        value: member.value,
        path: childPath(frame.path, member.key),
      });
    }
  }
}

export function assertJsonValueAt(
  value: unknown,
  path: readonly WirePathSegment[],
): asserts value is JsonValue {
  try {
    validateJsonValueAt(value, path);
  } catch (error) {
    if (error instanceof WireValidationError) throw error;
    throw new WireValidationError("Unable to validate JSON value", path);
  }
}

export function assertJsonObjectAt(
  value: unknown,
  path: readonly WirePathSegment[],
): asserts value is JsonObject {
  assertJsonValueAt(value, path);
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail("Expected a JSON object", pathFromSegments(path));
  }
}

export function assertJsonArrayAt(
  value: unknown,
  path: readonly WirePathSegment[],
): asserts value is JsonArray {
  assertJsonValueAt(value, path);
  if (!Array.isArray(value)) fail("Expected a JSON array", pathFromSegments(path));
}

export function isJsonValue(value: unknown): value is JsonValue {
  try {
    assertJsonValueAt(value, []);
    return true;
  } catch {
    return false;
  }
}

export function isJsonArray(value: unknown): value is JsonArray {
  try {
    assertJsonArrayAt(value, []);
    return true;
  } catch {
    return false;
  }
}

export function isJsonObject(value: unknown): value is JsonObject {
  try {
    assertJsonObjectAt(value, []);
    return true;
  } catch {
    return false;
  }
}

export function assertJsonValue(value: unknown): asserts value is JsonValue {
  assertJsonValueAt(value, []);
}

export function assertJsonArray(value: unknown): asserts value is JsonArray {
  assertJsonArrayAt(value, []);
}

export function assertJsonObject(value: unknown): asserts value is JsonObject {
  assertJsonObjectAt(value, []);
}

export function assertString(value: unknown): asserts value is string {
  if (typeof value !== "string") fail("Expected a string", null);
}

export function assertBoolean(value: unknown): asserts value is boolean {
  if (typeof value !== "boolean") fail("Expected a boolean", null);
}

export function assertFiniteNumber(value: unknown): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail("Expected a finite number", null);
  }
}

export function assertSafeInteger(value: unknown): asserts value is number {
  if (!Number.isSafeInteger(value)) fail("Expected a safe integer", null);
}
