import test from "node:test";
import assert from "node:assert/strict";
import {
  fixtureCatalog,
  fixturesByGroup,
  fixtureSetRevision,
  protocol,
  protocolVersion,
} from "../fixtures-v3.mjs";

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
      for (const name of selected) {
        if (!normative.has(name)) throw new TypeError(`Unknown fixture in ${group}: ${name}`);
        if (registeredFixtures.has(name)) throw new TypeError(`Duplicate fixture evidence: ${name}`);
        registeredFixtures.set(name, group);
      }
      await assertion();
      for (const name of selected) passed.add(name);
      if (process.env.LOOMREALM_QUALIFICATION_REPORT === "1") {
        for (const name of selected) {
          const fixture = normative.get(name);
          for (const role of fixture.roles) {
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
      }
    };
    await behavior(Object.freeze({ prove }));
    assert.deepEqual([...passed].sort(), [...normative.keys()].sort(),
      `${group} must pass executable evidence for every normative fixture`);
  });
}

export function registerCoverageAudit() {
  test("fixtureSetRevision 3 catalog and executable fixture evidence have exact coverage", () => {
    assert.equal(fixtureSetRevision, 3);
    assert.ok(fixtureCatalog.length > 0);
    assert.deepEqual([...registeredGroups].sort(), Object.keys(fixturesByGroup).sort());
    assert.deepEqual(
      [...registeredFixtures.keys()].sort(),
      fixtureCatalog.map(({ fixture }) => fixture).sort(),
    );
  });
}
