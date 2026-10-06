import test from "node:test";
import assert from "node:assert/strict";
import { openProduct, waitForDemo } from "./helpers/browser.mjs";

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
    assert.equal(evidence.info.version, 1);
    assert.equal(evidence.info.generation, evidence.generation);
    assert.match(evidence.epoch, /^[0-9a-f]{48}$/);
    assert(evidence.databases.includes("loomrealm-pwa-installations-v1"));
    assert(evidence.opfsRoots.some((name) => name.startsWith("loomrealm-demo-v1-")));
    assert(evidence.statuses.some((entry) => entry.status === "prepared"));
    assert(evidence.statuses.some((entry) => entry.status === "main-started"));
  } finally { await product.close(); }
});

test("invalid closed Session bootstrap fails before any business Worker side effect", async () => {
  const product = await openProduct();
  try {
    const outcome = await product.page.evaluate(async () => {
      const worker = new Worker("/session-worker.js", { type: "module" });
      const channel = new MessageChannel();
      return await new Promise((resolve) => {
        const timer = setTimeout(() => resolve({ timeout: true }), 5_000);
        worker.onmessage = (event) => { clearTimeout(timer); worker.terminate(); resolve(event.data); };
        worker.postMessage({ type: "loomrealm.pwa.session-bootstrap", version: 1, sessionEpoch: "bad", serviceWorkerGeneration: "bad", installationId: "bad", windowBridgePort: channel.port2, unknown: true }, [channel.port2]);
      });
    });
    assert.equal(outcome.type, "loomrealm.pwa.session-status");
    assert.equal(outcome.status, "failed");
  } finally { await product.close(); }
});

test("generation mismatch, PREPARE rejection, module ABI failure, and unexpected Worker failure all fail closed without restart", async () => {
  const product = await openProduct();
  try {
    const outcomes = await product.page.evaluate(async () => {
      const runSession = (installationId, generation) => new Promise((resolve) => {
        const worker = new Worker("/session-worker.js", { type: "module" });
        const bridge = new MessageChannel();
        const statuses = [];
        bridge.port1.onmessage = (event) => {
          const message = event.data;
          try { message.port?.close(); } catch {}
          bridge.port1.postMessage({ type: "loomrealm.pwa.window-bridge-result", version: 1, requestId: message.requestId, sessionEpoch: "isolated-epoch", ok: true });
        };
        worker.onmessage = (event) => {
          statuses.push(event.data);
          if (event.data?.status === "failed" || event.data?.status === "settled") { worker.terminate(); bridge.port1.close(); resolve(statuses); }
        };
        setTimeout(() => { worker.terminate(); bridge.port1.close(); resolve([...statuses, { timeout: true }]); }, 15_000);
        worker.postMessage({ type: "loomrealm.pwa.session-bootstrap", version: 1, sessionEpoch: "isolated-epoch", serviceWorkerGeneration: generation, installationId, windowBridgePort: bridge.port2 }, [bridge.port2]);
      });
      const generation = window.__loomrealmPwa.serviceWorkerGeneration;
      const mismatch = await runSession("loomrealm-demo-v1", `${generation}-stale`);
      const invalidInstall = async (installationId, launchManifest, source) => {
        try {
          await window.__loomrealmPwa.qualification.install({
            formatVersion: 1,
            installationId,
            gameEntry: JSON.stringify({ formatVersion: 1, initial: { subsystem: "bad", input: null }, subsystems: [{ key: "bad" }] }),
            launchManifest,
            presentation: { formatVersion: 1, scripts: [], styles: [] },
            content: [],
            executables: [{ logicalModule: "bad.mjs", source }],
          });
          return "installed";
        } catch (error) { return error.code ?? error.message; }
      };
      const keyMismatch = await invalidInstall("key-mismatch", JSON.stringify({ formatVersion: 1, subsystems: [{ key: "extra", module: "bad.mjs" }] }), "export default () => ({});");
      const graphFailure = await invalidInstall("graph-failure", JSON.stringify({ formatVersion: 1, subsystems: [{ key: "bad", module: "bad.mjs" }] }), 'import "https://example.test/escape.mjs"; export default () => ({});');
      const abiInstall = await invalidInstall("abi-failure", JSON.stringify({ formatVersion: 1, subsystems: [{ key: "bad", module: "bad.mjs" }] }), "export default 1;");
      const abi = await runSession("abi-failure", generation);
      const crashInstall = await invalidInstall("worker-crash", JSON.stringify({ formatVersion: 1, subsystems: [{ key: "bad", module: "bad.mjs" }] }), 'setTimeout(() => { throw new Error("unexpected"); }, 50); export default () => ({ frame: (frame) => new Promise((resolve) => frame.signal.addEventListener("abort", () => resolve({ type: "cancelled" }), { once: true })) });');
      const crash = await runSession("worker-crash", generation);
      await window.__loomrealmPwa.qualification.uninstall("abi-failure");
      await window.__loomrealmPwa.qualification.uninstall("worker-crash");
      return { mismatch, keyMismatch, graphFailure, abiInstall, abi, crashInstall, crash };
    });
    assert.equal(outcomes.mismatch.at(-1).status, "failed");
    assert.equal(outcomes.mismatch.some((entry) => entry.type === "loomrealm.pwa.observation"), false);
    assert.notEqual(outcomes.keyMismatch, "installed");
    assert.notEqual(outcomes.graphFailure, "installed");
    assert.equal(outcomes.abiInstall, "installed");
    assert.equal(outcomes.abi.at(-1).status, "failed");
    assert.equal(outcomes.abi.filter((entry) => entry.event?.type === "runtime-created").length, 1);
    assert.equal(outcomes.crashInstall, "installed");
    assert.equal(outcomes.crash.at(-1).status, "settled");
    assert.equal(outcomes.crash.at(-1).result?.kind, "root-outcome");
    assert.equal(outcomes.crash.at(-1).result?.outcome?.type, "failed");
    assert.equal(outcomes.crash.filter((entry) => entry.event?.type === "runtime-created").length, 1);
  } finally { await product.close(); }
});
