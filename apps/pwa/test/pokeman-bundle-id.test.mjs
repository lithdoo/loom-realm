import assert from "node:assert/strict";
import test from "node:test";
import { pokeManBundleId } from "../scripts/pokeman-bundle-id.mjs";

const fixture = () => ({
  gameEntryText: '{"initial":{"input":{"mapId":3}}}',
  launchManifestText: '{"subsystems":[{"key":"map"}]}',
  presentation: { scripts: ["map.browser.js"] },
  executables: [
    { logicalModule: "subsystems/base.mjs", mime: "text/javascript", source: "export default () => ({ frame() {} });", contentVersion: "sha256:base" },
    { logicalModule: "subsystems/map.mjs", mime: "text/javascript", source: "export default () => ({ frame() {} });", contentVersion: "sha256:map" },
    { logicalModule: "subsystems/dialogue.mjs", mime: "text/javascript", source: "export default () => ({ frame() {} });", contentVersion: "sha256:dialogue" },
  ],
  content: [{ kind: "record", namespace: "struct.Map", key: "3", mime: "application/json", body: "eyJ4IjozfQ==" }],
});

test("staging bundle ID is deterministic and incorporates the shell generation", () => {
  const payload = fixture();
  const first = pokeManBundleId("pwa-v1-shell-a", payload);
  assert.match(first, /^pokeman-map-sha256-[0-9a-f]{64}$/);
  assert.equal(first, pokeManBundleId("pwa-v1-shell-a", fixture()));
  assert.notEqual(first, pokeManBundleId("pwa-v1-shell-b", payload));
});

test("changing only PokeMan Map data creates a new installation identity", () => {
  const original = fixture();
  const changed = fixture();
  changed.content = [{ ...changed.content[0], body: "eyJ4Ijo0fQ==" }];
  assert.notEqual(pokeManBundleId("same-shell", original), pokeManBundleId("same-shell", changed));
});

test("changing any executable or presentation changes the PokeMan bundle ID", () => {
  const original = fixture();
  const changedBase = fixture();
  changedBase.executables = changedBase.executables.map((entry, index) => index === 0 ? { ...entry, source: "export default () => null" } : entry);
  const changedMap = fixture();
  changedMap.executables = changedMap.executables.map((entry, index) => index === 1 ? { ...entry, source: "export default () => null" } : entry);
  const changedDialogue = fixture();
  changedDialogue.executables = changedDialogue.executables.map((entry, index) => index === 2 ? { ...entry, source: "export default () => null" } : entry);
  assert.notEqual(pokeManBundleId("same-shell", original), pokeManBundleId("same-shell", changedBase));
  assert.notEqual(pokeManBundleId("same-shell", original), pokeManBundleId("same-shell", changedMap));
  assert.notEqual(pokeManBundleId("same-shell", original), pokeManBundleId("same-shell", changedDialogue));
  assert.notEqual(pokeManBundleId("same-shell", original), pokeManBundleId("same-shell", { ...fixture(), presentation: { scripts: ["new-map-browser.js"] } }));
});
