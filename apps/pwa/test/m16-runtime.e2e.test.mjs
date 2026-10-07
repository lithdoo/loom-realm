import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { openProduct, productUrl, waitForDemo } from "./helpers/browser.mjs";

test("a Window without an accepted Service Worker controller never creates a Session", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ serviceWorkers: "block" });
    const page = await context.newPage();
    await page.goto(productUrl, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.documentElement.dataset.loomrealmProduct === "failed", null, { timeout: 10_000 });
    const state = await page.evaluate(() => window.__loomrealmPwa);
    assert.equal(state.sessionEpoch, null);
    assert.equal(state.statuses.length, 0);
    assert.match(state.failure, /Service Worker|controller/i);
  } finally { await browser.close(); }
});

test("M16 runs the real SW -> Session Worker -> nested Runtime Worker vertical", async () => {
  const product = await openProduct();
  try {
    const { page } = product;
    await page.waitForFunction(() => window.__loomrealmPwa.statuses.some((entry) => entry?.type === "loomrealm.pwa.observation" && entry.event?.type === "runtime-created"), null, { timeout: 20_000 });
    // Deliberately block the Window after Main has started. Worker-side Main and
    // Runtime continue and their queued result becomes visible when the stall ends.
    await page.evaluate(() => { const end = performance.now() + 300; while (performance.now() < end) {} });
    await waitForDemo(page);
    const evidence = await page.evaluate(async () => {
      const info = await (await fetch("/_lr/internal/runtime-info", { cache: "no-store" })).json();
      const databases = await indexedDB.databases();
      const opfs = await navigator.storage.getDirectory();
      const product = await opfs.getDirectoryHandle("loomrealm-pwa");
      const installations = await product.getDirectoryHandle("installations");
      const names = [];
      for await (const [name] of installations.entries()) names.push(name);
      return {
        controlled: navigator.serviceWorker.controller !== null,
        info,
        generation: window.__loomrealmPwa.serviceWorkerGeneration,
        epoch: window.__loomrealmPwa.sessionEpoch,
        databases: databases.map(({ name }) => name),
        opfsRoots: names,
        statuses: window.__loomrealmPwa.statuses,
      };
    });
    assert.equal(evidence.controlled, true);
    assert.equal(evidence.info.protocolVersion, 1);
    assert.equal(evidence.info.buildId, "loomrealm-pwa-v1");
    assert.equal(evidence.info.generation, evidence.generation);
    assert.match(evidence.epoch, /^[0-9a-f]{48}$/);
    assert(evidence.databases.includes("loomrealm-pwa-installations-v1"));
    assert(evidence.opfsRoots.length > 0);
    assert(evidence.statuses.some((entry) => entry.status === "prepared"));
    assert(evidence.statuses.some((entry) => entry.status === "main-started"));
  } finally { await product.close(); }
});

test("invalid closed Session and Runner bootstraps fail before business side effects", async () => {
  const product = await openProduct();
  try {
    const outcome = await product.page.evaluate(async () => {
      const worker = new Worker("/session-worker.js", { type: "module" });
      const channel = new MessageChannel();
      return await new Promise((resolve) => {
        const timer = setTimeout(() => resolve({ timeout: true }), 5_000);
        worker.onmessage = (event) => { clearTimeout(timer); worker.terminate(); resolve(event.data); };
        worker.postMessage({ formatVersion: 1, sessionEpoch: "bad", installationId: "bad", expectedServiceWorker: { protocolVersion: 1, buildId: "bad", generation: "bad" }, windowBridgePort: channel.port2, unknown: true }, [channel.port2]);
      });
    });
    assert.equal(outcome.type, "loomrealm.pwa.session-status");
    assert.equal(outcome.status, "failed");
    const runnerOutcome = await product.page.evaluate(async () => {
      const worker = new Worker("/worker-runner.js", { type: "module" });
      const control = new MessageChannel();
      const state = new MessageChannel();
      const provisioning = new MessageChannel();
      return await new Promise((resolve) => {
        const timer = setTimeout(() => resolve({ timeout: true }), 5_000);
        worker.onmessage = (event) => { clearTimeout(timer); worker.terminate(); resolve(event.data); };
        worker.postMessage({
          formatVersion: 1, sessionEpoch: "bad", installationId: "bad",
          expectedServiceWorker: { protocolVersion: 1, buildId: "bad", generation: "bad" },
          subsystemKey: "bad", bootstrapToken: "bad", logicalModule: "bad.mjs",
          runtimeControlPort: control.port2, realmStatePort: state.port2, provisioningPort: provisioning.port2,
          unknown: true,
        }, [control.port2, state.port2, provisioning.port2]);
      });
    });
    assert.deepEqual(runnerOutcome, { type: "loomrealm.pwa.runner-failure", version: 1, phase: "bootstrap-or-runtime" });
  } finally { await product.close(); }
});

