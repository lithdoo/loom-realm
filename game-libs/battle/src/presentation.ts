import { calculateTileViewportLayout, RESIZE_SETTLE_MS, type TileViewportLayout } from "@loomrealm-game/tile-presentation";
import type { Frame, RenderDomain, RenderDomainState, RenderDomainUpdate, SubsystemScope, ViewportSize } from "@loomrealm/subsystem";
import {
  compareActorId, validateBattleEffectContent, validateBattleSceneInit, validateRenderProjection,
  type ActorRenderProjection, type BattleEffectContent, type BattleSceneInit, type PresentationPort,
  type RenderProjection, type ResolvedResourceRef, type SkillEffectProjection,
} from "./contracts.js";
import { cameraFor, projectTiles, sameLayout, validateMap, validateTileset, type LoadedBattleMap } from "./presentation-semantics.js";

export type PresentationErrorCode = "PRESENTATION_INVALID_STATE" | "PRESENTATION_SCENE_MISMATCH" | "PRESENTATION_PROJECTION_CONFLICT" | "PRESENTATION_CONTENT_FAILED" | "PRESENTATION_COMMIT_FAILED" | "PRESENTATION_INVALID_DATA";
export class BattlePresentationError extends Error {
  constructor(readonly code: PresentationErrorCode, message: string = code, options?: ErrorOptions) { super(message, options); this.name = "BattlePresentationError"; }
}
export interface BattlePresentationHandler extends PresentationPort {}
type State = "NEW" | "INITIALIZING" | "INITIALIZED" | "READY" | "PAUSED" | "CLOSED";
type EffectAsset = Readonly<{ content: BattleEffectContent; image: ResolvedResourceRef }>;
const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength;
const resolved = (namespace: string, key: string, contentVersion: string): ResolvedResourceRef => Object.freeze({ namespace, key, contentVersion });
const canonicalProjection = (projection: RenderProjection) => JSON.stringify({ ...projection, actors: [...projection.actors].sort((a, b) => compareActorId(a.actorId, b.actorId)), effectStarts: [...projection.effectStarts].sort((a, b) => compareActorId(a.effectId, b.effectId)) });

function contentFailure(error: unknown): BattlePresentationError { return error instanceof BattlePresentationError ? error : new BattlePresentationError("PRESENTATION_CONTENT_FAILED", error instanceof Error ? error.message : "Content preparation failed", { cause: error }); }
function invalidData(error: unknown): BattlePresentationError { return error instanceof BattlePresentationError ? error : new BattlePresentationError("PRESENTATION_INVALID_DATA", error instanceof Error ? error.message : "Invalid presentation data", { cause: error }); }

