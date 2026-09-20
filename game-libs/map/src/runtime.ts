import { cancelled, ContentReadError, defineSubsystem, failed, type Frame, type FrameOutcome, type RenderDomain, type RenderDomainState, type RenderDomainUpdate, type SubsystemDefinitionFactory } from "@loomrealm/subsystem";
import {
  assertProjectable,
  boundsContain,
  computeCamera,
  directionForCode,
  emptyMapActionRecord,
  evaluatePassability,
  expandTileBounds,
  JUMP_DURATION_MS,
  planMovement,
  projectTilesInBounds,
  RESIZE_SETTLE_MS,
  unionTileBounds,
  validateMapActionRecord,
  validateMapRecord,
  validateMapTransferRecord,
  validateTilesetRecord,
  VIEW_DATA_GUARD,
  viewportTileBounds,
  WALK_DURATION_MS,
  type BridgeLevel,
  type ContactTransfer,
  type Direction,
  type EdgeTransfer,
  type MapAction,
  type MapActionRecord,
  type MapRecord,
  type MapTransferRecord,
  type MovementPlan,
  type TileProjectionBounds,
  type StepTransfer,
  type TilesetRecord,
} from "./semantics.js";
import { calculateLayout, type MapLayout } from "./layout.js";

interface InitialInput { mapId: number; x: number; y: number; characterName: string }
interface ResourceRef { readonly [name: string]: string; namespace: string; key: string; contentVersion: string }
interface ActiveMove {
  readonly id: number;
  readonly fromX: number;
  readonly fromY: number;
  readonly startPattern: 1 | 3;
  readonly durationMs: number;
  readonly kind: "walk" | "jump";
  readonly peakPx?: number;
}
interface LoadedMap {
  readonly mapId: number;
  readonly map: MapRecord;
  readonly tileset: TilesetRecord;
  readonly tilesetRef: ResourceRef;
  readonly autotileRefs: readonly (ResourceRef | null)[];
  readonly transfers: MapTransferRecord;
  readonly actions: MapActionRecord;
}

type TransferRule = StepTransfer | ContactTransfer | EdgeTransfer;

type TileTuple = readonly [x: number, y: number, z: 0 | 1 | 2, tileId: number, depth: number];

interface TileProjectionWindow {
  readonly source: LoadedMap;
  readonly bounds: TileProjectionBounds;
  readonly tiles: readonly TileTuple[];
}

interface RenderFacts {
  readonly loaded: LoadedMap;
  readonly window: TileProjectionWindow;
  readonly x: number;
  readonly y: number;
  readonly direction: Direction;
  readonly activeMove: ActiveMove | null;
  readonly playerRef: ResourceRef;
  readonly sceneEpoch: number;
  readonly visualEpoch: number;
  readonly layout: MapLayout;
  readonly bridgeLevel: BridgeLevel;
}

function assertBridgeLevel(value: number): asserts value is BridgeLevel {
  if (value !== 0 && value !== 2) throw new TypeError("MAP_BRIDGE_LEVEL_INVALID: legal values are 0 and 2");
}

function isMissingMapAction(error: unknown): boolean {
  if (error instanceof ContentReadError && error.code === "CONTENT_NOT_FOUND") return true;
  return error instanceof TypeError && /missing struct\.MapAction/u.test(error.message);
}

function occupies(action: Pick<MapAction, "occupied">, tileX: number, tileY: number): boolean {
  return action.occupied.some((tile) => tile.x === tileX && tile.y === tileY);
}

function playerMotionPayload(activeMove: ActiveMove, fromScreenX: number, fromScreenY: number) {
  if (activeMove.kind === "jump") {
    return Object.freeze({
      id: activeMove.id,
      durationMs: activeMove.durationMs,
      fromY: activeMove.fromY,
      fromScreenX,
      fromScreenY,
      kind: "jump",
      peakPx: activeMove.peakPx ?? 0,
    });
  }
  return Object.freeze({
    id: activeMove.id,
    durationMs: activeMove.durationMs,
    fromY: activeMove.fromY,
    fromScreenX,
    fromScreenY,
  });
}

