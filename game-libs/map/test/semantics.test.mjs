import assert from "node:assert/strict";
import test from "node:test";
import mapDefinition from "@loomrealm-game/map";
import { canMove, computeCamera, mapTilePassable, projectVisibleTiles, tableAt, validateMapRecord, validateTable, validateTilesetRecord } from "../dist/semantics.js";

const table = (dimensions, xSize, ySize, zSize, values) => ({ dimensions, xSize, ySize, zSize, values });
function fixture() {
  const values = Array(24 * 18 * 3).fill(0);
  for (let y = 0; y < 18; y += 1) for (let x = 0; x < 24; x += 1) values[x + y * 24] = 384;
  values[12 + 8 * 24] = 385;
  const passages = Array(386).fill(0); passages[385] = 0x02;
  const priorities = Array(386).fill(0); priorities[0] = 5;
  return {
    map: { tileset_id: 1, width: 24, height: 18, data: table(3, 24, 18, 3, values) },
    tileset: { id: 1, tileset_name: "m14_tileset", passages: table(1, 386, 1, 1, passages), priorities: table(1, 386, 1, 1, priorities) },
  };
}

test("Table, camera and visible projection follow frozen ordering", () => {
  const { map: raw } = fixture(); const map = validateMapRecord(raw);
  assert.equal(tableAt(map.data, 12, 8, 0), 385);
  assert.deepEqual(computeCamera(map, 10, 8), { cameraX: 16, cameraY: 32 });
  const tiles = projectVisibleTiles(map, 16, 32);
  assert.deepEqual(tiles[0], { x: 0, y: 1, z: 0, tileId: 384 });
  assert.ok(tiles.find((tile) => tile.x === 12 && tile.y === 8 && tile.tileId === 385));
});

test("one long-lived Frame accepts one move and one persisted reverse-entry block", async () => {
  const { map, tileset } = fixture();
  const records = { "struct.Map/1": map, "struct.Tileset/1": tileset };
  let handler; const states = []; let listenerClosed = false; let domainClosed = false;
  const definition = mapDefinition({
    signal: new AbortController().signal,
    content: {
      async record(namespace, key) { return { value: records[`${namespace}/${key}`], contentVersion: "v-record" }; },
      async resource() { return { bytes: new Uint8Array([1]), mime: "image/png", contentVersion: "v-image" }; },
    },
    createInputListener() { return { on(channel, value) { assert.equal(channel, "keyboard.event"); handler = value; return () => {}; }, setChannels() {}, close() { listenerClosed = true; } }; },
    createRenderDomain(initial) { states.push(initial); return { replace(state) { states.push(state); }, emit() {}, close() { domainClosed = true; } }; },
  });
  const controller = new AbortController();
  const pending = definition.frame({ id: "f", params: { mapId: 1, x: 10, y: 8, characterName: "m14_player" }, signal: controller.signal, async call() { throw new Error("unused"); } });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(states.length, 1);
  await handler({ action: "down", code: "ArrowRight", repeat: false });
  assert.deepEqual(states.at(-1).roots[0].children[0].data, { x: 11, y: 8, screenX: 304, screenY: 224, direction: 6, pattern: 0, sprite: { namespace: "resource.Graphics", key: "Characters/m14_player", contentVersion: "v-image" } });
  assert.equal(states.at(-1).roots[0].data.cameraX, 48);
  await handler({ action: "down", code: "ArrowRight", repeat: false });
  assert.equal(states.at(-1).roots[0].children[0].data.x, 11);
  assert.equal(states.at(-1).roots[0].children[0].data.direction, 6);
  controller.abort();
  assert.deepEqual(await pending, { type: "cancelled" });
  assert.equal(listenerClosed, true); assert.equal(domainClosed, true);
});

test("consumer records fail closed instead of accepting alternate shapes", () => {
  const { map, tileset } = fixture();
  assert.throws(() => validateMapRecord({ ...map, events: [] }), /field set/);
  assert.throws(() => validateTilesetRecord({ ...tileset, id: 2 }, 1), /Content key/);
  assert.throws(() => validateTable({ ...map.data, surprise: true }, "Map.data"), /field set/);
});

test("passability covers every direction bit and the all-direction block", () => {
  const directionBits = [[2, 0x01], [4, 0x02], [6, 0x04], [8, 0x08]];
  for (const [direction, bit] of directionBits) {
    const raw = fixture();
    raw.tileset.passages.values[384] = bit;
    const map = validateMapRecord(raw.map);
    const tileset = validateTilesetRecord(raw.tileset, 1);
    assert.equal(mapTilePassable(map, tileset, 10, 8, direction), false, `direction ${direction}`);
    const otherDirection = direction === 2 ? 4 : 2;
    assert.equal(mapTilePassable(map, tileset, 10, 8, otherDirection), true, `non-matching direction ${otherDirection}`);
  }
  const raw = fixture();
  raw.tileset.passages.values[384] = 0x0f;
  const map = validateMapRecord(raw.map);
  const tileset = validateTilesetRecord(raw.tileset, 1);
  for (const [direction] of directionBits) assert.equal(mapTilePassable(map, tileset, 10, 8, direction), false);
});

test("passability respects z=2,1,0 priority layering and bounds", () => {
  const raw = fixture();
  const index = 10 + 8 * 24;
  raw.map.data.values[index + 2 * 24 * 18] = 385;
  raw.tileset.passages.values[385] = 0;
  raw.tileset.priorities.values[385] = 1;
  raw.tileset.passages.values[384] = 0x04;
  let map = validateMapRecord(raw.map);
  let tileset = validateTilesetRecord(raw.tileset, 1);
  assert.equal(mapTilePassable(map, tileset, 10, 8, 6), false, "priority > 0 continues to a blocked lower layer");

  raw.tileset.priorities.values[385] = 0;
  map = validateMapRecord(raw.map);
  tileset = validateTilesetRecord(raw.tileset, 1);
  assert.equal(mapTilePassable(map, tileset, 10, 8, 6), true, "priority == 0 decides pass before the lower layer");
  assert.equal(mapTilePassable(map, tileset, -1, 8, 6), false);
  assert.equal(mapTilePassable(map, tileset, 24, 8, 6), false);
});

test("movement checks both source direction and target reverse direction", () => {
  const sourceBlocked = fixture();
  sourceBlocked.tileset.passages.values[384] = 0x04;
  assert.equal(canMove(validateMapRecord(sourceBlocked.map), validateTilesetRecord(sourceBlocked.tileset, 1), 10, 8, 6, 1, 0), false);

  const targetBlocked = fixture();
  targetBlocked.map.data.values[11 + 8 * 24] = 385;
  targetBlocked.tileset.passages.values[385] = 0x02;
  assert.equal(canMove(validateMapRecord(targetBlocked.map), validateTilesetRecord(targetBlocked.tileset, 1), 10, 8, 6, 1, 0), false);

  const passable = fixture();
  assert.equal(canMove(validateMapRecord(passable.map), validateTilesetRecord(passable.tileset, 1), 10, 8, 6, 1, 0), true);
  assert.equal(canMove(validateMapRecord(passable.map), validateTilesetRecord(passable.tileset, 1), 23, 8, 6, 1, 0), false);
});
