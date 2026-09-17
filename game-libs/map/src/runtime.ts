import { cancelled, defineSubsystem, failed, type Frame, type FrameOutcome, type RenderDomain, type RenderDomainState, type RenderDomainUpdate, type SubsystemDefinitionFactory } from "@loomrealm/subsystem";
import {
  assertProjectable,
  canMove,
  chunkCoordsForBounds,
  clampViewport,
  computeCamera,
  directionForCode,
  projectChunkWindow,
  RESIZE_SETTLE_MS,
  unionTileBounds,
  validateMapRecord,
  validateMapTransferRecord,
  validateTilesetRecord,
  VIEW_DATA_GUARD,
  viewportTileBounds,
  viewportsEqual,
  type ContactTransfer,
  type Direction,
  type EdgeTransfer,
  type MapRecord,
  type MapTransferRecord,
  type ProjectionWindow,
  type StepTransfer,
  type TilesetRecord,
  type ViewportSize,
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

interface TileProjectionWindow extends ProjectionWindow {
  readonly source: LoadedMap;
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
  readonly viewport: ViewportSize;
}

type RenderDataSet = NonNullable<NonNullable<NonNullable<RenderDomainUpdate["nodes"]>[number]["data"]>["set"]>;
const WALK_STEP_MS = 250;
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
  viewport: ViewportSize,
): RenderDomainState["roots"][number]["data"] {
  return {
    sceneEpoch,
    visualEpoch,
    motionId,
    viewportWidth: viewport.width,
    viewportHeight: viewport.height,
    mapId: loaded.mapId,
    mapWidth: loaded.map.width,
    mapHeight: loaded.map.height,
    cameraX,
    cameraY,
    tileset: loaded.tilesetRef,
    autotiles: loaded.autotileRefs,
    tileVisuals: window.tileVisuals,
    chunks: window.chunks,
    cameraMotion,
  } as unknown as RenderDomainState["roots"][number]["data"];
}

function playerPayload(
  facts: RenderFacts,
  cameraX: number,
  cameraY: number,
  motionId: number | null,
): RenderDomainState["roots"][number]["children"][number]["data"] {
  const { x, y, direction, activeMove, playerRef, sceneEpoch, visualEpoch, viewport } = facts;
  if (activeMove) {
    const fromCamera = computeCamera(facts.loaded.map, activeMove.fromX, activeMove.fromY, viewport);
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
      motion: Object.freeze({
        id: activeMove.id,
        durationMs: WALK_STEP_MS,
        fromY: activeMove.fromY,
        fromScreenX: activeMove.fromX * 32 - fromCamera.cameraX,
        fromScreenY: activeMove.fromY * 32 - fromCamera.cameraY,
      }),
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
  } as unknown as RenderDomainState["roots"][number]["children"][number]["data"];
}

function projectionBytes(data: unknown): number {
  return new TextEncoder().encode(JSON.stringify(data)).byteLength;
}

function windowCovers(window: TileProjectionWindow, map: MapRecord, required: ReturnType<typeof viewportTileBounds>): boolean {
  const coords = chunkCoordsForBounds(map, required);
  if (coords.length !== window.chunks.length) return false;
  return coords.every((coord, index) => {
    const chunk = window.chunks[index]!;
    return chunk.chunkX === coord.chunkX && chunk.chunkY === coord.chunkY;
  });
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
  previous: TileProjectionWindow | undefined,
  viewport: ViewportSize,
): TileProjectionWindow {
  const projected = projectChunkWindow(
    loaded.map,
    loaded.tileset,
    required,
    previous?.source === loaded ? previous : undefined,
  );
  const candidate: TileProjectionWindow = Object.freeze({ source: loaded, ...projected });
  if (projectionBytes(viewportPayload(loaded, candidate, cameraX, cameraY, cameraMotion, sceneEpoch, visualEpoch, motionId, viewport)) >= VIEW_DATA_GUARD) {
    throw new RangeError("Map projection budget exceeded");
  }
  return candidate;
}