type RenderDataSet = NonNullable<NonNullable<NonNullable<RenderDomainUpdate["nodes"]>[number]["data"]>["set"]>;
const VIEWPORT_KEY = "viewport";
const PLAYER_KEY = "player";
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

function viewportPayload(
  loaded: LoadedMap,
  window: TileProjectionWindow,
  cameraX: number,
  cameraY: number,
  cameraMotion: unknown,
  sceneEpoch: number,
  visualEpoch: number,
  motionId: number | null,
  layout: MapLayout,
  bridgeLevel: BridgeLevel,
): RenderDomainState["roots"][number]["data"] {
  return {
    sceneEpoch,
    visualEpoch,
    motionId,
    viewportWidth: layout.windowWidth,
    viewportHeight: layout.windowHeight,
    barHeight: layout.barHeight,
    contentWidth: layout.contentWidth,
    contentHeight: layout.contentHeight,
    columns: layout.columns,
    rows: layout.rows,
    logicalWidth: layout.logicalWidth,
    logicalHeight: layout.logicalHeight,
    scaleX: layout.scaleX,
    scaleY: layout.scaleY,
    mapName: String(loaded.mapId),
    mapId: loaded.mapId,
    mapWidth: loaded.map.width,
    mapHeight: loaded.map.height,
    cameraX,
    cameraY,
    tileset: loaded.tilesetRef,
    autotiles: loaded.autotileRefs,
    tiles: window.tiles,
    cameraMotion,
    bridgeLevel,
  } as unknown as RenderDomainState["roots"][number]["data"];
}

function playerPayload(
  facts: RenderFacts,
  cameraX: number,
  cameraY: number,
  motionId: number | null,
): RenderDomainState["roots"][number]["children"][number]["data"] {
  const { x, y, direction, activeMove, playerRef, sceneEpoch, visualEpoch, layout, bridgeLevel } = facts;
  if (activeMove) {
    const fromCamera = computeCamera(facts.loaded.map, activeMove.fromX, activeMove.fromY, layout);
    return {
      sceneEpoch,
      visualEpoch,
      motionId,
      x,
      y,
      screenX: x * 32 - cameraX,
      screenY: y * 32 - cameraY,
      direction,
      pattern: activeMove.startPattern,
      sprite: playerRef,
      motion: playerMotionPayload(activeMove, activeMove.fromX * 32 - fromCamera.cameraX, activeMove.fromY * 32 - fromCamera.cameraY),
      bridgeLevel,
    } as unknown as RenderDomainState["roots"][number]["children"][number]["data"];
  }
  return {
    sceneEpoch,
    visualEpoch,
    motionId,
    x,
    y,
    screenX: x * 32 - cameraX,
    screenY: y * 32 - cameraY,
    direction,
    pattern: 0,
    sprite: playerRef,
    motion: null,
    bridgeLevel,
  } as unknown as RenderDomainState["roots"][number]["children"][number]["data"];
}

function projectionBytes(data: unknown): number {
  return new TextEncoder().encode(JSON.stringify(data)).byteLength;
}

function layoutFromViewport(value: { readonly width: number; readonly height: number } | null | undefined): MapLayout | null {
  if (value === null || value === undefined) return null;
  try {
    return calculateLayout(value.width, value.height);
  } catch {
    return null;
  }
}

function layoutsEqual(left: MapLayout, right: MapLayout): boolean {
  return left.windowWidth === right.windowWidth && left.windowHeight === right.windowHeight;
}

function windowCovers(window: TileProjectionWindow, map: MapRecord, required: ReturnType<typeof viewportTileBounds>): boolean {
  return window.source.map === map && boundsContain(window.bounds, required);
}

function selectProjectionWindow(
  loaded: LoadedMap,
  required: ReturnType<typeof viewportTileBounds>,
  cameraX: number,
  cameraY: number,
  cameraMotion: unknown,
  sceneEpoch: number,
  visualEpoch: number,
  motionId: number | null,
  _previous: TileProjectionWindow | undefined,
  layout: MapLayout,
): TileProjectionWindow {
  for (const margin of [4, 3, 2, 1]) {
    const bounds = expandTileBounds(required, margin, loaded.map);
    const tiles = Object.freeze(projectTilesInBounds(loaded.map, loaded.tileset, bounds).map((tile) => Object.freeze([
      tile.x,
      tile.y,
      tile.z,
      tile.tileId,
      tile.depth,
    ]) as TileTuple));
    const candidate: TileProjectionWindow = Object.freeze({ source: loaded, bounds, tiles });
    if (projectionBytes(viewportPayload(loaded, candidate, cameraX, cameraY, cameraMotion, sceneEpoch, visualEpoch, motionId, layout, 0)) < VIEW_DATA_GUARD) {
      return candidate;
    }
  }
  throw new RangeError("Map projection budget exceeded");
}

