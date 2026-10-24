import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";
import { classifyPaths, requiresBrowser } from "../scripts/ci/impact.mjs";

const root = new URL("../", import.meta.url);
const read = async (relative) => (await readFile(new URL(relative, root), "utf8")).replaceAll("\r\n", "\n");

test("active workflow surface is compact and milestone-free", async () => {
  const files = (await readdir(new URL(".github/workflows/", root))).sort();
  // A self-hosted diagnostic or staging deploy may land in either order.
  // Reject all other workflows; inspect every recognized optional workflow.
  const extensions = new Set(["runner-diagnostics.yml", "deploy-pokeman-staging.yml"]);
  assert.deepEqual(files.filter((name) => !extensions.has(name)), [
    "ci.yml", "deploy-pages.yml", "full-qualification.yml",
  ]);
  assert.ok(files.every((name) => !/^m\d+/i.test(name)));
});

test("self-hosted diagnostics remain manual, main-only and without repository token permissions", async () => {
  const files = await readdir(new URL(".github/workflows/", root));
  if (!files.includes("runner-diagnostics.yml")) return;
  const workflow = await read(".github/workflows/runner-diagnostics.yml");
  assert.match(workflow, /^on:\n  workflow_dispatch:/m);
  assert.doesNotMatch(workflow, /^\s*(?:push|pull_request|pull_request_target):/m);
  assert.match(workflow, /^permissions: \{\}$/m);
  assert.match(workflow, /runs-on: \[self-hosted, pwa\]/);
  assert.match(workflow, /if: github.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /Scope: the \*\*Runner container\*\*/);
  assert.doesNotMatch(workflow, /systemctl --user|loginctl show-user|ss -H -ltn/);
});

test("PokeMan staging deploy runs only after successful main CI push", async () => {
  const files = await readdir(new URL(".github/workflows/", root));
  if (!files.includes("deploy-pokeman-staging.yml")) return;
  const workflow = await read(".github/workflows/deploy-pokeman-staging.yml");
  assert.match(workflow, /workflows: \["CI"\]/);
  assert.match(workflow, /branches: \[main\]/);
  assert.match(workflow, /github\.event\.workflow_run\.event == 'push'/);
  assert.match(workflow, /runs-on: \[self-hosted, pwa\]/);
  assert.match(workflow, /actions\/setup-node@v6/);
  assert.match(workflow, /node-version: 24/);
  assert.match(workflow, /github\.event\.workflow_run\.head_sha/);
  assert.doesNotMatch(workflow, /pull_request/);
});

