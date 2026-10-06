import test from "node:test";
import assert from "node:assert/strict";
import { openProduct, waitForDemo } from "./helpers/browser.mjs";

test("installation publishes atomically and Content/Executable routes preserve v1 HTTP semantics offline", async () => {
  const product = await openProduct();
  try {
    const { page, context } = product;
    await waitForDemo(page);
    const first = await page.evaluate(async () => {
      const url = "/_lr/v1/games/loomrealm-demo-v1/records/demo/config";
      const get = await fetch(url);
      const body = await get.text();
      const etag = get.headers.get("etag");
      const head = await fetch(url, { method: "HEAD" });
      const notModified = await fetch(url, { headers: { "If-None-Match": etag } });
      const executable = await fetch("/_lr/internal/executables/loomrealm-demo-v1/subsystems/demo.mjs");
      return {
        get: get.status, body, mime: get.headers.get("content-type"), version: get.headers.get("x-loom-content-version"), etag,
        head: head.status, headBody: await head.text(), headVersion: head.headers.get("x-loom-content-version"),
        notModified: notModified.status, notModifiedBody: await notModified.text(),
        executable: executable.status, executableMime: executable.headers.get("content-type"), executableText: await executable.text(),
      };
    });
    assert.equal(first.get, 200);
    assert.deepEqual(JSON.parse(first.body), { message: "ready" });
    assert.equal(first.mime, "application/json; charset=utf-8");
    assert.match(first.version, /^sha256:[0-9a-f]{64}$/);
    assert.equal(first.etag, `"${first.version}"`);
    assert.equal(first.head, 200);
    assert.equal(first.headBody, "");
    assert.equal(first.headVersion, first.version);
    assert.equal(first.notModified, 304);
    assert.equal(first.notModifiedBody, "");
    assert.equal(first.executable, 200);
    assert.match(first.executableMime, /^text\/javascript/);
    assert.match(first.executableText, /export default/);

    await context.setOffline(true);
    const offline = await page.evaluate(async () => {
      const response = await fetch("/_lr/v1/games/loomrealm-demo-v1/resources/demo/hello.txt");
      return { status: response.status, body: await response.text() };
    });
    assert.deepEqual(offline, { status: 200, body: "LoomRealm PWA" });
    await context.setOffline(false);
  } finally { await product.close(); }
});

test("persistence grant, denial and quota paths are explicit; uninstall cannot be resurrected by cache residue", async () => {
  const product = await openProduct();
  try {
    const outcomes = await product.page.evaluate(async () => {
      const storage = navigator.storage;
      const original = storage.persist;
      Object.defineProperty(storage, "persist", { configurable: true, value: async () => true });
      const granted = await window.__loomrealmPwa.qualification.inspectStorage();
      Object.defineProperty(storage, "persist", { configurable: true, value: async () => false });
      const denied = await window.__loomrealmPwa.qualification.inspectStorage();
      let quota = null;
      try { await window.__loomrealmPwa.qualification.inspectStorage(Number.MAX_SAFE_INTEGER); }
      catch (error) { quota = error.name; }
      Object.defineProperty(storage, "persist", { configurable: true, value: original });
      await window.__loomrealmPwa.qualification.uninstall();
      const after = await fetch("/_lr/v1/games/loomrealm-demo-v1/records/demo/config");
      return { granted: granted.persistence, denied: denied.persistence, quota, after: after.status };
    });
    assert.deepEqual(outcomes, { granted: "granted", denied: "denied", quota: "QuotaExceededError", after: 404 });
  } finally { await product.close(); }
});

test("staging stays invisible, orphan GC removes it, and object corruption invalidates the published installation", async () => {
  const product = await openProduct();
  try {
    const { page } = product;
    const staging = await page.evaluate(async () => {
      const db = await new Promise((resolve, reject) => { const request = indexedDB.open("loomrealm-pwa-installations-v1", 1); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
      const placeholder = { contentVersion: `sha256:${"0".repeat(64)}`, size: 0, mime: "application/octet-stream" };
      const record = { installationId: "orphan-test", state: "staging", rootId: "orphan-root", createdAt: Date.now(), gameEntry: placeholder, launchManifest: placeholder, presentation: placeholder, contentIndex: [], executableIndex: [], persistence: "denied" };
      await new Promise((resolve, reject) => { const tx = db.transaction("installations", "readwrite"); tx.objectStore("installations").put(record); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
      db.close();
      const root = await navigator.storage.getDirectory();
      const product = await root.getDirectoryHandle("loomrealm-pwa", { create: true });
      const installations = await product.getDirectoryHandle("installations", { create: true });
      await installations.getDirectoryHandle("orphan-root", { create: true });
      const response = await fetch("/_lr/v1/games/orphan-test/manifest");
      return response.status;
    });
    assert.equal(staging, 409);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.documentElement.dataset.loomrealmProduct === "ready", null, { timeout: 30_000 });
    const collected = await page.evaluate(async () => {
      const db = await new Promise((resolve, reject) => { const request = indexedDB.open("loomrealm-pwa-installations-v1", 1); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
      const record = await new Promise((resolve, reject) => { const tx = db.transaction("installations", "readonly"); const request = tx.objectStore("installations").get("orphan-test"); request.onsuccess = () => resolve(request.result ?? null); request.onerror = () => reject(request.error); });
      db.close();
      return record;
    });
    assert.equal(collected, null);

    const corruption = await page.evaluate(async () => {
      const db = await new Promise((resolve, reject) => { const request = indexedDB.open("loomrealm-pwa-installations-v1", 1); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
      const installation = await new Promise((resolve, reject) => { const tx = db.transaction("installations", "readonly"); const request = tx.objectStore("installations").get("loomrealm-demo-v1"); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
      db.close();
      const entry = installation.contentIndex.find((value) => value.kind === "record" && value.namespace === "demo" && value.key === "config");
      const root = await navigator.storage.getDirectory();
      const product = await root.getDirectoryHandle("loomrealm-pwa");
      const installations = await product.getDirectoryHandle("installations");
      const directory = await installations.getDirectoryHandle(installation.rootId);
      const objects = await directory.getDirectoryHandle("objects");
      const file = await objects.getFileHandle(entry.contentVersion.replace(":", "-"));
      const writer = await file.createWritable(); await writer.write("corrupt"); await writer.close();
      const first = await fetch("/_lr/v1/games/loomrealm-demo-v1/records/demo/config");
      const second = await fetch("/_lr/v1/games/loomrealm-demo-v1/records/demo/config");
      return [first.status, second.status];
    });
    assert.deepEqual(corruption, [422, 409]);
  } finally { await product.close(); }
});
