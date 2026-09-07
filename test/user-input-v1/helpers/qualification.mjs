import test from "node:test";
import assert from "node:assert/strict";
import {
  fixtureCatalog,
  fixturesByGroup,
  fixtureSetRevision,
  protocol,
  protocolVersion,
} from "../fixtures-v2.mjs";

const registeredGroups = new Set();
const registeredFixtures = new Map();

export function qualify(group, title, behavior) {
  const fixtures = fixturesByGroup[group];
  if (fixtures === undefined) throw new TypeError(`Unknown qualification group: ${group}`);
  if (registeredGroups.has(group)) throw new TypeError(`Duplicate qualification group: ${group}`);
  registeredGroups.add(group);
  const normative = new Map(fixtures.map((fixture) => [fixture.fixture, fixture]));
  test(`${group}: ${title}`, async () => {
    const passed = new Set();
    const prove = async (names, assertion) => {
      const selected = typeof names === "string" ? [names] : names;
      if (!Array.isArray(selected) || selected.length === 0 || typeof assertion !== "function") {
        throw new TypeError("Fixture evidence requires names and an assertion callback");
      }
      for (const name of selected) {
        if (!normative.has(name)) throw new TypeError(`Unknown fixture in ${group}: ${name}`);
        if (registeredFixtures.has(name)) throw new TypeError(`Duplicate fixture evidence: ${name}`);
        registeredFixtures.set(name, group);
      }
      await assertion();
      for (const name of selected) passed.add(name);
    };
    await behavior(Object.freeze({ prove }));
    assert.deepEqual([...registeredFixtures.entries()]
      .filter(([, registeredGroup]) => registeredGroup === group)
      .map(([name]) => name)
      .sort(), [...normative.keys()].sort(), `${group} must register every normative fixture exactly once`);
    assert.deepEqual([...passed].sort(), [...normative.keys()].sort(),
      `${group} must pass executable evidence for every normative fixture`);
    if (process.env.LOOMREALM_QUALIFICATION_REPORT === "1") {
      for (const name of passed) {
        const fixture = normative.get(name);
        for (const role of fixture.roles) {
          process.stdout.write(`${JSON.stringify({
            protocol,
            protocolVersion,
            fixtureSetRevision,
            role,
            group,
            fixture: fixture.fixture,
            result: "pass",
          })}\n`);
        }
      }
    }
  });
}

export function registerCoverageAudit(expectedGroups) {
  test("fixtureSetRevision 2 catalog and executable fixture evidence have exact coverage", () => {
    assert.equal(fixtureCatalog.length, 168);
    assert.deepEqual([...registeredGroups].sort(), [...expectedGroups].sort());
    assert.deepEqual([...registeredGroups].sort(), Object.keys(fixturesByGroup).sort());
    assert.deepEqual([...registeredFixtures.keys()].sort(),
      fixtureCatalog.map(({ fixture }) => fixture).sort());
    for (const fixture of fixtureCatalog) {
      assert.ok(fixture.roles.length > 0, `${fixture.fixture} requires role evidence`);
      assert.equal(registeredFixtures.get(fixture.fixture), fixture.group);
    }
  });
}
