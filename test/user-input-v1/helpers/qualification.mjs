import test from "node:test";
import assert from "node:assert/strict";
import {
  fixtureCatalog,
  fixturesByGroup,
  fixtureSetRevision,
  protocol,
  protocolVersion,
} from "../fixtures-v2.mjs";

const registered = new Set();

export function qualify(group, title, behavior) {
  const fixtures = fixturesByGroup[group];
  if (fixtures === undefined) throw new TypeError(`Unknown qualification group: ${group}`);
  if (registered.has(group)) throw new TypeError(`Duplicate qualification group: ${group}`);
  registered.add(group);
  test(`${group}: ${title}`, async () => {
    await behavior();
    if (process.env.LOOMREALM_QUALIFICATION_REPORT === "1") {
      for (const fixture of fixtures) {
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
  test("fixtureSetRevision 2 catalog and executable groups have exact coverage", () => {
    assert.equal(fixtureCatalog.length, 168);
    assert.deepEqual([...registered].sort(), [...expectedGroups].sort());
    assert.deepEqual([...registered].sort(), Object.keys(fixturesByGroup).sort());
  });
}
