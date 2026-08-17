import type { FileHandle } from "node:fs/promises";

export type TableKind = "struct" | "extend" | "group" | "resource";
export type MetadataName = "$info" | "$extend" | "$desc";

export interface Fingerprint {
  readonly dev: bigint;
  readonly ino: bigint;
  readonly mode: bigint;
  readonly size: bigint;
  readonly mtimeNs: bigint;
  readonly ctimeNs: bigint;
}

export interface FileEntry {
  readonly type: "file";
  readonly path: Buffer;
  readonly contentType: string;
  readonly length: bigint;
  readonly fingerprint: Fingerprint;
  readonly fingerprintText: string;
}

export interface TableIndex {
  readonly kind: TableKind;
  readonly name: string;
  readonly entries: ReadonlyMap<string, FileEntry>;
  readonly metadata: ReadonlyMap<MetadataName, FileEntry>;
}

export interface Snapshot {
  readonly name: string;
  readonly root: Buffer;
  readonly snapshotId: string;
  readonly tables: ReadonlyMap<string, TableIndex>;
  readonly descriptor: Buffer;
}

export interface ValidatedFile {
  readonly handle: FileHandle;
  readonly entry: FileEntry;
}

export function tableId(kind: TableKind, name: string): string {
  return `${kind}\0${name}`;
}
