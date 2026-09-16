import { cancelled, defineSubsystem, failed, type Frame, type FrameOutcome, type RenderDomainState, type SubsystemDefinitionFactory } from "@loomrealm/subsystem";
import {
  assertProjectable,
  boundsContain,
  canMove,
  computeCamera,
  directionForCode,
  expandTileBounds,
  projectTilesInBounds,
  unionTileBounds,
  validateMapRecord,
  validateMapTransferRecord,
  validateTilesetRecord,
  viewportTileBounds,
  type ContactTransfer,
  type Direction,
  type EdgeTransfer,
  type MapRecord,
  type MapTransferRecord,
  type StepTransfer,
  type TilesetRecord,
  type VisibleTile,
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

interface TileProjectionWindow {
  readonly source: LoadedMap;
  readonly minTileX: number;
  readonly minTileY: number;
  readonly maxTileX: number;
  readonly maxTileY: number;
  readonly tiles: readonly VisibleTile[];
}

interface RenderFacts {
  readonly loaded: LoadedMap;
  readonly window: TileProjectionWindow;
  readonly x: number;
  readonly y: number;
  readonly direction: Direction;
  readonly activeMove: ActiveMove | null;
  readonly playerRef: ResourceRef;
}

const WALK_STEP_MS = 250;
const VIEWPORT_KEY = "viewport";
const PLAYER_KEY = "player";
const MAX_PROJECTED_DATA_BYTES = 196_608;
const PROJECTION_MARGINS = [4, 3, 2, 1] as const;
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
): RenderDomainState["roots"][number]["data"] {
  return {
    mapId: loaded.mapId,
    mapWidth: loaded.map.width,
    mapHeight: loaded.map.height,
    cameraX,
    cameraY,
    tileset: loaded.tilesetRef,
    autotiles: loaded.autotileRefs,
    tiles: window.tiles,
    cameraMotion,
  } as unknown as RenderDomainState["roots"][number]["data"];
}

function projectionBytes(data: unknown): number {
  return new TextEncoder().encode(JSON.stringify(data)).byteLength;
}

function selectProjectionWindow(
  loaded: LoadedMap,
  required: ReturnType<typeof viewportTileBounds>,
  cameraX: number,
  cameraY: number,
  cameraMotion: unknown,
): TileProjectionWindow {
  let selected: TileProjectionWindow | undefined;
  for (const margin of PROJECTION_MARGINS) {
    const bounds = expandTileBounds(required, margin, loaded.map);
    const tiles = projectTilesInBounds(loaded.map, loaded.tileset, bounds);
    const candidate: TileProjectionWindow = Object.freeze({
      source: loaded,
      minTileX: bounds.minTileX,
      minTileY: bounds.minTileY,
      maxTileX: bounds.maxTileX,
      maxTileY: bounds.maxTileY,
      tiles,
    });
    if (projectionBytes(viewportPayload(loaded, candidate, cameraX, cameraY, cameraMotion)) <= MAX_PROJECTED_DATA_BYTES) {
      selected = candidate;
      break;
    }
  }
  if (selected === undefined) throw new RangeError("Map projection budget exceeded");
  return selected;
}

