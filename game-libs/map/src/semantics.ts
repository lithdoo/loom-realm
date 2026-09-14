export type Direction = 2 | 4 | 6 | 8;

export interface ProjectedTable {
  readonly dimensions: number;
  readonly xSize: number;
  readonly ySize: number;
  readonly zSize: number;
  readonly values: readonly number[];
}

export interface MapRecord {
  readonly tileset_id: number;
  readonly width: number;
  readonly height: number;
  readonly data: ProjectedTable;
}

export interface TilesetRecord {
  readonly id: number;
  readonly tileset_name: string;
  readonly autotile_names: readonly (string | null)[];
  readonly passages: ProjectedTable;
  readonly priorities: ProjectedTable;
}

export type TargetDirection = Direction | null;

export interface StepTransfer {
  readonly x: number;
  readonly y: number;
  readonly targetMapId: number;
  readonly targetX: number;
  readonly targetY: number;
  readonly targetDirection: TargetDirection;
}

export interface ContactTransfer {
  readonly x: number;
  readonly y: number;
  readonly direction: Direction;
  readonly targetMapId: number;
  readonly targetX: number;
  readonly targetY: number;
  readonly targetDirection: TargetDirection;
}

export interface EdgeTransfer {
  readonly x: number;
  readonly y: number;
  readonly direction: Direction;
  readonly targetMapId: number;
  readonly targetX: number;
  readonly targetY: number;
}

export interface MapTransferRecord {
  readonly id: number;
  readonly steps: readonly StepTransfer[];
  readonly contacts: readonly ContactTransfer[];
  readonly edges: readonly EdgeTransfer[];
}

export type Corner = Readonly<{ sx: number; sy: number }>;
export type AutotileCorners = readonly [Corner, Corner, Corner, Corner];
type AutotileQuarterRow = readonly [number, number, number, number];

export type TileBlit =
  | Readonly<{ kind: "regular"; sourceIndex: number }>
  | Readonly<{ kind: "autotile"; slot: number; corners: AutotileCorners }>;

export interface VisibleTile {
  readonly x: number;
  readonly y: number;
  readonly z: 0 | 1 | 2;
  readonly tileId: number;
  readonly depth: number;
  readonly blit: TileBlit;
}

const TILE_SIZE = 32;

export const AUTOTILE_QUARTERS = [
  [27, 28, 33, 34], [5, 28, 33, 34], [27, 6, 33, 34], [5, 6, 33, 34],
  [27, 28, 33, 12], [5, 28, 33, 12], [27, 6, 33, 12], [5, 6, 33, 12],

  [27, 28, 11, 34], [5, 28, 11, 34], [27, 6, 11, 34], [5, 6, 11, 34],
  [27, 28, 11, 12], [5, 28, 11, 12], [27, 6, 11, 12], [5, 6, 11, 12],

  [25, 26, 31, 32], [25, 6, 31, 32], [25, 26, 31, 12], [25, 6, 31, 12],
  [15, 16, 21, 22], [15, 16, 21, 12], [15, 16, 11, 22], [15, 16, 11, 12],

  [29, 30, 35, 36], [29, 30, 11, 36], [5, 30, 35, 36], [5, 30, 11, 36],
  [39, 40, 45, 46], [5, 40, 45, 46], [39, 6, 45, 46], [5, 6, 45, 46],

  [25, 30, 31, 36], [15, 16, 45, 46], [13, 14, 19, 20], [13, 14, 19, 12],
  [17, 18, 23, 24], [17, 18, 11, 24], [41, 42, 47, 48], [5, 42, 47, 48],

  [37, 38, 43, 44], [37, 6, 43, 44], [13, 18, 19, 24], [13, 14, 43, 44],
  [37, 42, 43, 48], [17, 18, 47, 48], [13, 18, 43, 48], [1, 2, 7, 8],
] as const satisfies readonly AutotileQuarterRow[];

export function tileVisualDepth(y: number, priority: number): number {
  if (priority === 0) return 0;
  return (y + priority + 1) * TILE_SIZE;
}

const directions = Object.freeze({
  ArrowDown: { direction: 2 as const, dx: 0, dy: 1 },
  ArrowLeft: { direction: 4 as const, dx: -1, dy: 0 },
  ArrowRight: { direction: 6 as const, dx: 1, dy: 0 },
  ArrowUp: { direction: 8 as const, dx: 0, dy: -1 },
});

