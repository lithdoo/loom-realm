import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installCandidate, recoverReimport } from "../examples/essentials-v21.1-local/scripts/safe-reimport.mjs";
import { verifyReimport } from "../examples/essentials-v21.1-local/scripts/verify-reimport.mjs";

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "rpgmap-reimport-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const exampleRoot = join(root, "example");
  const workRoot = join(root, ".local", "work");
  const candidateRoot = join(workRoot, "staging-example");
  await mkdir(exampleRoot, { recursive: true });
  await mkdir(candidateRoot, { recursive: true });
  const old = join(exampleRoot, "[FSDB]old");
  const candidate = join(candidateRoot, "[FSDB]new");
  await mkdir(old); await writeFile(join(old, "marker"), "old");
  await mkdir(candidate); await writeFile(join(candidate, "marker"), "new");
  const verify = async (rootPath) => {
    const names = (await readdir(rootPath)).filter((name) => name.startsWith("[FSDB]"));
    assert.equal(names.length, 1);
    const marker = await readFile(join(rootPath, names[0], "marker"), "utf8");
    if (marker !== "new") throw new Error("invalid candidate");
  };
  return { candidateRoot, exampleRoot, old, verify, workRoot };
}

test("safe reimport validates staging then installs exactly one candidate", async (t) => {
  const item = await fixture(t);
  await installCandidate(item);
  assert.deepEqual((await readdir(item.exampleRoot)).filter((name) => name.startsWith("[FSDB]")), ["[FSDB]new"]);
  assert.equal(await readFile(join(item.exampleRoot, "[FSDB]new", "marker"), "utf8"), "new");
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
  assert.deepEqual((await readdir(item.exampleRoot)).filter((name) => name.startsWith("[FSDB]")), ["[FSDB]old"]);
});

test("restart recovery restores the only backup when formal root is empty", async (t) => {
  const item = await fixture(t);
  await mkdir(item.workRoot, { recursive: true });
  const backup = join(item.workRoot, "backup.fsdb");
  await rename(item.old, backup);
  await writeFile(join(item.workRoot, "recovery.json"), `${JSON.stringify({ original: item.old, backup, target: join(item.exampleRoot, "[FSDB]new") })}\n`);
  await recoverReimport(item);
  assert.equal(await readFile(join(item.old, "marker"), "utf8"), "old");
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
  await assert.rejects(verifyReimport(root), /MapAction/u);
});
