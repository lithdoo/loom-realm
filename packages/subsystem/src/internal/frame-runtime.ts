import {
  assertJsonValue,
  utf8ByteLength,
  type JsonValue,
} from "@loomrealm/wire";
import type {
  FrameOutcome as ProtocolFrameOutcome,
  FrameRpcErrorData,
  RuntimeControlHandlerReply,
  SubsystemRuntimeControlHandlers,
  SubsystemRuntimeControlPeer,
} from "@loomrealm/runtime-control";
import {
  FrameBusyError,
  FrameCallRejectedError,
  FrameClosedError,
  FrameInactiveError,
} from "../errors.js";
import {
  cancelled,
  completed,
  failed,
  normalizeFrameOutcome,
} from "../outcome.js";
import type {
  Frame,
  FrameOutcome,
  RuntimeFailure,
  SubsystemDefinition,
} from "../model.js";

type FrameHandlers = Omit<SubsystemRuntimeControlHandlers, "onShutdown">;
type EmptyReply = RuntimeControlHandlerReply<Record<string, never>, FrameRpcErrorData>;

type FrameState =
  | "initialized"
  | "activating"
  | "active"
  | "calling"
  | "awaiting-resume"
  | "resuming"
  | "suspending"
  | "admin-suspended"
  | "returning"
  | "closing"
  | "closed";

interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve(value: T): void;
}

interface PendingCall {
  readonly childFrameId: string;
  readonly revokedActivationId: string;
  readonly resume: Deferred<FrameOutcome>;
}

interface FrameContext {
  readonly id: string;
  readonly params: JsonValue;
  readonly controller: AbortController;
  readonly frame: Frame;
  state: FrameState;
  activationId?: string;
  started: boolean;
  pendingCall?: PendingCall;
}

const NEVER: Promise<never> = new Promise(() => {});

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function success(afterResponse?: () => void): EmptyReply {
  return {
    kind: "success",
    result: {},
    ...(afterResponse === undefined ? {} : { afterResponse }),
  };
}

function semantic(error: FrameRpcErrorData): EmptyReply {
  return { kind: "semantic-error", error };
}

function protocolOutcomeToAuthor(outcome: ProtocolFrameOutcome): FrameOutcome {
  switch (outcome.type) {
    case "completed":
      return completed(outcome.value);
    case "cancelled":
      return cancelled();
    case "failed":
      return failed(outcome.error);
  }
}

function runtimeFailure(code: string, message: string): RuntimeFailure {
  return Object.freeze({ code, message });
}

export class FrameRuntime {
  private readonly contexts = new Map<string, FrameContext>();

  constructor(
    private readonly definition: SubsystemDefinition,
    private readonly getPeer: () => SubsystemRuntimeControlPeer | null,
    private readonly canAcceptFrames: () => boolean,
    private readonly failRuntime: (failure: RuntimeFailure) => void,
  ) {}

  handlers(): FrameHandlers {
    return {
      onFrameInitialize: (params) => this.onInitialize(params.frameId, params.input),
      onFrameActivate: (params) =>
        this.onActivate(params.frameId, params.activationId),
      onFrameSuspend: (params) =>
        this.onSuspend(params.frameId, params.activationId),
      onFrameResume: (params) =>
        this.onResume(
          params.frameId,
          params.activationId,
          params.returnedFrameId,
          params.result,
        ),
      onFrameClose: (params) => this.onClose(params.frameId),
    };
  }

  abortAll(): void {
    for (const context of this.contexts.values()) {
      context.controller.abort();
      context.state = "closed";
      context.activationId = undefined;
      context.pendingCall = undefined;
    }
    this.contexts.clear();
  }

  private ensureAccepting(): void {
    if (!this.canAcceptFrames()) {
      throw new Error("Subsystem Runtime is not accepting Frame operations");
    }
  }

  private onInitialize(frameId: string, input: JsonValue): EmptyReply {
    this.ensureAccepting();
    if (this.contexts.has(frameId)) {
      return semantic({ code: "FRAME_STATE_MISMATCH" });
    }

    const controller = new AbortController();
    const context = {} as FrameContext;
    const frame: Frame = Object.freeze({
      id: frameId,
      params: input,
      signal: controller.signal,
      call: <TResult extends JsonValue = JsonValue>(
        subsystem: string,
        params: JsonValue,
      ) => this.call<TResult>(context, subsystem, params),
    });

    Object.assign(context, {
      id: frameId,
      params: input,
      controller,
      frame,
      state: "initialized" as const,
      started: false,
    });
    this.contexts.set(frameId, context);
    return success();
  }

