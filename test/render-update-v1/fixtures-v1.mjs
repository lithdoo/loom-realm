import { readFileSync } from "node:fs";

export const protocol = "loomrealm.render-update";
export const protocolVersion = 1;
export const fixtureSetRevision = 1;

const source = readFileSync(new URL("../../doc/15-contracts/render-update-conformance-v1.md", import.meta.url), "utf8");
const sections = [...source.matchAll(/^## (\d+)\. .+$/gm)];
const groupBySection = Object.freeze({
  5: "wire-schema",
  6: "continuity-recovery",
  7: "registry-lifecycle",
  8: "baseline-revision",
  9: "snapshot",
  10: "snapshot",
  11: "patch",
  12: "patch",
  13: "patch",
  14: "patch",
  15: "patch",
  16: "event",
  17: "event",
  18: "fresh-carrier",
  19: "continuity-recovery",
  20: "continuity-recovery",
});

function rolesFor(section) {
  if (section === 20 || section === 17) return ["subsystem-sender"];
  if ([6, 7, 8, 16, 18].includes(section)) {
    return ["subsystem-sender", "renderer-receiver"];
  }
  return ["renderer-receiver"];
}

const catalog = new Map();
for (let index = 0; index < sections.length; index += 1) {
  const match = sections[index];
  const section = Number(match[1]);
  if (section < 5 || section > 20) continue;
  const end = sections[index + 1]?.index ?? source.length;
  const body = source.slice(match.index, end);
  const block = body.match(/```text\r?\n([\s\S]*?)\r?\n```/);
  if (block === null) throw new Error(`Missing Required fixture block in section ${section}`);
  const fixtures = block[1].split(/\r?\n/).map((line) => line.trim())
    .filter((line) => /^[a-z0-9]+(?:-[a-z0-9]+)+$/.test(line));
  for (const fixture of fixtures) {
    const current = catalog.get(fixture);
    const roles = new Set([...(current?.roles ?? []), ...rolesFor(section)]);
    catalog.set(fixture, Object.freeze({
      fixture,
      group: current?.group ?? groupBySection[section],
      roles: Object.freeze([...roles]),
    }));
  }
}

export const fixtureCatalog = Object.freeze([...catalog.values()]);
const grouped = Object.create(null);
for (const fixture of fixtureCatalog) (grouped[fixture.group] ??= []).push(fixture);
for (const group of Object.keys(grouped)) Object.freeze(grouped[group]);
export const fixturesByGroup = Object.freeze(grouped);
