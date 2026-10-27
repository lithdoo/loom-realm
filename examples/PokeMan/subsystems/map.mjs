import { defineSubsystem, failed, FrameCallRejectedError } from "@loomrealm/subsystem";
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
      interactable: true,
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

function isProfessorInteraction(event) {
  return event?.npc?.instanceId === "professor" && event.npc.npcId === "professor";
}

function validDialogueResult(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  return keys.length === 2
    && keys.includes("dialogueKey")
    && keys.includes("conclusion")
    && value.dialogueKey === "professor-vertical-slice"
    && (value.conclusion === "ready" || value.conclusion === "not-yet" || value.conclusion === "cancelled");
}

export function createPokeManMapSubsystem(scope, dependencies = {}) {
  const MapBuilder = dependencies.RPGMapBuilder ?? RPGMapBuilder;
  const createConsumer = dependencies.createControlsConsumer ?? createControlsConsumer;
  const createDirections = dependencies.createDirectionalControlsTracker ?? createDirectionalControlsTracker;
  const RejectedError = dependencies.FrameCallRejectedError ?? FrameCallRejectedError;

  return {
    async frame(frame) {
    const input = frame.params;
    const handler = new MapBuilder(scope, frame).build({
      player: { characterName: input.characterName },
    });

    handler.onMapEntering((context) => {
      context.setNPC(placementsForMap(context.mapId));
    });

    let interactionWaiter;
    handler.onNPCInteract((event) => {
      if (interactionWaiter !== undefined && isProfessorInteraction(event)) interactionWaiter.accept(event);
    });

    let activation;
    const startMapControlsActivation = () => {
      const directions = createDirections();
      const applyMoveIntent = () => handler.controls.setMoveIntent(toMapDirection(directions.direction));
      const consumer = createConsumer(scope.presentationEvents, frame, {
        onState(state) {
          directions.acceptState(state);
          applyMoveIntent();
        },
        onEvent(event) {
          directions.acceptEvent(event);
          applyMoveIntent();
          if (event.action === "down" && !event.repeat && (event.button === "south" || event.button === "start")) {
            handler.controls.confirm();
          }
        },
      });
      activation = { directions, consumer };
    };
    const stopMapControlsActivation = () => {
      if (activation === undefined) return;
      const current = activation;
      activation = undefined;
      handler.controls.setMoveIntent(null);
      current.directions.reset();
      current.consumer.close();
    };

    const armProfessorInteraction = () => {
      let settled = false;
      let resolve;
      const promise = new Promise((accept) => { resolve = accept; });
      const waiter = {
        promise,
        accept(event) {
          if (settled) return;
          settled = true;
          if (interactionWaiter === waiter) interactionWaiter = undefined;
          resolve(event);
        },
        disarm() {
          settled = true;
          if (interactionWaiter === waiter) interactionWaiter = undefined;
        },
      };
      interactionWaiter = waiter;
      return waiter;
    };

    const mapRun = handler.run({
      mapId: input.mapId,
      x: input.x,
      y: input.y,
    });
    let mapTerminal;
    const terminal = mapRun.then((outcome) => {
      mapTerminal = outcome;
      return { kind: "map", outcome };
    });

    try {
      while (true) {
        const waiter = armProfessorInteraction();
        startMapControlsActivation();
        const next = await Promise.race([
          terminal,
          waiter.promise.then((event) => ({ kind: "professor", event })),
        ]);
        waiter.disarm();
        stopMapControlsActivation();

        if (next.kind === "map") return next.outcome;
        if (mapTerminal !== undefined) return mapTerminal;

        let childOutcome;
        try {
          childOutcome = await frame.call("dialogue", {
            dialogueKey: "professor-vertical-slice",
            source: {
              mapId: next.event.mapId,
              npc: {
                instanceId: next.event.npc.instanceId,
                npcId: next.event.npc.npcId,
              },
            },
          });
        } catch (cause) {
          if (mapTerminal !== undefined) return mapTerminal;
          if (cause instanceof RejectedError &&
              (cause.code === "FRAME_CALL_TARGET_NOT_FOUND" || cause.code === "FRAME_CALL_TARGET_UNAVAILABLE")) {
            return failed({
              code: "POKEMAN_DIALOGUE_CALL_REJECTED",
              data: { callCode: cause.code },
            });
          }
          return failed({ code: "POKEMAN_DIALOGUE_MAP_INVARIANT_FAILED" });
        }

        if (mapTerminal !== undefined) return mapTerminal;
        if (childOutcome.type === "completed") {
          if (!validDialogueResult(childOutcome.value)) {
            return failed({ code: "POKEMAN_DIALOGUE_RESULT_INVALID" });
          }
          continue;
        }
        if (childOutcome.type === "failed") {
          return failed({
            code: "POKEMAN_DIALOGUE_CHILD_FAILED",
            data: { childCode: childOutcome.error.code },
          });
        }
        return failed({ code: "POKEMAN_DIALOGUE_CHILD_CANCELLED" });
      }
    } finally {
      interactionWaiter?.disarm();
      stopMapControlsActivation();
    }
    },
  };
}

export default defineSubsystem((scope) => createPokeManMapSubsystem(scope));
