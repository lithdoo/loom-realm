/**
 * Static Map 47 ledge routes. Not a live RGSS run.
 */

import { offsetForDirection, facingTerrainTag, ledgeJumpForward2, eventsOccupying } from "./vanilla-map-rules.mjs";

function inBounds(context, x, y) {
  return x >= 0 && y >= 0 && x < context.width && y < context.height;
}

export function buildMap47LedgeRoutes(context, evidence) {
  const cells = evidence.ledgeTerrain?.cells ?? [];
  const legal = [];
  const reverseFailed = [];
  const startBlocked = [];
  const landingBlocked = [];
  const boundary = [];
  const midEventReal = [];
  for (const cell of cells) {
    for (const dir of [2, 4, 6, 8]) {
      const { dx, dy } = offsetForDirection(dir);
      const start = { x: cell.x - dx, y: cell.y - dy };
      const landing = { x: cell.x + dx, y: cell.y + dy };
      const startOob = !inBounds(context, start.x, start.y);
      const landOob = !inBounds(context, landing.x, landing.y);
      if (startOob || landOob) {
        boundary.push(Object.freeze({
          ledge: { x: cell.x, y: cell.y },
          dir,
          start,
          landing,
          startOob,
          landOob,
          note: "Map 47 real ledge near map edge; jump is not taken when start or landing is out of bounds",
        }));
        continue;
      }
      const facing = facingTerrainTag(context, start.x, start.y, dir, { bridgeLevel: 0 });
      if (facing.tag?.ledge !== true) continue;
      const jump = ledgeJumpForward2(context, start.x, start.y, dir, { bridgeLevel: 0 });
      const midEvents = eventsOccupying(context.events ?? [], cell.x, cell.y);
      if (midEvents.length > 0) {
        midEventReal.push(Object.freeze({
          ledge: { x: cell.x, y: cell.y },
          dir,
          eventIds: midEvents.map((event) => event.eventId),
          note: "middle tile is jumped over; player coordinates do not occupy it",
        }));
      }
      const record = Object.freeze({
        ledge: { x: cell.x, y: cell.y, tileIds: (cell.layers ?? []).map((layer) => layer.tileId) },
        start,
        dir,
        landing,
        jumped: jump.jumped,
        attempted: jump.attempted,
        reason: jump.reason,
        motion: jump.motion,
        grade: "STATIC-INFERRED",
      });
      if (jump.jumped) legal.push(record);
      else if (jump.attempted === false && jump.reason === "can-move-failed-before-ledge-check") startBlocked.push(record);
      else if (jump.attempted && !jump.jumped) landingBlocked.push(record);

      if (jump.jumped) {
        const reverse = dir === 2 ? 8 : dir === 8 ? 2 : dir === 4 ? 6 : 4;
        const reverseJump = ledgeJumpForward2(context, landing.x, landing.y, reverse, { bridgeLevel: 0 });
        reverseFailed.push(Object.freeze({
          from: landing,
          reverse,
          original: record,
          jumped: reverseJump.jumped,
          attempted: reverseJump.attempted,
          reason: reverseJump.reason,
          grade: "STATIC-INFERRED",
        }));
      }
    }
  }
  return Object.freeze({
    uniqueCells: cells.length,
    legal: Object.freeze(legal),
    reverse: Object.freeze(reverseFailed),
    startBlocked: Object.freeze(startBlocked),
    landingBlocked: Object.freeze(landingBlocked),
    boundary: Object.freeze(boundary),
    midEventReal: Object.freeze(midEventReal),
    midEventSyntheticNote: "Map 47 sample ledges have no occupying events on the jumped-over tile in this corpus; a synthetic middle-event case is not a Map 47 original event.",
    crossMapJump: Object.freeze({
      supportedInThisTracer: false,
      vanillaRule: "Game_Character#jump landing uses passable? on the current map; connection-crossing jump is UNVERIFIED",
    }),
    grade: "STATIC-INFERRED",
    notALiveRun: true,
  });
}
