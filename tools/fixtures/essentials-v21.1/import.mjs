#!/usr/bin/env node

import { createHash, randomBytes } from "node:crypto";
import { constants as fsConstants, createWriteStream } from "node:fs";
import {
  access,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readdir,
  readFile,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import yauzl from "yauzl";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(HERE, "../../..");
const TABLES = Object.freeze(["Graphics", "Audio", "Fonts", "Data", "PBS"]);
const OUTPUT_BASENAME = "[FSDB]Essentials v21.1";
const DEFAULT_DOWNLOAD = "https://www.eeveeexpo.com/essentials/download";
const MAX_HTTP_HOPS = 10;
const MAX_LANDING_PAGE_BYTES = 2 * 1024 * 1024;
const MAX_ARCHIVE_BYTES = 128 * 1024 * 1024;
const MAX_ARCHIVE_ENTRIES = 10_000;
const MAX_UNCOMPRESSED_BYTES = 128 * 1024 * 1024;
const MAX_ENTRY_BYTES = 32 * 1024 * 1024;
const EXPECTED_ARCHIVE = Object.freeze({
  size: 61_987_094,
  sha256: "da0a34ec81ed40a4346fe6101debd7d938cbeadd43ff0aad87c3e388392a1665",
});
const UTF8 = new TextDecoder("utf-8", { fatal: true });
const COMPATIBILITY_ADAPTATIONS = new Map([
  ["Graphics/UI/itemstorage_bg.PNG", {
    targetName: "itemstorage_bg.png",
    size: 1897n,
    sha256: "a494acc6701661184a211b0de4651b79ed267cac33d1cc9097b0c84926213329",
  }],
]);

export class ImportFailure extends Error {
  constructor(category, message, details = []) {
    super(message);
    this.name = "ImportFailure";
    this.category = category;
    this.details = details;
  }
}

function fail(category, message, details) {
  throw new ImportFailure(category, message, details);
}

export function parseArguments(argv) {
  const result = { source: undefined, output: process.cwd() };
  const seen = new Set();
  for (let index = 0; index < argv.length; index += 1) {
    const name = argv[index];
    if (name !== "--source" && name !== "--output") {
      fail("INVALID_ARGUMENT", `Unknown argument: ${name}`);
    }
    if (seen.has(name)) fail("INVALID_ARGUMENT", `Duplicate argument: ${name}`);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      fail("INVALID_ARGUMENT", `Missing value for ${name}`);
    }
    seen.add(name);
    result[name === "--source" ? "source" : "output"] = value;
    index += 1;
  }
  return result;
}

function isWithin(parent, child) {
  const rel = relative(parent, child);
  return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel));
}

async function removeOwnedDirectory(parent, target) {
  const absoluteParent = resolve(parent);
  const absoluteTarget = resolve(target);
  if (absoluteParent === absoluteTarget || !isWithin(absoluteParent, absoluteTarget)) {
    throw new Error(`Refusing to remove non-owned path: ${absoluteTarget}`);
  }
  await rm(absoluteTarget, { recursive: true, force: true });
}

async function openZip(path) {
  return await new Promise((resolveOpen, reject) => {
    yauzl.open(path, { lazyEntries: true, strictFileNames: true, validateEntrySizes: true }, (error, zip) => {
      if (error) reject(error);
      else resolveOpen(zip);
    });
  });
}

function archiveEntryType(entry) {
  const host = entry.versionMadeBy >>> 8;
  if (host !== 3) return entry.fileName.endsWith("/") ? "directory" : "file";
  const mode = (entry.externalFileAttributes >>> 16) & 0xffff;
  const kind = mode & 0o170000;
  if (kind === 0o120000) return "indirection";
  if (kind === 0o040000) return "directory";
  if (kind === 0 || kind === 0o100000) return entry.fileName.endsWith("/") ? "directory" : "file";
  return "unsupported";
}

