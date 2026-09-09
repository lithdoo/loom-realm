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
  assert.deepEqual(monorepo.workspaces, ["packages/*", "apps/*"]);
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
});

test("M13 canonical gate strictly includes M12, Chromium, pack and Node 20/24 CI", async () => {
  const monorepo = await json("package.json");
  assert.match(monorepo.scripts["test:m13"], /test:m12/);
  assert.match(monorepo.scripts["test:m13"], /test:m13:qualification:run/);
  assert.match(monorepo.scripts["test:m13"], /test:m13:pack/);
  assert.equal(monorepo.devDependencies.playwright, "1.63.0");
  const workflow = await text(".github/workflows/m13.yml");
  assert.match(workflow, /node: \[20, 24\]/);
  assert.match(workflow, /playwright install --with-deps chromium/);
  assert.match(workflow, /npm run test:m13/);
});
