import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, mkdir, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import {
  FsdbResolutionError,
  describeFsdb,
  getFsdbSnapshotId,
  listFsdbEntries,
  listFsdbPaths,
  openFsdb,
  openFsdbObject,
} from "../dist/index.js";
import { canonicalName, contentLogicalSegment } from "../dist/names.js";

async function tree() {
  const parent = await mkdtemp(join(tmpdir(), "fsdb-multi-"));
  const root = join(parent, "Game");
  const game = join(root, "[FSDB]GameData");
  const world = join(game, "[FSDB]World");
  const character = join(game, "[FSDB]Character");
  const mod = join(root, "[FSDB]ModData");
  const empty = join(root, "[FSDB]Empty");
  const fake = join(game, "[RESOURCE]NotADatabase", "[FSDB]Something");
  await Promise.all([
    mkdir(join(game, "[STRUCT]Config"), { recursive: true }),
    mkdir(join(world, "[STRUCT]Config"), { recursive: true }),
    mkdir(join(character, "[STRUCT]Config"), { recursive: true }),
    mkdir(join(mod, "[STRUCT]Config"), { recursive: true }),
    mkdir(join(mod, "[GROUP]Party"), { recursive: true }),
    mkdir(join(game, "[RESOURCE]Shared"), { recursive: true }),
    mkdir(empty, { recursive: true }),
    mkdir(fake, { recursive: true }),
  ]);
  await Promise.all([
    writeFile(join(game, "[STRUCT]Config", ".info.meta"), '{"type":"object"}'),
    writeFile(join(game, "[STRUCT]Config", "common.json"), '{"owner":"game"}'),
    writeFile(join(world, "[STRUCT]Config", ".info.meta"), '{"type":"object"}'),
    writeFile(join(world, "[STRUCT]Config", "common.json"), '{"owner":"world"}'),
    writeFile(join(character, "[STRUCT]Config", ".info.meta"), '{"type":"object"}'),
    writeFile(join(character, "[STRUCT]Config", "common.json"), '{"owner":"character"}'),
    writeFile(join(mod, "[STRUCT]Config", ".info.meta"), '{"type":"object"}'),
    writeFile(join(mod, "[STRUCT]Config", "common.json"), '{"owner":"mod"}'),
    writeFile(join(mod, "[GROUP]Party", ".info.meta"), '{"type":"object"}'),
    writeFile(join(mod, "[GROUP]Party", ".desc.meta"), "party"),
    writeFile(join(mod, "[GROUP]Party", "common.jsonl"), '{"owner":"mod-group"}\n'),
    writeFile(join(game, "[RESOURCE]Shared", ".desc.meta"), "shared"),
    writeFile(join(game, "[RESOURCE]Shared", "logo.txt"), "game-logo"),
    writeFile(join(game, "[RESOURCE]NotADatabase", ".desc.meta"), "not a database"),
    writeFile(join(fake, "ordinary.txt"), "not-a-database"),
  ]);
  return { parent, root, game, world, async cleanup() { await rm(parent, { recursive: true, force: true }); } };
}

async function bytes(stream) {
  const chunks = [];
  stream.on("data", (chunk) => chunks.push(chunk));
  await once(stream, "end");
  return Buffer.concat(chunks);
}

async function readCommon(root, path) {
  const db = await openFsdb({ root, path });
  try {
    const lease = await openFsdbObject(db, {
      type: "entry", kind: "struct", table: "Config", key: "common",
    }, new AbortController().signal);
    const body = JSON.parse(await bytes(lease.stream));
    await lease.close();
    return { body, snapshot: getFsdbSnapshotId(db), name: db.name, state: db.state, db };
  } catch (error) {
    await db.close();
    throw error;
  }
}

test("content logical segments do not inherit FSDB filename limits", () => {
  assert.equal(contentLogicalSegment("icon*"), "icon*");
  assert.equal(contentLogicalSegment("CON"), "CON");
  assert.equal(contentLogicalSegment("$meta"), "$meta");
  assert.throws(() => canonicalName("icon*"));
  assert.throws(() => canonicalName("CON"));
  assert.throws(() => canonicalName("$meta"));
  assert.throws(() => contentLogicalSegment(".."));
  assert.throws(() => contentLogicalSegment("a/b"));
  assert.throws(() => contentLogicalSegment("C:drive"));
});

