import { defineSubsystem } from "@loomrealm/subsystem";
import { RPGMapBuilder } from "@loomrealm-game/map";

export default defineSubsystem((scope) => ({
  frame(frame) {
    const input = frame.params;
    const handler = new RPGMapBuilder(scope, frame).build({ player: { characterName: input.characterName } });
    handler.onMapEntering((context) => {
      context.setNPC(context.mapId === 1 ? [{ instanceId: "guide", npcId: "guide", x: 14, y: 8, direction: 4, pattern: 2 }] : []);
    });
    return handler.run({ mapId: input.mapId, x: input.x, y: input.y });
  },
}));
