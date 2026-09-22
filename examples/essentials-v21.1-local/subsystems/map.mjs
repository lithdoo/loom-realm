import { defineSubsystem } from "@loomrealm/subsystem";
import { RPGMapBuilder } from "@loomrealm-game/map";

export const LOCAL_NPC_PLACEMENTS = Object.freeze({
  66: Object.freeze([
    Object.freeze({
      instanceId: "map66-local-guide",
      npcId: "loomrealm-local-guide",
      x: 10,
      y: 7,
      direction: 4,
      pattern: 2,
    }),
  ]),
});

export function placementsForMap(mapId, config = LOCAL_NPC_PLACEMENTS) {
  return config[String(mapId)] ?? Object.freeze([]);
}

export default defineSubsystem((scope) => ({
  frame(frame) {
    const input = frame.params;
    const handler = new RPGMapBuilder(scope, frame).build({ player: { characterName: input.characterName } });
    handler.onMapEntering((context) => { context.setNPC(placementsForMap(context.mapId)); });
    return handler.run({ mapId: input.mapId, x: input.x, y: input.y });
  },
}));
