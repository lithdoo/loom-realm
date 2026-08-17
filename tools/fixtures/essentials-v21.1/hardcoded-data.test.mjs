import assert from "node:assert/strict";
import test from "node:test";
import { HARDCODED_DATA_V21_1, hardcodedIdentitySets } from "./lib/essentials/v21.1/hardcoded-data.mjs";
import { VANILLA_REGISTRY_V21_1 } from "./lib/essentials/v21.1/vanilla-registry.mjs";

test("all audited v21.1 hardcoded GameData domains are materialized", () => {
  assert.deepEqual(Object.keys(HARDCODED_DATA_V21_1), VANILLA_REGISTRY_V21_1.hardcodedDomains.map((domain) => domain.id));
  assert.equal(HARDCODED_DATA_V21_1.GrowthRate.length, 6);
  assert.equal(HARDCODED_DATA_V21_1.Evolution.length, 64);
  assert.equal(HARDCODED_DATA_V21_1.Nature.length, 25);
  assert.equal(HARDCODED_DATA_V21_1.Target.length, 18);
  assert(hardcodedIdentitySets().Stat.has("SPECIAL_ATTACK"));
  for (const records of Object.values(HARDCODED_DATA_V21_1)) {
    assert(records.length > 0);
    assert(Object.isFrozen(records));
  }
});
