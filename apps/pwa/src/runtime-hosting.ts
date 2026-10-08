import type { MessageCarrier } from "@loomrealm/foundation";
import type { PwaLaunchPlan } from "@loomrealm/game-launcher-pwa";
import type { HostedRuntime, RuntimeHosting, RuntimeLaunchRequest, SubsystemDataBindingResult } from "@loomrealm/platform-ports";
import {
  createRealmStateMessagePortCarrier,
  serveRealmStateCarrier,
  type RealmStateClient,
  type RealmStateCarrierServer,
} from "@loomrealm/realm-state";
import { createMessagePortCarrier } from "./message-port-carrier.js";
import { parseRunnerDataResult } from "./bootstrap-protocol.js";
import type { PwaInstallSubsystemDataV1, PwaRevokeSubsystemDataV1, PwaRunnerBootstrapV1 } from "./bootstrap-protocol.js";

export interface PwaRuntimeDataProvisioner {
  install(request: Omit<PwaInstallSubsystemDataV1, "port">, port: MessagePort, signal?: AbortSignal): Promise<void>;
  revoke(request: PwaRevokeSubsystemDataV1, signal?: AbortSignal): Promise<void>;
}

interface PendingProvisioningRequest {
  readonly requestId: string;
  readonly connectionId: string;
  readonly timer: ReturnType<typeof setTimeout>;
  resolve(): void;
  reject(cause: unknown): void;
  cleanup(): void;
}

export class RunnerDataProvisioner implements PwaRuntimeDataProvisioner {
  private readonly pending = new Map<string, PendingProvisioningRequest>();
  private closed = false;

  constructor(
    private readonly port: MessagePort,
    private readonly subsystemKey: string,
    private readonly requestTimeoutMs = 10_000,
  ) {
    port.addEventListener("message", this.onMessage);
    port.addEventListener("messageerror", this.onMessageError);
    port.start();
  }

  install(request: Omit<PwaInstallSubsystemDataV1, "port">, port: MessagePort, signal?: AbortSignal): Promise<void> {
    return this.request(request, [port], { ...request, port }, signal);
  }

  revoke(request: PwaRevokeSubsystemDataV1, signal?: AbortSignal): Promise<void> {
    if (this.closed) return Promise.resolve();
    return this.request(request, [], request, signal);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.port.removeEventListener("message", this.onMessage);
    this.port.removeEventListener("messageerror", this.onMessageError);
    this.port.close();
    for (const pending of this.pending.values()) {
      pending.cleanup();
      pending.reject(new Error("Runtime Data provisioning closed"));
    }
    this.pending.clear();
  }

  private request(
    request: Omit<PwaInstallSubsystemDataV1, "port"> | PwaRevokeSubsystemDataV1,
    transfer: Transferable[],
    message: PwaInstallSubsystemDataV1 | PwaRevokeSubsystemDataV1,
    signal?: AbortSignal,
  ): Promise<void> {
    if (this.closed || signal?.aborted || request.subsystemKey !== this.subsystemKey || this.pending.has(request.requestId)) {
      if (signal?.aborted) return Promise.reject(signal.reason);
      return Promise.reject(new Error("Invalid Runtime Data provisioning request"));
    }
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
      };
      const onAbort = () => {
        if (!this.pending.delete(request.requestId)) return;
        cleanup();
        reject(signal!.reason);
      };
      const timer = setTimeout(() => {
        this.pending.delete(request.requestId);
        signal?.removeEventListener("abort", onAbort);
        reject(new Error("Runtime Data provisioning timed out"));
      }, this.requestTimeoutMs);
      this.pending.set(request.requestId, { requestId: request.requestId, connectionId: request.connectionId, timer, resolve, reject, cleanup });
      signal?.addEventListener("abort", onAbort, { once: true });
      try { this.port.postMessage(message, transfer); }
      catch (cause) {
        cleanup();
        this.pending.delete(request.requestId);
        reject(cause);
      }
    });
  }

  private readonly onMessage = (event: MessageEvent<unknown>) => {
    const candidate = event.data as { requestId?: unknown } | null;
    if (candidate === null || typeof candidate !== "object" || typeof candidate.requestId !== "string") {
      this.close();
      return;
    }
    const pending = this.pending.get(candidate.requestId);
    if (pending === undefined) return;
    try {
      const result = parseRunnerDataResult(event.data, this.subsystemKey, pending.requestId);
      if (result.connectionId !== pending.connectionId || !result.ok) throw new Error("Runner rejected Data provisioning");
      this.pending.delete(pending.requestId);
      pending.cleanup();
      pending.resolve();
    } catch (cause) {
      this.pending.delete(pending.requestId);
      pending.cleanup();
      pending.reject(cause);
    }
  };

  private readonly onMessageError = () => this.close();
}

interface Deferred<T> { readonly promise: Promise<T>; resolve(value: T): void; reject(cause: unknown): void }
function deferred<T>(): Deferred<T> {
  let settled = false; let resolvePromise!: (value: T) => void; let rejectPromise!: (cause: unknown) => void;
  const promise = new Promise<T>((resolve, reject) => { resolvePromise = resolve; rejectPromise = reject; });
  return { promise, resolve(value) { if (!settled) { settled = true; resolvePromise(value); } }, reject(cause) { if (!settled) { settled = true; rejectPromise(cause); } } };
}

function requestValid(request: RuntimeLaunchRequest): void {
  if (request === null || typeof request !== "object" || typeof request.subsystemKey !== "string" || request.subsystemKey.length === 0 || typeof request.bootstrapToken !== "string" || request.bootstrapToken.length === 0) throw new TypeError("Invalid PWA Runtime launch request");
}

