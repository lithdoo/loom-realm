import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { join } from "node:path";
import test from "node:test";
import { buildPwaExecutableIndexV1, parsePwaLaunchManifestV1 } from "@loomrealm/game-launcher-pwa";
import { parseGameEntryV1 } from "@loomrealm/game-package";
import { createPokeManPwaFixture } from "../../../examples/PokeMan/scripts/prepare-pwa-content.mjs";

const executablePath = join(import.meta.dirname, "..", "dist", "qualification", "pokeman-map-subsystem.mjs");

test("PokeMan qualification bundle uses real Content and one closed browser ESM graph", async () => {
  const fixture = await createPokeManPwaFixture({ executablePath });
  const game = parseGameEntryV1(fixture.gameEntryText);
  const manifest = parsePwaLaunchManifestV1(fixture.launchManifestText);
  assert.deepEqual(game.subsystems.map(({ key }) => key), ["map"]);
  assert.deepEqual(manifest.subsystems, [{ key: "map", module: "subsystems/map.mjs" }]);
  assert.ok(fixture.content.length > 0);

  const contentVersion = `sha256:${createHash("sha256").update(fixture.executable).digest("hex")}`;
  const graph = await buildPwaExecutableIndexV1([{
    logicalModule: "subsystems/map.mjs",
    source: fixture.executable,
    contentVersion,
  }]);
  assert.deepEqual(graph, [{
    logicalModule: "subsystems/map.mjs",
    contentVersion,
    imports: [],
  }]);
  assert.match(fixture.executable, /RPGMapBuilder/);
  assert.match(fixture.executable, /home-family/);
  assert.doesNotMatch(fixture.executable, /from\s*["']@loomrealm/u);
  assert.doesNotMatch(fixture.executable, /import\s*\(\s*[^"']/u);

  const identities = new Set(fixture.content.map((entry) => `${entry.kind}\0${entry.namespace}\0${entry.key}`));
  assert.equal(identities.size, fixture.content.length);
  assert.ok(identities.has(["record", "struct.Map", "3"].join("\0")));
  assert.ok(identities.has(["resource", "resource.Graphics", "Characters/Player"].join("\0")));
  assert.ok(identities.has(["resource", "resource.Presentation", "map/map.browser.js"].join("\0")));
});
