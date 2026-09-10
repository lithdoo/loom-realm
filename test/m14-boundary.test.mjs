import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import mapDefinition from "@loomrealm-game/map";

const root = new URL("../", import.meta.url);
const json = async (relative) => JSON.parse(await readFile(new URL(relative, root), "utf8"));

async function sourceTree(relative) {
  const directory = new URL(relative, root);
  const files = [];
  async function walk(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const target = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(target); else files.push(target);
    }
  }
  await walk(path.resolve(directory.pathname.slice(process.platform === "win32" ? 1 : 0)));
  return Promise.all(files.filter((file) => /\.(?:ts|js|mjs)$/u.test(file)).map((file) => readFile(file, "utf8")));
}

test("M14 workspace identity and dependency direction are explicit", async () => {
  const monorepo = await json("package.json");
  assert.deepEqual(monorepo.workspaces, ["packages/*", "game-libs/*", "apps/*", "examples/*"]);
  const map = await json("game-libs/map/package.json");
  assert.equal(map.name, "@loomrealm-game/map");
  assert.deepEqual(Object.keys(map.dependencies), ["@loomrealm/subsystem"]);
  const example = await json("examples/essentials-v21.1/package.json");
  assert.equal(example.private, true); assert.equal(example.type, "module");
  assert.equal(typeof mapDefinition, "function");
});

test("framework packages never acquire reverse game/example dependencies", async () => {
  for (const entry of await readdir(new URL("packages/", root), { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    let manifest;
    try { manifest = await json(`packages/${entry.name}/package.json`); } catch (error) { if (error?.code === "ENOENT") continue; throw error; }
    const dependencies = { ...manifest.dependencies, ...manifest.devDependencies, ...manifest.peerDependencies };
    assert.equal(Object.keys(dependencies).some((key) => key.startsWith("@loomrealm-game/") || key.startsWith("@loomrealm-example/")), false, entry.name);
  }
});

test("map and example business sources do not cross Renderer/tooling boundaries", async () => {
  const sources = await sourceTree("game-libs/map/");
  const exampleSources = await sourceTree("examples/essentials-v21.1/");
  assert.doesNotMatch(sources.join("\n"), /@loomrealm\/(?:renderer|main|data|wire|fsdb)|packages[\\/]renderer|tools[\\/]/);
  assert.doesNotMatch(exampleSources.filter((source) => !source.includes("prepareWebPresentationV1")).join("\n"), /packages[\\/]renderer[\\/]dist[\\/]internal/);
});
