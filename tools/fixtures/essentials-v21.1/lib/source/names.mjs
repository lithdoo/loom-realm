import { constants as fsConstants } from "node:fs";
import { access } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fail } from "../errors.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(HERE, "../../../../..");
const UTF8 = new TextDecoder("utf-8", { fatal: true });

export async function loadNameAuthority() {
  const authorityPath = join(REPOSITORY_ROOT, "packages", "fsdb-http", "dist", "names.js");
  try {
    await access(authorityPath, fsConstants.R_OK);
    return await import(pathToFileURL(authorityPath).href);
  } catch {
    fail("FSDB_VALIDATION_FAILURE", "Build @loomrealm/fsdb-http before importing (npm run build -w @loomrealm/fsdb-http)");
  }
}

export function decodeName(bytes, displayPath) {
  try { return UTF8.decode(bytes); } catch { fail("INVALID_UTF8_NAME", `Invalid UTF-8 filesystem name under ${displayPath}`); }
}
