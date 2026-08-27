import { assertJsonValue, utf8ByteLength, type JsonValue } from "@loomrealm/wire";
import type { FrameFailure, FrameOutcome } from "./model.js";

const FRAME_FAILURE_CODE = /^[A-Za-z][A-Za-z0-9._:-]{0,127}$/;

function validateFailure(error: FrameFailure): FrameFailure {
  if (error === null || typeof error !== "object" || Array.isArray(error)) {
    throw new TypeError("Frame failure must be an object");
  }
  const keys = Object.keys(error);
  if (keys.some((key) => key !== "code" && key !== "message" && key !== "data")) {
    throw new TypeError("Frame failure contains unknown fields");
  }
  if (typeof error.code !== "string" || !FRAME_FAILURE_CODE.test(error.code)) {
    throw new TypeError("Invalid Frame failure code");
  }
  if (
    error.message !== undefined &&
    (typeof error.message !== "string" || utf8ByteLength(error.message) > 4096)
  ) {
    throw new TypeError("Invalid Frame failure message");
  }
  if (error.data !== undefined) assertJsonValue(error.data);
  return Object.freeze({
    code: error.code,
    ...(error.message === undefined ? {} : { message: error.message }),
    ...(error.data === undefined ? {} : { data: error.data }),
  });
}

export function completed<T extends JsonValue>(value: T): FrameOutcome<T> {
  assertJsonValue(value);
  return Object.freeze({ type: "completed", value });
}

const CANCELLED: FrameOutcome<never> = Object.freeze({ type: "cancelled" });

export function cancelled(): FrameOutcome<never> {
  return CANCELLED;
}

export function failed(error: FrameFailure): FrameOutcome<never> {
  return Object.freeze({ type: "failed", error: validateFailure(error) });
}

export function normalizeFrameOutcome(value: unknown): FrameOutcome {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Frame handler must return a FrameOutcome");
  }
  const candidate = value as Record<string, unknown>;
  switch (candidate.type) {
    case "completed":
      if (Object.keys(candidate).some((key) => key !== "type" && key !== "value")) {
        throw new TypeError("Invalid completed FrameOutcome");
      }
      assertJsonValue(candidate.value);
      return completed(candidate.value);
    case "cancelled":
      if (Object.keys(candidate).some((key) => key !== "type")) {
        throw new TypeError("Invalid cancelled FrameOutcome");
      }
      return cancelled();
    case "failed":
      if (Object.keys(candidate).some((key) => key !== "type" && key !== "error")) {
        throw new TypeError("Invalid failed FrameOutcome");
      }
      return failed(candidate.error as FrameFailure);
    default:
      throw new TypeError("Frame handler must return a FrameOutcome");
  }
}
