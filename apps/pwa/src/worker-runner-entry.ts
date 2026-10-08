import type { MessageCarrier } from "@loomrealm/foundation";
import type { DeadlineScheduler, RuntimeControlBinding, SubsystemDataBinding, SubsystemDataBindingResult } from "@loomrealm/platform-ports";
import {
  createRealmStateCarrierBinding,
  createRealmStateClient,
  createRealmStateMessagePortCarrier,
} from "@loomrealm/realm-state";
import type { SubsystemDefinitionFactory } from "@loomrealm/subsystem";
import { createSameOriginContentClient, runSubsystem } from "@loomrealm/subsystem/host";
import {
  parseInstallSubsystemData,
  parsePwaRunnerBootstrapV1,
  parsePwaRuntimeInfoV1,
  parseRevokeSubsystemData,
  sameServiceWorkerGeneration,
  type PwaRunnerDataResultV1,
} from "./bootstrap-protocol.js";
import { createMessagePortCarrier } from "./message-port-carrier.js";

interface DataTuple { readonly subsystemKey: string; readonly generation: number; readonly dataProfile: string }
interface CurrentData { readonly tuple: DataTuple; readonly connectionId: string; readonly carrier: MessageCarrier; delivered: boolean }

class RunnerDataBinding {
  readonly binding: SubsystemDataBinding;
  private current: CurrentData | null = null;
  private waiter: { readonly signal: AbortSignal; resolve(value: SubsystemDataBindingResult): void; reject(cause: unknown): void } | null = null;
  private readonly seen = new Set<string>();

  constructor(private readonly port: MessagePort, private readonly subsystemKey: string) {
    this.binding = Object.freeze({ acquire: (signal: AbortSignal) => this.acquire(signal) });
    port.addEventListener("message", this.onMessage);
    port.start();
  }

  private acquire(signal: AbortSignal): Promise<SubsystemDataBindingResult> {
    if (signal.aborted) return Promise.reject(signal.reason);
    if (this.current !== null && !this.current.delivered) { this.current.delivered = true; return Promise.resolve(Object.freeze({ carrier: this.current.carrier, generation: this.current.tuple.generation, dataProfile: this.current.tuple.dataProfile })); }
    if (this.waiter !== null) return Promise.reject(new Error("Subsystem Data acquire already pending"));
    return new Promise((resolve, reject) => {
      const waiter = { signal, resolve, reject };
      this.waiter = waiter;
      signal.addEventListener("abort", () => { if (this.waiter === waiter) { this.waiter = null; reject(signal.reason); } }, { once: true });
    });
  }

  private readonly onMessage = (event: MessageEvent<unknown>) => {
    const value = event.data;
    if (value === null || typeof value !== "object" || Array.isArray(value)) return;
    const item = value as Record<string, unknown>;
    if (item.type === "data/install") {
      let request;
      try { request = parseInstallSubsystemData(value, this.subsystemKey); }
      catch {
        try { if (item.port instanceof MessagePort) item.port.close(); }
        catch (cause) { console.error("Invalid Runner Data endpoint could not be closed", cause); }
        this.reply(item.requestId, item.connectionId, false);
        return;
      }
      if (this.seen.has(request.requestId) || this.current !== null) {
        request.port.close();
        this.reply(request.requestId, request.connectionId, false);
        return;
      }
      this.seen.add(request.requestId);
      const tuple = Object.freeze({ subsystemKey: this.subsystemKey, generation: request.generation, dataProfile: request.dataProfile });
      this.current = { tuple, connectionId: request.connectionId, carrier: createMessagePortCarrier(request.port), delivered: false };
      const waiter = this.waiter;
      if (waiter !== null && !waiter.signal.aborted) { this.waiter = null; this.current.delivered = true; waiter.resolve(Object.freeze({ carrier: this.current.carrier, generation: tuple.generation, dataProfile: tuple.dataProfile })); }
      this.reply(request.requestId, request.connectionId, true);
      return;
    }
    if (item.type === "data/revoke") {
      let request;
      try { request = parseRevokeSubsystemData(value, this.subsystemKey); }
      catch { this.reply(item.requestId, item.connectionId, false); return; }
      if (this.seen.has(request.requestId)) { this.reply(request.requestId, request.connectionId, false); return; }
      this.seen.add(request.requestId);
      const current = this.current;
      if (current !== null && request.connectionId === current.connectionId && request.generation === current.tuple.generation && request.dataProfile === current.tuple.dataProfile) {
        this.current = null;
        void current.carrier.close().catch((cause) => console.error("Runner Data carrier close failed", cause));
      }
      this.reply(request.requestId, request.connectionId, true);
    }
  };