export function validateArchivePath(fileName, extractionRoot) {
  if (
    fileName.length === 0 ||
    fileName.includes("\\") ||
    fileName.includes("\0") ||
    fileName.startsWith("/") ||
    /^[A-Za-z]:/.test(fileName)
  ) {
    fail("ARCHIVE_PATH_ESCAPE", `Unsafe archive entry: ${fileName}`);
  }
  const segments = fileName.split("/");
  if (segments.some((segment, index) => segment === ".." || segment === "." || (segment === "" && index !== segments.length - 1))) {
    fail("ARCHIVE_PATH_ESCAPE", `Unsafe archive entry: ${fileName}`);
  }
  const target = resolve(extractionRoot, ...segments.filter(Boolean));
  if (!isWithin(resolve(extractionRoot), target) || target === resolve(extractionRoot)) {
    fail("ARCHIVE_PATH_ESCAPE", `Archive entry escapes extraction root: ${fileName}`);
  }
  return target;
}

export function accountArchiveEntry(budget, uncompressedSize) {
  budget.entries += 1;
  budget.uncompressedBytes += uncompressedSize;
  if (
    budget.entries > MAX_ARCHIVE_ENTRIES ||
    budget.uncompressedBytes > MAX_UNCOMPRESSED_BYTES ||
    uncompressedSize > MAX_ENTRY_BYTES
  ) {
    fail("ARCHIVE_INVALID", "ZIP archive exceeds the configured extraction resource limits");
  }
}

async function extractZip(zipPath, extractionRoot) {
  const archiveStat = await lstat(zipPath);
  if (!archiveStat.isFile() || archiveStat.isSymbolicLink() || archiveStat.size > MAX_ARCHIVE_BYTES) {
    fail("ARCHIVE_INVALID", `ZIP archive exceeds the ${MAX_ARCHIVE_BYTES}-byte compressed size limit`);
  }
  await mkdir(extractionRoot, { recursive: false });
  let zip;
  try {
    zip = await openZip(zipPath);
  } catch (error) {
    fail("ARCHIVE_INVALID", `Cannot open ZIP archive: ${error.message}`);
  }
  const targets = new Set();
  const budget = { entries: 0, uncompressedBytes: 0 };
  try {
    await new Promise((resolveExtraction, reject) => {
      const rejectOnce = (error) => {
        try { zip.close(); } catch {}
        reject(error);
      };
      zip.once("error", (error) => rejectOnce(new ImportFailure("ARCHIVE_INVALID", error.message)));
      zip.once("end", resolveExtraction);
      zip.on("entry", async (entry) => {
        try {
          accountArchiveEntry(budget, entry.uncompressedSize);
          const target = validateArchivePath(entry.fileName, extractionRoot);
          const key = process.platform === "win32" ? target.toLocaleLowerCase("en-US") : target;
          if (targets.has(key)) fail("ARCHIVE_INVALID", `Duplicate archive target: ${entry.fileName}`);
          targets.add(key);
          const type = archiveEntryType(entry);
          if (type === "indirection" || type === "unsupported") {
            fail("ARCHIVE_INVALID", `Archive indirection or special object is forbidden: ${entry.fileName}`);
          }
          if (type === "directory") {
            await mkdir(target, { recursive: true });
            zip.readEntry();
            return;
          }
          await mkdir(dirname(target), { recursive: true });
          const input = await new Promise((resolveStream, rejectStream) => {
            zip.openReadStream(entry, (error, stream) => error ? rejectStream(error) : resolveStream(stream));
          });
          await pipeline(input, createWriteStream(target, { flags: "wx" }));
          zip.readEntry();
        } catch (error) {
          rejectOnce(error instanceof ImportFailure ? error : new ImportFailure("ARCHIVE_INVALID", error.message));
        }
      });
      zip.readEntry();
    });
  } finally {
    try { zip.close(); } catch {}
  }
}

function decodeHtmlAttribute(value) {
  return value.replace(/&(?:amp|quot|apos|#39|#x27);/gi, (entity) => {
    const normalized = entity.toLowerCase();
    if (normalized === "&amp;") return "&";
    if (normalized === "&quot;") return '"';
    return "'";
  });
}

