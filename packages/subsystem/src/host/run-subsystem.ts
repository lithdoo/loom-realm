import type {
  DeadlineScheduler,
  RuntimeControlBinding,
  SubsystemDataBinding,
} from "@loomrealm/platform-ports";
import {
  createSubsystemDataPeer,
  RENDERER_DATA_PROFILE_V1,
  type DataInboundDisposition,
  type SubsystemDataPeer,
} from "@loomrealm/data";
import {
  connectSubsystemRuntimeControl,
  type RuntimeControlHandlerReply,
  type RuntimeControlNotificationOutcome,
  type RuntimeControlTerminal,
  type SubsystemRuntimeControlHandlers,
  type SubsystemRuntimeControlPeer,
  type SubsystemShutdownResultV1,
} from "@loomrealm/runtime-control";
import type {
  RuntimeFailure,
  SubsystemDefinition,
  SubsystemDefinitionFactory,
  SubsystemScope,
} from "../model.js";
import { FrameRuntime } from "../internal/frame-runtime.js";

export interface SubsystemRuntimeControlPolicy {
  readonly scheduler: DeadlineScheduler;
  readonly helloDeadlineMs: number;
  readonly frameDeadlineMs: number;
  readonly terminalCleanupDeadlineMs: number;
}

export interface SubsystemLaunchContext {
  readonly subsystemKey: string;
  readonly bootstrapToken: string;
  readonly controlProtocolVersions: readonly number[];
}

export interface RunSubsystemOptions {
  readonly definition: SubsystemDefinitionFactory;
  readonly runtimeControl: RuntimeControlBinding;
  readonly runtimePolicy: SubsystemRuntimeControlPolicy;
  readonly launch: SubsystemLaunchContext;
  readonly data?: SubsystemDataBinding;
}

export class SubsystemRuntimeFatalError extends Error {
  readonly failure: RuntimeFailure;

  constructor(failure: RuntimeFailure) {
    super(failure.message ?? failure.code);
    this.name = "SubsystemRuntimeFatalError";
    this.failure = failure;
  }
}

interface Deferred {
  readonly promise: Promise<void>;
  resolve(): void;
  reject(error: unknown): void;
}

type TerminalCause =
  | { readonly kind: "graceful" }
  | { readonly kind: "fatal"; readonly failure: RuntimeFailure };

interface ClosableCarrier {
  close(): Promise<void>;
}

interface DataAcquireAttempt {
  readonly controller: AbortController;
}

const acceptedDataMessage = Object.freeze({ kind: "accepted" } as const);

function bestEffortCloseCarrier(value: unknown): void {
  try {
    if (value === null || typeof value !== "object") return;
    const close = (value as { close?: unknown }).close;
    if (typeof close !== "function") return;
    void Promise.resolve(close.call(value)).catch(() => {});
  } catch {
    // Trusted integration cleanup is secondary to local currentness.
  }
}

function deferred(): Deferred {
  let settled = false;
  let resolvePromise!: () => void;
  let rejectPromise!: (error: unknown) => void;
  const promise = new Promise<void>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return {
    promise,
    resolve() {
      if (settled) return;
      settled = true;
      resolvePromise();
    },
    reject(error) {
      if (settled) return;
      settled = true;
      rejectPromise(error);
    },
  };
}

function failure(code: string, message: string): RuntimeFailure {
  return Object.freeze({ code, message });
}

function validateDefinition(value: unknown): asserts value is SubsystemDefinition {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Subsystem definition factory must return an object");
  }
  const definition = value as Partial<SubsystemDefinition>;
  if (typeof definition.frame !== "function") {
    throw new TypeError("Subsystem definition must provide frame()");
  }
  for (const name of ["initialize", "shutdown", "failed"] as const) {
    const hook = definition[name];
    if (hook !== undefined && typeof hook !== "function") {
      throw new TypeError(`Subsystem definition ${name} must be a function`);
    }
  }
}

