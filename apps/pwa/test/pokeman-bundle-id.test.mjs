import assert from "node:assert/strict";
import test from "node:test";
import { pokeManBundleId } from "../scripts/pokeman-bundle-id.mjs";

const executables = () => [
  {
    logicalModule: "subsystems/base.mjs",
    mime: "text/javascript",
    source: "export default () => ({ frame() {} });",
    contentVersion: "sha256:base",
  },
  {
    logicalModule: "subsystems/map.mjs",
    mime: "text/javascript",
    source: "export default () => ({ frame() { return 1; } });",
    contentVersion: "sha256:map",
  },
];

const fixture = () => ({
  gameEntryText: '{"initial":{"subsystem":"base","input":{"mapId":3}}}',
  launchManifestText: '{"subsystems":[{"key":"base"},{"key":"map"}]}',
  presentation: { scripts: ["map.browser.js"] },
  executables: executables(),
  content: [{ kind: "record", namespace: "struct.Map", key: "3", mime: "application/json", body: "eyJ4IjozfQ==" }],
});

test("staging bundle ID is deterministic and covers both executables", () => {
  const payload = fixture();
  const first = pokeManBundleId("pwa-v1-shell-a", payload);
  assert.match(first, /^pokeman-base-map-sha256-[0-9a-f]{64}$/);
  assert.equal(first, pokeManBundleId("pwa-v1-shell-a", fixture()));
  assert.notEqual(first, pokeManBundleId("pwa-v1-shell-b", payload));
});

test("changing only PokeMan Map data creates a new installation identity", () => {
  const original = fixture();
  const changed = fixture();
  changed.content = [{ ...changed.content[0], body: "eyJ4Ijo0fQ==" }];
  assert.notEqual(pokeManBundleId("same-shell", original), pokeManBundleId("same-shell", changed));
});

test("changing either executable or the presentation changes the PokeMan bundle ID", () => {
  const original = fixture();
  const baseChanged = fixture();
  baseChanged.executables = executables();
  baseChanged.executables[0] = { ...baseChanged.executables[0], source: "export default () => null" };
  const mapChanged = fixture();
  mapChanged.executables = executables();
  mapChanged.executables[1] = { ...mapChanged.executables[1], source: "export default () => 2" };
  assert.notEqual(pokeManBundleId("same-shell", original), pokeManBundleId("same-shell", baseChanged));
  assert.notEqual(pokeManBundleId("same-shell", original), pokeManBundleId("same-shell", mapChanged));
  assert.notEqual(pokeManBundleId("same-shell", original), pokeManBundleId("same-shell", { ...fixture(), presentation: { scripts: ["new-map-browser.js"] } }));
});
