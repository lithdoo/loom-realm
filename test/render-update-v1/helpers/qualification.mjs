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
const registeredFixtures = new Map();
const passedFixtures = new Set();

export function qualify(group, title, behavior) {
  const fixtures = fixturesByGroup[group];
  if (fixtures === undefined) throw new TypeError(`Unknown qualification group: ${group}`);
  if (registeredGroups.has(group)) throw new TypeError(`Duplicate qualification group: ${group}`);
  registeredGroups.add(group);
  const normative = new Map(fixtures.map((fixture) => [fixture.fixture, fixture]));
  test(`${group}: ${title}`, async () => {
    const prove = async (name, assertion) => {
      if (!normative.has(name)) throw new TypeError(`Unknown fixture in ${group}: ${name}`);
      if (registeredFixtures.has(name)) throw new TypeError(`Duplicate fixture evidence: ${name}`);
      if (typeof assertion !== "function") throw new TypeError("Fixture evidence requires an assertion callback");
      registeredFixtures.set(name, group);
      await assertion();
      passedFixtures.add(name);
      if (process.env.LOOMREALM_QUALIFICATION_REPORT === "1") {
        for (const role of normative.get(name).roles) {
          process.stdout.write(`${JSON.stringify({
            protocol,
            protocolVersion,
            fixtureSetRevision,
            role,
            group,
            fixture: name,
            result: "pass",
          })}\n`);
        }
      }
    };
    await behavior(Object.freeze({ prove, fixtures: Object.freeze([...normative.keys()]) }));
    assert.deepEqual(
      [...registeredFixtures.entries()].filter(([, value]) => value === group).map(([name]) => name).sort(),
      [...normative.keys()].sort(),
      `${group} must register every normative fixture exactly once`,
    );
  });
}

export function registerCoverageAudit() {
  test("fixtureSetRevision 1 catalog and executable fixture evidence have exact coverage", () => {
    assert.ok(fixtureCatalog.length > 0);
    assert.deepEqual([...registeredGroups].sort(), Object.keys(fixturesByGroup).sort());
    assert.deepEqual([...registeredFixtures.keys()].sort(), fixtureCatalog.map(({ fixture }) => fixture).sort());
    assert.deepEqual([...passedFixtures].sort(), fixtureCatalog.map(({ fixture }) => fixture).sort());
    for (const fixture of fixtureCatalog) {
      assert.ok(fixture.roles.length > 0, `${fixture.fixture} requires role evidence`);
      assert.ok(fixture.roles.every((role) => role === "subsystem-sender" || role === "renderer-receiver"));
      assert.equal(registeredFixtures.get(fixture.fixture), fixture.group);
    }
  });
}
