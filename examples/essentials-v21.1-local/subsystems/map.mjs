import { defineSubsystem } from "@loomrealm/subsystem";
import { RPGMapBuilder } from "@loomrealm-game/map";

export default defineSubsystem((scope) => ({
  frame(frame) {
    const input = frame.params;
    const handler = new RPGMapBuilder(scope, frame).build({ player: { characterName: input.characterName } });
    handler.onMapEntering((context) => { context.setNPC([]); });
    return handler.run({ mapId: input.mapId, x: input.x, y: input.y });
  },
}));
