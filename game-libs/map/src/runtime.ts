import { cancelled, defineSubsystem, failed, type Frame, type FrameOutcome, type RenderDomainState, type SubsystemDefinitionFactory } from "@loomrealm/subsystem";
import {
  canMove,
  computeCamera,
  directionForCode,
  projectVisibleTiles,
  validateMapRecord,
  validateMapTransferRecord,
  validateTilesetRecord,
  type ContactTransfer,
  type Direction,
  type EdgeTransfer,
  type MapRecord,
  type MapTransferRecord,
  type StepTransfer,
  type TilesetRecord,
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
  readonly transfers: MapTransferRecord;
}

type TransferRule = StepTransfer | ContactTransfer | EdgeTransfer;

const WALK_STEP_MS = 250;
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
        const tilesetResource = await scope.content.resource("resource.Graphics", `Tilesets/${tileset.tileset_name}`, { signal: frame.signal });
        return Object.freeze({
          mapId,
          map,
          tileset,
          tilesetRef: ref("resource.Graphics", `Tilesets/${tileset.tileset_name}`, tilesetResource.contentVersion),
          transfers,
        });
      };

      let current!: LoadedMap;
      let x = 0;
      let y = 0;
      let direction: Direction = 2;
      let nextMoveId = 1;
      let nextStartPattern: 1 | 3 = 1;
      let heldDirections: Direction[] = [];
      let playerRef!: ResourceRef;

      const renderState = (): RenderDomainState => {
        if (activeMove) {
          const fromCamera = computeCamera(current.map, activeMove.fromX, activeMove.fromY);
          const targetCamera = computeCamera(current.map, x, y);
          const fromScreenX = activeMove.fromX * 32 - fromCamera.cameraX;
          const fromScreenY = activeMove.fromY * 32 - fromCamera.cameraY;
          const screenX = x * 32 - targetCamera.cameraX;
          const screenY = y * 32 - targetCamera.cameraY;
          return {
            zIndex: 0,
            roots: [{
              key: "viewport", tag: "lr-map-view", attrs: {},
              data: {
                mapId: current.mapId, mapWidth: current.map.width, mapHeight: current.map.height,
                cameraX: targetCamera.cameraX, cameraY: targetCamera.cameraY, tileset: current.tilesetRef,
                tiles: projectVisibleTiles(current.map, current.tileset, targetCamera.cameraX, targetCamera.cameraY),
                cameraMotion: Object.freeze({
                  id: activeMove.id,
                  durationMs: WALK_STEP_MS,
                  fromCameraX: fromCamera.cameraX,
                  fromCameraY: fromCamera.cameraY,
                }),
              },
              children: [{
                key: "player", tag: "lr-map-sprite", attrs: {},
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
        const { cameraX, cameraY } = computeCamera(current.map, x, y);
        return {
          zIndex: 0,
          roots: [{
            key: "viewport", tag: "lr-map-view", attrs: {},
            data: {
              mapId: current.mapId, mapWidth: current.map.width, mapHeight: current.map.height,
              cameraX, cameraY, tileset: current.tilesetRef,
              tiles: projectVisibleTiles(current.map, current.tileset, cameraX, cameraY),
              cameraMotion: null,
            },
            children: [{
              key: "player", tag: "lr-map-sprite", attrs: {},
              data: {
                x, y, screenX: x * 32 - cameraX, screenY: y * 32 - cameraY, direction,
                pattern: 0, sprite: playerRef, motion: null,
              },
              children: [],
            }],
          }],
        };
      };

      const failTransfer = (error: unknown) => {
        if (frame.signal.aborted || terminalSettled) return;
        terminalSettled = true;
        resolveTerminal(failed({
          code: "MAP_TRANSFER_FAILED",
          message: error instanceof Error ? error.message : "Map transfer failed",
        }));
      };

      const beginTransfer = async (rule: TransferRule): Promise<void> => {
        if (frame.signal.aborted || transitioning) return;
        transitioning = true;
        activeMove = null;
        if (stepTimer !== null) {
          clearTimeout(stepTimer);
          stepTimer = null;
        }
        nextStartPattern = 1;
        domain!.replace(renderState());
        const target = await loadMap(rule.targetMapId);
        if (frame.signal.aborted || !transitioning) return;
        if (!inBounds(target.map, rule.targetX, rule.targetY)) throw new TypeError("Map transfer target lies outside the loaded Map");
        current = target;
        x = rule.targetX;
        y = rule.targetY;
        if ("targetDirection" in rule) direction = rule.targetDirection ?? direction;
        activeMove = null;
        nextStartPattern = 1;
        transitioning = false;
        if (frame.signal.aborted) return;
        domain!.replace(renderState());
        if (heldDirections.length > 0) attempt(heldDirections[heldDirections.length - 1]!);
      };

      const startTransfer = (rule: TransferRule) => {
        if (frame.signal.aborted || transitioning) return;
        void beginTransfer(rule).catch(failTransfer);
      };

      const attempt = (next: Direction) => {
        if (frame.signal.aborted || transitioning) return;
        direction = next;
        const { dx, dy } = stepDelta[next];
        const nx = x + dx;
        const ny = y + dy;
        if (inBounds(current.map, nx, ny)) {
          const contact = current.transfers.contacts.find((rule) => rule.x === x && rule.y === y && rule.direction === direction);
          if (contact) {
            startTransfer(contact);
            return;
          }
          if (!canMove(current.map, current.tileset, x, y, direction, dx, dy)) {
            activeMove = null;
            if (stepTimer !== null) {
              clearTimeout(stepTimer);
              stepTimer = null;
            }
            nextStartPattern = 1;
            domain!.replace(renderState());
            return;
          }
          const fromX = x;
          const fromY = y;
          x += dx;
          y += dy;
          const moveId = nextMoveId++;
          activeMove = { id: moveId, fromX, fromY, startPattern: nextStartPattern };
          domain!.replace(renderState());
          stepTimer = setTimeout(() => finishStep(moveId), WALK_STEP_MS);
          return;
        }
        const edge = current.transfers.edges.find((rule) => rule.x === x && rule.y === y && rule.direction === direction);
        if (edge) {
          startTransfer(edge);
          return;
        }
        activeMove = null;
        if (stepTimer !== null) {
          clearTimeout(stepTimer);
          stepTimer = null;
        }
        nextStartPattern = 1;
        domain!.replace(renderState());
      };

      const finishStep = (moveId: number) => {
        if (frame.signal.aborted || activeMove?.id !== moveId) return;
        stepTimer = null;
        activeMove = null;
        const step = current.transfers.steps.find((rule) => rule.x === x && rule.y === y);
        if (step) {
          startTransfer(step);
          return;
        }
        if (heldDirections.length > 0) {
          nextStartPattern = nextStartPattern === 1 ? 3 : 1;
          attempt(heldDirections[heldDirections.length - 1]!);
        } else {
          nextStartPattern = 1;
          domain!.replace(renderState());
        }
      };

      current = await loadMap(input.mapId);
      if (!inBounds(current.map, input.x, input.y)) throw new TypeError("Map spawn lies outside the loaded Map");
      const playerResource = await scope.content.resource("resource.Graphics", `Characters/${input.characterName}`, { signal: frame.signal });
      playerRef = ref("resource.Graphics", `Characters/${input.characterName}`, playerResource.contentVersion);
      x = input.x;
      y = input.y;
      direction = 2;
      nextMoveId = 1;
      nextStartPattern = 1;
      heldDirections = [];
      transitioning = false;

      domain = scope.createRenderDomain(renderState());
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
