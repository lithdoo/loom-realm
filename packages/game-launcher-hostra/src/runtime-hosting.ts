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
import {
  serveSharedStateCarrier,
  type SharedStateClient,
  type SharedStateCarrierServer,
} from "@loomrealm/shared-state";
import { HostraLauncherError, launcherError } from "./errors.js";
import type { HostraLaunchPlan, HostraResolvedRuntime } from "./launch-plan.js";
import { BOOTSTRAP_ENV_KEY, type RunnerBootstrapV1 } from "./runner/bootstrap.js";
import {
  createHostraRuntimeDataProvisioner,
  type HostraRuntimeDataProvisioner,
} from "./data-provisioning.js";
import { CONTENT_ACCESS_ENV_KEY, encodeHostraContentAccess, validateHostraContentAccess, type HostraContentAccess } from "./content-access.js";
import { createSharedStateWebSocketCarrier } from "./shared-state-websocket-carrier.js";
import { createWebSocketCarrier } from "./websocket-carrier.js";
import {
  serveSessionEventCarrier,
  type SessionEventCarrierServer,
  type SessionEventHub,
} from "@loomrealm/session-events";
import { createSessionEventWebSocketCarrier } from "./session-events-websocket-carrier.js";
import { SESSION_EVENTS_ENDPOINT_ENV_KEY } from "./runner/session-events.js";

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

