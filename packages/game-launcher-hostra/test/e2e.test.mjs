import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { MainRuntimeFatalError, runMain } from "@loomrealm/main";
import { createSharedStateAuthority } from "@loomrealm/shared-state";
import { createSessionEventHub } from "@loomrealm/session-events";
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
  const authority = createSharedStateAuthority(prepared.state);
  let eventsFatal = false;
  const eventFatalListeners = new Set();
  const sessionEventHub = createSessionEventHub({ onFatal() {
    eventsFatal = true;
    for (const listener of eventFatalListeners) queueMicrotask(listener);
  } });
  const sessionEventsFatal = Object.freeze({
    subscribe(listener) {
      eventFatalListeners.add(listener);
      if (eventsFatal) queueMicrotask(listener);
      return () => { eventFatalListeners.delete(listener); };
    },
  });
  return Object.freeze({
    scheduler,
    opaqueMaterial: Object.freeze({ generate: () => randomBytes(32).toString("base64url") }),
    runtimeHosting: createHostraRuntimeHosting({
      launchPlan: prepared.launchPlan,
      sharedStateAuthority: authority,
      sessionEventHub,
    }),
    sessionEventsFatal,
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

test("real Game Package → Hostra → Runner State plane shares one Authority across Subsystems", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "loomshared-state-e2e-"));
  t.after(async () => {
    const { rm } = await import("node:fs/promises");
    await rm(root, { recursive: true, force: true });
  });
  await mkdir(path.join(root, "subsystems"));
  await writeFile(path.join(root, "game.json"), JSON.stringify({
    formatVersion: 1,
    state: { records: [
      { namespace: "world", key: "counter", value: 0 },
      { namespace: "inventory", key: "main", value: [] },
    ] },
    initial: { subsystem: "root", input: null },
    subsystems: [{ key: "root" }, { key: "child" }],
  }));
  await writeFile(path.join(root, "launch.hostra.json"), JSON.stringify({
    formatVersion: 1,
    subsystems: [
      { key: "root", module: "subsystems/root.mjs" },
      { key: "child", module: "subsystems/child.mjs" },
    ],
  }));
  await writeFile(path.join(root, "subsystems", "root.mjs"), `
    export default (scope) => ({
      async frame(frame) {
        const counter = { namespace: "world", key: "counter" };
        const inventory = { namespace: "inventory", key: "main" };
        const events = [];
        let resolveChange;
        const changed = new Promise((resolve) => { resolveChange = resolve; });
        await scope.state.subscribe([counter, inventory], (event) => {
          events.push(event.type);
          if (event.type === "change") resolveChange(event);
        });
        const initial = await scope.state.readInitial([counter, inventory]);
        const committed = await scope.state.commit({
          conditions: [{ key: counter, version: 0 }, { key: inventory, version: 0 }],
          writes: [
            { type: "put", key: inventory, value: ["key"] },
            { type: "put", key: counter, value: 1 }
          ]
        });
        const change = await changed;
        const child = await frame.call("child", null);
        const scan = await scope.state.scan();
        return { type: "completed", value: { initial, committed, change, child, scan, events } };
      }
    });
  `);
  await writeFile(path.join(root, "subsystems", "child.mjs"), `
    export default (scope) => ({
      async frame() {
        const counter = { namespace: "world", key: "counter" };
        let conflict = null;
        try {
          await scope.state.commit({
            conditions: [{ key: counter, version: 0 }],
            writes: [{ type: "put", key: counter, value: 99 }]
          });
        } catch (error) { conflict = error.code; }
        return { type: "completed", value: { conflict, current: await scope.state.read([counter]) } };
      }
    });
  `);
  const prepared = await prepareHostraGame({ source: { installationRoot: root }, runnerPolicy });
  const result = await runMain({ bootstrap: prepared.logicalBootstrap, platform: mainPlatform(prepared), policy: mainPolicy });
  assert.equal(result.kind, "root-outcome");
  const value = result.outcome.value;
  assert.deepEqual(value.events, ["baseline", "change"]);
  assert.deepEqual(value.initial.records.map((record) => record.value), [[], 0]);
  assert.equal(value.committed.revision, 1);
  assert.deepEqual(value.committed.records.map((record) => record.key.namespace), ["inventory", "world"]);
  assert.equal(value.change.revision, 1);
  assert.equal(value.child.value.conflict, "CONFLICT");
  assert.equal(value.child.value.current.records[0].value, 1);
  assert.equal(value.scan.revision, 1);
  assert.deepEqual(value.scan.records.map((record) => record.value), [["key"], 1]);
});

test("real Hostra child processes use a dedicated Session Events WebSocket before Definition import", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "loomrealm-events-e2e-"));
  t.after(async () => {
    const { rm } = await import("node:fs/promises");
    await rm(root, { recursive: true, force: true });
  });
  await mkdir(path.join(root, "subsystems"));
  await writeFile(path.join(root, "game.json"), JSON.stringify({
    formatVersion: 1,
    initial: { subsystem: "root", input: null },
    subsystems: [{ key: "root" }, { key: "child" }],
  }));
  await writeFile(path.join(root, "launch.hostra.json"), JSON.stringify({
    formatVersion: 1,
    subsystems: [
      { key: "root", module: "subsystems/root.mjs" },
      { key: "child", module: "subsystems/child.mjs" },
    ],
  }));
  await writeFile(path.join(root, "subsystems", "root.mjs"), `
    const endpointVisibleAtImport = Object.prototype.hasOwnProperty.call(
      process.env,
      "LOOMREALM_HOSTRA_SESSION_EVENTS_ENDPOINT",
    );
    export default (scope) => ({
      async frame(frame) {
        let resolveEvent;
        const received = new Promise((resolve) => { resolveEvent = resolve; });
        const subscription = await scope.events.subscribe(["battle/main"], resolveEvent);
        const child = await frame.call("child", null);
        const event = await received;
        subscription.close();
        return {
          type: "completed",
          value: { endpointVisibleAtImport, child, event, closed: await subscription.closed }
        };
      }
    });
  `);
  await writeFile(path.join(root, "subsystems", "child.mjs"), `
    export default (scope) => ({
      async frame() {
        await scope.events.publish("battle/main", "enemy-defeated", { enemyId: "slime-1" });
        return { type: "completed", value: "published" };
      }
    });
  `);
  const prepared = await prepareHostraGame({ source: { installationRoot: root }, runnerPolicy });
  const result = await runMain({
    bootstrap: prepared.logicalBootstrap,
    platform: mainPlatform(prepared),
    policy: mainPolicy,
  });
  assert.equal(result.kind, "root-outcome");
  assert.equal(result.outcome.value.endpointVisibleAtImport, false);
  assert.equal(result.outcome.value.child.value, "published");
  assert.deepEqual(result.outcome.value.event, {
    channel: "battle/main",
    type: "enemy-defeated",
    payload: { enemyId: "slime-1" },
    source: { subsystemKey: "child" },
  });
  assert.deepEqual(result.outcome.value.closed, { reason: "closed" });
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
