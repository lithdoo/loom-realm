import type { Readable } from "node:stream";
import {
  DatabaseImpl,
  asDatabase,
  createDatabaseHandle,
  freezeIdentity,
  lookup,
  validateIdentity,
  type FsdbDatabaseState,
  type FsdbEntryDescriptor,
  type FsdbObjectDescriptor,
  type FsdbObjectIdentity,
  type FsdbReadLease,
} from "./database.js";
import { FsdbResolutionError } from "./errors.js";
import { canonicalDatabasePath, canonicalName } from "./names.js";
import { discoverDatabasePaths, resolveContainerRoot, resolveDatabaseDirectory, scanFsdb } from "./scanner.js";
import type { FsdbMetadataName, FsdbTableKind } from "./model.js";

declare const fsdbDatabaseBrand: unique symbol;

export interface OpenFsdbOptions {
  /** Filesystem container root, not an individual FSDB directory. */
  readonly root: string;
  /** Required logical path to exactly one FSDB. */
  readonly path: string;
}

export interface ListFsdbPathsOptions {
  readonly root: string;
}
export interface FsdbDatabase {
  readonly [fsdbDatabaseBrand]: never;
  readonly name: string;
  readonly state: FsdbDatabaseState;
  close(): Promise<void>;
}

function abortError(): DOMException { return new DOMException("The operation was aborted", "AbortError"); }
function assertSignal(signal: unknown): asserts signal is AbortSignal {
  if (signal === null || typeof signal !== "object" || typeof (signal as AbortSignal).aborted !== "boolean" ||
      typeof (signal as AbortSignal).addEventListener !== "function") throw new TypeError("Invalid AbortSignal");
}

function wrapScan(error: unknown): never {
  if (error instanceof FsdbResolutionError) throw error;
  const code = (error as NodeJS.ErrnoException).code;
  if (code === "EMFILE" || code === "ENFILE" || code === "ENOMEM" || code === "EBUSY" || code === "EAGAIN") {
    throw new FsdbResolutionError("DATABASE_UNAVAILABLE", "Database is temporarily unavailable");
  }
  if (error instanceof Error) throw new FsdbResolutionError("DATABASE_INVALID", error.message);
  throw error;
}

export async function listFsdbPaths(options: ListFsdbPathsOptions): Promise<readonly string[]> {
  if (options === null || typeof options !== "object" || Array.isArray(options) || typeof options.root !== "string") {
    throw new TypeError("Invalid options");
  }
  return discoverDatabasePaths(await resolveContainerRoot(options.root));
}

export async function openFsdb(options: OpenFsdbOptions): Promise<FsdbDatabase> {
  if (options === null || typeof options !== "object" || Array.isArray(options) || typeof options.root !== "string" || typeof options.path !== "string") {
    throw new TypeError("Invalid options");
  }
  try { canonicalDatabasePath(options.path); }
  catch { throw new FsdbResolutionError("DATABASE_PATH_INVALID", "Invalid database path"); }
  const container = await resolveContainerRoot(options.root);
  const directory = await resolveDatabaseDirectory(container, options.path);
  try {
    return createDatabaseHandle(new DatabaseImpl(await scanFsdb(directory))) as FsdbDatabase;
  } catch (error) {
    wrapScan(error);
  }
}

export function describeFsdb(db: FsdbDatabase): Uint8Array {
  return Uint8Array.from(asDatabase(db).snapshot.descriptor);
}

export function getFsdbSnapshotId(db: FsdbDatabase): string {
  return asDatabase(db).snapshot.snapshotId;
}

export function listFsdbEntries(db: FsdbDatabase): readonly FsdbEntryDescriptor[] {
  const core = asDatabase(db);
  const result: FsdbEntryDescriptor[] = [];
  for (const table of core.snapshot.tables.values()) {
    for (const [key, entry] of table.entries) {
      const identity = freezeIdentity({ type: "entry", kind: table.kind, table: table.name, key }) as Extract<FsdbObjectIdentity, { type: "entry" }>;
      result.push(Object.freeze({ identity, contentType: entry.contentType, length: entry.length }));
    }
  }
  return Object.freeze(result);
}

export async function openFsdbObject(
  db: FsdbDatabase,
  identityInput: FsdbObjectIdentity,
  signal: AbortSignal,
): Promise<FsdbReadLease | null> {
  const core = asDatabase(db);
  const identity = validateIdentity(identityInput);
  assertSignal(signal);
  if (signal.aborted) throw abortError();
  const entry = lookup(core, identity);
  if (!entry) return null;
  const opened = await core.openValidated(entry);
  if (signal.aborted) {
    await opened.handle.close().catch(() => undefined);
    opened.release();
    throw abortError();
  }
  const stream: Readable = opened.handle.createReadStream({ autoClose: false });
  stream.once("error", () => core.markStale());
  const descriptor: FsdbObjectDescriptor = Object.freeze({
    identity: freezeIdentity(identity), contentType: entry.contentType,
    length: entry.length, sourceTag: entry.sourceTag,
  });
  let closePromise: Promise<void> | undefined;
  const lease: FsdbReadLease = Object.freeze({
    descriptor,
    stream,
    close() {
      closePromise ??= (async () => {
        stream.destroy();
        await opened.handle.close().catch(() => undefined);
        opened.release();
      })();
      return closePromise;
    },
  });
  return lease;
}

export { canonicalDatabasePath, canonicalName };
export { FsdbResolutionError } from "./errors.js";
export type { FsdbResolutionCode } from "./errors.js";
export { SourceUnavailableError } from "./database.js";
export type {
  FsdbDatabaseState, FsdbEntryDescriptor, FsdbMetadataName,
  FsdbObjectDescriptor, FsdbObjectIdentity, FsdbReadLease, FsdbTableKind,
};
