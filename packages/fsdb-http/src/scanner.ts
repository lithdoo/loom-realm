import { createHash, randomBytes } from "node:crypto";
import { basename, isAbsolute, join, resolve } from "node:path";
import { open, lstat, readdir, realpath } from "node:fs/promises";
import type { BigIntStats } from "node:fs";
import { canonicalName, resourceExtension } from "./names.js";
import { JSONL_TYPE, JSON_TYPE, MARKDOWN_TYPE, SCHEMA_TYPE, resourceMime } from "./mime.js";
import { tableId, type FileEntry, type Fingerprint, type MetadataName, type Snapshot, type TableIndex, type TableKind } from "./model.js";

const TABLE = /^\[(struct|extend|group|resource)\](.*)$/;

function fingerprint(stat: BigIntStats): Fingerprint {
  return { dev: stat.dev, ino: stat.ino, mode: stat.mode, size: stat.size, mtimeNs: stat.mtimeNs, ctimeNs: stat.ctimeNs };
}

function fingerprintText(fp: Fingerprint): string {
  return createHash("sha256").update(`${fp.dev}:${fp.ino}:${fp.mode}:${fp.size}:${fp.mtimeNs}:${fp.ctimeNs}`).digest("base64url").slice(0, 22);
}

function sameFingerprint(a: Fingerprint, b: Fingerprint): boolean {
  return a.dev === b.dev && a.ino === b.ino && a.mode === b.mode && a.size === b.size && a.mtimeNs === b.mtimeNs && a.ctimeNs === b.ctimeNs;
}

export { fingerprint, fingerprintText, sameFingerprint };

function decodeUtf8(bytes: Buffer): string {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) throw new Error("UTF-8 BOM is forbidden");
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

function assertObject(value: unknown): void {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("JSON record must be an object");
}

function validateJson(bytes: Buffer, requireObject: boolean): void {
  const value: unknown = JSON.parse(decodeUtf8(bytes));
  if (requireObject) assertObject(value);
}

function validateJsonl(bytes: Buffer): void {
  const text = decodeUtf8(bytes);
  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === "") continue;
    assertObject(JSON.parse(line));
  }
}