function validateOptions(options: RunSubsystemOptions): void {
  if (options === null || typeof options !== "object") {
    throw new TypeError("Invalid runSubsystem options");
  }
  if (typeof options.definition !== "function") {
    throw new TypeError("Invalid Subsystem definition factory");
  }
  if (
    options.runtimeControl === null ||
    typeof options.runtimeControl !== "object" ||
    typeof options.runtimeControl.acquire !== "function"
  ) {
    throw new TypeError("Invalid RuntimeControlBinding");
  }
  if (
    options.data !== undefined &&
    (options.data === null ||
      typeof options.data !== "object" ||
      typeof options.data.acquire !== "function")
  ) {
    throw new TypeError("Invalid SubsystemDataBinding");
  }
  const policy = options.runtimePolicy;
  if (
    policy === null ||
    typeof policy !== "object" ||
    policy.scheduler === null ||
    typeof policy.scheduler !== "object" ||
    typeof policy.scheduler.schedule !== "function"
  ) {
    throw new TypeError("Invalid Subsystem Runtime Control policy");
  }
  if (!Number.isInteger(policy.helloDeadlineMs) || policy.helloDeadlineMs <= 0) {
    throw new TypeError("Invalid helloDeadlineMs");
  }
  if (
    !Number.isInteger(policy.frameDeadlineMs) ||
    policy.frameDeadlineMs < 1000 ||
    policy.frameDeadlineMs > 300000
  ) {
    throw new TypeError("Invalid frameDeadlineMs");
  }
  if (
    !Number.isInteger(policy.terminalCleanupDeadlineMs) ||
    policy.terminalCleanupDeadlineMs <= 0 ||
    policy.terminalCleanupDeadlineMs > 300000
  ) {
    throw new TypeError("Invalid terminalCleanupDeadlineMs");
  }
  const launch = options.launch;
  if (
    launch === null ||
    typeof launch !== "object" ||
    typeof launch.subsystemKey !== "string" ||
    launch.subsystemKey.length === 0 ||
    typeof launch.bootstrapToken !== "string" ||
    launch.bootstrapToken.length === 0 ||
    !Array.isArray(launch.controlProtocolVersions)
  ) {
    throw new TypeError("Invalid Subsystem launch context");
  }
}

function terminalFailure(terminal: RuntimeControlTerminal): RuntimeFailure {
  switch (terminal.kind) {
    case "request-timeout":
      return failure(
        "RUNTIME_CONTROL_REQUEST_TIMEOUT",
        `Runtime Control request timed out: ${terminal.method}`,
      );
    case "carrier-closed":
    case "carrier-lost":
      return failure(
        "RUNTIME_CONTROL_CONNECTION_LOST",
        "Runtime Control connection was lost",
      );
    case "protocol-fatal":
      return failure(
        "RUNTIME_CONTROL_PROTOCOL_FATAL",
        "Runtime Control protocol entered a fatal state",
      );
    case "local-fatal":
      return failure(
        "RUNTIME_CONTROL_LOCAL_FATAL",
        "Runtime Control local mechanics entered a fatal state",
      );
  }
}

class SubsystemHost {
  private readonly scopeController = new AbortController();
  private readonly done = deferred();
  private definition: SubsystemDefinition | null = null;
  private frames: FrameRuntime | null = null;
  private peer: SubsystemRuntimeControlPeer | null = null;
  private carrier: ClosableCarrier | null = null;
  private terminal: TerminalCause | null = null;
  private ready = false;
  private currentDataPeer: SubsystemDataPeer | null = null;
  private pendingDataAcquire: DataAcquireAttempt | null = null;
  private dataAcquisitionStopped = false;
  private dataCleanup: Promise<void> = Promise.resolve();

  constructor(private readonly options: RunSubsystemOptions) {}

  run(): Promise<void> {
    void this.bootstrap();
    return this.done.promise;
  }

  private canAcceptFrames = (): boolean => this.ready && this.terminal === null;