const ELECTRON_RUN_AS_NODE_ENV_KEY = "ELECTRON_RUN_AS_NODE";

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
  encodedContentAccess?: string,
  sessionEventsEndpoint?: string,
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
  if (encodedContentAccess !== undefined) environment[CONTENT_ACCESS_ENV_KEY] = encodedContentAccess;
  if (sessionEventsEndpoint !== undefined) environment[SESSION_EVENTS_ENDPOINT_ENV_KEY] = sessionEventsEndpoint;
  if (typeof process.versions.electron === "string") {
    environment[ELECTRON_RUN_AS_NODE_ENV_KEY] = "1";
  }
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
  if (server.address() !== null) return;
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
  sharedStateAuthority: SharedStateClient,
  sessionEventHub: SessionEventHub,
  onRuntimeDataProvisioner?: (
    runtime: HostedRuntime,
    provisioner: HostraRuntimeDataProvisioner,
  ) => void,
  contentAccess?: HostraContentAccess,
): Promise<HostedRuntime> {
  if (signal.aborted) throw signal.reason;
  const runtime = validateRequest(request, runtimes);
  const capability = randomBytes(32).toString("base64url");
  const capabilityPath = `/${capability}`;
  let validConnectionClaimed = false;
  let pendingServerFailure = false;
  let convergeServerFailure: (() => void) | null = null;
  const server = new WebSocketServer({
    host: "127.0.0.1",
    port: 0,
    path: capabilityPath,
    verifyClient: ({ req }, done) => {
      if (req.url !== capabilityPath || validConnectionClaimed) {
        done(false);
        return;
      }
      validConnectionClaimed = true;
      done(true);
    },
  });
  const stateCapability = randomBytes(32).toString("base64url");
  const stateCapabilityPath = `/${stateCapability}`;
  const stateServer = new WebSocketServer({
    host: "127.0.0.1",
    port: 0,
    path: stateCapabilityPath,
    verifyClient: ({ req }, done) => done(req.url === stateCapabilityPath),
  });
  const eventsCapabilityPath = `/${randomBytes(32).toString("base64url")}`;
  const eventsServer = new WebSocketServer({
    host: "127.0.0.1",
    port: 0,
    path: eventsCapabilityPath,
    verifyClient: ({ req }, done) => done(req.url === eventsCapabilityPath),
  });
  let sharedStateCarrierServer: SharedStateCarrierServer | null = null;
  let sessionEventCarrierServer: SessionEventCarrierServer | null = null;
  const closeSharedStateCarrier = () => {
    const active = sharedStateCarrierServer;
    if (active !== null) void active.close().catch(() => {});
  };
  const closeSessionEventCarrier = () => {
    const active = sessionEventCarrierServer;
    if (active !== null) void active.close().catch(() => {});
  };
  server.on("error", () => {
    pendingServerFailure = true;
    convergeServerFailure?.();
  });
  try {
    await listen(server);
    await listen(stateServer);
    await listen(eventsServer);
  } catch (error) {
    closeServer(server);
    closeServer(stateServer);
    closeServer(eventsServer);
    void error;
    throw launcherError("LAUNCH_RUNTIME_UNAVAILABLE");
  }
  if (signal.aborted) {
    closeServer(server);
    closeServer(stateServer);
    closeServer(eventsServer);
    throw signal.reason;
  }
  const address = server.address();
  if (address === null || typeof address === "string") {
    closeServer(server);
    closeServer(stateServer);
    closeServer(eventsServer);
    throw launcherError("LAUNCH_RUNTIME_UNAVAILABLE");
  }
  const stateAddress = stateServer.address();
  if (stateAddress === null || typeof stateAddress === "string") {
    closeServer(server);
    closeServer(stateServer);
    closeServer(eventsServer);
    throw launcherError("LAUNCH_RUNTIME_UNAVAILABLE");
  }
  const eventsAddress = eventsServer.address();
  if (eventsAddress === null || typeof eventsAddress === "string") {
    closeServer(server);
    closeServer(stateServer);
    closeServer(eventsServer);
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
  let serverFailure: HostraLauncherError | null = null;
  let spawnStarted = false;
  const terminated = deferred<void>();
  const establishment = deferred<"spawned" | "exited">();

  const controlEndpoint = `ws://127.0.0.1:${address.port}${capabilityPath}`;
  const sharedStateEndpoint = `ws://127.0.0.1:${stateAddress.port}${stateCapabilityPath}`;
  const sessionEventsEndpoint = `ws://127.0.0.1:${eventsAddress.port}${eventsCapabilityPath}`;
  const bootstrap: RunnerBootstrapV1 = Object.freeze({
    version: 1,
    subsystemKey: request.subsystemKey,
    physicalModule: runtime.physicalModule,
    controlEndpoint,
    sharedStateEndpoint,
    bootstrapToken: request.bootstrapToken,
    controlProtocolVersions: Object.freeze([1] as [1]),
    helloDeadlineMs: plan.runnerPolicy.helloDeadlineMs,
    frameDeadlineMs: plan.runnerPolicy.frameDeadlineMs,
    terminalCleanupDeadlineMs: plan.runnerPolicy.terminalCleanupDeadlineMs,
  });
  let encodedBootstrap: string;
  let encodedContentAccess: string | undefined;
  try {
    encodedBootstrap = encodeBootstrap(bootstrap);
    encodedContentAccess = contentAccess === undefined ? undefined : encodeHostraContentAccess(contentAccess);
  } catch (error) {
    closeServer(server);
    closeServer(stateServer);
    closeServer(eventsServer);
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
  stateServer.on("error", () => {
    pendingServerFailure = true;
    convergeServerFailure?.();
  });
  stateServer.on("connection", (socket: WebSocket) => {
    if (sharedStateCarrierServer !== null || exited || attempt.ownership === "abandoned") {
      socket.terminate();
      return;
    }
    const served = serveSharedStateCarrier(
      sharedStateAuthority,
      createSharedStateWebSocketCarrier(socket),
    );
    sharedStateCarrierServer = served;
    void served.closed.then(() => {
      if (sharedStateCarrierServer === served) sharedStateCarrierServer = null;
    });
  });
  eventsServer.on("error", () => {
    pendingServerFailure = true;
    convergeServerFailure?.();
  });
  eventsServer.on("connection", (socket: WebSocket) => {
    if (sessionEventCarrierServer !== null || exited || attempt.ownership === "abandoned") {
      socket.terminate();
      return;
    }
    let served: SessionEventCarrierServer;
    try {
      served = serveSessionEventCarrier(
        sessionEventHub.createBinding(request.subsystemKey),
        createSessionEventWebSocketCarrier(socket),
      );
    } catch {
      socket.terminate();
      return;
    }
    sessionEventCarrierServer = served;
    void served.closed.then(() => {
      if (sessionEventCarrierServer === served) sessionEventCarrierServer = null;
    });
  });

  const forceTerminate = () => {
    if (exited) return;
    try {
      child.kill(process.platform === "win32" ? undefined : "SIGKILL");
    } catch {
      // Kill mechanics never replace the actual child exit observation fact.
    }
  };
  const abandon = () => {
    if (attempt.ownership !== "pending") return;
    attempt.ownership = "abandoned";
    closeServer(server);
    closeServer(stateServer);
    closeServer(eventsServer);
    acquireWaiter?.reject(signal.reason);
    acquireWaiter = null;
    if (typeof child !== "undefined") forceTerminate();
  };
  signal.addEventListener("abort", abandon, { once: true });

  convergeServerFailure = () => {
    if (controlCarrier !== null || exited || serverFailure !== null) return;
    serverFailure = launcherError("LAUNCH_RUNTIME_UNAVAILABLE");
    closeServer(server);
    closeServer(stateServer);
    closeServer(eventsServer);
    acquireWaiter?.reject(serverFailure);
    acquireWaiter = null;
    if (attempt.ownership === "pending" && spawnStarted) {
      forceTerminate();
      establishment.reject(serverFailure);
    }
  };
  if (pendingServerFailure) {
    convergeServerFailure();
    signal.removeEventListener("abort", abandon);
    throw serverFailure;
  }

  try {
    spawnStarted = true;
    child = spawn(plan.canonicalNodeExecutable, [plan.runnerEntry], {
      shell: false,
      cwd: plan.canonicalInstallationRoot,
      env: buildRunnerEnvironment(
        process.env,
        encodedBootstrap,
        encodedContentAccess,
        sessionEventsEndpoint,
      ),
      stdio: onRuntimeDataProvisioner === undefined
        ? "ignore"
        : ["ignore", "ignore", "ignore", "ipc"],
    });
  } catch (error) {
    signal.removeEventListener("abort", abandon);
    closeServer(server);
    closeServer(stateServer);
    closeServer(eventsServer);
    closeSharedStateCarrier();
    closeSessionEventCarrier();
    void error;
    throw launcherError("PROCESS_SPAWN_FAILED");
  }

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
    closeServer(stateServer);
    closeServer(eventsServer);
    closeSharedStateCarrier();
    closeSessionEventCarrier();
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
    closeServer(stateServer);
    closeServer(eventsServer);
    closeSharedStateCarrier();
    closeSessionEventCarrier();
    throw error;
  }
  if (attempt.ownership === "abandoned") {
    signal.removeEventListener("abort", abandon);
    throw signal.reason;
  }
  if (outcome === "exited" || exited) {
    signal.removeEventListener("abort", abandon);
    closeServer(stateServer);
    closeServer(eventsServer);
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
      if (serverFailure !== null) return Promise.reject(serverFailure);
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
        let requestFailure: HostraLauncherError | null = null;
        try {
          const requested = child.kill();
          if (!requested && !exited) {
            requestFailure = launcherError("PROCESS_TERMINATION_FAILED");
          }
        } catch {
          requestFailure = launcherError("PROCESS_TERMINATION_FAILED");
        }
        forceTimer = setTimeout(forceTerminate, plan.runnerPolicy.terminationGraceMs);
        if (requestFailure !== null) throw requestFailure;
      });
      return terminationConvergence;
    },
  });
  if (onRuntimeDataProvisioner !== undefined) {
    const provisioner = createHostraRuntimeDataProvisioner(child);
    try {
      onRuntimeDataProvisioner(hosted, provisioner);
    } catch (error) {
      forceTerminate();
      await terminated.promise;
      throw error;
    }
  }
  return hosted;
}

