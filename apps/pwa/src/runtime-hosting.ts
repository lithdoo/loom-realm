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
import type { PwaInstallSubsystemDataV1, PwaRevokeSubsystemDataV1, PwaRunnerBootstrapV1 } from "./bootstrap-protocol.js";

export interface PwaRuntimeDataProvisioner {
  install(request: Omit<PwaInstallSubsystemDataV1, "port">, port: MessagePort): void;
  revoke(request: PwaRevokeSubsystemDataV1): void;
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
  return Object.freeze({
    async launch(request: RuntimeLaunchRequest, signal: AbortSignal): Promise<HostedRuntime> {
      requestValid(request);
      if (signal.aborted) throw signal.reason;
      const runtime = runtimes.get(request.subsystemKey);
      if (runtime === undefined) throw new Error("LAUNCH_RUNTIME_UNAVAILABLE");
      const control = new MessageChannel();
      const state = new MessageChannel();
      const provisioning = new MessageChannel();
      let stateServer: RealmStateCarrierServer | null = serveRealmStateCarrier(options.realmStateAuthority, createRealmStateMessagePortCarrier(state.port1));
      const worker = new Worker(new URL("./worker-runner.js", import.meta.url), { type: "module", name: `loomrealm-${request.subsystemKey}` });
      const ended = deferred<void>();
      let terminal = false;
      let controlAcquired = false;
      const close = () => {
        if (terminal) return;
        terminal = true;
        try { worker.terminate(); } catch {}
        try { provisioning.port1.close(); } catch {}
        void stateServer?.close().catch(() => {}); stateServer = null;
        ended.resolve(undefined);
      };
      worker.addEventListener("error", (event) => { options.observe?.({ type: "runtime-error", subsystemKey: request.subsystemKey, message: event.message }); close(); });
      worker.addEventListener("message", (event: MessageEvent<unknown>) => {
        const value = event.data as Record<string, unknown> | null;
        if (value !== null && typeof value === "object" && Object.keys(value).length === 4 && value.type === "loomrealm.pwa.runner-terminal" && value.version === 1 && value.sessionEpoch === options.sessionEpoch && value.bootstrapToken === request.bootstrapToken) close();
        else if (value !== null && typeof value === "object" && Object.keys(value).length === 3 && value.type === "loomrealm.pwa.runner-failure" && value.version === 1) { options.observe?.({ type: "runtime-error", subsystemKey: request.subsystemKey, message: "Worker bootstrap/runtime failure" }); close(); }
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
      worker.postMessage(bootstrap, [control.port2, state.port2, provisioning.port2]);
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
          try { worker.postMessage(Object.freeze({ type: "loomrealm.pwa.runner-shutdown", version: 1, sessionEpoch: options.sessionEpoch, bootstrapToken: request.bootstrapToken })); } catch {}
          let timer: ReturnType<typeof setTimeout> | undefined;
          await Promise.race([
            ended.promise,
            new Promise<void>((resolve) => { timer = setTimeout(resolve, options.launchPlan.runnerPolicy.terminalCleanupDeadlineMs); }),
          ]);
          if (timer !== undefined) clearTimeout(timer);
          close();
        },
      });
      const provisioner: PwaRuntimeDataProvisioner = Object.freeze({
        install(message: Omit<PwaInstallSubsystemDataV1, "port">, port: MessagePort) { if (terminal) throw new Error("Runtime terminated"); provisioning.port1.postMessage({ ...message, port }, [port]); },
        revoke(message: PwaRevokeSubsystemDataV1) { if (!terminal) provisioning.port1.postMessage(message); },
      });
      try { options.onRuntimeDataProvisioner?.(hosted, provisioner); }
      catch (cause) { close(); throw cause; }
      options.observe?.({ type: "runtime-created", subsystemKey: request.subsystemKey });
      return hosted;
    },
  });
}
