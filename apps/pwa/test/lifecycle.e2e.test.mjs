import test from "node:test";
import assert from "node:assert/strict";
import { openProduct, productUrl, waitForDemo } from "./helpers/browser.mjs";

test("reload and navigation create fresh Sessions and history restore records real BFCache evidence", async (t) => {
  const product = await openProduct();
  try {
    const { page } = product;
    await waitForDemo(page);
    const first = await page.evaluate(() => window.__loomrealmPwa.sessionEpoch);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction((prior) => document.documentElement.dataset.loomrealmProduct === "ready" && window.__loomrealmPwa.sessionEpoch !== prior, first, { timeout: 30_000 });
    await waitForDemo(page);
    const second = await page.evaluate(() => window.__loomrealmPwa.sessionEpoch);
    await page.goto(`${productUrl}?navigation=1`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction((prior) => document.documentElement.dataset.loomrealmProduct === "ready" && window.__loomrealmPwa.sessionEpoch !== prior, second, { timeout: 30_000 });
    const third = await page.evaluate(() => window.__loomrealmPwa.sessionEpoch);
    const installLifecycleEvidence = () => {
      if (window.__loomrealmLifecycleEvidenceInstalled) return;
      window.__loomrealmLifecycleEvidenceInstalled = true;
      const record = (type, persisted) => {
        const evidence = JSON.parse(sessionStorage.getItem("loomrealm-lifecycle-evidence") ?? "[]");
        evidence.push({ type, persisted, href: location.href });
        sessionStorage.setItem("loomrealm-lifecycle-evidence", JSON.stringify(evidence));
      };
      addEventListener("pagehide", (event) => record("pagehide", event.persisted));
      addEventListener("pageshow", (event) => record("pageshow", event.persisted));
    };
    await page.evaluate(() => sessionStorage.removeItem("loomrealm-lifecycle-evidence"));
    await page.addInitScript(installLifecycleEvidence);
    await page.evaluate(installLifecycleEvidence);
    await page.goto(new URL("blank.html", productUrl).href);
    await page.goBack({ waitUntil: "domcontentloaded" });
    await page.waitForFunction((prior) => document.documentElement.dataset.loomrealmProduct === "ready" && window.__loomrealmPwa.sessionEpoch !== prior, third, { timeout: 30_000 });
    const fourth = await page.evaluate(() => window.__loomrealmPwa.sessionEpoch);
    assert.equal(new Set([first, second, third, fourth]).size, 4);
    const evidence = await page.evaluate(() => JSON.parse(sessionStorage.getItem("loomrealm-lifecycle-evidence") ?? "[]"));
    const target = evidence.filter((entry) => new URL(entry.href).pathname === "/" && new URL(entry.href).search === "?navigation=1");
    const restored = target.some((entry) => entry.type === "pageshow" && entry.persisted === true);
    if (restored) {
      assert.ok(target.some((entry) => entry.type === "pagehide" && entry.persisted === true));
      assert.notEqual(fourth, third);
    } else {
      t.diagnostic("Repository Chromium did not perform a BFCache restore; observed " + JSON.stringify(target));
    }
  } finally { await product.close(); }
});

test("a waiting Service Worker never blocks or replaces the current document generation", async () => {
  const product = await openProduct();
  try {
    const { page, context } = product;
    await waitForDemo(page);
    const first = await page.evaluate(async () => {
      const handshake = (worker) => new Promise((resolve, reject) => {
        const channel = new MessageChannel();
        const timer = setTimeout(() => reject(new Error("worker handshake timed out")), 5_000);
        channel.port1.onmessage = (event) => { clearTimeout(timer); channel.port1.close(); resolve(event.data); };
        worker.postMessage({ type: "loomrealm.pwa.sw-hello", version: 1 }, [channel.port2]);
      });
      const oldGeneration = window.__loomrealmPwa.serviceWorkerGeneration;
      const oldEpoch = window.__loomrealmPwa.sessionEpoch;
      const registration = await navigator.serviceWorker.register("/service-worker-update.js", { scope: "/", type: "module", updateViaCache: "none" });
      const waiting = registration.waiting ?? await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("updated Service Worker did not reach waiting")), 10_000);
        const inspect = () => {
          const candidate = registration.waiting ?? registration.installing;
          if (candidate?.state === "installed") { clearTimeout(timer); resolve(candidate); }
        };
        registration.addEventListener("updatefound", () => registration.installing?.addEventListener("statechange", inspect));
        registration.installing?.addEventListener("statechange", inspect);
        inspect();
      });
      const waitingInfo = await handshake(waiting);
      await window.__loomrealmPwaQualification.restart();
      return { oldGeneration, oldEpoch, waitingGeneration: waitingInfo.generation };
    });
    await page.waitForFunction((oldEpoch) => document.documentElement.dataset.loomrealmProduct === "ready" && window.__loomrealmPwa.sessionEpoch !== oldEpoch, first.oldEpoch, { timeout: 30_000 });
    const current = await page.evaluate(() => ({ generation: window.__loomrealmPwa.serviceWorkerGeneration, epoch: window.__loomrealmPwa.sessionEpoch }));
    assert.equal(current.generation, first.oldGeneration);
    assert.notEqual(current.epoch, first.oldEpoch);
    assert.equal(first.waitingGeneration, `${first.oldGeneration}-qualification-update`);

    await page.close();
    await new Promise((resolve) => setTimeout(resolve, 500));
    const nextPage = await context.newPage();
    await nextPage.goto(productUrl, { waitUntil: "domcontentloaded" });
    await nextPage.waitForFunction(() => document.documentElement.dataset.loomrealmProduct === "ready" || document.documentElement.dataset.loomrealmProduct === "failed", null, { timeout: 30_000 });
    const next = await nextPage.evaluate(() => ({ generation: window.__loomrealmPwa.serviceWorkerGeneration, failure: window.__loomrealmPwa.failure }));
    assert.equal(next.failure, null);
    assert.equal(next.generation, first.waitingGeneration);
  } finally { await product.close(); }
});
