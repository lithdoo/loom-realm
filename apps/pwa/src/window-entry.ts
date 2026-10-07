import type { PwaServiceWorkerGenerationV1, PwaWindowBridgeResultV1 } from "./bootstrap-protocol.js";
import { parseInstallRendererControl, parseInstallRendererData } from "./bootstrap-protocol.js";
import { createDemoInstallationBundle, DEMO_PRESENTATION } from "./installation-bundle.js";
import type { PwaInstallationBundleV1 } from "./installation-bundle.js";
import { collectStagingOrphans, ensurePwaBundle, inspectInstallationStorage, installPwaBundle, uninstallPwaInstallation } from "./installer.js";
import { createPwaRendererHost, type PwaRendererHost } from "./renderer-host.js";

interface ProductState {
  sessionEpoch: string | null;
  serviceWorkerGeneration: string | null;
  installationId: string;
  statuses: unknown[];
  persistence: string | null;
  ready: boolean;
  failure: string | null;
  readonly qualification: {
    inspectStorage(requiredBytes?: number): Promise<unknown>;
    uninstall(installationId?: string): Promise<void>;
    reinstall(): Promise<unknown>;
    install(bundle: PwaInstallationBundleV1): Promise<unknown>;
  };
}

declare global {
  interface Window { __loomrealmPwa: ProductState }
}

const state: ProductState = {
  sessionEpoch: null,
  serviceWorkerGeneration: null,
  installationId: "",
  statuses: [],
  persistence: null,
  ready: false,
  failure: null,
  qualification: Object.freeze({
    inspectStorage: (requiredBytes = 0) => inspectInstallationStorage(requiredBytes),
    uninstall: (installationId = state.installationId) => uninstallPwaInstallation(installationId),
    reinstall: async () => {
      const installed = await installPwaBundle(createDemoInstallationBundle());
      localStorage.setItem("loomrealm-demo-installation-v1", installed.installationId);
      state.installationId = installed.installationId;
      return installed;
    },
    install: (bundle) => installPwaBundle(bundle),
  }),
};
window.__loomrealmPwa = state;
let current: { readonly epoch: string; readonly worker: Worker; readonly bridge: MessagePort; readonly controller: AbortController; readonly renderer: PwaRendererHost } | null = null;

function randomEpoch(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
}

function waitForActive(registration: ServiceWorkerRegistration): Promise<void> {
  const candidate = registration.installing ?? registration.waiting ?? registration.active;
  if (candidate?.state === "activated") return Promise.resolve();
  if (candidate === null) return Promise.reject(new Error("Service Worker registration has no worker"));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Service Worker activation timed out")), 10_000);
    candidate.addEventListener("statechange", () => {
      if (candidate.state === "activated") { clearTimeout(timer); resolve(); }
      if (candidate.state === "redundant") { clearTimeout(timer); reject(new Error("Service Worker became redundant")); }
    });
  });
}

async function serviceWorkerGate(): Promise<PwaServiceWorkerGenerationV1> {
  if (!("serviceWorker" in navigator)) throw new Error("Service Worker unavailable");
  const registration = await navigator.serviceWorker.register("/service-worker.js", { scope: "/", type: "module", updateViaCache: "none" });
  if (registration === undefined || registration === null) throw new Error("Service Worker registration unavailable");
  await waitForActive(registration);
  const controller = navigator.serviceWorker.controller;
  if (controller === null) {
    const count = Number(sessionStorage.getItem("loomrealm-sw-reloads") ?? "0");
    if (count >= 2) throw new Error("Missing current Service Worker controller");
    sessionStorage.setItem("loomrealm-sw-reloads", String(count + 1));
    location.reload();
    return new Promise(() => {});
  }
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => { channel.port1.close(); reject(new Error("Service Worker compatibility handshake timed out")); }, 5_000);
    channel.port1.addEventListener("message", (event: MessageEvent<unknown>) => {
      clearTimeout(timer);
      channel.port1.close();
      const value = event.data as Record<string, unknown> | null;
      if (value === null || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length !== 3 || value.protocolVersion !== 1 || typeof value.buildId !== "string" || value.buildId.length === 0 || typeof value.generation !== "string" || value.generation.length === 0) { reject(new Error("Incompatible Service Worker")); return; }
      resolve(value as unknown as PwaServiceWorkerGenerationV1);
    }, { once: true });
    channel.port1.start();
    controller.postMessage(Object.freeze({ type: "loomrealm.pwa.sw-hello", version: 1 }), [channel.port2]);
  });
}

