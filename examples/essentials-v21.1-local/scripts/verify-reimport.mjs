import { access, readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export async function verifyReimport(exampleRoot) {
  const entries = await readdir(exampleRoot, { withFileTypes: true });
  const fsdbs = entries.filter((entry) => entry.isDirectory() && /^\[FSDB\]/u.test(entry.name));
  if (fsdbs.length !== 1) throw new Error(`expected exactly one [FSDB]* directory, found ${fsdbs.length}`);
  const fsdbRoot = join(exampleRoot, fsdbs[0].name);
  const fsdbEntries = await readdir(fsdbRoot, { withFileTypes: true });
  const mapsDir = join(fsdbRoot, "[struct]Map");
  await access(join(mapsDir, ".info.meta"));
  const mapFiles = (await readdir(mapsDir)).filter((name) => name.endsWith(".json"));
  if (mapFiles.length === 0) throw new Error("no Map records were generated");
  for (const name of mapFiles) {
    const map = JSON.parse(await readFile(join(mapsDir, name), "utf8"));
    if (!Array.isArray(map.behaviors)) throw new Error(`${name} is missing Map.behaviors`);
    for (const behavior of map.behaviors) {
      if (behavior.kind !== "bridge" || !["on", "off"].includes(behavior.operation) || !Array.isArray(behavior.occupied) || behavior.occupied.length === 0) throw new Error(`${name} has an invalid behavior`);
    }
  }
  if (fsdbEntries.some((entry) => entry.name === "[struct]MapAction")) throw new Error("legacy [struct]MapAction must not be installed");
  const tileset = JSON.parse(await readFile(join(fsdbRoot, "[struct]Tileset", "1.json"), "utf8"));
  if (!Object.hasOwn(tileset, "terrain_tags")) throw new Error("Tileset 1.json is missing terrain_tags");
  await access(join(fsdbRoot, "[resource]Presentation", "map", "map.browser.js.js"));
  return fsdbRoot;
}

async function main() {
  const exampleRoot = process.argv[2];
  if (!exampleRoot) throw new Error("missing example root");
  const fsdbRoot = await verifyReimport(exampleRoot);
  process.stdout.write(`FSDB ready: ${fsdbRoot}\nChecked: Map.behaviors, no MapAction, Tileset.terrain_tags, Presentation\n`);
}

const invoked = process.argv[1] && fileURLToPath(import.meta.url).toLowerCase() === resolve(process.argv[1]).toLowerCase();
if (invoked) await main().catch((error) => { process.stderr.write(`verify-reimport: ${error.message}\n`); process.exitCode = 1; });
