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
  assert.doesNotMatch(joined, /(PresentationStore|PresentationTopology|EventBus|AssetManager|ComponentRegistry|MutationObserver)/);
  const declaration = await text("packages/renderer/dist/internal/presentation-resource-client.d.ts");
  assert.doesNotMatch(declaration, /(origin|installationId|token|filesystem|RendererContentAccess)/);
  assert.match(declaration, /CONTENT_CANCELLED/);
  const control = await text("packages/renderer/src/control.ts");
  assert.match(control, /readPresentationFacts\(\)/);
  assert.doesNotMatch(control.match(/private readPresentation\(\)[\s\S]*?\n  }/)?.[0] ?? "", /snapshotForQualification/);
});

test("Render Event delta adds only the optional transient seam and no retained or wire architecture", async () => {
  const [seam, store, control, projector, dataModel, publicDeclaration, projectorDeclaration] = await Promise.all([
    text("packages/renderer/src/internal/presentation-seam.ts"),
    text("packages/renderer/src/internal/render-store.ts"),
    text("packages/renderer/src/control.ts"),
    text("packages/renderer/src/internal/web-projector.ts"),
    text("packages/data/src/model.ts"),
    text("packages/renderer/dist/web-presentation.d.ts"),
    text("packages/renderer/dist/internal/web-projector.d.ts"),
  ]);
  assert.match(seam, /deliverRenderEvent\?\(/);
  assert.match(seam, /interface RendererPresentationRenderEvent/);
  assert.doesNotMatch(seam.match(/interface RendererPresentationSource[\s\S]*?\n}/)?.[0] ?? "", /events/);
  assert.doesNotMatch(store, /(MAX_EVENTS|\bprivate events\b|readonly events:)/);
  assert.match(store, /onApplicable\?\.\(message\)/);
  assert.doesNotMatch(control, /(instanceof WebProjector|new WebProjector|EventStore|retry|timeout|NACK|\bACK\b|\bResult\b)/);
  assert.doesNotMatch(projector, /(eventId|sequenceNumber|pendingEvents|replay|retry|timeout|NACK|\bACK\b|\bResult\b)/);
  assert.match(dataModel, /type RenderUpdateMessageV1 = RenderDomainsV1 \| RenderSnapshotV1 \| RenderPatchV1 \| RenderEventV1/);
  assert.match(dataModel, /RENDERER_DATA_PROFILE_V3 = "loomrealm\.renderer-data\/3"/);
  assert.match(publicDeclaration, /type RenderEventReceiver/);
  assert.match(publicDeclaration, /type WebPresentationRenderEvent/);
  assert.match(publicDeclaration, /RendererPresentationRenderEvent/);
  assert.match(projectorDeclaration, /interface RenderEventReceiver/);
  assert.match(projectorDeclaration, /interface WebPresentationRenderEvent/);
  assert.match(projectorDeclaration, /readonly data: JsonObject/);
});

test("Web Presentation capability preserves Chromium, boundary, pack and Node 20 compatibility evidence", async () => {
  const monorepo = await json("package.json");
  const runner = await text("scripts/ci/run-capability.mjs");
  const workflow = await text(".github/workflows/ci.yml");
  assert.equal(monorepo.devDependencies.playwright, "1.63.0");
  assert.match(runner, /presentation\(\) \{[\s\S]*build:desktop-stack[\s\S]*web-presentation-v2\/qualification\.test\.mjs[\s\S]*test\/m13-boundary\.test\.mjs[\s\S]*@loomrealm\/renderer/);
  assert.doesNotMatch(runner, /npm\("run", "test:m13/);
  assert.match(workflow, /name: Browser \/ Node 24/);
  assert.match(workflow, /playwright install --with-deps chromium/);
  assert.match(workflow, /run-capability\.mjs presentation/);
  assert.match(workflow, /name: Node 20 compatibility/);
});
