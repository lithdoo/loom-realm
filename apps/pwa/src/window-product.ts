import type { PwaWindowBridgeResultV1 } from "./bootstrap-protocol.js";
import { parseInstallRendererControl, parseInstallRendererData, parseRevokeRendererData } from "./bootstrap-protocol.js";
import { createDemoInstallationBundle, DEMO_PRESENTATION } from "./installation-bundle.js";
import { collectInstallationGarbage, ensurePwaBundle } from "./installer.js";
import { getInstallation, type PwaInstallationRecord } from "./installation-store.js";
import { createPwaRendererHost, type PwaRendererHost } from "./renderer-host.js";
import { serviceWorkerGate } from "./service-worker-gate.js";

export interface PwaProductState {
  sessionEpoch: string | null;
  serviceWorkerGeneration: string | null;
  installationId: string;
  statuses: unknown[];
  persistence: string | null;
  ready: boolean;
  failure: string | null;
}

export interface PwaProductLaunchSelection {
  readonly installationId: string;
  readonly presentation: unknown;
}

export interface PwaProductControl {
  readonly state: PwaProductState;
  restart(selection?: PwaProductLaunchSelection): Promise<void>;
}

declare global {
  interface Window { __loomrealmPwa: PwaProductState }
}

const state: PwaProductState = {
  sessionEpoch: null,
  serviceWorkerGeneration: null,
  installationId: "",
  statuses: [],
  persistence: null,
  ready: false,
  failure: null,
};

let started = false;
let selectedLaunch: PwaProductLaunchSelection | null = null;
let current: {
  readonly epoch: string;
  readonly worker: Worker;
  readonly bridge: MessagePort;
  readonly controller: AbortController;
  readonly renderer: PwaRendererHost;
  readonly closed: Promise<void>;
  markClosed(): void;
} | null = null;
let stopping: Promise<void> = Promise.resolve();
let transitioning: Promise<void> = Promise.resolve();
let lifecycleRevision = 0;

class StaleWindowLaunch extends Error {
  constructor() { super("PWA Window launch was superseded"); }
}

function assertCurrentRevision(revision: number): void {
  if (revision !== lifecycleRevision) throw new StaleWindowLaunch();
}

function randomEpoch(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
}

function result(requestId: string, epoch: string, ok: boolean, errorCode: "WINDOW_NOT_CURRENT" | "INSTALL_REJECTED" = "INSTALL_REJECTED"): PwaWindowBridgeResultV1 {
  return ok
    ? Object.freeze({ formatVersion: 1, type: "install/result", requestId, sessionEpoch: epoch, ok: true })
    : Object.freeze({ formatVersion: 1, type: "install/result", requestId, sessionEpoch: epoch, ok: false, errorCode });
}

async function selectInstallation(selection: PwaProductLaunchSelection | null): Promise<{
  readonly installation: PwaInstallationRecord;
  readonly presentation: unknown;
}> {
  await collectInstallationGarbage();
  if (selection !== null) {
    const installation = await getInstallation(selection.installationId);
    if (installation?.state !== "complete") throw new Error("Selected PWA installation is unavailable");
    return Object.freeze({ installation, presentation: selection.presentation });
  }
  const bundle = createDemoInstallationBundle();
  const installation = await ensurePwaBundle(bundle, localStorage.getItem("loomrealm-demo-installation-v1"));
  localStorage.setItem("loomrealm-demo-installation-v1", installation.installationId);
  return Object.freeze({ installation, presentation: DEMO_PRESENTATION });
}

