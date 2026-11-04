import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";
import { classifyPaths, requiresBrowser } from "../scripts/ci/impact.mjs";

const root = new URL("../", import.meta.url);
const read = async (relative) => (await readFile(new URL(relative, root), "utf8")).replaceAll("\r\n", "\n");

test("active workflow surface is compact and product-neutral", async () => {
  const files = (await readdir(new URL(".github/workflows/", root))).sort();
  assert.deepEqual(files, ["ci.yml", "deploy-pages.yml", "full-qualification.yml"]);
  assert.ok(files.every((name) => !/^m\d+/i.test(name)));
  for (const former of ["runner-diagnostics.yml", "deploy-pokeman-staging.yml", "pokeman-staging-qualification.yml"]) {
    assert.ok(!files.includes(former));
  }
});

test("PokeMan PWA ownership is recorded outside LoomRealm", async () => {
  const migration = await read("doc/30-implementation/pokeman-pwa-migration.md");
  assert.match(migration, /lithdoo-labs\/pokeman/);
  assert.match(migration, /pwa-staging\.yml/);
  assert.match(migration, /lab-server\/projects\/pwa-runner/);
});

test("impact routing exposes only framework capabilities and fails closed", () => {
  assert.deepEqual(classifyPaths(["doc/20-modules/main-system/README.md"]), {
    code: false,
    core: false,
    content: false,
    presentation: false,
    schema: false,
    pwa: false,
    dialogue: false,
    desktop: false,
    windows: false,
    docs: true,
  });

  const foundation = classifyPaths(["packages/foundation/src/index.ts"]);
  for (const key of ["code", "core", "content", "presentation", "schema", "pwa", "dialogue", "desktop", "windows"]) {
    assert.equal(foundation[key], true, `foundation must affect ${key}`);
  }
  assert.equal("map" in foundation, false);
  assert.equal("battle" in foundation, false);

  const dialogue = classifyPaths(["game-libs/rpg-dialogue/src/index.ts"]);
  assert.equal(dialogue.dialogue, true);
  assert.equal(dialogue.core, false);
  assert.equal(dialogue.presentation, true);
  assert.equal(requiresBrowser(dialogue), true);

  const importer = classifyPaths(["tools/fixtures/essentials-v21.1/lib/source/reader.mjs"]);
  assert.equal(importer.core, true);
  assert.equal(importer.content, true);
  assert.equal(requiresBrowser(importer), false);

  const unknown = classifyPaths(["new-runtime-surface.bin"]);
  assert.equal(unknown.code, true);
  assert.equal(unknown.core, true);
  assert.equal(unknown.desktop, true);
  assert.equal(unknown.windows, true);
});

test("daily CI has one fail-closed summary and no Map or Battle product lane", async () => {
  const ci = await read(".github/workflows/ci.yml");
  const runner = await read("scripts/ci/run-capability.mjs");
  const manifest = await read("package.json");
  assert.match(ci, /name: CI \/ summary/);
  assert.match(ci, /require_success "\$LINUX_REQUIRED" "\$LINUX_RESULT"/);
  assert.match(ci, /require_success "\$BROWSER_REQUIRED" "\$BROWSER_RESULT"/);
  assert.match(ci, /name: RPG Dialogue closed-loop qualification[\s\S]*run-capability\.mjs rpg-dialogue/);
  for (const source of [ci, runner, manifest]) {
    assert.doesNotMatch(source, /@loomrealm-game\/(?:map|battle|tile-presentation)/);
    assert.doesNotMatch(source, /run-capability\.mjs (?:map|battle)/);
  }
  assert.match(runner, /await runTestTrees\(\.\.\.REGRESSION_TEST_DIRS\)/);
  assert.doesNotMatch(ci, /--no-sandbox|ELECTRON_DISABLE_SANDBOX/);
});

test("full qualification remains framework-only", async () => {
  const workflow = await read(".github/workflows/full-qualification.yml");
  assert.match(workflow, /node: \[20, 24\]/);
  assert.match(workflow, /runs-on: windows-latest/);
  assert.match(workflow, /d863beab3c59c3bd4f271514a228fa8fee0bf5b6/);
  assert.match(workflow, /chmod 4755/);
  assert.match(workflow, /LOOMREALM_CHROMIUM_PATH/);
  assert.doesNotMatch(workflow, /exact_essentials|OFFICIAL_ARCHIVE_IDENTITY|map-build/);
  assert.doesNotMatch(workflow, /@loomrealm-game\/(?:map|battle|tile-presentation)/);
  assert.doesNotMatch(workflow, /--no-sandbox|ELECTRON_DISABLE_SANDBOX/);
});
