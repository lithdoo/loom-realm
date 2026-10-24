import { defineSubsystem } from "@loomrealm/subsystem";
import { createControlsConsumer, createDirectionalControlsTracker } from "@loomrealm-game/common-controls/subsystem";
import { RPGMapBuilder } from "@loomrealm-game/map";

const MAP_DIRECTIONS = Object.freeze({ up: 8, down: 2, left: 4, right: 6 });

function toMapDirection(direction) {
  return direction === null ? null : MAP_DIRECTIONS[direction];
}

export default defineSubsystem((scope) => ({
  async frame(frame) {
    const input = frame.params;
    const map = new RPGMapBuilder(scope, frame).build({ player: { characterName: input.characterName } });
    map.onMapEntering((context) => {
      context.setNPC(context.mapId === 1 ? [{ instanceId: "guide", npcId: "guide", x: 14, y: 8, direction: 4, pattern: 2 }] : []);
    });
    const directions = createDirectionalControlsTracker();
    const apply = () => map.controls.setMoveIntent(toMapDirection(directions.direction));
    const consumer = createControlsConsumer(scope.presentationEvents, frame, {
      onState(state) {
        directions.acceptState(state);
        apply();
      },
      onEvent(event) {
        directions.acceptEvent(event);
        apply();
      },
    });
    try {
      return await map.run({ mapId: input.mapId, x: input.x, y: input.y });
    } finally {
      map.controls.setMoveIntent(null);
      directions.reset();
      consumer.close();
    }
  },
}));
