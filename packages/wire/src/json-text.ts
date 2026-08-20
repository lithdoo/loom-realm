import { JsonTextSyntaxError } from "./errors.js";
import type { JsonValue } from "./json-value.js";
import { assertJsonValue, assertString } from "./validation.js";

interface ValueTask {
  readonly kind: "value";
  readonly value: JsonValue;
}

interface TextTask {
  readonly kind: "text";
  readonly text: string;
}

type SerializationTask = ValueTask | TextTask;

export function parseJsonText(raw: string): JsonValue {
  assertString(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new JsonTextSyntaxError();
  }
  assertJsonValue(parsed);
  return parsed;
}

function primitiveText(value: null | boolean | number | string): string {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  return JSON.stringify(value) as string;
}

export function stringifyJson(value: JsonValue): string {
  assertJsonValue(value);
  const output: string[] = [];
  const stack: SerializationTask[] = [{ kind: "value", value }];

  while (stack.length > 0) {
    const task = stack.pop();
    if (task === undefined) break;
    if (task.kind === "text") {
      output.push(task.text);
      continue;
    }

    const current = task.value;
    if (current === null || typeof current !== "object") {
      output.push(primitiveText(current));
      continue;
    }

    if (Array.isArray(current)) {
      stack.push({ kind: "text", text: "]" });
      for (let index = current.length - 1; index >= 0; index -= 1) {
        const descriptor = Object.getOwnPropertyDescriptor(current, String(index));
        if (descriptor === undefined || !("value" in descriptor)) {
          throw new TypeError("Validated JSON array changed during serialization");
        }
        stack.push({ kind: "value", value: descriptor.value as JsonValue });
        if (index > 0) stack.push({ kind: "text", text: "," });
      }
      stack.push({ kind: "text", text: "[" });
      continue;
    }

    const keys = Object.keys(current);
    stack.push({ kind: "text", text: "}" });
    for (let index = keys.length - 1; index >= 0; index -= 1) {
      const key = keys[index];
      if (key === undefined) continue;
      const descriptor = Object.getOwnPropertyDescriptor(current, key);
      if (descriptor === undefined || !("value" in descriptor)) {
        throw new TypeError("Validated JSON object changed during serialization");
      }
      stack.push({ kind: "value", value: descriptor.value as JsonValue });
      stack.push({ kind: "text", text: `${JSON.stringify(key)}:` });
      if (index > 0) stack.push({ kind: "text", text: "," });
    }
    stack.push({ kind: "text", text: "{" });
  }

  return output.join("");
}
