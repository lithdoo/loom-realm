import { readFile } from "node:fs/promises";

export const protocol = "loomrealm.user-input";
export const protocolVersion = 1;
export const fixtureSetRevision = 2;

const groupBySection = Object.freeze({
  4: "wire-schema-limits-channel",
  5: "interest-author-usage",
  6: "lifetime-fresh-carrier",
  7: "authority",
  8: "mutation-gate",
  9: "state-event-reset",
  10: "barrier-backpressure",
  11: "input-target-replacement",
  12: "producer",
  13: "listener",
  14: "keyboard",
  15: "pointer",
  16: "gamepad",
  17: "custom",
  18: "failure",
});

export const rolesByGroup = Object.freeze({
  "wire-schema-limits-channel": Object.freeze([
    "subsystem-interest-sender",
    "renderer-input-sender",
    "subsystem-input-receiver",
  ]),
  "interest-author-usage": Object.freeze(["subsystem-interest-sender"]),
  "lifetime-fresh-carrier": Object.freeze([
    "subsystem-interest-sender",
    "renderer-input-sender",
    "subsystem-input-receiver",
  ]),
  authority: Object.freeze(["renderer-input-sender"]),
  "mutation-gate": Object.freeze(["subsystem-input-receiver"]),
  "state-event-reset": Object.freeze(["renderer-input-sender", "subsystem-input-receiver"]),
  "barrier-backpressure": Object.freeze(["renderer-input-sender"]),
  "input-target-replacement": Object.freeze(["renderer-input-sender"]),
  producer: Object.freeze(["renderer-input-sender"]),
  listener: Object.freeze(["subsystem-interest-sender", "subsystem-input-receiver"]),
  keyboard: Object.freeze(["renderer-input-sender", "subsystem-input-receiver"]),
  pointer: Object.freeze(["renderer-input-sender", "subsystem-input-receiver"]),
  gamepad: Object.freeze(["renderer-input-sender", "subsystem-input-receiver"]),
  custom: Object.freeze(["renderer-input-sender", "subsystem-input-receiver"]),
  failure: Object.freeze([
    "subsystem-interest-sender",
    "renderer-input-sender",
    "subsystem-input-receiver",
  ]),
});

function requiredLines(section) {
  const match = section.match(/Required.\s*\r?\n\r?\n```text\r?\n([\s\S]*?)```/);
  if (match === null) return [];
  return match[1].split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

export async function loadFixtureCatalog() {
  const contract = await readFile(
    new URL("../../doc/15-contracts/user-input-conformance-v1.md", import.meta.url),
    "utf8",
  );
  const fixtures = [];
  for (const section of contract.split(/^## /m).slice(1)) {
    const heading = section.slice(0, section.indexOf("\n")).trim();
    const sectionNumber = Number.parseInt(heading, 10);
    const group = groupBySection[sectionNumber];
    if (group === undefined) continue;
    for (const fixture of requiredLines(section)) {
      fixtures.push(Object.freeze({
        protocol,
        protocolVersion,
        fixtureSetRevision,
        section: sectionNumber,
        group,
        fixture,
        roles: rolesByGroup[group],
      }));
    }
  }
  return Object.freeze(fixtures);
}

export const fixtureCatalog = await loadFixtureCatalog();
const groupedFixtures = fixtureCatalog.reduce((groups, fixture) => {
  (groups[fixture.group] ??= []).push(fixture);
  return groups;
}, {});
for (const group of Object.keys(groupedFixtures)) Object.freeze(groupedFixtures[group]);
export const fixturesByGroup = Object.freeze(groupedFixtures);
