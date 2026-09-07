import assert from "node:assert/strict";
import { fixtureCatalog, fixturesByGroup } from "./fixtures-v1.mjs";
import { qualify, registerCoverageAudit } from "./helpers/qualification.mjs";
import {
  baselineEvidence,
  registryEvidence,
  snapshotEvidence,
  wireEvidence,
} from "./evidence-core.mjs";
import { patchEvidence } from "./evidence-patch.mjs";
import {
  continuityEvidence,
  eventEvidence,
  freshCarrierEvidence,
} from "./evidence-runtime.mjs";

const evidenceByGroup = Object.freeze({
  "wire-schema": wireEvidence,
  "continuity-recovery": continuityEvidence,
  "registry-lifecycle": registryEvidence,
  "baseline-revision": baselineEvidence,
  snapshot: snapshotEvidence,
  patch: patchEvidence,
  event: eventEvidence,
  "fresh-carrier": freshCarrierEvidence,
});

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

for (const [group, evidence] of Object.entries(evidenceByGroup)) {
  qualify(group, "Frozen Render Update v1 fixture-specific semantic evidence", async ({ prove, fixtures }) => {
    assert.deepEqual([...evidence.keys()].sort(), [...fixtures].sort());
    for (const fixture of fixtures) await prove(fixture, evidence.get(fixture));
  });
}

assert.deepEqual(Object.keys(evidenceByGroup).sort(), Object.keys(fixturesByGroup).sort());
registerCoverageAudit();
