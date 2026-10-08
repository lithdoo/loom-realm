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

function module(logicalModule, source) {
  return { logicalModule, source, contentVersion: version(source) };
}

async function rejectsGraph(source, code = "SUBSYSTEM_MODULE_GRAPH_INVALID", extra = []) {
  await assert.rejects(
    buildPwaExecutableIndexV1([module("root/main.mjs", source), ...extra]),
    (error) => error instanceof PwaLauncherError && error.code === code,
  );
}

test("PWA manifest and executable graph are closed, relative and install-time enumerable", async () => {
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
  assert.deepEqual(await buildPwaExecutableIndexV1([
    module("root/main.mjs", main),
    module("root/dep.mjs", dep),
  ]), [
    { logicalModule: "root/main.mjs", contentVersion: version(main), imports: ["root/dep.mjs"] },
    { logicalModule: "root/dep.mjs", contentVersion: version(dep), imports: [] },
  ]);
});

test("executable analysis lexes every supported ESM edge across comments, escapes, and multiline grammar", async () => {
  const source = String.raw`
    import "./side.mjs";
    import/**/ { value } /* gap */ from
      "./named.mjs" with { type: "javascript" };
    export { value as renamed } from "./exported.mjs";
    export * from "./star.mjs";
    const lazy = import/**/("./dynamic.mjs");
    const escaped = import(".\u002fescaped.mjs");
    export default [value, lazy, escaped];
  `;
  const dependencies = ["side", "named", "exported", "star", "dynamic", "escaped"]
    .map((name) => module(`root/${name}.mjs`, `export const value = ${JSON.stringify(name)};`));
  const index = await buildPwaExecutableIndexV1([module("root/main.mjs", source), ...dependencies]);
  assert.deepEqual(index[0].imports, dependencies.map(({ logicalModule }) => logicalModule));
  assert.equal(Object.isFrozen(index), true);
  assert.equal(Object.isFrozen(index[0].imports), true);
});

test("executable analysis ignores import-shaped text outside ESM grammar", async () => {
  const source = [
    'const string = \'import("https://example.test/string.mjs")\';',
    'const template = `import("https://example.test/template.mjs")`;',
    'const expression = /import\\("https:\\/\\/example\\.test\\/regex\\.mjs"\\)/;',
    '// import("https://example.test/line-comment.mjs")',
    '/* export * from "https://example.test/block-comment.mjs" */',
    'export default [string, template, expression];',
  ].join("\n");
  assert.deepEqual(await buildPwaExecutableIndexV1([module("root/main.mjs", source)]), [
    { logicalModule: "root/main.mjs", contentVersion: version(source), imports: [] },
  ]);
});

test("executable policy rejects every non-relative or runtime-enumerated edge class", async () => {
  for (const specifier of [
    "pkg",
    "https://example.test/x.mjs",
    "data:text/javascript,export default 1",
    "blob:https://example.test/id",
    "//example.test/x.mjs",
    "/absolute/x.mjs",
  ]) await rejectsGraph(`import ${JSON.stringify(specifier)};`);
  await rejectsGraph("import(name);");
  await rejectsGraph("import(`./${name}.mjs`);");
  await rejectsGraph('import/**/("https://example.test/comment-gap.mjs");');
  await rejectsGraph('import "../../outside.mjs";', "SUBSYSTEM_MODULE_OUTSIDE_INSTALLATION");
});

test("executable graph rejects missing and duplicate modules before publication", async () => {
  await rejectsGraph('import "./missing.mjs";', "SUBSYSTEM_MODULE_NOT_FOUND");
  const source = "export default 1;";
  await assert.rejects(buildPwaExecutableIndexV1([
    module("root/main.mjs", source),
    module("root/main.mjs", source),
  ]), (error) => error instanceof PwaLauncherError && error.code === "SUBSYSTEM_MODULE_INVALID");
});

test("PWA PREPARE exact-joins keys and freezes logical/state/physical projections before side effects", async () => {
  const locationDescriptor = Object.getOwnPropertyDescriptor(globalThis, "location");
  Object.defineProperty(globalThis, "location", { configurable: true, value: new URL("https://game.test/") });
  try {
    let resolutions = 0;
    const source = "export default () => ({ frame: () => ({ type: 'completed', value: null }) });";
    const index = await buildPwaExecutableIndexV1([{ logicalModule: "root.mjs", source, contentVersion: version(source) }]);
    const installation = {
      installationId: "install",
      generation: "installation-generation",
      gameEntryText: JSON.stringify({ formatVersion: 1, state: { records: [{ namespace: "n", key: "k", value: 1 }] }, initial: { subsystem: "root", input: { x: 1 } }, subsystems: [{ key: "root" }] }),
      launchManifestText: JSON.stringify({ formatVersion: 1, subsystems: [{ key: "root", module: "root.mjs" }] }),
      executableIndex: index,
    };
    const prepared = await preparePwaGame({ installationId: "install" }, {
      expectedServiceWorker: { protocolVersion: 1, buildId: "build", generation: "generation" },
      openPublishedInstallation: async () => installation,
      runnerPolicy: { helloDeadlineMs: 100, frameDeadlineMs: 1000, terminalCleanupDeadlineMs: 100 },
      resolveModuleUrl(logical) { resolutions += 1; return `https://game.test/_lr/internal/executables/install/${logical}`; },
    });
    assert.equal(resolutions, 1);
    assert.deepEqual(prepared.logicalBootstrap, { subsystemKeys: ["root"], initial: { subsystemKey: "root", input: { x: 1 } } });
    assert.deepEqual(prepared.state, { records: [{ key: { namespace: "n", key: "k" }, value: 1 }] });
    assert(Object.isFrozen(prepared.launchPlan));
    for (const forbidden of ["module", "moduleUrl", "installationId", "formatVersion"]) assert.equal(forbidden in prepared.logicalBootstrap, false);

    resolutions = 0;
    await assert.rejects(preparePwaGame({ installationId: "install" }, {
      expectedServiceWorker: { protocolVersion: 1, buildId: "build", generation: "generation" },
      openPublishedInstallation: async () => ({ ...installation,
        gameEntryText: JSON.stringify({ formatVersion: 1, initial: { subsystem: "root", input: null }, subsystems: [{ key: "root" }] }),
        launchManifestText: JSON.stringify({ formatVersion: 1, subsystems: [{ key: "extra", module: "root.mjs" }] }),
      }),
      runnerPolicy: { helloDeadlineMs: 100, frameDeadlineMs: 1000, terminalCleanupDeadlineMs: 100 },
      resolveModuleUrl() { resolutions += 1; return "https://game.test/never"; },
    }), (error) => error.code === "PLATFORM_BINDING_MISSING");
    assert.equal(resolutions, 0);
  } finally {
    if (locationDescriptor) Object.defineProperty(globalThis, "location", locationDescriptor);
    else delete globalThis.location;
  }
});
