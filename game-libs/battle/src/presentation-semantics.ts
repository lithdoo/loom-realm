import { TILE_SIZE_PX, type TileViewportLayout } from "@loomrealm-game/tile-presentation";
import type { ActorRenderProjection, ResolvedResourceRef } from "./contracts.js";

export interface ProjectedTable { readonly dimensions: number; readonly xSize: number; readonly ySize: number; readonly zSize: number; readonly values: readonly number[] }
export interface MapRecord { readonly tileset_id: number; readonly width: number; readonly height: number; readonly data: ProjectedTable }
export interface TilesetRecord { readonly id: number; readonly tileset_name: string; readonly autotile_names: readonly (string | null)[]; readonly priorities: ProjectedTable }
export interface LoadedBattleMap { readonly map: MapRecord; readonly tileset: TilesetRecord; readonly tilesetRef: ResolvedResourceRef; readonly autotileRefs: readonly (ResolvedResourceRef | null)[] }
export type TileTuple = readonly [number, number, 0 | 1 | 2, number, number];

function record(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${label} must be an object`);
  return value as Record<string, unknown>;
}
function positive(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) throw new TypeError(`${label} must be positive`); return Number(value);
}
function table(value: unknown, label: string): ProjectedTable {
  const item = record(value, label);
  const dimensions = positive(item.dimensions, `${label}.dimensions`), xSize = positive(item.xSize, `${label}.xSize`), ySize = positive(item.ySize, `${label}.ySize`), zSize = positive(item.zSize, `${label}.zSize`);
  if (!Array.isArray(item.values) || item.values.length !== xSize * ySize * zSize || item.values.some((entry) => !Number.isSafeInteger(entry))) throw new TypeError(`${label} values are invalid`);
  return Object.freeze({ dimensions, xSize, ySize, zSize, values: Object.freeze(item.values.map(Number)) });
}
export function validateMap(value: unknown): MapRecord {
  const item = record(value, "Map"), width = positive(item.width, "Map.width"), height = positive(item.height, "Map.height"), data = table(item.data, "Map.data");
  if (data.dimensions !== 3 || data.xSize !== width || data.ySize !== height || data.zSize !== 3) throw new TypeError("Map data shape is invalid");
  return Object.freeze({ tileset_id: positive(item.tileset_id, "Map.tileset_id"), width, height, data });
}
export function validateTileset(value: unknown, id: number): TilesetRecord {
  const item = record(value, "Tileset");
  if (item.id !== id || typeof item.tileset_name !== "string" || !item.tileset_name || !Array.isArray(item.autotile_names) || item.autotile_names.length !== 7 || item.autotile_names.some((name) => name !== null && (typeof name !== "string" || !name))) throw new TypeError("Tileset identity is invalid");
  const priorities = table(item.priorities, "Tileset.priorities");
  if (priorities.dimensions !== 1 || priorities.ySize !== 1 || priorities.zSize !== 1 || priorities.values.some((entry) => entry < 0 || entry > 5)) throw new TypeError("Tileset priorities are invalid");
  return Object.freeze({ id, tileset_name: item.tileset_name, autotile_names: Object.freeze([...item.autotile_names]) as readonly (string | null)[], priorities });
}
function at(tableValue: ProjectedTable, x: number, y = 0, z = 0): number { return tableValue.values[x + y * tableValue.xSize + z * tableValue.xSize * tableValue.ySize]!; }
export function cameraFor(map: MapRecord, layout: TileViewportLayout, actors: readonly ActorRenderProjection[]) {
  const alive = actors.filter((actor) => actor.life === "alive"); const targets = alive.length ? alive : actors;
  const centers = targets.map((actor) => actor.movement?.to ?? actor.tile).map((tile) => ({ x: tile.x * TILE_SIZE_PX + TILE_SIZE_PX / 2, y: tile.y * TILE_SIZE_PX + TILE_SIZE_PX / 2 }));
  const focusX = (Math.min(...centers.map((p) => p.x)) + Math.max(...centers.map((p) => p.x))) / 2;
  const focusY = (Math.min(...centers.map((p) => p.y)) + Math.max(...centers.map((p) => p.y))) / 2;
  return Object.freeze({
    cameraX: Math.min(Math.max(Math.round(focusX - layout.logicalWidth / 2), 0), Math.max(map.width * TILE_SIZE_PX - layout.logicalWidth, 0)),
    cameraY: Math.min(Math.max(Math.round(focusY - layout.logicalHeight / 2), 0), Math.max(map.height * TILE_SIZE_PX - layout.logicalHeight, 0)),
  });
}
export function projectTiles(source: LoadedBattleMap, cameraX: number, cameraY: number, layout: TileViewportLayout): readonly TileTuple[] {
  const minX = Math.max(0, Math.floor(cameraX / TILE_SIZE_PX) - 1), minY = Math.max(0, Math.floor(cameraY / TILE_SIZE_PX) - 1);
  const maxX = Math.min(source.map.width - 1, Math.floor((cameraX + layout.logicalWidth - 1) / TILE_SIZE_PX) + 1), maxY = Math.min(source.map.height - 1, Math.floor((cameraY + layout.logicalHeight - 1) / TILE_SIZE_PX) + 1);
  const result: TileTuple[] = [];
  for (const z of [0, 1, 2] as const) for (let y = minY; y <= maxY; y += 1) for (let x = minX; x <= maxX; x += 1) {
    const tileId = at(source.map.data, x, y, z); if (tileId === 0) continue;
    if (tileId < 48 || (tileId < 384 && source.autotileRefs[Math.floor((tileId - 48) / 48)] === null) || tileId >= source.tileset.priorities.xSize) throw new TypeError(`Unsupported map tile ${tileId}`);
    const priority = at(source.tileset.priorities, tileId); const depth = priority === 0 ? 0 : (y + priority + 1) * TILE_SIZE_PX;
    result.push(Object.freeze([x, y, z, tileId, depth]));
  }
  return Object.freeze(result);
}
export function sameLayout(a: TileViewportLayout, b: TileViewportLayout): boolean { return JSON.stringify(a) === JSON.stringify(b); }
