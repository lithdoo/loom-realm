import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifyReimport } from "../examples/essentials-v21.1-local/scripts/verify-reimport.mjs";

const audit = [
  [4, 0, 20, 49, "on", [[20, 46], [20, 47], [20, 48], [20, 49]]],
  [28, 0, 19, 49, "off", [[19, 46], [19, 47], [19, 48], [19, 49]]],
  [7, 0, 14, 31, "off", [[14, 31], [15, 31], [16, 31]]],
  [10, 0, 14, 32, "on", [[14, 32], [15, 32], [16, 32]]],
  [20, 0, 22, 58, "off", [[22, 58], [23, 58]]],
  [22, 0, 22, 57, "on", [[22, 57], [23, 57]]],
  [23, 0, 14, 69, "off", [[14, 69], [15, 69]]],
  [25, 0, 14, 68, "on", [[14, 68], [15, 68]]],
].map(([eventId, pageIndex, x, y, operation, occupied]) => ({
  eventId, pageIndex, position: { x, y }, operation,
  occupied: occupied.map(([cellX, cellY]) => ({ x: cellX, y: cellY })),
  trigger: 1, through: false, emptyGraphic: true,
}));

function map(width, height, behaviors = []) {
  return { tileset_id: 1, width, height, data: { dimensions: 3, xSize: width, ySize: height, zSize: 3, values: Array(width * height * 3).fill(0) }, behaviors };
}

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "rpgmap-verify-complete-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const fsdb = join(root, "[FSDB]candidate");
  for (const table of ["Map", "Tileset", "NPC", "测试信息"]) await mkdir(join(fsdb, `[struct]${table}`), { recursive: true });
  for (const table of ["Map", "Tileset", "NPC"]) await writeFile(join(fsdb, `[struct]${table}`, ".info.meta"), '{"type":"object"}\n');
  const behaviors = audit.map((item) => ({ kind: "bridge", operation: item.operation, occupied: item.occupied }));
  await writeFile(join(fsdb, "[struct]Map", "7.json"), `${JSON.stringify(map(1, 1))}\n`);
  await writeFile(join(fsdb, "[struct]Map", "21.json"), `${JSON.stringify(map(40, 77, behaviors))}\n`);
  await writeFile(join(fsdb, "[struct]Map", "47.json"), `${JSON.stringify(map(1, 1))}\n`);
  await writeFile(join(fsdb, "[struct]Map", "66.json"), `${JSON.stringify(map(12, 10))}\n`);
  await writeFile(join(fsdb, "[struct]Tileset", "1.json"), '{"tileset_name":"tiles","autotile_names":[null,null,null,null,null,null,null],"terrain_tags":[]}\n');
  await writeFile(join(fsdb, "[struct]NPC", "loomrealm-local-guide.json"), '{"name":"LoomRealm Local Guide","sprite":{"namespace":"resource.Graphics","key":"Characters/NPC 01"}}\n');
  await mkdir(join(fsdb, "[resource]Graphics", "Tilesets"), { recursive: true });
  await mkdir(join(fsdb, "[resource]Graphics", "Characters"), { recursive: true });
  await writeFile(join(fsdb, "[resource]Graphics", "Tilesets", "tiles.png"), "t");
  await writeFile(join(fsdb, "[resource]Graphics", "Characters", "NPC 01.png"), "n");
  await mkdir(join(fsdb, "[resource]Presentation", "map"), { recursive: true });
  await writeFile(join(fsdb, "[resource]Presentation", "map", "map.browser.js.js"), "browser");
  await writeFile(join(fsdb, "[resource]Presentation", "map", "map.css.css"), "css");
  await writeFile(join(fsdb, "[resource]Presentation", "page.css.css"), "page");
  const manifest = {
    schemaVersion: "loomrealm.essentials-v21.1-generation/v1",
    tables: { Map: ["7", "21", "47", "66"], Tileset: ["1"], NPC: ["loomrealm-local-guide"] },
    resources: [
      { table: "Graphics", key: "Characters/NPC 01", path: "Characters/NPC 01.png", size: "1", sha256: "fixture" },
      { table: "Graphics", key: "Tilesets/tiles", path: "Tilesets/tiles.png", size: "1", sha256: "fixture" },
    ],
    map21BridgeAudit: audit,
  };
  await writeFile(join(fsdb, "[struct]测试信息", "生成清单.json"), `${JSON.stringify(manifest)}\n`);
  return { root, fsdb };
}

test("verify-reimport accepts a complete manifest-backed FSDB", async (t) => {
  const item = await fixture(t);
  assert.equal(await verifyReimport(item.root), item.fsdb);
});

test("verify-reimport rejects a missing generated Map record", async (t) => {
  const item = await fixture(t);
  await unlink(join(item.fsdb, "[struct]Map", "47.json"));
  await assert.rejects(verifyReimport(item.root), /record set differs/u);
});

test("verify-reimport rejects Map21 behavior drift from the eight-event audit", async (t) => {
  const item = await fixture(t);
  const path = join(item.fsdb, "[struct]Map", "21.json");
  const value = JSON.parse(await readFile(path, "utf8"));
  value.behaviors[0].operation = "off";
  await writeFile(path, `${JSON.stringify(value)}\n`);
  await assert.rejects(verifyReimport(item.root), /Map21 behaviors differ/u);
});

test("verify-reimport rejects a resource listed by the generation plan when it is missing", async (t) => {
  const item = await fixture(t);
  await unlink(join(item.fsdb, "[resource]Graphics", "Characters", "NPC 01.png"));
  await assert.rejects(verifyReimport(item.root), /resource/u);
});

test("verify-reimport rejects incomplete Presentation", async (t) => {
  const item = await fixture(t);
  await unlink(join(item.fsdb, "[resource]Presentation", "map", "map.css.css"));
  await assert.rejects(verifyReimport(item.root), (error) => error?.code === "ENOENT");
});