function htmlAttribute(tag, name) {
  const match = new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, "is").exec(tag);
  return match ? decodeHtmlAttribute(match[2]) : undefined;
}

function isMediaFireHost(hostname) {
  const lower = hostname.toLowerCase();
  return lower === "mediafire.com" || lower.endsWith(".mediafire.com");
}

export function resolveMediaFireDownloadLink(html, landingUrl) {
  const landing = new URL(landingUrl);
  if (landing.protocol !== "https:" || !isMediaFireHost(landing.hostname)) {
    fail("DOWNLOAD_FAILURE", "Refusing to parse a non-MediaFire landing page");
  }
  const candidates = [];
  for (const match of html.matchAll(/<a\b[^>]*>/gis)) {
    const tag = match[0];
    const href = htmlAttribute(tag, "href");
    if (!href) continue;
    let target;
    try { target = new URL(href, landing); } catch { continue; }
    let path;
    try { path = decodeURIComponent(target.pathname); } catch { continue; }
    if (target.protocol !== "https:" || !isMediaFireHost(target.hostname) || !path.toLowerCase().endsWith(".zip")) continue;
    candidates.push({ url: target.href, preferred: htmlAttribute(tag, "id")?.toLowerCase() === "downloadbutton" });
  }
  const preferred = [...new Set(candidates.filter((item) => item.preferred).map((item) => item.url))];
  const all = [...new Set(candidates.map((item) => item.url))];
  const selected = preferred.length === 1 ? preferred[0] : all.length === 1 ? all[0] : undefined;
  if (!selected) fail("DOWNLOAD_FAILURE", `MediaFire landing page exposed ${all.length} unambiguous HTTPS ZIP links`);
  return new URL(selected);
}

async function readTextResponse(response) {
  if (!response.body) fail("DOWNLOAD_FAILURE", "Landing page response has no body");
  const chunks = [];
  let length = 0;
  for await (const chunk of Readable.fromWeb(response.body)) {
    length += chunk.length;
    if (length > MAX_LANDING_PAGE_BYTES) fail("DOWNLOAD_FAILURE", "MediaFire landing page exceeds the size limit");
    chunks.push(chunk);
  }
  try { return UTF8.decode(Buffer.concat(chunks, length)); } catch { fail("DOWNLOAD_FAILURE", "MediaFire landing page is not valid UTF-8"); }
}

async function saveVerifiedArchive(response, destination, expectedArchive) {
  const declaredLength = response.headers.get("content-length");
  if (declaredLength !== null && Number(declaredLength) !== expectedArchive.size) {
    fail("DOWNLOAD_INTEGRITY_FAILURE", `Downloaded ZIP Content-Length is ${declaredLength}, expected ${expectedArchive.size}`);
  }
  const hash = createHash("sha256");
  let length = 0;
  const verifier = new Transform({
    transform(chunk, _encoding, callback) {
      length += chunk.length;
      if (length > expectedArchive.size) {
        callback(new ImportFailure("DOWNLOAD_INTEGRITY_FAILURE", "Downloaded ZIP exceeds the pinned size"));
        return;
      }
      hash.update(chunk);
      callback(null, chunk);
    },
  });
  try {
    await pipeline(Readable.fromWeb(response.body), verifier, createWriteStream(destination, { flags: "wx" }));
  } catch (error) {
    if (error instanceof ImportFailure) throw error;
    fail("DOWNLOAD_FAILURE", `Cannot save downloaded ZIP: ${error.message}`);
  }
  const digest = hash.digest("hex");
  if (length !== expectedArchive.size || digest !== expectedArchive.sha256) {
    fail("DOWNLOAD_INTEGRITY_FAILURE", `Downloaded ZIP identity mismatch (${length} bytes, SHA-256 ${digest})`);
  }
}

