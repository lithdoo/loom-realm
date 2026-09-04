import type { HostedRuntime, RendererControlBinding } from "@loomrealm/platform-ports";
import {
  createMainRendererControlPeer,
  prepareRendererHelloResultV1,
  type MainRendererControlPeer,
  type MainRendererControlHelloAcceptance,
  type RendererAuthoritySnapshotV1,
  type RendererFrameLifecycleV1,
  type RendererRuntimeLifecycleV1,
} from "@loomrealm/renderer-control";
import {
  createMainRuntimeControlPeer,
  type FrameCallParams,
  type FrameCallResult,
  type FrameOutcome as ControlFrameOutcome,
  type FrameReturnParams,
  type FrameReturnResult,
  type FrameRpcErrorData,
  type MainRuntimeControlPeer,
  type RuntimeControlHandlerReply,
  type RuntimeControlRequestOutcome,
  type RuntimeControlTerminal,
  type SubsystemRuntimeStatusV1,
} from "@loomrealm/runtime-control";
import { assertJsonValue, type JsonValue } from "@loomrealm/wire";
import { MainRuntimeFatalError } from "../errors.js";
import type {
  LogicalGameBootstrap,
  MainRuntimeFailure,
  MainSessionResult,
  RunMainOptions,
} from "../model.js";
import {
  cloneControlOutcome,
  cloneJson,
  deferred,
  type Deferred,
  OperationAbortedError,
  OperationTimeoutError,
  runWithDeadline,
  resolvesWithin,
  toMainOutcome,
  validProtocolString,
} from "./primitives.js";

const RENDERER_DATA_PROFILE_V1 = "loomrealm.renderer-data/1" as const;

type RuntimePhase =
  | "starting"
  | "connected"
  | "identified"
  | "initializing"
  | "ready"
  | "stopping"
  | "failed";
type FrameLifecycle = "starting" | "active" | "suspended" | "closing" | "closed";
type SuspensionCause = "child-call" | "administrative";

type SessionTerminal =
  | { readonly kind: "root"; readonly outcome: ControlFrameOutcome }
  | { readonly kind: "shutdown" }
  | { readonly kind: "fatal"; readonly failure: MainRuntimeFailure };

interface RuntimeRecord {
  readonly key: string;
  readonly bootstrapToken: string;
  readonly ready: Deferred<"ready" | "failed">;
  bootstrapTokenConsumed: boolean;
  phase: RuntimePhase;
  hosted: HostedRuntime | null;
  peer: MainRuntimeControlPeer | null;
  identified: boolean;
  failure: MainRuntimeFailure | null;
  expectedTermination: boolean;
  terminationAttempt: Promise<void> | null;
  physicallyTerminated: boolean;
  shutdownRequested: boolean;
}

interface FrameRecord {
  readonly id: string;
  readonly subsystemKey: string;
  readonly callerFrameId: string | null;
  readonly input: JsonValue;
  lifecycle: FrameLifecycle;
  suspensionCause: SuspensionCause | null;
  currentActivationId: string | null;
  outcome: ControlFrameOutcome | null;
  contextKnown: boolean;
  closeAttempted: boolean;
}

interface InputTarget {
  readonly subsystemKey: string;
  readonly frameId: string;
  readonly activationId: string;
}

interface RendererCandidateAttempt {
  readonly token: string;
  readonly controller: AbortController;
  peer: MainRendererControlPeer | null;
}

type RendererCarrier = Awaited<ReturnType<RendererControlBinding["acquire"]>>;

class BootstrapError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly subsystemKey?: string,
  ) {
    super(message);
    this.name = "BootstrapError";
  }
}

function failure(
  code: string,
  message: string,
  subsystemKey?: string,
): MainRuntimeFailure {
  return Object.freeze({
    code,
    message,
    ...(subsystemKey === undefined ? {} : { subsystemKey }),
  });
}

function deadline(value: number, name: string, frame = false): void {
  if (
    !Number.isInteger(value) ||
    !Number.isFinite(value) ||
    value <= 0 ||
    value > 300000 ||
    (frame && value < 1000)
  ) {
    throw new TypeError(`Invalid ${name}`);
  }
}

function validOpaqueMaterial(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 128)
    return false;
  for (let index = 0; index < value.length; index += 1)
    if (value.charCodeAt(index) > 0x7f) return false;
  return true;
}

function validateOptions(options: RunMainOptions): LogicalGameBootstrap {
  if (options === null || typeof options !== "object") {
    throw new TypeError("Invalid runMain options");
  }

  const platform = options.platform;
  if (
    platform === null ||
    typeof platform !== "object" ||
    platform.scheduler === null ||
    typeof platform.scheduler !== "object" ||
    typeof platform.scheduler.schedule !== "function" ||
    platform.opaqueMaterial === null ||
    typeof platform.opaqueMaterial !== "object" ||
    typeof platform.opaqueMaterial.generate !== "function" ||
    platform.runtimeHosting === null ||
    typeof platform.runtimeHosting !== "object" ||
    typeof platform.runtimeHosting.launch !== "function"
  ) {
    throw new TypeError("Invalid Main platform capability view");
  }
  if (
    platform.rendererControl !== undefined &&
    (platform.rendererControl === null ||
      typeof platform.rendererControl !== "object" ||
      typeof platform.rendererControl.acquire !== "function")
  ) {
    throw new TypeError("Invalid Renderer Control Binding");
  }

  const policy = options.policy;
  if (policy === null || typeof policy !== "object") {
    throw new TypeError("Invalid Main policy");
  }
  deadline(policy.runtimeBootstrapDeadlineMs, "runtimeBootstrapDeadlineMs");
  deadline(policy.frameDeadlineMs, "frameDeadlineMs", true);
  deadline(policy.shutdownDeadlineMs, "shutdownDeadlineMs");
  deadline(policy.terminationDeadlineMs, "terminationDeadlineMs");

  if (
    options.signal !== undefined &&
    (options.signal === null ||
      typeof options.signal !== "object" ||
      typeof options.signal.aborted !== "boolean" ||
      typeof options.signal.addEventListener !== "function" ||
      typeof options.signal.removeEventListener !== "function")
  ) {
    throw new TypeError("Invalid Main AbortSignal");
  }

  const bootstrap = options.bootstrap;
  if (
    bootstrap === null ||
    typeof bootstrap !== "object" ||
    !Array.isArray(bootstrap.subsystemKeys) ||
    bootstrap.subsystemKeys.length === 0 ||
    bootstrap.initial === null ||
    typeof bootstrap.initial !== "object"
  ) {
    throw new TypeError("Invalid LogicalGameBootstrap");
  }

  const keys: string[] = [];
  const seen = new Set<string>();
  for (const key of bootstrap.subsystemKeys) {
    if (!validProtocolString(key, 256) || seen.has(key)) {
      throw new TypeError("Invalid LogicalGameBootstrap subsystem key set");
    }
    seen.add(key);
    keys.push(key);
  }

  const initialKey = bootstrap.initial.subsystemKey;
  if (typeof initialKey !== "string" || !seen.has(initialKey)) {
    throw new TypeError("Invalid LogicalGameBootstrap initial subsystem");
  }
  assertJsonValue(bootstrap.initial.input);

  return Object.freeze({
    subsystemKeys: Object.freeze(keys),
    initial: Object.freeze({
      subsystemKey: initialKey,
      input: cloneJson(bootstrap.initial.input),
    }),
  });
}

