import assert from "node:assert/strict";
import test from "node:test";
import { LOCAL_NPC_PLACEMENTS, placementsForMap } from "../examples/essentials-v21.1-local/subsystems/map.mjs";

test("real local consumer owns an explicit Map66 NPC placement and clears unconfigured maps", () => {
  assert.deepEqual(placementsForMap(66), [{
    instanceId: "map66-local-guide",
    npcId: "loomrealm-local-guide",
    x: 10,
    y: 7,
    direction: 4,
    pattern: 2,
  }]);
  assert.deepEqual(placementsForMap(7), []);
  assert.equal(Object.isFrozen(LOCAL_NPC_PLACEMENTS), true);
  assert.equal(Object.isFrozen(placementsForMap(66)), true);
});

test("consumer placement wiring is configurable without changing the Hostra input contract", () => {
  const configured = { 1: [{ instanceId: "fixture", npcId: "guide", x: 2, y: 3, direction: 8 }] };
  assert.equal(placementsForMap(1, configured), configured[1]);
  assert.deepEqual(placementsForMap(2, configured), []);
});
