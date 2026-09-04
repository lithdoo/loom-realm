import { randomBytes } from "node:crypto";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
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

async function waitFor(predicate, message, timeout = 5000) {
  const deadline = Date.now() + timeout;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error(`Timed out waiting for ${message}`);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

async function installation(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "loomrealm-m9-vertical-"));
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
  await writeFile(path.join(root, "subsystems", "root.mjs"), `
    export default () => ({
      async frame() {
        await new Promise((resolve) => {
          const timer = setTimeout(resolve, 10_000);
          timer.unref();
        });
        return { type: "completed", value: null };
      }
    });
  `);
  return prepareHostraGame({ source: { installationRoot: root }, runnerPolicy });
}

test("real M9 Main → Desktop Broker → Hostra Runner vertical installs and recovers fresh Data peers", { timeout: 15_000 }, async (t) => {
  const prepared = await installation(t);
  let candidateId = 0;
  const broker = new DesktopDataConnectionBroker({
    candidateId: () => `vertical-${++candidateId}`,
  });
  t.after(() => broker.close());
  const acquiredCarriers = [];
  const rendererHosts = [];
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
      const holder = createRendererControlHolder(observedBinding);
      const host = { token, holder, outcome: null, failure: null };
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
  t.after(() => controller.abort(new Error("vertical cleanup")));
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
  await waitFor(() => rendererHosts.length > 0, "Renderer host");
  await waitFor(
    () => rendererHosts[0].outcome !== null || rendererHosts[0].failure !== null,
    "Renderer Control installation",
  );
  assert.equal(rendererHosts[0].failure, null);
  assert.equal(rendererHosts[0].outcome.kind, "installed");
  await waitFor(() => acquiredCarriers.length === 1, "first real Renderer Data carrier");
  await waitFor(
    () => rendererHosts[0].holder.current()?.snapshot.dataAuthorities.length === 1,
    "Main Data authority",
  );
  const before = rendererHosts[0].holder.current().snapshot;
  assert.deepEqual(before.dataAuthorities, [{
    subsystemKey: "root",
    generation: 1,
    dataProfile: "loomrealm.renderer-data/1",
  }]);

  await acquiredCarriers[0].send(JSON.stringify({ type: "not-a-data-message" }));
  let firstClosed = null;
  void acquiredCarriers[0].closed.then((closed) => { firstClosed = closed; });
  await waitFor(() => firstClosed !== null, "first Data carrier retirement");
  assert.ok(["closed", "lost"].includes(firstClosed.kind));
  await waitFor(() => acquiredCarriers.length === 2, "fresh same-generation Data carrier");
  assert.notEqual(acquiredCarriers[1], acquiredCarriers[0]);
  const after = rendererHosts[0].holder.current().snapshot;
  assert.deepEqual(after.dataAuthorities, before.dataAuthorities);
  assert.equal(after.revision, before.revision);

  controller.abort(new Error("vertical complete"));
  await waitFor(() => mainOutcome !== null || mainFailure !== null, "Main shutdown");
  assert.equal(mainFailure, null);
  assert.deepEqual(mainOutcome, { kind: "shutdown" });
  await waitFor(() => rendererHosts[0].holder.current() === null, "Renderer terminal");
});
