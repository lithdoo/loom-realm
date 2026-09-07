import { randomBytes } from "node:crypto";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryCarrierPair } from "@loomrealm/foundation/testing";
import { createHostraRuntimeHosting, prepareHostraGame } from "@loomrealm/game-launcher-hostra";
import { runMain } from "@loomrealm/main";
import { createRendererControlHolder } from "@loomrealm/renderer";
import { DesktopDataConnectionBroker } from "../dist/index.js";

const runnerPolicy = Object.freeze({
  helloDeadlineMs: 5_000,
  frameDeadlineMs: 5_000,
  terminalCleanupDeadlineMs: 100,
  terminationGraceMs: 100,
});
const mainPolicy = Object.freeze({
  runtimeBootstrapDeadlineMs: 5_000,
  frameDeadlineMs: 5_000,
  shutdownDeadlineMs: 5_000,
  terminationDeadlineMs: 1_000,
});
const scheduler = Object.freeze({
  schedule(delayMs, callback) {
    const timer = setTimeout(callback, delayMs);
    return () => clearTimeout(timer);
  },
});

async function waitFor(predicate, message, timeout = 10_000) {
  const deadline = Date.now() + timeout;
  while (!(await predicate())) {
    if (Date.now() >= deadline) throw new Error(`Timed out waiting for ${message}`);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

test("real M10 Main → Desktop → Hostra vertical rebaselines business input after Data reconnect", { timeout: 20_000 }, async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "loomrealm-m10-vertical-"));
  t.after(async () => {
    const { rm } = await import("node:fs/promises");
    await rm(root, { recursive: true, force: true });
  });
  const observedPath = path.join(root, "observed.jsonl");
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
  await writeFile(path.join(root, "subsystems", "root.mjs"), `
    import { appendFile } from "node:fs/promises";
    const observedPath = ${JSON.stringify(observedPath)};
    export default (scope) => ({
      async frame(frame) {
        let count = 0;
        let finish;
        const done = new Promise((resolve) => { finish = resolve; });
        const listener = scope.createInputListener({
          frame,
          channels: ["keyboard.state", "keyboard.event"],
        });
        listener.on("keyboard.state", async (value) => {
          count += 1;
          await appendFile(observedPath, JSON.stringify({ type: "state", down: value.down }) + "\\n");
          if (count === 2) finish();
        });
        listener.on("keyboard.event", async () => {
          await appendFile(observedPath, JSON.stringify({ type: "event" }) + "\\n");
        });
        await done;
        listener.close();
        return { type: "completed", value: { baselines: count } };
      }
    });
  `);
  const prepared = await prepareHostraGame({
    source: { installationRoot: root },
    runnerPolicy,
  });

  let candidateId = 0;
  const broker = new DesktopDataConnectionBroker({
    candidateId: () => `m10-vertical-${++candidateId}`,
  });
  t.after(() => broker.close());
  const acquiredCarriers = [];
  const rendererHosts = [];
  let sourceStarts = 0;
  let sourceStops = 0;
  const source = Object.freeze({
    start(emit) {
      sourceStarts += 1;
      emit({ kind: "state", channel: "keyboard.state", payload: { down: ["KeyA"] } });
      emit({ kind: "availability", channel: "keyboard.state", available: true });
      emit({ kind: "availability", channel: "keyboard.event", available: true });
      return () => { sourceStops += 1; };
    },
  });
  const rendererControl = Object.freeze({
    acquire(token, signal) {
      if (signal.aborted) return Promise.reject(signal.reason);
      if (rendererHosts.length > 0) {
        return new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(signal.reason), { once: true });
        });
      }
      const pair = createMemoryCarrierPair();
      const concreteBinding = broker.rendererDataBinding(token);
      const observedBinding = Object.freeze({
        async acquire(subsystemKey, generation, dataProfile, acquireSignal) {
          const carrier = await concreteBinding.acquire(
            subsystemKey,
            generation,
            dataProfile,
            acquireSignal,
          );
          acquiredCarriers.push(carrier);
          return carrier;
        },
      });
      const holder = createRendererControlHolder(observedBinding, source);
      const host = { holder, outcome: null, failure: null };
      void holder.connect({
        carrier: pair.right,
        rendererControlToken: token,
      }).then(
        (outcome) => { host.outcome = outcome; },
        (failure) => { host.failure = failure; },
      );
      rendererHosts.push(host);
      return Promise.resolve(pair.left);
    },
  });
  const runtimeHosting = createHostraRuntimeHosting({
    launchPlan: prepared.launchPlan,
    onRuntimeDataProvisioner: broker.onRuntimeDataProvisioner,
  });
  const controller = new AbortController();
  t.after(() => controller.abort(new Error("M10 vertical cleanup")));
  let mainOutcome = null;
  let mainFailure = null;
  const result = runMain({
    bootstrap: prepared.logicalBootstrap,
    policy: mainPolicy,
    signal: controller.signal,
    platform: Object.freeze({
      scheduler,
      opaqueMaterial: Object.freeze({ generate: () => randomBytes(32).toString("base64url") }),
      runtimeHosting,
      rendererControl,
      dataConnections: broker.sink,
    }),
  });
  void result.then(
    (outcome) => { mainOutcome = outcome; },
    (failure) => { mainFailure = failure; },
  );

  await waitFor(() => rendererHosts[0]?.outcome !== null, "Renderer Control installation");
  assert.equal(rendererHosts[0].failure, null);
  await waitFor(() => acquiredCarriers.length === 1, "first current Data carrier");
  await waitFor(async () => {
    try {
      return (await readFile(observedPath, "utf8")).trim().split("\n").length >= 1;
    } catch {
      return false;
    }
  }, "first business State baseline");
  assert.equal(sourceStarts, 1);

  await acquiredCarriers[0].close();
  await waitFor(() => acquiredCarriers.length === 2, "fresh same-generation Data carrier");
  await waitFor(async () => {
    try {
      return (await readFile(observedPath, "utf8")).trim().split("\n").length >= 2;
    } catch {
      return false;
    }
  }, "fresh business State baseline after reconnect");

  const observed = (await readFile(observedPath, "utf8"))
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  assert.deepEqual(observed, [
    { type: "state", down: ["KeyA"] },
    { type: "state", down: ["KeyA"] },
  ]);
  assert.equal(sourceStarts, 1);

  await waitFor(() => mainOutcome !== null || mainFailure !== null, "Main completion");
  assert.equal(mainFailure, null);
  assert.deepEqual(mainOutcome, {
    kind: "root-outcome",
    outcome: { type: "completed", value: { baselines: 2 } },
  });
  await waitFor(() => rendererHosts[0].holder.current() === null, "Renderer terminal");
  assert.equal(sourceStops, 1);
});