function semantic<R>(
  error: FrameRpcErrorData,
): RuntimeControlHandlerReply<R, FrameRpcErrorData> {
  return Object.freeze({ kind: "semantic-error", error });
}

function runtimeTerminalMessage(terminal: RuntimeControlTerminal): string {
  switch (terminal.kind) {
    case "carrier-closed":
    case "carrier-lost":
      return "Runtime Control connection was lost";
    case "request-timeout":
      return `Runtime Control request timed out: ${terminal.method}`;
    case "protocol-fatal":
      return "Runtime Control protocol entered a fatal state";
    case "local-fatal":
      return "Runtime Control local mechanics entered a fatal state";
  }
}

class MainSessionRuntime {
  private readonly bootstrap: LogicalGameBootstrap;
  private readonly sessionController = new AbortController();
  private readonly done = deferred<MainSessionResult>();
  private readonly runtimes = new Map<string, RuntimeRecord>();
  private readonly frames = new Map<string, FrameRecord>();
  private readonly stack: FrameRecord[] = [];
  private readonly sessionId: string;

  private rendererRevision = 1;
  private rendererSnapshot!: RendererAuthoritySnapshotV1;
  private rendererPayloadText = "";
  private currentRendererPeer: MainRendererControlPeer | null = null;
  private rendererCandidate: RendererCandidateAttempt | null = null;
  private rendererBindingTerminal = false;

  private terminal: SessionTerminal | null = null;
  private stopRequested = false;
  private frameAuthorityStarted = false;
  private nextFrame = 1;
  private nextActivation = 1;
  private mutationTail: Promise<void> = Promise.resolve();
  private detachExternalAbort: () => void = () => {};

  constructor(private readonly options: RunMainOptions) {
    this.bootstrap = validateOptions(options);
    this.sessionId = this.generateOpaqueMaterial("Session identity");
    this.rendererSnapshot = this.projectRendererSnapshot();
    this.rendererPayloadText = this.rendererPayload(this.rendererSnapshot);
  }

  run(): Promise<MainSessionResult> {
    const external = this.options.signal;
    if (external !== undefined) {
      const onAbort = () => this.requestShutdown();
      if (external.aborted) {
        this.requestShutdown();
      } else {
        external.addEventListener("abort", onAbort, { once: true });
        this.detachExternalAbort = () =>
          external.removeEventListener("abort", onAbort);
      }
    }

    if (!this.stopRequested && this.terminal === null) {
      this.armRendererCandidateSlot();
      void this.bootstrapSession();
    }
    return this.done.promise;
  }

  private async bootstrapSession(): Promise<void> {
    try {
      for (const key of this.bootstrap.subsystemKeys) {
        if (this.stopRequested || this.terminal !== null) return;
        await this.bootstrapRuntime(key);
      }
      if (this.stopRequested || this.terminal !== null) return;

      this.frameAuthorityStarted = true;
      await this.mutate(() => this.startInitialFrame());
    } catch (error) {
      if (this.terminal !== null) return;
      if (
        error instanceof OperationAbortedError &&
        this.options.signal?.aborted
      ) {
        this.requestShutdown();
        return;
      }
      if (error instanceof OperationTimeoutError) {
        this.beginFatal(
          failure(
            "MAIN_RUNTIME_BOOTSTRAP_TIMEOUT",
            "A required Runtime did not complete bootstrap before its deadline",
          ),
        );
        return;
      }
      if (error instanceof BootstrapError) {
        this.beginFatal(failure(error.code, error.message, error.subsystemKey));
        return;
      }
      this.beginFatal(
        failure(
          "MAIN_BOOTSTRAP_FAILED",
          "Main failed while establishing the required Runtime set",
        ),
      );
    }
  }

