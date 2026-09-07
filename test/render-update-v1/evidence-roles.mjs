import assert from "node:assert/strict";
import { fixtureCatalog } from "./fixtures-v1.mjs";
import { baselineEvidence, registryEvidence, snapshotEvidence, wireEvidence } from "./evidence-core.mjs";
import { patchEvidence } from "./evidence-patch.mjs";
import { continuityEvidence, eventEvidence, freshCarrierEvidence } from "./evidence-runtime.mjs";
import { receiverRoleEvidence, senderRoleEvidence } from "./evidence-role-specific.mjs";

export const evidenceByGroup = Object.freeze({
  "wire-schema": wireEvidence,
  "continuity-recovery": continuityEvidence,
  "registry-lifecycle": registryEvidence,
  "baseline-revision": baselineEvidence,
  snapshot: snapshotEvidence,
  patch: patchEvidence,
  event: eventEvidence,
  "fresh-carrier": freshCarrierEvidence,
});

function roleTable(role, overrides) {
  const table = new Map();
  for (const descriptor of fixtureCatalog) {
    if (!descriptor.roles.includes(role)) continue;
    const callback = overrides.get(descriptor.fixture)
      ?? evidenceByGroup[descriptor.group]?.get(descriptor.fixture);
    assert.equal(typeof callback, "function", `missing ${role} evidence for ${descriptor.fixture}`);
    table.set(descriptor.fixture, callback);
  }
  for (const fixture of overrides.keys()) {
    const descriptor = fixtureCatalog.find((candidate) => candidate.fixture === fixture);
    assert.ok(descriptor?.roles.includes(role), `unexpected ${role} override for ${fixture}`);
  }
  return table;
}

// A base callback belongs to one role only. The explicit override maps contain
// the opposite-role proof for every dual-role fixture, so no semantic assertion
// is reused as both sender and receiver evidence.
export const senderEvidence = roleTable("subsystem-sender", senderRoleEvidence);
export const receiverEvidence = roleTable("renderer-receiver", receiverRoleEvidence);

for (const { fixture, roles } of fixtureCatalog) {
  if (roles.length === 2) {
    assert.notEqual(senderEvidence.get(fixture), receiverEvidence.get(fixture), `${fixture} reuses a cross-role proof`);
  }
}
