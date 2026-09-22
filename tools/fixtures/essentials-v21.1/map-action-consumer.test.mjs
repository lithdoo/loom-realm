import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { occupiedTiles, projectMapActionRecord, materializeMapActionRecords } from "./lib/essentials/v21.1/map-action-consumer.mjs";
import { decodeRxdataBytes, defaultLocalFsdb } from "./lib/essentials/v21.1/map-event-evidence.mjs";
import { projectTilesetRecords } from "./lib/essentials/v21.1/m14-consumer.mjs";
import { mapCanonicalDataset } from "./lib/fsdb/mapper.mjs";

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const table = (dimensions, xSize, ySize, zSize, values) => ({
  kind: "Table",
  dimensions,
  xSize,
  ySize,
  zSize,
  values: Int16Array.from(values),
  rubyObjectId: 1,
  ivars: {},
});
const object = (className, fields) => ({ kind: "RmxpObject", className, fields, extraIvars: {}, rubyObjectId: 2 });
const string = (text) => ({ kind: "RubyString", text, bytes: Buffer.from(text), ivars: {} });
const array = (items) => ({ kind: "Array", items });
const hash = (entries) => ({ kind: "Hash", entries });

function command(code, parameters = []) {
  return object("RPG::EventCommand", {
    "@code": code,
    "@indent": 0,
    "@parameters": array(parameters.map((item) => (typeof item === "string" ? string(item) : item))),
  });
}

function page(fields) {
  return object("RPG::Event::Page", {
    "@through": fields.through ?? true,
    "@trigger": fields.trigger ?? 1,
    "@graphic": object("RPG::Event::Page::Graphic", {
      "@tile_id": fields.tileId ?? 0,
      "@character_name": string(fields.characterName ?? ""),
      "@character_hue": 0,
      "@direction": 2,
      "@pattern": 0,
      "@opacity": 255,
      "@blend_type": 0,
    }),
    "@list": array(fields.commands ?? []),
  });
}

function event(id, name, x, y, pages) {
  return object("RPG::Event", {
    "@id": id,
    "@name": string(name),
    "@x": x,
    "@y": y,
    "@pages": array(pages),
  });
}

function mapEntry(id, events) {
  return {
    filename: `Map${String(id).padStart(3, "0")}.rxdata`,
    root: object("RPG::Map", {
      "@tileset_id": 1,
      "@width": 8,
      "@height": 8,
      "@data": table(3, 8, 8, 3, Array(8 * 8 * 3).fill(0)),
      "@events": hash(events),
    }),
  };
}

test("occupiedTiles uses bottom-left origin and size(1,4) covers four cells", () => {
  assert.deepEqual(occupiedTiles(20, 49, 1, 4).map((tile) => `${tile.x},${tile.y}`), ["20,46", "20,47", "20,48", "20,49"]);
  assert.deepEqual(occupiedTiles(14, 32, 3, 1).map((tile) => `${tile.x},${tile.y}`), ["14,32", "15,32", "16,32"]);
});

test("projects confirmable pbBridgeOn/Off and omits unrelated NPCs", () => {
  const on = event(4, "size(1,4)", 20, 49, [page({
    commands: [command(355, ["pbBridgeOn"]), command(0)],
  })]);
  const off = event(28, "size(1,4)", 19, 49, [page({
    commands: [command(355, ["pbBridgeOff"]), command(0)],
  })]);
  const npc = event(99, "NPC", 1, 1, [page({
    through: false,
    commands: [command(101, ["hello"]), command(0)],
  })]);
  const projected = projectMapActionRecord(mapEntry(21, [[4, on], [28, off], [99, npc]]));
  assert.equal(projected.key, "21");
  assert.equal(projected.value.schemaVersion, "struct.MapAction/v1-bridge");
  assert.equal(projected.value.opaqueRelated.length, 0);
  assert.equal(projected.value.actions.length, 2);
  assert.equal(projected.value.actions[0].op, "bridge-on");
  assert.equal(projected.value.actions[0].height, 2);
  assert.equal(projected.value.actions[0].eventId, 4);
  assert.equal(projected.value.actions[0].through, true);
  assert.equal(projected.value.actions[0].emptyGraphic, true);
  assert.equal(projected.value.actions[1].op, "bridge-off");
  assert.equal(projected.value.actions[1].eventId, 28);
  assert.deepEqual(projected.value.actions[0].occupied.map((tile) => `${tile.x},${tile.y}`), ["20,46", "20,47", "20,48", "20,49"]);
});

test("confirmable Off is a single script page; mixed bridge scripts are opaque-related", () => {
  const mixed = event(28, "size(1,4)", 19, 49, [page({
    commands: [command(355, ["pbBridgeOn(2)"]), command(655, ["pbBridgeOff"]), command(0)],
  })]);
  const off = event(7, "size(3,1)", 14, 31, [page({
    commands: [command(355, ["pbBridgeOff"]), command(0)],
  })]);
  const projected = projectMapActionRecord(mapEntry(21, [[28, mixed], [7, off]]));
  assert.equal(projected.value.actions.length, 1);
  assert.equal(projected.value.actions[0].op, "bridge-off");
  assert.equal(projected.value.actions[0].height, null);
  assert.equal(projected.value.opaqueRelated.length, 1);
  assert.equal(projected.value.opaqueRelated[0].eventId, 28);
  assert.equal(projected.value.opaqueRelated[0].reason, "bridge-script-not-statically-confirmable");
  assert.ok(projected.value.opaqueRelated[0].occupied.length > 0);
});

