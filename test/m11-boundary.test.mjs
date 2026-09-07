import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (relative) => readFile(new URL(relative, root), "utf8");

test("Subsystem exposes the exact frozen M11 Render author projection", async () => {
  const index = await read("packages/subsystem/dist/index.d.ts");
  const model = await read("packages/subsystem/dist/model.d.ts");
  const render = await read("packages/subsystem/dist/render.d.ts");
  for (const name of ["RenderNode", "RenderDomainState", "RenderEvent", "RenderDomain"]) {
    assert.match(index, new RegExp(`\\b${name}\\b`));
  }
  assert.match(render, /type RenderNode = RenderNodeV1/);
  assert.match(render, /replace\(state: RenderDomainState\): void/);
  assert.match(render, /emit\(event: RenderEvent\): void/);
  assert.match(render, /close\(\): void/);
  assert.match(model, /createRenderDomain\(initialState: RenderDomainState\): RenderDomain/);
  assert.doesNotMatch(index, /(?:RenderManager|RenderStore|RenderSnapshot|RenderPatch|domainId|generation|revision)/);
});

test("Renderer keeps Render replica and qualification observation internal", async () => {
  const index = await read("packages/renderer/dist/index.d.ts");
  const control = await read("packages/renderer/dist/control.d.ts");
  const manifest = JSON.parse(await read("packages/renderer/package.json"));
  assert.doesNotMatch(index, /(?:RenderStore|RenderReplica|RenderSubscription|RenderEventTrace)/);
  assert.doesNotMatch(control, /(?:snapshotForQualification|renderQualification|RendererRenderStore)/);
  assert.deepEqual(Object.keys(manifest.dependencies).sort(), [
    "@loomrealm/data",
    "@loomrealm/platform-ports",
    "@loomrealm/renderer-control",
  ]);
});

test("M11 does not introduce forbidden generic Render abstractions", async () => {
  const subsystem = await read("packages/subsystem/dist/internal/render-manager.d.ts");
  const renderer = await read("packages/renderer/dist/internal/render-store.d.ts");
  assert.doesNotMatch(`${subsystem}\n${renderer}`, /(?:Observable|EventBus|VirtualDOM|Reconciler|ComponentRegistry|RenderRPC|Ack|Nack|Resync)/i);
});
