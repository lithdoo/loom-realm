import type { JsonValue } from "@loomrealm/wire";
import { assertJsonValue, jsonDepth, parseJsonText, stringifyJson, utf8ByteLength } from "@loomrealm/wire";
import type { RendererDataMessageV1 } from "./model.js";
import { validateInputEvent, validateInputInterest, validateInputReset, validateInputState } from "./input-codec.js";
import {
  validateRenderDomains,
  validateRenderEvent,
  validateRenderPatch,
  validateRenderSnapshot,
} from "./render-codec.js";
import {
  assertBoundedJson,
  fail,
  MAX_JSON_DEPTH,
  MAX_MESSAGE_BYTES,
  object,
  stringValue,
} from "./validation-common.js";

export type DataRole = "subsystem" | "renderer";

function typeOfObject(raw: unknown): string {
  const o = object(raw, "profile", "message");
  return stringValue(o.type, "profile", "type");
}

function validateByType(raw: unknown): RendererDataMessageV1 {
  const type = typeOfObject(raw);
  if (type === "input.interest") return validateInputInterest(raw);
  if (type === "input.state") return validateInputState(raw);
  if (type === "input.event") return validateInputEvent(raw);
  if (type === "input.reset") return validateInputReset(raw);
  if (type === "render.domains") return validateRenderDomains(raw);
  if (type === "render.snapshot") return validateRenderSnapshot(raw);
  if (type === "render.patch") return validateRenderPatch(raw);
  if (type === "render.event") return validateRenderEvent(raw);
  fail(
    type.startsWith("input.") ? "input" : type.startsWith("render.") ? "render" : "profile",
    "unknown data message type",
  );
}

function inboundAllowed(role: DataRole, type: string): boolean {
  return role === "subsystem"
    ? type === "input.state" || type === "input.event" || type === "input.reset"
    : type === "input.interest" || type.startsWith("render.");
}

function outboundAllowed(role: DataRole, type: string): boolean {
  return role === "subsystem"
    ? type === "input.interest" || type.startsWith("render.")
    : type === "input.state" || type === "input.event" || type === "input.reset";
}

export function decodeForRole(raw: string, role: DataRole): RendererDataMessageV1 {
  if (typeof raw !== "string") fail("profile", "carrier application unit must be string");
  if (utf8ByteLength(raw) > MAX_MESSAGE_BYTES) fail("profile", "message byte limit exceeded");
  let parsed: JsonValue;
  try {
    parsed = parseJsonText(raw);
  } catch (cause) {
    fail("profile", `invalid JSON: ${String(cause)}`);
  }
  if (jsonDepth(parsed) > MAX_JSON_DEPTH) fail("profile", "JSON depth limit exceeded");
  assertBoundedJson(parsed, "profile", MAX_JSON_DEPTH);
  const message = validateByType(parsed);
  const t = (message as { type: string }).type;
  if (!inboundAllowed(role, t)) {
    fail(t.startsWith("input.") ? "input" : "render", "message direction invalid for role");
  }
  return message;
}

export function encodeForRole(message: RendererDataMessageV1, role: DataRole): string {
  const validated = validateByType(message);
  const t = (validated as { type: string }).type;
  if (!outboundAllowed(role, t)) {
    fail(t.startsWith("input.") ? "input" : "render", "outbound direction invalid for role");
  }
  assertJsonValue(validated as unknown);
  const text = stringifyJson(validated as unknown as JsonValue);
  if (utf8ByteLength(text) > MAX_MESSAGE_BYTES) fail("profile", "message byte limit exceeded");
  return text;
}
