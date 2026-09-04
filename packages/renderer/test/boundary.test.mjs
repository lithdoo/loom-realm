import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Renderer exposes the exact M8 construction seam and one-way dependencies", async () => {
  const declaration = await readFile(new URL("../dist/control.d.ts", import.meta.url), "utf8");
  assert.match(declaration, /createRendererControlHolder\(data\?: RendererDataBinding\): RendererControlHolder/);
  assert.doesNotMatch(declaration, /(RendererPlatform|RendererServices|registerDataBinding)/);

  const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  assert.deepEqual(Object.keys(manifest.dependencies).sort(), [
    "@loomrealm/data",
    "@loomrealm/platform-ports",
    "@loomrealm/renderer-control",
  ]);
});
