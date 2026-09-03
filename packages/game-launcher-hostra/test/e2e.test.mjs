import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { MainRuntimeFatalError, runMain } from "@loomrealm/main";
import {
  createHostraRuntimeHosting,
  prepareHostraGame,
} from "../dist/index.js";

const runnerPolicy = Object.freeze({
  helloDeadlineMs: 5_000,
  frameDeadlineMs: 5_000,
  terminalCleanupDeadlineMs: 1_000,
  terminationGraceMs: 100,
});
const mainPolicy = Object.freeze({
  runtimeBootstrapDeadlineMs: 5_000,
  frameDeadlineMs: 5_000,
  shutdownDeadlineMs: 5_000,
  terminationDeadlineMs: 2_000,
});

const scheduler = Object.freeze({
  schedule(delayMs, callback) {
    const timer = setTimeout(callback, delayMs);
    return () => clearTimeout(timer);
  },
});

function mainPlatform(prepared) {
  return Object.freeze({
    scheduler,
    bootstrapTokens: Object.freeze({ generate: () => randomBytes(32).toString("base64url") }),
    runtimeHosting: createHostraRuntimeHosting({ launchPlan: prepared.launchPlan }),
  });
}

async function singleRuntimeInstallation(t, moduleSource) {
  const root = await mkdtemp(path.join(os.tmpdir(), "loomrealm-e2e-failure-"));
  t.after(async () => {
    const { rm } = await import("node:fs/promises");
    await rm(root, { recursive: true, force: true });
  });
  await mkdir(path.join(root, "subsystems"));
  await writeFile(path.join(root, "game.json"), JSON.stringify({
    formatVersion: 1,
    initial: { subsystem: "root", input: null },
    subsystems: [{ key: "root" }],
  }));
  await writeFile(path.join(root, "launch.hostra.json"), JSON.stringify({
    formatVersion: 1,
    subsystems: [{ key: "root", module: "subsystems/root.mjs" }],
  }));
  await writeFile(path.join(root, "subsystems", "root.mjs"), moduleSource);
  return prepareHostraGame({ source: { installationRoot: root }, runnerPolicy });
}

test("real Main ↔ Hostra Runner vertical preserves the M5 nested Frame outcome", async (t) => {
  assert.ok(runnerPolicy.terminationGraceMs < mainPolicy.terminationDeadlineMs);
  const root = await mkdtemp(path.join(os.tmpdir(), "loomrealm-e2e-"));
  t.after(async () => {
    const { rm } = await import("node:fs/promises");
    await rm(root, { recursive: true, force: true });
  });
  await mkdir(path.join(root, "subsystems"));
  await writeFile(path.join(root, "game.json"), JSON.stringify({
    formatVersion: 1,
    initial: { subsystem: "root", input: { n: 7 } },
    subsystems: [{ key: "root" }, { key: "child" }],
  }));
  await writeFile(path.join(root, "launch.hostra.json"), JSON.stringify({
    formatVersion: 1,
    subsystems: [
      { key: "child", module: "subsystems/child.mjs" },
      { key: "root", module: "subsystems/root.mjs" },
    ],
  }));
  await writeFile(path.join(root, "subsystems", "root.mjs"), `
    export default () => ({
      initialize() {
        if (process.env.LOOMREALM_HOSTRA_RUNNER_BOOTSTRAP !== undefined) {
          throw new Error("bootstrap environment was not scrubbed");
        }
      },
      async frame(frame) {
        const child = await frame.call("child", { value: frame.params });
        return {
          type: "completed",
          value: {
            childType: child.type,
            childValue: child.type === "completed" ? child.value : null
          }
        };
      }
    });
  `);
  await writeFile(path.join(root, "subsystems", "child.mjs"), `
    export default () => ({
      frame(frame) {
        return { type: "completed", value: { echo: frame.params } };
      }
    });
  `);

  const prepared = await prepareHostraGame({
    source: { installationRoot: root },
    runnerPolicy,
  });
  const result = await runMain({
    bootstrap: prepared.logicalBootstrap,
    platform: mainPlatform(prepared),
    policy: mainPolicy,
  });
  assert.deepEqual(result, {
    kind: "root-outcome",
    outcome: {
      type: "completed",
      value: {
        childType: "completed",
        childValue: { echo: { value: { n: 7 } } },
      },
    },
  });
});

test("business module load failure converges through existing Main bootstrap authority", async (t) => {
  const prepared = await singleRuntimeInstallation(t, "export default (");
  await assert.rejects(
    runMain({
      bootstrap: prepared.logicalBootstrap,
      platform: mainPlatform(prepared),
      policy: mainPolicy,
    }),
    (error) => {
      assert.ok(error instanceof MainRuntimeFatalError);
      assert.ok([
        "MAIN_RUNTIME_CONTROL_ACQUIRE_FAILED",
        "MAIN_REQUIRED_RUNTIME_FAILED",
      ].includes(error.failure.code));
      assert.equal(error.failure.subsystemKey, "root");
      return true;
    },
  );
});

test("unexpected Runner code-0 exit after identification reaches Main Runtime authority", async (t) => {
  const prepared = await singleRuntimeInstallation(t, `
    export default () => ({
      initialize() { process.exit(0); },
      frame() { return { type: "completed", value: null }; }
    });
  `);
  await assert.rejects(
    runMain({
      bootstrap: prepared.logicalBootstrap,
      platform: mainPlatform(prepared),
      policy: mainPolicy,
    }),
    (error) => {
      assert.ok(error instanceof MainRuntimeFatalError);
      assert.equal(error.failure.code, "MAIN_REQUIRED_RUNTIME_FAILED");
      assert.equal(error.failure.subsystemKey, "root");
      return true;
    },
  );
});
