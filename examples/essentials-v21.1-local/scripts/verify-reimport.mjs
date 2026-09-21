import { access, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

const exampleRoot = process.argv[2];
if (!exampleRoot) {
  process.stderr.write("verify-reimport: missing example root\n");
  process.exit(2);
}

const entries = await readdir(exampleRoot, { withFileTypes: true });
const fsdbs = entries.filter((entry) => entry.isDirectory() && /^\[FSDB\]/u.test(entry.name));
if (fsdbs.length !== 1) {
  process.stderr.write(`verify-reimport: expected exactly one [FSDB]* directory, found ${fsdbs.length}\n`);
  process.exit(1);
}

const fsdbRoot = join(exampleRoot, fsdbs[0].name);
await access(join(fsdbRoot, "[struct]MapAction"));
const tileset = JSON.parse(await readFile(join(fsdbRoot, "[struct]Tileset", "1.json"), "utf8"));
if (!Object.hasOwn(tileset, "terrain_tags")) {
  process.stderr.write("verify-reimport: Tileset 1.json is missing terrain_tags\n");
  process.exit(1);
}

process.stdout.write(`FSDB ready: ${fsdbRoot}\n`);
process.stdout.write("Checked: struct.MapAction, Tileset.terrain_tags\n");