class Handler implements BattlePresentationHandler {
  private state: State = "NEW"; private session = new AbortController(); private generation = 0;
  private scene?: BattleSceneInit; private loaded?: LoadedBattleMap; private actorRefs = new Map<string, ResolvedResourceRef>(); private effects = new Map<string, EffectAsset>();
  private layout?: TileViewportLayout; private domain?: RenderDomain; private unsubscribe?: () => void; private resizeTimer?: ReturnType<typeof setTimeout>; private pendingViewport?: ViewportSize;
  private visualEpoch = 0; private lastTick = -1; private lastCanonical?: string; private projection?: RenderProjection; private seenEffects = new Map<string, string>(); private motionFacts = new Map<string, string>();
  private readonly abortListener = () => this.close();
  constructor(private readonly scope: SubsystemScope, private readonly frame: Frame) {
    frame.signal.addEventListener("abort", this.abortListener, { once: true }); scope.signal.addEventListener("abort", this.abortListener, { once: true });
  }
  async initialize(scene: BattleSceneInit): Promise<void> {
    if (this.state !== "NEW") throw new BattlePresentationError("PRESENTATION_INVALID_STATE");
    this.state = "INITIALIZING"; const generation = ++this.generation;
    try {
      validateBattleSceneInit(scene); this.scene = scene;
      const signal = this.session.signal;
      const mapTask = (async () => {
        const map = validateMap((await this.scope.content.record("struct.Map", String(scene.map.mapId), { signal })).value);
        const tileset = validateTileset((await this.scope.content.record("struct.Tileset", String(map.tileset_id), { signal })).value, map.tileset_id);
        const tilesetKey = `Tilesets/${tileset.tileset_name}`; const tilesetResource = await this.scope.content.resource("resource.Graphics", tilesetKey, { signal });
        const autotileRefs = await Promise.all(tileset.autotile_names.map(async (name) => name === null ? null : resolved("resource.Graphics", `Autotiles/${name}`, (await this.scope.content.resource("resource.Graphics", `Autotiles/${name}`, { signal })).contentVersion)));
        for (const tileId of map.data.values) {
          if (tileId === 0) continue;
          const slot = tileId >= 48 && tileId < 384 ? Math.floor((tileId - 48) / 48) : -1;
          if (tileId < 48 || tileId >= tileset.priorities.xSize || (slot >= 0 && autotileRefs[slot] === null)) throw new TypeError(`Unsupported map tile ${tileId}`);
        }
        return Object.freeze({ map, tileset, tilesetRef: resolved("resource.Graphics", tilesetKey, tilesetResource.contentVersion), autotileRefs: Object.freeze(autotileRefs) });
      })();
      const actorTask = Promise.all(scene.actors.map(async (actor) => [actor.actorId, resolved(actor.character.namespace, actor.character.key, (await this.scope.content.resource(actor.character.namespace, actor.character.key, { signal })).contentVersion)] as const));
      const effectTask = Promise.all(scene.effectIds.map(async (id) => {
        const content = validateBattleEffectContent((await this.scope.content.record("struct.BattleEffect", id, { signal })).value, id);
        const resource = await this.scope.content.resource(content.image.namespace, content.image.key, { signal });
        return [id, Object.freeze({ content, image: resolved(content.image.namespace, content.image.key, resource.contentVersion) })] as const;
      }));
      const [loaded, actors, effects] = await Promise.all([mapTask, actorTask, effectTask]);
      const viewport = await this.firstViewport(signal);
      if (this.state !== "INITIALIZING" || generation !== this.generation || signal.aborted) return;
      this.loaded = loaded; this.actorRefs = new Map(actors); this.effects = new Map(effects); this.layout = calculateTileViewportLayout(viewport.width, viewport.height);
      this.unsubscribe = this.scope.viewport.subscribe((value) => this.onViewport(value)); this.state = "INITIALIZED";
    } catch (error) {
      if (this.session.signal.aborted) return;
      this.close(); throw contentFailure(error);
    }
  }
  render(projection: RenderProjection): void {
    if (this.state === "CLOSED") return;
    if (this.state !== "INITIALIZED" && this.state !== "READY" && this.state !== "PAUSED") throw new BattlePresentationError("PRESENTATION_INVALID_STATE");
    try { validateRenderProjection(projection); } catch (error) { throw invalidData(error); }
    if (projection.sceneEpoch !== this.scene!.sceneEpoch) throw new BattlePresentationError("PRESENTATION_SCENE_MISMATCH");
    const roster = [...this.scene!.actors.map((a) => a.actorId)].sort(compareActorId), incoming = [...projection.actors.map((a) => a.actorId)].sort(compareActorId);
    if (JSON.stringify(roster) !== JSON.stringify(incoming) || projection.effectStarts.some((effect) => !this.effects.has(effect.effect))) throw new BattlePresentationError("PRESENTATION_INVALID_DATA");
    const inside = (point: { readonly x: number; readonly y: number }) => point.x < this.loaded!.map.width && point.y < this.loaded!.map.height;
    if (projection.actors.some((actor) => !inside(actor.tile) || (actor.movement !== null && (!inside(actor.movement.from) || !inside(actor.movement.to)))) || projection.effectStarts.some((effect) => effect.tile !== null && !inside(effect.tile))) throw new BattlePresentationError("PRESENTATION_INVALID_DATA");
    if (projection.tick < this.lastTick) return;
    const canonical = canonicalProjection(projection);
    if (projection.tick === this.lastTick) {
      if (canonical === this.lastCanonical) return;
      throw new BattlePresentationError("PRESENTATION_PROJECTION_CONFLICT");
    }
    for (const actor of projection.actors) if (actor.movement) {
      const key = `${actor.actorId}\0${actor.movement.motionId}`, fact = JSON.stringify(actor.movement), previous = this.motionFacts.get(key);
      if (previous !== undefined && previous !== fact) throw new BattlePresentationError("PRESENTATION_PROJECTION_CONFLICT"); this.motionFacts.set(key, fact);
    }
    const starts = this.consumeEffects(projection.effectStarts);
    const nextEpoch = this.visualEpoch + 1; if (!Number.isSafeInteger(nextEpoch)) throw this.failCommit(new Error("visualEpoch exhausted"));
    let payload: ReturnType<Handler["payloads"]>; try { payload = this.payloads(projection, nextEpoch, starts, this.state === "PAUSED"); } catch (error) { throw this.failCommit(error); }
    if (this.state === "INITIALIZED") {
      const initial = this.renderState(payload); this.preflight(initial, payload.view);
      try { this.domain = this.scope.createRenderDomain(initial); } catch (error) { throw this.failCommit(error); }
      this.state = "READY";
    } else {
      const update = this.renderUpdate(payload); this.preflight(update, payload.view);
      try { this.domain!.update(update); } catch (error) { throw this.failCommit(error); }
    }
    this.visualEpoch = nextEpoch; this.lastTick = projection.tick; this.lastCanonical = canonical; this.projection = projection;
  }
  pause(): void {
    if (this.state === "CLOSED" || this.state === "PAUSED") return; if (this.state !== "READY") throw new BattlePresentationError("PRESENTATION_INVALID_STATE");
    this.commitLocal(true); this.state = "PAUSED";
  }
  resume(): void {
    if (this.state === "CLOSED" || this.state === "READY") return; if (this.state !== "PAUSED") throw new BattlePresentationError("PRESENTATION_INVALID_STATE");
    this.commitLocal(false); this.state = "READY";
  }
  close(): void {
    if (this.state === "CLOSED") return; this.state = "CLOSED"; this.generation += 1; this.session.abort();
    this.frame.signal.removeEventListener("abort", this.abortListener); this.scope.signal.removeEventListener("abort", this.abortListener);
    this.unsubscribe?.(); this.unsubscribe = undefined; if (this.resizeTimer) clearTimeout(this.resizeTimer); this.resizeTimer = undefined; this.pendingViewport = undefined;
    try { this.domain?.close(); } finally { this.domain = undefined; this.effects.clear(); this.actorRefs.clear(); this.projection = undefined; this.loaded = undefined; }
  }
  private firstViewport(signal: AbortSignal): Promise<ViewportSize> {
    if (signal.aborted) return Promise.reject(new DOMException("Presentation closed", "AbortError"));
    if (this.scope.viewport.current !== null) return Promise.resolve(this.scope.viewport.current);
    return new Promise((resolve, reject) => {
      const unsubscribe = this.scope.viewport.subscribe((value) => { if (value) { unsubscribe(); signal.removeEventListener("abort", aborted); resolve(value); } });
      const aborted = () => { unsubscribe(); reject(new DOMException("Presentation closed", "AbortError")); }; signal.addEventListener("abort", aborted, { once: true });
    });
  }
  private onViewport(value: ViewportSize | null) {
    if (this.state === "CLOSED" || value === null) return; this.pendingViewport = value; if (this.resizeTimer) clearTimeout(this.resizeTimer);
    this.resizeTimer = setTimeout(() => { this.resizeTimer = undefined; this.settleResize(); }, RESIZE_SETTLE_MS);
  }
  private settleResize() {
    if (this.state === "CLOSED" || !this.pendingViewport || !this.layout) return;
    let layout: TileViewportLayout; try { layout = calculateTileViewportLayout(this.pendingViewport.width, this.pendingViewport.height); } catch (error) { throw this.failCommit(error); }
    this.pendingViewport = undefined; if (sameLayout(layout, this.layout)) return; this.layout = layout;
    if ((this.state === "READY" || this.state === "PAUSED") && this.projection) this.commitLocal(this.state === "PAUSED");
  }
  private commitLocal(paused: boolean) {
    const nextEpoch = this.visualEpoch + 1; if (!Number.isSafeInteger(nextEpoch)) throw this.failCommit(new Error("visualEpoch exhausted"));
    let payload: ReturnType<Handler["payloads"]>; try { payload = this.payloads(this.projection!, nextEpoch, [], paused); } catch (error) { throw this.failCommit(error); } const update = this.renderUpdate(payload); this.preflight(update, payload.view);
    try { this.domain!.update(update); } catch (error) { throw this.failCommit(error); } this.visualEpoch = nextEpoch;
  }
  private consumeEffects(values: readonly SkillEffectProjection[]) {
    const starts: SkillEffectProjection[] = [];
    for (const effect of values) {
      const fact = JSON.stringify(effect), previous = this.seenEffects.get(effect.effectId);
      if (previous !== undefined) { if (previous !== fact) throw new BattlePresentationError("PRESENTATION_PROJECTION_CONFLICT"); continue; }
      this.seenEffects.set(effect.effectId, fact); if (effect.result === "hit" || effect.result === "immune") starts.push(effect);
    }
    return starts;
  }
  private payloads(projection: RenderProjection, visualEpoch: number, effects: readonly SkillEffectProjection[], paused: boolean) {
    const actors = [...projection.actors].sort((a, b) => compareActorId(a.actorId, b.actorId)); const camera = cameraFor(this.loaded!.map, this.layout!, actors);
    const view = { sceneEpoch: this.scene!.sceneEpoch, visualEpoch, paused, viewportWidth: this.layout!.windowWidth, viewportHeight: this.layout!.windowHeight, barHeight: this.layout!.barHeight, contentWidth: this.layout!.contentWidth, contentHeight: this.layout!.contentHeight, columns: this.layout!.columns, rows: this.layout!.rows, logicalWidth: this.layout!.logicalWidth, logicalHeight: this.layout!.logicalHeight, scaleX: this.layout!.scaleX, scaleY: this.layout!.scaleY, mapWidth: this.loaded!.map.width, mapHeight: this.loaded!.map.height, ...camera, tileset: this.loaded!.tilesetRef, autotiles: this.loaded!.autotileRefs, tiles: projectTiles(this.loaded!, camera.cameraX, camera.cameraY, this.layout!) };
    const actorData = actors.map((actor) => ({ sceneEpoch: this.scene!.sceneEpoch, visualEpoch, paused, actorId: actor.actorId, tileX: actor.tile.x, tileY: actor.tile.y, direction: actor.direction, sprite: this.actorRefs.get(actor.actorId)!, life: actor.life, motion: actor.movement === null ? null : { id: actor.movement.motionId, fromWorldX: actor.movement.from.x * 32, fromWorldY: actor.movement.from.y * 32, toWorldX: actor.movement.to.x * 32, toWorldY: actor.movement.to.y * 32, durationMs: (actor.movement.completeTick - actor.movement.startTick) * this.scene!.tickDurationMs } }));
    const effectData = { sceneEpoch: this.scene!.sceneEpoch, visualEpoch, paused, effectStarts: effects.map((effect) => { const asset = this.effects.get(effect.effect)!; return { effectId: effect.effectId, result: effect.result as "hit" | "immune", image: asset.image, worldX: effect.tile!.x * 32 + 16, worldY: effect.tile!.y * 32 + 16, fadeInMs: asset.content.timing.fade_in_ticks * 200, holdMs: asset.content.timing.hold_ticks * 200, fadeOutMs: asset.content.timing.fade_out_ticks * 200 }; }) };
    const hud = { sceneEpoch: this.scene!.sceneEpoch, visualEpoch, actors: actors.map((actor) => ({ actorId: actor.actorId, team: this.scene!.actors.find((item) => item.actorId === actor.actorId)!.team, hp: actor.hp, maxHp: actor.maxHp })) };
    return { view, actors: actorData, effects: effectData, hud };
  }
  private renderState(p: ReturnType<Handler["payloads"]>): RenderDomainState { return { zIndex: 0, roots: [{ key: "battle:view", tag: "lr-battle-view", attrs: {}, data: p.view as never, children: [...p.actors.map((data) => ({ key: `battle:actor:${data.actorId}`, tag: "lr-battle-actor", attrs: { slot: "world" }, data: data as never, children: [] })), { key: "battle:effects", tag: "lr-battle-effects", attrs: { slot: "world" }, data: p.effects as never, children: [] }, { key: "battle:hud", tag: "lr-battle-hud", attrs: { slot: "hud" }, data: p.hud as never, children: [] }] }] } }
  private renderUpdate(p: ReturnType<Handler["payloads"]>): RenderDomainUpdate { return { nodes: [{ key: "battle:view", data: { set: p.view as never } }, ...p.actors.map((data) => ({ key: `battle:actor:${data.actorId}`, data: { set: data as never } })), { key: "battle:effects", data: { set: p.effects as never } }, { key: "battle:hud", data: { set: p.hud as never } }] } }
  private preflight(candidate: unknown, view: unknown) {
    const value = candidate as { roots?: readonly { data: unknown; children: readonly { data: unknown }[] }[]; nodes?: readonly { data?: { set?: unknown } }[] };
    const nodeData = value.roots ? value.roots.flatMap((root) => [root.data, ...root.children.map((child) => child.data)]) : (value.nodes ?? []).map((node) => node.data?.set);
    if (bytes(view) >= 196_608 || nodeData.some((data) => bytes(data) > 262_144) || bytes(candidate) >= 1_000_000 || 3 + this.scene!.actors.length > 16_384) throw this.failCommit(new Error("Renderer capacity exceeded"));
  }
  private failCommit(error: unknown) { const failure = new BattlePresentationError("PRESENTATION_COMMIT_FAILED", error instanceof Error ? error.message : "Render commit failed", { cause: error }); this.close(); return failure; }
}

export class BattlePresentationBuilder {
  private built = false;
  constructor(private readonly scope: SubsystemScope, private readonly frame: Frame) {}
  build(): BattlePresentationHandler { if (this.built) throw new BattlePresentationError("PRESENTATION_INVALID_STATE"); this.built = true; return new Handler(this.scope, this.frame); }
}

export class NullPresentation implements PresentationPort { async initialize(_scene: BattleSceneInit) {} render(_projection: RenderProjection) {} pause() {} resume() {} close() {} }
export class RecordingPresentation implements PresentationPort {
  readonly scenes: BattleSceneInit[] = []; readonly projections: RenderProjection[] = []; paused = false; closed = false;
  async initialize(scene: BattleSceneInit) { this.scenes.push(scene); } render(projection: RenderProjection) { this.projections.push(projection); } pause() { this.paused = true; } resume() { this.paused = false; } close() { this.closed = true; }
}
