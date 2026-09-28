export type ActorId = string;
export type Team = "ally" | "enemy";
export type Direction = 2 | 4 | 6 | 8;
export interface GridPosition { readonly x: number; readonly y: number }
export interface ResourceRef { readonly namespace: string; readonly key: string; readonly contentVersion?: string }
export interface ResolvedResourceRef { readonly namespace: string; readonly key: string; readonly contentVersion: string }
export interface MapRef { readonly mapId: number }
export interface BattleActorRenderInit { readonly actorId: ActorId; readonly team: Team; readonly character: ResourceRef }
export interface BattleSceneInit {
  readonly battleId: string;
  readonly sceneEpoch: number;
  readonly tickDurationMs: 200;
  readonly map: MapRef;
  readonly actors: readonly BattleActorRenderInit[];
  readonly effectIds: readonly string[];
}
export interface MovementProjection {
  readonly motionId: number;
  readonly from: GridPosition;
  readonly to: GridPosition;
  readonly startTick: number;
  readonly completeTick: number;
}
export interface ActorRenderProjection {
  readonly actorId: ActorId;
  readonly tile: GridPosition;
  readonly direction: Direction;
  readonly hp: number;
  readonly maxHp: number;
  readonly life: "alive" | "dead";
  readonly movement: MovementProjection | null;
}
export interface SkillEffectProjection {
  readonly effectId: string;
  readonly result: "hit" | "immune" | "miss" | "invalid";
  readonly effect: string;
  readonly tile: GridPosition | null;
  readonly startTick: number;
}
export interface RenderProjection {
  readonly sceneEpoch: number;
  readonly tick: number;
  readonly actors: readonly ActorRenderProjection[];
  readonly effectStarts: readonly SkillEffectProjection[];
}
export interface BattleEffectContent {
  readonly id: string;
  readonly image: { readonly namespace: "resource.Graphics"; readonly key: string };
  readonly anchor: "tile-center";
  readonly timing: { readonly fade_in_ticks: number; readonly hold_ticks: number; readonly fade_out_ticks: number };
}
export interface PresentationPort {
  initialize(scene: BattleSceneInit): Promise<void>;
  render(projection: RenderProjection): void;
  pause(): void;
  resume(): void;
  close(): void;
}

const encoder = new TextEncoder();
const ordinal = (left: string, right: string) => left < right ? -1 : left > right ? 1 : 0;
export { ordinal as compareActorId };

export function assertActorId(value: unknown): asserts value is ActorId {
  if (typeof value !== "string" || encoder.encode(value).byteLength < 1 || encoder.encode(value).byteLength > 115 || /[\uD800-\uDFFF]/u.test(value)) {
    throw new TypeError("ActorId must be a Unicode scalar string of 1..115 UTF-8 bytes");
  }
}