  private onActivate(frameId: string, activationId: string): EmptyReply {
    this.ensureAccepting();
    const context = this.contexts.get(frameId);
    if (context === undefined) return semantic({ code: "FRAME_NOT_FOUND" });
    if (context.state !== "initialized" || context.started) {
      return semantic({ code: "FRAME_STATE_MISMATCH" });
    }

    context.state = "activating";
    return success(() => {
      if (context.state !== "activating" || !this.canAcceptFrames()) return;
      context.state = "active";
      context.activationId = activationId;
      context.started = true;
      void this.runHandler(context);
    });
  }

  private onSuspend(frameId: string, activationId: string): EmptyReply {
    this.ensureAccepting();
    const context = this.contexts.get(frameId);
    if (context === undefined) return semantic({ code: "FRAME_NOT_FOUND" });
    if (context.state !== "active") {
      return semantic({ code: "FRAME_STATE_MISMATCH" });
    }
    if (context.activationId !== activationId) {
      return semantic({ code: "ACTIVATION_MISMATCH" });
    }

    context.state = "suspending";
    return success(() => {
      if (context.state !== "suspending") return;
      context.state = "admin-suspended";
      context.activationId = undefined;
      context.controller.abort();
    });
  }

  private onResume(
    frameId: string,
    activationId: string,
    returnedFrameId: string,
    result: ProtocolFrameOutcome,
  ): EmptyReply {
    this.ensureAccepting();
    const context = this.contexts.get(frameId);
    if (context === undefined) return semantic({ code: "FRAME_NOT_FOUND" });
    if (context.state !== "awaiting-resume" || context.pendingCall === undefined) {
      return semantic({ code: "FRAME_STATE_MISMATCH" });
    }
    if (context.pendingCall.childFrameId !== returnedFrameId) {
      return semantic({ code: "FRAME_STACK_MISMATCH" });
    }
    if (context.pendingCall.revokedActivationId === activationId) {
      return semantic({ code: "ACTIVATION_MISMATCH" });
    }

    const pending = context.pendingCall;
    context.state = "resuming";
    return success(() => {
      if (context.state !== "resuming" || !this.canAcceptFrames()) return;
      context.pendingCall = undefined;
      context.activationId = activationId;
      context.state = "active";
      pending.resume.resolve(protocolOutcomeToAuthor(result));
    });
  }

  private onClose(frameId: string): EmptyReply {
    this.ensureAccepting();
    const context = this.contexts.get(frameId);
    if (context === undefined) return semantic({ code: "FRAME_NOT_FOUND" });
    if (context.state === "closing" || context.state === "closed") {
      return semantic({ code: "FRAME_STATE_MISMATCH" });
    }

    context.state = "closing";
    context.activationId = undefined;
    return success(() => {
      context.controller.abort();
      context.pendingCall = undefined;
      context.state = "closed";
      this.contexts.delete(frameId);
    });
  }