async function startFreshSession(selection: PwaProductLaunchSelection | null, revision: number): Promise<void> {
  await stopCurrent();
  assertCurrentRevision(revision);
  state.ready = false;
  state.failure = null;
  state.statuses = [];
  document.documentElement.dataset.loomrealmProduct = "starting";
  const expectedServiceWorker = await serviceWorkerGate();
  assertCurrentRevision(revision);
  const { installation, presentation } = await selectInstallation(selection);
  assertCurrentRevision(revision);
  const epoch = randomEpoch();
  const controller = new AbortController();
  let renderer: PwaRendererHost | null = null;
  let bridge: MessageChannel | null = null;
  let worker: Worker | null = null;
  let ownedCurrent: typeof current = null;
  try {
    renderer = await createPwaRendererHost(installation.installationId, presentation, controller.signal);
    assertCurrentRevision(revision);
    bridge = new MessageChannel();
    let markClosed!: () => void;
    const closed = new Promise<void>((resolve) => { markClosed = resolve; });
    const seen = new Set<string>();
    const postBridgeResult = (message: PwaWindowBridgeResultV1): void => {
      try { bridge!.port1.postMessage(message); }
      catch (cause) { console.error("PWA Window bridge result failed", cause); }
    };
    bridge.port1.addEventListener("message", (event: MessageEvent<unknown>) => {
      const value = event.data as Record<string, unknown> | null;
      const requestId = typeof value?.requestId === "string" ? value.requestId : null;
      const transferredPort = value?.port instanceof MessagePort ? value.port : null;
      let accepted = false;
      let errorCode: "WINDOW_NOT_CURRENT" | "INSTALL_REJECTED" = "INSTALL_REJECTED";
      try {
        if (requestId === null || seen.has(requestId)) throw new Error("Duplicate Window bridge request");
        seen.add(requestId);
        if (value?.type === "renderer-control/install") {
          if (current !== ownedCurrent) { errorCode = "WINDOW_NOT_CURRENT"; throw new Error("Window Session is not current"); }
          const message = parseInstallRendererControl(event.data, epoch);
          renderer!.installControl(message.rendererControlToken, message.port);
        } else if (value?.type === "renderer-data/install") {
          if (current !== ownedCurrent) { errorCode = "WINDOW_NOT_CURRENT"; throw new Error("Window Session is not current"); }
          const message = parseInstallRendererData(event.data, epoch);
          renderer!.data.install({ subsystemKey: message.subsystemKey, generation: message.generation, dataProfile: message.dataProfile }, message.connectionId, message.port);
        } else if (value?.type === "renderer-data/revoke") {
          const message = parseRevokeRendererData(event.data, epoch);
          renderer!.data.revoke({ subsystemKey: message.subsystemKey, generation: message.generation, dataProfile: message.dataProfile }, message.connectionId);
        } else throw new Error("Unknown Window bridge request");
        accepted = true;
      } catch {
        if (transferredPort !== null && !accepted) transferredPort.close();
      }
      if (requestId !== null) postBridgeResult(result(requestId, epoch, accepted, errorCode));
    });
    bridge.port1.start();
    worker = new Worker(new URL("./session-worker.js", import.meta.url), { type: "module", name: `loomrealm-session-${epoch.slice(0, 8)}` });
    worker.addEventListener("message", (event: MessageEvent<unknown>) => {
      const value = event.data as Record<string, unknown> | null;
      if (value === null || typeof value !== "object" || value.version !== 1) return;
      if (value.type === "loomrealm.pwa.session-status" && value.status === "closed" && (value.sessionEpoch === undefined || value.sessionEpoch === epoch)) markClosed();
      if (current !== ownedCurrent) return;
      if (value.type === "loomrealm.pwa.session-status") {
        if (value.sessionEpoch !== undefined && value.sessionEpoch !== epoch) return;
        state.statuses.push(value);
        if (value.status === "failed") {
          state.failure = typeof value.detail === "string" ? value.detail : "Session failed";
          document.documentElement.dataset.loomrealmProduct = "failed";
          markClosed();
          void stopCurrent().catch((cause) => console.error("PWA failed Session cleanup failed", cause));
        }
        if (value.status === "main-started") {
          state.ready = true;
          document.documentElement.dataset.loomrealmProduct = "ready";
        }
        if (value.status === "settled") document.documentElement.dataset.loomrealmProduct = "settled";
        if (value.status === "closed") void stopCurrent().catch((cause) => console.error("PWA closed Session cleanup failed", cause));
      } else if (value.type === "loomrealm.pwa.observation" && value.sessionEpoch === epoch) state.statuses.push(value);
    });
    worker.addEventListener("error", (event) => {
      markClosed();
      if (current !== ownedCurrent) return;
      state.failure = event.message;
      document.documentElement.dataset.loomrealmProduct = "failed";
      void stopCurrent().catch((cause) => console.error("PWA crashed Session cleanup failed", cause));
    });
    ownedCurrent = Object.freeze({ epoch, worker, bridge: bridge.port1, controller, renderer, closed, markClosed });
    current = ownedCurrent;
    state.sessionEpoch = epoch;
    state.serviceWorkerGeneration = expectedServiceWorker.generation;
    state.installationId = installation.installationId;
    state.persistence = installation.persistence;
    worker.postMessage(Object.freeze({
      formatVersion: 1,
      sessionEpoch: epoch,
      installationId: installation.installationId,
      expectedServiceWorker,
      windowBridgePort: bridge.port2,
    }), [bridge.port2]);
  } catch (cause) {
    if (current === ownedCurrent) current = null;
    const cleanupFailures: unknown[] = [];
    try { controller.abort(); } catch (cleanupCause) { cleanupFailures.push(cleanupCause); }
    try { renderer?.close(); } catch (cleanupCause) { cleanupFailures.push(cleanupCause); }
    try { bridge?.port1.close(); } catch (cleanupCause) { cleanupFailures.push(cleanupCause); }
    try { bridge?.port2.close(); } catch (cleanupCause) { cleanupFailures.push(cleanupCause); }
    try { worker?.terminate(); } catch (cleanupCause) { cleanupFailures.push(cleanupCause); }
    if (cleanupFailures.length > 0) throw new AggregateError([cause, ...cleanupFailures], "PWA Window launch and cleanup failed");
    throw cause;
  }
}

