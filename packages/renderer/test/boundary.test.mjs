import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Renderer exposes the additive M10 construction seam and unchanged dependencies", async () => {
  const declaration = await readFile(new URL("../dist/control.d.ts", import.meta.url), "utf8");
  assert.match(declaration, /createRendererControlHolder\(data\?: RendererDataBinding, input\?: RendererInputSource\): RendererControlHolder/);
  assert.doesNotMatch(declaration, /(RendererPlatform|RendererServices|registerDataBinding)/);

  const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  assert.deepEqual(Object.keys(manifest.dependencies).sort(), [
    "@loomrealm/data",
    "@loomrealm/platform-ports",
    "@loomrealm/renderer-control",
  ]);
  const input = await readFile(new URL("../dist/input.d.ts", import.meta.url), "utf8");
  assert.match(input, /interface RendererInputSource/);
  assert.match(input, /type RendererInputSourceChange/);
  assert.match(input, /from "@loomrealm\/data"/);
});

test("M12 ResourceClient stays off the Renderer root surface", async () => {
  const root = await import("../dist/index.js");
  assert.equal("createRendererResourceClient" in root, false);
  const declaration = await readFile(new URL("../dist/internal/resource-client.d.ts", import.meta.url), "utf8");
  assert.match(declaration, /expectedContentVersion: string/);
  assert.doesNotMatch(declaration, /(AssetManager|RenderNode|filesystem|bearer)/);
});
