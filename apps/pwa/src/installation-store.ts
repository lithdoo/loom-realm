import type { PwaExecutableIndexEntryV1 } from "@loomrealm/game-launcher-pwa";

export type PwaInstallationState = "staging" | "complete" | "invalid";

export interface StoredObjectRef {
  readonly contentVersion: string;
  readonly size: number;
  readonly mime: string;
}

export interface StoredContentIndexEntry extends StoredObjectRef {
  readonly kind: "manifest" | "record" | "group" | "resource";
  readonly namespace?: string;
  readonly key?: string;
}

export interface StoredExecutableIndexEntry extends PwaExecutableIndexEntryV1, StoredObjectRef {}

export interface PwaInstallationRecord {
  readonly installationId: string;
  readonly generation: string;
  readonly state: PwaInstallationState;
  readonly rootId: string;
  readonly createdAt: number;
  readonly gameEntryText: string;
  readonly launchManifestText: string;
  readonly gameEntry: StoredObjectRef;
  readonly launchManifest: StoredObjectRef;
  readonly contentIndex: readonly StoredContentIndexEntry[];
  readonly executableIndex: readonly StoredExecutableIndexEntry[];
  readonly persistence: "granted" | "denied" | "unavailable";
}

const DATABASE = "loomrealm-pwa-installations-v1";
const STORE = "installations";

function request<T>(value: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    value.addEventListener("success", () => resolve(value.result), { once: true });
    value.addEventListener("error", () => reject(value.error ?? new Error("IndexedDB request failed")), { once: true });
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.addEventListener("complete", () => resolve(), { once: true });
    transaction.addEventListener("abort", () => reject(transaction.error ?? new Error("IndexedDB transaction aborted")), { once: true });
    transaction.addEventListener("error", () => reject(transaction.error ?? new Error("IndexedDB transaction failed")), { once: true });
  });
}

async function database(): Promise<IDBDatabase> {
  const opened = indexedDB.open(DATABASE, 1);
  opened.addEventListener("upgradeneeded", () => {
    if (!opened.result.objectStoreNames.contains(STORE)) opened.result.createObjectStore(STORE, { keyPath: "installationId" });
  });
  return request(opened);
}

export async function getInstallation(installationId: string): Promise<PwaInstallationRecord | null> {
  const db = await database();
  try {
    const tx = db.transaction(STORE, "readonly");
    const value = await request(tx.objectStore(STORE).get(installationId)) as PwaInstallationRecord | undefined;
    await transactionDone(tx);
    return value ?? null;
  } finally { db.close(); }
}

export async function listInstallations(): Promise<readonly PwaInstallationRecord[]> {
  const db = await database();
  try {
    const tx = db.transaction(STORE, "readonly");
    const values = await request(tx.objectStore(STORE).getAll()) as PwaInstallationRecord[];
    await transactionDone(tx);
    return Object.freeze(values);
  } finally { db.close(); }
}

export async function putInstallation(record: PwaInstallationRecord): Promise<void> {
  const db = await database();
  try {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(record);
    await transactionDone(tx);
  } finally { db.close(); }
}

/** The single complete record write is the installation visibility commit. */
export async function publishInstallation(record: PwaInstallationRecord): Promise<void> {
  if (record.state !== "complete") throw new TypeError("Only complete installations can be published");
  const db = await database();
  try {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const current = await request(store.get(record.installationId)) as PwaInstallationRecord | undefined;
    if (current?.state !== "staging" || current.rootId !== record.rootId) {
      tx.abort();
      throw new Error("Installation staging ownership changed");
    }
    store.put(record);
    await transactionDone(tx);
  } finally { db.close(); }
}

export async function markInstallationInvalid(installationId: string): Promise<void> {
  const current = await getInstallation(installationId);
  if (current === null || current.state === "invalid") return;
  await putInstallation(Object.freeze({ ...current, state: "invalid" }));
}

export async function removeInstallationRecord(installationId: string): Promise<PwaInstallationRecord | null> {
  const db = await database();
  try {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const current = await request(store.get(installationId)) as PwaInstallationRecord | undefined;
    store.delete(installationId);
    await transactionDone(tx);
    return current ?? null;
  } finally { db.close(); }
}

async function storageRoot(): Promise<FileSystemDirectoryHandle> {
  const manager = navigator.storage as StorageManager & { getDirectory(): Promise<FileSystemDirectoryHandle> };
  if (typeof manager.getDirectory !== "function") throw new Error("OPFS unavailable");
  return manager.getDirectory();
}

async function installationDirectory(rootId: string, create: boolean): Promise<FileSystemDirectoryHandle> {
  const root = await storageRoot();
  const product = await root.getDirectoryHandle("loomrealm-pwa", { create });
  const installs = await product.getDirectoryHandle("installations", { create });
  return installs.getDirectoryHandle(rootId, { create });
}

function objectName(contentVersion: string): string {
  if (!/^sha256:[0-9a-f]{64}$/.test(contentVersion)) throw new TypeError("Invalid object identity");
  return contentVersion.replace(":", "-");
}

export async function writeInstallationObject(rootId: string, contentVersion: string, bytes: Uint8Array): Promise<void> {
  const directory = await installationDirectory(rootId, true);
  const objects = await directory.getDirectoryHandle("objects", { create: true });
  const file = await objects.getFileHandle(objectName(contentVersion), { create: true });
  const writer = await file.createWritable();
  try { await writer.write(bytes.slice().buffer as ArrayBuffer); await writer.close(); }
  catch (cause) { try { await writer.abort(); } catch {} throw cause; }
}

export async function readInstallationObject(rootId: string, contentVersion: string): Promise<Uint8Array> {
  const directory = await installationDirectory(rootId, false);
  const objects = await directory.getDirectoryHandle("objects", { create: false });
  const file = await objects.getFileHandle(objectName(contentVersion), { create: false });
  return new Uint8Array(await (await file.getFile()).arrayBuffer());
}

export async function removeInstallationObjects(rootId: string): Promise<void> {
  try {
    const root = await storageRoot();
    const product = await root.getDirectoryHandle("loomrealm-pwa", { create: false });
    const installs = await product.getDirectoryHandle("installations", { create: false });
    await installs.removeEntry(rootId, { recursive: true });
  } catch (cause) {
    if (!(cause instanceof DOMException) || cause.name !== "NotFoundError") throw cause;
  }
}
