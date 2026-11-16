import { createHash, randomBytes } from "node:crypto";
import { isAbsolute, resolve, sep } from "node:path";
import { open, lstat, readdir, realpath } from "node:fs/promises";
import type { BigIntStats } from "node:fs";
import { FsdbResolutionError } from "./errors.js";
import { canonicalDatabasePath, canonicalName, resourceExtension } from "./names.js";
import { JSONL_TYPE, JSON_TYPE, MARKDOWN_TYPE, SCHEMA_TYPE, resourceMime } from "./mime.js";
import { tableId, type FileEntry, type Fingerprint, type FsdbMetadataName, type Snapshot, type TableIndex, type FsdbTableKind } from "./model.js";

const TABLE_KINDS = ["struct", "extend", "group", "resource"] as const;
const PATH_SEPARATOR = Buffer.from(sep);

function childPath(parent: Buffer, name: Buffer | string): Buffer {
  return Buffer.concat([parent, PATH_SEPARATOR, typeof name === "string" ? Buffer.from(name) : name]);
}

function baseName(path: Buffer): Buffer {
  const index = path.lastIndexOf(PATH_SEPARATOR[0]!);
  return index < 0 ? path : path.subarray(index + 1);
}

function startsWithAsciiCaseInsensitive(name: Buffer, prefix: string): boolean {
  const bytes = Buffer.from(prefix, "ascii");
  if (name.length < bytes.length) return false;
  for (let index = 0; index < bytes.length; index++) {
    const actual = name[index]!;
    const expected = bytes[index]!;
    const foldedActual = actual >= 0x41 && actual <= 0x5a ? actual + 0x20 : actual;
    const foldedExpected = expected >= 0x41 && expected <= 0x5a ? expected + 0x20 : expected;
    if (foldedActual !== foldedExpected) return false;
  }
  return true;
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
    return { path: Buffer.from(path), contentType, length: stat.size, fingerprint: fp, sourceTag: fingerprintText(fp) };
  } finally {
    await handle.close();
  }
}

async function metadata(tablePath: Buffer, kind: FsdbTableKind): Promise<Map<FsdbMetadataName, FileEntry>> {
  const result = new Map<FsdbMetadataName, FileEntry>();
  const specs: Array<[string, FsdbMetadataName, boolean, string, "info-meta" | "extend-meta" | "text"]> = [];
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

async function scanTable(path: Buffer, kind: FsdbTableKind, name: string): Promise<TableIndex> {
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

function isWithin(root: Buffer, child: Buffer): boolean {
  if (child.equals(root)) return true;
  const prefix = Buffer.concat([root, PATH_SEPARATOR]);
  return child.length > prefix.length && child.subarray(0, prefix.length).equals(prefix);
}

function mapIo(error: unknown): never {
  const code = (error as NodeJS.ErrnoException).code;
  if (code === "ENOENT") throw new FsdbResolutionError("DATABASE_NOT_FOUND", "Database was not found");
  if (code === "EMFILE" || code === "ENFILE" || code === "ENOMEM" || code === "EBUSY" || code === "EAGAIN") {
    throw new FsdbResolutionError("DATABASE_UNAVAILABLE", "Database is temporarily unavailable");
  }
  throw error;
}

export async function resolveContainerRoot(rootInput: string): Promise<Buffer> {
  if (typeof rootInput !== "string" || rootInput.length === 0) throw new TypeError("root is required");
  const supplied = isAbsolute(rootInput) ? rootInput : resolve(process.cwd(), rootInput);
  let root: Buffer;
  try { root = await realpath(supplied, { encoding: "buffer" }); }
  catch (error) { mapIo(error); }
  const rootStat = await lstat(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new FsdbResolutionError("DATABASE_INVALID", "Container root must be a directory");
  return root;
}

interface DatabaseCandidate {
  readonly logical?: string;
  readonly physical: Buffer;
  readonly symbolic: boolean;
  readonly directory: boolean;
  readonly invalidName: boolean;
}

async function databaseCandidates(directory: Buffer): Promise<readonly DatabaseCandidate[]> {
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true, encoding: "buffer" }); }
  catch (error) { mapIo(error); }
  if (!entries) throw new FsdbResolutionError("DATABASE_UNAVAILABLE", "Database is temporarily unavailable");
  const found: DatabaseCandidate[] = [];
  for (const item of entries) {
    if (!startsWithAsciiCaseInsensitive(item.name, "[FSDB]")) continue;
    const physical = childPath(directory, item.name);
    const stat = await lstat(physical);
    let logical: string | undefined;
    let invalidName = item.name.length === "[FSDB]".length;
    if (!invalidName) {
      try { logical = canonicalName(decodePhysicalName(item.name).slice("[FSDB]".length)); }
      catch { invalidName = true; }
    }
    found.push({
      ...(logical === undefined ? {} : { logical }),
      physical,
      symbolic: stat.isSymbolicLink(),
      directory: stat.isDirectory(),
      invalidName,
    });
  }
  return found;
}

