import type { JsonValue } from "@loomrealm/wire";
import {
  asciiCode,
  businessValue,
  exact,
  member,
  objectValue,
  ProfileError,
  stringValue,
} from "./codec.js";
import type * as M from "./model.js";

const empty = (value: unknown): Record<string, JsonValue> => {
  const o = objectValue(value);
  exact(o, []);
  return o;
};
const literal = <T extends string>(
  value: unknown,
  values: readonly T[],
  name: string,
): T => {
  if (typeof value !== "string" || !values.includes(value as T))
    throw new ProfileError(`Invalid ${name}`);
  return value as T;
};
const id = (value: unknown, name: string): string =>
  stringValue(value, name, 128);

export function hello(value: unknown): M.SubsystemHelloParamsV1 {
  const o = objectValue(value);
  exact(o, ["key", "bootstrapToken", "protocolVersions"]);
  const versions = member(o, "protocolVersions");
  if (
    !Array.isArray(versions) ||
    versions.length < 1 ||
    versions.length > 16 ||
    versions.some((v) => !Number.isSafeInteger(v) || v < 1) ||
    new Set(versions).size !== versions.length
  )
    throw new ProfileError("Invalid protocolVersions");
  return {
    key: stringValue(member(o, "key"), "key", 256),
    bootstrapToken: stringValue(
      member(o, "bootstrapToken"),
      "bootstrapToken",
      4096,
    ),
    protocolVersions: [...versions] as number[],
  };
}
export function helloResult(value: unknown): M.SubsystemHelloResultV1 {
  const o = objectValue(value);
  exact(o, ["protocolVersion"]);
  if (member(o, "protocolVersion") !== 1)
    throw new ProfileError("Invalid protocolVersion");
  return { protocolVersion: 1 };
}
export function shutdown(value: unknown): M.SubsystemShutdownParamsV1 {
  const o = objectValue(value);
  exact(o, ["reason"]);
  return {
    reason: literal(
      member(o, "reason"),
      ["session-end", "bootstrap-abort"],
      "reason",
    ),
  };
}
export function status(value: unknown): M.SubsystemRuntimeStatusV1 {
  const o = objectValue(value);
  exact(o, ["state"], ["error"]);
  const state = literal(
    member(o, "state"),
    ["initializing", "ready", "stopping", "failed"],
    "state",
  );
  if (state !== "failed") {
    exact(o, ["state"]);
    return { state };
  }
  const e = objectValue(member(o, "error"), "error");
  exact(e, ["code"], ["message"]);
  const message = Object.prototype.hasOwnProperty.call(e, "message")
    ? stringValue(member(e, "message"), "message", 4096, true)
    : undefined;
  return {
    state: "failed",
    error: {
      code: asciiCode(member(e, "code"), "code"),
      ...(message === undefined ? {} : { message }),
    },
  };
}
function failure(value: unknown): M.FrameFailure {
  const o = objectValue(value);
  exact(o, ["code"], ["message", "data"]);
  const message = Object.prototype.hasOwnProperty.call(o, "message")
    ? stringValue(member(o, "message"), "message", 4096, true)
    : undefined;
  const data = Object.prototype.hasOwnProperty.call(o, "data")
    ? businessValue(member(o, "data"))
    : undefined;
  return {
    code: asciiCode(member(o, "code"), "code"),
    ...(message === undefined ? {} : { message }),
    ...(data === undefined ? {} : { data }),
  };
}
function outcome(value: unknown): M.FrameOutcome {
  const o = objectValue(value);
  const type = literal(
    member(o, "type"),
    ["completed", "cancelled", "failed"],
    "outcome type",
  );
  if (type === "completed") {
    exact(o, ["type", "value"]);
    return { type, value: businessValue(member(o, "value")) };
  }
  if (type === "cancelled") {
    exact(o, ["type"]);
    return { type };
  }
  exact(o, ["type", "error"]);
  return { type, error: failure(member(o, "error")) };
}
const frame = (o: Record<string, JsonValue>) =>
  id(member(o, "frameId"), "frameId");
