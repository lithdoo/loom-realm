import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import type { MessageCarrier } from "@loomrealm/foundation";
import type {
  HostedRuntime,
  MainRuntimeControlBinding,
  RuntimeHosting,
  RuntimeLaunchRequest,
} from "@loomrealm/platform-ports";
import WebSocket, { WebSocketServer } from "ws";
import { HostraLauncherError, launcherError } from "./errors.js";
import type { HostraLaunchPlan, HostraResolvedRuntime } from "./launch-plan.js";
import { BOOTSTRAP_ENV_KEY, type RunnerBootstrapV1 } from "./runner/bootstrap.js";
import { createWebSocketCarrier } from "./websocket-carrier.js";

const ENV_ALLOWLIST = [
  "PATH",
  "HOME",
  "USERPROFILE",
  "HOMEDRIVE",
  "HOMEPATH",
  "TMPDIR",
  "TMP",
  "TEMP",
  "SystemRoot",
  "WINDIR",
] as const;

interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve(value: T): void;
  reject(error: unknown): void;
}

function deferred<T>(): Deferred<T> {
  let settled = false;
  let resolvePromise!: (value: T) => void;
  let rejectPromise!: (error: unknown) => void;
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return {
    promise,
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

export function buildRunnerEnvironment(
  parent: NodeJS.ProcessEnv,
  encodedBootstrap: string,
): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {};
  if (process.platform === "win32") {
    const values = new Map(
      Object.entries(parent).map(([key, value]) => [key.toUpperCase(), value] as const),
    );
    for (const key of ENV_ALLOWLIST) {
      const value = values.get(key.toUpperCase());
      if (value !== undefined) environment[key] = value;
    }
  } else {
    for (const key of ENV_ALLOWLIST) {
      const value = parent[key];
      if (value !== undefined) environment[key] = value;
    }
  }
  environment[BOOTSTRAP_ENV_KEY] = encodedBootstrap;
  return environment;
}

function encodeBootstrap(bootstrap: RunnerBootstrapV1): string {
  const encoded = JSON.stringify(bootstrap);
  if (Buffer.byteLength(encoded, "utf8") > 16_384) {
    throw launcherError("LAUNCH_RUNTIME_UNAVAILABLE");
  }
  return encoded;
}

async function listen(server: WebSocketServer): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const onListening = () => {
      server.off("error", onError);
      resolve();
    };
    const onError = (error: unknown) => {
      server.off("listening", onListening);
      reject(error);
    };
    server.once("listening", onListening);
    server.once("error", onError);
  });
}

function closeServer(server: WebSocketServer): void {
  try {
    server.close();
  } catch {
    // Idempotent best-effort listener closure.
  }
}

function validateRequest(
  request: RuntimeLaunchRequest,
  runtimes: ReadonlyMap<string, HostraResolvedRuntime>,
): HostraResolvedRuntime {
  if (
    request === null ||
    typeof request !== "object" ||
    typeof request.subsystemKey !== "string" ||
    request.subsystemKey.length === 0 ||
    typeof request.bootstrapToken !== "string" ||
    request.bootstrapToken.length === 0
  ) {
    throw new TypeError("Invalid Runtime launch request");
  }
  const runtime = runtimes.get(request.subsystemKey);
  if (runtime === undefined) throw launcherError("LAUNCH_RUNTIME_UNAVAILABLE");
  return runtime;
}

