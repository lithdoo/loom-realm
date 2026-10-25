import assert from "node:assert/strict";
import { join } from "node:path";
import test from "node:test";
import { buildPwaExecutableIndexV1, parsePwaLaunchManifestV1 } from "@loomrealm/game-launcher-pwa";
import { parseGameEntryV1 } from "@loomrealm/game-package";
import { createPokeManPwaFixture } from "../../../examples/PokeMan/scripts/prepare-pwa-content.mjs";

const executablePaths = Object.freeze({
  base: join(import.meta.dirname, "..", "dist", "qualification", "pokeman-base-subsystem.mjs"),
  map: join(import.meta.dirname, "..", "dist", "qualification", "pokeman-map-subsystem.mjs"),
});

test("PokeMan qualification bundle uses real Content and the Base plus Map browser ESM graph", async () => {
  const fixture = await createPokeManPwaFixture({ executablePaths });
  const game = parseGameEntryV1(fixture.gameEntryText);
  const manifest = parsePwaLaunchManifestV1(fixture.launchManifestText);
  assert.equal(game.initial.subsystem, "base");
  assert.deepEqual(game.subsystems.map(({ key }) => key), ["base", "map"]);
  assert.deepEqual(manifest.subsystems, [
    { key: "base", module: "subsystems/base.mjs" },
    { key: "map", module: "subsystems/map.mjs" },
  ]);
  assert.ok(fixture.content.length > 0);

  assert.deepEqual(fixture.executables.map(({ logicalModule, mime }) => ({ logicalModule, mime })), [
    { logicalModule: "subsystems/base.mjs", mime: "text/javascript" },
    { logicalModule: "subsystems/map.mjs", mime: "text/javascript" },
  ]);
  const graph = await buildPwaExecutableIndexV1(fixture.executables.map(({ logicalModule, source, contentVersion }) => ({ logicalModule, source, contentVersion })));
  assert.deepEqual(graph, fixture.executables.map(({ logicalModule, contentVersion }) => ({ logicalModule, contentVersion, imports: [] })));
  const base = fixture.executables[0].source;
  const map = fixture.executables[1].source;
  assert.match(base, /game-controls-input/);
  assert.doesNotMatch(base, /RPGMapBuilder|createControlsConsumer/);
  assert.match(map, /RPGMapBuilder/);
  assert.match(map, /home-family/);
  assert.match(map, /createControlsConsumer/);
  for (const { source } of fixture.executables) {
    assert.doesNotMatch(source, /from\s*["']@loomrealm/u);
    assert.doesNotMatch(source, /import\s*\(\s*[^"']/u);
  }

  const identities = new Set(fixture.content.map((entry) => `${entry.kind}\0${entry.namespace}\0${entry.key}`));
  assert.equal(identities.size, fixture.content.length);
  assert.ok(identities.has(["record", "struct.Map", "3"].join("\0")));
  assert.ok(identities.has(["resource", "resource.Graphics", "Characters/Player"].join("\0")));
  assert.ok(identities.has(["resource", "resource.Presentation", "map/map.browser.js"].join("\0")));
});
