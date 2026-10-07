import { parseGameEntryV1 } from "@loomrealm/game-package";
import {
  PwaLauncherError,
  buildPwaExecutableIndexV1,
  parsePwaLaunchManifestV1,
} from "@loomrealm/game-launcher-pwa";
import { parseJsonText } from "@loomrealm/wire";
import { serializePwaPublicManifestV1 } from "./content-manifest.js";
import type { PwaInstallationBundleV1 } from "./installation-bundle.js";
import {
  getInstallation,
  listInstallations,
  publishInstallation,
  putInstallation,
  readInstallationObject,
  removeInstallationObjects,
  removeInstallationRecord,
  retireInstallation,
  writeInstallationObject,
  type PwaInstallationRecord,
  type StoredContentIndexEntry,
  type StoredObjectRef,
} from "./installation-store.js";

const encoder = new TextEncoder();
const fatalDecoder = new TextDecoder("utf-8", { fatal: true });
const MAX_CONTENT_ENTRIES = 4_096;
const MAX_EXECUTABLE_MODULES = 1_024;
const MAX_OBJECT_BYTES = 64 * 1024 * 1024;
const MAX_INSTALLATION_BYTES = 256 * 1024 * 1024;

function mimeTokenCharacter(value: string): boolean {
  return /^[A-Za-z0-9!#$%&'*+.^_`|~-]$/.test(value);
}

function validatedMime(value: unknown): { readonly value: string; readonly essence: string } {
  if (typeof value !== "string" || value.length === 0 || value !== value.trim()) throw new TypeError("Invalid PWA content MIME");
  let cursor = 0;
  const token = (): string => {
    const start = cursor;
    while (cursor < value.length && mimeTokenCharacter(value[cursor]!)) cursor += 1;
    if (cursor === start) throw new TypeError("Invalid PWA content MIME");
    return value.slice(start, cursor);
  };
  const whitespace = () => { while (value[cursor] === " " || value[cursor] === "\t") cursor += 1; };
  const type = token();
  if (value[cursor] !== "/") throw new TypeError("Invalid PWA content MIME");
  cursor += 1;
  const subtype = token();
  const parameters = new Set<string>();
  while (cursor < value.length) {
    whitespace();
    if (cursor === value.length) break;
    if (value[cursor] !== ";") throw new TypeError("Invalid PWA content MIME");
    cursor += 1;
    whitespace();
    const name = token().toLowerCase();
    if (parameters.has(name)) throw new TypeError("Invalid PWA content MIME");
    parameters.add(name);
    whitespace();
    if (value[cursor] !== "=") throw new TypeError("Invalid PWA content MIME");
    cursor += 1;
    whitespace();
    if (value[cursor] === "\"") {
      cursor += 1;
      let closed = false;
      while (cursor < value.length) {
        const code = value.charCodeAt(cursor);
        if (value[cursor] === "\"") { cursor += 1; closed = true; break; }
        if (value[cursor] === "\\") {
          cursor += 1;
          if (cursor === value.length) throw new TypeError("Invalid PWA content MIME");
          const escaped = value.charCodeAt(cursor);
          if (!(escaped === 0x09 || (escaped >= 0x20 && escaped <= 0x7e) || (escaped >= 0x80 && escaped <= 0xff))) throw new TypeError("Invalid PWA content MIME");
          cursor += 1;
          continue;
        }
        if (!(code === 0x09 || code === 0x20 || code === 0x21 || (code >= 0x23 && code <= 0x5b) || (code >= 0x5d && code <= 0x7e) || (code >= 0x80 && code <= 0xff))) throw new TypeError("Invalid PWA content MIME");
        cursor += 1;
      }
      if (!closed) throw new TypeError("Invalid PWA content MIME");
    } else {
      token();
    }
  }
  return Object.freeze({ value, essence: `${type.toLowerCase()}/${subtype.toLowerCase()}` });
}

function validateStructuredContent(kind: "record" | "group" | "resource", bytes: Uint8Array): void {
  if (kind === "resource") return;
  let text: string;
  try { text = fatalDecoder.decode(bytes); }
  catch (cause) { throw new TypeError(`Invalid PWA ${kind} UTF-8`, { cause }); }
  if (kind === "record") {
    try { parseJsonText(text); }
    catch (cause) { throw new TypeError("Invalid PWA record JSON", { cause }); }
    return;
  }
  const lines = text.split("\n");
  if (lines.at(-1) === "") lines.pop();
  try {
    for (const raw of lines) {
      const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
      if (line.length === 0) throw new TypeError("Empty JSON Lines item");
      parseJsonText(line);
    }
  } catch (cause) {
    throw new TypeError("Invalid PWA group JSON Lines", { cause });
  }
}

function exact(value: unknown, fields: readonly string[], label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`Invalid ${label}`);
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const expected = [...fields].sort();
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) throw new TypeError(`Invalid ${label}`);
  return record;
}

