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
  readonly passages: ProjectedTable;
  readonly priorities: ProjectedTable;
}

export interface VisibleTile {
  readonly [key: string]: number;
  readonly x: number;
  readonly y: number;
  readonly z: 0 | 1 | 2;
  readonly tileId: number;
  readonly depth: number;
}

const TILE_SIZE = 32;

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

export function validateTilesetRecord(value: unknown, contentId: number): TilesetRecord {
  const input = object(value, "Tileset");
  if (!(["id", "tileset_name", "passages", "priorities"].every((key) => key in input)) || Object.keys(input).length !== 4) throw new TypeError("Tileset has an invalid field set");
  const id = integer(input.id, "Tileset.id");
  if (id !== contentId) throw new TypeError("Tileset.id does not equal its Content key");
  if (typeof input.tileset_name !== "string" || input.tileset_name.length === 0) throw new TypeError("Tileset.tileset_name must be non-empty");
  const passages = validateTable(input.passages, "Tileset.passages");
  const priorities = validateTable(input.priorities, "Tileset.priorities");
  for (const [name, table] of [["passages", passages], ["priorities", priorities]] as const) {
    if (table.dimensions !== 1 || table.ySize !== 1 || table.zSize !== 1) throw new TypeError(`Tileset.${name} must be a 1D Table`);
  }
  if (priorities.values.some((value) => value < 0 || value > 5)) {
    throw new TypeError("Tileset.priorities values must be integers from 0 through 5");
  }
  return Object.freeze({ id, tileset_name: input.tileset_name, passages, priorities });
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

export function projectVisibleTiles(
  map: MapRecord,
  tileset: TilesetRecord,
  cameraX: number,
  cameraY: number,
): readonly VisibleTile[] {
  const minX = Math.floor(cameraX / 32);
  const maxX = Math.min(map.width - 1, Math.floor((cameraX + 639) / 32));
  const minY = Math.floor(cameraY / 32);
  const maxY = Math.min(map.height - 1, Math.floor((cameraY + 479) / 32));
  const tiles: VisibleTile[] = [];
  for (const z of [0, 1, 2] as const) for (let y = minY; y <= maxY; y += 1) for (let x = minX; x <= maxX; x += 1) {
    const tileId = tableAt(map.data, x, y, z);
    if (tileId === 0) continue;
    if (tileId < 384) throw new TypeError(`Unsupported M14 tile id ${tileId}`);
    if (tileId >= tileset.priorities.xSize) {
      throw new TypeError(`Tileset.priorities has no entry for tile id ${tileId}`);
    }
    const priority = tableAt(tileset.priorities, tileId);
    const depth = tileVisualDepth(y, priority);
    tiles.push(Object.freeze({ x, y, z, tileId, depth }));
  }
  return Object.freeze(tiles);
}