  private async bootstrapRuntime(key: string): Promise<void> {
    let token: string;
    try {
      token = this.options.platform.opaqueMaterial.generate();
    } catch {
      throw new BootstrapError(
        "MAIN_BOOTSTRAP_TOKEN_GENERATION_FAILED",
        "Bootstrap token generation failed",
        key,
      );
    }
    if (!validOpaqueMaterial(token) || this.hasCurrentOpaqueMaterial(token)) {
      throw new BootstrapError(
        "MAIN_BOOTSTRAP_TOKEN_INVALID",
        "Opaque material generator returned invalid or reused Runtime token material",
        key,
      );
    }
    const record: RuntimeRecord = {
      key,
      bootstrapToken: token,
      bootstrapTokenConsumed: false,
      phase: "starting",
      hosted: null,
      peer: null,
      identified: false,
      failure: null,
      expectedTermination: false,
      terminationAttempt: null,
      physicallyTerminated: false,
      shutdownRequested: false,
      ready: deferred<"ready" | "failed">(),
    };
    await this.mutate(() => { this.runtimes.set(key, record); });

    const parents = [this.sessionController.signal];
    if (this.options.signal !== undefined) parents.push(this.options.signal);

    await runWithDeadline(
      this.options.platform.scheduler,
      this.options.policy.runtimeBootstrapDeadlineMs,
      parents,
      async (signal) => {
        let hosted: HostedRuntime;
        try {
          hosted = await this.options.platform.runtimeHosting.launch(
            { subsystemKey: key, bootstrapToken: token },
            signal,
          );
        } catch (error) {
          if (signal.aborted) throw error;
          throw new BootstrapError(
            "MAIN_RUNTIME_LAUNCH_FAILED",
            "Platform failed to create a required Runtime",
            key,
          );
        }
        record.hosted = hosted;
        this.watchPhysicalRuntime(record, hosted);

        let carrier;
        try {
          carrier = await hosted.runtimeControl.acquire(signal);
        } catch (error) {
          if (signal.aborted) throw error;
          throw new BootstrapError(
            "MAIN_RUNTIME_CONTROL_ACQUIRE_FAILED",
            "Runtime Control carrier acquisition failed",
            key,
          );
        }
        await this.mutate(() => { record.phase = "connected"; });

        let peer: MainRuntimeControlPeer;
        try {
          peer = createMainRuntimeControlPeer({
            carrier,
            scheduler: this.options.platform.scheduler,
            frameDeadlineMs: this.options.policy.frameDeadlineMs,
            shutdownDeadlineMs: this.options.policy.shutdownDeadlineMs,
            authenticateHello: (params) => this.authenticateHello(record, params),
            handlers: {
              onStatus: (status) => this.onStatus(record, status),
              onFrameCall: (params) => this.onFrameCall(record, params),
              onFrameReturn: (params) => this.onFrameReturn(record, params),
            },
          });
        } catch {
          throw new BootstrapError(
            "MAIN_RUNTIME_CONTROL_SETUP_FAILED",
            "Runtime Control peer setup failed",
            key,
          );
        }
        record.peer = peer;
        this.watchControl(record, peer);

        const identified = await peer.identified;
        if (
          identified.kind !== "identified" ||
          identified.key !== key ||
          identified.protocolVersion !== 1
        ) {
          throw new BootstrapError(
            "MAIN_RUNTIME_IDENTIFICATION_FAILED",
            "Runtime Control identification failed",
            key,
          );
        }
        await this.mutate(() => {
          record.identified = true;
          if (record.phase === "connected") record.phase = "identified";
        });

        const ready = await record.ready.promise;
        if (ready !== "ready" || record.failure !== null) {
          throw new BootstrapError(
            "MAIN_RUNTIME_READY_FAILED",
            "Required Runtime failed before becoming ready",
            key,
          );
        }
      },
    );
  }

  private authenticateHello(
    record: RuntimeRecord,
    params: { readonly key: string; readonly bootstrapToken: string },
  ):
    | { readonly kind: "accepted" }
    | {
        readonly kind: "rejected";
        readonly code:
          | "BOOTSTRAP_AUTHENTICATION_FAILED"
          | "DUPLICATE_CONTROL_CONNECTION";
      } {
    if (
      record.failure !== null ||
      record.bootstrapTokenConsumed ||
      params.key !== record.key ||
      params.bootstrapToken !== record.bootstrapToken
    ) {
      return Object.freeze({
        kind: "rejected",
        code: "BOOTSTRAP_AUTHENTICATION_FAILED",
      });
    }
    record.bootstrapTokenConsumed = true;
    return Object.freeze({ kind: "accepted" });
  }

  private onStatus(
    record: RuntimeRecord,
    status: SubsystemRuntimeStatusV1,
  ): Promise<void> {
    return this.mutate(async () => {
      switch (status.state) {
        case "initializing":
          if (record.failure === null) record.phase = "initializing";
          return;
        case "ready":
          if (record.failure === null) {
            record.phase = "ready";
            record.ready.resolve("ready");
          }
          return;
        case "stopping":
          if (record.failure === null) record.phase = "stopping";
          return;
        case "failed": {
          const first = this.markRuntimeFailed(
            record,
            "SUBSYSTEM_RUNTIME_REPORTED_FAILED",
            `Subsystem Runtime reported failure: ${status.error.code}`,
          );
          if (!first || this.terminal !== null) return;
          if (!this.frameAuthorityStarted) {
            this.beginFatal(
              failure(
                "MAIN_REQUIRED_RUNTIME_FAILED",
                "A required Runtime failed during Main bootstrap",
                record.key,
              ),
            );
          } else if (!this.stopRequested) {
            await this.unwindFailures();
          }
        }
      }
    });
  }

  private watchControl(record: RuntimeRecord, peer: MainRuntimeControlPeer): void {
    void peer.terminal.then((terminal) => {
      void this.mutate(async () => {
        if (record.expectedTermination || this.terminal !== null) return;
        const first = this.markRuntimeFailed(
          record,
          "RUNTIME_CONTROL_TERMINAL",
          runtimeTerminalMessage(terminal),
        );
        if (!first) return;
        if (!this.frameAuthorityStarted) {
          this.beginFatal(
            failure(
              "MAIN_REQUIRED_RUNTIME_FAILED",
              "A required Runtime lost Runtime Control during bootstrap",
              record.key,
            ),
          );
        } else if (!this.stopRequested) {
          await this.unwindFailures();
        }
      });
    });
  }

  private watchPhysicalRuntime(record: RuntimeRecord, hosted: HostedRuntime): void {
    void hosted.terminated.then(
      () => {
        void this.mutate(async () => {
          record.physicallyTerminated = true;
          if (
            record.expectedTermination ||
            record.failure !== null ||
            this.terminal !== null
          ) {
            return;
          }
          const first = this.markRuntimeFailed(
            record,
            "RUNTIME_TERMINATED_UNEXPECTEDLY",
            "Physical Runtime terminated without Main termination intent",
          );
          if (!first) return;
          if (!this.frameAuthorityStarted) {
            this.beginFatal(
              failure(
                "MAIN_REQUIRED_RUNTIME_FAILED",
                "A required Runtime terminated during Main bootstrap",
                record.key,
              ),
            );
          } else if (!this.stopRequested) {
            await this.unwindFailures();
          }
        });
      },
      () => {
        void this.mutate(async () => {
          if (record.expectedTermination || this.terminal !== null) return;
          const first = this.markRuntimeFailed(
            record,
            "RUNTIME_TERMINATION_OBSERVATION_FAILED",
            "Platform failed to provide the Runtime termination fact",
          );
          if (!first) return;
          if (!this.frameAuthorityStarted) {
            this.beginFatal(
              failure(
                "MAIN_REQUIRED_RUNTIME_FAILED",
                "A required Runtime supervision capability failed during bootstrap",
                record.key,
              ),
            );
          } else if (!this.stopRequested) {
            await this.unwindFailures();
          }
        });
      },
    );
  }

