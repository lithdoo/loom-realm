import { lstat, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join, resolve } from "node:path";
import { fail } from "../errors.mjs";
import { locateArchiveRoot } from "../source/identity.mjs";
import { downloadEeveeExpoArchive } from "./eevee-expo.mjs";
import { removeOwnedDirectory } from "./temporary.mjs";
import { extractZip } from "./zip.mjs";

/**
 * @typedef {object} AcquiredSource
 * @property {string} root
 * @property {"local-directory" | "local-zip" | "auto-download"} mode
 * @property {() => Promise<void>} close
 */

export async function acquireSource(sourceInput, dependencies = {}) {
  const extract = dependencies.extractZip ?? extractZip;
  const locate = dependencies.locateArchiveRoot ?? locateArchiveRoot;
  const download = dependencies.downloadEeveeExpoArchive ?? downloadEeveeExpoArchive;
  const removeOwned = dependencies.removeOwnedDirectory ?? removeOwnedDirectory;

  if (sourceInput !== undefined) {
    const supplied = resolve(sourceInput);
    let sourceStat;
    try { sourceStat = await lstat(supplied); } catch { fail("SOURCE_NOT_ESSENTIALS_V21_1", `Source does not exist: ${supplied}`); }
    if (sourceStat.isSymbolicLink()) fail("SOURCE_INDIRECTION", "Source itself must not be an indirection");
    if (sourceStat.isDirectory()) return { root: supplied, mode: "local-directory", close: async () => {} };
    if (!sourceStat.isFile() || extname(supplied).toLowerCase() !== ".zip") {
      fail("ARCHIVE_INVALID", "Local source must be an Essentials directory or ZIP archive");
    }
    const temporary = await mkdtemp(join(tmpdir(), "loomrealm-essentials-"));
    try {
      const extraction = join(temporary, "extracted");
      await extract(supplied, extraction);
      const root = await locate(extraction);
      return { root, mode: "local-zip", close: () => removeOwned(tmpdir(), temporary) };
    } catch (error) {
      await removeOwned(tmpdir(), temporary);
      throw error;
    }
  }

  const temporary = await mkdtemp(join(tmpdir(), "loomrealm-essentials-"));
  try {
    const archive = join(temporary, "essentials-v21.1.zip");
    await download(archive, dependencies);
    const extraction = join(temporary, "extracted");
    await extract(archive, extraction);
    const root = await locate(extraction);
    return { root, mode: "auto-download", close: () => removeOwned(tmpdir(), temporary) };
  } catch (error) {
    await removeOwned(tmpdir(), temporary);
    throw error;
  }
}
