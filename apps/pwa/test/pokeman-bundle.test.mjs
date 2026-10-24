import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { join } from "node:path";
import test from "node:test";
import { buildPwaExecutableIndexV1, parsePwaLaunchManifestV1 } from "@loomrealm/game-launcher-pwa";
import { parseGameEntryV1 } from "@loomrealm/game-package";
import { createPokeManPwaFixture } from "../../../examples/PokeMan/scripts/prepare-pwa-content.mjs";

const qualification = join(import.meta.dirname, "..", "dist", "qualification");
const executablePaths = {
  base: join(qualification, "pokeman-base-subsystem.mjs"),
  map: join(qualification, "pokeman-map-subsystem.mjs"),
};

test("PokeMan qualification bundle installs base and map as closed browser ESM graphs", async () => {
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
  assert.deepEqual(fixture.executables.map((executable) => executable.logicalModule), [
    "subsystems/base.mjs",
    "subsystems/map.mjs",
  ]);

  const graph = await buildPwaExecutableIndexV1(fixture.executables.map((executable) => ({
    logicalModule: executable.logicalModule,
    source: executable.source,
    contentVersion: executable.contentVersion,
  })));
  assert.deepEqual(graph, fixture.executables.map((executable) => ({
    logicalModule: executable.logicalModule,
    contentVersion: executable.contentVersion,
    imports: [],
  })));

  const [base, map] = fixture.executables;
  assert.equal(base.mime, "text/javascript");
  assert.equal(map.mime, "text/javascript");
  assert.match(base.source, /game-controls-input/);
  assert.match(base.source, /frame\.call/);
  assert.doesNotMatch(base.source, /createControlsConsumer/);
  assert.match(map.source, /RPGMapBuilder/);
  assert.match(map.source, /home-family/);
  assert.match(map.source, /createControlsConsumer/);
  for (const executable of fixture.executables) {
    assert.equal(executable.contentVersion, `sha256:${createHash("sha256").update(executable.source).digest("hex")}`);
    assert.doesNotMatch(executable.source, /from\s*["']@loomrealm/u);
    assert.doesNotMatch(executable.source, /import\s*\(\s*[^"']/u);
  }

  const identities = new Set(fixture.content.map((entry) => `${entry.kind}\0${entry.namespace}\0${entry.key}`));
  assert.equal(identities.size, fixture.content.length);
  assert.ok(identities.has(["record", "struct.Map", "3"].join("\0")));
  assert.ok(identities.has(["resource", "resource.Graphics", "Characters/Player"].join("\0")));
  assert.ok(identities.has(["resource", "resource.Presentation", "map/map.browser.js"].join("\0")));
});
