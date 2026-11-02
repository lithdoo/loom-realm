import { EVENT_STATE_LIST_KEY, isEventStateList } from "./business-state.mjs";

function object(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }

export async function readEventStates(state, signal) {
  const snapshot = await state.read([EVENT_STATE_LIST_KEY], { signal });
  const record = snapshot?.records?.find((candidate) => candidate?.key?.namespace === EVENT_STATE_LIST_KEY.namespace && candidate?.key?.key === EVENT_STATE_LIST_KEY.key);
  if (!record || !isEventStateList(record.value)) throw new TypeError("Invalid PokeMan EventStateList");
  return record.value;
}

export async function resolveStoryScene(content, state, mapId, { signal, fallback = [] } = {}) {
  if (!Number.isSafeInteger(mapId) || mapId <= 0) throw new TypeError("Invalid mapId");
  const states = await readEventStates(state, signal);
  const directives = new Map();
  for (const { eventId, stateId } of states) {
    const event = (await content.record("struct.Event", eventId, { signal }))?.value;
    const npcs = event?.states?.[stateId]?.maps?.[String(mapId)]?.npcs;
    if (npcs === undefined) continue;
    if (!object(npcs)) throw new TypeError(`Invalid Event scene ${eventId}/${stateId}/${mapId}`);
    for (const [instanceId, directive] of Object.entries(npcs)) {
      if (!object(directive) || typeof directive.character !== "string") throw new TypeError(`Invalid NPC directive ${instanceId}`);
      directives.set(instanceId, directive);
    }
  }
  const placements = new Map(fallback.map((placement) => [placement.instanceId, structuredClone(placement)]));
  const interactions = new Map();
  for (const [instanceId, directive] of directives) {
    placements.delete(instanceId);
    if (directive.absent === true) continue;
    const placement = directive.placement;
    if (!object(placement) || !Number.isSafeInteger(placement.x) || !Number.isSafeInteger(placement.y)
        || ![2, 4, 6, 8].includes(placement.direction)) throw new TypeError(`Invalid NPC placement ${instanceId}`);
    const npcId = instanceId;
    placements.set(instanceId, {
      instanceId, npcId, x: placement.x, y: placement.y, direction: placement.direction,
      ...(directive.interaction === undefined ? {} : { interactable: true }),
    });
    if (directive.interaction !== undefined) {
      if (!object(directive.interaction) || typeof directive.interaction.dialogue !== "string" || directive.interaction.dialogue.length === 0) throw new TypeError(`Invalid NPC interaction ${instanceId}`);
      interactions.set(instanceId, directive.interaction.dialogue);
    }
  }
  return Object.freeze({ placements: Object.freeze([...placements.values()]), interactions });
}