export async function downloadArchive(destination, options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const expectedArchive = options.expectedArchive ?? EXPECTED_ARCHIVE;
  let current = new URL(options.initialUrl ?? DEFAULT_DOWNLOAD);
  let referer;
  let parsedLandingPage = false;
  for (let hops = 0; hops <= MAX_HTTP_HOPS; hops += 1) {
    if (current.protocol !== "https:") fail("DOWNLOAD_REDIRECT_FAILURE", `Download URL is not HTTPS: ${current.origin}`);
    if (parsedLandingPage && !isMediaFireHost(current.hostname)) {
      fail("DOWNLOAD_REDIRECT_FAILURE", `MediaFire download redirected outside its HTTPS authority: ${current.origin}`);
    }
    let response;
    try {
      const headers = {
        accept: parsedLandingPage ? "application/zip, application/octet-stream;q=0.9, */*;q=0.8" : "text/html,application/xhtml+xml,application/zip;q=0.9,*/*;q=0.8",
        "accept-language": "en-US,en;q=0.8",
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36 LoomRealmFixtureImporter/1.0",
      };
      if (referer) headers.referer = referer;
      response = await fetchImpl(current, { redirect: "manual", headers });
    } catch (error) {
      fail("DOWNLOAD_FAILURE", `Download request failed: ${error.message}`);
    }
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) fail("DOWNLOAD_REDIRECT_FAILURE", "Download redirect has no Location header");
      try { current = new URL(location, current); } catch { fail("DOWNLOAD_REDIRECT_FAILURE", "Download redirect Location is invalid"); }
      continue;
    }
    if (!response.ok || !response.body) fail("DOWNLOAD_FAILURE", `Download failed with HTTP ${response.status}`);
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    const disposition = response.headers.get("content-disposition")?.toLowerCase() ?? "";
    if (contentType.includes("text/html")) {
      if (parsedLandingPage) fail("DOWNLOAD_FAILURE", "Download link returned a second HTML landing page");
      const html = await readTextResponse(response);
      referer = current.href;
      current = resolveMediaFireDownloadLink(html, current);
      parsedLandingPage = true;
      continue;
    }
    if (!contentType.includes("zip") && !contentType.includes("octet-stream") && !disposition.includes(".zip")) {
      fail("DOWNLOAD_FAILURE", `Download endpoint returned unsupported Content-Type: ${contentType || "missing"}`);
    }
    await saveVerifiedArchive(response, destination, expectedArchive);
    return;
  }
  fail("DOWNLOAD_REDIRECT_FAILURE", `Download exceeded ${MAX_HTTP_HOPS} HTTP hops`);
}

async function locateArchiveRoot(extractionRoot) {
  const candidates = [];
  const queue = [extractionRoot];
  while (queue.length > 0) {
    const directory = queue.shift();
    const entries = await readdir(directory, { withFileTypes: true });
    const names = new Set(entries.map((entry) => entry.name));
    if ([...TABLES, "mkxp.json"].every((name) => names.has(name))) candidates.push(directory);
    if (directory === extractionRoot) {
      for (const entry of entries) {
        if (entry.isDirectory() && !entry.isSymbolicLink()) queue.push(join(directory, entry.name));
      }
    }
  }
  if (candidates.length !== 1) {
    fail("SOURCE_NOT_ESSENTIALS_V21_1", `Archive contains ${candidates.length} possible Essentials roots`);
  }
  return candidates[0];
}

async function acquireSource(sourceInput) {
  if (sourceInput !== undefined) {
    const supplied = resolve(sourceInput);
    let sourceStat;
    try { sourceStat = await lstat(supplied); } catch { fail("SOURCE_NOT_ESSENTIALS_V21_1", `Source does not exist: ${supplied}`); }
    if (sourceStat.isSymbolicLink()) fail("SOURCE_INDIRECTION", "Source itself must not be an indirection");
    if (sourceStat.isDirectory()) return { root: supplied, mode: "local-directory", cleanup: async () => {} };
    if (!sourceStat.isFile() || extname(supplied).toLowerCase() !== ".zip") {
      fail("ARCHIVE_INVALID", "Local source must be an Essentials directory or ZIP archive");
    }
    const temporary = await mkdtemp(join(tmpdir(), "loomrealm-essentials-"));
    try {
      const extraction = join(temporary, "extracted");
      await extractZip(supplied, extraction);
      const root = await locateArchiveRoot(extraction);
      return { root, mode: "local-zip", cleanup: () => removeOwnedDirectory(tmpdir(), temporary) };
    } catch (error) {
      await removeOwnedDirectory(tmpdir(), temporary);
      throw error;
    }
  }

  const temporary = await mkdtemp(join(tmpdir(), "loomrealm-essentials-"));
  try {
    const archive = join(temporary, "essentials-v21.1.zip");
    await downloadArchive(archive);
    const extraction = join(temporary, "extracted");
    await extractZip(archive, extraction);
    const root = await locateArchiveRoot(extraction);
    return { root, mode: "auto-download", cleanup: () => removeOwnedDirectory(tmpdir(), temporary) };
  } catch (error) {
    await removeOwnedDirectory(tmpdir(), temporary);
    throw error;
  }
}

