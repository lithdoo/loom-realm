import assert from "node:assert/strict";
import test from "node:test";
import { pwaBundleId } from "../scripts/pwa-bundle-id.mjs";

const fixture = () => ({
  formatVersion: 1,
  gameEntryText: "{\"initial\":{\"subsystem\":\"demo\"}}",
  launchManifestText: "{\"subsystems\":[{\"key\":\"demo\",\"module\":\"subsystems/demo.mjs\"}]}",
  presentation: { scripts: [], styles: [] },
  executables: [{
    logicalModule: "subsystems/demo.mjs",
    mime: "text/javascript",
    source: "export default () => ({ async frame() { return { type: 'completed' }; } });",
    contentVersion: "sha256:demo",
  }],
  content: [{ kind: "record", namespace: "struct.demo", key: "config", mime: "application/json", encoding: "base64", body: "eyJvayI6dHJ1ZX0=" }],
});

test("PWA bundle identity is deterministic and incorporates the shell generation", () => {
  const payload = fixture();
  const first = pwaBundleId("pwa-v1-shell-a", payload);
  assert.match(first, /^loomrealm-pwa-sha256-[0-9a-f]{64}$/);
  assert.equal(first, pwaBundleId("pwa-v1-shell-a", fixture()));
  assert.notEqual(first, pwaBundleId("pwa-v1-shell-b", payload));
});

test("changes to game code, presentation, or Content produce a new installation identity", () => {
  const original = fixture();
  const changedCode = fixture();
  changedCode.executables[0].source = "export default () => null;";
  const changedPresentation = fixture();
  changedPresentation.presentation = { scripts: ["new.js"], styles: [] };
  const changedContent = fixture();
  changedContent.content[0].body = "eyJvayI6ZmFsc2V9";
  assert.notEqual(pwaBundleId("same-shell", original), pwaBundleId("same-shell", changedCode));
  assert.notEqual(pwaBundleId("same-shell", original), pwaBundleId("same-shell", changedPresentation));
  assert.notEqual(pwaBundleId("same-shell", original), pwaBundleId("same-shell", changedContent));
});
