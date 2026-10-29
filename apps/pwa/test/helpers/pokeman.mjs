import { MAP_ONLY_NPC_PLACEMENTS } from "../../../../examples/PokeMan/subsystems/map.mjs";
import { planMovement, validateMapRecord, validateMapTransferRecord, validateTilesetRecord } from "../../../../game-libs/map/dist/semantics.js";

const directions = Object.freeze([
  Object.freeze({ direction: 2, code: "ArrowDown", dx: 0, dy: 1 }),
  Object.freeze({ direction: 4, code: "ArrowLeft", dx: -1, dy: 0 }),
  Object.freeze({ direction: 6, code: "ArrowRight", dx: 1, dy: 0 }),
  Object.freeze({ direction: 8, code: "ArrowUp", dx: 0, dy: -1 }),
]);

function decode(entry) {
  return Buffer.from(entry.body, entry.encoding === "base64" ? "base64" : "utf8");
}

function recordIndex(fixture) {
  const records = new Map();
  for (const entry of fixture.content) {
    if (entry.kind !== "record") continue;
    records.set(`${entry.namespace}\0${entry.key}`, JSON.parse(decode(entry).toString("utf8")));
  }
  return records;
}

function stateKey(state) {
  return `${state.mapId}\0${state.x}\0${state.y}`;
}

export function createPokeManRoutePlanner(fixture) {
  const records = recordIndex(fixture);
  const maps = new Map();
  const transfers = new Map();
  const tilesets = new Map();
  const read = (namespace, key) => {
    const value = records.get(`${namespace}\0${key}`);
    if (value === undefined) throw new Error(`Missing planner record ${namespace}/${key}`);
    return value;
  };
  for (const entry of fixture.content) {
    if (entry.kind !== "record" || entry.namespace !== "struct.Map") continue;
    const mapId = Number(entry.key);
    const map = validateMapRecord(read("struct.Map", entry.key));
    const transfer = validateMapTransferRecord(read("struct.MapTransfer", entry.key), mapId);
    let tileset = tilesets.get(map.tileset_id);
    if (tileset === undefined) {
      tileset = validateTilesetRecord(read("struct.Tileset", String(map.tileset_id)), map.tileset_id);
      tilesets.set(map.tileset_id, tileset);
    }
    maps.set(mapId, Object.freeze({ map, tileset }));
    transfers.set(mapId, transfer);
  }

  const transferState = (rule, attemptedDirection) => Object.freeze({
    mapId: rule.targetMapId,
    x: rule.targetX,
    y: rule.targetY,
    direction: rule.targetDirection ?? attemptedDirection,
  });
  const transition = (state, movement) => {
    const loaded = maps.get(state.mapId);
    const transfer = transfers.get(state.mapId);
    if (loaded === undefined || transfer === undefined) throw new Error(`Planner cannot load Map ${state.mapId}`);
    const nx = state.x + movement.dx;
    const ny = state.y + movement.dy;
    const inBounds = nx >= 0 && ny >= 0 && nx < loaded.map.width && ny < loaded.map.height;
    if (inBounds) {
      const contact = transfer.contacts.find((rule) => rule.x === state.x && rule.y === state.y && rule.direction === movement.direction);
      if (contact !== undefined) return transferState(contact, movement.direction);
    }
    const plan = planMovement(loaded.map, loaded.tileset, state.x, state.y, movement.direction, 0);
    if (plan.kind === "blocked") {
      if (!inBounds) {
        const edge = transfer.edges.find((rule) => rule.x === state.x && rule.y === state.y && rule.direction === movement.direction);
        if (edge !== undefined) return transferState(edge, movement.direction);
      }
      return Object.freeze({ ...state, direction: movement.direction });
    }
    const npcs = MAP_ONLY_NPC_PLACEMENTS[state.mapId] ?? [];
    if (npcs.some((npc) => npc.x === plan.toX && npc.y === plan.toY)) {
      return Object.freeze({ ...state, direction: movement.direction });
    }
    const step = transfer.steps.find((rule) => rule.x === plan.toX && rule.y === plan.toY);
    if (step !== undefined) return transferState(step, movement.direction);
    return Object.freeze({ mapId: state.mapId, x: plan.toX, y: plan.toY, direction: movement.direction });
  };

  const plan = (start, predicate, allowedMaps) => {
    if (predicate(start)) return Object.freeze([]);
    const queue = [Object.freeze({ state: Object.freeze({ ...start }), actions: Object.freeze([]) })];
    const seen = new Set([stateKey(start)]);
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const current = queue[cursor];
      for (const movement of directions) {
        const next = transition(current.state, movement);
        if (allowedMaps !== undefined && !allowedMaps.has(next.mapId)) continue;
        const key = stateKey(next);
        if (seen.has(key)) continue;
        const action = Object.freeze({ code: movement.code, direction: movement.direction, expected: next });
        const actions = Object.freeze([...current.actions, action]);
        if (predicate(next)) return actions;
        seen.add(key);
        queue.push(Object.freeze({ state: next, actions }));
      }
    }
    throw new Error(`No PokeMan route from ${JSON.stringify(start)}`);
  };

  return Object.freeze({
    transition,
    planToMap(start, targetMapId) {
      return plan(start, (state) => state.mapId === targetMapId, new Set([start.mapId, targetMapId]));
    },
    planDistance(start, minimumDistance) {
      if (!Number.isSafeInteger(minimumDistance) || minimumDistance <= 0) throw new TypeError("minimumDistance must be a positive integer");
      return plan(
        start,
        (state) => state.mapId === start.mapId && Math.abs(state.x - start.x) + Math.abs(state.y - start.y) >= minimumDistance,
        new Set([start.mapId]),
      );
    },
    planNpcCollision(start) {
      const placements = MAP_ONLY_NPC_PLACEMENTS[start.mapId] ?? [];
      for (const npc of placements) {
        for (const movement of directions) {
          const source = Object.freeze({
            mapId: start.mapId,
            x: npc.x - movement.dx,
            y: npc.y - movement.dy,
            direction: start.direction,
          });
          try {
            const travel = plan(start, (state) => state.mapId === source.mapId && state.x === source.x && state.y === source.y, new Set([start.mapId]));
            const arrived = travel.at(-1)?.expected ?? start;
            const blocked = transition(arrived, movement);
            if (blocked.mapId === arrived.mapId && blocked.x === arrived.x && blocked.y === arrived.y) {
              return Object.freeze({
                npc: Object.freeze({ ...npc }),
                travel,
                collision: Object.freeze({ code: movement.code, direction: movement.direction, expected: blocked }),
              });
            }
          } catch {
            // Try the next adjacent cell.
          }
        }
      }
      throw new Error(`No reachable NPC collision on Map ${start.mapId}`);
    },
  });
}
