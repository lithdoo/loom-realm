import { parsePwaRuntimeInfoV1, type PwaServiceWorkerGenerationV1 } from "./bootstrap-protocol.js";

const RELOAD_MARKER = "loomrealm-sw-controller-reload-v1";

interface GateWorker {
  readonly state: ServiceWorkerState;
  postMessage(message: unknown, transfer: Transferable[]): void;
  addEventListener(type: "statechange", listener: () => void): void;
  removeEventListener(type: "statechange", listener: () => void): void;
}

interface GateRegistration {
  readonly installing: GateWorker | null;
  readonly waiting: GateWorker | null;
  readonly active: GateWorker | null;
}

interface GateContainer {
  readonly controller: GateWorker | null;
  getRegistration?(clientURL?: string): Promise<GateRegistration | undefined>;
  register(scriptURL: string, options: RegistrationOptions): Promise<GateRegistration>;
}

interface GateStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface ServiceWorkerGateOptions {
  readonly serviceWorkers?: GateContainer;
  readonly storage?: GateStorage;
  readonly reload?: () => void;
  readonly activationTimeoutMs?: number;
  readonly handshakeTimeoutMs?: number;
  readonly createChannel?: () => MessageChannel;
}

function browserContainer(): GateContainer {
  if (!("serviceWorker" in navigator)) throw new Error("Service Worker unavailable");
  const container = navigator.serviceWorker;
  const adaptWorker = (worker: ServiceWorker | null): GateWorker | null => worker === null ? null : Object.freeze({
    get state() { return worker.state; },
    postMessage(message: unknown, transfer: Transferable[]) { worker.postMessage(message, transfer); },
    addEventListener(_type: "statechange", listener: () => void) { worker.addEventListener("statechange", listener); },
    removeEventListener(_type: "statechange", listener: () => void) { worker.removeEventListener("statechange", listener); },
  });
  const adaptRegistration = (registration: ServiceWorkerRegistration): GateRegistration => Object.freeze({
    installing: adaptWorker(registration.installing),
    waiting: adaptWorker(registration.waiting),
    active: adaptWorker(registration.active),
  });
  return Object.freeze({
    get controller() { return adaptWorker(container.controller); },
    async getRegistration(clientURL?: string) {
      const registration = await container.getRegistration(clientURL);
      return registration === undefined ? undefined : adaptRegistration(registration);
    },
    async register(scriptURL: string, options: RegistrationOptions) {
      const registration = await container.register(scriptURL, options);
      if (registration === null || registration === undefined) throw new Error("Service Worker registration unavailable");
      return adaptRegistration(registration);
    },
  });
}

async function waitForFirstControllerEligibility(registration: GateRegistration, timeoutMs: number): Promise<void> {
  // An already-active worker is the controller eligible for the next normal
  // navigation. A concurrent update must not make the first-load path wait on
  // a newer installing/waiting generation.
  const candidate = registration.active ?? registration.installing;
  if (candidate === null) throw new Error("Service Worker registration has no worker");
  if (candidate.state === "activated") return;
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      candidate.removeEventListener("statechange", changed);
      reject(new Error("Service Worker first-install activation timed out"));
    }, timeoutMs);
    const changed = () => {
      if (candidate.state === "activated") {
        clearTimeout(timer);
        candidate.removeEventListener("statechange", changed);
        resolve();
      } else if (candidate.state === "redundant") {
        clearTimeout(timer);
        candidate.removeEventListener("statechange", changed);
        reject(new Error("Service Worker became redundant during first install"));
      }
    };
    candidate.addEventListener("statechange", changed);
  });
}

async function handshake(
  controller: GateWorker,
  timeoutMs: number,
  createChannel: () => MessageChannel,
): Promise<PwaServiceWorkerGenerationV1> {
  return new Promise((resolve, reject) => {
    const channel = createChannel();
    const timer = setTimeout(() => {
      channel.port1.close();
      reject(new Error("Service Worker compatibility handshake timed out"));
    }, timeoutMs);
    channel.port1.addEventListener("message", (event: MessageEvent<unknown>) => {
      clearTimeout(timer);
      channel.port1.close();
      try {
        resolve(parsePwaRuntimeInfoV1(event.data));
      } catch (cause) {
        reject(new Error("Incompatible Service Worker", { cause }));
      }
    }, { once: true });
    channel.port1.start();
    try {
      controller.postMessage(Object.freeze({ type: "loomrealm.pwa.sw-hello", version: 1 }), [channel.port2]);
    } catch (cause) {
      clearTimeout(timer);
      channel.port1.close();
      channel.port2.close();
      reject(cause);
    }
  });
}

/**
 * Pins the controller already governing this document. A waiting update is
 * deliberately irrelevant to the current Session and is never awaited.
 */
export async function serviceWorkerGate(options: ServiceWorkerGateOptions = {}): Promise<PwaServiceWorkerGenerationV1> {
  const serviceWorkers = options.serviceWorkers ?? browserContainer();
  const storage = options.storage ?? sessionStorage;
  const reload = options.reload ?? (() => location.reload());
  // Capture controller identity before any await. The current document owns
  // that controller even if controllerchange fires while the gate is running.
  const controller = serviceWorkers.controller;
  const existing = controller === null ? undefined : await serviceWorkers.getRegistration?.();
  const registration = existing ?? await serviceWorkers.register("/service-worker.js", {
    scope: "/",
    type: "module",
    updateViaCache: "none",
  });
  if (registration === null || registration === undefined) throw new Error("Service Worker registration unavailable");
  if (controller === null) {
    if (storage.getItem(RELOAD_MARKER) !== null) throw new Error("Missing current Service Worker controller after first-install reload");
    await waitForFirstControllerEligibility(registration, options.activationTimeoutMs ?? 10_000);
    storage.setItem(RELOAD_MARKER, "1");
    reload();
    return new Promise(() => {});
  }
  const generation = await handshake(controller, options.handshakeTimeoutMs ?? 5_000, options.createChannel ?? (() => new MessageChannel()));
  storage.removeItem(RELOAD_MARKER);
  return generation;
}
