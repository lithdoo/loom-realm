import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, readFile, readdir, stat } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { MAP21_BRIDGE_EVENTS } from "../../../tools/fixtures/essentials-v21.1/lib/essentials/v21.1/map-action-consumer.mjs";
import { assertNoPendingBackup } from "./safe-reimport.mjs";

const MANIFEST_VERSION = "loomrealm.essentials-v21.1-generation/v1";
const sorted = (values) => [...values].sort((left, right) => left.localeCompare(right));
const cells = (occupied) => occupied.map(({ x, y }) => [x, y]);

function exactKeys(value, expected, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value) || JSON.stringify(sorted(Object.keys(value))) !== JSON.stringify(sorted(expected))) {
    throw new Error(`${label} has an invalid schema`);
  }
}

function inside(root, relativePath) {
  if (typeof relativePath !== "string" || relativePath.length === 0 || relativePath.includes("\\") || relativePath.split("/").some((part) => part === "" || part === "." || part === "..")) {
    throw new Error(`generation manifest contains an unsafe resource path: ${relativePath}`);
  }
  const path = resolve(root, ...relativePath.split("/"));
  if (!path.startsWith(`${resolve(root)}${sep}`)) throw new Error(`generation manifest resource escapes its table: ${relativePath}`);
  return path;
}

function validateMap21Audit(audit) {
  if (!Array.isArray(audit) || audit.length !== MAP21_BRIDGE_EVENTS.length) throw new Error("Map21 Bridge audit must contain exactly eight events");
  const byId = new Map();
  for (const item of audit) {
    exactKeys(item, ["eventId", "pageIndex", "position", "operation", "occupied", "trigger", "through", "emptyGraphic"], "Map21 Bridge audit entry");
    if (byId.has(item.eventId)) throw new Error(`Map21 Bridge event ${item.eventId} is duplicated`);
    byId.set(item.eventId, item);
  }
  for (const expected of MAP21_BRIDGE_EVENTS) {
    const item = byId.get(expected.eventId);
    if (!item) throw new Error(`Map21 Bridge event ${expected.eventId} is missing`);
    if (item.operation !== (expected.op === "bridge-on" ? "on" : "off") || item.position?.x !== expected.x || item.position?.y !== expected.y
      || item.trigger !== 1 || item.through !== false || item.emptyGraphic !== true
      || JSON.stringify(cells(item.occupied)) !== JSON.stringify(expected.occupied)) {
      throw new Error(`Map21 Bridge event ${expected.eventId} does not match canonical/oracle evidence`);
    }
  }
}

async function sha256File(path) {
  const hash = createHash("sha256");
  await pipeline(createReadStream(path), hash);
  return hash.digest("hex");
}

function validateMap(map, name) {
  exactKeys(map, ["tileset_id", "width", "height", "data", "behaviors"], `Map ${name}`);
  if (!Number.isSafeInteger(map.tileset_id) || map.tileset_id <= 0 || !Number.isSafeInteger(map.width) || map.width <= 0 || !Number.isSafeInteger(map.height) || map.height <= 0) {
    throw new Error(`Map ${name} has invalid dimensions or tileset`);
  }
  exactKeys(map.data, ["dimensions", "xSize", "ySize", "zSize", "values"], `Map ${name}.data`);
  if (map.data.dimensions !== 3 || map.data.xSize !== map.width || map.data.ySize !== map.height || map.data.zSize !== 3
    || !Array.isArray(map.data.values) || map.data.values.length !== map.width * map.height * 3) {
    throw new Error(`Map ${name} has an incomplete tile table`);
  }
  if (!Array.isArray(map.behaviors)) throw new Error(`Map ${name} is missing Map.behaviors`);
  for (const behavior of map.behaviors) {
    exactKeys(behavior, ["kind", "operation", "occupied"], `Map ${name} behavior`);
    if (behavior.kind !== "bridge" || !["on", "off"].includes(behavior.operation) || !Array.isArray(behavior.occupied) || behavior.occupied.length === 0) {
      throw new Error(`Map ${name} has an invalid behavior`);
    }
    for (const point of behavior.occupied) {
      exactKeys(point, ["x", "y"], `Map ${name} behavior point`);
      if (!Number.isSafeInteger(point.x) || !Number.isSafeInteger(point.y) || point.x < 0 || point.y < 0 || point.x >= map.width || point.y >= map.height) {
        throw new Error(`Map ${name} behavior is out of bounds`);
      }
    }
  }
}

