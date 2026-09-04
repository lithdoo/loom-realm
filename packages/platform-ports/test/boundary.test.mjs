import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("M7 ports expose opaque material and candidate carrier shapes without legacy alias", async () => {
  const declarations = await readFile(new URL("../dist/index.d.ts", import.meta.url), "utf8");
  assert.match(declarations, /interface OpaqueMaterialGenerator/);
  assert.match(declarations, /interface RendererControlBinding/);
  assert.match(declarations, /acquire\(rendererControlToken: string, signal: AbortSignal\): Promise<MessageCarrier>/);
  assert.doesNotMatch(declarations, /BootstrapTokenGenerator/);
});

test("M8 exposes only the two exact role-facing Data Binding seams", async () => {
  const declarations = await readFile(new URL("../dist/index.d.ts", import.meta.url), "utf8");
  assert.match(declarations, /interface RendererDataBinding/);
  assert.match(declarations, /acquire\(subsystemKey: string, generation: number, dataProfile: string, signal: AbortSignal\): Promise<MessageCarrier>/);
  assert.match(declarations, /interface SubsystemDataBindingResult \{\s*readonly carrier: MessageCarrier;\s*readonly generation: number;\s*readonly dataProfile: string;\s*\}/);
  assert.match(declarations, /interface SubsystemDataBinding \{\s*acquire\(signal: AbortSignal\): Promise<SubsystemDataBindingResult>;\s*\}/);
  assert.doesNotMatch(declarations, /(GenericDataBinding|UniversalConnection|DataConnectionBroker|BindingError)/);
});

test("platform-ports keeps its one-way Foundation-only runtime dependency", async () => {
  const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  assert.deepEqual(Object.keys(manifest.dependencies), ["@loomrealm/foundation"]);
});
