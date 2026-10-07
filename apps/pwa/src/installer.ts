import { parseGameEntryV1 } from "@loomrealm/game-package";
import {
  PwaLauncherError,
  buildPwaExecutableIndexV1,
  parsePwaLaunchManifestV1,
} from "@loomrealm/game-launcher-pwa";
import type { PwaInstallationBundleV1 } from "./installation-bundle.js";
import {
  getInstallation,
  listInstallations,
  publishInstallation,
  putInstallation,
  readInstallationObject,
  removeInstallationObjects,
  removeInstallationRecord,
  writeInstallationObject,
  type PwaInstallationRecord,
  type StoredContentIndexEntry,
  type StoredObjectRef,
} from "./installation-store.js";

const encoder = new TextEncoder();

function exact(value: unknown, fields: readonly string[], label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`Invalid ${label}`);
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const expected = [...fields].sort();
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) throw new TypeError(`Invalid ${label}`);
  return record;
}

function segment(value: unknown): string {
  if (typeof value !== "string" || value.length === 0 || value === "." || value === ".." || /[\\/\0]|\p{Cc}|\p{Cs}/u.test(value)) throw new TypeError("Invalid installation segment");
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
  if (value.formatVersion !== 1 || typeof value.gameEntryText !== "string" || typeof value.launchManifestText !== "string" || !Array.isArray(value.content) || !Array.isArray(value.executables)) throw new TypeError("Invalid PWA installation bundle");
  const installationId = crypto.randomUUID();
  const generation = crypto.randomUUID();
  const game = parseGameEntryV1(value.gameEntryText);
  const manifest = parsePwaLaunchManifestV1(value.launchManifestText);
  const gameKeys = new Set(game.subsystems.map(({ key }) => key));
  for (const { key } of game.subsystems) if (!manifest.subsystems.some((binding) => binding.key === key)) throw new PwaLauncherError("PLATFORM_BINDING_MISSING");
  for (const { key } of manifest.subsystems) if (!gameKeys.has(key)) throw new PwaLauncherError("PLATFORM_BINDING_UNDECLARED");
  const executableSources = await Promise.all(value.executables.map(async (candidate) => {
    const entry = exact(candidate, ["logicalModule", "mime", "body"], "PWA executable");
    if (typeof entry.logicalModule !== "string" || (entry.mime !== "text/javascript" && entry.mime !== "application/javascript") || !(entry.body instanceof Blob)) throw new TypeError("Invalid PWA executable");
    return { logicalModule: entry.logicalModule, mime: entry.mime, source: await entry.body.text(), bytes: new Uint8Array(await entry.body.arrayBuffer()) };
  }));
  const contentBodies = await Promise.all(value.content.map(async (candidate) => {
    const entry = exact(candidate, ["kind", "namespace", "key", "mime", "body"], "PWA content entry");
    if ((entry.kind !== "record" && entry.kind !== "group" && entry.kind !== "resource") || typeof entry.mime !== "string") throw new TypeError("Invalid PWA content entry");
    const namespace = segment(entry.namespace);
    const key = String(entry.key).split("/").map(segment).join("/");
    if (entry.kind !== "resource" && key.includes("/")) throw new TypeError("Invalid PWA content key");
    if (!(entry.body instanceof Blob)) throw new TypeError("Invalid PWA content body");
    const bytes = new Uint8Array(await entry.body.arrayBuffer());
    return { kind: entry.kind, namespace, key, mime: entry.mime, bytes } as const;
  }));
  const gameBytes = encoder.encode(value.gameEntryText);
  const manifestBytes = encoder.encode(value.launchManifestText);
  const requiredBytes = gameBytes.byteLength + manifestBytes.byteLength + contentBodies.reduce((total, item) => total + item.bytes.byteLength, 0) + executableSources.reduce((total, item) => total + item.bytes.byteLength, 0);
  const storage = await inspectInstallationStorage(requiredBytes);
  if (signal?.aborted) throw signal.reason;
  const rootId = installationId;
  const placeholder: StoredObjectRef = Object.freeze({ contentVersion: `sha256:${"0".repeat(64)}`, size: 0, mime: "application/octet-stream" });
  const staging: PwaInstallationRecord = Object.freeze({ installationId, generation, state: "staging", rootId, createdAt: Date.now(), gameEntryText: value.gameEntryText, launchManifestText: value.launchManifestText, gameEntry: placeholder, launchManifest: placeholder, contentIndex: Object.freeze([]), executableIndex: Object.freeze([]), persistence: storage.persistence });
  await putInstallation(staging);
  try {
    const gameEntry = await storeObject(rootId, gameBytes, "application/json; charset=utf-8");
    const launchManifest = await storeObject(rootId, manifestBytes, "application/json; charset=utf-8");
    const contentIndex: StoredContentIndexEntry[] = [Object.freeze({ kind: "manifest", ...gameEntry })];
    for (const entry of contentBodies) contentIndex.push(Object.freeze({ kind: entry.kind, namespace: entry.namespace, key: entry.key, ...await storeObject(rootId, entry.bytes, entry.mime) }));
    const modules = [];
    const storedExecutable = new Map<string, StoredObjectRef>();
    for (const entry of executableSources) {
      const stored = await storeObject(rootId, entry.bytes, entry.mime);
      storedExecutable.set(entry.logicalModule, stored);
      modules.push({ logicalModule: entry.logicalModule, source: entry.source, contentVersion: stored.contentVersion });
    }
    const graph = buildPwaExecutableIndexV1(modules);
    const executableIndex = graph.map((entry) => Object.freeze({ ...entry, ...storedExecutable.get(entry.logicalModule)! }));
    for (const binding of manifest.subsystems) if (!executableIndex.some(({ logicalModule }) => logicalModule === binding.module)) throw new TypeError("Missing PWA subsystem executable");
    const complete: PwaInstallationRecord = Object.freeze({ ...staging, state: "complete", gameEntry, launchManifest, contentIndex: Object.freeze(contentIndex), executableIndex: Object.freeze(executableIndex) });
    await publishInstallation(complete);
    return complete;
  } catch (cause) {
    await putInstallation(Object.freeze({ ...staging, state: "invalid" }));
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

export async function collectStagingOrphans(): Promise<number> {
  let count = 0;
  for (const installation of await listInstallations()) {
    if (installation.state !== "staging") continue;
    await removeInstallationRecord(installation.installationId);
    await removeInstallationObjects(installation.rootId);
    count += 1;
  }
  return count;
}

export async function uninstallPwaInstallation(installationId: string): Promise<void> {
  const removed = await removeInstallationRecord(installationId);
  if (removed !== null) await removeInstallationObjects(removed.rootId);
}
