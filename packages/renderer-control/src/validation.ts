import {
  assertJsonValue,
  decodeJsonRpcMessage,
  jsonDepth,
  parseJsonText,
  stringifyJson,
  utf8ByteLength,
  type JsonRpcMessage,
  type JsonValue,
} from "@loomrealm/wire";
import type {
  RendererAuthoritySnapshotV1,
  RendererDataAuthorityV1,
  RendererFrameStateV1,
  RendererHelloParamsV1,
  RendererRuntimeStateV1,
} from "./model.js";

const MESSAGE_BYTES = 1_048_576;
const MAX_DEPTH = 64;
const MAX_MEMBERS = 16_384;

export class RendererControlProfileError extends TypeError {}

function fail(message: string): never {
  throw new RendererControlProfileError(message);
}

function plain(value: unknown, name: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    fail(`Invalid ${name}`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) fail(`Invalid ${name}`);
  return value as Record<string, unknown>;
}

function exact(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): void {
  const allowed = new Set([...required, ...optional]);
  for (const key of required)
    if (!Object.prototype.hasOwnProperty.call(value, key)) fail(`Missing ${key}`);
  for (const key of Object.keys(value))
    if (!allowed.has(key)) fail(`Unexpected ${key}`);
}

function text(value: unknown, name: string, max: number, ascii = false): string {
  if (typeof value !== "string" || value.length === 0 || utf8ByteLength(value) > max)
    fail(`Invalid ${name}`);
  for (let i = 0; i < value.length; i += 1) {
    const unit = value.charCodeAt(i);
    if (ascii && unit > 0x7f) fail(`Invalid ${name}`);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(i + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) fail(`Invalid ${name}`);
      i += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) fail(`Invalid ${name}`);
  }
  return value;
}

function positiveSafe(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0)
    fail(`Invalid ${name}`);
  return value;
}

function array(value: unknown, name: string): readonly unknown[] {
  if (!Array.isArray(value) || value.length > MAX_MEMBERS) fail(`Invalid ${name}`);
  return value;
}

function frozen<T extends object>(value: T): T {
  return Object.freeze(value);
}

function runtime(raw: unknown): RendererRuntimeStateV1 {
  const value = plain(raw, "runtime");
  exact(value, ["subsystemKey", "state"]);
  const state = value.state;
  if (!["declared", "starting", "connected", "identified", "ready", "stopping", "stopped", "failed"].includes(state as string))
    fail("Invalid runtime state");
  return frozen({ subsystemKey: text(value.subsystemKey, "subsystemKey", 256), state: state as RendererRuntimeStateV1["state"] });
}

function frame(raw: unknown): RendererFrameStateV1 {
  const value = plain(raw, "frame");
  exact(value, ["frameId", "subsystemKey", "lifecycle"], ["activationId"]);
  const lifecycle = value.lifecycle;
  if (!["starting", "active", "suspended", "closing"].includes(lifecycle as string))
    fail("Invalid frame lifecycle");
  const active = lifecycle === "active";
  const hasActivation = Object.prototype.hasOwnProperty.call(value, "activationId");
  if (active !== hasActivation) fail("Invalid frame activation relation");
  return frozen({
    frameId: text(value.frameId, "frameId", 128),
    subsystemKey: text(value.subsystemKey, "subsystemKey", 256),
    lifecycle: lifecycle as RendererFrameStateV1["lifecycle"],
    ...(active ? { activationId: text(value.activationId, "activationId", 128) } : {}),
  });
}

function dataAuthority(raw: unknown): RendererDataAuthorityV1 {
  const value = plain(raw, "dataAuthority");
  exact(value, ["subsystemKey", "generation", "dataProfile"]);
  const dataProfile = text(value.dataProfile, "dataProfile", 256, true);
  if (dataProfile !== "loomrealm.renderer-data/1") fail("Unsupported dataProfile");
  return frozen({
    subsystemKey: text(value.subsystemKey, "subsystemKey", 256),
    generation: positiveSafe(value.generation, "generation"),
    dataProfile,
  });
}