async function validateSourceIdentity(root) {
  for (const name of TABLES) {
    const path = join(root, name);
    let item;
    try { item = await lstat(path); } catch { fail("SOURCE_NOT_ESSENTIALS_V21_1", `Missing source directory: ${name}/`); }
    if (item.isSymbolicLink()) fail("SOURCE_INDIRECTION", `Source directory is an indirection: ${name}/`);
    if (!item.isDirectory()) fail("SOURCE_NOT_ESSENTIALS_V21_1", `Source object is not a directory: ${name}/`);
  }
  const marker = join(root, "mkxp.json");
  let markerStat;
  try { markerStat = await lstat(marker); } catch { fail("SOURCE_NOT_ESSENTIALS_V21_1", "Missing mkxp.json"); }
  if (markerStat.isSymbolicLink()) fail("SOURCE_INDIRECTION", "mkxp.json is an indirection");
  if (!markerStat.isFile()) fail("SOURCE_NOT_ESSENTIALS_V21_1", "mkxp.json is not a regular file");
  const text = await readFile(marker, "utf8");
  if (!/Pok(?:é|e\u0301)mon Essentials v21\.1/u.test(text.normalize("NFC"))) {
    fail("SOURCE_NOT_ESSENTIALS_V21_1", "mkxp.json does not identify Pokémon Essentials v21.1");
  }
}

async function loadNameAuthority() {
  const authorityPath = join(REPOSITORY_ROOT, "packages", "fsdb-http", "dist", "names.js");
  try {
    await access(authorityPath, fsConstants.R_OK);
    return await import(pathToFileURL(authorityPath).href);
  } catch {
    fail("FSDB_VALIDATION_FAILURE", "Build @loomrealm/fsdb-http before importing (npm run build -w @loomrealm/fsdb-http)");
  }
}

function decodeName(bytes, displayPath) {
  try { return UTF8.decode(bytes); } catch { fail("INVALID_UTF8_NAME", `Invalid UTF-8 filesystem name under ${displayPath}`); }
}

function fingerprint(item) {
  return { dev: item.dev, ino: item.ino, size: item.size, mtimeMs: item.mtimeMs, ctimeMs: item.ctimeMs };
}

function sameFingerprint(left, right) {
  return left.dev === right.dev && left.ino === right.ino && left.size === right.size && left.mtimeMs === right.mtimeMs && left.ctimeMs === right.ctimeMs;
}

async function sha256File(path) {
  const handle = await open(path, "r");
  try {
    const hash = createHash("sha256");
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    let position = 0;
    while (true) {
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, position);
      if (bytesRead === 0) break;
      hash.update(buffer.subarray(0, bytesRead));
      position += bytesRead;
    }
    return hash.digest("hex");
  } finally {
    await handle.close();
  }
}

