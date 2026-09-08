export type FsdbTableKind = "struct" | "extend" | "group" | "resource";
export type FsdbMetadataName = "$info" | "$extend" | "$desc";

export interface Fingerprint {
  readonly dev: bigint;
  readonly ino: bigint;
  readonly mode: bigint;
  readonly size: bigint;
  readonly mtimeNs: bigint;
  readonly ctimeNs: bigint;
}

export interface FileEntry {
  readonly path: Buffer;
  readonly contentType: string;
  readonly length: bigint;
  readonly fingerprint: Fingerprint;
  readonly sourceTag: string;
}

export interface TableIndex {
  readonly kind: FsdbTableKind;
  readonly name: string;
  readonly entries: ReadonlyMap<string, FileEntry>;
  readonly metadata: ReadonlyMap<FsdbMetadataName, FileEntry>;
}

export interface Snapshot {
  readonly name: string;
  readonly snapshotId: string;
  readonly tables: ReadonlyMap<string, TableIndex>;
  readonly descriptor: Buffer;
}

export function tableId(kind: FsdbTableKind, name: string): string {
  return `${kind}\0${name}`;
}
