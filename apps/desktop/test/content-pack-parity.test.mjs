import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { prepareHostraGame } from "@loomrealm/game-launcher-hostra";
import { serveFsdb } from "@loomrealm/fsdb-http";
import { createDesktopContentService, prepareDesktopContentView } from "../dist/index.js";
import { packFsdbRoot } from "../../../test/fsdb-multi-database/pack-source.mjs";

const runnerPolicy = Object.freeze({ helloDeadlineMs: 5_000, frameDeadlineMs: 5_000, terminalCleanupDeadlineMs: 1_000, terminationGraceMs: 100 });

async function writeStruct(database, body) {
  const table = join(database, "[STRUCT]Config");
  await mkdir(table, { recursive: true });
  await writeFile(join(table, ".info.meta"), "{\"type\":\"object\"}");
  await writeFile(join(table, "common.json"), body);
}

test("source packager and Desktop Content return the same database bytes", async (t) => {
  const parent = await mkdtemp(join(tmpdir(), "desktop-pack-"));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const root = join(parent, "game");
  const subsystems = join(root, "subsystems");
  await mkdir(subsystems, { recursive: true });
  await writeStruct(join(root, "[FSDB]GameData"), "{\"owner\":\"parent\"}");
  await writeStruct(join(root, "[FSDB]GameData", "[FSDB]World"), "{\"owner\":\"world\"}");
  await writeStruct(join(root, "[FSDB]ModData"), "{\"owner\":\"mod\"}");
  await mkdir(join(root, "[FSDB]Empty"));
  const hidden = join(root, "[FSDB]GameData", "[RESOURCE]NotADatabase", "[FSDB]Something");
  await mkdir(hidden, { recursive: true });
  await writeFile(join(root, "[FSDB]GameData", "[RESOURCE]NotADatabase", ".desc.meta"), "hidden");
  await writeFile(join(hidden, "ordinary.txt"), "not-a-database");
  await Promise.all([
    writeFile(join(root, "game.json"), JSON.stringify({ formatVersion: 1, initial: { subsystem: "world", input: null }, subsystems: [{ key: "world" }] })),
    writeFile(join(root, "launch.hostra.json"), JSON.stringify({ formatVersion: 1, subsystems: [{ key: "world", module: "subsystems/world.mjs" }] })),
    writeFile(join(subsystems, "world.mjs"), "export default () => ({ frame() {} });"),
  ]);
  const packed = await packFsdbRoot(root);
  assert.deepEqual([...new Set(packed.map((entry) => entry.databasePath))].sort(), ["GameData", "GameData/World", "ModData"]);
  assert.deepEqual(packed.filter((entry) => entry.databasePath === "GameData").map((entry) => `${entry.kind}:${entry.namespace}:${entry.key}`).sort(), [
    "record:struct.Config:common",
    "resource:resource.NotADatabase:[FSDB]Something/ordinary",
  ]);
  assert.equal(packed.some((entry) => entry.databasePath.includes("Something")), false);
  const http = await serveFsdb({ root });
  t.after(() => http.close());
  for (const entry of packed) {
    const dot = entry.namespace.indexOf(".");
    const kind = entry.namespace.slice(0, dot);
    const table = entry.namespace.slice(dot + 1);
    const database = entry.databasePath.split("/").map(encodeURIComponent).join("/");
    const key = entry.key.split("/").map(encodeURIComponent).join("/");
    const target = new URL(`/fsdb/v1/${database}/$db/${kind}/${encodeURIComponent(table)}/${key}`, http.origin);
    const response = await fetch(target);
    assert.equal(response.status, 200, `${entry.databasePath} ${entry.key}`);
    assert.equal(response.headers.get("content-type"), entry.mime);
    assert.match(response.headers.get("etag") ?? "", /^W\/".+"$/);
    assert.equal(Buffer.from(await response.arrayBuffer()).equals(entry.bytes), true);
    const head = await fetch(target, { method: "HEAD" });
    assert.equal(head.status, 200);
    assert.equal(await head.text(), "");
  }
  const prepared = await prepareHostraGame({ source: { installationRoot: root }, runnerPolicy });
  const view = await prepareDesktopContentView(prepared);
  const service = await createDesktopContentService({ view });
  t.after(() => service.close());
  const access = service.access(service.createGrant({ permissions: ["records", "resources"], expiresAtUnixMs: Date.now() + 60_000 }));
  for (const entry of packed.filter((item) => item.kind === "record" || item.kind === "resource")) {
    const collection = entry.kind === "record" ? "records" : "resources";
    const database = entry.databasePath.split("/").map(encodeURIComponent).join("/");
    const key = entry.key.split("/").map(encodeURIComponent).join("/");
    const target = new URL(`/_lr/v1/games/${encodeURIComponent(access.installationId)}/databases/${database}/$db/${collection}/${encodeURIComponent(entry.namespace)}/${key}`, access.origin);
    const response = await fetch(target, { headers: { Authorization: `Bearer ${access.token}` } });
    assert.equal(response.status, 200, entry.databasePath);
    assert.equal(response.headers.get("content-type"), entry.mime);
    assert.equal(response.headers.get("x-loom-content-version"), entry.contentVersion);
    assert.equal(response.headers.get("etag"), `"${entry.contentVersion}"`);
    assert.equal(Buffer.from(await response.arrayBuffer()).equals(entry.bytes), true);
    const head = await fetch(target, { method: "HEAD", headers: { Authorization: `Bearer ${access.token}` } });
    assert.equal(head.status, 200);
    assert.equal(head.headers.get("x-loom-content-version"), entry.contentVersion);
    assert.equal(await head.text(), "");
  }
});

test("a source database that fails to open does not yield a bundle", async (t) => {
  const parent = await mkdtemp(join(tmpdir(), "desktop-pack-fail-"));
  t.after(() => rm(parent, { recursive: true, force: true }));
  await writeStruct(join(parent, "[FSDB]ModData"), "{\"owner\":\"mod\"}");
  await mkdir(join(parent, "[FSDB]Broken", "[STRUCT]Config"), { recursive: true });
  await writeFile(join(parent, "[FSDB]Broken", "[STRUCT]Config", ".info.meta"), "[]");
  await assert.rejects(packFsdbRoot(parent));
});
