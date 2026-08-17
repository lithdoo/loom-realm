import { createHash, randomBytes } from "node:crypto";
import { isAbsolute, resolve, sep } from "node:path";
import { open, lstat, readdir, realpath } from "node:fs/promises";
import type { BigIntStats } from "node:fs";
import { canonicalName, resourceExtension } from "./names.js";
import { JSONL_TYPE, JSON_TYPE, MARKDOWN_TYPE, SCHEMA_TYPE, resourceMime } from "./mime.js";
import { tableId, type FileEntry, type Fingerprint, type MetadataName, type Snapshot, type TableIndex, type TableKind } from "./model.js";

const TABLE = /^\[(struct|extend|group|resource)\](.*)$/;
const PATH_SEPARATOR = Buffer.from(sep);

function childPath(parent: Buffer, name: Buffer | string): Buffer {
  return Buffer.concat([parent, PATH_SEPARATOR, typeof name === "string" ? Buffer.from(name) : name]);
}

function baseName(path: Buffer): Buffer {
  const index = path.lastIndexOf(PATH_SEPARATOR[0]!);
  return index < 0 ? path : path.subarray(index + 1);
}

function startsWithAscii(name: Buffer, prefix: string): boolean {
  const bytes = Buffer.from(prefix);
  return name.length >= bytes.length && name.subarray(0, bytes.length).equals(bytes);
}

function endsWithAscii(name: Buffer, suffix: string): boolean {
  const bytes = Buffer.from(suffix);
  return name.length >= bytes.length && name.subarray(name.length - bytes.length).equals(bytes);
}

function decodePhysicalName(bytes: Buffer): string {
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

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

function parseJson(bytes: Buffer): unknown {
  return JSON.parse(decodeUtf8(bytes));
}

function validateJsonObject(bytes: Buffer): void {
  assertObject(parseJson(bytes));
}

function validateInfoMeta(bytes: Buffer): void {
  const schema = parseJson(bytes);
  if (typeof schema !== "boolean") assertObject(schema);
}

function validateJsonl(bytes: Buffer, extendMetadata = false): void {
  const text = decodeUtf8(bytes);
  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === "") continue;
    const record: unknown = JSON.parse(line);
    assertObject(record);
    if (extendMetadata) {
      const value = record as Record<string, unknown>;
      if (typeof value.field !== "string" || typeof value.struct !== "string") throw new Error("Invalid .extend.meta record");
      if (value.desc !== undefined && typeof value.desc !== "string") throw new Error("Invalid .extend.meta desc");
      if (canonicalName(value.struct) !== value.struct) throw new Error("Invalid .extend.meta struct name");
    }
  }
}

async function scanFile(path: Buffer, contentType: string, validation: "json-object" | "info-meta" | "jsonl" | "extend-meta" | "text" | "opaque"): Promise<FileEntry> {
  const before = await lstat(path, { bigint: true });
  if (!before.isFile() || before.isSymbolicLink()) throw new Error("Recognized FSDB object is not a regular file");
  const handle = await open(path, "r");
  try {
    const stat = await handle.stat({ bigint: true });
    if (!stat.isFile()) throw new Error("Recognized FSDB object is not a regular file");
    const fp = fingerprint(stat);
    if (!sameFingerprint(fingerprint(before), fp)) throw new Error("FSDB changed while opening");
    if (validation !== "opaque") {
      const bytes = await handle.readFile();
      if (validation === "json-object") validateJsonObject(bytes);
      else if (validation === "info-meta") validateInfoMeta(bytes);
      else if (validation === "jsonl") validateJsonl(bytes);
      else if (validation === "extend-meta") validateJsonl(bytes, true);
      else decodeUtf8(bytes);
    }
    return { type: "file", path: Buffer.from(path), contentType, length: stat.size, fingerprint: fp, fingerprintText: fingerprintText(fp) };
  } finally {
    await handle.close();
  }
}

