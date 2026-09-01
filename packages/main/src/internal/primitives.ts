import type { DeadlineScheduler } from "@loomrealm/platform-ports";
import type { FrameOutcome as ControlFrameOutcome } from "@loomrealm/runtime-control";
import {
  utf8ByteLength,
  type JsonObject,
  type JsonValue,
} from "@loomrealm/wire";
import type { MainFrameOutcome } from "../model.js";

export interface Deferred<T> {
  readonly promise: Promise<T>;
  readonly settled: boolean;
  resolve(value: T): void;
  reject(error: unknown): void;
}

export function deferred<T>(): Deferred<T> {
  let settled = false;
  let resolvePromise!: (value: T) => void;
  let rejectPromise!: (error: unknown) => void;
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });

  return {
    promise,
    get settled() {
      return settled;
    },
    resolve(value) {
      if (settled) return;
      settled = true;
      resolvePromise(value);
    },
    reject(error) {
      if (settled) return;
      settled = true;
      rejectPromise(error);
    },
  };
}

export class OperationTimeoutError extends Error {
  constructor() {
    super("Operation deadline exceeded");
    this.name = "OperationTimeoutError";
  }
}

export class OperationAbortedError extends Error {
  constructor() {
    super("Operation aborted");
    this.name = "OperationAbortedError";
  }
}

export async function runWithDeadline<T>(
  scheduler: DeadlineScheduler,
  delayMs: number,
  parentSignals: readonly AbortSignal[],
  task: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  let cancelDeadline: (() => void) | undefined;
  const cleanups: Array<() => void> = [];
  let rejectGate!: (error: unknown) => void;
  const gate = new Promise<never>((_, reject) => {
    rejectGate = reject;
  });

  const abortFromParent = () => {
    if (controller.signal.aborted) return;
    controller.abort();
    rejectGate(new OperationAbortedError());
  };

  for (const signal of parentSignals) {
    if (signal.aborted) {
      abortFromParent();
      break;
    }
    signal.addEventListener("abort", abortFromParent, { once: true });
    cleanups.push(() => signal.removeEventListener("abort", abortFromParent));
  }

  if (!controller.signal.aborted) {
    try {
      cancelDeadline = scheduler.schedule(delayMs, () => {
        if (controller.signal.aborted) return;
        controller.abort();
        rejectGate(new OperationTimeoutError());
      });
    } catch (error) {
      for (const cleanup of cleanups) cleanup();
      throw error;
    }
  }

  const operation = Promise.resolve().then(() => task(controller.signal));
  try {
    return await Promise.race([operation, gate]);
  } finally {
    try {
      cancelDeadline?.();
    } catch {
      // Scheduler cancellation is specified to be non-throwing; fail closed if not.
    }
    for (const cleanup of cleanups) cleanup();
  }
}

export async function resolvesWithin(
  scheduler: DeadlineScheduler,
  delayMs: number,
  task: Promise<unknown>,
): Promise<boolean> {
  const observed = Promise.resolve(task).then(
    () => true,
    () => false,
  );
  let cancel: (() => void) | undefined;
  const timedOut = new Promise<boolean>((resolve) => {
    try {
      cancel = scheduler.schedule(delayMs, () => resolve(false));
    } catch {
      resolve(false);
    }
  });
  const settled = await Promise.race([observed, timedOut]);
  try {
    cancel?.();
  } catch {
    // Secondary cleanup only.
  }
  return settled;
}

export function validProtocolString(value: unknown, maxBytes: number): value is string {
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
  return utf8ByteLength(value) <= maxBytes;
}

interface CloneFrame {
  readonly source: JsonObject | readonly JsonValue[];
  readonly target: JsonObject | JsonValue[];
}

type CloneTask =
  | { readonly kind: "clone"; readonly frame: CloneFrame }
  | { readonly kind: "freeze"; readonly target: JsonObject | JsonValue[] };

function createCloneTarget(
  source: JsonObject | readonly JsonValue[],
): JsonObject | JsonValue[] {
  return Array.isArray(source) ? new Array<JsonValue>(source.length) : {};
}

function defineCloneMember(target: object, key: string, value: JsonValue): void {
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
}

export function cloneJson(value: JsonValue): JsonValue {
  if (value === null || typeof value !== "object") return value;

  const root = createCloneTarget(value);
  const memo = new WeakMap<object, JsonObject | JsonValue[]>([[value, root]]);
  const stack: CloneTask[] = [
    { kind: "clone", frame: { source: value, target: root } },
  ];

  while (stack.length > 0) {
    const task = stack.pop();
    if (task === undefined) break;
    if (task.kind === "freeze") {
      Object.freeze(task.target);
      continue;
    }

    const { source, target } = task.frame;
    stack.push({ kind: "freeze", target });
    const keys = Array.isArray(source)
      ? Array.from({ length: source.length }, (_, index) => String(index))
      : Object.keys(source);

    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(source, key);
      if (descriptor === undefined || !("value" in descriptor)) {
        throw new TypeError("Validated JSON value changed during snapshot construction");
      }

      const child = descriptor.value as JsonValue;
      if (child === null || typeof child !== "object") {
        defineCloneMember(target, key, child);
        continue;
      }

      let childTarget = memo.get(child);
      if (childTarget === undefined) {
        childTarget = createCloneTarget(child);
        memo.set(child, childTarget);
        stack.push({
          kind: "clone",
          frame: { source: child, target: childTarget },
        });
      }
      defineCloneMember(target, key, childTarget);
    }
  }

  return root;
}

export function cloneControlOutcome(
  outcome: ControlFrameOutcome,
): ControlFrameOutcome {
  switch (outcome.type) {
    case "completed":
      return Object.freeze({ type: "completed", value: cloneJson(outcome.value) });
    case "cancelled":
      return Object.freeze({ type: "cancelled" });
    case "failed":
      return Object.freeze({
        type: "failed",
        error: Object.freeze({
          code: outcome.error.code,
          ...(outcome.error.message === undefined
            ? {}
            : { message: outcome.error.message }),
          ...(outcome.error.data === undefined
            ? {}
            : { data: cloneJson(outcome.error.data) }),
        }),
      });
  }
}

export function toMainOutcome(outcome: ControlFrameOutcome): MainFrameOutcome {
  return cloneControlOutcome(outcome) as MainFrameOutcome;
}
