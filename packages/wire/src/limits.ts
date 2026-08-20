import type { JsonValue } from "./json-value.js";
import { assertJsonValue, assertString } from "./validation.js";

export function utf8ByteLength(text: string): number {
  assertString(text);
  let bytes = 0;
  for (let index = 0; index < text.length; index += 1) {
    const codeUnit = text.charCodeAt(index);
    if (codeUnit <= 0x7f) {
      bytes += 1;
    } else if (codeUnit <= 0x7ff) {
      bytes += 2;
    } else if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const next = text.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4;
        index += 1;
      } else {
        bytes += 3;
      }
    } else {
      bytes += 3;
    }
  }
  return bytes;
}

export function jsonDepth(value: JsonValue): number {
  assertJsonValue(value);
  let maximum = 0;
  const stack: Array<{ readonly value: JsonValue; readonly depth: number }> = [
    { value, depth: 0 },
  ];

  while (stack.length > 0) {
    const entry = stack.pop();
    if (entry === undefined || entry.value === null || typeof entry.value !== "object") {
      continue;
    }

    const containerDepth = entry.depth + 1;
    if (containerDepth > maximum) maximum = containerDepth;

    if (Array.isArray(entry.value)) {
      for (let index = 0; index < entry.value.length; index += 1) {
        stack.push({ value: entry.value[index] as JsonValue, depth: containerDepth });
      }
    } else {
      for (const child of Object.values(entry.value)) {
        stack.push({ value: child, depth: containerDepth });
      }
    }
  }

  return maximum;
}