async function launchAttempt(
  plan: HostraLaunchPlan,
  runtimes: ReadonlyMap<string, HostraResolvedRuntime>,
  request: RuntimeLaunchRequest,
  signal: AbortSignal,
): Promise<HostedRuntime> {
  if (signal.aborted) throw signal.reason;
  const runtime = validateRequest(request, runtimes);
  const capability = randomBytes(32).toString("base64url");
  const capabilityPath = `/${capability}`;
  const server = new WebSocketServer({
    host: "127.0.0.1",
    port: 0,
    path: capabilityPath,
    verifyClient: ({ req }, done) => done(req.url === capabilityPath),
  });
  try {
    await listen(server);
  } catch (error) {
    closeServer(server);
    void error;
    throw launcherError("LAUNCH_RUNTIME_UNAVAILABLE");
  }
  if (signal.aborted) {
    closeServer(server);
    throw signal.reason;
  }
  const address = server.address();
  if (address === null || typeof address === "string") {
    closeServer(server);
    throw launcherError("LAUNCH_RUNTIME_UNAVAILABLE");
  }

  const attempt: { ownership: "pending" | "returned" | "abandoned" } = {
    ownership: "pending",
  };
  let child: ChildProcess;
  let spawned = false;
  let exited = false;
  let controlCarrier: MessageCarrier | null = null;
  let controlAcquired = false;
  let acquireWaiter: Deferred<MessageCarrier> | null = null;
  let terminationCommitted = false;
  let terminationConvergence: Promise<void> | null = null;
  let forceTimer: NodeJS.Timeout | null = null;
  const terminated = deferred<void>();

  const controlEndpoint = `ws://127.0.0.1:${address.port}${capabilityPath}`;
  const bootstrap: RunnerBootstrapV1 = Object.freeze({
    version: 1,
    subsystemKey: request.subsystemKey,
    physicalModule: runtime.physicalModule,
    controlEndpoint,
    bootstrapToken: request.bootstrapToken,
    controlProtocolVersions: Object.freeze([1] as [1]),
    helloDeadlineMs: plan.runnerPolicy.helloDeadlineMs,
    frameDeadlineMs: plan.runnerPolicy.frameDeadlineMs,
    terminalCleanupDeadlineMs: plan.runnerPolicy.terminalCleanupDeadlineMs,
  });
  let encodedBootstrap: string;
  try {
    encodedBootstrap = encodeBootstrap(bootstrap);
  } catch (error) {
    closeServer(server);
    throw error;
  }

  server.on("connection", (socket: WebSocket) => {
    if (controlCarrier !== null || exited || attempt.ownership === "abandoned") {
      socket.terminate();
      return;
    }
    controlCarrier = createWebSocketCarrier(socket);
    closeServer(server);
    acquireWaiter?.resolve(controlCarrier);
    acquireWaiter = null;
  });

  const forceTerminate = () => {
    if (exited) return;
    try {
      const requested = child.kill(process.platform === "win32" ? undefined : "SIGKILL");
      if (!requested && !exited) {
        terminated.reject(launcherError("PROCESS_TERMINATION_FAILED"));
      }
    } catch {
      terminated.reject(launcherError("PROCESS_TERMINATION_FAILED"));
    }
  };
  const abandon = () => {
    if (attempt.ownership !== "pending") return;
    attempt.ownership = "abandoned";
    closeServer(server);
    acquireWaiter?.reject(signal.reason);
    acquireWaiter = null;
    if (typeof child !== "undefined") forceTerminate();
  };
  signal.addEventListener("abort", abandon, { once: true });

  try {
    child = spawn(plan.canonicalNodeExecutable, [plan.runnerEntry], {
      shell: false,
      cwd: plan.canonicalInstallationRoot,
      env: buildRunnerEnvironment(process.env, encodedBootstrap),
      stdio: "ignore",
    });
  } catch (error) {
    signal.removeEventListener("abort", abandon);
    closeServer(server);
    void error;
    throw launcherError("PROCESS_SPAWN_FAILED");
  }

  const establishment = deferred<"spawned" | "exited">();
  child.once("spawn", () => {
    spawned = true;
    if (attempt.ownership === "abandoned") forceTerminate();
    establishment.resolve("spawned");
  });
  child.once("error", (error) => {
    if (!spawned) {
      void error;
      establishment.reject(launcherError("PROCESS_SPAWN_FAILED"));
    }
  });
  child.once("exit", () => {
    exited = true;
    if (forceTimer !== null) {
      clearTimeout(forceTimer);
      forceTimer = null;
    }
    closeServer(server);
    void controlCarrier?.close().catch(() => {});
    acquireWaiter?.reject(launcherError("PROCESS_EXITED_DURING_BOOTSTRAP"));
    acquireWaiter = null;
    establishment.resolve("exited");
    terminated.resolve(undefined);
  });

  let outcome: "spawned" | "exited";
  try {
    outcome = await establishment.promise;
  } catch (error) {
    signal.removeEventListener("abort", abandon);
    closeServer(server);
    throw error;
  }
  if (attempt.ownership === "abandoned") {
    signal.removeEventListener("abort", abandon);
    throw signal.reason;
  }
  if (outcome === "exited" || exited) {
    signal.removeEventListener("abort", abandon);
    throw launcherError("PROCESS_EXITED_DURING_BOOTSTRAP");
  }
  attempt.ownership = "returned";
  signal.removeEventListener("abort", abandon);

  const runtimeControl: MainRuntimeControlBinding = Object.freeze({
    acquire(acquireSignal: AbortSignal): Promise<MessageCarrier> {
      if (controlAcquired) return Promise.reject(new Error("Runtime Control binding already acquired"));
      controlAcquired = true;
      if (acquireSignal.aborted) {
        closeServer(server);
        void controlCarrier?.close().catch(() => {});
        return Promise.reject(acquireSignal.reason);
      }
      if (controlCarrier !== null) return Promise.resolve(controlCarrier);
      if (exited) return Promise.reject(launcherError("PROCESS_EXITED_DURING_BOOTSTRAP"));
      acquireWaiter = deferred<MessageCarrier>();
      const onAbort = () => {
        closeServer(server);
        acquireWaiter?.reject(acquireSignal.reason);
        acquireWaiter = null;
      };
      acquireSignal.addEventListener("abort", onAbort, { once: true });
      return acquireWaiter.promise.finally(() => {
        acquireSignal.removeEventListener("abort", onAbort);
      });
    },
  });

  const hosted: HostedRuntime = Object.freeze({
    runtimeControl,
    terminated: terminated.promise,
    requestTermination(terminationSignal: AbortSignal): Promise<void> {
      if (terminationCommitted) return terminationConvergence!;
      if (terminationSignal.aborted) return Promise.reject(terminationSignal.reason);
      terminationCommitted = true;
      terminationConvergence = Promise.resolve().then(() => {
        if (exited) return;
        try {
          const requested = child.kill();
          if (!requested && !exited) {
            throw launcherError("PROCESS_TERMINATION_FAILED");
          }
          forceTimer = setTimeout(forceTerminate, plan.runnerPolicy.terminationGraceMs);
        } catch (error) {
          if (error instanceof HostraLauncherError) throw error;
          void error;
          throw launcherError("PROCESS_TERMINATION_FAILED");
        }
      });
      return terminationConvergence;
    },
  });
  return hosted;
}

export function createHostraRuntimeHosting(options: {
  readonly launchPlan: HostraLaunchPlan;
}): RuntimeHosting {
  if (options === null || typeof options !== "object" || options.launchPlan === null) {
    throw new TypeError("Invalid Hostra RuntimeHosting options");
  }
  const plan = options.launchPlan;
  const runtimes = new Map(plan.runtimes.map((runtime) => [runtime.subsystemKey, runtime] as const));
  return Object.freeze({
    launch(request: RuntimeLaunchRequest, signal: AbortSignal) {
      return launchAttempt(plan, runtimes, request, signal);
    },
  });
}