test("discovery lists nested databases and ignores resource pseudo databases", async () => {
  const f = await tree();
  try {
    assert.deepEqual(await listFsdbPaths({ root: f.root }), [
      "Empty",
      "GameData",
      "GameData/Character",
      "GameData/World",
      "ModData",
    ]);
    await assert.rejects(listFsdbPaths({ root: join(f.root, "missing") }), (error) => error instanceof FsdbResolutionError && error.code === "DATABASE_NOT_FOUND");
    await assert.rejects(listFsdbPaths({}), TypeError);
  } finally { await f.cleanup(); }
});

test("openFsdb requires one logical database and does not scan other databases", async () => {
  const f = await tree();
  try {
    await assert.rejects(openFsdb({ root: f.root }), TypeError);
    for (const path of ["", "/GameData", "GameData/", "GameData//World", "GameData/../World", "GameData\\World", ".", ".."]) {
      await assert.rejects(openFsdb({ root: f.root, path }), (error) => error instanceof FsdbResolutionError && error.code === "DATABASE_PATH_INVALID");
    }
    await assert.rejects(openFsdb({ root: f.root, path: "Missing" }), (error) => error.code === "DATABASE_NOT_FOUND");

    const parent = await openFsdb({ root: f.root, path: "GameData" });
    const child = await openFsdb({ root: f.root, path: "GameData/World" });
    try {
      assert.deepEqual(JSON.parse(Buffer.from(describeFsdb(parent))).tables, [
        { kind: "resource", name: "NotADatabase" },
        { kind: "resource", name: "Shared" },
        { kind: "struct", name: "Config" },
      ]);
      assert.equal(listFsdbEntries(parent).some((entry) => entry.identity.table === "OnlyChild"), false);
      assert.equal(await openFsdbObject(parent, {
        type: "entry", kind: "struct", table: "Config", key: "common",
      }, new AbortController().signal).then(async (lease) => {
        const body = JSON.parse(await bytes(lease.stream));
        await lease.close();
        return body.owner;
      }), "game");
      assert.equal(await openFsdbObject(parent, {
        type: "entry", kind: "struct", table: "WorldOnly", key: "common",
      }, new AbortController().signal), null);
      assert.deepEqual(JSON.parse(Buffer.from(describeFsdb(child))).tables, [{ kind: "struct", name: "Config" }]);
      assert.notEqual(getFsdbSnapshotId(parent), getFsdbSnapshotId(child));
      const empty = await openFsdb({ root: f.root, path: "Empty" });
      try {
        assert.deepEqual(JSON.parse(Buffer.from(describeFsdb(empty))), { name: "Empty", tables: [] });
        assert.equal(listFsdbEntries(empty).length, 0);
      } finally { await empty.close(); }
    } finally {
      await parent.close();
      assert.equal(child.state, "open");
      await child.close();
    }
  } finally { await f.cleanup(); }
});

test("same local identity stays independent across databases, including stale and close", async () => {
  const f = await tree();
  try {
    const opened = [];
    for (const path of ["GameData", "GameData/World", "GameData/Character", "ModData"]) {
      const result = await readCommon(f.root, path);
      opened.push(result);
      assert.equal(result.body.owner, path === "GameData" ? "game" : path.endsWith("World") ? "world" : path.endsWith("Character") ? "character" : "mod");
    }
    assert.equal(new Set(opened.map((item) => item.snapshot)).size, opened.length);
    await writeFile(join(f.world, "[STRUCT]Config", "common.json"), '{"owner":"changed"}');
    await assert.rejects(openFsdbObject(opened[1].db, {
      type: "entry", kind: "struct", table: "Config", key: "common",
    }, new AbortController().signal));
    assert.equal(opened[1].db.state, "stale");
    assert.equal(opened[0].db.state, "open");
    const still = await openFsdbObject(opened[0].db, {
      type: "entry", kind: "struct", table: "Config", key: "common",
    }, new AbortController().signal);
    assert.equal(JSON.parse(await bytes(still.stream)).owner, "game");
    await still.close();
    await opened[1].db.close();
    assert.equal(opened[0].db.state, "open");
    await Promise.all(opened.map((item) => item.db.close()));
  } finally { await f.cleanup(); }
});