function result(requestId: string, epoch: string, ok: boolean): PwaWindowBridgeResultV1 {
  return ok
    ? Object.freeze({ formatVersion: 1, type: "install/result", requestId, sessionEpoch: epoch, ok: true })
    : Object.freeze({ formatVersion: 1, type: "install/result", requestId, sessionEpoch: epoch, ok: false, errorCode: "INSTALL_REJECTED" });
}

async function startFreshSession(): Promise<void> {
  stopCurrent();
  state.ready = false; state.failure = null; state.statuses = [];
  document.documentElement.dataset.loomrealmProduct = "starting";
  const expectedServiceWorker = await serviceWorkerGate();
  const bundle = createDemoInstallationBundle();
  await collectStagingOrphans();
  const installation = await ensurePwaBundle(bundle, localStorage.getItem("loomrealm-demo-installation-v1"));
  localStorage.setItem("loomrealm-demo-installation-v1", installation.installationId);
  const epoch = randomEpoch();
  const controller = new AbortController();
  const renderer = await createPwaRendererHost(installation.installationId, DEMO_PRESENTATION, controller.signal);
  const bridge = new MessageChannel();
  const seen = new Set<string>();
  bridge.port1.addEventListener("message", (event: MessageEvent<unknown>) => {
    let requestId: string | null = null;
    try {
      const value = event.data as Record<string, unknown> | null;
      requestId = typeof value?.requestId === "string" ? value.requestId : null;
      if (requestId === null || seen.has(requestId)) throw new Error("Duplicate Window bridge request");
      seen.add(requestId);
      if (value?.type === "renderer-control/install") {
        const message = parseInstallRendererControl(event.data, epoch);
        renderer.installControl(message.rendererControlToken, message.port);
      } else if (value?.type === "renderer-data/install") {
        const message = parseInstallRendererData(event.data, epoch);
        renderer.data.install({ subsystemKey: message.subsystemKey, generation: message.generation, dataProfile: message.dataProfile }, message.port);
      } else throw new Error("Unknown Window bridge request");
      bridge.port1.postMessage(result(requestId, epoch, true));
    } catch {
      if (requestId !== null) bridge.port1.postMessage(result(requestId, epoch, false));
    }
  });
  bridge.port1.start();
  const worker = new Worker(new URL("./session-worker.js", import.meta.url), { type: "module", name: `loomrealm-session-${epoch.slice(0, 8)}` });
  worker.addEventListener("message", (event: MessageEvent<unknown>) => {
    const value = event.data as Record<string, unknown> | null;
    if (value === null || typeof value !== "object" || value.version !== 1) return;
    if (value.type === "loomrealm.pwa.session-status") {
      if (value.sessionEpoch !== undefined && value.sessionEpoch !== epoch) return;
      state.statuses.push(value);
      if (value.status === "failed") { state.failure = typeof value.detail === "string" ? value.detail : "Session failed"; document.documentElement.dataset.loomrealmProduct = "failed"; }
      if (value.status === "main-started") { state.ready = true; document.documentElement.dataset.loomrealmProduct = "ready"; }
      if (value.status === "settled") document.documentElement.dataset.loomrealmProduct = "settled";
    } else if (value.type === "loomrealm.pwa.observation" && value.sessionEpoch === epoch) state.statuses.push(value);
  });
  worker.addEventListener("error", (event) => { state.failure = event.message; document.documentElement.dataset.loomrealmProduct = "failed"; });
  current = Object.freeze({ epoch, worker, bridge: bridge.port1, controller, renderer });
  state.sessionEpoch = epoch;
  state.serviceWorkerGeneration = expectedServiceWorker.generation;
  state.installationId = installation.installationId;
  state.persistence = installation.persistence;
  worker.postMessage(Object.freeze({ formatVersion: 1, sessionEpoch: epoch, installationId: installation.installationId, expectedServiceWorker, windowBridgePort: bridge.port2 }), [bridge.port2]);
}

function stopCurrent(): void {
  const active = current;
  current = null;
  if (active === null) return;
  try { active.worker.postMessage(Object.freeze({ type: "loomrealm.pwa.session-shutdown", version: 1, sessionEpoch: active.epoch })); } catch {}
  active.controller.abort();
  active.renderer.close();
  active.bridge.close();
  active.worker.terminate();
}

window.addEventListener("pagehide", stopCurrent);
window.addEventListener("pageshow", (event) => { if (event.persisted) void startFreshSession().catch(fail); });

function fail(cause: unknown): void {
  state.failure = cause instanceof Error ? cause.message : String(cause);
  document.documentElement.dataset.loomrealmProduct = "failed";
}

void startFreshSession().catch(fail);
