import type { MessageCarrier } from "@loomrealm/foundation";
import type { JsonValue } from "@loomrealm/wire";

export interface SubsystemHelloParamsV1 {
  readonly key: string;
  readonly bootstrapToken: string;
  readonly protocolVersions: readonly number[];
}

export interface SubsystemHelloResultV1 {
  readonly protocolVersion: 1;
}

export interface SubsystemRuntimeErrorV1 {
  readonly code: string;
  readonly message?: string;
}

export type SubsystemRuntimeStatusV1 =
  | { readonly state: "initializing" }
  | { readonly state: "ready" }
  | { readonly state: "stopping" }
  | { readonly state: "failed"; readonly error: SubsystemRuntimeErrorV1 };

export type SubsystemShutdownReasonV1 = "session-end" | "bootstrap-abort";

export interface SubsystemShutdownParamsV1 {
  readonly reason: SubsystemShutdownReasonV1;
}

export interface SubsystemShutdownResultV1 {}

export interface FrameFailure {
  readonly code: string;
  readonly message?: string;
  readonly data?: JsonValue;
}

export type FrameOutcome =
  | { readonly type: "completed"; readonly value: JsonValue }
  | { readonly type: "cancelled" }
  | { readonly type: "failed"; readonly error: FrameFailure };

export interface FrameInitializeParams {
  readonly frameId: string;
  readonly input: JsonValue;
}
export interface FrameInitializeResult {}

export interface FrameActivateParams {
  readonly frameId: string;
  readonly activationId: string;
}
export interface FrameActivateResult {}

export interface FrameSuspendParams {
  readonly frameId: string;
  readonly activationId: string;
}
export interface FrameSuspendResult {}

export interface FrameResumeParams {
  readonly frameId: string;
  readonly activationId: string;
  readonly returnedFrameId: string;
  readonly result: FrameOutcome;
}
export interface FrameResumeResult {}

export interface FrameCloseParams {
  readonly frameId: string;
}
export interface FrameCloseResult {}

export interface FrameCallParams {
  readonly frameId: string;
  readonly activationId: string;
  readonly targetSubsystemKey: string;
  readonly input: JsonValue;
}
export interface FrameCallResult {
  readonly childFrameId: string;
}

export interface FrameReturnParams {
  readonly frameId: string;
  readonly activationId: string;
  readonly result: FrameOutcome;
}
export interface FrameReturnResult {}

export type SubsystemHelloErrorDataV1 =
  | { readonly code: "BOOTSTRAP_AUTHENTICATION_FAILED" }
  | { readonly code: "CONTROL_PROTOCOL_UNSUPPORTED" }
  | { readonly code: "DUPLICATE_CONTROL_CONNECTION" };

export type RuntimeControlProtocolStateErrorDataV1 = {
  readonly code: "PROTOCOL_STATE_ERROR";
};

export type FrameRpcErrorData =
  | { readonly code: "FRAME_CALL_TARGET_NOT_FOUND" }
  | { readonly code: "FRAME_CALL_TARGET_UNAVAILABLE" }
  | {
      readonly code: "FRAME_INITIALIZE_REJECTED";
      readonly failure: FrameFailure;
    }
  | { readonly code: "FRAME_NOT_FOUND" }
  | { readonly code: "FRAME_STATE_MISMATCH" }
  | { readonly code: "ACTIVATION_MISMATCH" }
  | { readonly code: "FRAME_STACK_MISMATCH" }
  | { readonly code: "FRAME_OWNERSHIP_MISMATCH" };

export type FrameRecoverableRpcErrorData = Extract<
  FrameRpcErrorData,
  {
    readonly code:
      | "FRAME_CALL_TARGET_NOT_FOUND"
      | "FRAME_CALL_TARGET_UNAVAILABLE"
      | "FRAME_INITIALIZE_REJECTED";
  }
>;

export type FrameFatalRpcErrorData = Exclude<
  FrameRpcErrorData,
  FrameRecoverableRpcErrorData
>;

export type RuntimeControlRequestMethod =
  | "subsystem.hello"
  | "subsystem.shutdown"
  | "frame.initialize"
  | "frame.activate"
  | "frame.suspend"
  | "frame.resume"
  | "frame.close"
  | "frame.call"
  | "frame.return";