async function scanFile(path: string, contentType: string, validation: "json-object" | "json" | "jsonl" | "jsonl-record" | "text" | "opaque"): Promise<FileEntry> {
  const before = await lstat(path, { bigint: true });
  if (!before.isFile() || before.isSymbolicLink()) throw new Error("Recognized FSDB object is not a regular file");
  const handle = await open(path, "r");
  try {
    const stat = await handle.stat({ bigint: true });
    if (!stat.isFile()) throw new Error("Recognized FSDB object is not a regular file");
    const fp = fingerprint(stat);
    if (!sameFingerprint(fingerprint(before), fp)) throw new Error("FSDB changed while opening");
    if (stat.size > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("FSDB file is too large");
    if (validation !== "opaque") {
      const bytes = await handle.readFile();
      if (validation === "json-object") validateJson(bytes, true);
      else if (validation === "json") validateJson(bytes, false);
      else if (validation === "jsonl" || validation === "jsonl-record") validateJsonl(bytes);
      else decodeUtf8(bytes);
    }
    return { type: "file", path, contentType, length: Number(stat.size), fingerprint: fp, fingerprintText: fingerprintText(fp) };
  } finally {
    await handle.close();
  }
}

async function metadata(tablePath: string, kind: TableKind): Promise<Map<MetadataName, FileEntry>> {
  const result = new Map<MetadataName, FileEntry>();
  const specs: Array<[string, MetadataName, boolean, string, "json" | "jsonl-record" | "text"]> = [];
  if (kind !== "resource") specs.push([".info.meta", "$info", true, SCHEMA_TYPE, "json"]);
  if (kind === "extend" || kind === "group") specs.push([".extend.meta", "$extend", kind === "extend", JSONL_TYPE, "jsonl-record"]);
  specs.push([".desc.meta", "$desc", kind === "group" || kind === "resource", MARKDOWN_TYPE, "text"]);
  for (const [physical, logical, required, contentType, validation] of specs) {
    const path = join(tablePath, physical);
    try {
      result.set(logical, await scanFile(path, contentType, validation));
    } catch (error) {
      if (required) throw error;
      try {
        await lstat(path);
      } catch (statError) {
        if ((statError as NodeJS.ErrnoException).code === "ENOENT") continue;
        throw statError;
      }
      throw error;
    }
  }
  return result;
}

async function scanResourceDirectory(path: string, segments: readonly string[], entries: Map<string, FileEntry>, directories: Set<string>): Promise<void> {
  for (const item of await readdir(path, { withFileTypes: true })) {
    if (item.name.startsWith(".")) continue;
    const physical = join(path, item.name);
    const stat = await lstat(physical);
    if (stat.isSymbolicLink()) throw new Error("Resource indirection is forbidden");
    if (stat.isDirectory()) {
      const segment = canonicalName(item.name);
      const logicalDirectory = [...segments, segment].join("/");
      if (directories.has(logicalDirectory)) throw new Error("Duplicate logical resource directory");
      directories.add(logicalDirectory);
      await scanResourceDirectory(physical, [...segments, segment], entries, directories);
    } else if (stat.isFile()) {
      const { leaf, extension } = resourceExtension(item.name);
      const key = [...segments, leaf].join("/");
      if (entries.has(key)) throw new Error("Duplicate ResourceKey");
      entries.set(key, await scanFile(physical, resourceMime(extension), "opaque"));
    } else {
      throw new Error("Invalid resource object type");
    }
  }
}

async function scanTable(path: string, kind: TableKind, name: string): Promise<TableIndex> {
  const entries = new Map<string, FileEntry>();
  const meta = await metadata(path, kind);
  if (kind === "resource") {
    await scanResourceDirectory(path, [], entries, new Set());
  } else {
    const suffix = kind === "group" ? ".jsonl" : ".json";
    for (const item of await readdir(path, { withFileTypes: true })) {
      if (item.name.startsWith(".") || !item.name.endsWith(suffix)) continue;
      const physical = join(path, item.name);
      const stat = await lstat(physical);
      if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("Data candidate must be a regular file");
      const key = canonicalName(item.name.slice(0, -suffix.length));
      if (entries.has(key)) throw new Error("Duplicate logical key");
      entries.set(key, await scanFile(physical, kind === "group" ? JSONL_TYPE : JSON_TYPE, kind === "group" ? "jsonl" : "json-object"));
    }
  }
  return { kind, name, entries, metadata: meta };
}

export async function scanFsdb(rootInput: string): Promise<Snapshot> {
  if (typeof rootInput !== "string" || rootInput.length === 0) throw new Error("root is required");
  const supplied = isAbsolute(rootInput) ? rootInput : resolve(process.cwd(), rootInput);
  const root = await realpath(supplied);
  const rootStat = await lstat(root);
  if (!rootStat.isDirectory()) throw new Error("FSDB root must be a directory");
  const rootName = basename(root);
  if (!rootName.startsWith("[FSDB]")) throw new Error("Invalid FSDB root name");
  const name = canonicalName(rootName.slice(6));
  const tables = new Map<string, TableIndex>();
  for (const item of await readdir(root, { withFileTypes: true })) {
    const match = TABLE.exec(item.name);
    if (!match) continue;
    const kind = match[1] as TableKind;
    const tableName = canonicalName(match[2]!);
    const path = join(root, item.name);
    const stat = await lstat(path);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("Table candidate must be a real directory");
    const id = tableId(kind, tableName);
    if (tables.has(id)) throw new Error("Duplicate table identity");
    tables.set(id, await scanTable(path, kind, tableName));
  }
  const tableList = [...tables.values()].sort((a, b) => (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : codePointCompare(a.name, b.name))).map(({ kind, name: tableName }) => ({ kind, name: tableName }));
  const descriptor = Buffer.from(JSON.stringify({ name, tables: tableList }), "utf8");
  return { name, root, snapshotId: randomBytes(16).toString("base64url"), tables, descriptor };
}

function codePointCompare(a: string, b: string): number {
  const aa = [...a]; const bb = [...b];
  for (let i = 0; i < Math.min(aa.length, bb.length); i++) {
    const difference = aa[i]!.codePointAt(0)! - bb[i]!.codePointAt(0)!;
    if (difference !== 0) return difference;
  }
  return aa.length - bb.length;
}