export function params(
  method: M.RuntimeControlRequestMethod,
  value: unknown,
): unknown {
  if (method === "subsystem.hello") return hello(value);
  if (method === "subsystem.shutdown") return shutdown(value);
  const o = objectValue(value);
  switch (method) {
    case "frame.initialize":
      exact(o, ["frameId", "input"]);
      return { frameId: frame(o), input: businessValue(member(o, "input")) };
    case "frame.activate":
    case "frame.suspend":
      exact(o, ["frameId", "activationId"]);
      return {
        frameId: frame(o),
        activationId: id(member(o, "activationId"), "activationId"),
      };
    case "frame.resume":
      exact(o, ["frameId", "activationId", "returnedFrameId", "result"]);
      return {
        frameId: frame(o),
        activationId: id(member(o, "activationId"), "activationId"),
        returnedFrameId: id(member(o, "returnedFrameId"), "returnedFrameId"),
        result: outcome(member(o, "result")),
      };
    case "frame.close":
      exact(o, ["frameId"]);
      return { frameId: frame(o) };
    case "frame.call":
      exact(o, ["frameId", "activationId", "targetSubsystemKey", "input"]);
      return {
        frameId: frame(o),
        activationId: id(member(o, "activationId"), "activationId"),
        targetSubsystemKey: stringValue(
          member(o, "targetSubsystemKey"),
          "targetSubsystemKey",
          256,
        ),
        input: businessValue(member(o, "input")),
      };
    case "frame.return":
      exact(o, ["frameId", "activationId", "result"]);
      return {
        frameId: frame(o),
        activationId: id(member(o, "activationId"), "activationId"),
        result: outcome(member(o, "result")),
      };
  }
}
export function result(
  method: M.RuntimeControlRequestMethod,
  value: unknown,
): unknown {
  if (method === "subsystem.hello") return helloResult(value);
  const o = empty(value);
  if (method === "frame.call") throw new ProfileError("Missing childFrameId");
  return o;
}
export function resultFor(
  method: M.RuntimeControlRequestMethod,
  value: unknown,
): unknown {
  if (method === "frame.call") {
    const o = objectValue(value);
    exact(o, ["childFrameId"]);
    return { childFrameId: id(member(o, "childFrameId"), "childFrameId") };
  }
  return result(method, value);
}
const frameCodes = [
  "FRAME_CALL_TARGET_NOT_FOUND",
  "FRAME_CALL_TARGET_UNAVAILABLE",
  "FRAME_INITIALIZE_REJECTED",
  "FRAME_NOT_FOUND",
  "FRAME_STATE_MISMATCH",
  "ACTIVATION_MISMATCH",
  "FRAME_STACK_MISMATCH",
  "FRAME_OWNERSHIP_MISMATCH",
] as const;
export function semantic(
  method: M.RuntimeControlRequestMethod,
  value: unknown,
): {
  error: unknown;
  classification: M.RuntimeControlSemanticErrorClassification;
} {
  const o = objectValue(value, "error data");
  const code = member(o, "code");
  if (method === "subsystem.hello") {
    exact(o, ["code"]);
    return {
      error: {
        code: literal(
          code,
          [
            "BOOTSTRAP_AUTHENTICATION_FAILED",
            "CONTROL_PROTOCOL_UNSUPPORTED",
            "DUPLICATE_CONTROL_CONNECTION",
          ],
          "hello error",
        ),
      },
      classification: "fatal",
    };
  }
  if (code === "PROTOCOL_STATE_ERROR") {
    exact(o, ["code"]);
    return { error: { code }, classification: "fatal" };
  }
  if (method === "subsystem.shutdown")
    throw new ProfileError("Invalid shutdown semantic error");
  const c = literal(code, frameCodes, "frame error");
  if (c === "FRAME_INITIALIZE_REJECTED") {
    exact(o, ["code", "failure"]);
    return {
      error: { code: c, failure: failure(member(o, "failure")) },
      classification: "recoverable",
    };
  }
  exact(o, ["code"]);
  return {
    error: { code: c },
    classification:
      c === "FRAME_CALL_TARGET_NOT_FOUND" ||
      c === "FRAME_CALL_TARGET_UNAVAILABLE"
        ? "recoverable"
        : "fatal",
  };
}
export function reply(
  value: unknown,
): asserts value is M.RuntimeControlHandlerReply<unknown, unknown> {
  const o = objectValue(value, "handler reply");
  const kind = literal(
    member(o, "kind"),
    ["success", "semantic-error"],
    "reply kind",
  );
  exact(
    o,
    ["kind", kind === "success" ? "result" : "error"],
    ["afterResponse"],
  );
  if (
    Object.prototype.hasOwnProperty.call(o, "afterResponse") &&
    typeof member(o, "afterResponse") !== "function"
  )
    throw new ProfileError("Invalid afterResponse");
}