  private markRuntimeFailed(
    record: RuntimeRecord,
    code: string,
    message: string,
  ): boolean {
    if (record.failure !== null) return false;
    record.failure = failure(code, message, record.key);
    record.phase = "failed";
    record.ready.resolve("failed");
    record.expectedTermination = true;
    void this.ensureFailedRuntimeTermination(record);
    return true;
  }

  private requestRuntimeTermination(record: RuntimeRecord): Promise<void> {
    const hosted = record.hosted;
    if (hosted === null || record.physicallyTerminated) {
      return Promise.resolve();
    }
    if (record.terminationAttempt !== null) {
      return record.terminationAttempt;
    }

    const requestOnce = () =>
      runWithDeadline(
        this.options.platform.scheduler,
        this.options.policy.terminationDeadlineMs,
        [],
        (signal) => hosted.requestTermination(signal),
      );
    const attempt = requestOnce().catch(async () => {
      if (record.physicallyTerminated) return;
      await requestOnce();
    });
    record.terminationAttempt = attempt;
    void attempt.then(
      () => {
        if (record.terminationAttempt === attempt) record.terminationAttempt = null;
      },
      () => {
        if (record.terminationAttempt === attempt) record.terminationAttempt = null;
      },
    );
    return attempt;
  }

  private async ensureFailedRuntimeTermination(record: RuntimeRecord): Promise<void> {
    try {
      await this.requestRuntimeTermination(record);
    } catch {
      // Runtime failure is already the primary fact; termination effort is secondary.
    }
  }

  private onFrameCall(
    source: RuntimeRecord,
    params: FrameCallParams,
  ): Promise<RuntimeControlHandlerReply<FrameCallResult, FrameRpcErrorData>> {
    return this.mutate(async () => {
      if (this.stopRequested || this.terminal !== null) {
        return semantic<FrameCallResult>({ code: "FRAME_STATE_MISMATCH" });
      }

      const error = this.validateFrameSource(
        source,
        params.frameId,
        params.activationId,
      );
      if (error !== null) return semantic<FrameCallResult>(error);

      const target = this.runtimes.get(params.targetSubsystemKey);
      if (target === undefined) {
        return semantic<FrameCallResult>({ code: "FRAME_CALL_TARGET_NOT_FOUND" });
      }
      if (!this.runtimeReady(target)) {
        return semantic<FrameCallResult>({
          code: "FRAME_CALL_TARGET_UNAVAILABLE",
        });
      }

      const caller = this.frames.get(params.frameId)!;
      caller.currentActivationId = null;
      caller.lifecycle = "suspended";
      caller.suspensionCause = "child-call";

      const child = this.allocateFrame(
        target.key,
        caller.id,
        cloneJson(params.input),
      );
      this.stack.push(child);

      return Object.freeze({
        kind: "success" as const,
        result: Object.freeze({ childFrameId: child.id }),
        afterResponse: () => this.mutate(() => this.startAcceptedChild(child)),
      });
    });
  }

  private onFrameReturn(
    source: RuntimeRecord,
    params: FrameReturnParams,
  ): Promise<RuntimeControlHandlerReply<FrameReturnResult, FrameRpcErrorData>> {
    return this.mutate(async () => {
      if (this.stopRequested || this.terminal !== null) {
        return semantic<FrameReturnResult>({ code: "FRAME_STATE_MISMATCH" });
      }

      const error = this.validateFrameSource(
        source,
        params.frameId,
        params.activationId,
      );
      if (error !== null) return semantic<FrameReturnResult>(error);

      const frame = this.frames.get(params.frameId)!;
      frame.outcome = cloneControlOutcome(params.result);
      frame.currentActivationId = null;
      frame.lifecycle = "closing";
      frame.suspensionCause = null;

      return Object.freeze({
        kind: "success" as const,
        result: Object.freeze({}),
        afterResponse: () => this.mutate(() => this.finalizeAcceptedReturn(frame)),
      });
    });
  }

  private validateFrameSource(
    source: RuntimeRecord,
    frameId: string,
    activationId: string,
  ): FrameRpcErrorData | null {
    const frame = this.frames.get(frameId);
    if (frame === undefined || frame.lifecycle === "closed") {
      return { code: "FRAME_NOT_FOUND" };
    }
    if (frame.subsystemKey !== source.key) {
      return { code: "FRAME_OWNERSHIP_MISMATCH" };
    }
    if (this.stack.at(-1)?.id !== frame.id) {
      return { code: "FRAME_STACK_MISMATCH" };
    }
    if (frame.lifecycle !== "active") {
      return { code: "FRAME_STATE_MISMATCH" };
    }
    if (frame.currentActivationId !== activationId) {
      return { code: "ACTIVATION_MISMATCH" };
    }
    const target = this.currentInputTarget();
    if (
      target === null ||
      target.frameId !== frame.id ||
      target.activationId !== activationId ||
      target.subsystemKey !== source.key
    ) {
      return { code: "FRAME_STACK_MISMATCH" };
    }
    return null;
  }