async function planResources(root) {
  const { canonicalName, resourceExtension } = await loadNameAuthority();
  const resources = [];
  const directories = [];
  const warnings = [];
  const issues = [];
  const stats = new Map(TABLES.map((table) => [table, { count: 0, bytes: 0n }]));

  for (const table of TABLES) {
    const keys = new Map();
    const portableKeys = new Map();
    const logicalDirectories = new Map();

    async function scan(physicalDirectory, physicalSegments, logicalSegments) {
      const entries = await readdir(physicalDirectory, { withFileTypes: true, encoding: "buffer" });
      entries.sort((left, right) => Buffer.compare(left.name, right.name));
      for (const entry of entries) {
        const displayParent = [table, ...physicalSegments].join("/");
        const physicalName = decodeName(entry.name, displayParent);
        const physicalPath = join(physicalDirectory, physicalName);
        const item = await lstat(physicalPath);
        if (item.isSymbolicLink()) fail("SOURCE_INDIRECTION", `Source indirection: ${displayParent}/${physicalName}`);
        if (!item.isDirectory() && !item.isFile()) fail("SOURCE_INDIRECTION", `Unsupported source object: ${displayParent}/${physicalName}`);

        if (item.isDirectory()) {
          let logicalName;
          try { logicalName = canonicalName(physicalName); } catch { issues.push(`INVALID_NAME_SEGMENT ${displayParent}/${physicalName}/`); continue; }
          const logicalPath = [...logicalSegments, logicalName].join("/");
          const existing = logicalDirectories.get(logicalPath);
          if (existing !== undefined) issues.push(`NORMALIZATION_COLLISION ${existing} <> ${displayParent}/${physicalName}/`);
          else logicalDirectories.set(logicalPath, `${displayParent}/${physicalName}/`);
          directories.push({ table, segments: [...logicalSegments, logicalName] });
          await scan(physicalPath, [...physicalSegments, physicalName], [...logicalSegments, logicalName]);
          continue;
        }

        let parsed;
        let targetName;
        try { parsed = resourceExtension(physicalName); } catch (error) {
          const sourceRelative = `${table}/${[...physicalSegments, physicalName].join("/")}`;
          const adaptation = COMPATIBILITY_ADAPTATIONS.get(sourceRelative);
          if (adaptation !== undefined) {
            const digest = BigInt(item.size) === adaptation.size ? await sha256File(physicalPath) : "size-mismatch";
            if (digest !== adaptation.sha256) {
              issues.push(`INVALID_EXTENSION ${displayParent}/${physicalName} (known adaptation content mismatch)`);
              continue;
            }
            parsed = resourceExtension(adaptation.targetName);
            targetName = `${parsed.leaf}.${parsed.extension}`;
            warnings.push(`adapted ${sourceRelative} -> ${table}/${[...logicalSegments, targetName].join("/")}`);
          } else {
            const category = /extension/i.test(error.message) ? "INVALID_EXTENSION" : "INVALID_NAME_SEGMENT";
            issues.push(`${category} ${displayParent}/${physicalName}`);
            continue;
          }
        }
        targetName ??= `${parsed.leaf}.${parsed.extension}`;
        const key = [...logicalSegments, parsed.leaf].join("/");
        const display = `${displayParent}/${physicalName}`;
        const existing = keys.get(key);
        if (existing !== undefined) issues.push(`RESOURCE_KEY_COLLISION ${existing} <> ${display}`);
        else keys.set(key, display);
        const folded = key.toUpperCase();
        const portable = portableKeys.get(folded);
        if (portable !== undefined && portable.key !== key) warnings.push(`${table}: ${portable.display} <> ${display}`);
        else if (portable === undefined) portableKeys.set(folded, { key, display });
        resources.push({
          table,
          sourcePath: physicalPath,
          sourceRelativeSegments: [...physicalSegments, physicalName],
          relativeSegments: [...logicalSegments, targetName],
          resourceKey: key,
          extension: parsed.extension,
          size: BigInt(item.size),
          fingerprint: fingerprint(item),
        });
        const tableStats = stats.get(table);
        tableStats.count += 1;
        tableStats.bytes += BigInt(item.size);
      }
    }
    await scan(join(root, table), [], []);
  }
  if (issues.length > 0) {
    const category = issues[0].split(" ", 1)[0];
    fail(category, `Strict resource preflight found ${issues.length} incompatible source object(s)`, issues);
  }
  return { resources, directories, warnings, stats };
}