test("comment commands do not disqualify a confirmable bridge page", () => {
  const commented = event(4, "size(1,1)", 2, 2, [page({
    through: false,
    commands: [command(108, ["bridge on"]), command(355, ["pbBridgeOn(2)"]), command(0)],
  })]);
  const named = event(5, "size(1,1)", 3, 3, [page({
    through: false,
    characterName: "NPC",
    commands: [command(355, ["pbBridgeOff"]), command(0)],
  })]);
  const projected = projectMapActionRecord(mapEntry(21, [[4, commented], [5, named]]));
  assert.equal(projected.value.actions.length, 2);
  assert.equal(projected.value.actions.find((action) => action.eventId === 4).emptyGraphic, true);
  assert.equal(projected.value.actions.find((action) => action.eventId === 5).emptyGraphic, false);
});

test("unrelated NPCs do not fail the map; related opaque scripts fail closed per page", () => {
  const npc = event(2, "Villager", 3, 3, [page({
    trigger: 0,
    commands: [command(101, ["hi"]), command(0)],
  })]);
  const dynamic = event(10, "Bridge?", 5, 5, [page({
    commands: [command(355, ["pbBridgeOn(eval(2))"]), command(0)],
  })]);
  const wrongTrigger = event(11, "size(1,1)", 6, 6, [page({
    trigger: 2,
    commands: [command(355, ["pbBridgeOff"]), command(0)],
  })]);
  const extraCommand = event(12, "size(1,1)", 7, 7, [page({
    commands: [command(355, ["pbBridgeOff"]), command(101, ["no"]), command(0)],
  })]);
  const projected = projectMapActionRecord(mapEntry(8, [[2, npc], [10, dynamic], [11, wrongTrigger], [12, extraCommand]]));
  assert.equal(projected.value.actions.length, 0);
  assert.equal(projected.value.opaqueRelated.length, 3);
  assert.ok(projected.value.opaqueRelated.some((item) => item.reason === "dynamic-ruby"));
  assert.ok(projected.value.opaqueRelated.some((item) => item.reason === "bridge-candidate-trigger-is-not-player-touch"));
  assert.ok(projected.value.opaqueRelated.some((item) => item.reason.startsWith("bridge-page-contains-non-whitelist-command-")));
});

test("maps without events still retain empty MapAction conversion evidence", () => {
  const projected = projectMapActionRecord({
    filename: "Map007.rxdata",
    root: object("RPG::Map", {
      "@tileset_id": 1,
      "@width": 2,
      "@height": 2,
      "@data": table(3, 2, 2, 3, Array(12).fill(0)),
    }),
  });
  assert.deepEqual(projected.value, {
    id: 7,
    schemaVersion: "struct.MapAction/v1-bridge",
    actions: [],
    opaqueRelated: [],
  });
});

test("mapper retains MapAction evidence internally but never writes the legacy runtime table", async () => {
  const records = materializeMapActionRecords([mapEntry(21, [])]);
  const plan = mapCanonicalDataset({ domains: { MapAction: records } });
  assert.equal(records.length, 1);
  assert.equal(plan.objects.some((item) => item.table === "MapAction"), false);
  assert.equal(plan.tables.some((item) => item.name === "MapAction"), false);
});

test("live Map7/21/47 source sample: terrain_tags and MapAction (SKIP when FSDB missing)", async (t) => {
  const fsdb = defaultLocalFsdb(repoRoot);
  const tilesetsPath = join(fsdb, "[resource]Data", "Tilesets.rxdata");
  if (!existsSync(tilesetsPath)) {
    t.skip("local official FSDB is not present; synthetic MapAction/Tileset tests still ran");
    return;
  }
  const tilesets = decodeRxdataBytes(await readFile(tilesetsPath), tilesetsPath).root;
  const projectedTilesets = projectTilesetRecords({ filename: "Tilesets.rxdata", root: tilesets });
  assert.ok(projectedTilesets.length > 0);
  for (const record of projectedTilesets) {
    assert.deepEqual(Object.keys(record.value), ["id", "tileset_name", "autotile_names", "passages", "priorities", "terrain_tags"]);
    assert.equal(record.value.passages.xSize, record.value.terrain_tags.xSize);
    assert.ok(record.value.terrain_tags.values.every((tag) => tag >= 0 && tag <= 17));
  }
  const map21 = decodeRxdataBytes(await readFile(join(fsdb, "[resource]Data", "Map021.rxdata")), "Map021.rxdata").root;
  const actions21 = projectMapActionRecord({ filename: "Map021.rxdata", root: map21 });
  const ops = new Map(actions21.value.actions.map((action) => [action.eventId, action.op]));
  assert.equal(ops.get(4), "bridge-on");
  assert.equal(ops.get(28), "bridge-off");
  assert.equal(ops.get(10), "bridge-on");
  assert.equal(ops.get(7), "bridge-off");
  assert.equal(ops.get(22), "bridge-on");
  assert.equal(ops.get(20), "bridge-off");
  assert.equal(ops.get(25), "bridge-on");
  assert.equal(ops.get(23), "bridge-off");
  assert.equal(actions21.value.actions.length, 8);
  assert.ok(actions21.value.actions.every((action) => action.through === false && action.emptyGraphic === true));
  const map7 = projectMapActionRecord({
    filename: "Map007.rxdata",
    root: decodeRxdataBytes(await readFile(join(fsdb, "[resource]Data", "Map007.rxdata")), "Map007.rxdata").root,
  });
  assert.equal(map7.value.actions.some((action) => action.op === "bridge-on" || action.op === "bridge-off"), false);
  const map47 = projectMapActionRecord({
    filename: "Map047.rxdata",
    root: decodeRxdataBytes(await readFile(join(fsdb, "[resource]Data", "Map047.rxdata")), "Map047.rxdata").root,
  });
  assert.equal(map47.value.actions.length, 0);
});