function renderState(facts: RenderFacts): RenderDomainState {
  const { loaded, window, activeMove, sceneEpoch, visualEpoch, viewport } = facts;
  const motionId = activeMove?.id ?? null;
  const camera = computeCamera(loaded.map, facts.x, facts.y, viewport);
  const cameraMotion = activeMove === null ? null : Object.freeze({
    id: activeMove.id,
    durationMs: WALK_STEP_MS,
    fromCameraX: computeCamera(loaded.map, activeMove.fromX, activeMove.fromY, viewport).cameraX,
    fromCameraY: computeCamera(loaded.map, activeMove.fromX, activeMove.fromY, viewport).cameraY,
  });
  return {
    zIndex: 0,
    roots: [{
      key: VIEWPORT_KEY, tag: "lr-map-view", attrs: {},
      data: viewportPayload(loaded, window, camera.cameraX, camera.cameraY, cameraMotion, sceneEpoch, visualEpoch, motionId, viewport),
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
      let acceptedViewport: ViewportSize = clampViewport(scope.viewport.current);
      let pendingViewport: ViewportSize | null = null;
      let settledResize = false;

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
        viewport: overrides.viewport ?? acceptedViewport,
      });

      const standingWindow = (loaded: LoadedMap, tileX: number, tileY: number, scene: number, visual: number, viewport: ViewportSize = acceptedViewport) => {
        const camera = computeCamera(loaded.map, tileX, tileY, viewport);
        return selectProjectionWindow(
          loaded,
          viewportTileBounds(loaded.map, camera.cameraX, camera.cameraY, viewport),
          camera.cameraX,
          camera.cameraY,
          null,
          scene,
          visual,
          null,
          undefined,
          viewport,
        );
      };

      const clearResizeTimer = () => {
        if (resizeTimer !== null) {
          clearTimeout(resizeTimer);
          resizeTimer = null;
        }
      };

      const commitViewportResize = () => {
        if (frame.signal.aborted || transitioning || !domain || pendingViewport === null) return;
        const nextViewport = pendingViewport;
        if (viewportsEqual(nextViewport, acceptedViewport)) {
          pendingViewport = null;
          clearResizeTimer();
          return;
        }
        clearResizeTimer();
        try {
          const nextVisual = visualEpoch + 1;
          const camera = computeCamera(current.map, x, y, nextViewport);
          const required = viewportTileBounds(current.map, camera.cameraX, camera.cameraY, nextViewport);
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
            nextViewport,
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
                    viewportWidth: nextViewport.width,
                    viewportHeight: nextViewport.height,
                    cameraX: camera.cameraX,
                    cameraY: camera.cameraY,
                    cameraMotion: null,
                    motionId: null,
                    chunks: nextWindow.chunks,
                    tileVisuals: nextWindow.tileVisuals,
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
                  },
                },
              },
            ],
          });
          pendingViewport = null;
          acceptedViewport = nextViewport;
          window = nextWindow;
          visualEpoch = nextVisual;
          settledResize = true;
        } catch {
          // Keep pendingViewport so a later sample or step boundary can retry.
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
        if (frame.signal.aborted || !domain) return;
        if (value === null) return;
        const next = clampViewport(value);
        if (viewportsEqual(next, acceptedViewport)) {
          pendingViewport = null;
          clearResizeTimer();
          return;
        }
        pendingViewport = next;
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
          const liveViewport = pendingViewport ?? clampViewport(scope.viewport.current);
          const nextWindow = standingWindow(target, rule.targetX, rule.targetY, nextScene, nextVisual, liveViewport);
          const nextFacts = facts({
            loaded: target,
            window: nextWindow,
            x: rule.targetX,
            y: rule.targetY,
            direction: nextDirection,
            activeMove: null,
            sceneEpoch: nextScene,
            visualEpoch: nextVisual,
            viewport: liveViewport,
          });
          domain!.replace(renderState(nextFacts));
          current = target;
          window = nextWindow;
          x = rule.targetX;
          y = rule.targetY;
          direction = nextDirection;
          sceneEpoch = nextScene;
          visualEpoch = nextVisual;
          acceptedViewport = liveViewport;
          pendingViewport = null;
          clearResizeTimer();
          activeMove = null;
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
        const sourceCamera = computeCamera(current.map, fromX, fromY, acceptedViewport);
        const targetCamera = computeCamera(current.map, nextX, nextY, acceptedViewport);
        const required = nextMove === null
          ? viewportTileBounds(current.map, targetCamera.cameraX, targetCamera.cameraY, acceptedViewport)
          : unionTileBounds(
            viewportTileBounds(current.map, sourceCamera.cameraX, sourceCamera.cameraY, acceptedViewport),
            viewportTileBounds(current.map, targetCamera.cameraX, targetCamera.cameraY, acceptedViewport),
          );
        const motionId = nextMove?.id ?? null;
        const cameraMotion = nextMove === null ? null : Object.freeze({
          id: nextMove.id,
          durationMs: WALK_STEP_MS,
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
            acceptedViewport,
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
        };
        const playerSet: Record<string, unknown> = {
          x: nextX,
          y: nextY,
          screenX,
          screenY,
          direction: nextDirection,
          pattern: nextMove === null ? 0 : nextMove.startPattern,
          motion: nextMove === null ? null : Object.freeze({
            id: nextMove.id,
            durationMs: WALK_STEP_MS,
            fromY: nextMove.fromY,
            fromScreenX,
            fromScreenY,
          }),
          motionId,
        };
        if (refresh) {
          viewportSet.visualEpoch = nextVisual;
          viewportSet.chunks = nextWindow.chunks;
          viewportSet.tileVisuals = nextWindow.tileVisuals;
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
        const hadPendingResize = pendingViewport !== null;
        if (hadPendingResize) commitViewportResize();
        const resizeCommitted = hadPendingResize && pendingViewport === null;
        if (resizeCommitted) activeMove = null;
        const step = current.transfers.steps.find((rule) => rule.x === x && rule.y === y);
        if (step) {
          startTransfer(step, direction);
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

      const loaded = await loadMap(input.mapId);
      if (!inBounds(loaded.map, input.x, input.y)) throw new TypeError("Map spawn lies outside the loaded Map");
      const playerResource = await scope.content.resource("resource.Graphics", `Characters/${input.characterName}`, { signal: frame.signal });
      playerRef = ref("resource.Graphics", `Characters/${input.characterName}`, playerResource.contentVersion);
      const spawnWindow = standingWindow(loaded, input.x, input.y, 1, 1, acceptedViewport);
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
        viewport: acceptedViewport,
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
      unsubscribeViewport = scope.viewport.subscribe((value) => noteViewport(value));
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
