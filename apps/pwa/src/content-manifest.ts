import type { ValidatedGameEntryV1 } from "@loomrealm/game-package";
import type { JsonObject, JsonValue } from "@loomrealm/wire";

type Task =
  | { readonly kind: "value"; readonly value: JsonValue }
  | { readonly kind: "text"; readonly text: string };

function compareCodePoints(left: string, right: string): number {
  let leftIndex = 0;
  let rightIndex = 0;
  while (leftIndex < left.length && rightIndex < right.length) {
    const leftPoint = left.codePointAt(leftIndex)!;
    const rightPoint = right.codePointAt(rightIndex)!;
    if (leftPoint !== rightPoint) return leftPoint - rightPoint;
    leftIndex += leftPoint > 0xffff ? 2 : 1;
    rightIndex += rightPoint > 0xffff ? 2 : 1;
  }
  return left.length - right.length;
}

/** Content API v1's private, deterministic public-manifest serializer. */
function serializeManifestValue(value: JsonValue): string {
  const output: string[] = [];
  const stack: Task[] = [{ kind: "value", value }];
  while (stack.length > 0) {
    const task = stack.pop()!;
    if (task.kind === "text") {
      output.push(task.text);
      continue;
    }
    const current = task.value;
    if (current === null || typeof current !== "object") {
      output.push(JSON.stringify(current));
      continue;
    }
    if (Array.isArray(current)) {
      stack.push({ kind: "text", text: "]" });
      for (let index = current.length - 1; index >= 0; index -= 1) {
        stack.push({ kind: "value", value: current[index]! });
        if (index > 0) stack.push({ kind: "text", text: "," });
      }
      stack.push({ kind: "text", text: "[" });
      continue;
    }
    const keys = Object.keys(current).sort(compareCodePoints);
    stack.push({ kind: "text", text: "}" });
    for (let index = keys.length - 1; index >= 0; index -= 1) {
      const key = keys[index]!;
      const descriptor = Object.getOwnPropertyDescriptor(current, key);
      if (descriptor === undefined || !("value" in descriptor)) {
        throw new TypeError("Validated public manifest changed during serialization");
      }
      stack.push({ kind: "value", value: descriptor.value as JsonValue });
      stack.push({ kind: "text", text: `${JSON.stringify(key)}:` });
      if (index > 0) stack.push({ kind: "text", text: "," });
    }
    stack.push({ kind: "text", text: "{" });
  }
  return output.join("");
}

export function serializePwaPublicManifestV1(game: ValidatedGameEntryV1): string {
  const manifest: JsonObject = {
    formatVersion: 1,
    ...(game.state === undefined ? {} : {
      state: {
        records: game.state.records.map(({ namespace, key, value }) => ({ namespace, key, value })),
      },
    }),
    initial: { subsystem: game.initial.subsystem, input: game.initial.input },
    subsystems: game.subsystems.map(({ key }) => ({ key })),
  };
  return serializeManifestValue(manifest);
}
