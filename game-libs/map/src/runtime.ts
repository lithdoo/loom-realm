import { cancelled, defineSubsystem, failed, type Frame, type RenderDomainState, type SubsystemDefinitionFactory } from "@loomrealm/subsystem";
import { canMove, computeCamera, directionForCode, projectVisibleTiles, validateMapRecord, validateTilesetRecord, type Direction } from "./semantics.js";

interface InitialInput { mapId: number; x: number; y: number; characterName: string }
interface ResourceRef { readonly [name: string]: string; namespace: string; key: string; contentVersion: string }

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
    try {
      const input = initialInput(frame.params);
      const map = validateMapRecord((await scope.content.record("Map", String(input.mapId), { signal: frame.signal })).value);
      const tileset = validateTilesetRecord((await scope.content.record("Tileset", String(map.tileset_id), { signal: frame.signal })).value, map.tileset_id);
      if (input.x >= map.width || input.y >= map.height) throw new TypeError("Map spawn lies outside the loaded Map");
      const tilesetResource = await scope.content.resource("Graphics", `Tilesets/${tileset.tileset_name}`, { signal: frame.signal });
      const playerResource = await scope.content.resource("Graphics", `Characters/${input.characterName}`, { signal: frame.signal });
      const tilesetRef = ref("Graphics", `Tilesets/${tileset.tileset_name}`, tilesetResource.contentVersion);
      const playerRef = ref("Graphics", `Characters/${input.characterName}`, playerResource.contentVersion);
      let x = input.x;
      let y = input.y;
      let direction: Direction = 2;
      const renderState = (): RenderDomainState => {
        const { cameraX, cameraY } = computeCamera(map, x, y);
        return {
          zIndex: 0,
          roots: [{
            key: "viewport", tag: "lr-map-view", attrs: {},
            data: { mapId: input.mapId, mapWidth: map.width, mapHeight: map.height, cameraX, cameraY, tileset: tilesetRef, tiles: projectVisibleTiles(map, cameraX, cameraY) },
            children: [{ key: "player", tag: "lr-map-sprite", attrs: {}, data: { x, y, screenX: x * 32 - cameraX, screenY: y * 32 - cameraY, direction, pattern: 0, sprite: playerRef }, children: [] }],
          }],
        };
      };
      listener = scope.createInputListener({ frame, channels: ["keyboard.event"] });
      domain = scope.createRenderDomain(renderState());
      listener.on("keyboard.event", (event) => {
        if (event.action !== "down" || event.repeat) return;
        const movement = directionForCode(event.code);
        if (!movement) return;
        direction = movement.direction;
        if (canMove(map, tileset, x, y, direction, movement.dx, movement.dy)) { x += movement.dx; y += movement.dy; }
        domain!.replace(renderState());
      });
      await waitForAbort(frame.signal);
      listener.close();
      domain.close();
      return cancelled();
    } catch (error) {
      listener?.close();
      domain?.close();
      if (frame.signal.aborted) return cancelled();
      return failed({ code: "MAP_ACTIVATION_FAILED", message: error instanceof Error ? error.message : "Map activation failed" });
    }
  },
}));