  private async startInitialFrame(): Promise<void> {
    if (this.stopRequested || this.terminal !== null) return;
    const runtime = this.runtimes.get(this.bootstrap.initial.subsystemKey);
    if (runtime === undefined || !this.runtimeReady(runtime)) {
      this.beginFatal(
        failure(
          "MAIN_INITIAL_RUNTIME_UNAVAILABLE",
          "Initial Runtime is unavailable after required bootstrap",
          this.bootstrap.initial.subsystemKey,
        ),
      );
      return;
    }

    const frame = this.allocateFrame(
      runtime.key,
      null,
      cloneJson(this.bootstrap.initial.input),
    );
    this.stack.push(frame);
    this.observeRendererAuthority();

    const initialized = await this.invokeFrame(
      runtime,
      (peer) => peer.frame.initialize({ frameId: frame.id, input: frame.input }),
    );
    if (this.stopRequested) return;
    if (initialized === null) {
      await this.unwindFailures();
      return;
    }
    if (
      initialized.kind === "semantic-error" &&
      initialized.error.code === "FRAME_INITIALIZE_REJECTED"
    ) {
      frame.outcome = cloneControlOutcome({
        type: "failed",
        error: initialized.error.failure,
      });
      frame.lifecycle = "closed";
      this.stack.pop();
      this.frames.delete(frame.id);
      this.beginRootOutcome(frame.outcome);
      return;
    }
    if (initialized.kind !== "success") {
      this.markUnsafeFrameOutcome(runtime, initialized, "frame.initialize");
      await this.unwindFailures();
      return;
    }
    frame.contextKnown = true;

    if (this.stopRequested) return;
    const activationId = this.mintActivation();
    const activated = await this.invokeFrame(runtime, (peer) =>
      peer.frame.activate({ frameId: frame.id, activationId }),
    );
    if (this.stopRequested) return;
    if (activated === null || activated.kind !== "success") {
      if (activated !== null)
        this.markUnsafeFrameOutcome(runtime, activated, "frame.activate");
      await this.unwindFailures();
      return;
    }

    frame.lifecycle = "active";
    frame.currentActivationId = activationId;
  }

  private async startAcceptedChild(child: FrameRecord): Promise<void> {
    if (
      this.stopRequested ||
      this.terminal !== null ||
      child.lifecycle !== "starting" ||
      this.stack.at(-1)?.id !== child.id
    ) {
      return;
    }

    const runtime = this.runtimes.get(child.subsystemKey);
    if (runtime === undefined || !this.runtimeReady(runtime)) {
      if (runtime !== undefined) {
        this.markRuntimeFailed(
          runtime,
          "RUNTIME_BECAME_UNAVAILABLE",
          "Accepted child target became unavailable before initialization",
        );
      } else {
        this.beginFatal(
          failure(
            "MAIN_AUTHORITY_DIVERGENCE",
            "Accepted child references an unknown Runtime",
          ),
        );
        return;
      }
      if (!this.stopRequested) await this.unwindFailures();
      return;
    }

    const initialized = await this.invokeFrame(runtime, (peer) =>
      peer.frame.initialize({ frameId: child.id, input: child.input }),
    );
    if (this.stopRequested) return;
    if (initialized === null) {
      await this.unwindFailures();
      return;
    }
    if (
      initialized.kind === "semantic-error" &&
      initialized.error.code === "FRAME_INITIALIZE_REJECTED"
    ) {
      const outcome = cloneControlOutcome({
        type: "failed",
        error: initialized.error.failure,
      });
      child.outcome = outcome;
      child.lifecycle = "closed";
      if (this.stack.at(-1)?.id !== child.id) {
        this.beginFatal(
          failure(
            "MAIN_AUTHORITY_DIVERGENCE",
            "Child initialize rejection no longer matches Stack top",
          ),
        );
        return;
      }
      this.stack.pop();
      this.frames.delete(child.id);
      this.observeRendererAuthority();
      if (!(await this.tryResumeCaller(child, outcome))) {
        await this.unwindFailures();
      }
      return;
    }
    if (initialized.kind !== "success") {
      this.markUnsafeFrameOutcome(runtime, initialized, "frame.initialize");
      await this.unwindFailures();
      return;
    }
    child.contextKnown = true;

    if (this.stopRequested) return;
    const activationId = this.mintActivation();
    const activated = await this.invokeFrame(runtime, (peer) =>
      peer.frame.activate({ frameId: child.id, activationId }),
    );
    if (this.stopRequested) return;
    if (activated === null || activated.kind !== "success") {
      if (activated !== null)
        this.markUnsafeFrameOutcome(runtime, activated, "frame.activate");
      await this.unwindFailures();
      return;
    }

    child.lifecycle = "active";
    child.currentActivationId = activationId;
  }

  private async finalizeAcceptedReturn(frame: FrameRecord): Promise<void> {
    if (
      this.stopRequested ||
      this.terminal !== null ||
      frame.lifecycle === "closed" ||
      this.stack.at(-1)?.id !== frame.id
    ) {
      return;
    }
    if (frame.lifecycle !== "closing" || frame.outcome === null) {
      this.beginFatal(
        failure(
          "MAIN_AUTHORITY_DIVERGENCE",
          "Accepted Frame return lost its committed closing state",
        ),
      );
      return;
    }

    const runtime = this.runtimes.get(frame.subsystemKey);
    if (runtime === undefined || runtime.failure !== null || runtime.peer === null) {
      if (runtime !== undefined && runtime.failure === null) {
        this.markRuntimeFailed(
          runtime,
          "FRAME_CONTROL_UNAVAILABLE",
          "Frame close could not be issued to the owning Runtime",
        );
      }
      if (!this.stopRequested) await this.unwindFailures();
      return;
    }

    frame.closeAttempted = true;
    const closed = await this.invokeFrame(runtime, (peer) =>
      peer.frame.closeFrame({ frameId: frame.id }),
    );
    if (this.stopRequested) return;
    if (closed === null || closed.kind !== "success") {
      if (closed !== null)
        this.markUnsafeFrameOutcome(runtime, closed, "frame.close");
      await this.unwindFailures();
      return;
    }

    frame.contextKnown = false;
    frame.lifecycle = "closed";
    this.stack.pop();
    this.frames.delete(frame.id);
    this.observeRendererAuthority();
    if (!(await this.tryResumeCaller(frame, frame.outcome))) {
      await this.unwindFailures();
    }
  }