function usableDatabase(candidate: DatabaseCandidate, container: Buffer): Buffer {
  if (candidate.invalidName || candidate.logical === undefined) throw new FsdbResolutionError("DATABASE_INVALID", "Invalid FSDB name");
  if (candidate.symbolic || !candidate.directory || !isWithin(container, candidate.physical)) {
    throw new FsdbResolutionError("DATABASE_PATH_AMBIGUOUS", "FSDB directory indirection is forbidden");
  }
  return candidate.physical;
}

async function selectDatabaseChild(directory: Buffer, container: Buffer, segment: string): Promise<Buffer> {
  const matches = (await databaseCandidates(directory)).filter((candidate) => candidate.logical === segment);
  if (matches.length > 1) throw new FsdbResolutionError("DATABASE_PATH_AMBIGUOUS", "Duplicate logical database name");
  if (matches.length === 0) throw new FsdbResolutionError("DATABASE_NOT_FOUND", "Database was not found");
  return usableDatabase(matches[0]!, container);
}

async function discoverDatabaseChildren(directory: Buffer, container: Buffer): Promise<Map<string, Buffer>> {
  const found = new Map<string, Buffer>();
  for (const candidate of await databaseCandidates(directory)) {
    const physical = usableDatabase(candidate, container);
    if (found.has(candidate.logical!)) throw new FsdbResolutionError("DATABASE_PATH_AMBIGUOUS", "Duplicate logical database name");
    found.set(candidate.logical!, physical);
  }
  return found;
}

export function databasePathSegments(path: string): readonly string[] {
  let canonical: string;
  try { canonical = canonicalDatabasePath(path); }
  catch { throw new FsdbResolutionError("DATABASE_PATH_INVALID", "Invalid database path"); }
  return canonical.split("/");
}

export async function resolveDatabaseDirectory(container: Buffer, path: string): Promise<Buffer> {
  const segments = databasePathSegments(path);
  let current = container;
  for (const segment of segments) {
    current = await selectDatabaseChild(current, container, segment);
  }
  const confirmed = await lstat(current);
  if (confirmed.isSymbolicLink() || !confirmed.isDirectory() || !isWithin(container, current)) {
    throw new FsdbResolutionError("DATABASE_PATH_AMBIGUOUS", "FSDB directory indirection is forbidden");
  }
  return current;
}

export async function discoverDatabasePaths(container: Buffer): Promise<readonly string[]> {
  const paths: string[] = [];
  async function walk(directory: Buffer, prefix: string): Promise<void> {
    const children = await discoverDatabaseChildren(directory, container);
    for (const name of [...children.keys()].sort(codePointCompare)) {
      const physical = children.get(name)!;
      if (!isWithin(container, physical)) throw new FsdbResolutionError("DATABASE_PATH_AMBIGUOUS", "FSDB directory indirection is forbidden");
      const path = prefix.length === 0 ? name : `${prefix}/${name}`;
      paths.push(path);
      await walk(physical, path);
    }
  }
  await walk(container, "");
  paths.sort(codePointCompare);
  return Object.freeze(paths);
}

export async function scanFsdb(root: Buffer): Promise<Snapshot> {
  const rootStat = await lstat(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error("FSDB root must be a directory");
  const rootNameBytes = baseName(root);
  if (!startsWithAsciiCaseInsensitive(rootNameBytes, "[FSDB]")) throw new Error("Invalid FSDB root name");
  const rootName = decodePhysicalName(rootNameBytes);
  const name = canonicalName(rootName.slice("[FSDB]".length));
  const tables = new Map<string, TableIndex>();
  for (const item of await readdir(root, { withFileTypes: true, encoding: "buffer" })) {
    const kind = TABLE_KINDS.find((candidate) => startsWithAsciiCaseInsensitive(item.name, `[${candidate}]`));
    if (!kind) continue;
    const physicalName = decodePhysicalName(item.name);
    const tableName = canonicalName(physicalName.slice(kind.length + 2));
    const path = childPath(root, item.name);
    const stat = await lstat(path);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("Table candidate must be a real directory");
    const id = tableId(kind, tableName);
    if (tables.has(id)) throw new Error("Duplicate table identity");
    tables.set(id, await scanTable(path, kind, tableName));
  }
  const tableList = [...tables.values()].sort((a, b) => (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : codePointCompare(a.name, b.name))).map(({ kind, name: tableName }) => ({ kind, name: tableName }));
  const descriptor = Buffer.from(JSON.stringify({ name, tables: tableList }), "utf8");
  return { name, snapshotId: randomBytes(16).toString("base64url"), tables, descriptor };
}

function codePointCompare(a: string, b: string): number {
  const aa = [...a]; const bb = [...b];
  for (let i = 0; i < Math.min(aa.length, bb.length); i++) {
    const difference = aa[i]!.codePointAt(0)! - bb[i]!.codePointAt(0)!;
    if (difference !== 0) return difference;
  }
  return aa.length - bb.length;
}
