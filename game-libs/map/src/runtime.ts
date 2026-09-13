import { cancelled, defineSubsystem, failed, type Frame, type RenderDomainState, type SubsystemDefinitionFactory } from "@loomrealm/subsystem";
import { canMove, computeCamera, directionForCode, projectVisibleTiles, validateMapRecord, validateTilesetRecord, type Direction } from "./semantics.js";

interface InitialInput { mapId: number; x: number; y: number; characterName: string }
interface ResourceRef { readonly [name: string]: string; namespace: string; key: string; contentVersion: string }
interface ActiveMove {
  readonly id: number;
  readonly fromX: number;
  readonly fromY: number;
  readonly startPattern: 1 | 3;
}

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

export const mapDefinition: SubsystemDefinitionFactory = defineSubsystem((scope) => ({
  async frame(frame: Frame) {
    let listener;
    let domain;
    let stepTimer: ReturnType<typeof setTimeout> | null = null;
    let activeMove: ActiveMove | null = null;
    try {
      const input = initialInput(frame.params);
      const map = validateMapRecord((await scope.content.record("struct.Map", String(input.mapId), { signal: frame.signal })).value);
      const tileset = validateTilesetRecord((await scope.content.record("struct.Tileset", String(map.tileset_id), { signal: frame.signal })).value, map.tileset_id);
      if (input.x >= map.width || input.y >= map.height) throw new TypeError("Map spawn lies outside the loaded Map");
      const tilesetResource = await scope.content.resource("resource.Graphics", `Tilesets/${tileset.tileset_name}`, { signal: frame.signal });
      const playerResource = await scope.content.resource("resource.Graphics", `Characters/${input.characterName}`, { signal: frame.signal });
      const tilesetRef = ref("resource.Graphics", `Tilesets/${tileset.tileset_name}`, tilesetResource.contentVersion);
      const playerRef = ref("resource.Graphics", `Characters/${input.characterName}`, playerResource.contentVersion);
      let x = input.x;
      let y = input.y;
      let direction: Direction = 2;
      let nextMoveId = 1;
      let nextStartPattern: 1 | 3 = 1;
      let heldDirections: Direction[] = [];

      const renderState = (): RenderDomainState => {
        if (activeMove) {
          const fromCamera = computeCamera(map, activeMove.fromX, activeMove.fromY);
          const targetCamera = computeCamera(map, x, y);
          const fromScreenX = activeMove.fromX * 32 - fromCamera.cameraX;
          const fromScreenY = activeMove.fromY * 32 - fromCamera.cameraY;
          const screenX = x * 32 - targetCamera.cameraX;
          const screenY = y * 32 - targetCamera.cameraY;
          return {
            zIndex: 0,
            roots: [{
              key: "viewport", tag: "lr-map-view", attrs: {},
              data: {
                mapId: input.mapId, mapWidth: map.width, mapHeight: map.height,
                cameraX: targetCamera.cameraX, cameraY: targetCamera.cameraY, tileset: tilesetRef,
                tiles: projectVisibleTiles(map, tileset, targetCamera.cameraX, targetCamera.cameraY),
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
        const { cameraX, cameraY } = computeCamera(map, x, y);
        return {
          zIndex: 0,
          roots: [{
            key: "viewport", tag: "lr-map-view", attrs: {},
            data: {
              mapId: input.mapId, mapWidth: map.width, mapHeight: map.height,
              cameraX, cameraY, tileset: tilesetRef,
              tiles: projectVisibleTiles(map, tileset, cameraX, cameraY),
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

      const attempt = (next: Direction) => {
        direction = next;
        const { dx, dy } = stepDelta[next];
        if (!canMove(map, tileset, x, y, direction, dx, dy)) {
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
      };

      const finishStep = (moveId: number) => {
        if (frame.signal.aborted || activeMove?.id !== moveId) return;
        stepTimer = null;
        activeMove = null;
        if (heldDirections.length > 0) {
          nextStartPattern = nextStartPattern === 1 ? 3 : 1;
          attempt(heldDirections[heldDirections.length - 1]!);
        } else {
          nextStartPattern = 1;
          domain!.replace(renderState());
        }
      };

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
      await waitForAbort(frame.signal);
      listener.close();
      if (stepTimer !== null) {
        clearTimeout(stepTimer);
        stepTimer = null;
      }
      activeMove = null;
      domain.close();
      return cancelled();
    } catch (error) {
      listener?.close();
      if (stepTimer !== null) {
        clearTimeout(stepTimer);
        stepTimer = null;
      }
      activeMove = null;
      domain?.close();
      if (frame.signal.aborted) return cancelled();
      return failed({ code: "MAP_ACTIVATION_FAILED", message: error instanceof Error ? error.message : "Map activation failed" });
    }
  },
}));