  private async tryResumeCaller(
    returnedFrame: FrameRecord,
    outcome: ControlFrameOutcome,
  ): Promise<boolean> {
    if (this.stopRequested) return true;
    if (returnedFrame.callerFrameId === null) {
      this.beginRootOutcome(outcome);
      return true;
    }

    const caller = this.frames.get(returnedFrame.callerFrameId);
    if (
      caller === undefined ||
      this.stack.at(-1)?.id !== caller.id ||
      caller.lifecycle !== "suspended" ||
      caller.suspensionCause !== "child-call"
    ) {
      this.beginFatal(
        failure(
          "MAIN_AUTHORITY_DIVERGENCE",
          "Returned Frame does not have its committed direct suspended Caller",
        ),
      );
      return true;
    }

    const runtime = this.runtimes.get(caller.subsystemKey);
    if (runtime === undefined) {
      this.beginFatal(
        failure(
          "MAIN_AUTHORITY_DIVERGENCE",
          "Caller references an unknown Runtime",
        ),
      );
      return true;
    }
    if (!this.runtimeReady(runtime)) {
      this.markRuntimeFailed(
        runtime,
        "RUNTIME_UNAVAILABLE_FOR_RESUME",
        "Caller Runtime is unavailable for fresh resume",
      );
      return false;
    }

    const activationId = this.mintActivation();
    const resumed = await this.invokeFrame(runtime, (peer) =>
      peer.frame.resume({
        frameId: caller.id,
        activationId,
        returnedFrameId: returnedFrame.id,
        result: outcome,
      }),
    );
    if (this.stopRequested) return true;
    if (resumed === null || resumed.kind !== "success") {
      if (resumed !== null)
        this.markUnsafeFrameOutcome(runtime, resumed, "frame.resume");
      return false;
    }

    caller.lifecycle = "active";
    caller.suspensionCause = null;
    caller.currentActivationId = activationId;
    return true;
  }

  private async unwindFailures(): Promise<void> {
    while (!this.stopRequested && this.terminal === null) {
      const rootIndex = this.lowestFailedFrameIndex();
      if (rootIndex < 0) return;

      const root = this.stack[rootIndex]!;
      const rootOutcome =
        root.outcome ??
        cloneControlOutcome({
          type: "failed",
          error: { code: "SUBSYSTEM_RUNTIME_FAILED" },
        });
      const survivingCallerId = root.callerFrameId;
      let expanded = false;

      while (!this.stopRequested && this.stack.length > rootIndex) {
        const frame = this.stack.at(-1)!;
        frame.currentActivationId = null;
        frame.lifecycle = "closing";
        frame.suspensionCause = null;
        this.observeRendererAuthority();

        const runtime = this.runtimes.get(frame.subsystemKey);
        if (runtime === undefined) {
          this.beginFatal(
            failure(
              "MAIN_AUTHORITY_DIVERGENCE",
              "Failure unwind encountered a Frame with unknown Runtime",
            ),
          );
          return;
        }

        if (runtime.failure === null && frame.contextKnown) {
          if (frame.closeAttempted) {
            this.beginFatal(
              failure(
                "MAIN_AUTHORITY_DIVERGENCE",
                "Failure unwind found a repeated healthy Frame close attempt",
              ),
            );
            return;
          }
          frame.closeAttempted = true;
          const closed = await this.invokeFrame(runtime, (peer) =>
            peer.frame.closeFrame({ frameId: frame.id }),
          );
          if (this.stopRequested) return;
          if (closed === null || closed.kind !== "success") {
            if (closed !== null)
              this.markUnsafeFrameOutcome(runtime, closed, "frame.close");
            expanded = true;
            break;
          }
          frame.contextKnown = false;
        }

        frame.lifecycle = "closed";
        this.stack.pop();
        this.frames.delete(frame.id);
        this.observeRendererAuthority();
      }

      if (this.stopRequested) return;
      if (expanded) continue;
      if (this.terminal !== null) return;

      if (this.stack.length === 0) {
        this.beginRootOutcome(rootOutcome);
        return;
      }

      const caller = this.stack.at(-1)!;
      if (survivingCallerId === null || caller.id !== survivingCallerId) {
        this.beginFatal(
          failure(
            "MAIN_AUTHORITY_DIVERGENCE",
            "Failure unwind did not expose the final root's direct Caller",
          ),
        );
        return;
      }

      if (await this.tryResumeCaller(root, rootOutcome)) return;
      // Resume failure marks the Caller Runtime failed. Recompute the
      // lowest failed occurrence over the remaining Stack.
    }
  }

  private lowestFailedFrameIndex(): number {
    for (let index = 0; index < this.stack.length; index += 1) {
      const runtime = this.runtimes.get(this.stack[index]!.subsystemKey);
      if (runtime !== undefined && runtime.failure !== null) return index;
    }
    return -1;
  }

  private async invokeFrame<R>(
    runtime: RuntimeRecord,
    operation: (
      peer: MainRuntimeControlPeer,
    ) => Promise<RuntimeControlRequestOutcome<R, FrameRpcErrorData>>,
  ): Promise<RuntimeControlRequestOutcome<R, FrameRpcErrorData> | null> {
    const peer = runtime.peer;
    if (peer === null || runtime.failure !== null) {
      if (runtime.failure === null) {
        this.markRuntimeFailed(
          runtime,
          "FRAME_CONTROL_UNAVAILABLE",
          "Runtime Control is unavailable for a committed Frame operation",
        );
      }
      return null;
    }
    try {
      return await operation(peer);
    } catch {
      this.markRuntimeFailed(
        runtime,
        "FRAME_CONTROL_LOCAL_FAILURE",
        "Runtime Control Frame operation failed locally",
      );
      return null;
    }
  }

  private markUnsafeFrameOutcome<R>(
    runtime: RuntimeRecord,
    outcome: RuntimeControlRequestOutcome<R, FrameRpcErrorData>,
    method: string,
  ): void {
    if (outcome.kind === "success") return;
    if (outcome.kind === "timeout") {
      this.markRuntimeFailed(
        runtime,
        "FRAME_CONTROL_TIMEOUT",
        `${method} timed out with ambiguous commit state`,
      );
      return;
    }
    if (outcome.kind === "terminal") {
      this.markRuntimeFailed(
        runtime,
        "RUNTIME_CONTROL_TERMINAL",
        runtimeTerminalMessage(outcome.terminal),
      );
      return;
    }
    this.markRuntimeFailed(
      runtime,
      "FRAME_CONTROL_DIVERGENCE",
      `${method} returned a non-recoverable semantic result`,
    );
  }

  private allocateFrame(
    subsystemKey: string,
    callerFrameId: string | null,
    input: JsonValue,
  ): FrameRecord {
    const frame: FrameRecord = {
      id: `f:${this.nextFrame++}`,
      subsystemKey,
      callerFrameId,
      input,
      lifecycle: "starting",
      suspensionCause: null,
      currentActivationId: null,
      outcome: null,
      contextKnown: false,
      closeAttempted: false,
    };
    this.frames.set(frame.id, frame);
    return frame;
  }

