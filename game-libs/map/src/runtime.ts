import { cancelled, defineSubsystem, failed, type Frame, type FrameOutcome, type RenderDomainState, type SubsystemDefinitionFactory } from "@loomrealm/subsystem";
import {
  assertProjectable,
  buildTileVisuals,
  canMove,
  chunkBoundsContain,
  chunkBoundsForTileBounds,
  clampChunkBounds,
  computeCamera,
  directionForCode,
  expandChunkBounds,
  projectChunksInBounds,
  unionTileBounds,
  validateMapRecord,
  validateMapTransferRecord,
  validateTilesetRecord,
  viewportTileBounds,
  type ChunkBounds,
  type ContactTransfer,
  type Direction,
  type EdgeTransfer,
  type MapRecord,
  type MapTransferRecord,
  type ProjectedChunk,
  type StepTransfer,
  type TilesetRecord,
  type TileVisual,
} from "./semantics.js";

interface InitialInput { mapId: number; x: number; y: number; characterName: string }
interface ResourceRef { readonly [name: string]: string; namespace: string; key: string; contentVersion: string }
interface ActiveMove {
  readonly id: number;
  readonly fromX: number;
  readonly fromY: number;
  readonly startPattern: 1 | 3;
}
interface LoadedMap {
  readonly mapId: number;
  readonly map: MapRecord;
  readonly tileset: TilesetRecord;
  readonly tilesetRef: ResourceRef;
  readonly autotileRefs: readonly (ResourceRef | null)[];
  readonly transfers: MapTransferRecord;
}

type TransferRule = StepTransfer | ContactTransfer | EdgeTransfer;

/**
 * Frozen chunked ProjectionWindow (main contract §3): the CURRENT window is
 * the sole projection; entering chunks are projected once, leaving chunks
 * drop, evicted chunks may be recomputed on re-entry. No map-wide history.
 */
interface ChunkProjectionWindow {
  readonly source: LoadedMap;
  readonly bounds: ChunkBounds;
  readonly chunks: readonly ProjectedChunk[];
  readonly tileVisuals: readonly TileVisual[];
}

interface RenderFacts {
  readonly loaded: LoadedMap;
  readonly window: ChunkProjectionWindow;
  readonly x: number;
  readonly y: number;
  readonly direction: Direction;
  readonly activeMove: ActiveMove | null;
  readonly playerRef: ResourceRef;
  readonly sceneEpoch: number;
  readonly visualEpoch: number;
}

const WALK_STEP_MS = 250;
const TILE = 32;
const VIEWPORT_KEY = "viewport";
const PLAYER_KEY = "player";
const MAX_PROJECTED_DATA_BYTES = 196_608;
const WINDOW_MARGIN_CHUNKS = [2, 1, 0] as const;
const VIEWPORT_DEFAULT = Object.freeze({ width: 640, height: 480 });
const VIEWPORT_MIN = Object.freeze({ width: 320, height: 240 });
const VIEWPORT_MAX = Object.freeze({ width: 1920, height: 1080 });
const RESIZE_SETTLE_MS = 100;
const stepDelta: Record<Direction, { readonly dx: number; readonly dy: number }> = {
  2: { dx: 0, dy: 1 },
  4: { dx: -1, dy: 0 },
  6: { dx: 1, dy: 0 },
  8: { dx: 0, dy: -1 },
};
const codeByDirection: Record<Direction, string> = {
  2: "ArrowDown",
  4: "ArrowLeft",
  6: "ArrowRight",
  8: "ArrowUp",
};
const fallbackCodes = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"] as const;

function initialInput(value: unknown): InitialInput {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new TypeError("Map input must be an object");
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some((key) => !["mapId", "x", "y", "characterName"].includes(key))) throw new TypeError("Map input contains unknown fields");
  if (!Number.isSafeInteger(input.mapId) || Number(input.mapId) <= 0) throw new TypeError("mapId must be positive");
  if (!Number.isSafeInteger(input.x) || Number(input.x) < 0 || !Number.isSafeInteger(input.y) || Number(input.y) < 0) throw new TypeError("x/y must be non-negative");
  if (typeof input.characterName !== "string" || input.characterName.length === 0) throw new TypeError("characterName must be non-empty");
  return { mapId: input.mapId as number, x: input.x as number, y: input.y as number, characterName: input.characterName };
}

