import { createWriteStream } from "node:fs";
import { lstat, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import yauzl from "yauzl";
import { fail, ImportFailure } from "../errors.mjs";
import { isWithin } from "./temporary.mjs";

const MAX_ARCHIVE_BYTES = 128 * 1024 * 1024;
const MAX_ARCHIVE_ENTRIES = 10_000;
const MAX_UNCOMPRESSED_BYTES = 128 * 1024 * 1024;
const MAX_ENTRY_BYTES = 32 * 1024 * 1024;

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

export async function extractZip(zipPath, extractionRoot) {
  const archive = await lstat(zipPath);
  if (!archive.isFile() || archive.isSymbolicLink() || archive.size > MAX_ARCHIVE_BYTES) {
    fail("ARCHIVE_INVALID", "ZIP archive exceeds the configured compressed size limit");
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
