import { parseGameEntryV1 } from "@loomrealm/game-package";
import {
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

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`).join(",")}}`;
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

export async function installPwaBundle(bundle: PwaInstallationBundleV1): Promise<PwaInstallationRecord> {
  const value = exact(bundle, ["formatVersion", "installationId", "gameEntry", "launchManifest", "presentation", "content", "executables"], "PWA installation bundle");
  if (value.formatVersion !== 1 || typeof value.gameEntry !== "string" || typeof value.launchManifest !== "string" || !Array.isArray(value.content) || !Array.isArray(value.executables)) throw new TypeError("Invalid PWA installation bundle");
  const installationId = segment(value.installationId);
  const game = parseGameEntryV1(value.gameEntry);
  const manifest = parsePwaLaunchManifestV1(value.launchManifest);
  const gameKeys = new Set(game.subsystems.map(({ key }) => key));
  if (manifest.subsystems.length !== gameKeys.size || manifest.subsystems.some(({ key }) => !gameKeys.has(key))) throw new TypeError("PWA installation key-set mismatch");
  const executableSources = value.executables.map((candidate) => {
    const entry = exact(candidate, ["logicalModule", "source"], "PWA executable");
    if (typeof entry.logicalModule !== "string" || typeof entry.source !== "string") throw new TypeError("Invalid PWA executable");
    return { logicalModule: entry.logicalModule, source: entry.source };
  });
  const contentBodies = value.content.map((candidate) => {
    const entry = exact(candidate, ["kind", "namespace", "key", "mime", "body"], "PWA content entry");
    if ((entry.kind !== "record" && entry.kind !== "group" && entry.kind !== "resource") || typeof entry.mime !== "string") throw new TypeError("Invalid PWA content entry");
    const namespace = segment(entry.namespace);
    const key = String(entry.key).split("/").map(segment).join("/");
    if (entry.kind !== "resource" && key.includes("/")) throw new TypeError("Invalid PWA content key");
    const bytes = typeof entry.body === "string" ? encoder.encode(entry.body) : entry.body instanceof Uint8Array ? Uint8Array.from(entry.body) : null;
    if (bytes === null) throw new TypeError("Invalid PWA content body");
    return { kind: entry.kind, namespace, key, mime: entry.mime, bytes } as const;
  });
  const gameBytes = encoder.encode(stableJson(game));
  const manifestBytes = encoder.encode(value.launchManifest);
  const presentationBytes = encoder.encode(stableJson(value.presentation));
  const executableBytes = executableSources.map((entry) => ({ ...entry, bytes: encoder.encode(entry.source) }));
  const requiredBytes = gameBytes.byteLength + manifestBytes.byteLength + presentationBytes.byteLength + contentBodies.reduce((total, item) => total + item.bytes.byteLength, 0) + executableBytes.reduce((total, item) => total + item.bytes.byteLength, 0);
  const storage = await inspectInstallationStorage(requiredBytes);
  const rootId = `${installationId}-${crypto.randomUUID()}`;
  const placeholder: StoredObjectRef = Object.freeze({ contentVersion: `sha256:${"0".repeat(64)}`, size: 0, mime: "application/octet-stream" });
  const staging: PwaInstallationRecord = Object.freeze({ installationId, state: "staging", rootId, createdAt: Date.now(), gameEntry: placeholder, launchManifest: placeholder, presentation: placeholder, contentIndex: Object.freeze([]), executableIndex: Object.freeze([]), persistence: storage.persistence });
  const prior = await removeInstallationRecord(installationId);
  if (prior !== null) await removeInstallationObjects(prior.rootId);
  await putInstallation(staging);
  try {
    const gameEntry = await storeObject(rootId, gameBytes, "application/json; charset=utf-8");
    const launchManifest = await storeObject(rootId, manifestBytes, "application/json; charset=utf-8");
    const presentation = await storeObject(rootId, presentationBytes, "application/json; charset=utf-8");
    const contentIndex: StoredContentIndexEntry[] = [Object.freeze({ kind: "manifest", ...gameEntry })];
    for (const entry of contentBodies) contentIndex.push(Object.freeze({ kind: entry.kind, namespace: entry.namespace, key: entry.key, ...await storeObject(rootId, entry.bytes, entry.mime) }));
    const modules = [];
    const storedExecutable = new Map<string, StoredObjectRef>();
    for (const entry of executableBytes) {
      const stored = await storeObject(rootId, entry.bytes, "text/javascript; charset=utf-8");
      storedExecutable.set(entry.logicalModule, stored);
      modules.push({ logicalModule: entry.logicalModule, source: entry.source, contentVersion: stored.contentVersion });
    }
    const graph = buildPwaExecutableIndexV1(modules);
    const executableIndex = graph.map((entry) => Object.freeze({ ...entry, ...storedExecutable.get(entry.logicalModule)! }));
    for (const binding of manifest.subsystems) if (!executableIndex.some(({ logicalModule }) => logicalModule === binding.module)) throw new TypeError("Missing PWA subsystem executable");
    const complete: PwaInstallationRecord = Object.freeze({ installationId, state: "complete", rootId, createdAt: staging.createdAt, gameEntry, launchManifest, presentation, contentIndex: Object.freeze(contentIndex), executableIndex: Object.freeze(executableIndex), persistence: storage.persistence });
    await publishInstallation(complete);
    return complete;
  } catch (cause) {
    await putInstallation(Object.freeze({ ...staging, state: "invalid" }));
    throw cause;
  }
}

export async function ensurePwaBundle(bundle: PwaInstallationBundleV1): Promise<PwaInstallationRecord> {
  const existing = await getInstallation(bundle.installationId);
  if (existing?.state === "complete") return existing;
  return installPwaBundle(bundle);
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
