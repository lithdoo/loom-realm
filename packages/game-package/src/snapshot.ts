import type { JsonObject, JsonValue } from "@loomrealm/wire";
import type { GameEntryV1, ValidatedGameEntryV1 } from "./model.js";

interface CloneFrame {
  readonly source: JsonObject | readonly JsonValue[];
  readonly target: JsonObject | JsonValue[];
}

interface FreezeFrame {
  readonly target: JsonObject | JsonValue[];
}

type SnapshotFrame =
  | { readonly kind: "clone"; readonly frame: CloneFrame }
  | { readonly kind: "freeze"; readonly frame: FreezeFrame };

function isContainer(value: JsonValue): value is JsonObject | readonly JsonValue[] {
  return value !== null && typeof value === "object";
}

function createTarget(source: JsonObject | readonly JsonValue[]): JsonObject | JsonValue[] {
  return Array.isArray(source) ? new Array<JsonValue>(source.length) : {};
}

function defineDataMember(target: object, key: string, value: JsonValue): void {
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
}

export function snapshotJsonValue(value: JsonValue): JsonValue {
  if (!isContainer(value)) return value;

  const root = createTarget(value);
  const memo = new WeakMap<object, JsonObject | JsonValue[]>([[value, root]]);
  const stack: SnapshotFrame[] = [
    { kind: "clone", frame: { source: value, target: root } },
  ];

  while (stack.length > 0) {
    const task = stack.pop();
    if (task === undefined) break;
    if (task.kind === "freeze") {
      Object.freeze(task.frame.target);
      continue;
    }

    const { source, target } = task.frame;
    stack.push({ kind: "freeze", frame: { target } });
    const keys = Array.isArray(source)
      ? Array.from({ length: source.length }, (_, index) => String(index))
      : Object.keys(source);

    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(source, key);
      if (descriptor === undefined || !("value" in descriptor)) {
        throw new TypeError("Validated JSON value changed during snapshot construction");
      }

      const child = descriptor.value as JsonValue;
      if (!isContainer(child)) {
        defineDataMember(target, key, child);
        continue;
      }

      let childTarget = memo.get(child);
      if (childTarget === undefined) {
        childTarget = createTarget(child);
        memo.set(child, childTarget);
        stack.push({ kind: "clone", frame: { source: child, target: childTarget } });
      }
      defineDataMember(target, key, childTarget);
    }
  }

  return root;
}

export function createValidatedGameEntrySnapshot(
  formatVersion: 1,
  initialSubsystem: string,
  initialInput: JsonValue,
  subsystemKeys: readonly string[],
): ValidatedGameEntryV1 {
  const input = snapshotJsonValue(initialInput);
  const initial = Object.freeze({ subsystem: initialSubsystem, input });
  const subsystems = Object.freeze(
    subsystemKeys.map((key) => Object.freeze({ key })),
  );
  const snapshot: GameEntryV1 = Object.freeze({
    formatVersion,
    initial,
    subsystems,
  });
  return snapshot as ValidatedGameEntryV1;
}