function waitForAbort(signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => signal.addEventListener("abort", () => resolve(), { once: true }));
}

function ref(namespace: string, key: string, contentVersion: string): ResourceRef {
  if (typeof contentVersion !== "string" || contentVersion.length === 0) throw new TypeError("Resource contentVersion must be non-empty");
  return Object.freeze({ namespace, key, contentVersion });
}

function inBounds(map: MapRecord, x: number, y: number) {
  return x >= 0 && y >= 0 && x < map.width && y < map.height;
}

function clampViewportSize(width: number, height: number) {
  return Object.freeze({
    width: Math.min(Math.max(width, VIEWPORT_MIN.width), VIEWPORT_MAX.width),
    height: Math.min(Math.max(height, VIEWPORT_MIN.height), VIEWPORT_MAX.height),
  });
}

interface ViewPayloadOptions {
  readonly motionId: number | null;
  readonly cameraMotion: unknown;
  readonly includeProjection: boolean;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
}

function viewportPayload(
  loaded: LoadedMap,
  window: ChunkProjectionWindow,
  cameraX: number,
  cameraY: number,
  sceneEpoch: number,
  visualEpoch: number,
  options: ViewPayloadOptions,
): RenderDomainState["roots"][number]["data"] {
  return {
    sceneEpoch,
    visualEpoch,
    motionId: options.motionId,
    viewportWidth: options.viewportWidth,
    viewportHeight: options.viewportHeight,
    mapId: loaded.mapId,
    mapWidth: loaded.map.width,
    mapHeight: loaded.map.height,
    cameraX,
    cameraY,
    tileset: loaded.tilesetRef,
    autotiles: loaded.autotileRefs,
    ...(options.includeProjection
      ? { tileVisuals: window.tileVisuals, chunks: window.chunks }
      : {}),
    cameraMotion: options.cameraMotion,
  } as unknown as RenderDomainState["roots"][number]["data"];
}

/** VIEW_DATA_GUARD (§5): full MapView data object UTF-8 JSON bytes, strictly < 196608. */
function projectionBytes(data: unknown): number {
  return new TextEncoder().encode(JSON.stringify(data)).byteLength;
}

function selectProjectionWindow(
  loaded: LoadedMap,
  requiredChunkBounds: ChunkBounds,
  cameraX: number,
  cameraY: number,
  sceneEpoch: number,
  visualEpoch: number,
  cameraMotion: unknown,
  viewport: { width: number; height: number },
): ChunkProjectionWindow {
  let selected: ChunkProjectionWindow | undefined;
  for (const margin of WINDOW_MARGIN_CHUNKS) {
    const bounds = expandChunkBounds(requiredChunkBounds, margin, loaded.map);
    const chunks = projectChunksInBounds(loaded.map, loaded.tileset, bounds);
    const tileVisuals = buildTileVisuals(chunks, loaded.tileset);
    const candidate: ChunkProjectionWindow = Object.freeze({
      source: loaded,
      bounds,
      chunks,
      tileVisuals,
    });
    const probe = viewportPayload(loaded, candidate, cameraX, cameraY, sceneEpoch, visualEpoch, {
      motionId: null,
      cameraMotion,
      includeProjection: true,
      viewportWidth: viewport.width,
      viewportHeight: viewport.height,
    });
    if (projectionBytes(probe) < MAX_PROJECTED_DATA_BYTES) {
      selected = candidate;
      break;
    }
  }
  if (selected === undefined) throw new RangeError("Map projection budget exceeded");
  return selected;
}

function cameraFor(loaded: LoadedMap, x: number, y: number, viewport: { width: number; height: number }) {
  return computeCamera(loaded.map, x, y, viewport.width, viewport.height);
}

function tileBoundsFor(loaded: LoadedMap, cameraX: number, cameraY: number, viewport: { width: number; height: number }) {
  return viewportTileBounds(loaded.map, cameraX, cameraY, viewport.width, viewport.height);
}

interface MovementPayload {
  readonly viewportSet: Record<string, unknown>;
  readonly playerSet: Record<string, unknown>;
}

