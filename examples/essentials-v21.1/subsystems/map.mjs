import { defineSubsystem } from "@loomrealm/subsystem";
import { RPGMapBuilder } from "@loomrealm-game/map";
import { createControlsConsumer, createDirectionalControlsTracker } from "@loomrealm-game/common-controls/subsystem";

function toMapDirection(direction) {
  switch (direction) {
    case "up": return 8;
    case "down": return 2;
    case "left": return 4;
    case "right": return 6;
    case null: return null;
    default: throw new TypeError("Invalid controls direction");
  }
}

export default defineSubsystem((scope) => ({
  async frame(frame) {
    const input = frame.params;
    const handler = new RPGMapBuilder(scope, frame).build({ player: { characterName: input.characterName } });
    handler.onMapEntering((context) => {
      context.setNPC(context.mapId === 1 ? [{ instanceId: "guide", npcId: "guide", x: 14, y: 8, direction: 4, pattern: 2 }] : []);
    });
    const directions = createDirectionalControlsTracker();
    const apply = () => handler.controls.setMoveIntent(toMapDirection(directions.direction));
    const consumer = createControlsConsumer(scope.presentationEvents, frame, {
      onState(state) { directions.acceptState(state); apply(); },
      onEvent(event) { directions.acceptEvent(event); apply(); },
    });
    try {
      return await handler.run({ mapId: input.mapId, x: input.x, y: input.y });
    } finally {
      handler.controls.setMoveIntent(null);
      directions.reset();
      consumer.close();
    }
  },
}));