  private mintActivation(): string {
    return `a:${this.nextActivation++}`;
  }

  private generateOpaqueMaterial(name: string): string {
    let material: unknown;
    try {
      material = this.options.platform.opaqueMaterial.generate();
    } catch (cause) {
      throw new TypeError(`${name} generation failed`, { cause });
    }
    if (!validOpaqueMaterial(material))
      throw new TypeError(`${name} is invalid`);
    return material;
  }

  private hasCurrentOpaqueMaterial(material: string): boolean {
    // Freshness across calls belongs to OpaqueMaterialGenerator. Main only
    // guards material that still carries live Session authority; retaining
    // retired Renderer tokens here would make reconnect history unbounded.
    if (material === this.sessionId || this.rendererCandidate?.token === material)
      return true;
    for (const runtime of this.runtimes.values())
      if (runtime.bootstrapToken === material) return true;
    return false;
  }

  private projectRendererSnapshot(): RendererAuthoritySnapshotV1 {
    const runtimes = this.bootstrap.subsystemKeys.map((key) => {
      const record = this.runtimes.get(key);
      let state: RendererRuntimeLifecycleV1;
      if (record === undefined) state = "declared";
      else if (record.failure !== null) state = "failed";
      else if (record.physicallyTerminated && record.expectedTermination) state = "stopped";
      else state = record.phase === "initializing" ? "identified" : record.phase;
      return Object.freeze({ subsystemKey: key, state });
    });
    const stack = this.stack
      .filter((frame) => frame.lifecycle !== "closed")
      .map((frame) => Object.freeze({
        frameId: frame.id,
        subsystemKey: frame.subsystemKey,
        lifecycle: frame.lifecycle as RendererFrameLifecycleV1,
        ...(frame.lifecycle === "active" && frame.currentActivationId !== null
          ? { activationId: frame.currentActivationId }
          : {}),
      }));
    const target = this.currentInputTarget();
    const dataAuthorities = this.bootstrap.subsystemKeys.flatMap((subsystemKey) => {
      const record = this.runtimes.get(subsystemKey);
      if (record === undefined || record.failure !== null || record.phase !== "ready") {
        return [];
      }
      return [Object.freeze({
        subsystemKey,
        generation: 1,
        dataProfile: RENDERER_DATA_PROFILE_V1,
      })];
    });
    return Object.freeze({
      sessionId: this.sessionId,
      revision: this.rendererRevision,
      runtimes: Object.freeze(runtimes),
      stack: Object.freeze(stack),
      inputTarget: target,
      dataAuthorities: Object.freeze(dataAuthorities),
    });
  }

  private rendererPayload(snapshot: RendererAuthoritySnapshotV1): string {
    return JSON.stringify({
      runtimes: snapshot.runtimes,
      stack: snapshot.stack,
      inputTarget: snapshot.inputTarget,
      dataAuthorities: snapshot.dataAuthorities,
    });
  }

  private observeRendererAuthority(): void {
    if (this.terminal !== null) return;
    const projected = this.projectRendererSnapshot();
    const payload = this.rendererPayload(projected);
    if (payload === this.rendererPayloadText) return;
    if (this.rendererRevision === Number.MAX_SAFE_INTEGER) {
      this.beginFatal(failure("MAIN_RENDERER_REVISION_EXHAUSTED", "Renderer authority revision space exhausted"));
      return;
    }
    this.rendererRevision += 1;
    this.rendererSnapshot = Object.freeze({ ...projected, revision: this.rendererRevision });
    this.rendererPayloadText = payload;
    this.currentRendererPeer?.publish(this.rendererSnapshot);
  }

  private armRendererCandidateSlot(): void {
    const binding = this.options.platform.rendererControl;
    if (binding === undefined || this.rendererBindingTerminal || this.rendererCandidate !== null || this.terminal !== null || this.stopRequested)
      return;
    let token: string;
    try {
      token = this.generateOpaqueMaterial("Renderer Control token");
    } catch {
      this.rendererBindingTerminal = true;
      return;
    }
    if (this.hasCurrentOpaqueMaterial(token)) {
      this.rendererBindingTerminal = true;
      return;
    }
    const attempt: RendererCandidateAttempt = { token, controller: new AbortController(), peer: null };
    this.rendererCandidate = attempt;
    let acquired: Promise<RendererCarrier>;
    try {
      acquired = binding.acquire(token, attempt.controller.signal);
    } catch (cause) {
      acquired = Promise.reject(cause);
    }
    void Promise.resolve(acquired).then(
      (carrier) => this.mutate(() => this.bindRendererCandidate(attempt, carrier)),
      (cause) => this.mutate(() => this.settleRendererAcquireFailure(attempt, cause)),
    );
  }

  private bindRendererCandidate(
    attempt: RendererCandidateAttempt,
    carrier: RendererCarrier,
  ): void {
    if (this.rendererCandidate !== attempt || attempt.controller.signal.aborted || this.terminal !== null) {
      void carrier.close().catch(() => {});
      return;
    }
    let peer: MainRendererControlPeer;
    try {
      peer = createMainRendererControlPeer({
        carrier,
        acceptHello: (candidate, params) => this.mutate(() => this.acceptRendererHello(attempt, candidate, params.rendererControlToken)),
      });
    } catch {
      void carrier.close().catch(() => {});
      this.rendererCandidate = null;
      this.armRendererCandidateSlot();
      return;
    }
    attempt.peer = peer;
    void peer.terminal.then(() => this.mutate(() => this.observeRendererPeerTerminal(attempt, peer)));
  }