  private async call<TResult extends JsonValue>(
    context: FrameContext,
    subsystem: string,
    params: JsonValue,
  ): Promise<FrameOutcome<TResult>> {
    if (
      context.state === "returning" ||
      context.state === "closing" ||
      context.state === "closed"
    ) {
      throw new FrameClosedError();
    }
    if (context.state === "calling" || context.state === "awaiting-resume") {
      throw new FrameBusyError();
    }
    if (context.state !== "active" || context.activationId === undefined) {
      throw new FrameInactiveError();
    }
    if (!this.canAcceptFrames()) throw new FrameClosedError();
    if (
      typeof subsystem !== "string" ||
      utf8ByteLength(subsystem) < 1 ||
      utf8ByteLength(subsystem) > 256
    ) {
      throw new TypeError("Invalid target subsystem key");
    }
    try {
      assertJsonValue(params);
    } catch {
      throw new TypeError("Frame.call params must be a JsonValue");
    }

    const peer = this.getPeer();
    if (peer === null) throw new FrameClosedError();
    const activationId = context.activationId;
    context.state = "calling";

    let outcome;
    try {
      outcome = await peer.frame.call({
        frameId: context.id,
        activationId,
        targetSubsystemKey: subsystem,
        input: params,
      });
    } catch {
      this.failRuntime(
        runtimeFailure(
          "RUNTIME_CONTROL_FRAME_CALL_FAILED",
          "Runtime Control frame.call failed locally",
        ),
      );
      return NEVER;
    }

    if (context.state !== "calling" || !this.canAcceptFrames()) return NEVER;

    if (outcome.kind === "success") {
      const resume = deferred<FrameOutcome>();
      context.activationId = undefined;
      context.state = "awaiting-resume";
      context.pendingCall = {
        childFrameId: outcome.result.childFrameId,
        revokedActivationId: activationId,
        resume,
      };
      return resume.promise as Promise<FrameOutcome<TResult>>;
    }

    if (
      outcome.kind === "semantic-error" &&
      outcome.classification === "recoverable" &&
      (outcome.error.code === "FRAME_CALL_TARGET_NOT_FOUND" ||
        outcome.error.code === "FRAME_CALL_TARGET_UNAVAILABLE")
    ) {
      context.state = "active";
      context.activationId = activationId;
      throw new FrameCallRejectedError(outcome.error.code);
    }

    this.failRuntime(
      runtimeFailure(
        outcome.kind === "timeout"
          ? "RUNTIME_CONTROL_FRAME_TIMEOUT"
          : outcome.kind === "terminal"
            ? "RUNTIME_CONTROL_FRAME_TERMINAL"
            : "RUNTIME_CONTROL_FRAME_DIVERGENCE",
        "Runtime Control frame.call could not establish a safe continuation",
      ),
    );
    return NEVER;
  }

  private async runHandler(context: FrameContext): Promise<void> {
    let outcome: FrameOutcome;
    try {
      const raw = await this.definition.frame(context.frame);
      try {
        outcome = normalizeFrameOutcome(raw);
      } catch {
        outcome = failed({
          code: "UNHANDLED_BUSINESS_EXCEPTION",
          message: "Frame handler returned an invalid outcome",
        });
      }
    } catch {
      outcome = failed({
        code: "UNHANDLED_BUSINESS_EXCEPTION",
        message: "Unhandled business exception",
      });
    }

    if (!this.canAcceptFrames()) return;
    if (
      context.state === "admin-suspended" ||
      context.state === "closing" ||
      context.state === "closed" ||
      context.state === "returning"
    ) {
      return;
    }
    if (context.state !== "active" || context.activationId === undefined) {
      this.failRuntime(
        runtimeFailure(
          "SUBSYSTEM_FRAME_HANDLER_CONTROL_FLOW_INVALID",
          "Frame handler completed while a commit-sensitive mutation was pending",
        ),
      );
      return;
    }

    await this.returnOutcome(context, outcome);
  }

  private async returnOutcome(
    context: FrameContext,
    outcome: FrameOutcome,
  ): Promise<void> {
    const peer = this.getPeer();
    const activationId = context.activationId;
    if (peer === null || activationId === undefined || !this.canAcceptFrames()) {
      return;
    }

    context.state = "returning";
    context.activationId = undefined;
    context.controller.abort();

    let result;
    try {
      result = await peer.frame.returnFrame({
        frameId: context.id,
        activationId,
        result: outcome as ProtocolFrameOutcome,
      });
    } catch {
      if (this.canAcceptFrames()) {
        this.failRuntime(
          runtimeFailure(
            "RUNTIME_CONTROL_FRAME_RETURN_FAILED",
            "Runtime Control frame.return failed locally",
          ),
        );
      }
      return;
    }

    if (!this.canAcceptFrames()) return;
    if (result.kind !== "success") {
      this.failRuntime(
        runtimeFailure(
          result.kind === "timeout"
            ? "RUNTIME_CONTROL_FRAME_TIMEOUT"
            : result.kind === "terminal"
              ? "RUNTIME_CONTROL_FRAME_TERMINAL"
              : "RUNTIME_CONTROL_FRAME_DIVERGENCE",
          "Runtime Control frame.return could not be committed safely",
        ),
      );
    }
  }
}
