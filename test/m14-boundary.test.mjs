import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import mapDefinition from "@loomrealm-game/map";
import {
  RESIZE_SETTLE_MS,
  TILE_SIZE_PX,
  calculateTileViewportLayout,
  tileViewportLayoutsEqual,
} from "@loomrealm-game/tile-presentation";

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
  return Promise.all(files.filter((file) => /\.(?:ts|js|mjs)$/u.test(file)).map(async (file) => ({ file: path.normalize(file), source: await readFile(file, "utf8") })));
}

test("M14 workspace identity and dependency direction are explicit", async () => {
  const monorepo = await json("package.json");
  assert.deepEqual(monorepo.workspaces, ["packages/*", "game-libs/*", "apps/*", "examples/*"]);
  const map = await json("game-libs/map/package.json");
  assert.equal(map.name, "@loomrealm-game/map");
  assert.deepEqual(Object.keys(map.dependencies), ["@loomrealm/subsystem", "@loomrealm-game/tile-presentation"]);
  const tilePresentation = await json("game-libs/tile-presentation/package.json");
  assert.equal(tilePresentation.name, "@loomrealm-game/tile-presentation");
  assert.equal(tilePresentation.sideEffects, false);
  assert.equal(tilePresentation.engines.node, ">=20");
  assert.equal(tilePresentation.dependencies, undefined);
  const example = await json("examples/essentials-v21.1/package.json");
  assert.equal(example.private, true); assert.equal(example.type, "module");
  assert.equal(typeof mapDefinition, "function");
  assert.deepEqual(Object.keys(await import("@loomrealm-game/map")), ["RPGMapBuilder", "RPGMapError", "default", "mapDefinition"]);
  assert.equal(TILE_SIZE_PX, 32);
  assert.equal(RESIZE_SETTLE_MS, 100);
  assert.equal(typeof calculateTileViewportLayout, "function");
  assert.equal(typeof tileViewportLayoutsEqual, "function");
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
  const tilePresentationSources = await sourceTree("game-libs/tile-presentation/src/");
  const exampleSources = await sourceTree("examples/essentials-v21.1/");
  assert.doesNotMatch(sources.map(({ source }) => source).join("\n"), /@loomrealm\/(?:renderer|main|data|wire|fsdb)|packages[\\/]renderer|tools[\\/]/);
  assert.doesNotMatch(tilePresentationSources.map(({ source }) => source).join("\n"), /@loomrealm(?:-game)?\//);
  const allowedPreparation = path.normalize(path.resolve(new URL("examples/essentials-v21.1/test/prepare.mjs", root).pathname.slice(process.platform === "win32" ? 1 : 0)));
  assert.doesNotMatch(exampleSources.filter(({ file }) => file !== allowedPreparation).map(({ source }) => source).join("\n"), /packages[\\/]renderer[\\/]dist[\\/]internal/);
});
