import { JsonTextSyntaxError, WireValidationError } from "./errors.js";
import type { JsonValue } from "./json-value.js";

interface ValueTask {
  readonly kind: "value";
  readonly value: unknown;
}

interface TextTask {
  readonly kind: "text";
  readonly text: string;
}

interface LeaveTask {
  readonly kind: "leave";
  readonly value: object;
}

type SerializationTask = ValueTask | TextTask | LeaveTask;

function invalid(message: string): never {
  throw new WireValidationError(message);
}

function arrayIndex(key: string): number | null {
  if (key === "" || key === "-0") return null;
  const index = Number(key);
  if (!Number.isInteger(index) || index < 0 || index >= 0xffff_ffff) return null;
  return String(index) === key ? index : null;
}

function assertFiniteParsedNumbers(value: unknown): void {
  const stack: unknown[] = [value];
  while (stack.length > 0) {
    const current = stack.pop();
    if (typeof current === "number") {
      if (!Number.isFinite(current)) invalid("Expected a finite number");
      continue;
    }
    if (current === null || typeof current !== "object") continue;
    if (Array.isArray(current)) {
      for (let index = 0; index < current.length; index += 1) stack.push(current[index]);
    } else {
      for (const key of Object.keys(current)) stack.push((current as Record<string, unknown>)[key]);
    }
  }
}

export function parseJsonText(raw: string): JsonValue {
  if (typeof raw !== "string") invalid("Expected a string");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new JsonTextSyntaxError();
  }
  // JSON.parse already creates dense arrays, ordinary objects and data
  // properties. Its one observable numeric exception is an overflowing
  // exponent (for example 1e400), which must remain outside the Wire model.
  assertFiniteParsedNumbers(parsed);
  return parsed as JsonValue;
}

function primitiveText(value: null | boolean | number | string): string {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  return JSON.stringify(value) as string;
}

/**
 * Iterative, single-pass Wire JSON encoding.
 *
 * Representation validation happens as each value is encoded. This avoids a
 * full assertJsonValue traversal followed by a second serialization traversal,
 * while retaining Wire's rejection of exotic objects, sparse/augmented arrays,
 * accessors, symbols and non-finite numbers.
 */
export function stringifyJson(value: JsonValue): string {
  const output: string[] = [];
  const active = new WeakSet<object>();
  const stack: SerializationTask[] = [{ kind: "value", value }];

  while (stack.length > 0) {
    const task = stack.pop();
    if (task === undefined) break;
    if (task.kind === "text") {
      output.push(task.text);
      continue;
    }
    if (task.kind === "leave") {
      active.delete(task.value);
      continue;
    }

    const current = task.value;
    if (
      current === null ||
      typeof current === "string" ||
      typeof current === "boolean"
    ) {
      output.push(primitiveText(current));
      continue;
    }
    if (typeof current === "number") {
      if (!Number.isFinite(current)) invalid("Expected a finite number");
      output.push(primitiveText(current));
      continue;
    }
    if (typeof current !== "object") invalid("Expected a JSON value");
    if (active.has(current)) invalid("Cyclic JSON value");

    let isArray: boolean;
    let descriptors: PropertyDescriptorMap;
    let prototype: object | null;
    try {
      isArray = Array.isArray(current);
      prototype = Object.getPrototypeOf(current) as object | null;
      descriptors = Object.getOwnPropertyDescriptors(current);
    } catch {
      invalid("Unable to inspect JSON container");
    }
    if (!isArray && prototype !== Object.prototype && prototype !== null) {
      invalid("Expected a plain JSON object");
    }

    const keys = Reflect.ownKeys(descriptors);
    active.add(current);

    if (isArray) {
      const length = (current as unknown[]).length;
      const elements: Array<{ readonly index: number; readonly value: unknown }> = [];
      for (const key of keys) {
        if (typeof key === "symbol") invalid("JSON arrays cannot have symbol properties");
        if (key === "length") continue;
        const index = arrayIndex(key);
        if (index === null || index >= length) invalid("JSON arrays cannot have extra properties");
        const descriptor = descriptors[key];
        if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) {
          invalid("JSON array elements must be enumerable data properties");
        }
        elements.push({ index, value: descriptor.value });
      }
      if (elements.length !== length) invalid("Sparse JSON arrays are not supported");
      elements.sort((left, right) => right.index - left.index);

      stack.push({ kind: "leave", value: current });
      stack.push({ kind: "text", text: "]" });
      for (const element of elements) {
        stack.push({ kind: "value", value: element.value });
        if (element.index > 0) stack.push({ kind: "text", text: "," });
      }
      stack.push({ kind: "text", text: "[" });
      continue;
    }

    const members: Array<{ readonly key: string; readonly value: unknown }> = [];
    for (const key of keys) {
      if (typeof key === "symbol") invalid("JSON objects cannot have symbol properties");
      const descriptor = descriptors[key];
      if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) {
        invalid("JSON object members must be enumerable data properties");
      }
      members.push({ key, value: descriptor.value });
    }

    stack.push({ kind: "leave", value: current });
    stack.push({ kind: "text", text: "}" });
    for (let index = members.length - 1; index >= 0; index -= 1) {
      const member = members[index];
      if (member === undefined) continue;
      stack.push({ kind: "value", value: member.value });
      stack.push({ kind: "text", text: JSON.stringify(member.key) + ":" });
      if (index > 0) stack.push({ kind: "text", text: "," });
    }
    stack.push({ kind: "text", text: "{" });
  }

  return output.join("");
}
