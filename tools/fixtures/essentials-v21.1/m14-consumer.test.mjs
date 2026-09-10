import assert from "node:assert/strict";
import test from "node:test";
import { projectMapRecord, projectTable, projectTilesetRecords } from "./lib/essentials/v21.1/m14-consumer.mjs";
import { mapCanonicalDataset } from "./lib/fsdb/mapper.mjs";

const table = (dimensions, xSize, ySize, zSize, values) => ({ kind: "Table", dimensions, xSize, ySize, zSize, values: Int16Array.from(values), rubyObjectId: 1, ivars: {} });
const object = (className, fields) => ({ kind: "RmxpObject", className, fields, extraIvars: {}, rubyObjectId: 2 });
const string = (text) => ({ kind: "RubyString", text, bytes: Buffer.from(text), ivars: {} });

test("projects MapNNN and Tables to exact ordinary JSON consumer records", () => {
  const values = Array(4 * 3 * 3).fill(0);
  values[2 + 1 * 4] = 385;
  const result = projectMapRecord({ filename: "Map001.rxdata", root: object("RPG::Map", {
    "@tileset_id": 1, "@width": 4, "@height": 3, "@data": table(3, 4, 3, 3, values), "@events": { forbidden: true },
  }) });
  assert.equal(result.key, "1");
  assert.deepEqual(Object.keys(result.value), ["tileset_id", "width", "height", "data"]);
  assert.deepEqual(Object.keys(result.value.data), ["dimensions", "xSize", "ySize", "zSize", "values"]);
  assert.equal(result.value.data.values[2 + 1 * 4], 385);
  assert.ok(Array.isArray(result.value.data.values));
});

test("projects Tilesets by source index and rejects id mismatch", () => {
  const make = (id) => object("RPG::Tileset", {
    "@id": id, "@tileset_name": string("m14_tileset"),
    "@passages": table(1, 386, 1, 1, Array(386).fill(0)),
    "@priorities": table(1, 386, 1, 1, Array(386).fill(0)),
  });
  const projected = projectTilesetRecords({ filename: "Tilesets.rxdata", root: { kind: "Array", items: [null, make(1)] } });
  assert.deepEqual(Object.keys(projected[0].value), ["id", "tileset_name", "passages", "priorities"]);
  assert.throws(() => projectTilesetRecords({ filename: "Tilesets.rxdata", root: { kind: "Array", items: [null, make(2)] } }), /does not match/);
});

test("omits only unreferenced empty-name v21.1 placeholders and rejects referenced ones", () => {
  const empty = object("RPG::Tileset", {
    "@id": 1, "@tileset_name": string(""),
    "@passages": table(1, 1, 1, 1, [0]), "@priorities": table(1, 1, 1, 1, [0]),
  });
  const entry = { filename: "Tilesets.rxdata", root: { kind: "Array", items: [null, empty] } };
  assert.deepEqual(projectTilesetRecords(entry), []);
  assert.throws(() => projectTilesetRecords(entry, new Set([1])), /non-empty Ruby string/);
});

test("fails closed for malformed required Table facts", () => {
  assert.throws(() => projectTable(table(3, 2, 2, 3, [1]), "bad"), /invalid value count/);
});

test("production FSDB plan writes M14 consumer values as ordinary JSON", async () => {
  const map = projectMapRecord({ filename: "Map001.rxdata", root: object("RPG::Map", {
    "@tileset_id": 1, "@width": 1, "@height": 1, "@data": table(3, 1, 1, 3, [384, 0, 0]),
  }) });
  const plan = mapCanonicalDataset({ domains: { Map: [map] } });
  const chunks = []; for await (const chunk of plan.objects[0].open()) chunks.push(chunk);
  const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  assert.deepEqual(Object.keys(value), ["tileset_id", "width", "height", "data"]);
  assert.equal(JSON.stringify(value).includes("$id"), false);
  assert.equal(JSON.stringify(value).includes("$array"), false);
});