async function prepareOutputParent(input) {
  const outputParent = resolve(input);
  await mkdir(outputParent, { recursive: true });
  const item = await lstat(outputParent);
  if (!item.isDirectory()) fail("COPY_FAILURE", `Output parent is not a directory: ${outputParent}`);
  return await realpath(outputParent);
}

async function reserveOutput(outputParent) {
  for (let suffix = 1; ; suffix += 1) {
    const logicalName = suffix === 1 ? OUTPUT_BASENAME : `${OUTPUT_BASENAME} ${suffix}`;
    const finalPath = join(outputParent, logicalName);
    try { await lstat(finalPath); continue; } catch (error) { if (error.code !== "ENOENT") throw error; }
    const reservationPath = join(outputParent, `.${logicalName}.reserve`);
    let reservation;
    try { reservation = await open(reservationPath, "wx"); } catch (error) { if (error.code === "EEXIST") continue; throw error; }
    try {
      await lstat(finalPath);
      await reservation.close();
      await rm(reservationPath, { force: true });
      continue;
    } catch (error) {
      if (error.code !== "ENOENT") {
        await reservation.close();
        await rm(reservationPath, { force: true });
        throw error;
      }
    }
    const stagingContainer = join(outputParent, `.essentials-v21.1.${randomBytes(8).toString("hex")}.staging`);
    const stagingPath = join(stagingContainer, logicalName);
    try {
      await mkdir(stagingPath, { recursive: true });
      return { logicalName, finalPath, stagingContainer, stagingPath, reservationPath, reservation };
    } catch (error) {
      await reservation.close();
      await rm(reservationPath, { force: true });
      throw error;
    }
  }
}

async function copyPlannedFile(resource, target) {
  const before = await lstat(resource.sourcePath);
  if (!before.isFile() || before.isSymbolicLink() || !sameFingerprint(resource.fingerprint, fingerprint(before))) {
    fail("COPY_FAILURE", `Source changed after preflight: ${resource.table}/${resource.sourceRelativeSegments.join("/")}`);
  }
  const source = await open(resource.sourcePath, "r");
  let destination;
  try {
    const opened = await source.stat();
    if (!sameFingerprint(resource.fingerprint, fingerprint(opened))) fail("COPY_FAILURE", "Source changed while opening");
    destination = await open(target, "wx");
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    let position = 0;
    while (true) {
      const { bytesRead } = await source.read(buffer, 0, buffer.length, position);
      if (bytesRead === 0) break;
      let written = 0;
      while (written < bytesRead) {
        const result = await destination.write(buffer, written, bytesRead - written, position + written);
        written += result.bytesWritten;
      }
      position += bytesRead;
    }
    const after = await source.stat();
    if (!sameFingerprint(resource.fingerprint, fingerprint(after))) fail("COPY_FAILURE", "Source changed while copying");
    if (BigInt(position) !== resource.size) fail("COPY_FAILURE", "Copied byte count differs from preflight");
  } finally {
    if (destination) await destination.close();
    await source.close();
  }
}

async function materialize(stagingPath, plan, acquisitionMode) {
  for (const table of TABLES) {
    const target = join(stagingPath, `[resource]${table}`);
    await mkdir(target);
    await writeFile(
      join(target, ".desc.meta"),
      `Imported from Pokémon Essentials v21.1 \`${table}/\`.\n\nGenerated for local LoomRealm FSDB integration testing.\nSource assets are not owned or redistributed by LoomRealm.\n`,
      { encoding: "utf8", flag: "wx" },
    );
  }
  for (const directory of plan.directories) {
    await mkdir(join(stagingPath, `[resource]${directory.table}`, ...directory.segments), { recursive: true });
  }
  for (const resource of plan.resources) {
    const target = join(stagingPath, `[resource]${resource.table}`, ...resource.relativeSegments);
    await copyPlannedFile(resource, target);
  }
  const info = join(stagingPath, "[struct]测试信息");
  await mkdir(info);
  await writeFile(join(info, ".info.meta"), '{"type":"object"}\n', { encoding: "utf8", flag: "wx" });
  await writeFile(
    join(info, "来源.json"),
    `${JSON.stringify({ name: "Pokémon Essentials", version: "21.1", purpose: "local fsdb-http integration fixture", acquisition: acquisitionMode }, null, 2)}\n`,
    { encoding: "utf8", flag: "wx" },
  );
}

