import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parseGameEntryV1 } from "@loomrealm/game-package";
import { prepareExamplePresentation } from "./prepare.mjs";

const root = new URL("../", import.meta.url);

test("checked-in Game Entry has the frozen M14 topology and initial input", async () => {
  const game = parseGameEntryV1(await readFile(new URL("game.json", root), "utf8"));
  assert.deepEqual(game, {
    formatVersion: 1,
    initial: { subsystem: "map", input: { mapId: 1, x: 10, y: 8, characterName: "m14_player" } },
    subsystems: [{ key: "map" }],
  });
});

test("checked-in presentation config resolves map artifacts only through package subpaths", async () => {
  const result = await prepareExamplePresentation("http://127.0.0.1:1");
  assert.deepEqual(result.prepared.styles.map(({ namespace, key, mime }) => ({ namespace, key, mime })), [
    { namespace: "Presentation", key: "map/map.css", mime: "text/css" },
    { namespace: "Presentation", key: "essentials/page.css", mime: "text/css" },
  ]);
  assert.deepEqual(result.prepared.scripts.map(({ namespace, key, mime }) => ({ namespace, key, mime })), [
    { namespace: "Presentation", key: "map/map.browser.js", mime: "text/javascript" },
  ]);
});

test("example page fills the window and does not pin the map to 640 by 480", async () => {
  const packageJson = JSON.parse(await readFile(new URL("package.json", root), "utf8"));
  assert.equal(packageJson.private, true); assert.equal(packageJson.type, "module");
  const css = await readFile(new URL("presentation.css", root), "utf8");
  assert.doesNotMatch(css, /place-items:\s*center/);
  assert.match(css, /overflow:\s*hidden/);
  assert.match(css, /lr-map-view\s*\{[^}]*width:\s*100vw[^}]*height:\s*100vh/s);
  assert.doesNotMatch(css, /lr-map-view\s*\{[^}]*width:\s*640px/);
});
