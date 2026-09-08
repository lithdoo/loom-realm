import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  describeFsdb,
  getFsdbSnapshotId,
  listFsdbEntries,
  openFsdb,
  openFsdbObject,
} from "../dist/index.js";

async function fixture() {
  const parent = await mkdtemp(join(tmpdir(), "fsdb-core-"));
  const root = join(parent, "[FSDB]游戏数据");
  const struct = join(root, "[struct]角色");
  const resource = join(root, "[resource]图片", "图标");
  await Promise.all([mkdir(struct, { recursive: true }), mkdir(resource, { recursive: true })]);
  await Promise.all([
    writeFile(join(struct, ".info.meta"), '{"type":"object"}'),
    writeFile(join(struct, "皮卡丘.json"), '{"name":"皮卡丘"}'),
    writeFile(join(root, "[resource]图片", ".desc.meta"), "图片说明"),
    writeFile(join(resource, "药水.png"), Buffer.from([0, 1, 2, 255])),
  ]);
  return { parent, root, struct, async cleanup() { await rm(parent, { recursive: true, force: true }); } };
}

async function bytes(stream) {
  const chunks = [];
  stream.on("data", (chunk) => chunks.push(chunk));
  await once(stream, "end");
  return Buffer.concat(chunks);
}

test("core exposes a detached deterministic descriptor and fresh snapshot identity", async () => {
  const f = await fixture();
  try {
    const first = await openFsdb({ root: f.root });
    const second = await openFsdb({ root: f.root });
    const descriptor = describeFsdb(first);
    assert.deepEqual(JSON.parse(Buffer.from(descriptor)), {
      name: "游戏数据",
      tables: [{ kind: "resource", name: "图片" }, { kind: "struct", name: "角色" }],
    });
    descriptor.fill(0);
    assert.notEqual(describeFsdb(first)[0], 0);
    assert.match(getFsdbSnapshotId(first), /^[A-Za-z0-9_-]{22}$/);
    assert.notEqual(getFsdbSnapshotId(first), getFsdbSnapshotId(second));
    await Promise.all([first.close(), second.close()]);
  } finally { await f.cleanup(); }
});

test("ordinary entries and metadata use one immutable logical snapshot", async () => {
  const f = await fixture();
  try {
    const db = await openFsdb({ root: f.root });
    const entries = listFsdbEntries(db);
    assert.equal(entries.length, 2);
    assert.ok(Object.isFrozen(entries));
    assert.ok(entries.every((entry) => Object.isFrozen(entry) && Object.isFrozen(entry.identity)));
    const entry = entries.find((candidate) => candidate.identity.kind === "struct");
    const controller = new AbortController();
    const lease = await openFsdbObject(db, entry.identity, controller.signal);
    assert.deepEqual(JSON.parse(await bytes(lease.stream)), { name: "皮卡丘" });
    await lease.close();
    await lease.close();
    const metadata = await openFsdbObject(db, {
      type: "metadata", kind: "struct", table: "角色", metadata: "$info",
    }, controller.signal);
    assert.deepEqual(JSON.parse(await bytes(metadata.stream)), { type: "object" });
    await metadata.close();
    assert.equal(await openFsdbObject(db, {
      type: "metadata", kind: "struct", table: "角色", metadata: "$desc",
    }, controller.signal), null);
    await db.close();
  } finally { await f.cleanup(); }
});

test("validation, abort, source drift, and close drain fail closed", async () => {
  const f = await fixture();
  try {
    const db = await openFsdb({ root: f.root });
    assert.throws(() => getFsdbSnapshotId({}), TypeError);
    await assert.rejects(openFsdbObject(db, {
      type: "entry", kind: "struct", table: "../角色", key: "皮卡丘",
    }, new AbortController().signal), TypeError);
    const aborted = new AbortController();
    aborted.abort();
    await assert.rejects(openFsdbObject(db, {
      type: "entry", kind: "struct", table: "角色", key: "皮卡丘",
    }, aborted.signal), (error) => error?.name === "AbortError");

    const lease = await openFsdbObject(db, {
      type: "entry", kind: "struct", table: "角色", key: "皮卡丘",
    }, new AbortController().signal);
    let closed = false;
    const closing = db.close().then(() => { closed = true; });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(closed, false);
    await lease.close();
    await closing;
    assert.equal(db.state, "closed");
  } finally { await f.cleanup(); }

  const staleFixture = await fixture();
  try {
    const db = await openFsdb({ root: staleFixture.root });
    await writeFile(join(staleFixture.struct, "皮卡丘.json"), '{"changed":true}');
    await assert.rejects(openFsdbObject(db, {
      type: "entry", kind: "struct", table: "角色", key: "皮卡丘",
    }, new AbortController().signal));
    assert.equal(db.state, "stale");
    await db.close();
  } finally { await staleFixture.cleanup(); }
});
