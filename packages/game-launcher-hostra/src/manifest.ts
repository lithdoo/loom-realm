import { parseJsonText, utf8ByteLength, type JsonValue } from "@loomrealm/wire";
import { launcherError } from "./errors.js";

export interface HostraSubsystemBindingV1 {
  readonly key: string;
  readonly module: string;
}

export interface HostraLaunchManifestV1 {
  readonly formatVersion: 1;
  readonly subsystems: readonly HostraSubsystemBindingV1[];
}

const MODULE_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

function validSubsystemKey(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || utf8ByteLength(value) > 256) {
    return false;
  }
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      return false;
    }
  }
  return true;
}

function invalid(cause?: unknown): never {
  void cause;
  throw launcherError("PLATFORM_LAUNCH_MANIFEST_INVALID");
}

function exactObject(
  value: JsonValue,
  keys: readonly string[],
): Record<string, JsonValue> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return invalid();
  }
  if (Object.keys(value).length !== keys.length) return invalid();
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) return invalid();
  }
  return value as Record<string, JsonValue>;
}

export function validateLogicalModule(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    utf8ByteLength(value) > 512 ||
    !value.endsWith(".mjs") ||
    value.includes("\\") ||
    value.includes(":")
  ) {
    throw launcherError("SUBSYSTEM_MODULE_INVALID");
  }
  const segments = value.split("/");
  if (
    segments.some(
      (segment) =>
        segment === "" ||
        segment === "." ||
        segment === ".." ||
        !MODULE_SEGMENT.test(segment),
    )
  ) {
    throw launcherError("SUBSYSTEM_MODULE_INVALID");
  }
  return value;
}

export function parseHostraLaunchManifest(text: string): HostraLaunchManifestV1 {
  let parsed: JsonValue;
  try {
    parsed = parseJsonText(text);
  } catch (error) {
    return invalid(error);
  }

  const object = exactObject(parsed, ["formatVersion", "subsystems"]);
  if (object.formatVersion !== 1 || !Array.isArray(object.subsystems)) invalid();

  const seen = new Set<string>();
  const subsystems = object.subsystems.map((candidate) => {
    const binding = exactObject(candidate, ["key", "module"]);
    if (!validSubsystemKey(binding.key)) invalid();
    if (seen.has(binding.key)) invalid();
    seen.add(binding.key);
    const module = validateLogicalModule(binding.module);
    return Object.freeze({ key: binding.key, module });
  });

  return Object.freeze({
    formatVersion: 1,
    subsystems: Object.freeze(subsystems),
  });
}
