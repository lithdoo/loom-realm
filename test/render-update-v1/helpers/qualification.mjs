import test from "node:test";
import assert from "node:assert/strict";
import {
  fixtureCatalog,
  fixturesByGroup,
  fixtureSetRevision,
  protocol,
  protocolVersion,
} from "../fixtures-v1.mjs";

const registeredGroups = new Set();
const registeredEvidence = new Map();
const executedEvidence = new Set();
const passedEvidence = new Set();
const evidenceKey = (role, fixture) => `${role}\u0000${fixture}`;

export function qualify(group, title, behavior) {
  const fixtures = fixturesByGroup[group];
  if (fixtures === undefined) throw new TypeError(`Unknown qualification group: ${group}`);
  if (registeredGroups.has(group)) throw new TypeError(`Duplicate qualification group: ${group}`);
  registeredGroups.add(group);
  const normative = new Map(fixtures.map((fixture) => [fixture.fixture, fixture]));
  test(`${group}: ${title}`, async () => {
    const prove = async (role, name, assertion) => {
      if (!normative.has(name)) throw new TypeError(`Unknown fixture in ${group}: ${name}`);
      if (!normative.get(name).roles.includes(role)) throw new TypeError(`Unexpected ${role} evidence for ${name}`);
      const key = evidenceKey(role, name);
      if (registeredEvidence.has(key)) throw new TypeError(`Duplicate fixture-role evidence: ${role}/${name}`);
      if (typeof assertion !== "function") throw new TypeError("Fixture-role evidence requires an assertion callback");
      registeredEvidence.set(key, group);
      executedEvidence.add(key);
      await assertion();
      passedEvidence.add(key);
      if (process.env.LOOMREALM_QUALIFICATION_REPORT === "1") {
        process.stdout.write(`${JSON.stringify({
          protocol, protocolVersion, fixtureSetRevision, role, group, fixture: name, result: "pass",
        })}\n`);
      }
    };
    await behavior(Object.freeze({ prove, fixtures: Object.freeze([...normative.keys()]) }));
    assert.deepEqual(
      [...registeredEvidence.entries()].filter(([, value]) => value === group).map(([key]) => key).sort(),
      [...normative.values()].flatMap(({ fixture, roles }) => roles.map((role) => evidenceKey(role, fixture))).sort(),
      `${group} must register every normative role/fixture obligation exactly once`,
    );
  });
}

export function registerCoverageAudit() {
  test("fixtureSetRevision 1 catalog and executable fixture evidence have exact coverage", () => {
    assert.ok(fixtureCatalog.length > 0);
    assert.deepEqual([...registeredGroups].sort(), Object.keys(fixturesByGroup).sort());
    const expected = fixtureCatalog.flatMap(({ fixture, roles }) => roles.map((role) => evidenceKey(role, fixture))).sort();
    assert.deepEqual([...registeredEvidence.keys()].sort(), expected);
    assert.deepEqual([...executedEvidence].sort(), expected);
    assert.deepEqual([...passedEvidence].sort(), expected);
    for (const fixture of fixtureCatalog) {
      assert.ok(fixture.roles.length > 0, `${fixture.fixture} requires role evidence`);
      assert.ok(fixture.roles.every((role) => role === "subsystem-sender" || role === "renderer-receiver"));
      for (const role of fixture.roles) assert.equal(registeredEvidence.get(evidenceKey(role, fixture.fixture)), fixture.group);
    }
  });
}