function queueFreshSession(selection: PwaProductLaunchSelection | null): Promise<void> {
  const revision = ++lifecycleRevision;
  const start = () => startFreshSession(selection, revision);
  transitioning = transitioning.then(start, start);
  return transitioning;
}

async function stopCurrent(): Promise<void> {
  const active = current;
  current = null;
  state.ready = false;
  if (active === null) return stopping;
  const close = async () => {
    try {
      active.worker.postMessage(Object.freeze({ type: "loomrealm.pwa.session-shutdown", version: 1, sessionEpoch: active.epoch }));
    } catch (cause) {
      console.debug("PWA Session shutdown message was not delivered", cause);
      active.markClosed();
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      active.closed,
      new Promise<void>((resolve) => { timer = setTimeout(resolve, 1_500); }),
    ]);
    if (timer !== undefined) clearTimeout(timer);
    const failures: unknown[] = [];
    try { active.controller.abort(); } catch (cause) { failures.push(cause); }
    try { active.renderer.close(); } catch (cause) { failures.push(cause); }
    try { active.bridge.close(); } catch (cause) { failures.push(cause); }
    try { active.worker.terminate(); } catch (cause) { failures.push(cause); }
    if (failures.length > 0) throw new AggregateError(failures, "PWA Window Session cleanup failed");
  };
  stopping = stopping.then(close, close);
  return stopping;
}

function fail(cause: unknown): void {
  if (cause instanceof StaleWindowLaunch) return;
  state.failure = cause instanceof Error ? cause.message : String(cause);
  document.documentElement.dataset.loomrealmProduct = "failed";
}

export function startPwaProduct(): PwaProductControl {
  if (started) throw new Error("PWA product already started");
  started = true;
  window.__loomrealmPwa = state;
  window.addEventListener("pagehide", () => {
    lifecycleRevision += 1;
    void stopCurrent().catch((cause) => console.error("PWA pagehide cleanup failed", cause));
  });
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) void queueFreshSession(selectedLaunch).catch(fail);
  });
  void queueFreshSession(selectedLaunch).catch(fail);
  return Object.freeze({
    state,
    async restart(selection?: PwaProductLaunchSelection) {
      if (selection !== undefined) selectedLaunch = selection;
      await queueFreshSession(selectedLaunch);
    },
  });
}
