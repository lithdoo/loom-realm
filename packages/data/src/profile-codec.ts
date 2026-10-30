import type { JsonValue } from "@loomrealm/wire";
import { parseJsonText, stringifyJson } from "@loomrealm/wire";
import type { DataProtocolFamily, RendererDataMessageV3 } from "./model.js";
import {
  validateRenderDomains,
  validateRenderEvent,
  validateRenderPatch,
  validateRenderSnapshot,
} from "./render-codec.js";
import { validateViewportState } from "./viewport-codec.js";
import { validatePresentationEvent, validatePresentationInterest } from "./presentation-codec.js";
import {
  fail,
  object,
  stringValue,
} from "./validation-common.js";

export type DataRole = "subsystem" | "renderer";

export function protocolFamilyOfType(type: string): DataProtocolFamily {
  if (type.startsWith("render.")) return "render";
  if (type === "viewport.state") return "viewport";
  if (type.startsWith("presentation.")) return "presentation";
  return "profile";
}

function typeOfObject(raw: unknown): string {
  const o = object(raw, "profile", "message");
  let descriptor: PropertyDescriptor | undefined;
  try {
    descriptor = Object.getOwnPropertyDescriptor(o, "type");
  } catch (cause) {
    fail("profile", `invalid message type member: ${String(cause)}`);
  }
  if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) {
    fail("profile", "type must be an enumerable data property");
  }
  return stringValue(descriptor.value, "profile", "type");
}

function validateByType(raw: unknown): RendererDataMessageV3 {
  const type = typeOfObject(raw);
  if (type === "render.domains") return validateRenderDomains(raw);
  if (type === "render.snapshot") return validateRenderSnapshot(raw);
  if (type === "render.patch") return validateRenderPatch(raw);
  if (type === "render.event") return validateRenderEvent(raw);
  if (type === "viewport.state") return validateViewportState(raw);
  if (type === "presentation.interest") return validatePresentationInterest(raw);
  if (type === "presentation.event") return validatePresentationEvent(raw);
  fail(protocolFamilyOfType(type), "unknown data message type");
}

function inboundAllowed(role: DataRole, type: string): boolean {
  return role === "subsystem"
    ? type === "viewport.state" || type === "presentation.event"
    : type.startsWith("render.") || type === "presentation.interest";
}

function outboundAllowed(role: DataRole, type: string): boolean {
  return role === "subsystem"
    ? type.startsWith("render.") || type === "presentation.interest"
    : type === "viewport.state" || type === "presentation.event";
}

export function decodeForRole(raw: string, role: DataRole): RendererDataMessageV3 {
  if (typeof raw !== "string") fail("profile", "carrier application unit must be string");
  let parsed: JsonValue;
  try {
    parsed = parseJsonText(raw);
  } catch (cause) {
    fail("profile", `invalid JSON: ${String(cause)}`);
  }
  const message = validateByType(parsed);
  const t = (message as { type: string }).type;
  if (!inboundAllowed(role, t)) {
    fail(protocolFamilyOfType(t), "message direction invalid for role");
  }
  return message;
}

export function encodeForRole(message: RendererDataMessageV3, role: DataRole): string {
  const validated = validateByType(message);
  const t = (validated as { type: string }).type;
  if (!outboundAllowed(role, t)) {
    fail(protocolFamilyOfType(t), "outbound direction invalid for role");
  }
  return stringifyJson(validated as unknown as JsonValue);
}