export interface RuntimeControlScheduler {
  schedule(delayMs: number, callback: () => void): () => void;
}

export type RuntimeControlHandlerReply<Result, SemanticError> =
  | {
      readonly kind: "success";
      readonly result: Result;
      readonly afterResponse?: () => void | Promise<void>;
    }
  | {
      readonly kind: "semantic-error";
      readonly error: SemanticError;
      readonly afterResponse?: () => void | Promise<void>;
    };

export type RuntimeControlSemanticErrorClassification = "recoverable" | "fatal";

export type RuntimeControlRequestOutcome<Result, SemanticError> =
  | { readonly kind: "success"; readonly result: Result }
  | {
      readonly kind: "semantic-error";
      readonly error: SemanticError;
      readonly classification: RuntimeControlSemanticErrorClassification;
    }
  | { readonly kind: "timeout" }
  | { readonly kind: "terminal"; readonly terminal: RuntimeControlTerminal };

export type RuntimeControlNotificationOutcome =
  | { readonly kind: "sent" }
  | { readonly kind: "terminal"; readonly terminal: RuntimeControlTerminal };

export type RuntimeControlTerminal =
  | { readonly kind: "carrier-closed" }
  | { readonly kind: "carrier-lost"; readonly cause?: unknown }
  | { readonly kind: "protocol-fatal"; readonly cause?: unknown }
  | {
      readonly kind: "request-timeout";
      readonly method: RuntimeControlRequestMethod;
      readonly id: number;
    }
  | { readonly kind: "local-fatal"; readonly cause: unknown };

export type MainHelloAuthenticationDecisionV1 =
  | { readonly kind: "accepted" }
  | {
      readonly kind: "rejected";
      readonly code:
        | "BOOTSTRAP_AUTHENTICATION_FAILED"
        | "DUPLICATE_CONTROL_CONNECTION";
    };

export type MainRuntimeControlIdentificationOutcome =
  | {
      readonly kind: "identified";
      readonly key: string;
      readonly protocolVersion: 1;
    }
  | { readonly kind: "rejected"; readonly error: SubsystemHelloErrorDataV1 }
  | { readonly kind: "terminal"; readonly terminal: RuntimeControlTerminal };

export interface MainRuntimeControlHandlers {
  onStatus(status: SubsystemRuntimeStatusV1): void | Promise<void>;
  onFrameCall(
    params: FrameCallParams,
  ):
    | RuntimeControlHandlerReply<FrameCallResult, FrameRpcErrorData>
    | Promise<RuntimeControlHandlerReply<FrameCallResult, FrameRpcErrorData>>;
  onFrameReturn(
    params: FrameReturnParams,
  ):
    | RuntimeControlHandlerReply<FrameReturnResult, FrameRpcErrorData>
    | Promise<RuntimeControlHandlerReply<FrameReturnResult, FrameRpcErrorData>>;
}

export interface MainRuntimeControlPeerOptions {
  readonly carrier: MessageCarrier;
  readonly scheduler: RuntimeControlScheduler;
  readonly frameDeadlineMs: number;
  readonly shutdownDeadlineMs: number;
  readonly handlers: MainRuntimeControlHandlers;
  authenticateHello(
    params: SubsystemHelloParamsV1,
  ):
    | MainHelloAuthenticationDecisionV1
    | Promise<MainHelloAuthenticationDecisionV1>;
}

export interface MainSubsystemControlPeer {
  shutdown(
    params: SubsystemShutdownParamsV1,
  ): Promise<
    RuntimeControlRequestOutcome<
      SubsystemShutdownResultV1,
      RuntimeControlProtocolStateErrorDataV1
    >
  >;
}