function renderState(facts: RenderFacts): RenderDomainState {
  const { loaded, window, x, y, direction, activeMove, playerRef } = facts;
  if (activeMove) {
    const fromCamera = computeCamera(loaded.map, activeMove.fromX, activeMove.fromY);
    const targetCamera = computeCamera(loaded.map, x, y);
    const fromScreenX = activeMove.fromX * 32 - fromCamera.cameraX;
    const fromScreenY = activeMove.fromY * 32 - fromCamera.cameraY;
    const screenX = x * 32 - targetCamera.cameraX;
    const screenY = y * 32 - targetCamera.cameraY;
    return {
      zIndex: 0,
      roots: [{
        key: VIEWPORT_KEY, tag: "lr-map-view", attrs: {},
        data: viewportPayload(loaded, window, targetCamera.cameraX, targetCamera.cameraY, Object.freeze({
          id: activeMove.id,
          durationMs: WALK_STEP_MS,
          fromCameraX: fromCamera.cameraX,
          fromCameraY: fromCamera.cameraY,
        })),
        children: [{
          key: PLAYER_KEY, tag: "lr-map-sprite", attrs: {},
          data: {
            x, y, screenX, screenY, direction,
            pattern: activeMove.startPattern, sprite: playerRef,
            motion: Object.freeze({
              id: activeMove.id,
              durationMs: WALK_STEP_MS,
              fromY: activeMove.fromY,
              fromScreenX,
              fromScreenY,
            }),
          },
          children: [],
        }],
      }],
    };
  }
  const { cameraX, cameraY } = computeCamera(loaded.map, x, y);
  return {
    zIndex: 0,
    roots: [{
      key: VIEWPORT_KEY, tag: "lr-map-view", attrs: {},
      data: viewportPayload(loaded, window, cameraX, cameraY, null),
      children: [{
        key: PLAYER_KEY, tag: "lr-map-sprite", attrs: {},
        data: {
          x, y, screenX: x * 32 - cameraX, screenY: y * 32 - cameraY, direction,
          pattern: 0, sprite: playerRef, motion: null,
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

      const facts = (overrides: Partial<RenderFacts> = {}): RenderFacts => ({
        loaded: overrides.loaded ?? current,
        window: overrides.window ?? window,
        x: overrides.x ?? x,
        y: overrides.y ?? y,
        direction: overrides.direction ?? direction,
        activeMove: overrides.activeMove === undefined ? activeMove : overrides.activeMove,
        playerRef: overrides.playerRef ?? playerRef,
      });

      const standingWindow = (loaded: LoadedMap, tileX: number, tileY: number) => {
        const camera = computeCamera(loaded.map, tileX, tileY);
        return selectProjectionWindow(loaded, viewportTileBounds(loaded.map, camera.cameraX, camera.cameraY), camera.cameraX, camera.cameraY, null);
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
          const standing = facts({ activeMove: null });
          domain!.replace(renderState(standing));
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
          const nextWindow = standingWindow(target, rule.targetX, rule.targetY);
          const nextFacts = facts({
            loaded: target,
            window: nextWindow,
            x: rule.targetX,
            y: rule.targetY,
            direction: nextDirection,
            activeMove: null,
          });
          domain!.replace(renderState(nextFacts));
          current = target;
          window = nextWindow;
          x = rule.targetX;
          y = rule.targetY;
          direction = nextDirection;
          activeMove = null;
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
        const nextWindow = window.source === current ? window : standingWindow(current, x, y);
        domain!.replace(renderState(facts({ direction: nextDirection, window: nextWindow, activeMove: null })));
        direction = nextDirection;
        window = nextWindow;
        activeMove = null;
      };

      const publishMovementUpdate = (nextX: number, nextY: number, nextDirection: Direction, nextMove: ActiveMove | null) => {
        const fromX = nextMove?.fromX ?? x;
        const fromY = nextMove?.fromY ?? y;
        const sourceCamera = computeCamera(current.map, fromX, fromY);
        const targetCamera = computeCamera(current.map, nextX, nextY);
        const required = nextMove === null
          ? viewportTileBounds(current.map, targetCamera.cameraX, targetCamera.cameraY)
          : unionTileBounds(
            viewportTileBounds(current.map, sourceCamera.cameraX, sourceCamera.cameraY),
            viewportTileBounds(current.map, targetCamera.cameraX, targetCamera.cameraY),
          );
        const coverage = expandTileBounds(required, 1, current.map);
        let nextWindow = window;
        let includeTiles = false;
        if (!(window.source === current && boundsContain(window, coverage))) {
          const cameraMotion = nextMove === null ? null : Object.freeze({
            id: nextMove.id,
            durationMs: WALK_STEP_MS,
            fromCameraX: sourceCamera.cameraX,
            fromCameraY: sourceCamera.cameraY,
          });
          nextWindow = selectProjectionWindow(current, required, targetCamera.cameraX, targetCamera.cameraY, cameraMotion);
          includeTiles = true;
        }
        const screenX = nextX * 32 - targetCamera.cameraX;
        const screenY = nextY * 32 - targetCamera.cameraY;
        const fromScreenX = fromX * 32 - sourceCamera.cameraX;
        const fromScreenY = fromY * 32 - sourceCamera.cameraY;
        const viewportSet: Record<string, unknown> = {
          cameraX: targetCamera.cameraX,
          cameraY: targetCamera.cameraY,
          cameraMotion: nextMove === null ? null : Object.freeze({
            id: nextMove.id,
            durationMs: WALK_STEP_MS,
            fromCameraX: sourceCamera.cameraX,
            fromCameraY: sourceCamera.cameraY,
          }),
        };
        if (includeTiles) viewportSet.tiles = nextWindow.tiles;
        domain!.update({
          nodes: [
            { key: VIEWPORT_KEY, data: { set: viewportSet } },
            {
              key: PLAYER_KEY,
              data: {
                set: {
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
                },
              },
            },
          ],
        });
        window = nextWindow;
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
      const spawnWindow = standingWindow(loaded, input.x, input.y);
      const initial = renderState({
        loaded,
        window: spawnWindow,
        x: input.x,
        y: input.y,
        direction: 2,
        activeMove: null,
        playerRef,
      });
      domain = scope.createRenderDomain(initial);
      current = loaded;
      window = spawnWindow;
      x = input.x;
      y = input.y;
      direction = 2;
      nextMoveId = 1;
      nextStartPattern = 1;
      heldDirections = [];
      transitioning = false;
      activeMove = null;
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