const passageBits: Record<Direction, number> = { 2: 0x01, 4: 0x02, 6: 0x04, 8: 0x08 };

function object(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function integer(value: unknown, label: string, positive = true): number {
  if (!Number.isSafeInteger(value) || (positive ? Number(value) <= 0 : Number(value) < 0)) throw new TypeError(`${label} must be a ${positive ? "positive" : "non-negative"} safe integer`);
  return value as number;
}

export function validateTable(value: unknown, label: string): ProjectedTable {
  const input = object(value, label);
  const fields = ["dimensions", "xSize", "ySize", "zSize", "values"];
  if (!fields.every((key) => key in input) || Object.keys(input).length !== fields.length) throw new TypeError(`${label} has an invalid field set`);
  if (!Array.isArray(input.values)) throw new TypeError(`${label}.values must be an array`);
  const table = {
    dimensions: integer(input.dimensions, `${label}.dimensions`),
    xSize: integer(input.xSize, `${label}.xSize`),
    ySize: integer(input.ySize, `${label}.ySize`),
    zSize: integer(input.zSize, `${label}.zSize`),
    values: Object.freeze(input.values.map((item, index) => {
      if (!Number.isSafeInteger(item)) throw new TypeError(`${label}.values[${index}] must be a safe integer`);
      return item as number;
    })),
  };
  if (table.values.length !== table.xSize * table.ySize * table.zSize) throw new TypeError(`${label}.values has the wrong length`);
  return Object.freeze(table);
}

export function validateMapRecord(value: unknown): MapRecord {
  const input = object(value, "Map");
  if (!(["tileset_id", "width", "height", "data"].every((key) => key in input)) || Object.keys(input).length !== 4) throw new TypeError("Map has an invalid field set");
  const width = integer(input.width, "Map.width");
  const height = integer(input.height, "Map.height");
  const data = validateTable(input.data, "Map.data");
  if (data.dimensions !== 3 || data.xSize !== width || data.ySize !== height || data.zSize !== 3) throw new TypeError("Map.data has an invalid 3D shape");
  return Object.freeze({ tileset_id: integer(input.tileset_id, "Map.tileset_id"), width, height, data });
}

function transferDirection(value: unknown, label: string): Direction {
  if (value !== 2 && value !== 4 && value !== 6 && value !== 8) throw new TypeError(`${label} must be 2, 4, 6, or 8`);
  return value;
}

function targetDirection(value: unknown, label: string): TargetDirection {
  if (value === null) return null;
  return transferDirection(value, label);
}

function exactObject(value: unknown, label: string, fields: readonly string[]): Record<string, unknown> {
  const input = object(value, label);
  if (!fields.every((key) => key in input) || Object.keys(input).length !== fields.length) throw new TypeError(`${label} has an invalid field set`);
  return input;
}

function addUnique(seen: Set<string>, key: string, label: string) {
  if (seen.has(key)) throw new TypeError(`${label} has a duplicate source key`);
  seen.add(key);
}

export function validateMapTransferRecord(value: unknown, contentMapId: number): MapTransferRecord {
  const input = exactObject(value, "MapTransfer", ["id", "steps", "contacts", "edges"]);
  const id = integer(input.id, "MapTransfer.id");
  if (id !== contentMapId) throw new TypeError("MapTransfer.id does not equal its Content key");
  if (!Array.isArray(input.steps) || !Array.isArray(input.contacts) || !Array.isArray(input.edges)) {
    throw new TypeError("MapTransfer steps/contacts/edges must be arrays");
  }
  const stepKeys = new Set<string>();
  const contactKeys = new Set<string>();
  const edgeKeys = new Set<string>();
  const steps = Object.freeze(input.steps.map((item, index) => {
    const label = `MapTransfer.steps[${index}]`;
    const record = exactObject(item, label, ["x", "y", "targetMapId", "targetX", "targetY", "targetDirection"]);
    const x = integer(record.x, `${label}.x`, false);
    const y = integer(record.y, `${label}.y`, false);
    addUnique(stepKeys, `${x},${y}`, label);
    return Object.freeze({
      x,
      y,
      targetMapId: integer(record.targetMapId, `${label}.targetMapId`),
      targetX: integer(record.targetX, `${label}.targetX`, false),
      targetY: integer(record.targetY, `${label}.targetY`, false),
      targetDirection: targetDirection(record.targetDirection, `${label}.targetDirection`),
    });
  }));
  const contacts = Object.freeze(input.contacts.map((item, index) => {
    const label = `MapTransfer.contacts[${index}]`;
    const record = exactObject(item, label, ["x", "y", "direction", "targetMapId", "targetX", "targetY", "targetDirection"]);
    const x = integer(record.x, `${label}.x`, false);
    const y = integer(record.y, `${label}.y`, false);
    const direction = transferDirection(record.direction, `${label}.direction`);
    addUnique(contactKeys, `${x},${y},${direction}`, label);
    return Object.freeze({
      x,
      y,
      direction,
      targetMapId: integer(record.targetMapId, `${label}.targetMapId`),
      targetX: integer(record.targetX, `${label}.targetX`, false),
      targetY: integer(record.targetY, `${label}.targetY`, false),
      targetDirection: targetDirection(record.targetDirection, `${label}.targetDirection`),
    });
  }));
  const edges = Object.freeze(input.edges.map((item, index) => {
    const label = `MapTransfer.edges[${index}]`;
    const record = exactObject(item, label, ["x", "y", "direction", "targetMapId", "targetX", "targetY"]);
    const x = integer(record.x, `${label}.x`, false);
    const y = integer(record.y, `${label}.y`, false);
    const direction = transferDirection(record.direction, `${label}.direction`);
    addUnique(edgeKeys, `${x},${y},${direction}`, label);
    return Object.freeze({
      x,
      y,
      direction,
      targetMapId: integer(record.targetMapId, `${label}.targetMapId`),
      targetX: integer(record.targetX, `${label}.targetX`, false),
      targetY: integer(record.targetY, `${label}.targetY`, false),
    });
  }));
  return Object.freeze({ id, steps, contacts, edges });
}

export function validateTilesetRecord(value: unknown, contentId: number): TilesetRecord {
  const input = exactObject(value, "Tileset", ["id", "tileset_name", "autotile_names", "passages", "priorities"]);
  const id = integer(input.id, "Tileset.id");
  if (id !== contentId) throw new TypeError("Tileset.id does not equal its Content key");
  if (typeof input.tileset_name !== "string" || input.tileset_name.length === 0) throw new TypeError("Tileset.tileset_name must be non-empty");
  if (!Array.isArray(input.autotile_names) || input.autotile_names.length !== 7) throw new TypeError("Tileset.autotile_names must be an array of length 7");
  const autotile_names = Object.freeze(input.autotile_names.map((item, index) => {
    if (item === null) return null;
    if (typeof item !== "string" || item.length === 0) throw new TypeError(`Tileset.autotile_names[${index}] must be null or a non-empty string`);
    return item;
  }));
  const passages = validateTable(input.passages, "Tileset.passages");
  const priorities = validateTable(input.priorities, "Tileset.priorities");
  for (const [name, table] of [["passages", passages], ["priorities", priorities]] as const) {
    if (table.dimensions !== 1 || table.ySize !== 1 || table.zSize !== 1) throw new TypeError(`Tileset.${name} must be a 1D Table`);
  }
  if (priorities.values.some((entry) => entry < 0 || entry > 5)) {
    throw new TypeError("Tileset.priorities values must be integers from 0 through 5");
  }
  return Object.freeze({ id, tileset_name: input.tileset_name, autotile_names, passages, priorities });
}

export function tableAt(table: ProjectedTable, x: number, y = 0, z = 0): number {
  for (const [coordinate, size] of [[x, table.xSize], [y, table.ySize], [z, table.zSize]]) {
    if (!Number.isSafeInteger(coordinate) || coordinate < 0 || coordinate >= size) throw new RangeError("Table coordinate is out of bounds");
  }
  return table.values[x + y * table.xSize + z * table.xSize * table.ySize]!;
}

export function directionForCode(code: string) { return directions[code as keyof typeof directions]; }

export function mapTilePassable(map: MapRecord, tileset: TilesetRecord, x: number, y: number, direction: Direction): boolean {
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return false;
  const bit = passageBits[direction];
  for (const z of [2, 1, 0] as const) {
    const tileId = tableAt(map.data, x, y, z);
    if (!Number.isSafeInteger(tileId) || tileId < 0 || tileId >= tileset.passages.xSize || tileId >= tileset.priorities.xSize) return false;
    const passage = tableAt(tileset.passages, tileId);
    const priority = tableAt(tileset.priorities, tileId);
    if ((passage & bit) !== 0 || (passage & 0x0f) === 0x0f) return false;
    if (priority === 0) return true;
  }
  return true;
}

export function canMove(map: MapRecord, tileset: TilesetRecord, x: number, y: number, direction: Direction, dx: number, dy: number): boolean {
  return mapTilePassable(map, tileset, x, y, direction) && mapTilePassable(map, tileset, x + dx, y + dy, (10 - direction) as Direction);
}

export function computeCamera(map: MapRecord, playerX: number, playerY: number) {
  return Object.freeze({
    cameraX: Math.min(Math.max(playerX * 32 - 304, 0), Math.max(map.width * 32 - 640, 0)),
    cameraY: Math.min(Math.max(playerY * 32 - 224, 0), Math.max(map.height * 32 - 480, 0)),
  });
}

export function autotileCorners(variant: number): AutotileCorners {
  if (!Number.isSafeInteger(variant) || variant < 0 || variant > 47) throw new TypeError("autotile variant must be an integer from 0 through 47");
  const row = AUTOTILE_QUARTERS[variant]!;
  return Object.freeze(row.map((quarter) => {
    const index = quarter - 1;
    return Object.freeze({ sx: (index % 6) * 16, sy: Math.floor(index / 6) * 16 });
  })) as AutotileCorners;
}

export function assertRenderableTileId(tileId: number, tileset: TilesetRecord): void {
  if (!Number.isSafeInteger(tileId) || tileId <= 0) throw new TypeError(`Unsupported map tile id ${tileId}`);
  if (tileId >= tileset.passages.xSize || tileId >= tileset.priorities.xSize) {
    throw new TypeError(`Tileset has no entry for tile id ${tileId}`);
  }
  if (tileId >= 1 && tileId <= 47) throw new TypeError(`Unsupported map tile id ${tileId}`);
  if (tileId >= 48 && tileId <= 383) {
    const slot = Math.floor((tileId - 48) / 48);
    if (slot < 0 || slot > 6 || tileset.autotile_names[slot] === null) {
      throw new TypeError(`Unsupported map tile id ${tileId}`);
    }
  }
}

export function projectTileBlit(tileId: number, tileset: TilesetRecord): TileBlit {
  assertRenderableTileId(tileId, tileset);
  if (tileId >= 384) return Object.freeze({ kind: "regular", sourceIndex: tileId - 384 });
  const slot = Math.floor((tileId - 48) / 48);
  const variant = (tileId - 48) % 48;
  return Object.freeze({ kind: "autotile", slot, corners: autotileCorners(variant) });
}

export function assertProjectable(map: MapRecord, tileset: TilesetRecord): void {
  for (const tileId of map.data.values) {
    if (tileId === 0) continue;
    assertRenderableTileId(tileId, tileset);
  }
}

export function projectVisibleTiles(
  map: MapRecord,
  tileset: TilesetRecord,
  cameraX: number,
  cameraY: number,
): readonly VisibleTile[] {
  const overscan = 1;
  const minX = Math.max(0, Math.floor(cameraX / 32) - overscan);
  const maxX = Math.min(map.width - 1, Math.floor((cameraX + 639) / 32) + overscan);
  const minY = Math.max(0, Math.floor(cameraY / 32) - overscan);
  const maxY = Math.min(map.height - 1, Math.floor((cameraY + 479) / 32) + overscan);
  const tiles: VisibleTile[] = [];
  for (const z of [0, 1, 2] as const) for (let y = minY; y <= maxY; y += 1) for (let x = minX; x <= maxX; x += 1) {
    const tileId = tableAt(map.data, x, y, z);
    if (tileId === 0) continue;
    assertRenderableTileId(tileId, tileset);
    const blit = projectTileBlit(tileId, tileset);
    const priority = tableAt(tileset.priorities, tileId);
    const depth = tileVisualDepth(y, priority);
    tiles.push(Object.freeze({ x, y, z, tileId, depth, blit }));
  }
  return Object.freeze(tiles);
}
