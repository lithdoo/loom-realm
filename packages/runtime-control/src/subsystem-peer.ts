import {
  Connection,
  deadline,
  StateError,
  validateInfrastructure,
} from "./runtime.js";
import { exact, member, objectValue } from "./codec.js";
import { hello } from "./schema.js";
import type * as M from "./model.js";

const fn = (v: unknown, n: string) => {
  if (typeof v !== "function") throw new TypeError(`Invalid ${n}`);
};

export async function connectSubsystemRuntimeControl(
  options: M.SubsystemRuntimeControlConnectOptions,
): Promise<M.SubsystemRuntimeControlConnectOutcome> {
  if (options === null || typeof options !== "object")
    throw new TypeError("Invalid options");
  validateInfrastructure(options.carrier, options.scheduler);
  deadline(options.helloDeadlineMs, "helloDeadlineMs");
  deadline(options.frameDeadlineMs, "frameDeadlineMs", true);
  const helloParams = hello(options.hello);
  const h = options.handlers;
  if (h === null || typeof h !== "object")
    throw new TypeError("Invalid handlers");
  fn(h.onShutdown, "onShutdown");
  fn(h.onFrameInitialize, "onFrameInitialize");
  fn(h.onFrameActivate, "onFrameActivate");
  fn(h.onFrameSuspend, "onFrameSuspend");
  fn(h.onFrameResume, "onFrameResume");
  fn(h.onFrameClose, "onFrameClose");
  let connected = false;
  let statusState:
    | "identified"
    | "initializing"
    | "ready"
    | "stopping"
    | "failed" = "identified";
  let mutation = false;
  let shutdownReceived = false;
  const connection = new Connection(
    options.carrier,
    options.scheduler,
    "subsystem",
    {
      async request(method, params) {
        if (!connected) throw new StateError("Request before hello completes");
        if (shutdownReceived)
          throw new StateError("Request after shutdown intent");
        switch (method) {
          case "subsystem.shutdown": {
            shutdownReceived = true;
            const reply = await h.onShutdown(
              params as M.SubsystemShutdownParamsV1,
            );
            return {
              ...reply,
              afterResponse: async () => {
                await reply.afterResponse?.();
              },
            };
          }
          case "frame.initialize":
            return h.onFrameInitialize(params as M.FrameInitializeParams);
          case "frame.activate":
            return h.onFrameActivate(params as M.FrameActivateParams);
          case "frame.suspend":
            return h.onFrameSuspend(params as M.FrameSuspendParams);
          case "frame.resume":
            return h.onFrameResume(params as M.FrameResumeParams);
          case "frame.close":
            return h.onFrameClose(params as M.FrameCloseParams);
          default:
            throw new StateError("Wrong-direction request");
        }
      },
      async notification() {
        throw new StateError("Subsystem receives no notifications");
      },
    },
  );
  const helloOutcome = (await connection.request(
    "subsystem.hello",
    helloParams,
    options.helloDeadlineMs,
  )) as M.RuntimeControlRequestOutcome<
    M.SubsystemHelloResultV1,
    M.SubsystemHelloErrorDataV1
  >;
  if (helloOutcome.kind === "timeout")
    return Object.freeze({ kind: "timeout" });
  if (helloOutcome.kind === "terminal")
    return Object.freeze({ kind: "terminal", terminal: helloOutcome.terminal });
  if (helloOutcome.kind === "semantic-error") {
    await connection.close();
    return Object.freeze({ kind: "rejected", error: helloOutcome.error });
  }
  connected = true;
  const frameRequest = <R>(
    method: M.RuntimeControlRequestMethod,
    params: unknown,
  ): Promise<M.RuntimeControlRequestOutcome<R, M.FrameRpcErrorData>> => {
    if (
      shutdownReceived ||
      statusState === "stopping" ||
      statusState === "failed"
    )
      return Promise.resolve(
        connection.failLocal(
          new StateError("Frame operation after terminal runtime status"),
        ),
      );
    if (mutation)
      return Promise.resolve(
        connection.failLocal(
          new StateError("Concurrent subsystem frame mutation"),
        ),
      );
    mutation = true;
    const promise = connection.request(
      method,
      params,
      options.frameDeadlineMs,
    ) as Promise<M.RuntimeControlRequestOutcome<R, M.FrameRpcErrorData>>;
    void promise.then((outcome) => {
      if (
        outcome.kind === "success" ||
        (outcome.kind === "semantic-error" &&
          outcome.classification === "recoverable")
      )
        mutation = false;
    });
    return promise;
  };
  const peer: M.SubsystemRuntimeControlPeer = Object.freeze({
    control: Object.freeze({
      status(raw: M.SubsystemRuntimeStatusV1) {
        let next: string;
        try {
          const o = objectValue(raw);
          next = member(o, "state") as string;
        } catch (cause) {
          return Promise.resolve(connection.failLocal(cause));
        }
        const allowed =
          (statusState === "identified" &&
            (next === "initializing" ||
              next === "ready" ||
              next === "failed" ||
              (shutdownReceived && next === "stopping"))) ||
          (statusState === "initializing" &&
            (next === "ready" ||
              next === "failed" ||
              (shutdownReceived && next === "stopping"))) ||
          (statusState === "ready" &&
            ((shutdownReceived && next === "stopping") || next === "failed")) ||
          (statusState === "stopping" && next === "failed");
        if (!allowed)
          return Promise.resolve(
            connection.failLocal(
              new StateError("Invalid local status transition"),
            ),
          );
        statusState = next as typeof statusState;
        return connection.notify(raw);
      },
    }),
    frame: Object.freeze({
      call: (p: M.FrameCallParams) =>
        frameRequest<M.FrameCallResult>("frame.call", p),
      returnFrame: (p: M.FrameReturnParams) =>
        frameRequest<M.FrameReturnResult>("frame.return", p),
    }),
    terminal: connection.terminal,
    close: () => connection.close(),
  });
  return Object.freeze({ kind: "connected", peer });
}
