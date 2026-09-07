import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (relative) => readFile(new URL(relative, root), "utf8");

test("subsystem exposes only the frozen M10 author projection", async () => {
  const declarations = await read("packages/subsystem/dist/index.d.ts");
  const model = await read("packages/subsystem/dist/model.d.ts");
  assert.match(declarations, /InputStateChannel/);
  assert.match(declarations, /CreateInputListenerOptions/);
  assert.match(model, /createInputListener\(options: CreateInputListenerOptions\): InputListener/);
  assert.doesNotMatch(declarations, /(?:InputStore|GenericSubscription|EventBus|Observable)/);
});

test("renderer keeps the additive source seam and frozen dependency boundary", async () => {
  const control = await read("packages/renderer/dist/control.d.ts");
  const input = await read("packages/renderer/dist/input.d.ts");
  const manifest = JSON.parse(await read("packages/renderer/package.json"));
  assert.match(control, /createRendererControlHolder\(data\?: RendererDataBinding, input\?: RendererInputSource\)/);
  assert.match(input, /interface RendererInputSource/);
  assert.deepEqual(Object.keys(manifest.dependencies).sort(), [
    "@loomrealm/data",
    "@loomrealm/platform-ports",
    "@loomrealm/renderer-control",
  ]);
});
