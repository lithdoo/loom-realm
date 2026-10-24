import { defineSubsystem } from "@loomrealm/subsystem";
import { createControlsConsumer, createDirectionalControlsTracker } from "@loomrealm-game/common-controls/subsystem";
import { RPGMapBuilder } from "@loomrealm-game/map";

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

const MAP_DIRECTIONS = Object.freeze({ up: 8, down: 2, left: 4, right: 6 });

function toMapDirection(direction) {
  return direction === null ? null : MAP_DIRECTIONS[direction];
}

export default defineSubsystem((scope) => ({
  async frame(frame) {
    const input = frame.params;
    const map = new RPGMapBuilder(scope, frame).build({
      player: { characterName: input.characterName },
    });

    map.onMapEntering((context) => {
      context.setNPC(placementsForMap(context.mapId));
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
      return await map.run({
        mapId: input.mapId,
        x: input.x,
        y: input.y,
      });
    } finally {
      map.controls.setMoveIntent(null);
      directions.reset();
      consumer.close();
    }
  },
}));
