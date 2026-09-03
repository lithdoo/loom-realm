import { pathToFileURL } from "node:url";
import path from "node:path";
import type { MessageCarrier } from "@loomrealm/foundation";
import type { DeadlineScheduler, RuntimeControlBinding } from "@loomrealm/platform-ports";
import { runSubsystem } from "@loomrealm/subsystem/host";
import type { SubsystemDefinitionFactory } from "@loomrealm/subsystem";
import WebSocket from "ws";
import { createWebSocketCarrier } from "../websocket-carrier.js";

export const BOOTSTRAP_ENV_KEY = "LOOMREALM_HOSTRA_RUNNER_BOOTSTRAP";
const BOOTSTRAP_KEYS = [
  "version",
  "subsystemKey",
  "physicalModule",
  "controlEndpoint",
  "bootstrapToken",
  "controlProtocolVersions",
  "helloDeadlineMs",
  "frameDeadlineMs",
  "terminalCleanupDeadlineMs",
] as const;
const MAX_BOOTSTRAP_BYTES = 16_384;

export interface RunnerBootstrapV1 {
  readonly version: 1;
  readonly subsystemKey: string;
  readonly physicalModule: string;
  readonly controlEndpoint: string;
  readonly bootstrapToken: string;
  readonly controlProtocolVersions: readonly [1];
  readonly helloDeadlineMs: number;
  readonly frameDeadlineMs: number;
  readonly terminalCleanupDeadlineMs: number;
}

function integer(value: unknown, minimum: number, maximum: number): value is number {
  return Number.isInteger(value) && (value as number) >= minimum && (value as number) <= maximum;
}

export function parseRunnerBootstrap(encoded: string): RunnerBootstrapV1 {
  if (typeof encoded !== "string" || Buffer.byteLength(encoded, "utf8") > MAX_BOOTSTRAP_BYTES) {
    throw new TypeError("Invalid Runner bootstrap");
  }
  let value: unknown;
  try {
    value = JSON.parse(encoded);
  } catch {
    throw new TypeError("Invalid Runner bootstrap");
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Invalid Runner bootstrap");
  }
  const object = value as Record<string, unknown>;
  if (
    Object.keys(object).length !== BOOTSTRAP_KEYS.length ||
    BOOTSTRAP_KEYS.some((key) => !Object.prototype.hasOwnProperty.call(object, key)) ||
    object.version !== 1 ||
    typeof object.subsystemKey !== "string" || object.subsystemKey.length === 0 ||
    typeof object.physicalModule !== "string" || !path.isAbsolute(object.physicalModule) ||
    !object.physicalModule.endsWith(".mjs") ||
    typeof object.controlEndpoint !== "string" || object.controlEndpoint.length === 0 ||
    typeof object.bootstrapToken !== "string" || object.bootstrapToken.length === 0 ||
    !Array.isArray(object.controlProtocolVersions) ||
    object.controlProtocolVersions.length !== 1 || object.controlProtocolVersions[0] !== 1 ||
    !integer(object.helloDeadlineMs, 1, 2_147_483_647) ||
    !integer(object.frameDeadlineMs, 1_000, 300_000) ||
    !integer(object.terminalCleanupDeadlineMs, 1, 300_000)
  ) {
    throw new TypeError("Invalid Runner bootstrap");
  }
  let endpoint: URL;
  try {
    endpoint = new URL(object.controlEndpoint);
  } catch {
    throw new TypeError("Invalid Runner bootstrap");
  }
  if (
    endpoint.protocol !== "ws:" || endpoint.hostname !== "127.0.0.1" ||
    endpoint.username !== "" || endpoint.password !== "" || endpoint.search !== "" ||
    endpoint.hash !== "" || endpoint.port === "" ||
    !/^\/[A-Za-z0-9_-]{43}$/.test(endpoint.pathname)
  ) {
    throw new TypeError("Invalid Runner bootstrap");
  }
  return Object.freeze({
    version: 1,
    subsystemKey: object.subsystemKey,
    physicalModule: object.physicalModule,
    controlEndpoint: object.controlEndpoint,
    bootstrapToken: object.bootstrapToken,
    controlProtocolVersions: Object.freeze([1] as [1]),
    helloDeadlineMs: object.helloDeadlineMs,
    frameDeadlineMs: object.frameDeadlineMs,
    terminalCleanupDeadlineMs: object.terminalCleanupDeadlineMs,
  });
}

function connect(endpoint: string, signal: AbortSignal): Promise<MessageCarrier> {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(endpoint);
    let settled = false;
    const finishReject = (error: unknown) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", onAbort);
      try { socket.terminate(); } catch {}
      reject(error);
    };
    const onAbort = () => finishReject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
    socket.once("open", () => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", onAbort);
      resolve(createWebSocketCarrier(socket));
    });
    socket.once("error", finishReject);
  });
}

export async function runBootstrap(bootstrap: RunnerBootstrapV1): Promise<void> {
  const imported = await import(pathToFileURL(bootstrap.physicalModule).href);
  if (typeof imported.default !== "function") {
    throw new TypeError("Subsystem Definition Module default export is invalid");
  }
  let acquired = false;
  const runtimeControl: RuntimeControlBinding = Object.freeze({
    acquire(signal: AbortSignal) {
      if (acquired) return Promise.reject(new Error("Runtime Control binding already acquired"));
      acquired = true;
      return connect(bootstrap.controlEndpoint, signal);
    },
  });
  const scheduler: DeadlineScheduler = Object.freeze({
    schedule(delayMs: number, callback: () => void) {
      const timer = setTimeout(callback, delayMs);
      return () => clearTimeout(timer);
    },
  });
  await runSubsystem({
    definition: imported.default as SubsystemDefinitionFactory,
    runtimeControl,
    runtimePolicy: {
      scheduler,
      helloDeadlineMs: bootstrap.helloDeadlineMs,
      frameDeadlineMs: bootstrap.frameDeadlineMs,
      terminalCleanupDeadlineMs: bootstrap.terminalCleanupDeadlineMs,
    },
    launch: {
      subsystemKey: bootstrap.subsystemKey,
      bootstrapToken: bootstrap.bootstrapToken,
      controlProtocolVersions: [1],
    },
  });
}
