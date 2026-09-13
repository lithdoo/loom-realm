import assert from "node:assert/strict";
import test from "node:test";
import { canMove, computeCamera, mapTilePassable, projectVisibleTiles, tableAt, tileVisualDepth, validateMapRecord, validateTable, validateTilesetRecord } from "../dist/semantics.js";

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

test("tileVisualDepth matches the frozen RMXP vectors", () => {
  assert.equal(tileVisualDepth(0, 0), 0);
  assert.equal(tileVisualDepth(0, 1), 64);
  assert.equal(tileVisualDepth(1, 1), 96);
  assert.equal(tileVisualDepth(0, 2), 96);
});

test("Table, camera and visible projection follow frozen ordering", () => {
  const { map: raw, tileset: rawTileset } = fixture();
  const map = validateMapRecord(raw);
  const tileset = validateTilesetRecord(rawTileset, 1);
  assert.equal(tableAt(map.data, 12, 8, 0), 385);
  assert.deepEqual(computeCamera(map, 10, 8), { cameraX: 16, cameraY: 32 });
  const tiles = projectVisibleTiles(map, tileset, 16, 32);
  assert.deepEqual(tiles[0], { x: 0, y: 0, z: 0, tileId: 384, depth: 0 });
  assert.ok(tiles.find((tile) => tile.x === 12 && tile.y === 8 && tile.tileId === 385));
});

test("visible projection clamps one-tile overscan to map bounds", () => {
  const { map: raw, tileset: rawTileset } = fixture();
  const map = validateMapRecord(raw);
  const tileset = validateTilesetRecord(rawTileset, 1);
  const origin = projectVisibleTiles(map, tileset, 0, 0);
  assert.equal(origin[0].x, 0);
  assert.equal(origin[0].y, 0);
  assert.equal(origin.some((tile) => tile.x < 0 || tile.y < 0), false);
  const far = projectVisibleTiles(map, tileset, map.width * 32, map.height * 32);
  assert.equal(far.some((tile) => tile.x >= map.width || tile.y >= map.height), false);
  assert.ok(far.find((tile) => tile.x === map.width - 1 && tile.y === map.height - 1));
});

test("target camera overscan covers the previous step's source camera edge", () => {
  const { map: raw, tileset: rawTileset } = fixture();
  const map = validateMapRecord(raw);
  const tileset = validateTilesetRecord(rawTileset, 1);
  const source = computeCamera(map, 10, 8);
  const target = computeCamera(map, 11, 8);
  assert.deepEqual(source, { cameraX: 16, cameraY: 32 });
  assert.deepEqual(target, { cameraX: 48, cameraY: 32 });
  const sourceEdgeX = Math.floor(source.cameraX / 32);
  const tiles = projectVisibleTiles(map, tileset, target.cameraX, target.cameraY);
  assert.ok(tiles.find((tile) => tile.x === sourceEdgeX && tile.y === Math.floor(source.cameraY / 32)));
  assert.ok(tiles.find((tile) => tile.x === Math.min(map.width - 1, Math.floor((target.cameraX + 639) / 32) + 1)));
});

test("Tileset.priorities accepts 0 through 5 and rejects the rest", () => {
  const accepted = fixture();
  accepted.tileset.priorities.values[384] = 0;
  accepted.tileset.priorities.values[385] = 5;
  assert.doesNotThrow(() => validateTilesetRecord(accepted.tileset, 1));

  const tooLow = fixture();
  tooLow.tileset.priorities.values[384] = -1;
  assert.throws(() => validateTilesetRecord(tooLow.tileset, 1), /priorities/);

  const tooHigh = fixture();
  tooHigh.tileset.priorities.values[384] = 6;
  assert.throws(() => validateTilesetRecord(tooHigh.tileset, 1), /priorities/);
});

test("projection depth follows priority while z/y/x order stays fixed", () => {
  const raw = fixture();
  const map = validateMapRecord(raw.map);
  const tilesetPriority0 = validateTilesetRecord(raw.tileset, 1);
  const tilesPriority0 = projectVisibleTiles(map, tilesetPriority0, 16, 32);
  const sample0 = tilesPriority0.find((tile) => tile.x === 0 && tile.y === 1 && tile.tileId === 384);
  assert.equal(sample0.depth, 0);

  raw.tileset.priorities.values[384] = 1;
  const tilesetPriority1 = validateTilesetRecord(raw.tileset, 1);
  const tilesPriority1 = projectVisibleTiles(map, tilesetPriority1, 16, 32);
  const sample1 = tilesPriority1.find((tile) => tile.x === 0 && tile.y === 1 && tile.tileId === 384);
  assert.equal(sample1.depth, 96);
  assert.notEqual(sample0.depth, sample1.depth);
  assert.deepEqual(
    tilesPriority0.map(({ x, y, z, tileId }) => ({ x, y, z, tileId })),
    tilesPriority1.map(({ x, y, z, tileId }) => ({ x, y, z, tileId })),
  );
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