export async function verifyReimport(exampleRoot) {
  const entries = await readdir(exampleRoot, { withFileTypes: true });
  const fsdbs = entries.filter((entry) => entry.isDirectory() && /^\[FSDB\]/u.test(entry.name));
  if (fsdbs.length !== 1) throw new Error(`expected exactly one [FSDB]* directory, found ${fsdbs.length}`);
  const fsdbRoot = join(exampleRoot, fsdbs[0].name);
  const fsdbEntries = await readdir(fsdbRoot, { withFileTypes: true });
  if (fsdbEntries.some((entry) => entry.name === "[struct]MapAction")) throw new Error("legacy [struct]MapAction must not be installed");

  const manifestPath = join(fsdbRoot, "[struct]测试信息", "生成清单.json");
  let manifest;
  try { manifest = JSON.parse(await readFile(manifestPath, "utf8")); } catch (error) { throw new Error(`generation manifest is missing or invalid: ${error.message}`); }
  exactKeys(manifest, ["schemaVersion", "tables", "resources", "map21BridgeAudit"], "generation manifest");
  if (manifest.schemaVersion !== MANIFEST_VERSION || manifest.tables === null || typeof manifest.tables !== "object" || Array.isArray(manifest.tables)) {
    throw new Error("generation manifest version or tables are invalid");
  }
  validateMap21Audit(manifest.map21BridgeAudit);

  for (const [table, expectedKeys] of Object.entries(manifest.tables)) {
    if (!Array.isArray(expectedKeys) || new Set(expectedKeys).size !== expectedKeys.length) throw new Error(`generation manifest table ${table} has invalid identities`);
    const tableRoot = join(fsdbRoot, `[struct]${table}`);
    const names = await readdir(tableRoot);
    await access(join(tableRoot, ".info.meta"));
    const actualKeys = names.filter((name) => name.endsWith(".json")).map((name) => name.slice(0, -5));
    if (JSON.stringify(sorted(actualKeys)) !== JSON.stringify(sorted(expectedKeys))) throw new Error(`[struct]${table} record set differs from generation manifest`);
  }

  const resourceIdentities = new Set();
  if (!Array.isArray(manifest.resources)) throw new Error("generation manifest resources are invalid");
  for (const resource of manifest.resources) {
    exactKeys(resource, ["table", "key", "path", "size", "sha256"], "generation manifest resource");
    const identity = `${resource.table}\0${resource.key}`;
    if (resourceIdentities.has(identity)) throw new Error(`duplicate generated resource identity ${resource.table}/${resource.key}`);
    resourceIdentities.add(identity);
    const path = inside(join(fsdbRoot, `[resource]${resource.table}`), resource.path);
    const info = await stat(path);
    if (!info.isFile() || info.size !== Number(resource.size)) throw new Error(`generated resource is missing or has wrong size: ${resource.table}/${resource.key}`);
    if (typeof resource.sha256 !== "string" || !/^[a-f0-9]{64}$/u.test(resource.sha256) || await sha256File(path) !== resource.sha256) {
      throw new Error(`generated resource hash differs from the generation manifest: ${resource.table}/${resource.key}`);
    }
  }

  const mapKeys = manifest.tables.Map;
  if (!Array.isArray(mapKeys) || !["7", "21", "47", "66"].every((key) => mapKeys.includes(key))) throw new Error("generation manifest does not contain the required complete map samples");
  const maps = new Map();
  for (const key of mapKeys) {
    const map = JSON.parse(await readFile(join(fsdbRoot, "[struct]Map", `${key}.json`), "utf8"));
    validateMap(map, key);
    maps.set(key, map);
    if (!manifest.tables.Tileset?.includes(String(map.tileset_id))) throw new Error(`Map ${key} references a missing Tileset`);
  }
  const expectedBehaviors = manifest.map21BridgeAudit.map((item) => ({ kind: "bridge", operation: item.operation, occupied: item.occupied.map(({ x, y }) => ({ x, y })) }));
  if (JSON.stringify(maps.get("21").behaviors) !== JSON.stringify(expectedBehaviors)) throw new Error("Map21 behaviors differ from the complete eight-event audit");

  for (const key of manifest.tables.Tileset ?? []) {
    const tileset = JSON.parse(await readFile(join(fsdbRoot, "[struct]Tileset", `${key}.json`), "utf8"));
    if (!Object.hasOwn(tileset, "terrain_tags") || !resourceIdentities.has(`Graphics\0Tilesets/${tileset.tileset_name}`)) {
      throw new Error(`Tileset ${key} is incomplete or missing its image resource`);
    }
    for (const name of tileset.autotile_names ?? []) {
      if (name !== null && !resourceIdentities.has(`Graphics\0Autotiles/${name}`)) throw new Error(`Tileset ${key} is missing autotile ${name}`);
    }
  }

  const guidePath = join(fsdbRoot, "[struct]NPC", "loomrealm-local-guide.json");
  const guide = JSON.parse(await readFile(guidePath, "utf8"));
  exactKeys(guide, ["name", "sprite"], "local guide NPC");
  exactKeys(guide.sprite, ["namespace", "key"], "local guide NPC sprite");
  if (guide.name !== "LoomRealm Local Guide" || guide.sprite.namespace !== "resource.Graphics" || guide.sprite.key !== "Characters/NPC 01"
    || !resourceIdentities.has(`Graphics\0${guide.sprite.key}`)) throw new Error("local guide NPC definition or sprite resource is invalid");

  await access(join(fsdbRoot, "[resource]Presentation", "map", "map.browser.js.js"));
  await access(join(fsdbRoot, "[resource]Presentation", "map", "map.css.css"));
  await access(join(fsdbRoot, "[resource]Presentation", "page.css.css"));
  return fsdbRoot;
}

async function main() {
  const exampleRoot = process.argv[2];
  if (!exampleRoot) throw new Error("missing example root");
  const workRoot = process.argv[3];
  if (workRoot) await assertNoPendingBackup(workRoot);
  const fsdbRoot = await verifyReimport(exampleRoot);
  process.stdout.write(`FSDB ready: ${fsdbRoot}\nChecked: generation manifest, complete Map/schema/resources, Map21 eight-event audit, no MapAction, NPC, Presentation\n`);
}

const invoked = process.argv[1] && fileURLToPath(import.meta.url).toLowerCase() === resolve(process.argv[1]).toLowerCase();
if (invoked) await main().catch((error) => { process.stderr.write(`verify-reimport: ${error.message}\n`); process.exitCode = 1; });