test("database names are case-sensitive and duplicate markers are ambiguous", async (t) => {
  const parent = await mkdtemp(join(tmpdir(), "fsdb-case-"));
  const root = join(parent, "container");
  try {
    await mkdir(join(root, "[FSDB]GameData"), { recursive: true });
    try { await mkdir(join(root, "[fsdb]gamedata")); }
    catch (error) {
      if (error.code === "EEXIST") { t.skip("Filesystem does not preserve database-name case"); return; }
      throw error;
    }
    const names = await readdir(root);
    if (!names.includes("[FSDB]GameData") || !names.includes("[fsdb]gamedata")) {
      t.skip("Filesystem does not preserve database-name case");
      return;
    }
    const paths = await listFsdbPaths({ root });
    assert.deepEqual(paths, ["GameData", "gamedata"]);
    const selected = await openFsdb({ root, path: "GameData" });
    assert.equal(selected.name, "GameData");
    await selected.close();
    try { await mkdir(join(root, "[fsdb]GameData")); }
    catch (error) {
      if (error.code === "EEXIST") return;
      throw error;
    }
    const collided = await readdir(root);
    if (collided.includes("[FSDB]GameData") && collided.includes("[fsdb]GameData")) {
      await assert.rejects(listFsdbPaths({ root }), (error) => error.code === "DATABASE_PATH_AMBIGUOUS");
      await assert.rejects(openFsdb({ root, path: "GameData" }), (error) => error.code === "DATABASE_PATH_AMBIGUOUS");
    }
  } finally { await rm(parent, { recursive: true, force: true }); }
});

test("NFC database names canonicalize and symlinked databases are rejected", async (t) => {
  const parent = await mkdtemp(join(tmpdir(), "fsdb-nfc-"));
  const root = join(parent, "container");
  const nfc = "é";
  const nfd = "e\u0301";
  try {
    await mkdir(join(root, `[FSDB]${nfd}`), { recursive: true });
    assert.deepEqual(await listFsdbPaths({ root }), [nfc]);
    const db = await openFsdb({ root, path: nfc });
    assert.equal(db.name, nfc);
    await db.close();
    await mkdir(join(root, `[FSDB]${nfc}`)).then(async () => {
      const names = await readdir(root);
      if (names.length > 1) {
        await assert.rejects(listFsdbPaths({ root }), (error) => error.code === "DATABASE_PATH_AMBIGUOUS");
      }
    }, () => undefined);

    const real = join(root, "[FSDB]Real");
    await mkdir(real);
    const link = join(root, "[FSDB]Link");
    try { await symlink(real, link, process.platform === "win32" ? "junction" : "dir"); }
    catch (error) {
      if (error.code === "EPERM") return;
      throw error;
    }
    await assert.rejects(openFsdb({ root, path: "Link" }), (error) => error.code === "DATABASE_PATH_AMBIGUOUS");
    const outside = join(dirname(root), "container-link");
    await symlink(root, outside, process.platform === "win32" ? "junction" : "dir");
    const viaLink = await openFsdb({ root: outside, path: "Real" });
    assert.equal(viaLink.name, "Real");
    await viaLink.close();
  } finally { await rm(parent, { recursive: true, force: true }); }
});

test("a malformed sibling does not block opening a valid database", async () => {
  const f = await tree();
  try {
    await writeFile(join(f.world, "[STRUCT]Config", "common.json"), "[]");
    await assert.rejects(openFsdb({ root: f.root, path: "GameData/World" }), (error) => error.code === "DATABASE_INVALID");
    const sibling = await openFsdb({ root: f.root, path: "ModData" });
    try {
      const lease = await openFsdbObject(sibling, {
        type: "entry", kind: "group", table: "Party", key: "common",
      }, new AbortController().signal);
      try { assert.equal((await bytes(lease.stream)).toString("utf8"), '{"owner":"mod-group"}\n'); }
      finally { await lease.close(); }
    } finally { await sibling.close(); }
    const parent = await openFsdb({ root: f.root, path: "GameData" });
    await parent.close();
  } finally { await f.cleanup(); }
});
