import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { prepareHostraGame } from "@loomrealm/game-launcher-hostra";
import { createDesktopContentService, prepareDesktopContentView } from "../dist/index.js";

const runnerPolicy = Object.freeze({ helloDeadlineMs: 5_000, frameDeadlineMs: 5_000, terminalCleanupDeadlineMs: 1_000, terminationGraceMs: 100 });

async function writeStruct(database, body) {
  const table = join(database, "[STRUCT]Config");
  await mkdir(table, { recursive: true });
  await writeFile(join(table, ".info.meta"), "{\"type\":\"object\"}");
  await writeFile(join(table, "common.json"), body);
}

async function installation() {
  const parent = await mkdtemp(join(tmpdir(), "desktop-mdb-"));
  const root = join(parent, "game");
  const subsystems = join(root, "subsystems");
  const game = join(root, "[FSDB]GameData");
  const world = join(game, "[FSDB]World");
  const mod = join(root, "[FSDB]ModData");
  const broken = join(root, "[FSDB]Broken");
  await mkdir(subsystems, { recursive: true });
  await writeStruct(game, "{\"owner\":\"parent\"}");
  await writeStruct(world, "{\"owner\":\"world\"}");
  await writeStruct(mod, "{\"owner\":\"mod\"}");
  await mkdir(join(broken, "[STRUCT]Config"), { recursive: true });
  await writeFile(join(broken, "[STRUCT]Config", ".info.meta"), "[]");
  await Promise.all([
    writeFile(join(root, "game.json"), JSON.stringify({ formatVersion: 1, initial: { subsystem: "world", input: null }, subsystems: [{ key: "world" }] })),
    writeFile(join(root, "launch.hostra.json"), JSON.stringify({ formatVersion: 1, subsystems: [{ key: "world", module: "subsystems/world.mjs" }] })),
    writeFile(join(subsystems, "world.mjs"), "export default () => ({ frame() {} });"),
  ]);
  const prepared = await prepareHostraGame({ source: { installationRoot: root }, runnerPolicy });
  return { parent, game, prepared, async cleanup() { await rm(parent, { recursive: true, force: true }); } };
}

function request(access, suffix) {
  return fetch(new URL(`/_lr/v1/games/${encodeURIComponent(access.installationId)}${suffix}`, access.origin), {
    headers: { Authorization: `Bearer ${access.token}` },
  });
}

test("one installation view serves nested databases without merging identities", async (t) => {
  const f = await installation();
  t.after(() => f.cleanup());
  const view = await prepareDesktopContentView(f.prepared);
  const service = await createDesktopContentService({ view });
  t.after(() => service.close());
  const access = service.access(service.createGrant({ permissions: ["manifest", "records"], expiresAtUnixMs: Date.now() + 60_000 }));
  const manifest = await request(access, "/manifest");
  assert.equal(manifest.status, 200);
  const [parent, world, mod] = await Promise.all([
    request(access, "/databases/GameData/$db/records/struct.Config/common"),
    request(access, "/databases/GameData/World/$db/records/struct.Config/common"),
    request(access, "/databases/ModData/$db/records/struct.Config/common"),
  ]);
  assert.deepEqual(await parent.json(), { owner: "parent" });
  assert.deepEqual(await world.json(), { owner: "world" });
  assert.deepEqual(await mod.json(), { owner: "mod" });
  assert.notEqual(parent.headers.get("etag"), world.headers.get("etag"));
  const [again, againToo] = await Promise.all([
    request(access, "/databases/GameData/$db/records/struct.Config/common"),
    request(access, "/databases/GameData/$db/records/struct.Config/common"),
  ]);
  assert.equal(again.headers.get("etag"), againToo.headers.get("etag"));
  assert.equal(again.headers.get("etag"), parent.headers.get("etag"));
  await again.arrayBuffer();
  await againToo.arrayBuffer();
  assert.equal((await request(access, "/databases/Missing/$db/records/struct.Config/common")).status, 404);
  assert.equal((await request(access, "/databases/GameData//$db/records/struct.Config/common")).status, 400);
  assert.equal((await request(access, "/databases/Broken/$db/records/struct.Config/common")).status, 422);
  assert.equal((await request(access, "/databases/ModData/$db/records/struct.Config/common")).status, 200);
  await writeFile(join(f.game, "[STRUCT]Config", ".info.meta"), "{\"type\":\"object\"}");
  await mkdir(join(f.parent, "game", "[FSDB]Missing", "[STRUCT]Config"), { recursive: true });
  await writeFile(join(f.parent, "game", "[FSDB]Missing", "[STRUCT]Config", ".info.meta"), "{\"type\":\"object\"}");
  await writeFile(join(f.parent, "game", "[FSDB]Missing", "[STRUCT]Config", "common.json"), "{\"owner\":\"retry\"}");
  const retried = await request(access, "/databases/Missing/$db/records/struct.Config/common");
  assert.equal(retried.status, 200);
  assert.deepEqual(await retried.json(), { owner: "retry" });
  await writeFile(join(f.game, "[STRUCT]Config", "common.json"), "{\"owner\":\"replaced\"}");
  assert.equal((await request(access, "/databases/GameData/$db/records/struct.Config/common")).status, 503);
  assert.equal((await request(access, "/databases/GameData/$db/records/struct.Config/common")).status, 503);
  const sibling = await request(access, "/databases/ModData/$db/records/struct.Config/common");
  assert.equal(sibling.status, 200);
  assert.deepEqual(await sibling.json(), { owner: "mod" });
});

test("database path failures keep their problem codes and ordinary names stay routable", async (t) => {
  const f = await installation();
  t.after(() => f.cleanup());
  const view = await prepareDesktopContentView(f.prepared);
  const service = await createDesktopContentService({ view });
  t.after(() => service.close());
  const access = service.access(service.createGrant({ permissions: ["records"], expiresAtUnixMs: Date.now() + 60_000 }));
  async function problem(suffix) {
    const response = await request(access, suffix);
    const body = await response.json();
    return { status: response.status, code: body.code, cache: response.headers.get("cache-control"), text: JSON.stringify(body) };
  }
  const cases = [
    ["/databases/CON/$db/records/struct.Config/common", 400, "DATABASE_PATH_INVALID"],
    ["/databases/GameData//$db/records/struct.Config/common", 400, "DATABASE_PATH_INVALID"],
    ["/databases/$db/records/struct.Config/common", 400, "DATABASE_PATH_INVALID"],
    ["/databases/Game%ZZ/$db/records/struct.Config/common", 400, "CONTENT_REQUEST_INVALID"],
    ["/databases/GameData/%24db/records/struct.Config/common", 400, "CONTENT_REQUEST_INVALID"],
    ["/nope", 400, "CONTENT_REQUEST_INVALID"],
    ["/databases/GameData/$db/records/struct.Config/missing", 404, "CONTENT_NOT_FOUND"],
    [`/databases/GameData/$db/records/${encodeURIComponent("CON")}/${encodeURIComponent("icon*")}`, 404, "CONTENT_NOT_FOUND"],
  ];
  for (const [suffix, status, code] of cases) {
    const result = await problem(suffix);
    assert.deepEqual({ status: result.status, code: result.code }, { status, code }, suffix);
    assert.equal(result.cache, "no-store");
    assert.equal(result.text.includes("[FSDB]"), false);
    assert.equal(result.text.includes("\\\\"), false);
  }
});