export interface MainFrameControlPeer {
  initialize(
    params: FrameInitializeParams,
  ): Promise<
    RuntimeControlRequestOutcome<FrameInitializeResult, FrameRpcErrorData>
  >;
  activate(
    params: FrameActivateParams,
  ): Promise<
    RuntimeControlRequestOutcome<FrameActivateResult, FrameRpcErrorData>
  >;
  suspend(
    params: FrameSuspendParams,
  ): Promise<
    RuntimeControlRequestOutcome<FrameSuspendResult, FrameRpcErrorData>
  >;
  resume(
    params: FrameResumeParams,
  ): Promise<
    RuntimeControlRequestOutcome<FrameResumeResult, FrameRpcErrorData>
  >;
  closeFrame(
    params: FrameCloseParams,
  ): Promise<RuntimeControlRequestOutcome<FrameCloseResult, FrameRpcErrorData>>;
}

export interface MainRuntimeControlPeer {
  readonly identified: Promise<MainRuntimeControlIdentificationOutcome>;
  readonly control: MainSubsystemControlPeer;
  readonly frame: MainFrameControlPeer;
  readonly terminal: Promise<RuntimeControlTerminal>;
  close(): Promise<void>;
}

export interface SubsystemRuntimeControlHandlers {
  onShutdown(
    params: SubsystemShutdownParamsV1,
  ):
    | RuntimeControlHandlerReply<SubsystemShutdownResultV1, never>
    | Promise<RuntimeControlHandlerReply<SubsystemShutdownResultV1, never>>;
  onFrameInitialize(
    params: FrameInitializeParams,
  ):
    | RuntimeControlHandlerReply<FrameInitializeResult, FrameRpcErrorData>
    | Promise<
        RuntimeControlHandlerReply<FrameInitializeResult, FrameRpcErrorData>
      >;
  onFrameActivate(
    params: FrameActivateParams,
  ):
    | RuntimeControlHandlerReply<FrameActivateResult, FrameRpcErrorData>
    | Promise<
        RuntimeControlHandlerReply<FrameActivateResult, FrameRpcErrorData>
      >;
  onFrameSuspend(
    params: FrameSuspendParams,
  ):
    | RuntimeControlHandlerReply<FrameSuspendResult, FrameRpcErrorData>
    | Promise<
        RuntimeControlHandlerReply<FrameSuspendResult, FrameRpcErrorData>
      >;
  onFrameResume(
    params: FrameResumeParams,
  ):
    | RuntimeControlHandlerReply<FrameResumeResult, FrameRpcErrorData>
    | Promise<RuntimeControlHandlerReply<FrameResumeResult, FrameRpcErrorData>>;
  onFrameClose(
    params: FrameCloseParams,
  ):
    | RuntimeControlHandlerReply<FrameCloseResult, FrameRpcErrorData>
    | Promise<RuntimeControlHandlerReply<FrameCloseResult, FrameRpcErrorData>>;
}

export interface SubsystemRuntimeControlConnectOptions {
  readonly carrier: MessageCarrier;
  readonly scheduler: RuntimeControlScheduler;
  readonly helloDeadlineMs: number;
  readonly frameDeadlineMs: number;
  readonly hello: SubsystemHelloParamsV1;
  readonly handlers: SubsystemRuntimeControlHandlers;
}

export interface SubsystemControlPeer {
  status(
    status: SubsystemRuntimeStatusV1,
  ): Promise<RuntimeControlNotificationOutcome>;
}

export interface SubsystemFrameControlPeer {
  call(
    params: FrameCallParams,
  ): Promise<RuntimeControlRequestOutcome<FrameCallResult, FrameRpcErrorData>>;
  returnFrame(
    params: FrameReturnParams,
  ): Promise<
    RuntimeControlRequestOutcome<FrameReturnResult, FrameRpcErrorData>
  >;
}

export interface SubsystemRuntimeControlPeer {
  readonly control: SubsystemControlPeer;
  readonly frame: SubsystemFrameControlPeer;
  readonly terminal: Promise<RuntimeControlTerminal>;
  close(): Promise<void>;
}

export type SubsystemRuntimeControlConnectOutcome =
  | { readonly kind: "connected"; readonly peer: SubsystemRuntimeControlPeer }
  | { readonly kind: "rejected"; readonly error: SubsystemHelloErrorDataV1 }
  | { readonly kind: "timeout" }
  | { readonly kind: "terminal"; readonly terminal: RuntimeControlTerminal };
