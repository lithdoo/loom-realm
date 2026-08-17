import { constants } from "node:fs";
import { lstat, open, type FileHandle } from "node:fs/promises";
import { platform } from "node:os";
import { fingerprint, sameFingerprint } from "./scanner.js";
import type { FileEntry, Snapshot } from "./model.js";

export type InternalState = "open" | "stale" | "closed";

export class SourceUnavailableError extends Error {}

export class DatabaseImpl {
  readonly snapshot: Snapshot;
  #state: InternalState = "open";
  #leases = 0;
  #drain: Promise<void> | undefined;
  #resolveDrain: (() => void) | undefined;

  constructor(snapshot: Snapshot) {
    this.snapshot = snapshot;
  }

  get name(): string { return this.snapshot.name; }
  get state(): InternalState { return this.#state; }

  markStale(): void {
    if (this.#state === "open") this.#state = "stale";
  }

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
    if (this.#state !== "closed") this.#state = "closed";
    if (this.#leases === 0) return Promise.resolve();
    if (!this.#drain) {
      this.#drain = new Promise<void>((resolve) => { this.#resolveDrain = resolve; });
    }
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
      if (error instanceof SourceUnavailableError) throw error;
      throw new SourceUnavailableError();
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
    throw new Error("Invalid FsdbDatabase handle");
  }
  const db = databases.get(value);
  if (!db) throw new Error("Invalid FsdbDatabase handle");
  return db;
}
