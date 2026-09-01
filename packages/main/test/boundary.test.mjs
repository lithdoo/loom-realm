import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as main from "../dist/index.js";

test("Main root exposes only one-shot Session runtime values", () => {
  assert.deepEqual(Object.keys(main).sort(), ["MainRuntimeFatalError", "runMain"]);
});

test("Main public declaration surface does not depend on Game Package, launcher, or concrete Platform types", async () => {
  const declaration = await readFile(new URL("../dist/index.d.ts", import.meta.url), "utf8");
  assert.equal(declaration.includes("@loomrealm/game-package"), false);
  assert.equal(declaration.includes("game-launcher-hostra"), false);
  assert.equal(declaration.includes("game-launcher-pwa"), false);
  assert.equal(declaration.includes("HostraPlatform"), false);
  assert.equal(declaration.includes("PwaPlatform"), false);
});