export function createPwaRuntimeHosting(options: {
  readonly launchPlan: PwaLaunchPlan;
  readonly sessionEpoch: string;
  readonly realmStateAuthority: RealmStateClient;
  readonly onRuntimeDataProvisioner?: (runtime: HostedRuntime, provisioner: PwaRuntimeDataProvisioner) => void;
  readonly observe?: (event: Readonly<Record<string, unknown> & { type: string }>) => void;
}): RuntimeHosting {
  const runtimes = new Map(options.launchPlan.runtimes.map((runtime) => [runtime.subsystemKey, runtime] as const));
  const report = (event: Readonly<Record<string, unknown> & { type: string }>): void => {
    try { options.observe?.(Object.freeze(event)); }
    catch (cause) { console.error("PWA RuntimeHosting observation failed", cause); }
  };
  return Object.freeze({
    async launch(request: RuntimeLaunchRequest, signal: AbortSignal): Promise<HostedRuntime> {
      requestValid(request);
      if (signal.aborted) throw signal.reason;
      const runtime = runtimes.get(request.subsystemKey);
      if (runtime === undefined) throw new Error("LAUNCH_RUNTIME_UNAVAILABLE");
      const control = new MessageChannel();
      const state = new MessageChannel();
      const provisioning = new MessageChannel();
      const provisioner = new RunnerDataProvisioner(provisioning.port1, request.subsystemKey);
      let stateServer: RealmStateCarrierServer | null = serveRealmStateCarrier(options.realmStateAuthority, createRealmStateMessagePortCarrier(state.port1));
      const worker = new Worker(new URL("./worker-runner.js", import.meta.url), { type: "module", name: `loomrealm-${request.subsystemKey}` });
      const ended = deferred<void>();
      let terminal = false;
      let controlAcquired = false;
      const close = () => {
        if (terminal) return;
        terminal = true;
        worker.terminate();
        provisioner.close();
        const closingStateServer = stateServer;
        stateServer = null;
        if (closingStateServer !== null) {
          void closingStateServer.close().catch((cause) => report({ type: "runtime-cleanup-error", subsystemKey: request.subsystemKey, detail: cause instanceof Error ? cause.message : String(cause) }));
        }
        ended.resolve(undefined);
      };
      worker.addEventListener("error", (event) => { report({ type: "runtime-error", subsystemKey: request.subsystemKey, message: event.message }); close(); });
      worker.addEventListener("message", (event: MessageEvent<unknown>) => {
        const value = event.data as Record<string, unknown> | null;
        if (value !== null && typeof value === "object" && Object.keys(value).length === 4 && value.type === "loomrealm.pwa.runner-terminal" && value.version === 1 && value.sessionEpoch === options.sessionEpoch && value.bootstrapToken === request.bootstrapToken) close();
        else if (value !== null && typeof value === "object" && Object.keys(value).length === 3 && value.type === "loomrealm.pwa.runner-failure" && value.version === 1) { report({ type: "runtime-error", subsystemKey: request.subsystemKey, message: "Worker bootstrap/runtime failure" }); close(); }
      });
      const bootstrap: PwaRunnerBootstrapV1 = Object.freeze({
        formatVersion: 1,
        sessionEpoch: options.sessionEpoch,
        installationId: options.launchPlan.installationId,
        expectedServiceWorker: options.launchPlan.expectedServiceWorker,
        subsystemKey: request.subsystemKey,
        logicalModule: runtime.logicalModule,
        bootstrapToken: request.bootstrapToken,
        runtimeControlPort: control.port2,
        realmStatePort: state.port2,
        provisioningPort: provisioning.port2,
      });
      try { worker.postMessage(bootstrap, [control.port2, state.port2, provisioning.port2]); }
      catch (cause) { close(); throw cause; }
      const hosted: HostedRuntime = Object.freeze({
        runtimeControl: Object.freeze({
          acquire(acquireSignal: AbortSignal): Promise<MessageCarrier> {
            if (controlAcquired) return Promise.reject(new Error("Runtime Control already acquired"));
            controlAcquired = true;
            if (terminal || acquireSignal.aborted) { control.port1.close(); return Promise.reject(acquireSignal.reason ?? new Error("Runtime terminated")); }
            return Promise.resolve(createMessagePortCarrier(control.port1));
          },
        }),
        terminated: ended.promise,
        async requestTermination(terminationSignal: AbortSignal): Promise<void> {
          if (terminationSignal.aborted) throw terminationSignal.reason;
          if (terminal) return;
          try { worker.postMessage(Object.freeze({ type: "loomrealm.pwa.runner-shutdown", version: 1, sessionEpoch: options.sessionEpoch, bootstrapToken: request.bootstrapToken })); }
          catch (cause) {
            report({ type: "runtime-shutdown-signal-failed", subsystemKey: request.subsystemKey, detail: cause instanceof Error ? cause.message : String(cause) });
            close();
            return;
          }
          let timer: ReturnType<typeof setTimeout> | undefined;
          await Promise.race([
            ended.promise,
            new Promise<void>((resolve) => { timer = setTimeout(resolve, options.launchPlan.runnerPolicy.terminalCleanupDeadlineMs); }),
          ]);
          if (timer !== undefined) clearTimeout(timer);
          close();
        },
      });
      try { options.onRuntimeDataProvisioner?.(hosted, provisioner); }
      catch (cause) { close(); throw cause; }
      report({ type: "runtime-created", subsystemKey: request.subsystemKey });
      return hosted;
    },
  });
}