async function metadata(tablePath: Buffer, kind: TableKind): Promise<Map<MetadataName, FileEntry>> {
  const result = new Map<MetadataName, FileEntry>();
  const specs: Array<[string, MetadataName, boolean, string, "info-meta" | "extend-meta" | "text"]> = [];
  if (kind !== "resource") specs.push([".info.meta", "$info", true, SCHEMA_TYPE, "info-meta"]);
  if (kind === "extend" || kind === "group") specs.push([".extend.meta", "$extend", kind === "extend", JSONL_TYPE, "extend-meta"]);
  specs.push([".desc.meta", "$desc", kind === "group" || kind === "resource", MARKDOWN_TYPE, "text"]);
  for (const [physical, logical, required, contentType, validation] of specs) {
    const path = childPath(tablePath, physical);
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

async function scanResourceDirectory(path: Buffer, segments: readonly string[], entries: Map<string, FileEntry>, directories: Set<string>): Promise<void> {
  for (const item of await readdir(path, { withFileTypes: true, encoding: "buffer" })) {
    if (item.name[0] === 0x2e) continue;
    const physicalName = decodePhysicalName(item.name);
    const physical = childPath(path, item.name);
    const stat = await lstat(physical);
    if (stat.isSymbolicLink()) throw new Error("Resource indirection is forbidden");
    if (stat.isDirectory()) {
      const segment = canonicalName(physicalName);
      const logicalDirectory = [...segments, segment].join("/");
      if (directories.has(logicalDirectory)) throw new Error("Duplicate logical resource directory");
      directories.add(logicalDirectory);
      await scanResourceDirectory(physical, [...segments, segment], entries, directories);
    } else if (stat.isFile()) {
      const { leaf, extension } = resourceExtension(physicalName);
      const key = [...segments, leaf].join("/");
      if (entries.has(key)) throw new Error("Duplicate ResourceKey");
      entries.set(key, await scanFile(physical, resourceMime(extension), "opaque"));
    } else {
      throw new Error("Invalid resource object type");
    }
  }
}

async function scanTable(path: Buffer, kind: TableKind, name: string): Promise<TableIndex> {
  const entries = new Map<string, FileEntry>();
  const meta = await metadata(path, kind);
  if (kind === "resource") {
    await scanResourceDirectory(path, [], entries, new Set());
  } else {
    const suffix = kind === "group" ? ".jsonl" : ".json";
    for (const item of await readdir(path, { withFileTypes: true, encoding: "buffer" })) {
      if (item.name[0] === 0x2e || !endsWithAscii(item.name, suffix)) continue;
      const physicalName = decodePhysicalName(item.name);
      const physical = childPath(path, item.name);
      const stat = await lstat(physical);
      if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("Data candidate must be a regular file");
      const key = canonicalName(physicalName.slice(0, -suffix.length));
      if (entries.has(key)) throw new Error("Duplicate logical key");
      entries.set(key, await scanFile(physical, kind === "group" ? JSONL_TYPE : JSON_TYPE, kind === "group" ? "jsonl" : "json-object"));
    }
  }
  return { kind, name, entries, metadata: meta };
}

export async function scanFsdb(rootInput: string): Promise<Snapshot> {
  if (typeof rootInput !== "string" || rootInput.length === 0) throw new Error("root is required");
  const supplied = isAbsolute(rootInput) ? rootInput : resolve(process.cwd(), rootInput);
  const root = await realpath(supplied, { encoding: "buffer" });
  const rootStat = await lstat(root);
  if (!rootStat.isDirectory()) throw new Error("FSDB root must be a directory");
  const rootName = decodePhysicalName(baseName(root));
  if (!rootName.startsWith("[FSDB]")) throw new Error("Invalid FSDB root name");
  const name = canonicalName(rootName.slice(6));
  const tables = new Map<string, TableIndex>();
  for (const item of await readdir(root, { withFileTypes: true, encoding: "buffer" })) {
    if (!startsWithAscii(item.name, "[struct]") && !startsWithAscii(item.name, "[extend]") && !startsWithAscii(item.name, "[group]") && !startsWithAscii(item.name, "[resource]")) continue;
    const physicalName = decodePhysicalName(item.name);
    const match = TABLE.exec(physicalName);
    if (!match) continue;
    const kind = match[1] as TableKind;
    const tableName = canonicalName(match[2]!);
    const path = childPath(root, item.name);
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