  private async bootstrap(): Promise<void> {
    const scope: SubsystemScope = Object.freeze({
      signal: this.scopeController.signal,
    });

    let definition: SubsystemDefinition;
    try {
      const candidate = this.options.definition(scope);
      validateDefinition(candidate);
      definition = candidate;
      this.definition = definition;
    } catch {
      this.failRuntime(
        failure(
          "SUBSYSTEM_DEFINITION_FACTORY_FAILED",
          "Subsystem definition factory failed",
        ),
      );
      return;
    }

    this.frames = new FrameRuntime(
      definition,
      () => this.peer,
      this.canAcceptFrames,
      (runtimeFailure) => this.failRuntime(runtimeFailure),
    );

    let carrier;
    try {
      carrier = await this.options.runtimeControl.acquire(this.scopeController.signal);
      this.carrier = carrier;
    } catch {
      this.failRuntime(
        failure(
          "RUNTIME_CONTROL_ACQUIRE_FAILED",
          "Runtime Control carrier acquisition failed",
        ),
      );
      return;
    }
    if (this.terminal !== null) {
      void carrier.close().catch(() => {});
      return;
    }

    const handlers: SubsystemRuntimeControlHandlers = {
      onShutdown: () => this.onShutdown(),
      ...this.frames.handlers(),
    };

    let connected;
    try {
      connected = await connectSubsystemRuntimeControl({
        carrier,
        scheduler: this.options.runtimePolicy.scheduler,
        helloDeadlineMs: this.options.runtimePolicy.helloDeadlineMs,
        frameDeadlineMs: this.options.runtimePolicy.frameDeadlineMs,
        hello: {
          key: this.options.launch.subsystemKey,
          bootstrapToken: this.options.launch.bootstrapToken,
          protocolVersions: this.options.launch.controlProtocolVersions,
        },
        handlers,
      });
    } catch {
      this.failRuntime(
        failure(
          "RUNTIME_CONTROL_CONNECT_FAILED",
          "Runtime Control connection setup failed",
        ),
      );
      return;
    }

    if (connected.kind === "rejected") {
      this.failRuntime(
        failure(
          "RUNTIME_CONTROL_HELLO_REJECTED",
          `Runtime Control hello rejected: ${connected.error.code}`,
        ),
      );
      return;
    }
    if (connected.kind === "timeout") {
      this.failRuntime(
        failure(
          "RUNTIME_CONTROL_HELLO_TIMEOUT",
          "Runtime Control hello timed out",
        ),
      );
      return;
    }
    if (connected.kind === "terminal") {
      this.failRuntime(terminalFailure(connected.terminal));
      return;
    }

    this.peer = connected.peer;
    void this.peer.terminal.then((terminal) => {
      if (this.terminal === null) this.failRuntime(terminalFailure(terminal));
    });

    if (!(await this.sendStartupStatus({ state: "initializing" }))) return;
    if (this.terminal !== null) return;

    try {
      await definition.initialize?.();
    } catch {
      if (this.terminal === null) {
        this.failRuntime(
          failure(
            "SUBSYSTEM_INITIALIZE_FAILED",
            "Subsystem initialization failed",
          ),
        );
      }
      return;
    }
    if (this.terminal !== null) return;

    if (!(await this.sendStartupStatus({ state: "ready" }))) return;
    if (this.terminal !== null) return;
    this.ready = true;
    this.startDataAcquire();
  }

  private startDataAcquire(): void {
    const binding = this.options.data;
    if (
      binding === undefined ||
      !this.ready ||
      this.terminal !== null ||
      this.dataAcquisitionStopped ||
      this.currentDataPeer !== null ||
      this.pendingDataAcquire !== null
    ) {
      return;
    }

    const attempt: DataAcquireAttempt = { controller: new AbortController() };
    this.pendingDataAcquire = attempt;
    void Promise.resolve()
      .then(() => binding.acquire(attempt.controller.signal))
      .then(
        (result) => this.installDataAcquire(attempt, result),
        () => this.rejectDataAcquire(attempt),
      );
  }

  private installDataAcquire(
    attempt: DataAcquireAttempt,
    result: Awaited<ReturnType<SubsystemDataBinding["acquire"]>>,
  ): void {
    if (
      this.pendingDataAcquire !== attempt ||
      attempt.controller.signal.aborted ||
      !this.ready ||
      this.terminal !== null
    ) {
      bestEffortCloseCarrier((result as { carrier?: unknown } | null)?.carrier);
      return;
    }
    this.pendingDataAcquire = null;

    let peer: SubsystemDataPeer;
    try {
      if (result.dataProfile !== RENDERER_DATA_PROFILE_V1) {
        throw new TypeError("Unsupported Renderer Data profile");
      }
      const accept = (): DataInboundDisposition => acceptedDataMessage;
      peer = createSubsystemDataPeer({
        binding: {
          carrier: result.carrier,
          subsystemKey: this.options.launch.subsystemKey,
          generation: result.generation,
          dataProfile: result.dataProfile,
        },
        handlers: {
          onInputState: accept,
          onInputEvent: accept,
          onInputReset: accept,
        },
      });
    } catch {
      bestEffortCloseCarrier((result as { carrier?: unknown } | null)?.carrier);
      this.dataAcquisitionStopped = true;
      return;
    }

    if (!this.ready || this.terminal !== null || attempt.controller.signal.aborted) {
      void peer.close().catch(() => {});
      return;
    }
    this.currentDataPeer = peer;
    void peer.terminal.then(() => {
      if (this.currentDataPeer !== peer) return;
      this.currentDataPeer = null;
      this.startDataAcquire();
    });
  }

  private rejectDataAcquire(attempt: DataAcquireAttempt): void {
    if (this.pendingDataAcquire !== attempt) return;
    this.pendingDataAcquire = null;
    if (attempt.controller.signal.aborted || !this.ready || this.terminal !== null) return;
    this.dataAcquisitionStopped = true;
  }