test("impact routing is selective for docs, routes Battle to Browser, and fails closed for unknown code", () => {
  assert.deepEqual(classifyPaths(["doc/20-modules/main-system/README.md"]), {
    code: false,
    content: false,
    presentation: false,
    map: false,
    schema: false,
    pwa: false,
    battle: false,
    dialogue: false,
    desktop: false,
    windows: false,
    docs: true,
  });

  const foundation = classifyPaths(["packages/foundation/src/index.ts"]);
  for (const key of ["code", "content", "presentation", "map", "schema", "pwa", "battle", "dialogue", "desktop", "windows"]) {
    assert.equal(foundation[key], true, `foundation must affect ${key}`);
  }

  const battle = classifyPaths(["game-libs/battle/src/index.ts"]);
  assert.equal(battle.battle, true);
  assert.equal(requiresBrowser(battle), true);

  const dialogue = classifyPaths(["game-libs/rpg-dialogue/src/index.ts"]);
  assert.equal(dialogue.dialogue, true);
  assert.equal(dialogue.presentation, true);
  assert.equal(requiresBrowser(dialogue), true);

  const dialogueQualification = classifyPaths(["test/rpg-dialogue-v1/qualification.test.mjs"]);
  assert.deepEqual(dialogueQualification, {
    code: true,
    content: false,
    presentation: true,
    map: false,
    schema: false,
    pwa: false,
    battle: false,
    dialogue: true,
    desktop: false,
    windows: false,
    docs: false,
  });

  const controlPortsQualification = classifyPaths(["test/game-control-ports-v1/composition.test.mjs"]);
  assert.deepEqual(controlPortsQualification, {
    code: true,
    content: false,
    presentation: true,
    map: true,
    schema: false,
    pwa: true,
    battle: false,
    dialogue: true,
    desktop: false,
    windows: false,
    docs: false,
  });
  assert.equal(requiresBrowser(controlPortsQualification), true);

  const commonControlsQualification = classifyPaths(["test/game-common-controls-input-v1/qualification.test.mjs"]);
  assert.equal(commonControlsQualification.code, true);

  const unknown = classifyPaths(["new-runtime-surface.bin"]);
  assert.equal(unknown.code, true);
  assert.equal(unknown.desktop, true);
  assert.equal(unknown.windows, true);

  const terrainContract = classifyPaths(["game-libs/map/TERRAIN_BEHAVIOR_CONTRACT_V1.md"]);
  assert.equal(terrainContract.docs, true);
  assert.equal(terrainContract.map, true);
  assert.equal(terrainContract.presentation, true);

  const pokeMan = classifyPaths(["examples/PokeMan/subsystems/map.mjs"]);
  assert.equal(pokeMan.map, true);
  assert.equal(pokeMan.pwa, true);
  assert.equal(requiresBrowser(pokeMan), true);
});

test("daily CI has one fail-closed summary and Browser owns Battle browser qualification", async () => {
  const ci = await read(".github/workflows/ci.yml");
  const runner = await read("scripts/ci/run-capability.mjs");
  assert.match(ci, /name: CI \/ summary/);
  // A fresh deploy Runner cannot rely on artifacts built by earlier CI steps.
  const coldBuild = ci.indexOf("- name: Clean PokeMan staging build");
  const canonical = ci.indexOf("- name: Canonical package and contract regression");
  assert.ok(coldBuild > 0 && coldBuild < canonical, "clean staging build must run before canonical workspace regression");
  assert.match(ci, /name: Clean PokeMan staging build[\s\S]*?needs\.impact\.outputs\.pwa == 'true'[\s\S]*?npm run build:staging -w @loomrealm\/pwa/);

  assert.match(ci, /require_success "\$CODE" "\$LINUX_RESULT"/);
  assert.match(ci, /require_success "\$BROWSER_REQUIRED" "\$BROWSER_RESULT"/);
  assert.match(ci, /if: needs\.impact\.outputs\.browser == 'true'/);
  assert.match(ci, /LOOMREALM_CHROMIUM_PATH/);
  assert.match(ci, /name: Battle browser qualification[\s\S]*run-capability\.mjs battle/);
  assert.match(ci, /name: RPG Dialogue closed-loop qualification[\s\S]*run-capability\.mjs rpg-dialogue/);
  assert.match(ci, /name: Session Events v1 qualification[\s\S]*run-capability\.mjs session-events/);
  assert.doesNotMatch(ci.match(/  linux:[\s\S]*?\n  node20:/)?.[0] ?? "", /run-capability\.mjs battle/);
  assert.match(runner, /runWithRetry\(process\.execPath, \["--test", "game-libs\/battle\/test\/browser-e2e\.test\.mjs"\]\)/);
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
  assert.match(workflow, /LOOMREALM_CHROMIUM_PATH/);
  assert.doesNotMatch(workflow, /LOOMREALM_PERFORMANCE_FULL/);
  assert.match(workflow, /inputs\.exact_essentials/);
  assert.match(workflow, /OFFICIAL_ARCHIVE_IDENTITY/);
  assert.match(workflow, /run-capability\.mjs map-build/);
  assert.doesNotMatch(workflow, /npm run (?:test|build):m\d+/);
  assert.doesNotMatch(workflow, /--no-sandbox|ELECTRON_DISABLE_SANDBOX/);
});