function exact(value: unknown, fields: readonly string[], label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${label} must be an object`);
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== fields.length || fields.some((field) => !(field in record))) throw new TypeError(`${label} has an invalid field set`);
  return record;
}
function safe(value: unknown, label: string, minimum = 0): number {
  if (!Number.isSafeInteger(value) || Number(value) < minimum) throw new TypeError(`${label} must be a safe integer >= ${minimum}`);
  return Number(value);
}
function point(value: unknown, label: string): GridPosition {
  const item = exact(value, ["x", "y"], label);
  return Object.freeze({ x: safe(item.x, `${label}.x`), y: safe(item.y, `${label}.y`) });
}

export function validateBattleEffectContent(value: unknown, recordKey: string): BattleEffectContent {
  const item = exact(value, ["id", "image", "anchor", "timing"], "BattleEffect");
  const image = exact(item.image, ["namespace", "key"], "BattleEffect.image");
  const timing = exact(item.timing, ["fade_in_ticks", "hold_ticks", "fade_out_ticks"], "BattleEffect.timing");
  const fade_in_ticks = safe(timing.fade_in_ticks, "fade_in_ticks");
  const hold_ticks = safe(timing.hold_ticks, "hold_ticks");
  const fade_out_ticks = safe(timing.fade_out_ticks, "fade_out_ticks");
  if (item.id !== recordKey || typeof item.id !== "string" || item.id.length === 0 || image.namespace !== "resource.Graphics" || typeof image.key !== "string" || !image.key.startsWith("BattleEffects/") || item.anchor !== "tile-center" || fade_in_ticks + hold_ticks + fade_out_ticks === 0) throw new TypeError("Invalid BattleEffect content");
  return Object.freeze({ id: item.id, image: Object.freeze({ namespace: "resource.Graphics", key: image.key }), anchor: "tile-center", timing: Object.freeze({ fade_in_ticks, hold_ticks, fade_out_ticks }) });
}

export function validateBattleSceneInit(value: BattleSceneInit): BattleSceneInit {
  const item = exact(value, ["battleId", "sceneEpoch", "tickDurationMs", "map", "actors", "effectIds"], "BattleSceneInit");
  if (typeof item.battleId !== "string" || item.battleId.length === 0 || item.tickDurationMs !== 200) throw new TypeError("Invalid BattleSceneInit identity/tick duration");
  safe(item.sceneEpoch, "sceneEpoch", 1);
  const map = exact(item.map, ["mapId"], "map"); safe(map.mapId, "mapId", 1);
  if (!Array.isArray(item.actors) || item.actors.length === 0 || !Array.isArray(item.effectIds)) throw new TypeError("actors must be non-empty and effectIds must be an array");
  const actorIds = new Set<string>();
  for (const raw of item.actors) {
    const actor = exact(raw, ["actorId", "team", "character"], "actor"); assertActorId(actor.actorId);
    if (actorIds.has(actor.actorId)) throw new TypeError("Duplicate actorId"); actorIds.add(actor.actorId);
    if (actor.team !== "ally" && actor.team !== "enemy") throw new TypeError("Invalid team");
    const character = exact(actor.character, ["namespace", "key", ...(Object.prototype.hasOwnProperty.call(actor.character, "contentVersion") ? ["contentVersion"] : [])], "character");
    if (typeof character.namespace !== "string" || !character.namespace || typeof character.key !== "string" || !character.key) throw new TypeError("Invalid character ref");
  }
  let previous: string | undefined;
  for (const id of item.effectIds) {
    if (typeof id !== "string" || !id || (previous !== undefined && ordinal(previous, id) >= 0)) throw new TypeError("effectIds must be unique and ordinal-sorted");
    previous = id;
  }
  return value;
}

export function validateRenderProjection(value: RenderProjection): RenderProjection {
  const item = exact(value, ["sceneEpoch", "tick", "actors", "effectStarts"], "RenderProjection"); safe(item.sceneEpoch, "sceneEpoch", 1); safe(item.tick, "tick");
  if (!Array.isArray(item.actors) || !Array.isArray(item.effectStarts)) throw new TypeError("actors/effectStarts must be arrays");
  const ids = new Set<string>();
  for (const raw of item.actors) {
    const actor = exact(raw, ["actorId", "tile", "direction", "hp", "maxHp", "life", "movement"], "actor projection"); assertActorId(actor.actorId);
    if (ids.has(actor.actorId)) throw new TypeError("Duplicate projected actorId"); ids.add(actor.actorId);
    point(actor.tile, "tile"); if (![2, 4, 6, 8].includes(Number(actor.direction))) throw new TypeError("Invalid direction");
    const hp = safe(actor.hp, "hp"); const maxHp = safe(actor.maxHp, "maxHp", 1); if (hp > maxHp || (actor.life !== "alive" && actor.life !== "dead")) throw new TypeError("Invalid actor health/life");
    if (actor.movement !== null) {
      const movement = exact(actor.movement, ["motionId", "from", "to", "startTick", "completeTick"], "movement");
      safe(movement.motionId, "motionId", 1); point(movement.from, "from"); point(movement.to, "to");
      const start = safe(movement.startTick, "startTick"); if (safe(movement.completeTick, "completeTick") <= start) throw new TypeError("Invalid movement ticks");
    }
  }
  const effectIds = new Set<string>();
  for (const raw of item.effectStarts) {
    const effect = exact(raw, ["effectId", "result", "effect", "tile", "startTick"], "effect start");
    if (typeof effect.effectId !== "string" || !effect.effectId || effectIds.has(effect.effectId) || typeof effect.effect !== "string" || !effect.effect || !["hit", "immune", "miss", "invalid"].includes(String(effect.result))) throw new TypeError("Invalid effect start");
    effectIds.add(effect.effectId); safe(effect.startTick, "startTick"); if (effect.tile !== null) point(effect.tile, "effect tile");
    if ((effect.result === "hit" || effect.result === "immune") && effect.tile === null) throw new TypeError("Visible effect requires tile");
  }
  return value;
}