function renderState(facts: RenderFacts): RenderDomainState {
  const { loaded, window, activeMove, sceneEpoch, visualEpoch, layout, bridgeLevel } = facts;
  const motionId = activeMove?.id ?? null;
  const camera = computeCamera(loaded.map, facts.x, facts.y, layout);
  const cameraMotion = activeMove === null ? null : Object.freeze({
    id: activeMove.id,
    durationMs: activeMove.durationMs,
    fromCameraX: computeCamera(loaded.map, activeMove.fromX, activeMove.fromY, layout).cameraX,
    fromCameraY: computeCamera(loaded.map, activeMove.fromX, activeMove.fromY, layout).cameraY,
  });
  return {
    zIndex: 0,
    roots: [{
      key: VIEWPORT_KEY, tag: "lr-map-view", attrs: {},
      data: viewportPayload(loaded, window, camera.cameraX, camera.cameraY, cameraMotion, sceneEpoch, visualEpoch, motionId, layout, bridgeLevel),
      children: [{
        key: PLAYER_KEY, tag: "lr-map-sprite", attrs: {},
        data: playerPayload(facts, camera.cameraX, camera.cameraY, motionId),
        children: [],
      }],
    }],
  };
}

export const mapDefinition: SubsystemDefinitionFactory = defineSubsystem((scope) => ({
  async frame(frame: Frame) {
    let listener;
    let domain: RenderDomain | undefined;
    let stepTimer: ReturnType<typeof setTimeout> | null = null;
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    let unsubscribeViewport: (() => void) | null = null;
    let activeMove: ActiveMove | null = null;
    let transitioning = false;
    let cleanedUp = false;
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
        let actions: MapActionRecord;
        try {
          actions = validateMapActionRecord((await scope.content.record("struct.MapAction", String(mapId), { signal: frame.signal })).value, mapId);
        } catch (error) {
          if (!isMissingMapAction(error)) throw error;
          actions = emptyMapActionRecord(mapId);
        }
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
          actions,
        });
      };

      let current!: LoadedMap;
      let window!: TileProjectionWindow;
      let x = 0;
      let y = 0;
      let direction: Direction = 2;
      let nextMoveId = 1;
      let nextStartPattern: 1 | 3 = 1;
      let heldDirections: Direction[] = [];
      let playerRef!: ResourceRef;
      let sceneEpoch = 1;
      let visualEpoch = 1;
      let bridgeLevel: BridgeLevel = 0;
      let lastStarted: { readonly eventId: number; readonly x: number; readonly y: number } | null = null;
      let eventBusy = false;
      let latestLayout = layoutFromViewport(scope.viewport.current);
      let acceptedLayout: MapLayout | null = null;
      let pendingLayout: MapLayout | null = null;
      let settledResize = false;
      let resolveFirstLayout!: (layout: MapLayout) => void;
      const firstLayout = new Promise<MapLayout>((resolve) => { resolveFirstLayout = resolve; });

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
        layout: overrides.layout ?? acceptedLayout!,
        bridgeLevel: overrides.bridgeLevel ?? bridgeLevel,
      });

      const standingWindow = (loaded: LoadedMap, tileX: number, tileY: number, scene: number, visual: number, layout: MapLayout = acceptedLayout!) => {
        const camera = computeCamera(loaded.map, tileX, tileY, layout);
        return selectProjectionWindow(
          loaded,
          viewportTileBounds(loaded.map, camera.cameraX, camera.cameraY, layout),
          camera.cameraX,
          camera.cameraY,
          null,
          scene,
          visual,
          null,
          undefined,
          layout,
        );
      };

      const clearResizeTimer = () => {
        if (resizeTimer !== null) {
          clearTimeout(resizeTimer);
          resizeTimer = null;
        }
      };

      const commitViewportResize = () => {
        if (frame.signal.aborted || transitioning || !domain || pendingLayout === null || acceptedLayout === null) return;
        const nextLayout = pendingLayout;
        if (layoutsEqual(nextLayout, acceptedLayout)) {
          pendingLayout = null;
          clearResizeTimer();
          return;
        }
        clearResizeTimer();
        try {
          const nextVisual = visualEpoch + 1;
          const camera = computeCamera(current.map, x, y, nextLayout);
          const required = viewportTileBounds(current.map, camera.cameraX, camera.cameraY, nextLayout);
          const nextWindow = selectProjectionWindow(
            current,
            required,
            camera.cameraX,
            camera.cameraY,
            null,
            sceneEpoch,
            nextVisual,
            null,
            window,
            nextLayout,
          );
          const screenX = x * 32 - camera.cameraX;
          const screenY = y * 32 - camera.cameraY;
          domain.update({
            nodes: [
              {
                key: VIEWPORT_KEY,
                data: {
                  set: {
                    visualEpoch: nextVisual,
                    viewportWidth: nextLayout.windowWidth,
                    viewportHeight: nextLayout.windowHeight,
                    barHeight: nextLayout.barHeight,
                    contentWidth: nextLayout.contentWidth,
                    contentHeight: nextLayout.contentHeight,
                    columns: nextLayout.columns,
                    rows: nextLayout.rows,
                    logicalWidth: nextLayout.logicalWidth,
                    logicalHeight: nextLayout.logicalHeight,
                    scaleX: nextLayout.scaleX,
                    scaleY: nextLayout.scaleY,
                    cameraX: camera.cameraX,
                    cameraY: camera.cameraY,
                    cameraMotion: null,
                    motionId: null,
                    tiles: nextWindow.tiles,
                    bridgeLevel,
                  },
                },
              },
              {
                key: PLAYER_KEY,
                data: {
                  set: {
                    visualEpoch: nextVisual,
                    screenX,
                    screenY,
                    motion: null,
                    motionId: null,
                    pattern: 0,
                    bridgeLevel,
                  },
                },
              },
            ],
          });
          pendingLayout = null;
          acceptedLayout = nextLayout;
          window = nextWindow;
          visualEpoch = nextVisual;
          settledResize = true;
        } catch {
          // Keep pendingLayout so a later sample or step boundary can retry.
          // Do not restart the settle timer here: that would retry forever.
        }
      };

      const scheduleSettledResize = () => {
        if (activeMove !== null || transitioning) return;
        if (!settledResize) {
          commitViewportResize();
          return;
        }
        clearResizeTimer();
        resizeTimer = setTimeout(() => {
          resizeTimer = null;
          if (frame.signal.aborted || transitioning || activeMove !== null) return;
          commitViewportResize();
        }, RESIZE_SETTLE_MS);
      };

      const noteViewport = (value: { readonly width: number; readonly height: number } | null) => {
        if (frame.signal.aborted) return;
        const next = layoutFromViewport(value);
        if (next === null) return;
        latestLayout = next;
        resolveFirstLayout(next);
        if (!domain || acceptedLayout === null) return;
        if (layoutsEqual(next, acceptedLayout)) {
          pendingLayout = null;
          clearResizeTimer();
          return;
        }
        pendingLayout = next;
        if (transitioning) return;
        scheduleSettledResize();
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
          const target = await loadMap(rule.targetMapId);
          if (frame.signal.aborted || !transitioning) {
            transitioning = false;
            return;
          }
          if (!inBounds(target.map, rule.targetX, rule.targetY)) throw new TypeError("Map transfer target lies outside the loaded Map");
          const nextDirection = "targetDirection" in rule ? rule.targetDirection ?? attemptedDirection : attemptedDirection;
          const nextScene = sceneEpoch + 1;
          const nextVisual = visualEpoch + 1;
          const liveLayout = latestLayout ?? acceptedLayout!;
          const nextWindow = standingWindow(target, rule.targetX, rule.targetY, nextScene, nextVisual, liveLayout);
          const nextFacts = facts({
            loaded: target,
            window: nextWindow,
            x: rule.targetX,
            y: rule.targetY,
            direction: nextDirection,
            activeMove: null,
            sceneEpoch: nextScene,
            visualEpoch: nextVisual,
            layout: liveLayout,
            bridgeLevel: 0,
          });
          domain!.replace(renderState(nextFacts));
          current = target;
          window = nextWindow;
          x = rule.targetX;
          y = rule.targetY;
          direction = nextDirection;
          sceneEpoch = nextScene;
          visualEpoch = nextVisual;
          acceptedLayout = liveLayout;
          pendingLayout = null;
          clearResizeTimer();
          activeMove = null;
          bridgeLevel = 0;
          lastStarted = null;
          eventBusy = false;
          if (stepTimer !== null) {
            clearTimeout(stepTimer);
            stepTimer = null;
          }
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
        domain!.replace(renderState(facts({ direction: nextDirection, window: nextWindow, activeMove: null })));
        direction = nextDirection;
        window = nextWindow;
        activeMove = null;
      };

      const publishMovementUpdate = (nextX: number, nextY: number, nextDirection: Direction, nextMove: ActiveMove | null) => {
        const fromX = nextMove?.fromX ?? x;
        const fromY = nextMove?.fromY ?? y;
        const sourceCamera = computeCamera(current.map, fromX, fromY, acceptedLayout!);
        const targetCamera = computeCamera(current.map, nextX, nextY, acceptedLayout!);
        const required = nextMove === null
          ? viewportTileBounds(current.map, targetCamera.cameraX, targetCamera.cameraY, acceptedLayout!)
          : unionTileBounds(
            viewportTileBounds(current.map, sourceCamera.cameraX, sourceCamera.cameraY, acceptedLayout!),
            viewportTileBounds(current.map, targetCamera.cameraX, targetCamera.cameraY, acceptedLayout!),
          );
        const motionId = nextMove?.id ?? null;
        const cameraMotion = nextMove === null ? null : Object.freeze({
          id: nextMove.id,
          durationMs: nextMove.durationMs,
          fromCameraX: sourceCamera.cameraX,
          fromCameraY: sourceCamera.cameraY,
        });
        let nextWindow = window;
        let nextVisual = visualEpoch;
        let refresh = false;
        if (!(window.source === current && windowCovers(window, current.map, required))) {
          nextVisual = visualEpoch + 1;
          nextWindow = selectProjectionWindow(
            current,
            required,
            targetCamera.cameraX,
            targetCamera.cameraY,
            cameraMotion,
            sceneEpoch,
            nextVisual,
            motionId,
            window,
            acceptedLayout!,
          );
          refresh = true;
        }
        const screenX = nextX * 32 - targetCamera.cameraX;
        const screenY = nextY * 32 - targetCamera.cameraY;
        const fromScreenX = fromX * 32 - sourceCamera.cameraX;
        const fromScreenY = fromY * 32 - sourceCamera.cameraY;
        const viewportSet: Record<string, unknown> = {
          cameraX: targetCamera.cameraX,
          cameraY: targetCamera.cameraY,
          cameraMotion,
          motionId,
          bridgeLevel,
        };
        const playerSet: Record<string, unknown> = {
          x: nextX,
          y: nextY,
          screenX,
          screenY,
          direction: nextDirection,
          pattern: nextMove === null ? 0 : nextMove.startPattern,
          motion: nextMove === null ? null : playerMotionPayload(nextMove, fromScreenX, fromScreenY),
          motionId,
          bridgeLevel,
        };
        if (refresh) {
          viewportSet.visualEpoch = nextVisual;
          viewportSet.tiles = nextWindow.tiles;
          playerSet.visualEpoch = nextVisual;
        }
        domain!.update({
          nodes: [
            { key: VIEWPORT_KEY, data: { set: viewportSet as RenderDataSet } },
            { key: PLAYER_KEY, data: { set: playerSet as RenderDataSet } },
          ],
        });
        window = nextWindow;
        visualEpoch = nextVisual;
        x = nextX;
        y = nextY;
        direction = nextDirection;
        activeMove = nextMove;
      };

      const failOpaque = (tileX: number, tileY: number): boolean => {
        const hit = current.actions.opaqueRelated.find((action) => occupies(action, tileX, tileY));
        if (!hit) return false;
        if (frame.signal.aborted || terminalSettled) return true;
        terminalSettled = true;
        resolveTerminal(failed({
          code: "MAP_ACTION_OPAQUE_RELATED",
          message: `${hit.reason} at map ${hit.mapId} event ${hit.eventId} page ${hit.pageIndex}`,
        }));
        return true;
      };

      const hereActions = (tileX: number, tileY: number) => current.actions.actions
        .filter((action): action is Extract<MapAction, { kind: "bridge" }> => (
          action.kind === "bridge" && action.trigger === 1 && occupies(action, tileX, tileY)
        ))
        .sort((left, right) => left.eventId - right.eventId);

      const occupyingLastStarted = () => (
        lastStarted !== null && hereActions(x, y).some((action) => action.eventId === lastStarted!.eventId)
      );

      const releaseLastStartedIfLeft = () => {
        if (!lastStarted) return;
        if (occupyingLastStarted()) return;
        if (lastStarted.x === x && lastStarted.y === y) return;
        lastStarted = null;
      };

      const overTrigger = (action: Extract<MapAction, { kind: "bridge" }>, tileX: number, tileY: number) => {
        // PROJECT-DECISION-PROVISIONAL: Essentials over_trigger? using projected through/emptyGraphic + runtime passability.
        if (action.through === true) return true;
        if (action.emptyGraphic !== true) return false;
        const pass = evaluatePassability(current.map, current.tileset, tileX, tileY, 0, bridgeLevel);
        return pass.status === "decided" && pass.passable;
      };

      const executeAction = (action: Extract<MapAction, { kind: "bridge" }>) => {
        eventBusy = true;
        const nextLevel: BridgeLevel = action.op === "bridge-on" ? 2 : 0;
        assertBridgeLevel(nextLevel);
        bridgeLevel = nextLevel;
        domain!.update({
          nodes: [
            { key: VIEWPORT_KEY, data: { set: { bridgeLevel } as RenderDataSet } },
            { key: PLAYER_KEY, data: { set: { bridgeLevel } as RenderDataSet } },
          ],
        });
        eventBusy = false;
      };

      const startHereOrFront = (tileX: number, tileY: number, requireOverTrigger: boolean): boolean => {
        if (failOpaque(tileX, tileY)) return true;
        releaseLastStartedIfLeft();
        const candidates = hereActions(tileX, tileY).filter((action) => !requireOverTrigger || overTrigger(action, tileX, tileY));
        const action = candidates.find((item) => lastStarted?.eventId !== item.eventId);
        if (!action) return false;
        lastStarted = { eventId: action.eventId, x, y };
        executeAction(action);
        return true;
      };

      const attempt = (next: Direction) => {
        if (frame.signal.aborted || transitioning || eventBusy) return;
        const { dx, dy } = stepDelta[next];
        const nx = x + dx;
        const ny = y + dy;
        if (inBounds(current.map, nx, ny)) {
          const contact = current.transfers.contacts.find((rule) => rule.x === x && rule.y === y && rule.direction === next);
          if (contact) {
            startTransfer(contact, next);
            return;
          }
        }
        const plan: MovementPlan = planMovement(current.map, current.tileset, x, y, next, bridgeLevel);
        if (plan.kind === "blocked") {
          if (inBounds(current.map, nx, ny)) {
            startHereOrFront(nx, ny, false);
          } else {
            const edge = current.transfers.edges.find((rule) => rule.x === x && rule.y === y && rule.direction === next);
            if (edge) {
              startTransfer(edge, next);
              return;
            }
          }
          if (stepTimer !== null) {
            clearTimeout(stepTimer);
            stepTimer = null;
          }
          nextStartPattern = 1;
          publishBlocked(next);
          return;
        }
        const moveId = nextMoveId;
        const nextMove: ActiveMove = plan.kind === "jump"
          ? { id: moveId, fromX: x, fromY: y, startPattern: nextStartPattern, durationMs: JUMP_DURATION_MS, kind: "jump", peakPx: plan.peakPx }
          : { id: moveId, fromX: x, fromY: y, startPattern: nextStartPattern, durationMs: WALK_DURATION_MS, kind: "walk" };
        publishMovementUpdate(plan.toX, plan.toY, next, nextMove);
        nextMoveId += 1;
        stepTimer = setTimeout(() => finishStep(moveId), nextMove.durationMs);
      };

      const finishStep = (moveId: number) => {
        if (frame.signal.aborted || activeMove?.id !== moveId) return;
        stepTimer = null;
        const step = current.transfers.steps.find((rule) => rule.x === x && rule.y === y);
        if (step) {
          startTransfer(step, direction);
          return;
        }
        const hadPendingResize = pendingLayout !== null;
        if (hadPendingResize) commitViewportResize();
        const resizeCommitted = hadPendingResize && pendingLayout === null;
        if (resizeCommitted) activeMove = null;
        const started = startHereOrFront(x, y, true);
        if (started || eventBusy) {
          nextStartPattern = 1;
          if (!resizeCommitted) publishMovementUpdate(x, y, direction, null);
          return;
        }
        if (heldDirections.length > 0) {
          nextStartPattern = nextStartPattern === 1 ? 3 : 1;
          attempt(heldDirections[heldDirections.length - 1]!);
          return;
        }
        nextStartPattern = 1;
        if (!resizeCommitted) publishMovementUpdate(x, y, direction, null);
      };

      unsubscribeViewport = scope.viewport.subscribe((value) => noteViewport(value));
      if (latestLayout === null) {
        const initial = await Promise.race([
          firstLayout,
          waitForAbort(frame.signal).then(() => null),
        ]);
        if (initial === null) throw new Error("Map activation cancelled while waiting for viewport");
        latestLayout = initial;
      }
      acceptedLayout = latestLayout;
      const loaded = await loadMap(input.mapId);
      if (!inBounds(loaded.map, input.x, input.y)) throw new TypeError("Map spawn lies outside the loaded Map");
      const playerResource = await scope.content.resource("resource.Graphics", `Characters/${input.characterName}`, { signal: frame.signal });
      playerRef = ref("resource.Graphics", `Characters/${input.characterName}`, playerResource.contentVersion);
      latestLayout = layoutFromViewport(scope.viewport.current) ?? latestLayout;
      acceptedLayout = latestLayout!;
      const spawnWindow = standingWindow(loaded, input.x, input.y, 1, 1, acceptedLayout);
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
        layout: acceptedLayout,
        bridgeLevel: 0,
      });
      domain = scope.createRenderDomain(initial);
      current = loaded;
      window = spawnWindow;
      x = input.x;
      y = input.y;
      direction = 2;
      sceneEpoch = 1;
      visualEpoch = 1;
      nextMoveId = 1;
      nextStartPattern = 1;
      heldDirections = [];
      transitioning = false;
      activeMove = null;
      bridgeLevel = 0;
      lastStarted = null;
      eventBusy = false;
      listener = scope.createInputListener({ frame, channels: ["keyboard.event", "keyboard.state"] });
      listener.on("keyboard.event", (event) => {
        const movement = directionForCode(event.code);
        if (!movement) return;
        if (event.action === "down") {
          if (event.repeat) return;
          heldDirections = heldDirections.filter((item) => item !== movement.direction);
          heldDirections.push(movement.direction);
          if (activeMove === null && !eventBusy) attempt(heldDirections[heldDirections.length - 1]!);
          return;
        }
        if (event.action !== "up") return;
        heldDirections = heldDirections.filter((item) => item !== movement.direction);
        if (activeMove === null && !eventBusy && heldDirections.length > 0) attempt(heldDirections[heldDirections.length - 1]!);
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
        if (activeMove === null && !eventBusy && heldDirections.length > 0) attempt(heldDirections[heldDirections.length - 1]!);
      });
      const outcome = await Promise.race([
        terminal,
        waitForAbort(frame.signal).then(() => cancelled()),
      ]);
      if (!cleanedUp) {
        cleanedUp = true;
        unsubscribeViewport?.();
        unsubscribeViewport = null;
        clearResizeTimer();
        listener.close();
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
        unsubscribeViewport?.();
        unsubscribeViewport = null;
        if (resizeTimer !== null) {
          clearTimeout(resizeTimer);
          resizeTimer = null;
        }
        listener?.close();
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