function movementPayload(
  loaded: LoadedMap,
  window: ChunkProjectionWindow,
  fromX: number,
  fromY: number,
  nextX: number,
  nextY: number,
  nextDirection: Direction,
  nextMove: ActiveMove | null,
  sceneEpoch: number,
  visualEpoch: number,
  includeProjection: boolean,
  viewport: { width: number; height: number },
): MovementPayload {
  const sourceCamera = cameraFor(loaded, fromX, fromY, viewport);
  const targetCamera = cameraFor(loaded, nextX, nextY, viewport);
  const screenX = nextX * TILE - targetCamera.cameraX;
  const screenY = nextY * TILE - targetCamera.cameraY;
  const fromScreenX = fromX * TILE - sourceCamera.cameraX;
  const fromScreenY = fromY * TILE - sourceCamera.cameraY;
  const cameraMotion = nextMove === null ? null : Object.freeze({
    id: nextMove.id,
    durationMs: WALK_STEP_MS,
    fromCameraX: sourceCamera.cameraX,
    fromCameraY: sourceCamera.cameraY,
  });
  const viewportSet: Record<string, unknown> = {
    cameraX: targetCamera.cameraX,
    cameraY: targetCamera.cameraY,
    motionId: nextMove === null ? null : nextMove.id,
    cameraMotion,
  };
  if (includeProjection) {
    viewportSet.visualEpoch = visualEpoch;
    viewportSet.tileVisuals = window.tileVisuals;
    viewportSet.chunks = window.chunks;
  }
  const playerSet: Record<string, unknown> = {
    visualEpoch,
    x: nextX,
    y: nextY,
    screenX,
    screenY,
    direction: nextDirection,
    pattern: nextMove === null ? 0 : nextMove.startPattern,
    motionId: nextMove === null ? null : nextMove.id,
    motion: nextMove === null ? null : Object.freeze({
      id: nextMove.id,
      durationMs: WALK_STEP_MS,
      fromY: nextMove.fromY,
      fromScreenX,
      fromScreenY,
    }),
  };
  return { viewportSet, playerSet };
}

function renderState(facts: RenderFacts, viewport: { width: number; height: number }): RenderDomainState {
  const { loaded, window, x, y, direction, activeMove, playerRef, sceneEpoch, visualEpoch } = facts;
  const camera = cameraFor(loaded, x, y, viewport);
  const screenX = x * TILE - camera.cameraX;
  const screenY = y * TILE - camera.cameraY;
  const motionId = activeMove === null ? null : activeMove.id;
  const sourceCamera = activeMove === null ? camera : cameraFor(loaded, activeMove.fromX, activeMove.fromY, viewport);
  return {
    zIndex: 0,
    roots: [{
      key: VIEWPORT_KEY, tag: "lr-map-view", attrs: {},
      data: viewportPayload(loaded, window, camera.cameraX, camera.cameraY, sceneEpoch, visualEpoch, {
        motionId,
        cameraMotion: activeMove === null ? null : Object.freeze({
          id: activeMove.id,
          durationMs: WALK_STEP_MS,
          fromCameraX: sourceCamera.cameraX,
          fromCameraY: sourceCamera.cameraY,
        }),
        includeProjection: true,
        viewportWidth: viewport.width,
        viewportHeight: viewport.height,
      }),
      children: [{
        key: PLAYER_KEY, tag: "lr-map-sprite", attrs: {},
        data: {
          sceneEpoch,
          visualEpoch,
          motionId,
          x, y, screenX, screenY, direction,
          pattern: activeMove === null ? 0 : activeMove.startPattern,
          sprite: playerRef,
          motion: activeMove === null ? null : Object.freeze({
            id: activeMove.id,
            durationMs: WALK_STEP_MS,
            fromY: activeMove.fromY,
            fromScreenX: activeMove.fromX * TILE - sourceCamera.cameraX,
            fromScreenY: activeMove.fromY * TILE - sourceCamera.cameraY,
          }),
        },
        children: [],
      }],
    }],
  };
}

