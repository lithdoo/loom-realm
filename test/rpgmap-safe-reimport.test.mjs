import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { backupPath, installCandidate } from "../examples/essentials-v21.1-local/scripts/safe-reimport.mjs";
import { verifyReimport } from "../examples/essentials-v21.1-local/scripts/verify-reimport.mjs";

async function fixture(t, { withOld = true } = {}) {
  const root = await mkdtemp(join(tmpdir(), "rpgmap-reimport-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const exampleRoot = join(root, "example");
  const workRoot = join(root, ".local", "work");
  const candidateRoot = join(workRoot, "staging-example");
  await mkdir(exampleRoot, { recursive: true });
  await mkdir(candidateRoot, { recursive: true });
  const old = join(exampleRoot, "[FSDB]old");
  const candidate = join(candidateRoot, "[FSDB]new");
  if (withOld) { await mkdir(old); await writeFile(join(old, "marker"), "old"); }
  await mkdir(candidate); await writeFile(join(candidate, "marker"), "new");
  const userDirectory = join(exampleRoot, "user-content");
  await mkdir(userDirectory); await writeFile(join(userDirectory, "marker"), "keep");
  const verify = async (rootPath) => {
    const names = (await readdir(rootPath)).filter((name) => name.startsWith("[FSDB]"));
    assert.equal(names.length, 1);
    const marker = await readFile(join(rootPath, names[0], "marker"), "utf8");
    if (marker !== "new") throw new Error("invalid candidate");
  };
  return { candidateRoot, exampleRoot, old, userDirectory, verify, workRoot };
}

const formalNames = async (item) => (await readdir(item.exampleRoot)).filter((name) => name.startsWith("[FSDB]"));

test("safe reimport validates staging then installs exactly one replacement candidate", async (t) => {
  const item = await fixture(t);
  await installCandidate(item);
  assert.deepEqual(await formalNames(item), ["[FSDB]new"]);
  assert.equal(await readFile(join(item.exampleRoot, "[FSDB]new", "marker"), "utf8"), "new");
  assert.equal(await readFile(join(item.userDirectory, "marker"), "utf8"), "keep");
});

test("candidate validation failure leaves the previous formal FSDB untouched", async (t) => {
  const item = await fixture(t);
  await assert.rejects(installCandidate({ ...item, verify: async () => { throw new Error("invalid candidate"); } }), /invalid candidate/u);
  assert.equal(await readFile(join(item.old, "marker"), "utf8"), "old");
  assert.deepEqual(await formalNames(item), ["[FSDB]old"]);
});

test("failed post-switch validation restores the previous formal FSDB", async (t) => {
  const item = await fixture(t);
  let calls = 0;
  await assert.rejects(installCandidate({ ...item, verify: async (rootPath) => {
    calls += 1;
    if (calls === 1) return item.verify(rootPath);
    throw new Error("injected post-switch failure");
  } }), /injected post-switch failure/u);
  assert.equal(await readFile(join(item.old, "marker"), "utf8"), "old");
  assert.deepEqual(await formalNames(item), ["[FSDB]old"]);
});

test("failed first-install validation returns to no formal FSDB without inventing a backup", async (t) => {
  const item = await fixture(t, { withOld: false });
  let calls = 0;
  await assert.rejects(installCandidate({ ...item, verify: async (rootPath) => {
    calls += 1;
    if (calls === 1) return item.verify(rootPath);
    throw new Error("injected initial post-switch failure");
  } }), /injected initial post-switch failure/u);
  assert.deepEqual(await formalNames(item), []);
  await assert.rejects(stat(backupPath(item.workRoot)), (error) => error?.code === "ENOENT");
});

test("an unresolved backup is never overwritten or adopted automatically", async (t) => {
  const item = await fixture(t);
  const backup = backupPath(item.workRoot);
  await mkdir(backup, { recursive: true });
  await writeFile(join(backup, "marker"), "unresolved-old");
  await assert.rejects(installCandidate(item), /Unresolved FSDB backup/u);
  assert.equal(await readFile(join(backup, "marker"), "utf8"), "unresolved-old");
  assert.equal(await readFile(join(item.old, "marker"), "utf8"), "old");
  assert.equal(await readFile(join(item.userDirectory, "marker"), "utf8"), "keep");
});

test("formal verification rejects a legacy MapAction table inside the FSDB", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "rpgmap-verify-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const fsdb = join(root, "[FSDB]candidate");
  await mkdir(join(fsdb, "[struct]Map"), { recursive: true });
  await mkdir(join(fsdb, "[struct]MapAction"));
  await mkdir(join(fsdb, "[struct]Tileset"));
  await mkdir(join(fsdb, "[resource]Presentation", "map"), { recursive: true });
  await writeFile(join(fsdb, "[struct]Map", ".info.meta"), "{}\n");
  await writeFile(join(fsdb, "[struct]Map", "1.json"), '{"behaviors":[]}\n');
  await writeFile(join(fsdb, "[struct]Tileset", "1.json"), '{"terrain_tags":[]}\n');
  await writeFile(join(fsdb, "[resource]Presentation", "map", "map.browser.js.js"), "");
  await assert.rejects(verifyReimport(root), /MapAction|generation manifest/u);
});