  private reply(requestId: unknown, connectionId: unknown, ok: boolean): void {
    if (typeof requestId !== "string" || typeof connectionId !== "string") return;
    const result: PwaRunnerDataResultV1 = Object.freeze({
      formatVersion: 1,
      type: "data/result",
      requestId,
      subsystemKey: this.subsystemKey,
      connectionId,
      ok,
    });
    this.port.postMessage(result);
  }

  async close(): Promise<void> {
    this.port.removeEventListener("message", this.onMessage);
    this.port.close();
    if (this.current !== null) await this.current.carrier.close();
    this.waiter?.reject(new Error("Runner Data binding closed"));
    this.current = null; this.waiter = null;
  }
}

let consumed = false;
self.addEventListener("message", (event: MessageEvent<unknown>) => {
  if (consumed) return;
  consumed = true;
  void run(event.data).catch(() => {
    self.postMessage(Object.freeze({ type: "loomrealm.pwa.runner-failure", version: 1, phase: "bootstrap-or-runtime" }));
    (self as unknown as DedicatedWorkerGlobalScope).close();
  });
}, { once: true });

async function run(raw: unknown): Promise<void> {
  const bootstrap = parsePwaRunnerBootstrapV1(raw);
  const lifetime = new AbortController();
  const onShutdown = (event: MessageEvent<unknown>) => {
    const value = event.data as Record<string, unknown> | null;
    if (value !== null && typeof value === "object" && Object.keys(value).length === 4 && value.type === "loomrealm.pwa.runner-shutdown" && value.version === 1 && value.sessionEpoch === bootstrap.sessionEpoch && value.bootstrapToken === bootstrap.bootstrapToken) lifetime.abort(new Error("Runtime termination requested"));
  };
  self.addEventListener("message", onShutdown);
  const response = await fetch("/_lr/internal/runtime-info", { cache: "no-store", signal: lifetime.signal });
  if (!response.ok) throw new Error("Service Worker runtime-info unavailable");
  const runtimeInfo = parsePwaRuntimeInfoV1(await response.json());
  if (!sameServiceWorkerGeneration(runtimeInfo, bootstrap.expectedServiceWorker)) throw new Error("Service Worker generation mismatch");
  const stateClient = createRealmStateClient(createRealmStateCarrierBinding(createRealmStateMessagePortCarrier(bootstrap.realmStatePort)));
  const data = new RunnerDataBinding(bootstrap.provisioningPort, bootstrap.subsystemKey);
  let acquired = false;
  const runtimeControl: RuntimeControlBinding = Object.freeze({
    acquire(signal: AbortSignal) {
      if (acquired) return Promise.reject(new Error("Runtime Control already acquired"));
      acquired = true;
      if (signal.aborted) return Promise.reject(signal.reason);
      return Promise.resolve(createMessagePortCarrier(bootstrap.runtimeControlPort));
    },
  });
  const scheduler: DeadlineScheduler = Object.freeze({ schedule(delayMs: number, callback: () => void) { const timer = setTimeout(callback, delayMs); return () => clearTimeout(timer); } });
  try {
    const moduleUrl = new URL(`/_lr/internal/executables/${encodeURIComponent(bootstrap.installationId)}/${bootstrap.logicalModule.split("/").map(encodeURIComponent).join("/")}`, location.origin).href;
    const imported = await import(moduleUrl) as { default?: unknown };
    if (typeof imported.default !== "function") throw new TypeError("Subsystem Definition Module default export is invalid");
    const content = createSameOriginContentClient({ installationId: bootstrap.installationId }, lifetime.signal);
    await runSubsystem({
      definition: imported.default as SubsystemDefinitionFactory,
      runtimeControl,
      runtimePolicy: { scheduler, helloDeadlineMs: 10_000, frameDeadlineMs: 10_000, terminalCleanupDeadlineMs: 250 },
      launch: { subsystemKey: bootstrap.subsystemKey, bootstrapToken: bootstrap.bootstrapToken, controlProtocolVersions: [1] },
      data: data.binding,
      content,
      state: Object.freeze({ client: stateClient, terminate: () => stateClient.terminate() }),
    });
  } finally {
    self.removeEventListener("message", onShutdown);
    lifetime.abort();
    stateClient.terminate();
    await data.close();
    await new Promise((resolve) => setTimeout(resolve, 0));
    self.postMessage(Object.freeze({ type: "loomrealm.pwa.runner-terminal", version: 1, sessionEpoch: bootstrap.sessionEpoch, bootstrapToken: bootstrap.bootstrapToken }));
  }
}
