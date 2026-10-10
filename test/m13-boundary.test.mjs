import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as renderer from "@loomrealm/renderer";

const root = new URL("../", import.meta.url);
const text = (relative) => readFile(new URL(relative, root), "utf8");
const json = async (relative) => JSON.parse(await text(relative));

test("M13 leaves business presentation off the Renderer public root and package graph", async () => {
  for (const forbidden of [
    "WebProjector", "createPresentationResourceClient", "attachRendererPresentation",
    "PresentationStore", "PresentationState", "RenderNodeIdentity",
  ]) assert.equal(forbidden in renderer, false);
  const monorepo = await json("package.json");
  const lock = await json("package-lock.json");
  assert.equal(Object.keys(lock.packages).some((key) => /packages[\\/]presentation$/i.test(key)), false);
  assert.ok(monorepo.workspaces.includes("packages/*"));
  assert.ok(monorepo.workspaces.includes("apps/*"));
});

test("M13 private implementation stays thin and credential-free at the business ABI", async () => {
  const sources = await Promise.all([
    "packages/renderer/src/internal/presentation-seam.ts",
    "packages/renderer/src/internal/web-projector.ts",
    "packages/renderer/src/internal/presentation-resource-client.ts",
  ].map(text));
  const joined = sources.join("\n");
  assert.doesNotMatch(joined, /(PresentationStore|PresentationTopology|EventBus|AssetManager|ComponentRegistry|MutationObserver|RenderEvent)/);
  const declaration = await text("packages/renderer/dist/internal/presentation-resource-client.d.ts");
  assert.doesNotMatch(declaration, /(origin|installationId|token|filesystem|RendererContentAccess)/);
  assert.match(declaration, /CONTENT_CANCELLED/);
  const control = await text("packages/renderer/src/control.ts");
  assert.match(control, /readPresentationFacts\(\)/);
  assert.doesNotMatch(control.match(/private readPresentation\(\)[\s\S]*?\n  }/)?.[0] ?? "", /snapshotForQualification/);
});

test("Web Presentation capability preserves Chromium, boundary, pack and Node 20 compatibility evidence", async () => {
  const monorepo = await json("package.json");
  const runner = await text("scripts/ci/run-capability.mjs");
  const workflow = await text(".github/workflows/ci.yml");
  assert.equal(monorepo.devDependencies.playwright, "1.63.0");
  assert.match(runner, /presentation\(\) \{[\s\S]*build:desktop-stack[\s\S]*test:m13:qualification:run[\s\S]*test\/m13-boundary\.test\.mjs[\s\S]*test:m13:pack/);
  assert.doesNotMatch(runner, /npm\("run", "test:m13(?::pr)?"\)/);
  assert.match(workflow, /name: Browser \/ Node 24/);
  assert.match(workflow, /playwright install --with-deps chromium/);
  assert.match(workflow, /run-capability\.mjs presentation/);
  assert.match(workflow, /name: Node 20 compatibility/);
});