export function validateRendererAuthoritySnapshotV1(raw: unknown): RendererAuthoritySnapshotV1 {
  const value = plain(raw, "snapshot");
  exact(value, ["sessionId", "revision", "runtimes", "stack", "inputTarget", "dataAuthorities"]);
  const runtimes = array(value.runtimes, "runtimes").map(runtime);
  const runtimeKeys = new Set<string>();
  for (const item of runtimes) {
    if (runtimeKeys.has(item.subsystemKey)) fail("Duplicate runtime");
    runtimeKeys.add(item.subsystemKey);
  }
  const stack = array(value.stack, "stack").map(frame);
  const frameKeys = new Set<string>();
  let active: RendererFrameStateV1 | null = null;
  for (let index = 0; index < stack.length; index += 1) {
    const item = stack[index]!;
    if (frameKeys.has(item.frameId) || !runtimeKeys.has(item.subsystemKey)) fail("Invalid frame relation");
    frameKeys.add(item.frameId);
    if (item.lifecycle === "active") {
      if (active !== null || index !== stack.length - 1) fail("Invalid active frame");
      active = item;
    }
  }
  let inputTarget = null;
  if (value.inputTarget !== null) {
    const input = plain(value.inputTarget, "inputTarget");
    exact(input, ["subsystemKey", "frameId", "activationId"]);
    inputTarget = frozen({
      subsystemKey: text(input.subsystemKey, "subsystemKey", 256),
      frameId: text(input.frameId, "frameId", 128),
      activationId: text(input.activationId, "activationId", 128),
    });
    if (active === null || active.frameId !== inputTarget.frameId || active.subsystemKey !== inputTarget.subsystemKey || active.activationId !== inputTarget.activationId)
      fail("Invalid input target relation");
  }
  const dataAuthorities = array(value.dataAuthorities, "dataAuthorities").map(dataAuthority);
  const dataKeys = new Set<string>();
  for (const item of dataAuthorities) {
    if (dataKeys.has(item.subsystemKey) || !runtimeKeys.has(item.subsystemKey)) fail("Invalid data authority relation");
    dataKeys.add(item.subsystemKey);
  }
  return frozen({
    sessionId: text(value.sessionId, "sessionId", 128),
    revision: positiveSafe(value.revision, "revision"),
    runtimes: frozen(runtimes),
    stack: frozen(stack),
    inputTarget,
    dataAuthorities: frozen(dataAuthorities),
  });
}

export function validateRendererHelloParamsV1(raw: unknown): RendererHelloParamsV1 {
  const value = plain(raw, "renderer.hello params");
  exact(value, ["rendererControlToken", "protocolVersions"]);
  const versions = array(value.protocolVersions, "protocolVersions");
  if (versions.length < 1 || versions.length > 16) fail("Invalid protocolVersions");
  const seen = new Set<number>();
  const checked = versions.map((item) => {
    const version = positiveSafe(item, "protocolVersion");
    if (seen.has(version)) fail("Duplicate protocolVersion");
    seen.add(version);
    return version;
  });
  return frozen({ rendererControlToken: text(value.rendererControlToken, "rendererControlToken", 4096), protocolVersions: frozen(checked) });
}

function measureContainers(value: JsonValue): void {
  if (jsonDepth(value) > MAX_DEPTH) fail("JSON depth exceeds limit");
  const stack: JsonValue[] = [value];
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current === null || typeof current !== "object") continue;
    const children = Array.isArray(current) ? current : Object.values(current);
    if (children.length > MAX_MEMBERS) fail("JSON member limit exceeded");
    stack.push(...children);
  }
}

export function encodeRendererControlMessage(value: JsonValue): string {
  assertJsonValue(value);
  measureContainers(value);
  const result = stringifyJson(value);
  if (utf8ByteLength(result) > MESSAGE_BYTES) fail("Renderer Control message exceeds byte limit");
  return result;
}

export function decodeRendererControlMessage(textValue: unknown): JsonRpcMessage {
  if (typeof textValue !== "string" || utf8ByteLength(textValue) > MESSAGE_BYTES) fail("Invalid Renderer Control message");
  const value = parseJsonText(textValue);
  measureContainers(value);
  return decodeJsonRpcMessage(value);
}

export function prepareRendererHelloResultV1(snapshot: RendererAuthoritySnapshotV1): string {
  const checked = validateRendererAuthoritySnapshotV1(snapshot);
  return encodeRendererControlMessage({ jsonrpc: "2.0", id: 1, result: { protocolVersion: 1, snapshot: checked } } as unknown as JsonValue);
}

export function prepareRendererStateV1(snapshot: RendererAuthoritySnapshotV1): string {
  const checked = validateRendererAuthoritySnapshotV1(snapshot);
  return encodeRendererControlMessage({ jsonrpc: "2.0", method: "renderer.state", params: { snapshot: checked } } as unknown as JsonValue);
}