  private acceptRendererHello(
    attempt: RendererCandidateAttempt,
    peer: MainRendererControlPeer,
    token: string,
  ): MainRendererControlHelloAcceptance {
    if (this.terminal !== null || this.rendererCandidate !== attempt || attempt.peer !== peer || token !== attempt.token)
      return Object.freeze({ kind: "rejected", code: "RENDERER_AUTHENTICATION_FAILED" });
    const snapshot = this.rendererSnapshot;
    let preparedHelloText: string;
    try {
      preparedHelloText = prepareRendererHelloResultV1(snapshot);
    } catch {
      return Object.freeze({ kind: "rejected", code: "PROTOCOL_STATE_ERROR" });
    }
    const old = this.currentRendererPeer;
    this.currentRendererPeer = peer;
    this.rendererCandidate = null;
    if (old !== null && old !== peer) old.retire();
    queueMicrotask(() => this.armRendererCandidateSlot());
    return Object.freeze({ kind: "accepted", snapshot, preparedHelloText });
  }

  private observeRendererPeerTerminal(attempt: RendererCandidateAttempt, peer: MainRendererControlPeer): void {
    if (this.currentRendererPeer === peer) this.currentRendererPeer = null;
    if (this.rendererCandidate === attempt) {
      this.rendererCandidate = null;
      this.armRendererCandidateSlot();
    }
  }

  private settleRendererAcquireFailure(attempt: RendererCandidateAttempt, _cause: unknown): void {
    if (this.rendererCandidate !== attempt) return;
    this.rendererCandidate = null;
    if (attempt.controller.signal.aborted || this.terminal !== null) return;
    this.rendererBindingTerminal = true;
  }

  private retireRendererControl(): void {
    const candidate = this.rendererCandidate;
    this.rendererCandidate = null;
    candidate?.controller.abort();
    candidate?.peer?.retire();
    const current = this.currentRendererPeer;
    this.currentRendererPeer = null;
    current?.retire();
  }

  private currentInputTarget(): InputTarget | null {
    const top = this.stack.at(-1);
    if (
      top === undefined ||
      top.lifecycle !== "active" ||
      top.currentActivationId === null
    ) {
      return null;
    }
    return Object.freeze({
      subsystemKey: top.subsystemKey,
      frameId: top.id,
      activationId: top.currentActivationId,
    });
  }

  private runtimeReady(record: RuntimeRecord): boolean {
    return record.failure === null && record.phase === "ready" && record.peer !== null;
  }

  private mutate<T>(operation: () => T | Promise<T>): Promise<T> {
    const result = this.mutationTail.then(async () => {
      const value = await operation();
      this.observeRendererAuthority();
      return value;
    });
    this.mutationTail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private beginRootOutcome(outcome: ControlFrameOutcome): void {
    if (this.terminal !== null) return;
    const frozen = cloneControlOutcome(outcome);
    this.terminal = Object.freeze({ kind: "root", outcome: frozen });
    this.retireRendererControl();
    this.sessionController.abort();
    void this.finishTerminal(this.terminal);
  }

  private requestShutdown(): void {
    if (this.stopRequested || this.terminal !== null) return;
    this.stopRequested = true;
    this.sessionController.abort();
    void this.mutate(() => this.beginShutdown());
  }

  private beginShutdown(): void {
    if (this.terminal !== null) return;
    this.terminal = Object.freeze({ kind: "shutdown" });
    this.retireRendererControl();
    this.sessionController.abort();
    void this.finishTerminal(this.terminal);
  }

  private beginFatal(runtimeFailure: MainRuntimeFailure): void {
    if (this.terminal !== null) return;
    const primary = failure(
      runtimeFailure.code,
      runtimeFailure.message ?? runtimeFailure.code,
      runtimeFailure.subsystemKey,
    );
    this.terminal = Object.freeze({ kind: "fatal", failure: primary });
    this.retireRendererControl();
    this.sessionController.abort();
    void this.finishTerminal(this.terminal);
  }

  private async finishTerminal(terminal: SessionTerminal): Promise<void> {
    await this.cleanupAll(
      terminal.kind === "fatal" ? "bootstrap-abort" : "session-end",
    );
    this.detachExternalAbort();

    if (terminal.kind === "fatal") {
      this.done.reject(new MainRuntimeFatalError(terminal.failure));
      return;
    }
    if (terminal.kind === "shutdown") {
      this.done.resolve(Object.freeze({ kind: "shutdown" }));
      return;
    }
    this.done.resolve(
      Object.freeze({
        kind: "root-outcome",
        outcome: toMainOutcome(terminal.outcome),
      }),
    );
  }

  private async cleanupAll(
    reason: "session-end" | "bootstrap-abort",
  ): Promise<void> {
    await Promise.allSettled(
      [...this.runtimes.values()].map((record) =>
        this.cleanupRuntime(record, reason),
      ),
    );
  }

  private async cleanupRuntime(
    record: RuntimeRecord,
    reason: "session-end" | "bootstrap-abort",
  ): Promise<void> {
    record.expectedTermination = true;

    let gracefulShutdownAccepted = false;
    const peer = record.peer;
    if (
      peer !== null &&
      record.identified &&
      record.failure === null &&
      !record.shutdownRequested
    ) {
      record.shutdownRequested = true;
      record.phase = "stopping";
      try {
        const outcome = await peer.control.shutdown({ reason });
        gracefulShutdownAccepted = outcome.kind === "success";
      } catch {
        // Session terminal fact already owns settlement.
      }
    } else if (peer !== null && !record.identified) {
      await resolvesWithin(
        this.options.platform.scheduler,
        this.options.policy.terminationDeadlineMs,
        peer.close(),
      );
    }

    const hosted = record.hosted;
    if (hosted === null || record.physicallyTerminated) return;

    // A successful protocol shutdown only means the Runtime accepted the
    // graceful intent. Give that Runtime a bounded opportunity to finish
    // its own shutdown hook and terminate naturally before escalating to
    // a physical termination request.
    if (gracefulShutdownAccepted) {
      const terminatedNaturally = await resolvesWithin(
        this.options.platform.scheduler,
        this.options.policy.terminationDeadlineMs,
        hosted.terminated,
      );
      if (terminatedNaturally) return;
    }

    try {
      await this.requestRuntimeTermination(record);
    } catch {
      // Bounded physical cleanup does not replace the primary Session terminal.
    }

    await resolvesWithin(
      this.options.platform.scheduler,
      this.options.policy.terminationDeadlineMs,
      hosted.terminated,
    );
  }
}

export function runMainInternal(options: RunMainOptions): Promise<MainSessionResult> {
  return Promise.resolve().then(() => new MainSessionRuntime(options).run());
}