export const mapDefinition: SubsystemDefinitionFactory = defineSubsystem((scope) => ({
  async frame(frame: Frame) {
    let listener;
    let domain;
    let stepTimer: ReturnType<typeof setTimeout> | null = null;
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    let pendingResize: { width: number; height: number } | null = null;
    let activeMove: ActiveMove | null = null;
    let transitioning = false;
    let cleanedUp = false;
    let unsubscribeViewportEarly: (() => void) | null = null;
    try {
      const input = initialInput(frame.params);
      let resolveTerminal!: (outcome: FrameOutcome) => void;
      let terminalSettled = false;
      const terminal = new Promise<FrameOutcome>((resolve) => {
        resolveTerminal = resolve;
      });

      const loadMap = async (mapId: number): Promise<LoadedMap> => {
        const map = validateMapRecord((await scope.content.record("struct.Map", String(mapId), { signal: frame.signal })).value);
        const transfers = validateMapTransferRecord((await scope.content.record("struct.MapTransfer", String(mapId), { signal: frame.signal })).value, mapId);
        const tileset = validateTilesetRecord((await scope.content.record("struct.Tileset", String(map.tileset_id), { signal: frame.signal })).value, map.tileset_id);
        assertProjectable(map, tileset);
        const tilesetResource = await scope.content.resource("resource.Graphics", `Tilesets/${tileset.tileset_name}`, { signal: frame.signal });
        const autotileRefs = Object.freeze(await Promise.all(tileset.autotile_names.map(async (name) => {
          if (name === null) return null;
          const resource = await scope.content.resource("resource.Graphics", `Autotiles/${name}`, { signal: frame.signal });
          return ref("resource.Graphics", `Autotiles/${name}`, resource.contentVersion);
        })));
        return Object.freeze({
          mapId,
          map,
          tileset,
          tilesetRef: ref("resource.Graphics", `Tilesets/${tileset.tileset_name}`, tilesetResource.contentVersion),
          autotileRefs,
          transfers,
        });
      };

      let current!: LoadedMap;
      let window!: ChunkProjectionWindow;
      let x = 0;
      let y = 0;
      let direction: Direction = 2;
      let nextMoveId = 1;
      let nextStartPattern: 1 | 3 = 1;
      let sceneEpoch = 1;
      let visualEpoch = 1;
      let heldDirections: Direction[] = [];
      let playerRef!: ResourceRef;
      let viewport = clampViewportSize(VIEWPORT_DEFAULT.width, VIEWPORT_DEFAULT.height);

      const facts = (overrides: Partial<RenderFacts> = {}): RenderFacts => ({
        loaded: overrides.loaded ?? current,
        window: overrides.window ?? window,
        x: overrides.x ?? x,
        y: overrides.y ?? y,
        direction: overrides.direction ?? direction,
        activeMove: overrides.activeMove === undefined ? activeMove : overrides.activeMove,
        playerRef: overrides.playerRef ?? playerRef,
        sceneEpoch: overrides.sceneEpoch ?? sceneEpoch,
        visualEpoch: overrides.visualEpoch ?? visualEpoch,
      });

      const requiredChunksFor = (loaded: LoadedMap, fromX: number, fromY: number, toX: number, toY: number): ChunkBounds => {
        const sourceCamera = cameraFor(loaded, fromX, fromY, viewport);
        const targetCamera = cameraFor(loaded, toX, toY, viewport);
        const requiredTiles = unionTileBounds(
          tileBoundsFor(loaded, sourceCamera.cameraX, sourceCamera.cameraY, viewport),
          tileBoundsFor(loaded, targetCamera.cameraX, targetCamera.cameraY, viewport),
        );
        // Clamp to the map before containment: chunks outside the map do not
        // exist and must not force a window refresh (main contract §3).
        return clampChunkBounds(loaded.map, chunkBoundsForTileBounds(requiredTiles));
      };

      const standingWindow = (loaded: LoadedMap, tileX: number, tileY: number, nextSceneEpoch: number, nextVisualEpoch: number) => {
        const camera = cameraFor(loaded, tileX, tileY, viewport);
        const required = chunkBoundsForTileBounds(tileBoundsFor(loaded, camera.cameraX, camera.cameraY, viewport));
        return selectProjectionWindow(loaded, required, camera.cameraX, camera.cameraY, nextSceneEpoch, nextVisualEpoch, null, viewport);
      };

      const failTransfer = (error: unknown) => {
        if (frame.signal.aborted || terminalSettled) return;
        terminalSettled = true;
        resolveTerminal(failed({
          code: "MAP_TRANSFER_FAILED",
          message: error instanceof Error ? error.message : "Map transfer failed",
        }));
      };

      const beginTransfer = async (rule: TransferRule, attemptedDirection: Direction): Promise<void> => {
        if (frame.signal.aborted || transitioning) return;
        transitioning = true;
        try {
          domain!.replace(renderState(facts({ activeMove: null }), viewport));
          activeMove = null;
          if (stepTimer !== null) {
            clearTimeout(stepTimer);
            stepTimer = null;
          }
          nextStartPattern = 1;
          const target = await loadMap(rule.targetMapId);
          if (frame.signal.aborted || !transitioning) {
            transitioning = false;
            return;
          }
          if (!inBounds(target.map, rule.targetX, rule.targetY)) throw new TypeError("Map transfer target lies outside the loaded Map");
          const nextDirection = "targetDirection" in rule ? rule.targetDirection ?? attemptedDirection : attemptedDirection;
          const nextSceneEpoch = sceneEpoch + 1;
          const nextVisualEpoch = visualEpoch + 1;
          const nextWindow = standingWindow(target, rule.targetX, rule.targetY, nextSceneEpoch, nextVisualEpoch);
          const nextFacts = facts({
            loaded: target,
            window: nextWindow,
            x: rule.targetX,
            y: rule.targetY,
            direction: nextDirection,
            activeMove: null,
            sceneEpoch: nextSceneEpoch,
            visualEpoch: nextVisualEpoch,
          });
          domain!.replace(renderState(nextFacts, viewport));
          current = target;
          window = nextWindow;
          x = rule.targetX;
          y = rule.targetY;
          direction = nextDirection;
          activeMove = null;
          sceneEpoch = nextSceneEpoch;
          visualEpoch = nextVisualEpoch;
          nextStartPattern = 1;
          transitioning = false;
          if (frame.signal.aborted) return;
          if (heldDirections.length > 0) attempt(heldDirections[heldDirections.length - 1]!);
        } catch (error) {
          transitioning = false;
          throw error;
        }
      };

      const startTransfer = (rule: TransferRule, attemptedDirection: Direction) => {
        if (frame.signal.aborted || transitioning) return;
        void beginTransfer(rule, attemptedDirection).catch(failTransfer);
      };

      const publishBlocked = (nextDirection: Direction) => {
        const nextWindow = window.source === current ? window : standingWindow(current, x, y, sceneEpoch, visualEpoch);
        domain!.replace(renderState(facts({ direction: nextDirection, window: nextWindow, activeMove: null }), viewport));
        direction = nextDirection;
        window = nextWindow;
        activeMove = null;
      };

      const publishMovementUpdate = (nextX: number, nextY: number, nextDirection: Direction, nextMove: ActiveMove | null) => {
        const fromX = nextMove?.fromX ?? x;
        const fromY = nextMove?.fromY ?? y;
        const required = requiredChunksFor(current, fromX, fromY, nextX, nextY);
        let nextWindow = window;
        let includeProjection = false;
        let nextVisualEpoch = visualEpoch;
        if (!(window.source === current && chunkBoundsContain(window.bounds, required))) {
          const targetCamera = cameraFor(current, nextX, nextY, viewport);
          const cameraMotion = nextMove === null ? null : Object.freeze({
            id: nextMove.id,
            durationMs: WALK_STEP_MS,
            fromCameraX: cameraFor(current, fromX, fromY, viewport).cameraX,
            fromCameraY: cameraFor(current, fromX, fromY, viewport).cameraY,
          });
          nextVisualEpoch = visualEpoch + 1;
          nextWindow = selectProjectionWindow(current, required, targetCamera.cameraX, targetCamera.cameraY, sceneEpoch, nextVisualEpoch, cameraMotion, viewport);
          includeProjection = true;
        }
        const { viewportSet, playerSet } = movementPayload(
          current, nextWindow, fromX, fromY, nextX, nextY, nextDirection, nextMove,
          sceneEpoch, nextVisualEpoch, includeProjection, viewport,
        );
        domain!.update({
          nodes: [
            {
              key: VIEWPORT_KEY,
              data: { set: viewportSet },
            },
            { key: PLAYER_KEY, data: { set: playerSet } },
          ],
        });
        window = nextWindow;
        visualEpoch = nextVisualEpoch;
        x = nextX;
        y = nextY;
        direction = nextDirection;
        activeMove = nextMove;
      };

      const attempt = (next: Direction) => {
        if (frame.signal.aborted || transitioning) return;
        const { dx, dy } = stepDelta[next];
        const nx = x + dx;
        const ny = y + dy;
        if (inBounds(current.map, nx, ny)) {
          const contact = current.transfers.contacts.find((rule) => rule.x === x && rule.y === y && rule.direction === next);
          if (contact) {
            startTransfer(contact, next);
            return;
          }
          if (!canMove(current.map, current.tileset, x, y, next, dx, dy)) {
            if (stepTimer !== null) {
              clearTimeout(stepTimer);
              stepTimer = null;
            }
            nextStartPattern = 1;
            publishBlocked(next);
            return;
          }
          const moveId = nextMoveId;
          const nextMove: ActiveMove = { id: moveId, fromX: x, fromY: y, startPattern: nextStartPattern };
          publishMovementUpdate(nx, ny, next, nextMove);
          nextMoveId += 1;
          stepTimer = setTimeout(() => finishStep(moveId), WALK_STEP_MS);
          return;
        }
        const edge = current.transfers.edges.find((rule) => rule.x === x && rule.y === y && rule.direction === next);
        if (edge) {
          startTransfer(edge, next);
          return;
        }
        if (stepTimer !== null) {
          clearTimeout(stepTimer);
          stepTimer = null;
        }
        nextStartPattern = 1;
        publishBlocked(next);
      };

      const finishStep = (moveId: number) => {
        if (frame.signal.aborted || activeMove?.id !== moveId) return;
        stepTimer = null;
        const step = current.transfers.steps.find((rule) => rule.x === x && rule.y === y);
        if (step) {
          startTransfer(step, direction);
          return;
        }
        // Step-completion boundary: an accepted pending resize commits here
        // (authoritative boundary per main contract §1). The completing
        // move must be cleared first so the boundary commit is not treated
        // as another active step.
        if (pendingResize !== null) {
          activeMove = null;
          const queued = pendingResize;
          pendingResize = null;
          if (heldDirections.length > 0) {
            // Keep continuity: apply the resize first, then continue the
            // held tail from the post-resize world truth.
            acceptViewport(queued);
            if (frame.signal.aborted) return;
            nextStartPattern = nextStartPattern === 1 ? 3 : 1;
            attempt(heldDirections[heldDirections.length - 1]!);
            return;
          }
          acceptViewport(queued);
          if (frame.signal.aborted) return;
          nextStartPattern = 1;
          publishMovementUpdate(x, y, direction, null);
          return;
        }
        if (heldDirections.length > 0) {
          nextStartPattern = nextStartPattern === 1 ? 3 : 1;
          attempt(heldDirections[heldDirections.length - 1]!);
        } else {
          nextStartPattern = 1;
          publishMovementUpdate(x, y, direction, null);
        }
      };

      const loaded = await loadMap(input.mapId);
      if (!inBounds(loaded.map, input.x, input.y)) throw new TypeError("Map spawn lies outside the loaded Map");
      const playerResource = await scope.content.resource("resource.Graphics", `Characters/${input.characterName}`, { signal: frame.signal });
      playerRef = ref("resource.Graphics", `Characters/${input.characterName}`, playerResource.contentVersion);
      // Viewport initial read precedes any projection: the spawn window uses
      // the accepted current size (scope.viewport.current ?? DEFAULT).
      const initialViewportSample = scope.viewport.current;
      if (initialViewportSample !== null) viewport = clampViewportSize(initialViewportSample.width, initialViewportSample.height);
      const spawnWindow = standingWindow(loaded, input.x, input.y, 1, 1);
      const initial = renderState({
        loaded,
        window: spawnWindow,
        x: input.x,
        y: input.y,
        direction: 2,
        activeMove: null,
        playerRef,
        sceneEpoch: 1,
        visualEpoch: 1,
      }, viewport);
      domain = scope.createRenderDomain(initial);
      current = loaded;
      window = spawnWindow;
      x = input.x;
      y = input.y;
      direction = 2;
      nextMoveId = 1;
      nextStartPattern = 1;
      sceneEpoch = 1;
      visualEpoch = 1;
      heldDirections = [];
      transitioning = false;
      activeMove = null;

      /**
       * Accepted viewport resize (main contract §1/PR2): clamped, same-size
       * no-op, 100ms trailing latest-wins settle, authoritative commit at a
       * safe boundary. While a logical step is active the accepted size is
       * stored as pending and committed at the step-completion boundary;
       * the rebase target/pose derive from world truth, and the shared
       * motion clock keeps the original remainingMs semantics by publishing
       * a fresh motion pair whose from-values rebase from the actually
       * displayed pose (browser-side receipt clock preserves the end time
       * envelope; frozen walking semantics unchanged).
       */
      const acceptViewport = (next: { width: number; height: number }) => {
        if (frame.signal.aborted || transitioning) return;
        const clamped = clampViewportSize(next.width, next.height);
        if (clamped.width === viewport.width && clamped.height === viewport.height) return;
        if (activeMove !== null) {
          // Active logical step: defer to the completion boundary.
          pendingResize = clamped;
          return;
        }
        viewport = clamped;
        const nextVisualEpoch = visualEpoch + 1;
        const nextWindow = standingWindow(current, x, y, sceneEpoch, nextVisualEpoch);
        domain!.replace(renderState(facts({ window: nextWindow, activeMove: null, visualEpoch: nextVisualEpoch }), viewport));
        window = nextWindow;
        visualEpoch = nextVisualEpoch;
      };
      const scheduleViewportResize = (next: { width: number; height: number }) => {
        pendingResize = next;
        if (resizeTimer !== null) clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
          resizeTimer = null;
          const queued = pendingResize;
          pendingResize = null;
          if (queued !== null) acceptViewport(queued);
        }, RESIZE_SETTLE_MS);
      };
      // Initial read -> subscribe convergence (contract §1): a change
      // between the first read and the synchronous first delivery is
      // impossible by construction (same callback), but a later differing
      // sample converges through the same settle path.
      const initialViewport = scope.viewport.current;
      void initialViewport;
      const unsubscribeViewport = scope.viewport.subscribe((value) => {
        if (frame.signal.aborted || value === null) return;
        scheduleViewportResize(value);
      });
      unsubscribeViewportEarly = unsubscribeViewport;
      listener = scope.createInputListener({ frame, channels: ["keyboard.event", "keyboard.state"] });
      listener.on("keyboard.event", (event) => {
        const movement = directionForCode(event.code);
        if (!movement) return;
        if (event.action === "down") {
          if (event.repeat) return;
          heldDirections = heldDirections.filter((item) => item !== movement.direction);
          heldDirections.push(movement.direction);
          if (activeMove === null) attempt(heldDirections[heldDirections.length - 1]!);
          return;
        }
        if (event.action !== "up") return;
        heldDirections = heldDirections.filter((item) => item !== movement.direction);
        if (activeMove === null && heldDirections.length > 0) attempt(heldDirections[heldDirections.length - 1]!);
      });
      listener.on("keyboard.state", (state) => {
        const down = new Set(Array.isArray(state?.down) ? state.down : []);
        heldDirections = heldDirections.filter((item) => down.has(codeByDirection[item]));
        for (const code of fallbackCodes) {
          if (!down.has(code)) continue;
          const movement = directionForCode(code);
          if (!movement || heldDirections.includes(movement.direction)) continue;
          heldDirections.push(movement.direction);
        }
        if (activeMove === null && heldDirections.length > 0) attempt(heldDirections[heldDirections.length - 1]!);
      });
      const outcome = await Promise.race([
        terminal,
        waitForAbort(frame.signal).then(() => cancelled()),
      ]);
      if (!cleanedUp) {
        cleanedUp = true;
        listener.close();
        unsubscribeViewport();
        if (resizeTimer !== null) {
          clearTimeout(resizeTimer);
          resizeTimer = null;
        }
        pendingResize = null;
        if (stepTimer !== null) {
          clearTimeout(stepTimer);
          stepTimer = null;
        }
        activeMove = null;
        transitioning = false;
        domain.close();
      }
      return outcome;
    } catch (error) {
      if (!cleanedUp) {
        cleanedUp = true;
        listener?.close();
        unsubscribeViewportEarly?.();
        if (resizeTimer !== null) {
          clearTimeout(resizeTimer);
          resizeTimer = null;
        }
        pendingResize = null;
        if (stepTimer !== null) {
          clearTimeout(stepTimer);
          stepTimer = null;
        }
        activeMove = null;
        transitioning = false;
        domain?.close();
      }
      if (frame.signal.aborted) return cancelled();
      return failed({ code: "MAP_ACTIVATION_FAILED", message: error instanceof Error ? error.message : "Map activation failed" });
    }
  },
}));
