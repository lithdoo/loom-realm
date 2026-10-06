import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { RPGMapBuilder, RPGMapError } from "@loomrealm-game/map";

test("package root exports the Builder/Handler execution model only", async () => {
  const api = await import("@loomrealm-game/map");
  assert.deepEqual(Object.keys(api), ["RPGMapBuilder", "RPGMapError"]);
  assert.equal("default" in api, false);
  assert.equal("mapDefinition" in api, false);
  assert.equal(typeof RPGMapBuilder, "function");
  assert.equal(new RPGMapError("MAP_BUSY").code, "MAP_BUSY");
});

test("classic browser artifact contains no module syntax", async () => {
  const source = await readFile(new URL("../dist/browser/map.browser.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /\b(?:import|export)\b/);
  assert.match(source, /lr-map-view/);
  assert.match(source, /lr-map-sprite/);
});
