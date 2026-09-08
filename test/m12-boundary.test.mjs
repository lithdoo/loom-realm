import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as fsdb from "@loomrealm/fsdb";
import * as fsdbHttp from "@loomrealm/fsdb-http";
import * as renderer from "@loomrealm/renderer";
import * as subsystem from "@loomrealm/subsystem";

const root = new URL("../", import.meta.url);
const text = (relative) => readFile(new URL(relative, root), "utf8");
const json = async (relative) => JSON.parse(await text(relative));

test("@loomrealm/fsdb has the exact frozen public value surface and Node-only dependency boundary", async () => {
  assert.deepEqual(Object.keys(fsdb).sort(), ["describeFsdb", "getFsdbSnapshotId", "listFsdbEntries", "openFsdb", "openFsdbObject"]);
  const manifest = await json("packages/fsdb/package.json");
  assert.deepEqual(manifest.dependencies ?? {}, {});
  const source = await Promise.all(["database.ts", "index.ts", "mime.ts", "model.ts", "names.ts", "scanner.ts"].map((file) => text(`packages/fsdb/src/${file}`)));
  assert.equal(/@loomrealm\//.test(source.join("\n")), false);
});

test("fsdb-http is one HTTP adapter over core with no duplicate scanner/index/safe-open owner", async () => {
  const manifest = await json("packages/fsdb-http/package.json");
  assert.deepEqual(manifest.dependencies, { "@loomrealm/fsdb": "0.1.0-alpha.0" });
  for (const removed of ["database.ts", "scanner.ts", "model.ts", "mime.ts"]) {
    await assert.rejects(readFile(new URL(`packages/fsdb-http/src/${removed}`, root)));
    await assert.rejects(readFile(new URL(`packages/fsdb-http/dist/${removed.replace(".ts", ".js")}`, root)));
  }
  assert.deepEqual(Object.keys(fsdbHttp).sort(), ["createFsdbHttpHandler", "openFsdb", "serveFsdb"]);
  assert.equal("openFsdbObject" in fsdbHttp, false);
  assert.equal("listFsdbEntries" in fsdbHttp, false);
});

test("Subsystem exposes exact M12 author values without physical Content authority", async () => {
  assert.equal(typeof subsystem.ContentReadError, "function");
  for (const forbidden of ["createBoundContentClient", "openFsdb", "fetch", "installationId", "token"]) assert.equal(forbidden in subsystem, false);
  const declaration = await text("packages/subsystem/dist/content.d.ts");
  assert.doesNotMatch(declaration, /(URL|installationId|token|Fsdb|filesystem)/);
  assert.match(await text("packages/subsystem/dist/model.d.ts"), /readonly content: ContentClient/);
});

test("Hostra keeps Content grant outside launch context, bootstrap token, and Data provisioning", async () => {
  const bootstrap = await text("packages/game-launcher-hostra/src/runner/bootstrap.ts");
  const access = await text("packages/game-launcher-hostra/src/content-access.ts");
  const launchContext = await text("packages/subsystem/src/host/run-subsystem.ts");
  assert.match(access, /LOOMREALM_HOSTRA_CONTENT_ACCESS/);
  assert.doesNotMatch(launchContext.match(/export interface SubsystemLaunchContext[\s\S]*?\n}/)?.[0] ?? "", /(content|token.*content|origin|installationId)/i);
  assert.doesNotMatch(bootstrap.match(/export interface RunnerBootstrapV1[\s\S]*?\n}/)?.[0] ?? "", /(content|installationId)/i);
  assert.doesNotMatch(await text("packages/game-launcher-hostra/src/runner/data-provisioning.ts"), /(ContentClient|CONTENT_ACCESS|installationId)/);
});

test("Renderer keeps ResourceClient off root and version-safe in its integration subpath", async () => {
  assert.equal("createRendererResourceClient" in renderer, false);
  const source = await text("packages/renderer/src/internal/resource-client.ts");
  assert.match(source, /sha256:\[0-9a-f\]\{64\}/);
  assert.match(source, /actual !== expectedContentVersion/);
  assert.doesNotMatch(source, /(AssetManager|RenderNode|local filesystem)/);
});

test("M12 does not introduce forbidden generic storage or Content framework packages", async () => {
  const monorepo = await json("package.json");
  assert.deepEqual(monorepo.workspaces, ["packages/*", "apps/*"]);
  const packageLock = await json("package-lock.json");
  assert.ok(packageLock.packages["packages/fsdb"]);
  for (const forbidden of ["content-core", "asset-manager", "storage-provider", "installation-registry"]) {
    assert.equal(Object.keys(packageLock.packages).some((key) => key.toLowerCase().includes(forbidden)), false);
  }
});