  private leaveDataReady(): void {
    const attempt = this.pendingDataAcquire;
    this.pendingDataAcquire = null;
    attempt?.controller.abort();
    const peer = this.currentDataPeer;
    this.currentDataPeer = null;
    if (peer === null) return;
    const close = peer.close().catch(() => {});
    this.dataCleanup = Promise.allSettled([this.dataCleanup, close]).then(() => undefined);
  }

  private async sendStartupStatus(
    status: Parameters<SubsystemRuntimeControlPeer["control"]["status"]>[0],
  ): Promise<boolean> {
    const peer = this.peer;
    if (peer === null) return false;
    let outcome: RuntimeControlNotificationOutcome;
    try {
      outcome = await peer.control.status(status);
    } catch {
      this.failRuntime(
        failure(
          "RUNTIME_CONTROL_STATUS_FAILED",
          "Runtime Control status publication failed locally",
        ),
      );
      return false;
    }
    if (outcome.kind === "terminal") {
      this.failRuntime(terminalFailure(outcome.terminal));
      return false;
    }
    return true;
  }

  private onShutdown(): RuntimeControlHandlerReply<
    SubsystemShutdownResultV1,
    never
  > {
    if (this.terminal === null) {
      this.terminal = Object.freeze({ kind: "graceful" });
      this.ready = false;
      this.leaveDataReady();
    }
    return {
      kind: "success",
      result: {},
      afterResponse: () => {
        void this.finishGraceful();
      },
    };
  }

  private failRuntime(runtimeFailure: RuntimeFailure): void {
    if (this.terminal !== null) return;
    const primary: RuntimeFailure = Object.freeze({
      code: runtimeFailure.code,
      ...(runtimeFailure.message === undefined
        ? {}
        : { message: runtimeFailure.message }),
    });
    this.terminal = Object.freeze({ kind: "fatal", failure: primary });
    this.ready = false;
    this.leaveDataReady();
    this.scopeController.abort();
    this.frames?.abortAll();
    void this.finishFatal(primary);
  }

  private async finishGraceful(): Promise<void> {
    if (this.terminal?.kind !== "graceful") return;
    this.scopeController.abort();
    this.frames?.abortAll();
    await this.bounded(this.bestEffortStatus({ state: "stopping" }));
    await this.bounded(
      Promise.allSettled([
        this.invokeShutdownHook(),
        this.closeControl(),
        this.dataCleanup,
      ]),
    );
    this.done.resolve();
  }

  private async finishFatal(primary: RuntimeFailure): Promise<void> {
    await this.bounded(
      this.bestEffortStatus({ state: "failed", error: primary }),
    );
    await this.bounded(
      Promise.allSettled([
        this.invokeFailedHook(primary),
        this.closeControl(),
        this.dataCleanup,
      ]),
    );
    this.done.reject(new SubsystemRuntimeFatalError(primary));
  }

  private async bestEffortStatus(
    status: Parameters<SubsystemRuntimeControlPeer["control"]["status"]>[0],
  ): Promise<void> {
    const peer = this.peer;
    if (peer === null) return;
    try {
      await peer.control.status(status);
    } catch {
      // Primary terminal cause already owns settlement.
    }
  }

  private async invokeShutdownHook(): Promise<void> {
    try {
      await this.definition?.shutdown?.();
    } catch {
      // Hook failure never replaces the primary graceful terminal cause.
    }
  }

  private async invokeFailedHook(primary: RuntimeFailure): Promise<void> {
    try {
      await this.definition?.failed?.(primary);
    } catch {
      // Hook failure never replaces the primary Runtime failure.
    }
  }

  private async closeControl(): Promise<void> {
    try {
      if (this.peer !== null) {
        await this.peer.close();
      } else if (this.carrier !== null) {
        await this.carrier.close();
      }
    } catch {
      // Cleanup failure is secondary to the already-latched terminal cause.
    }
  }

  private async bounded(task: Promise<unknown>): Promise<void> {
    const observed = Promise.resolve(task).then(
      () => undefined,
      () => undefined,
    );
    await new Promise<void>((resolve) => {
      let settled = false;
      let cancel: (() => void) | undefined;
      const finish = () => {
        if (settled) return;
        settled = true;
        cancel?.();
        resolve();
      };
      try {
        cancel = this.options.runtimePolicy.scheduler.schedule(
          this.options.runtimePolicy.terminalCleanupDeadlineMs,
          finish,
        );
      } catch {
        finish();
        return;
      }
      void observed.then(finish);
    });
  }
}

export function runSubsystem(options: RunSubsystemOptions): Promise<void> {
  return Promise.resolve().then(() => {
    validateOptions(options);
    return new SubsystemHost(options).run();
  });
}