test("generation mismatch, PREPARE rejection, module ABI failure, and unexpected Worker failure all fail closed without restart", async () => {
  const product = await openProduct();
  try {
    const outcomes = await product.page.evaluate(async () => {
      const runSession = (installationId, expectedServiceWorker) => new Promise((resolve) => {
        const worker = new Worker("/session-worker.js", { type: "module" });
        const bridge = new MessageChannel();
        const statuses = [];
        bridge.port1.onmessage = (event) => {
          const message = event.data;
          try { message.port?.close(); } catch {}
          bridge.port1.postMessage({ formatVersion: 1, type: "install/result", requestId: message.requestId, sessionEpoch: "isolated-epoch", ok: true });
        };
        worker.onmessage = (event) => {
          statuses.push(event.data);
          if (event.data?.status === "failed" || event.data?.status === "settled") { worker.terminate(); bridge.port1.close(); resolve(statuses); }
        };
        setTimeout(() => { worker.terminate(); bridge.port1.close(); resolve([...statuses, { timeout: true }]); }, 15_000);
        worker.postMessage({ formatVersion: 1, sessionEpoch: "isolated-epoch", installationId, expectedServiceWorker, windowBridgePort: bridge.port2 }, [bridge.port2]);
      });
      const generation = window.__loomrealmPwa.serviceWorkerGeneration;
      const currentInstallation = window.__loomrealmPwa.installationId;
      const expectedServiceWorker = { protocolVersion: 1, buildId: "loomrealm-pwa-v1", generation };
      const mismatch = await runSession(currentInstallation, { ...expectedServiceWorker, generation: `${generation}-stale` });
      const invalidInstall = async (launchManifestText, source) => {
        try {
          const installation = await window.__loomrealmPwa.qualification.install({
            formatVersion: 1,
            gameEntryText: JSON.stringify({ formatVersion: 1, initial: { subsystem: "bad", input: null }, subsystems: [{ key: "bad" }] }),
            launchManifestText,
            content: [],
            executables: [{ logicalModule: "bad.mjs", mime: "text/javascript", body: new Blob([source], { type: "text/javascript" }) }],
          });
          return { status: "installed", installationId: installation.installationId };
        } catch (error) { return { status: error.code ?? error.message }; }
      };
      const keyMismatch = await invalidInstall(JSON.stringify({ formatVersion: 1, subsystems: [{ key: "extra", module: "bad.mjs" }] }), "export default () => ({});");
      const graphFailure = await invalidInstall(JSON.stringify({ formatVersion: 1, subsystems: [{ key: "bad", module: "bad.mjs" }] }), 'import "https://example.test/escape.mjs"; export default () => ({});');
      const abiInstall = await invalidInstall(JSON.stringify({ formatVersion: 1, subsystems: [{ key: "bad", module: "bad.mjs" }] }), "export default 1;");
      const abi = await runSession(abiInstall.installationId, expectedServiceWorker);
      const crashInstall = await invalidInstall(JSON.stringify({ formatVersion: 1, subsystems: [{ key: "bad", module: "bad.mjs" }] }), 'setTimeout(() => { throw new Error("unexpected"); }, 50); export default () => ({ frame: (frame) => new Promise((resolve) => frame.signal.addEventListener("abort", () => resolve({ type: "cancelled" }), { once: true })) });');
      const crash = await runSession(crashInstall.installationId, expectedServiceWorker);
      await window.__loomrealmPwa.qualification.uninstall(abiInstall.installationId);
      await window.__loomrealmPwa.qualification.uninstall(crashInstall.installationId);
      return { mismatch, keyMismatch, graphFailure, abiInstall, abi, crashInstall, crash };
    });
    assert.equal(outcomes.mismatch.at(-1).status, "failed");
    assert.equal(outcomes.mismatch.some((entry) => entry.type === "loomrealm.pwa.observation"), false);
    assert.equal(outcomes.keyMismatch.status, "PLATFORM_BINDING_MISSING");
    assert.equal(outcomes.graphFailure.status, "SUBSYSTEM_MODULE_GRAPH_INVALID");
    assert.equal(outcomes.abiInstall.status, "installed");
    assert.equal(outcomes.abi.at(-1).status, "failed");
    assert.equal(outcomes.abi.filter((entry) => entry.event?.type === "runtime-created").length, 1);
    assert.equal(outcomes.crashInstall.status, "installed");
    assert.equal(outcomes.crash.at(-1).status, "settled");
    assert.equal(outcomes.crash.at(-1).result?.kind, "root-outcome");
    assert.equal(outcomes.crash.at(-1).result?.outcome?.type, "failed");
    assert.equal(outcomes.crash.filter((entry) => entry.event?.type === "runtime-created").length, 1);
  } finally { await product.close(); }
});
