import { pathToFileURL } from "node:url";
import path from "node:path";
import type { MessageCarrier } from "@loomrealm/foundation";
import type { DeadlineScheduler, RuntimeControlBinding } from "@loomrealm/platform-ports";
import { createBoundContentClient, runSubsystem } from "@loomrealm/subsystem/host";
import type { SubsystemDefinitionFactory } from "@loomrealm/subsystem";
import {
  createRealmStateCarrierBinding,
  createRealmStateClient,
} from "@loomrealm/realm-state";
import {
  createSessionEventCarrierBinding,
  createSessionEventClient,
} from "@loomrealm/session-events";
import WebSocket from "ws";
import { createWebSocketCarrier } from "../websocket-carrier.js";
import { createRealmStateWebSocketCarrier } from "../realm-state-websocket-carrier.js";
import { createSessionEventWebSocketCarrier } from "../session-events-websocket-carrier.js";
import { createRunnerDataProvisioning } from "./data-provisioning.js";
import type { HostraContentAccess } from "../content-access.js";

export const BOOTSTRAP_ENV_KEY = "LOOMREALM_HOSTRA_RUNNER_BOOTSTRAP";
const BOOTSTRAP_KEYS = [
  "version",
  "subsystemKey",
  "physicalModule",
  "controlEndpoint",
  "realmStateEndpoint",
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
  readonly realmStateEndpoint: string;
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
    Object.keys(object).some((key) => !(BOOTSTRAP_KEYS as readonly string[]).includes(key)) ||
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
  if (typeof object.realmStateEndpoint !== "string") throw new TypeError("Invalid Runner bootstrap");
  let stateEndpoint: URL;
  try { stateEndpoint = new URL(object.realmStateEndpoint); } catch { throw new TypeError("Invalid Runner bootstrap"); }
  if (
    stateEndpoint.protocol !== "ws:" || stateEndpoint.hostname !== "127.0.0.1" ||
    stateEndpoint.username !== "" || stateEndpoint.password !== "" || stateEndpoint.search !== "" ||
    stateEndpoint.hash !== "" || stateEndpoint.port === "" ||
    !/^\/[A-Za-z0-9_-]{43}$/.test(stateEndpoint.pathname)
  ) throw new TypeError("Invalid Runner bootstrap");
  return Object.freeze({
    version: 1,
    subsystemKey: object.subsystemKey,
    physicalModule: object.physicalModule,
    controlEndpoint: object.controlEndpoint,
    realmStateEndpoint: object.realmStateEndpoint,
    bootstrapToken: object.bootstrapToken,
    controlProtocolVersions: Object.freeze([1] as [1]),
    helloDeadlineMs: object.helloDeadlineMs,
    frameDeadlineMs: object.frameDeadlineMs,
    terminalCleanupDeadlineMs: object.terminalCleanupDeadlineMs,
  });
}

function connect(
  endpoint: string,
  signal: AbortSignal,
  plane: "control" | "state" | "events" = "control",
): Promise<MessageCarrier> {
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
      resolve(
        plane === "state"
          ? createRealmStateWebSocketCarrier(socket)
          : plane === "events"
            ? createSessionEventWebSocketCarrier(socket)
            : createWebSocketCarrier(socket),
      );
    });
    socket.once("error", finishReject);
  });
}

export async function runBootstrap(
  bootstrap: RunnerBootstrapV1,
  sessionEventsEndpoint: string,
  earlyDataProvisioning = createRunnerDataProvisioning(),
  contentAccess?: HostraContentAccess,
): Promise<void> {
  const stateLifetime = new AbortController();
  const stateClient = createRealmStateClient();
  const stateCarriers = new Set<MessageCarrier>();
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let installStateBinding!: (required: boolean) => Promise<void>;
  const scheduleStateRebind = () => {
    if (stateLifetime.signal.aborted || stateClient.isTerminal || reconnectTimer !== null) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      void installStateBinding(false);
    }, 25);
    reconnectTimer.unref();
  };
  installStateBinding = async (required: boolean): Promise<void> => {
    if (stateLifetime.signal.aborted) return;
    try {
      const carrier = await connect(
        bootstrap.realmStateEndpoint,
        stateLifetime.signal,
        "state",
      );
      if (stateLifetime.signal.aborted) {
        await carrier.close();
        return;
      }
      stateCarriers.add(carrier);
      const binding = createRealmStateCarrierBinding(carrier);
      stateClient.attach(binding);
      void binding.terminal.then(() => {
        stateCarriers.delete(carrier);
        if (!stateLifetime.signal.aborted && !stateClient.isTerminal) {
          scheduleStateRebind();
        }
      });
    } catch (error) {
      if (required) throw error;
      scheduleStateRebind();
    }
  };
  await installStateBinding(true);
  const eventLifetime = new AbortController();
  const eventClient = createSessionEventClient();
  const eventCarriers = new Set<MessageCarrier>();
  let eventReconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let installEventBinding!: (required: boolean) => Promise<void>;
  const scheduleEventRebind = () => {
    if (eventLifetime.signal.aborted || eventClient.isTerminal || eventReconnectTimer !== null) return;
    eventReconnectTimer = setTimeout(() => {
      eventReconnectTimer = null;
      void installEventBinding(false);
    }, 25);
    eventReconnectTimer.unref();
  };
  installEventBinding = async (required: boolean): Promise<void> => {
    if (eventLifetime.signal.aborted) return;
    try {
      const carrier = await connect(sessionEventsEndpoint, eventLifetime.signal, "events");
      if (eventLifetime.signal.aborted) {
        await carrier.close();
        return;
      }
      eventCarriers.add(carrier);
      const binding = createSessionEventCarrierBinding(carrier);
      eventClient.attach(binding);
      void binding.terminal.then(() => {
        eventCarriers.delete(carrier);
        if (!eventLifetime.signal.aborted && !eventClient.isTerminal) scheduleEventRebind();
      });
    } catch (error) {
      if (required) throw error;
      scheduleEventRebind();
    }
  };
  try {
    await installEventBinding(true);
  } catch (error) {
    eventLifetime.abort();
    eventClient.terminate();
    stateLifetime.abort();
    if (reconnectTimer !== null) clearTimeout(reconnectTimer);
    stateClient.terminate();
    await Promise.allSettled([...stateCarriers].map((carrier) => carrier.close()));
    throw error;
  }
  const dataProvisioning = earlyDataProvisioning;
  const contentLifetime = new AbortController();
  try {
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
    const content = contentAccess === undefined ? undefined : createBoundContentClient(contentAccess, contentLifetime.signal);
    await runSubsystem({
      definition: imported.default as SubsystemDefinitionFactory,
      runtimeControl,
      ...(dataProvisioning === null ? {} : { data: dataProvisioning.binding }),
      ...(content === undefined ? {} : { content }),
      state: Object.freeze({ client: stateClient, terminate: () => stateClient.terminate() }),
      events: Object.freeze({ client: eventClient, terminate: () => eventClient.terminate() }),
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
  } finally {
    stateLifetime.abort();
    if (reconnectTimer !== null) clearTimeout(reconnectTimer);
    stateClient.terminate();
    await Promise.allSettled([...stateCarriers].map((carrier) => carrier.close()));
    eventLifetime.abort();
    if (eventReconnectTimer !== null) clearTimeout(eventReconnectTimer);
    eventClient.terminate();
    await Promise.allSettled([...eventCarriers].map((carrier) => carrier.close()));
    contentLifetime.abort();
    dataProvisioning?.close();
  }
}
