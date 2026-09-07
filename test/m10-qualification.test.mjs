import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (relative) => readFile(new URL(relative, root), "utf8");

test("M10 qualification targets User Input v1 fixtureSetRevision 2", async () => {
  const conformance = await read("doc/15-contracts/user-input-conformance-v1.md");
  assert.match(conformance, /适用协议：`loomrealm\.user-input \/ 1`/);
  assert.match(conformance, /fixtureSetRevision：2/);
  assert.match(conformance, /Mutation-gate State Convergence — Revision 2/);
  assert.match(conformance, /Listener \/ Business Isolation — Revision 2/);
});

test("subsystem-interest-sender and subsystem-input-receiver expose only the frozen author projection", async () => {
  const declarations = await read("packages/subsystem/dist/index.d.ts");
  const model = await read("packages/subsystem/dist/model.d.ts");
  assert.match(declarations, /InputStateChannel/);
  assert.match(declarations, /CreateInputListenerOptions/);
  assert.match(model, /createInputListener\(options: CreateInputListenerOptions\): InputListener/);
  assert.doesNotMatch(declarations, /(?:InputStore|GenericSubscription|EventBus|Observable)/);
});

test("renderer-input-sender keeps the additive source seam and existing dependency boundary", async () => {
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

test("M10 includes a production-shaped Hostra/Desktop Data lifecycle vertical", async () => {
  const vertical = await read("apps/desktop/test/m10-input-vertical.test.mjs");
  const mainVertical = await read("packages/main/test/runtime.test.mjs");
  for (const evidence of [
    "createHostraRuntimeHosting",
    "runMain",
    "DesktopDataConnectionBroker",
    "createRendererControlHolder(observedBinding, source)",
    "scope.createInputListener",
    "fresh business State baseline after reconnect",
  ]) assert.match(vertical, new RegExp(evidence.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(mainVertical, /M10 input follows real Main nested InputTarget replacement and fresh caller Activation/);
});
