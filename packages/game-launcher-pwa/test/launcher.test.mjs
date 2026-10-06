import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  PwaLauncherError,
  buildPwaExecutableIndexV1,
  parsePwaLaunchManifestV1,
  preparePwaGame,
} from "../dist/index.js";

const version = (text) => `sha256:${createHash("sha256").update(text).digest("hex")}`;

test("PWA manifest and executable graph are closed, relative and install-time enumerable", () => {
  assert.deepEqual(parsePwaLaunchManifestV1('{"formatVersion":1,"subsystems":[{"key":"root","module":"root/main.mjs"}]}'), {
    formatVersion: 1,
    subsystems: [{ key: "root", module: "root/main.mjs" }],
  });
  for (const invalid of [
    '{"formatVersion":1,"subsystems":[],"extra":true}',
    '{"formatVersion":2,"subsystems":[]}',
    '{"formatVersion":1,"subsystems":[{"key":"root","module":"https://x/main.mjs"}]}',
    '{"formatVersion":1,"subsystems":[{"key":"root","module":"../main.mjs"}]}',
  ]) assert.throws(() => parsePwaLaunchManifestV1(invalid), PwaLauncherError);
  const main = 'import { value } from "./dep.mjs"; export default () => value;';
  const dep = "export const value = 1;";
  assert.deepEqual(buildPwaExecutableIndexV1([
    { logicalModule: "root/main.mjs", source: main, contentVersion: version(main) },
    { logicalModule: "root/dep.mjs", source: dep, contentVersion: version(dep) },
  ]), [
    { logicalModule: "root/main.mjs", contentVersion: version(main), imports: ["root/dep.mjs"] },
    { logicalModule: "root/dep.mjs", contentVersion: version(dep), imports: [] },
  ]);
  for (const source of ['import "pkg";', 'import "https://example.test/x.mjs";', "import(name);"]) {
    assert.throws(() => buildPwaExecutableIndexV1([{ logicalModule: "main.mjs", source, contentVersion: version(source) }]), PwaLauncherError);
  }
});

test("PWA PREPARE exact-joins keys and freezes logical/state/physical projections before side effects", async () => {
  const locationDescriptor = Object.getOwnPropertyDescriptor(globalThis, "location");
  Object.defineProperty(globalThis, "location", { configurable: true, value: new URL("https://game.test/") });
  try {
    let resolutions = 0;
    const source = "export default () => ({ frame: () => ({ type: 'completed', value: null }) });";
    const index = buildPwaExecutableIndexV1([{ logicalModule: "root.mjs", source, contentVersion: version(source) }]);
    const prepared = await preparePwaGame({
      installationId: "install",
      serviceWorkerGeneration: "generation",
      gameEntryText: JSON.stringify({ formatVersion: 1, state: { records: [{ namespace: "n", key: "k", value: 1 }] }, initial: { subsystem: "root", input: { x: 1 } }, subsystems: [{ key: "root" }] }),
      launchManifestText: JSON.stringify({ formatVersion: 1, subsystems: [{ key: "root", module: "root.mjs" }] }),
      executableIndex: index,
      runnerPolicy: { helloDeadlineMs: 100, frameDeadlineMs: 1000, terminalCleanupDeadlineMs: 100 },
      resolveModuleUrl(logical) { resolutions += 1; return `https://game.test/_lr/internal/executables/install/${logical}`; },
    });
    assert.equal(resolutions, 1);
    assert.deepEqual(prepared.logicalBootstrap, { subsystemKeys: ["root"], initial: { subsystemKey: "root", input: { x: 1 } } });
    assert.deepEqual(prepared.state, { records: [{ key: { namespace: "n", key: "k" }, value: 1 }] });
    assert(Object.isFrozen(prepared.launchPlan));
    for (const forbidden of ["module", "moduleUrl", "installationId", "formatVersion"]) assert.equal(forbidden in prepared.logicalBootstrap, false);

    resolutions = 0;
    await assert.rejects(preparePwaGame({
      installationId: "install", serviceWorkerGeneration: "generation",
      gameEntryText: JSON.stringify({ formatVersion: 1, initial: { subsystem: "root", input: null }, subsystems: [{ key: "root" }] }),
      launchManifestText: JSON.stringify({ formatVersion: 1, subsystems: [{ key: "extra", module: "root.mjs" }] }),
      executableIndex: index,
      runnerPolicy: { helloDeadlineMs: 100, frameDeadlineMs: 1000, terminalCleanupDeadlineMs: 100 },
      resolveModuleUrl() { resolutions += 1; return "https://game.test/never"; },
    }), (error) => error.code === "PLATFORM_BINDING_MISSING");
    assert.equal(resolutions, 0);
  } finally {
    if (locationDescriptor) Object.defineProperty(globalThis, "location", locationDescriptor);
    else delete globalThis.location;
  }
});
