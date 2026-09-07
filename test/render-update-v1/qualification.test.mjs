import assert from "node:assert/strict";
import { fixtureCatalog, fixturesByGroup } from "./fixtures-v1.mjs";
import { qualify, registerCoverageAudit } from "./helpers/qualification.mjs";
import {
  evidenceByGroup,
  receiverEvidence,
  senderEvidence,
} from "./evidence-roles.mjs";
import { registerHardLimitAudit } from "./hard-limits.mjs";

const mapped = [];
for (const [group, evidence] of Object.entries(evidenceByGroup)) {
  for (const [fixture, callback] of evidence) mapped.push({ fixture, group, callback });
}
assert.equal(new Set(mapped.map(({ fixture }) => fixture)).size, mapped.length, "fixture evidence IDs must be unique");
assert.deepEqual(
  mapped.map(({ fixture, group }) => ({ fixture, group })).sort((a, b) => a.fixture.localeCompare(b.fixture)),
  fixtureCatalog.map(({ fixture, group }) => ({ fixture, group })).sort((a, b) => a.fixture.localeCompare(b.fixture)),
  "explicit semantic evidence must match the Frozen catalog exactly",
);
assert.deepEqual(
  [...senderEvidence.keys()].sort(),
  fixtureCatalog.filter(({ roles }) => roles.includes("subsystem-sender")).map(({ fixture }) => fixture).sort(),
  "sender evidence table must exactly match sender obligations",
);
assert.deepEqual(
  [...receiverEvidence.keys()].sort(),
  fixtureCatalog.filter(({ roles }) => roles.includes("renderer-receiver")).map(({ fixture }) => fixture).sort(),
  "receiver evidence table must exactly match receiver obligations",
);
for (const { fixture, roles } of fixtureCatalog) {
  if (roles.length === 2) assert.notEqual(senderEvidence.get(fixture), receiverEvidence.get(fixture));
}

for (const [group, evidence] of Object.entries(evidenceByGroup)) {
  qualify(group, "Frozen Render Update v1 fixture-specific semantic evidence", async ({ prove, fixtures }) => {
    assert.deepEqual([...evidence.keys()].sort(), [...fixtures].sort());
    for (const fixture of fixtures) {
      const descriptor = fixtureCatalog.find((candidate) => candidate.fixture === fixture);
      for (const role of descriptor.roles) {
        const roleEvidence = role === "subsystem-sender" ? senderEvidence : receiverEvidence;
        await prove(role, fixture, roleEvidence.get(fixture));
      }
    }
  });
}

assert.deepEqual(Object.keys(evidenceByGroup).sort(), Object.keys(fixturesByGroup).sort());
registerCoverageAudit();
registerHardLimitAudit();
