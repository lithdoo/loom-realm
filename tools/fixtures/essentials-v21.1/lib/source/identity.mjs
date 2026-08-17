import { lstat, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fail } from "../errors.mjs";

export const SOURCE_TABLES = Object.freeze(["Graphics", "Audio", "Fonts", "Data", "PBS"]);

export async function locateArchiveRoot(extractionRoot) {
  const candidates = [];
  const queue = [extractionRoot];
  while (queue.length > 0) {
    const directory = queue.shift();
    const entries = await readdir(directory, { withFileTypes: true });
    const names = new Set(entries.map((entry) => entry.name));
    if ([...SOURCE_TABLES, "mkxp.json"].every((name) => names.has(name))) candidates.push(directory);
    if (directory === extractionRoot) {
      for (const entry of entries) {
        if (entry.isDirectory() && !entry.isSymbolicLink()) queue.push(join(directory, entry.name));
      }
    }
  }
  if (candidates.length !== 1) fail("SOURCE_NOT_ESSENTIALS_V21_1", `Archive contains ${candidates.length} possible Essentials roots`);
  return candidates[0];
}

export async function validateSourceIdentity(root) {
  for (const name of SOURCE_TABLES) {
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