export function createHostraRuntimeHosting(options: {
  readonly launchPlan: HostraLaunchPlan;
  readonly contentAccess?: HostraContentAccess;
  readonly onRuntimeDataProvisioner?: (
    runtime: HostedRuntime,
    provisioner: HostraRuntimeDataProvisioner,
  ) => void;
  readonly sharedStateAuthority: SharedStateClient;
  readonly sessionEventHub: SessionEventHub;
}): RuntimeHosting {
  if (options === null || typeof options !== "object" || options.launchPlan === null) {
    throw new TypeError("Invalid Hostra RuntimeHosting options");
  }
  const plan = options.launchPlan;
  if (
    options.onRuntimeDataProvisioner !== undefined &&
    typeof options.onRuntimeDataProvisioner !== "function"
  ) {
    throw new TypeError("Invalid Runtime Data provisioner hook");
  }
  if (
    options.sharedStateAuthority === null ||
    typeof options.sharedStateAuthority !== "object" ||
    typeof options.sharedStateAuthority.read !== "function" ||
    typeof options.sharedStateAuthority.readInitial !== "function" ||
    typeof options.sharedStateAuthority.list !== "function" ||
    typeof options.sharedStateAuthority.scan !== "function" ||
    typeof options.sharedStateAuthority.commit !== "function" ||
    typeof options.sharedStateAuthority.subscribe !== "function"
  ) {
    throw new TypeError("Invalid Shared State Authority capability");
  }
  if (
    options.sessionEventHub === null ||
    typeof options.sessionEventHub !== "object" ||
    typeof options.sessionEventHub.createBinding !== "function" ||
    options.sessionEventHub.ready !== true
  ) {
    throw new TypeError("Invalid Session Event Hub capability");
  }
  const contentAccess = options.contentAccess === undefined ? undefined : validateHostraContentAccess(options.contentAccess);
  const runtimes = new Map(plan.runtimes.map((runtime) => [runtime.subsystemKey, runtime] as const));
  return Object.freeze({
    launch(request: RuntimeLaunchRequest, signal: AbortSignal) {
      return launchAttempt(
        plan,
        runtimes,
        request,
        signal,
        options.sharedStateAuthority,
        options.sessionEventHub,
        options.onRuntimeDataProvisioner,
        contentAccess,
      );
    },
  });
}
