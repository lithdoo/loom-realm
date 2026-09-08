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
import { scanFsdb } from "./scanner.js";
import type { FsdbMetadataName, FsdbTableKind } from "./model.js";

declare const fsdbDatabaseBrand: unique symbol;

export interface OpenFsdbOptions { readonly root: string; }
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

export async function openFsdb(options: OpenFsdbOptions): Promise<FsdbDatabase> {
  if (options === null || typeof options !== "object" || Array.isArray(options) || typeof options.root !== "string") {
    throw new TypeError("Invalid options");
  }
  return createDatabaseHandle(new DatabaseImpl(await scanFsdb(options.root))) as FsdbDatabase;
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

export type {
  FsdbDatabaseState, FsdbEntryDescriptor, FsdbMetadataName,
  FsdbObjectDescriptor, FsdbObjectIdentity, FsdbReadLease, FsdbTableKind,
};