async function validateWithProductionFsdb(stagingPath) {
  const modulePath = join(REPOSITORY_ROOT, "packages", "fsdb-http", "dist", "index.js");
  let openFsdb;
  try { ({ openFsdb } = await import(pathToFileURL(modulePath).href)); } catch {
    fail("FSDB_VALIDATION_FAILURE", "Cannot load built @loomrealm/fsdb-http production entry point");
  }
  try {
    const db = await openFsdb({ root: stagingPath });
    await db.close();
  } catch (error) {
    fail("FSDB_VALIDATION_FAILURE", `Production openFsdb() rejected the generated fixture: ${error.message}`);
  }
}

function formatBytes(value) {
  return new Intl.NumberFormat("en-US").format(value);
}

function printReport(plan, mode, output) {
  console.log("\nImported Pokémon Essentials v21.1\n");
  console.log(`Acquisition:\n  ${mode}\n`);
  console.log("Tables:");
  for (const table of TABLES) {
    const item = plan.stats.get(table);
    console.log(`  ${table.padEnd(10)} ${String(item.count).padStart(5)} resources  ${formatBytes(item.bytes)} bytes`);
  }
  const count = [...plan.stats.values()].reduce((sum, item) => sum + item.count, 0);
  const bytes = [...plan.stats.values()].reduce((sum, item) => sum + item.bytes, 0n);
  console.log(`\nTotal:\n  ${count} files\n  ${formatBytes(bytes)} bytes`);
  console.log(`\nWarnings:\n  ${plan.warnings.length}`);
  for (const warning of plan.warnings) console.log(`  ${warning}`);
  console.log(`\nFSDB validation: PASS\nOutput: ${output}`);
}

export async function run(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  const outputParent = await prepareOutputParent(options.output);
  console.log("Source:");
  console.log(options.source === undefined ? "  auto-download: Eevee Expo Essentials v21.1" : `  local: ${resolve(options.source)}`);
  console.log(`Output parent: ${outputParent}`);

  let acquired;
  let reservation;
  try {
    acquired = await acquireSource(options.source);
    await validateSourceIdentity(acquired.root);
    const plan = await planResources(acquired.root);
    reservation = await reserveOutput(outputParent);
    console.log(`Output root:   ${reservation.logicalName}`);
    await materialize(reservation.stagingPath, plan, acquired.mode);
    await validateWithProductionFsdb(reservation.stagingPath);
    await rename(reservation.stagingPath, reservation.finalPath);
    reservation.stagingPath = undefined;
    await reservation.reservation.close().catch(() => {});
    reservation.reservation = undefined;
    await rm(reservation.reservationPath, { force: true }).catch(() => {});
    await removeOwnedDirectory(outputParent, reservation.stagingContainer).catch(() => {});
    reservation.stagingContainer = undefined;
    printReport(plan, acquired.mode, reservation.finalPath);
    return reservation.finalPath;
  } catch (error) {
    if (reservation?.reservation) await reservation.reservation.close().catch(() => {});
    if (reservation?.reservationPath) await rm(reservation.reservationPath, { force: true }).catch(() => {});
    if (reservation?.stagingContainer) await removeOwnedDirectory(outputParent, reservation.stagingContainer).catch(() => {});
    throw error;
  } finally {
    if (acquired) await acquired.cleanup();
  }
}

function printFailure(error) {
  const category = error instanceof ImportFailure ? error.category : "COPY_FAILURE";
  console.error(`\n${category}: ${error.message}`);
  if (error instanceof ImportFailure) {
    for (const detail of error.details) console.error(`  ${detail}`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run().catch((error) => {
    printFailure(error);
    process.exitCode = 1;
  });
}
