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
import { inspectRendererRenderForQualification } from "../../../packages/renderer/dist/internal/render-qualification.js";
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

test("real M11 Main → Desktop → Hostra Render vertical converges and rebaselines", { timeout: 25_000 }, async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "loomrealm-m11-vertical-"));
  t.after(async () => {
    const { rm } = await import("node:fs/promises");
    await rm(root, { recursive: true, force: true });
  });
  const updatePath = path.join(root, "update.signal");
  const closePath = path.join(root, "close.signal");
  const finishPath = path.join(root, "finish.signal");
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
    import { readFile } from "node:fs/promises";
    const paths = ${JSON.stringify({ updatePath, closePath, finishPath })};
    const wait = async (file) => {
      for (;;) {
        try { await readFile(file); return; } catch {}
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
    };
    const makeState = (phase) => ({
      zIndex: 7,
      roots: [{ key: "hero", tag: "sprite", attrs: { phase }, data: { hp: 10 }, children: [] }],
    });
    export default (scope) => {
      const domain = scope.createRenderDomain(makeState("initial"));
      return {
        async frame() {
          await wait(paths.updatePath);
          domain.replace(makeState("updated"));
          domain.emit({ targetKey: "hero", name: "pulse", data: { step: 1 } });
          await wait(paths.closePath);
          domain.close();
          await wait(paths.finishPath);
          return { type: "completed", value: { rendered: true } };
        }
      };
    };
  `);
  const prepared = await prepareHostraGame({ source: { installationRoot: root }, runnerPolicy });

  let candidateId = 0;
  const broker = new DesktopDataConnectionBroker({ candidateId: () => `m11-vertical-${++candidateId}` });
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
      const binding = Object.freeze({
        async acquire(subsystemKey, generation, dataProfile, acquireSignal) {
          const carrier = await concreteBinding.acquire(subsystemKey, generation, dataProfile, acquireSignal);
          acquiredCarriers.push(carrier);
          return carrier;
        },
      });
      const holder = createRendererControlHolder(binding);
      const host = { holder, outcome: null, failure: null };
      void holder.connect({ carrier: pair.right, rendererControlToken: token }).then(
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
  t.after(() => controller.abort(new Error("M11 vertical cleanup")));
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
  const inspect = () => inspectRendererRenderForQualification(rendererHosts[0].holder, "root");
  await waitFor(() => inspect()?.domains[0]?.baselined === true, "initial Render baseline");
  let view = inspect();
  assert.equal(view.domains[0].revision, 1);
  assert.equal(view.domains[0].roots[0].attrs.phase, "initial");

  await writeFile(updatePath, "update");
  await waitFor(() => inspect()?.domains[0]?.roots[0]?.attrs.phase === "updated", "authoritative Render update");
  await waitFor(() => inspect()?.events.length === 1, "dependent Render Event");
  view = inspect();
  assert.equal(view.domains[0].revision, 2);
  assert.equal(view.events[0].targetKey, "hero");

  await acquiredCarriers[0].close();
  await waitFor(() => acquiredCarriers.length === 2, "fresh same-generation Data carrier");
  await waitFor(() => {
    const current = inspect();
    return current?.currentCarrier === true && current.registrySeen && current.domains[0]?.baselined;
  }, "fresh Registry and Snapshot baseline");
  view = inspect();
  assert.equal(view.domains[0].revision, 1);
  assert.equal(view.domains[0].roots[0].attrs.phase, "updated");
  assert.equal(view.events.length, 0, "Event must not replay across carrier replacement");

  await writeFile(closePath, "close");
  await waitFor(() => inspect()?.registrySeen === true && inspect()?.domains.length === 0, "Render Domain removal");
  await writeFile(finishPath, "finish");
  await waitFor(() => mainOutcome !== null || mainFailure !== null, "Main completion");
  assert.equal(mainFailure, null);
  assert.deepEqual(mainOutcome, {
    kind: "root-outcome",
    outcome: { type: "completed", value: { rendered: true } },
  });
});