function segment(value: unknown): string {
  if (typeof value !== "string" || value.length === 0 || value === "." || value === ".." || /[\\/\0:]|\p{Cc}|\p{Cs}/u.test(value)) throw new TypeError("Invalid installation segment");
  return value;
}

async function hash(bytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes.slice().buffer as ArrayBuffer));
  return `sha256:${[...digest].map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

async function storeObject(rootId: string, bytes: Uint8Array, mime: string): Promise<StoredObjectRef> {
  const contentVersion = await hash(bytes);
  await writeInstallationObject(rootId, contentVersion, bytes);
  const observed = await readInstallationObject(rootId, contentVersion);
  if (observed.byteLength !== bytes.byteLength || await hash(observed) !== contentVersion) throw new Error("Installation object verification failed");
  return Object.freeze({ contentVersion, size: bytes.byteLength, mime });
}

export interface InstallationStorageResult {
  readonly estimate: StorageEstimate;
  readonly persistence: "granted" | "denied" | "unavailable";
}

export async function inspectInstallationStorage(requiredBytes = 0): Promise<InstallationStorageResult> {
  const estimate = await navigator.storage.estimate();
  const available = estimate.quota === undefined ? undefined : estimate.quota - (estimate.usage ?? 0);
  if (available !== undefined && requiredBytes > available) throw new DOMException("Insufficient installation quota", "QuotaExceededError");
  let persistence: InstallationStorageResult["persistence"] = "unavailable";
  if (typeof navigator.storage.persist === "function") {
    persistence = await navigator.storage.persist() ? "granted" : "denied";
  }
  return Object.freeze({ estimate, persistence });
}

async function installPwaBundleRecord(bundle: PwaInstallationBundleV1, signal?: AbortSignal): Promise<PwaInstallationRecord> {
  if (signal?.aborted) throw signal.reason;
  const value = exact(bundle, ["formatVersion", "gameEntryText", "launchManifestText", "content", "executables"], "PWA installation bundle");
  if (
    value.formatVersion !== 1 || typeof value.gameEntryText !== "string" || typeof value.launchManifestText !== "string"
    || value.gameEntryText.length > MAX_OBJECT_BYTES || value.launchManifestText.length > MAX_OBJECT_BYTES
    || !Array.isArray(value.content) || value.content.length > MAX_CONTENT_ENTRIES
    || !Array.isArray(value.executables) || value.executables.length > MAX_EXECUTABLE_MODULES
  ) throw new TypeError("Invalid PWA installation bundle");
  const installationId = crypto.randomUUID();
  const generation = crypto.randomUUID();
  const game = parseGameEntryV1(value.gameEntryText);
  const publicManifestText = serializePwaPublicManifestV1(game);
  const manifest = parsePwaLaunchManifestV1(value.launchManifestText);
  const gameKeys = new Set(game.subsystems.map(({ key }) => key));
  for (const { key } of game.subsystems) if (!manifest.subsystems.some((binding) => binding.key === key)) throw new PwaLauncherError("PLATFORM_BINDING_MISSING");
  for (const { key } of manifest.subsystems) if (!gameKeys.has(key)) throw new PwaLauncherError("PLATFORM_BINDING_UNDECLARED");
  const executableSources = await Promise.all(value.executables.map(async (candidate) => {
    const entry = exact(candidate, ["logicalModule", "mime", "body"], "PWA executable");
    if (typeof entry.logicalModule !== "string" || (entry.mime !== "text/javascript" && entry.mime !== "application/javascript") || !(entry.body instanceof Blob)) throw new TypeError("Invalid PWA executable");
    if (entry.body.size > MAX_OBJECT_BYTES) throw new TypeError("PWA executable exceeds deployment limit");
    const bytes = new Uint8Array(await entry.body.arrayBuffer());
    return { logicalModule: entry.logicalModule, mime: entry.mime, source: await entry.body.text(), bytes, contentVersion: await hash(bytes) };
  }));
  const contentBodies = await Promise.all(value.content.map(async (candidate) => {
    const entry = exact(candidate, ["kind", "namespace", "key", "mime", "body"], "PWA content entry");
    if ((entry.kind !== "record" && entry.kind !== "group" && entry.kind !== "resource") || typeof entry.key !== "string") throw new TypeError("Invalid PWA content entry");
    const mime = validatedMime(entry.mime);
    if (entry.kind === "record" && mime.essence !== "application/json") throw new TypeError("Invalid PWA record MIME");
    if (entry.kind === "group" && mime.essence !== "application/x-ndjson") throw new TypeError("Invalid PWA group MIME");
    const namespace = segment(entry.namespace);
    const key = entry.key.split("/").map(segment).join("/");
    if (entry.kind !== "resource" && key.includes("/")) throw new TypeError("Invalid PWA content key");
    if (!(entry.body instanceof Blob)) throw new TypeError("Invalid PWA content body");
    if (entry.body.size > MAX_OBJECT_BYTES) throw new TypeError("PWA content exceeds deployment limit");
    const bytes = new Uint8Array(await entry.body.arrayBuffer());
    validateStructuredContent(entry.kind, bytes);
    const servedMime = entry.kind === "record" ? "application/json; charset=utf-8"
      : entry.kind === "group" ? "application/x-ndjson; charset=utf-8"
        : mime.value;
    return { kind: entry.kind, namespace, key, mime: servedMime, bytes } as const;
  }));
  const contentIdentities = new Set<string>();
  for (const entry of contentBodies) {
    const identity = `${entry.kind}\u0000${entry.namespace}\u0000${entry.key}`;
    if (contentIdentities.has(identity)) throw new TypeError("Duplicate PWA content identity");
    contentIdentities.add(identity);
  }
  const graph = await buildPwaExecutableIndexV1(executableSources.map(({ logicalModule, source, contentVersion }) => ({ logicalModule, source, contentVersion })));
  for (const binding of manifest.subsystems) if (!graph.some(({ logicalModule }) => logicalModule === binding.module)) throw new TypeError("Missing PWA subsystem executable");
  const gameBytes = encoder.encode(publicManifestText);
  const manifestBytes = encoder.encode(value.launchManifestText);
  const requiredBytes = gameBytes.byteLength + manifestBytes.byteLength + contentBodies.reduce((total, item) => total + item.bytes.byteLength, 0) + executableSources.reduce((total, item) => total + item.bytes.byteLength, 0);
  if (gameBytes.byteLength > MAX_OBJECT_BYTES || manifestBytes.byteLength > MAX_OBJECT_BYTES || requiredBytes > MAX_INSTALLATION_BYTES) throw new TypeError("PWA installation exceeds deployment limit");
  const storage = await inspectInstallationStorage(requiredBytes);
  if (signal?.aborted) throw signal.reason;
  const rootId = installationId;
  const placeholder: StoredObjectRef = Object.freeze({ contentVersion: `sha256:${"0".repeat(64)}`, size: 0, mime: "application/octet-stream" });
  const staging: PwaInstallationRecord = Object.freeze({ installationId, generation, state: "staging", rootId, createdAt: Date.now(), gameEntryText: publicManifestText, launchManifestText: value.launchManifestText, gameEntry: placeholder, launchManifest: placeholder, contentIndex: Object.freeze([]), executableIndex: Object.freeze([]), persistence: storage.persistence });
  let registered = false;
  try {
    await putInstallation(staging);
    registered = true;
    // Give cancellation and storage-pressure observers a task boundary after
    // staging becomes visible but before any publish can occur.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    if (signal?.aborted) throw signal.reason;
    const gameEntry = await storeObject(rootId, gameBytes, "application/json; charset=utf-8");
    if (signal?.aborted) throw signal.reason;
    const launchManifest = await storeObject(rootId, manifestBytes, "application/json; charset=utf-8");
    if (signal?.aborted) throw signal.reason;
    const contentIndex: StoredContentIndexEntry[] = [Object.freeze({ kind: "manifest", ...gameEntry })];
    for (const entry of contentBodies) {
      contentIndex.push(Object.freeze({ kind: entry.kind, namespace: entry.namespace, key: entry.key, ...await storeObject(rootId, entry.bytes, entry.mime) }));
      if (signal?.aborted) throw signal.reason;
    }
    const storedExecutable = new Map<string, StoredObjectRef>();
    for (const entry of executableSources) {
      const stored = await storeObject(rootId, entry.bytes, entry.mime);
      storedExecutable.set(entry.logicalModule, stored);
      if (signal?.aborted) throw signal.reason;
    }
    const executableIndex = graph.map((entry) => Object.freeze({ ...entry, ...storedExecutable.get(entry.logicalModule)! }));
    const complete: PwaInstallationRecord = Object.freeze({ ...staging, state: "complete", gameEntry, launchManifest, contentIndex: Object.freeze(contentIndex), executableIndex: Object.freeze(executableIndex) });
    await publishInstallation(complete);
    return complete;
  } catch (cause) {
    const failures: unknown[] = [];
    try { await removeInstallationObjects(rootId); }
    catch (cleanupCause) { failures.push(cleanupCause); }
    // Retain the staging tombstone when physical cleanup fails so startup
    // maintenance still knows which OPFS namespace must be retried.
    if (failures.length === 0 && registered) {
      try { await removeInstallationRecord(installationId); }
      catch (cleanupCause) { failures.push(cleanupCause); }
    }
    if (failures.length > 0) throw new AggregateError([cause, ...failures], "PWA installation failed and cleanup was incomplete");
    throw cause;
  }
}

export interface PwaInstalledGameV1 { readonly installationId: string }

export async function installPwaBundle(bundle: PwaInstallationBundleV1, signal?: AbortSignal): Promise<PwaInstalledGameV1> {
  const installation = await installPwaBundleRecord(bundle, signal);
  return Object.freeze({ installationId: installation.installationId });
}

export async function ensurePwaBundle(bundle: PwaInstallationBundleV1, knownInstallationId?: string | null): Promise<PwaInstallationRecord> {
  if (knownInstallationId) {
    const existing = await getInstallation(knownInstallationId);
    if (existing?.state === "complete") return existing;
  }
  return installPwaBundleRecord(bundle);
}

export async function collectInstallationGarbage(): Promise<number> {
  let count = 0;
  for (const installation of await listInstallations()) {
    if (installation.state !== "staging" && installation.state !== "invalid") continue;
    // Delete physical state first. If that fails, the non-publishable record
    // remains as a durable retry pointer instead of creating an anonymous leak.
    await removeInstallationObjects(installation.rootId);
    await removeInstallationRecord(installation.installationId);
    count += 1;
  }
  return count;
}

export async function uninstallPwaInstallation(installationId: string): Promise<void> {
  const retired = await retireInstallation(installationId);
  if (retired === null) return;
  await removeInstallationObjects(retired.rootId);
  await removeInstallationRecord(installationId);
}
