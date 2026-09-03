import { access, mkdtemp, mkdir, realpath, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { GamePackageError } from "@loomrealm/game-package";
import {
  HostraLauncherError,
  prepareHostraGame,
} from "../dist/index.js";

const policy = Object.freeze({
  helloDeadlineMs: 1,
  frameDeadlineMs: 1_000,
  terminalCleanupDeadlineMs: 1,
  terminationGraceMs: 1,
});

async function installation(t, bindings = [{ key: "root", module: "subsystems/root.mjs" }]) {
  const root = await mkdtemp(path.join(os.tmpdir(), "loomrealm-hostra-"));
  t.after(async () => {
    const { rm } = await import("node:fs/promises");
    await rm(root, { recursive: true, force: true });
  });
  await mkdir(path.join(root, "subsystems"));
  await writeFile(
    path.join(root, "game.json"),
    JSON.stringify({
      formatVersion: 1,
      initial: { subsystem: "root", input: { value: 1 } },
      subsystems: [{ key: "root" }],
    }),
  );
  await writeFile(
    path.join(root, "launch.hostra.json"),
    JSON.stringify({ formatVersion: 1, subsystems: bindings }),
  );
  await writeFile(path.join(root, "subsystems", "root.mjs"), "export default () => ({ frame() {} });");
  return root;
}

function hostraCode(code) {
  return (error) => {
    assert.ok(error instanceof HostraLauncherError);
    assert.equal(error.code, code);
    return true;
  };
}

test("PREPARE validates, joins, resolves, and deeply freezes the plan", async (t) => {
  const root = await installation(t);
  const prepared = await prepareHostraGame({ source: { installationRoot: root }, runnerPolicy: policy });
  assert.deepEqual(prepared.logicalBootstrap, {
    subsystemKeys: ["root"],
    initial: { subsystemKey: "root", input: { value: 1 } },
  });
  assert.equal(prepared.launchPlan.runtimes[0].logicalModule, "subsystems/root.mjs");
  assert.equal(prepared.launchPlan.canonicalNodeExecutable, await import("node:fs/promises").then(({ realpath }) => realpath(process.execPath)));
  assert.ok(Object.isFrozen(prepared));
  assert.ok(Object.isFrozen(prepared.logicalBootstrap.initial.input));
  assert.ok(Object.isFrozen(prepared.launchPlan.runtimes));
  assert.throws(() => prepared.launchPlan.runtimes.push({}));
  assert.equal("physicalModule" in prepared.logicalBootstrap, false);
});

test("PREPARE rejects closed-manifest violations and exact-set mismatches", async (t) => {
  const root = await installation(t);
  await writeFile(path.join(root, "launch.hostra.json"), JSON.stringify({ formatVersion: 1, subsystems: [], extra: true }));
  await assert.rejects(
    prepareHostraGame({ source: { installationRoot: root }, runnerPolicy: policy }),
    hostraCode("PLATFORM_LAUNCH_MANIFEST_INVALID"),
  );

  await writeFile(path.join(root, "launch.hostra.json"), JSON.stringify({ formatVersion: 1, subsystems: [] }));
  await assert.rejects(
    prepareHostraGame({ source: { installationRoot: root }, runnerPolicy: policy }),
    hostraCode("PLATFORM_BINDING_MISSING"),
  );
});

test("PREPARE preserves common Game Package validation authority", async (t) => {
  const root = await installation(t);
  await writeFile(path.join(root, "game.json"), "{");
  await assert.rejects(
    prepareHostraGame({ source: { installationRoot: root }, runnerPolicy: policy }),
    (error) => error instanceof GamePackageError,
  );
});

test("PREPARE rejects invalid module paths, missing files, and directories", async (t) => {
  const root = await installation(t);
  for (const [module, code] of [
    ["../escape.mjs", "SUBSYSTEM_MODULE_INVALID"],
    ["subsystems\\root.mjs", "SUBSYSTEM_MODULE_INVALID"],
    ["subsystems/missing.mjs", "SUBSYSTEM_MODULE_NOT_FOUND"],
  ]) {
    await writeFile(path.join(root, "launch.hostra.json"), JSON.stringify({ formatVersion: 1, subsystems: [{ key: "root", module }] }));
    await assert.rejects(
      prepareHostraGame({ source: { installationRoot: root }, runnerPolicy: policy }),
      hostraCode(code),
    );
  }
  await mkdir(path.join(root, "subsystems", "directory.mjs"));
  await writeFile(path.join(root, "launch.hostra.json"), JSON.stringify({ formatVersion: 1, subsystems: [{ key: "root", module: "subsystems/directory.mjs" }] }));
  await assert.rejects(
    prepareHostraGame({ source: { installationRoot: root }, runnerPolicy: policy }),
    hostraCode("SUBSYSTEM_MODULE_NOT_FOUND"),
  );
});

test("PREPARE rejects a symlink that escapes the canonical installation", async (t) => {
  const root = await installation(t);
  const outside = await mkdtemp(path.join(os.tmpdir(), "loomrealm-outside-"));
  t.after(async () => {
    const { rm } = await import("node:fs/promises");
    await rm(outside, { recursive: true, force: true });
  });
  const target = path.join(outside, "outside.mjs");
  await writeFile(target, "export default () => ({ frame() {} });");
  const link = path.join(root, "subsystems", "escape.mjs");
  try {
    await symlink(target, link, "file");
  } catch (error) {
    if (process.platform === "win32" && error?.code === "EPERM") {
      t.skip("symlink privilege is unavailable");
      return;
    }
    throw error;
  }
  await writeFile(path.join(root, "launch.hostra.json"), JSON.stringify({ formatVersion: 1, subsystems: [{ key: "root", module: "subsystems/escape.mjs" }] }));
  await assert.rejects(
    prepareHostraGame({ source: { installationRoot: root }, runnerPolicy: policy }),
    hostraCode("SUBSYSTEM_MODULE_OUTSIDE_INSTALLATION"),
  );
});

test("PREPARE rejects a directory symlink or Windows junction escape", async (t) => {
  const root = await installation(t);
  const outside = await mkdtemp(path.join(os.tmpdir(), "loomrealm-junction-outside-"));
  t.after(async () => {
    const { rm } = await import("node:fs/promises");
    await rm(outside, { recursive: true, force: true });
  });
  await writeFile(path.join(outside, "outside.mjs"), "export default () => ({ frame() {} });");
  const link = path.join(root, "subsystems", "linked");
  await symlink(outside, link, process.platform === "win32" ? "junction" : "dir");
  await writeFile(path.join(root, "launch.hostra.json"), JSON.stringify({
    formatVersion: 1,
    subsystems: [{ key: "root", module: "subsystems/linked/outside.mjs" }],
  }));
  await assert.rejects(
    prepareHostraGame({ source: { installationRoot: root }, runnerPolicy: policy }),
    hostraCode("SUBSYSTEM_MODULE_OUTSIDE_INSTALLATION"),
  );
});

for (const targetExtension of [".js", ".cjs", ".mjs"]) {
  test(`PREPARE ${targetExtension === ".mjs" ? "accepts" : "rejects"} an in-installation .mjs symlink to ${targetExtension}`, async (t) => {
    const root = await installation(t);
    const target = path.join(root, "subsystems", `canonical${targetExtension}`);
    const alias = path.join(root, "subsystems", "alias.mjs");
    await writeFile(target, "export default () => ({ frame() { return { type: 'completed', value: null }; } });");
    try {
      await symlink(target, alias, "file");
    } catch (error) {
      if (process.platform === "win32" && error?.code === "EPERM") {
        t.skip("symlink privilege is unavailable");
        return;
      }
      throw error;
    }
    await writeFile(path.join(root, "launch.hostra.json"), JSON.stringify({
      formatVersion: 1,
      subsystems: [{ key: "root", module: "subsystems/alias.mjs" }],
    }));
    const preparing = prepareHostraGame({
      source: { installationRoot: root },
      runnerPolicy: policy,
    });
    if (targetExtension === ".mjs") {
      const prepared = await preparing;
      assert.equal(prepared.launchPlan.runtimes[0].physicalModule, await realpath(target));
    } else {
      await assert.rejects(preparing, hostraCode("SUBSYSTEM_MODULE_INVALID"));
    }
  });
}

test("PREPARE validates the exact Runner policy domain before filesystem work", async () => {
  for (const invalid of [
    { ...policy, helloDeadlineMs: 0 },
    { ...policy, frameDeadlineMs: 999 },
    { ...policy, frameDeadlineMs: 300_001 },
    { ...policy, terminalCleanupDeadlineMs: 300_001 },
    { ...policy, terminationGraceMs: 2_147_483_648 },
  ]) {
    await assert.rejects(
      prepareHostraGame({ source: { installationRoot: "does-not-exist" }, runnerPolicy: invalid }),
      TypeError,
    );
  }
});

test("successful PREPARE does not import business code or spawn the Runner", async (t) => {
  const root = await installation(t);
  const sentinel = path.join(root, "business-imported");
  await writeFile(path.join(root, "subsystems", "root.mjs"), `
    import { writeFileSync } from "node:fs";
    writeFileSync(${JSON.stringify(sentinel)}, "unexpected import");
    export default () => ({ frame() { return { type: "completed", value: null }; } });
  `);
  await prepareHostraGame({ source: { installationRoot: root }, runnerPolicy: policy });
  await assert.rejects(access(sentinel), (error) => error?.code === "ENOENT");
});
