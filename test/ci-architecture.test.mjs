import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";
import { classifyPaths } from "../scripts/ci/impact.mjs";

const root = new URL("../", import.meta.url);
const read = (relative) => readFile(new URL(relative, root), "utf8");

test("active workflow surface is compact and milestone-free", async () => {
  const files = (await readdir(new URL(".github/workflows/", root))).sort();
  assert.deepEqual(files, ["ci.yml", "deploy-pages.yml", "full-qualification.yml"]);
  assert.ok(files.every((name) => !/^m\d+/i.test(name)));
});

test("impact routing is selective for docs and fail-closed for unknown code", () => {
  assert.deepEqual(classifyPaths(["doc/20-modules/main-system/README.md"]), {
    code: false,
    content: false,
    presentation: false,
    map: false,
    schema: false,
    pwa: false,
    battle: false,
    desktop: false,
    windows: false,
    docs: true,
  });

  const foundation = classifyPaths(["packages/foundation/src/index.ts"]);
  for (const key of ["code", "content", "presentation", "map", "schema", "pwa", "battle", "desktop", "windows"]) {
    assert.equal(foundation[key], true, `foundation must affect ${key}`);
  }

  const unknown = classifyPaths(["new-runtime-surface.bin"]);
  assert.equal(unknown.code, true);
  assert.equal(unknown.desktop, true);
  assert.equal(unknown.windows, true);

  const terrainContract = classifyPaths(["game-libs/map/TERRAIN_BEHAVIOR_CONTRACT_V1.md"]);
  assert.equal(terrainContract.docs, true);
  assert.equal(terrainContract.map, true);
  assert.equal(terrainContract.presentation, true);
});

test("daily CI has one fail-closed summary and capability runner does not invoke milestone commands", async () => {
  const ci = await read(".github/workflows/ci.yml");
  const runner = await read("scripts/ci/run-capability.mjs");
  assert.match(ci, /name: CI \/ summary/);
  assert.match(ci, /require_success "\$CODE" "\$LINUX_RESULT"/);
  assert.match(ci, /require_success "\$BROWSER_REQUIRED" "\$BROWSER_RESULT"/);
  assert.match(ci, /if: needs\.impact\.outputs\.browser == 'true'/);
  assert.match(ci, /npx playwright install --with-deps chromium/);
  assert.doesNotMatch(ci, /npm run (?:test|build):m\d+/);
  assert.doesNotMatch(runner, /npm\("run", "(?:test|build):m\d+/);
  assert.doesNotMatch(ci, /--no-sandbox|ELECTRON_DISABLE_SANDBOX/);
});

test("full qualification preserves compatibility, Windows, frozen Hostra, full performance and exact-local evidence", async () => {
  const workflow = await read(".github/workflows/full-qualification.yml");
  assert.match(workflow, /node: \[20, 24\]/);
  assert.match(workflow, /runs-on: windows-latest/);
  assert.match(workflow, /d863beab3c59c3bd4f271514a228fa8fee0bf5b6/);
  assert.match(workflow, /chmod 4755/);
  assert.match(workflow, /LOOMREALM_M15_FULL_QUALIFICATION: \$\{\{ inputs\.performance_full && '1' \|\| '0' \}\}/);
  assert.doesNotMatch(workflow, /LOOMREALM_PERFORMANCE_FULL/);
  assert.match(workflow, /inputs\.exact_essentials/);
  assert.match(workflow, /OFFICIAL_ARCHIVE_IDENTITY/);
  assert.match(workflow, /run-capability\.mjs map-build/);
  assert.doesNotMatch(workflow, /npm run (?:test|build):m\d+/);
  assert.doesNotMatch(workflow, /--no-sandbox|ELECTRON_DISABLE_SANDBOX/);
});
