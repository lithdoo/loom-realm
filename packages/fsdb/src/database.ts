import { constants } from "node:fs";
import { lstat, open, type FileHandle } from "node:fs/promises";
import { platform } from "node:os";
import type { Readable } from "node:stream";
import { canonicalName } from "./names.js";
import { fingerprint, sameFingerprint } from "./scanner.js";
import {
  tableId,
  type FileEntry,
  type FsdbMetadataName,
  type FsdbTableKind,
  type Snapshot,
} from "./model.js";

export type FsdbDatabaseState = "open" | "stale" | "closed";

export type FsdbObjectIdentity =
  | { readonly type: "entry"; readonly kind: FsdbTableKind; readonly table: string; readonly key: string }
  | { readonly type: "metadata"; readonly kind: FsdbTableKind; readonly table: string; readonly metadata: FsdbMetadataName };

export interface FsdbObjectDescriptor {
  readonly identity: FsdbObjectIdentity;
  readonly contentType: string;
  readonly length: bigint;
  readonly sourceTag: string;
}

export interface FsdbEntryDescriptor {
  readonly identity: Extract<FsdbObjectIdentity, { readonly type: "entry" }>;
  readonly contentType: string;
  readonly length: bigint;
}

export interface FsdbReadLease {
  readonly descriptor: FsdbObjectDescriptor;
  readonly stream: Readable;
  close(): Promise<void>;
}

export class SourceUnavailableError extends Error {
  constructor() {
    super("FSDB source is unavailable");
    this.name = "SourceUnavailableError";
  }
}

export class DatabaseImpl {
  #state: FsdbDatabaseState = "open";
  #leases = 0;
  #drain: Promise<void> | undefined;
  #resolveDrain: (() => void) | undefined;

  constructor(readonly snapshot: Snapshot) {}
  get name(): string { return this.snapshot.name; }
  get state(): FsdbDatabaseState { return this.#state; }

  markStale(): void { if (this.#state === "open") this.#state = "stale"; }

  acquire(): (() => void) | undefined {
    if (this.#state !== "open") return undefined;
    this.#leases++;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.#leases--;
      if (this.#leases === 0) this.#resolveDrain?.();
    };
  }

  close(): Promise<void> {
    this.#state = "closed";
    if (this.#leases === 0) return Promise.resolve();
    this.#drain ??= new Promise<void>((resolve) => { this.#resolveDrain = resolve; });
    return this.#drain;
  }

  async openValidated(entry: FileEntry): Promise<{ handle: FileHandle; release: () => void }> {
    const release = this.acquire();
    if (!release) throw new SourceUnavailableError();
    let handle: FileHandle | undefined;
    try {
      const pathStat = await lstat(entry.path, { bigint: true });
      if (!pathStat.isFile() || pathStat.isSymbolicLink()) throw new SourceUnavailableError();
      const flags = platform() === "win32" ? constants.O_RDONLY : constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0);
      handle = await open(entry.path, flags);
      const handleStat = await handle.stat({ bigint: true });
      if (!handleStat.isFile() || !sameFingerprint(entry.fingerprint, fingerprint(handleStat))) throw new SourceUnavailableError();
      return { handle, release };
    } catch (error) {
      await handle?.close().catch(() => undefined);
      release();
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "EMFILE" || code === "ENFILE" || code === "ENOMEM") throw error;
      this.markStale();
      throw error instanceof SourceUnavailableError ? error : new SourceUnavailableError();
    }
  }
}

const databases = new WeakMap<object, DatabaseImpl>();

export function createDatabaseHandle(db: DatabaseImpl): object {
  const handle = Object.create(null, {
    name: { enumerable: true, get: () => db.name },
    state: { enumerable: true, get: () => db.state },
    close: { enumerable: true, value: () => db.close() },
  }) as object;
  databases.set(handle, db);
  return Object.freeze(handle);
}

export function asDatabase(value: unknown): DatabaseImpl {
  if ((typeof value !== "object" && typeof value !== "function") || value === null) {
    throw new TypeError("Invalid FsdbDatabase handle");
  }
  const db = databases.get(value);
  if (!db) throw new TypeError("Invalid FsdbDatabase handle");
  return db;
}

const KINDS = new Set<FsdbTableKind>(["struct", "extend", "group", "resource"]);
const METADATA = new Set<FsdbMetadataName>(["$info", "$extend", "$desc"]);

function segment(value: unknown): value is string {
  if (typeof value !== "string" || value.includes("/")) return false;
  try { return canonicalName(value) === value; } catch { return false; }
}

function resourceKey(value: unknown): value is string {
  return typeof value === "string" && value.split("/").every(segment);
}

export function validateIdentity(value: unknown): FsdbObjectIdentity {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new TypeError("Invalid FSDB object identity");
  const object = value as Record<string, unknown>;
  if (!KINDS.has(object.kind as FsdbTableKind) || !segment(object.table)) throw new TypeError("Invalid FSDB object identity");
  if (object.type === "entry") {
    if (Object.keys(object).length !== 4 || !Object.hasOwn(object, "key")) throw new TypeError("Invalid FSDB object identity");
    if (object.kind === "resource" ? !resourceKey(object.key) : !segment(object.key)) throw new TypeError("Invalid FSDB object identity");
    return object as FsdbObjectIdentity;
  }
  if (object.type === "metadata") {
    if (Object.keys(object).length !== 4 || !METADATA.has(object.metadata as FsdbMetadataName)) throw new TypeError("Invalid FSDB object identity");
    return object as FsdbObjectIdentity;
  }
  throw new TypeError("Invalid FSDB object identity");
}

export function lookup(db: DatabaseImpl, identity: FsdbObjectIdentity): FileEntry | undefined {
  const table = db.snapshot.tables.get(tableId(identity.kind, identity.table));
  return identity.type === "entry" ? table?.entries.get(identity.key) : table?.metadata.get(identity.metadata);
}

export function freezeIdentity(identity: FsdbObjectIdentity): FsdbObjectIdentity {
  return Object.freeze(identity.type === "entry"
    ? { type: "entry", kind: identity.kind, table: identity.table, key: identity.key }
    : { type: "metadata", kind: identity.kind, table: identity.table, metadata: identity.metadata });
}
