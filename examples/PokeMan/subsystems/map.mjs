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

export const MAP_ONLY_NPC_PLACEMENTS = Object.freeze({
  2: Object.freeze([
    Object.freeze({
      instanceId: "town-resident",
      npcId: "town-resident",
      x: 12,
      y: 10,
      direction: 2,
    }),
  ]),
  3: Object.freeze([
    Object.freeze({
      instanceId: "home-family",
      npcId: "home-family",
      x: 6,
      y: 8,
      direction: 4,
    }),
  ]),
  4: Object.freeze([
    Object.freeze({
      instanceId: "professor",
      npcId: "professor",
      x: 10,
      y: 6,
      direction: 2,
    }),
    Object.freeze({
      instanceId: "rival-lab",
      npcId: "rival-lab",
      x: 8,
      y: 5,
      direction: 2,
    }),
  ]),
  5: Object.freeze([
    Object.freeze({
      instanceId: "road-bandit",
      npcId: "road-bandit",
      x: 20,
      y: 12,
      direction: 4,
    }),
    Object.freeze({
      instanceId: "route-trainee",
      npcId: "route-trainee",
      x: 24,
      y: 15,
      direction: 4,
    }),
  ]),
  7: Object.freeze([
    Object.freeze({
      instanceId: "town-resident",
      npcId: "town-resident",
      x: 20,
      y: 20,
      direction: 2,
    }),
    Object.freeze({
      instanceId: "center-servant",
      npcId: "center-servant",
      x: 22,
      y: 20,
      direction: 4,
    }),
  ]),
  8: Object.freeze([
    Object.freeze({
      instanceId: "rival-casual",
      npcId: "rival-casual",
      x: 8,
      y: 6,
      direction: 2,
    }),
  ]),
});

export function placementsForMap(mapId, placements = MAP_ONLY_NPC_PLACEMENTS) {
  return placements[String(mapId)] ?? Object.freeze([]);
}

export default defineSubsystem((scope) => ({
  async frame(frame) {
    const input = frame.params;
    const handler = new RPGMapBuilder(scope, frame).build({
      player: { characterName: input.characterName },
    });

    handler.onMapEntering((context) => {
      context.setNPC(placementsForMap(context.mapId));
    });

    const directions = createDirectionalControlsTracker();
    const apply = () => handler.controls.setMoveIntent(toMapDirection(directions.direction));
    const consumer = createControlsConsumer(scope.presentationEvents, frame, {
      onState(state) { directions.acceptState(state); apply(); },
      onEvent(event) { directions.acceptEvent(event); apply(); },
    });
    try {
      return await handler.run({
        mapId: input.mapId,
        x: input.x,
        y: input.y,
      });
    } finally {
      handler.controls.setMoveIntent(null);
      directions.reset();
      consumer.close();
    }
  },
}));
