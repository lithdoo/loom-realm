import {
  Connection,
  afterResponseAcceptance,
  deadline,
  StateError,
  validateInfrastructure,
} from "./runtime.js";
import { exact, member, objectValue } from "./codec.js";
import { status as parseStatus } from "./schema.js";
import type * as M from "./model.js";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
const functionValue = (value: unknown, name: string): void => {
  if (typeof value !== "function") throw new TypeError(`Invalid ${name}`);
};

export function createMainRuntimeControlPeer(
  options: M.MainRuntimeControlPeerOptions,
): M.MainRuntimeControlPeer {
  if (options === null || typeof options !== "object")
    throw new TypeError("Invalid options");
  validateInfrastructure(options.carrier, options.scheduler);
  deadline(options.frameDeadlineMs, "frameDeadlineMs", true);
  deadline(options.shutdownDeadlineMs, "shutdownDeadlineMs");
  functionValue(options.authenticateHello, "authenticateHello");
  const h = options.handlers;
  if (h === null || typeof h !== "object")
    throw new TypeError("Invalid handlers");
  functionValue(h.onStatus, "onStatus");
  functionValue(h.onFrameCall, "onFrameCall");
  functionValue(h.onFrameReturn, "onFrameReturn");
  const identified = deferred<M.MainRuntimeControlIdentificationOutcome>();
  let identificationDone = false;
  let phase:
    | "awaiting"
    | "identified"
    | "initializing"
    | "ready"
    | "stopping"
    | "failed" = "awaiting";
  let shutdownIntent = false;
  let connection: Connection;
  const reject = (
    error: M.SubsystemHelloErrorDataV1,
  ): M.RuntimeControlHandlerReply<never, M.SubsystemHelloErrorDataV1> & {
    readonly [afterResponseAcceptance]: () => void;
  } => {
    return {
      kind: "semantic-error",
      error,
      [afterResponseAcceptance]: () => {
        phase = "failed";
        if (!identificationDone) {
          identificationDone = true;
          identified.resolve(Object.freeze({ kind: "rejected", error }));
        }
      },
      afterResponse: () => connection.close(),
    };
  };
  connection = new Connection(options.carrier, options.scheduler, "main", {
    async request(method, params) {
      if (method === "subsystem.hello") {
        if (phase !== "awaiting") throw new StateError("Hello is one-shot");
        const hello = params as M.SubsystemHelloParamsV1;
        if (!hello.protocolVersions.includes(1))
          return reject({ code: "CONTROL_PROTOCOL_UNSUPPORTED" });
        const decision = await options.authenticateHello(hello);
        const o = objectValue(decision, "authentication decision");
        if (member(o, "kind") === "accepted") {
          exact(o, ["kind"]);
          return {
            kind: "success",
            result: { protocolVersion: 1 },
            afterResponse: () => {
              phase = "identified";
              if (!identificationDone) {
                identificationDone = true;
                identified.resolve(
                  Object.freeze({
                    kind: "identified",
                    key: hello.key,
                    protocolVersion: 1,
                  }),
                );
              }
            },
          };
        }
        exact(o, ["kind", "code"]);
        const code = member(o, "code");
        if (
          code !== "BOOTSTRAP_AUTHENTICATION_FAILED" &&
          code !== "DUPLICATE_CONTROL_CONNECTION"
        )
          throw new TypeError("Invalid authentication decision");
        return reject({ code });
      }
      if (
        shutdownIntent ||
        phase === "awaiting" ||
        phase === "stopping" ||
        phase === "failed"
      )
        throw new StateError("Request before identification or after failure");
      if (method === "frame.call")
        return h.onFrameCall(params as M.FrameCallParams);
      if (method === "frame.return")
        return h.onFrameReturn(params as M.FrameReturnParams);
      throw new StateError("Wrong-direction request");
    },
    async notification(method, params) {
      if (
        method !== "subsystem.status" ||
        phase === "awaiting" ||
        phase === "failed"
      )
        throw new StateError("Status in invalid state");
      const status = parseStatus(params);
      const next = status.state;
      const allowed =
        (phase === "identified" &&
          (next === "initializing" ||
            next === "ready" ||
            next === "failed" ||
            (shutdownIntent && next === "stopping"))) ||
        (phase === "initializing" &&
          (next === "ready" ||
            next === "failed" ||
            (shutdownIntent && next === "stopping"))) ||
        (phase === "ready" &&
          (next === "failed" || (shutdownIntent && next === "stopping"))) ||
        (phase === "stopping" && next === "failed");
      if (!allowed) throw new StateError("Invalid status transition");
      phase = next;
      await h.onStatus(status);
    },
  });
  void connection.terminal.then((terminal) => {
    void Promise.resolve().then(() => {
      if (!identificationDone) {
        identificationDone = true;
        identified.resolve(Object.freeze({ kind: "terminal", terminal }));
      }
    });
  });
  const request = <R, E>(
    method: M.RuntimeControlRequestMethod,
    params: unknown,
    ms: number,
  ) =>
    connection.request(method, params, ms) as Promise<
      M.RuntimeControlRequestOutcome<R, E>
    >;
  const frameRequest = <R>(
    method: M.RuntimeControlRequestMethod,
    params: unknown,
  ): Promise<M.RuntimeControlRequestOutcome<R, M.FrameRpcErrorData>> =>
    shutdownIntent ||
    phase === "awaiting" ||
    phase === "stopping" ||
    phase === "failed"
      ? Promise.resolve(
          connection.failLocal(new StateError("Invalid frame request state")),
        )
      : request(method, params, options.frameDeadlineMs);
  return Object.freeze({
    identified: identified.promise,
    control: Object.freeze({
      shutdown(
        params: M.SubsystemShutdownParamsV1,
      ): Promise<
        M.RuntimeControlRequestOutcome<
          M.SubsystemShutdownResultV1,
          M.RuntimeControlProtocolStateErrorDataV1
        >
      > {
        if (
          shutdownIntent ||
          phase === "awaiting" ||
          phase === "failed" ||
          phase === "stopping"
        )
          return Promise.resolve(
            connection.failLocal(new StateError("Invalid shutdown state")),
          );
        shutdownIntent = true;
        return request(
          "subsystem.shutdown",
          params,
          options.shutdownDeadlineMs,
        );
      },
    }),
    frame: Object.freeze({
      initialize: (p: M.FrameInitializeParams) =>
        frameRequest<M.FrameInitializeResult>("frame.initialize", p),
      activate: (p: M.FrameActivateParams) =>
        frameRequest<M.FrameActivateResult>("frame.activate", p),
      suspend: (p: M.FrameSuspendParams) =>
        frameRequest<M.FrameSuspendResult>("frame.suspend", p),
      resume: (p: M.FrameResumeParams) =>
        frameRequest<M.FrameResumeResult>("frame.resume", p),
      closeFrame: (p: M.FrameCloseParams) =>
        frameRequest<M.FrameCloseResult>("frame.close", p),
    }),
    terminal: connection.terminal,
    close: () => connection.close(),
  });
}
