import type { DeadlineScheduler } from "@loomrealm/platform-ports";
import type { FrameOutcome as ControlFrameOutcome } from "@loomrealm/runtime-control";
import type { JsonValue } from "@loomrealm/wire";
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

export async function settleWithin(
  scheduler: DeadlineScheduler,
  delayMs: number,
  task: Promise<unknown>,
): Promise<boolean> {
  const observed = Promise.resolve(task).then(
    () => true,
    () => true,
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

export function cloneJson(value: JsonValue): JsonValue {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return Object.freeze(value.map((entry) => cloneJson(entry))) as JsonValue;
  }
  const copy: Record<string, JsonValue> = {};
  for (const [key, entry] of Object.entries(value)) copy[key] = cloneJson(entry);
  return Object.freeze(copy) as JsonValue;
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
