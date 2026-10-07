import test from "node:test";
import assert from "node:assert/strict";
import { openProduct, waitForDemo } from "./helpers/browser.mjs";

test("installation publishes atomically and Content/Executable routes preserve v1 HTTP semantics offline", async () => {
  const product = await openProduct();
  try {
    const { page, context } = product;
    await waitForDemo(page);
    const first = await page.evaluate(async () => {
      const installationId = window.__loomrealmPwa.installationId;
      const url = `/_lr/v1/games/${encodeURIComponent(installationId)}/records/struct.demo/config`;
      const get = await fetch(url);
      const body = await get.text();
      const etag = get.headers.get("etag");
      const head = await fetch(url, { method: "HEAD" });
      const notModified = await fetch(url, { headers: { "If-None-Match": etag } });
      const executable = await fetch(`/_lr/internal/executables/${encodeURIComponent(installationId)}/subsystems/demo.mjs`);
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

    const cdp = await context.newCDPSession(page);
    await cdp.send("ServiceWorker.enable");
    await cdp.send("ServiceWorker.stopAllWorkers");
    const afterRestart = await page.evaluate(async () => {
      const installationId = window.__loomrealmPwa.installationId;
      const response = await fetch(`/_lr/v1/games/${encodeURIComponent(installationId)}/records/struct.demo/config`);
      return { status: response.status, body: await response.text() };
    });
    assert.deepEqual(afterRestart, { status: 200, body: '{"message":"ready"}' });

    await context.setOffline(true);
    const offline = await page.evaluate(async () => {
      const response = await fetch(`/_lr/v1/games/${encodeURIComponent(window.__loomrealmPwa.installationId)}/resources/resource.demo/hello.txt`);
      return { status: response.status, body: await response.text() };
    });
    assert.deepEqual(offline, { status: 200, body: "LoomRealm PWA" });
    await context.setOffline(false);
  } finally { await product.close(); }
});

test("Content API v1 distinguishes malformed and missing identities and preserves GET, HEAD, 304, MIME, and 405 semantics", async () => {
  const product = await openProduct();
  try {
    const matrix = await product.page.evaluate(async () => {
      const installationId = window.__loomrealmPwa.installationId;
      const base = `/_lr/v1/games/${encodeURIComponent(installationId)}`;
      const routes = {
        manifest: `${base}/manifest`,
        record: `${base}/records/struct.demo/config`,
        group: `${base}/groups/group.demo/items`,
        resource: `${base}/resources/resource.demo/nested/hello.txt`,
      };
      const success = {};
      for (const [kind, url] of Object.entries(routes)) {
        const get = await fetch(url);
        const body = await get.text();
        const headers = Object.fromEntries(["content-type", "content-length", "etag", "x-loom-content-version", "cache-control"].map((name) => [name, get.headers.get(name)]));
        const head = await fetch(url, { method: "HEAD" });
        const weak = await fetch(url, { headers: { "If-None-Match": `W/\"unrelated\", W/${headers.etag}` } });
        const quotedComma = await fetch(url, { headers: { "If-None-Match": `\"unrelated,tag\", ${headers.etag}` } });
        const wildcard = await fetch(url, { headers: { "If-None-Match": "*" } });
        success[kind] = {
          status: get.status,
          body,
          headers,
          head: { status: head.status, body: await head.text(), headers: Object.fromEntries(Object.keys(headers).map((name) => [name, head.headers.get(name)])) },
          weak: weak.status,
          quotedComma: quotedComma.status,
          wildcard: wildcard.status,
        };
      }
      const post = await fetch(routes.record, { method: "POST" });
      const malformed = [];
      for (const url of [
        `${base}/records/struct.demo`,
        `${base}/records/struct.demo/a%2Fb`,
        `${base}/resources/resource.demo`,
        `${base}/records/struct.demo/%ZZ`,
        `${base}/manifest?version=1`,
        `${base}/unknown/path`,
      ]) {
        const response = await fetch(url);
        malformed.push({ status: response.status, type: response.headers.get("content-type"), code: (await response.json()).code });
      }
      const missing = await fetch(`${base}/records/struct.demo/missing`);
      const missingInstallation = await fetch(`/_lr/v1/games/${crypto.randomUUID()}/manifest`);
      const badConditional = await fetch(routes.record, { headers: { "If-None-Match": "not-an-entity-tag" } });
      return {
        success,
        post: { status: post.status, allow: post.headers.get("allow"), type: post.headers.get("content-type"), code: (await post.json()).code },
        malformed,
        missing: { status: missing.status, code: (await missing.json()).code },
        missingInstallation: { status: missingInstallation.status, code: (await missingInstallation.json()).code },
        badConditional: { status: badConditional.status, code: (await badConditional.json()).code },
      };
    });
    for (const value of Object.values(matrix.success)) {
      assert.equal(value.status, 200);
      assert.match(value.headers.etag, /^"sha256:[0-9a-f]{64}"$/);
      assert.equal(value.headers["x-loom-content-version"], value.headers.etag.slice(1, -1));
      assert.deepEqual(value.head.headers, value.headers);
      assert.deepEqual(
        { status: value.head.status, body: value.head.body, weak: value.weak, quotedComma: value.quotedComma, wildcard: value.wildcard },
        { status: 200, body: "", weak: 304, quotedComma: 304, wildcard: 304 },
      );
    }
    assert.match(matrix.success.manifest.headers["content-type"], /^application\/json/);
    assert.equal(matrix.success.record.headers["content-type"], "application/json; charset=utf-8");
    assert.equal(matrix.success.group.headers["content-type"], "application/x-ndjson; charset=utf-8");
    assert.equal(matrix.success.resource.body, "Nested LoomRealm PWA");
    assert.deepEqual(matrix.post, { status: 405, allow: "GET, HEAD", type: "application/problem+json", code: "METHOD_NOT_ALLOWED" });
    assert.deepEqual(matrix.malformed, Array.from({ length: 6 }, () => ({ status: 400, type: "application/problem+json", code: "INVALID_CONTENT_ROUTE" })));
    assert.deepEqual(matrix.missing, { status: 404, code: "CONTENT_NOT_FOUND" });
    assert.deepEqual(matrix.missingInstallation, { status: 404, code: "INSTALLATION_NOT_FOUND" });
    assert.deepEqual(matrix.badConditional, { status: 400, code: "INVALID_IF_NONE_MATCH" });
  } finally { await product.close(); }
});

test("canonical public manifests have stable bytes and versions across source JSON formatting", async () => {
  const product = await openProduct();
  try {
    const result = await product.page.evaluate(async () => {
      const semantic = { formatVersion: 1, state: { records: [{ namespace: "demo", key: "value", value: { z: 1, a: 2 } }] }, initial: { subsystem: "demo", input: null }, subsystems: [{ key: "demo" }] };
      const source = "export default () => ({ frame: async () => ({ type: 'completed', value: null }) });";
      const bundle = (gameEntryText) => ({
        formatVersion: 1,
        gameEntryText,
        launchManifestText: '{\n  "subsystems": [{"module":"demo.mjs","key":"demo"}], "formatVersion": 1\n}',
        content: [],
        executables: [{ logicalModule: "demo.mjs", mime: "text/javascript", body: new Blob([source], { type: "text/javascript" }) }],
      });
      const first = await window.__loomrealmPwaQualification.install(bundle(JSON.stringify(semantic)));
      const secondText = '{\n "subsystems" : [ { "key" : "demo" } ], "initial": {"input":null,"subsystem":"demo"}, "state":{"records":[{"value":{"a":2,"z":1},"key":"value","namespace":"demo"}]}, "formatVersion":1\n}';
      const second = await window.__loomrealmPwaQualification.install(bundle(secondText));
      const responses = await Promise.all([first, second].map(({ installationId }) => fetch(`/_lr/v1/games/${installationId}/manifest`)));
      const outcome = { bodies: await Promise.all(responses.map((response) => response.text())), versions: responses.map((response) => response.headers.get("x-loom-content-version")) };
      await Promise.all([first, second].map(({ installationId }) => window.__loomrealmPwaQualification.uninstall(installationId)));
      return outcome;
    });
    assert.equal(result.bodies[0], result.bodies[1]);
    assert.equal(result.versions[0], result.versions[1]);
  } finally { await product.close(); }
});

test("installation validates Content MIME, UTF-8, JSON, JSON Lines, and deployment bounds before staging", async () => {
  const product = await openProduct();
  try {
    const result = await product.page.evaluate(async () => {
      const source = "export default () => ({ frame: async () => ({ type: 'completed', value: null }) });";
      const bundle = (content) => ({
        formatVersion: 1,
        gameEntryText: JSON.stringify({ formatVersion: 1, initial: { subsystem: "content", input: null }, subsystems: [{ key: "content" }] }),
        launchManifestText: JSON.stringify({ formatVersion: 1, subsystems: [{ key: "content", module: "content.mjs" }] }),
        content,
        executables: [{ logicalModule: "content.mjs", mime: "text/javascript", body: new Blob([source], { type: "text/javascript" }) }],
      });
      const invalid = [
        [{ kind: "resource", namespace: "resource.test", key: "bad.bin", mime: "not-a-mime", body: new Blob(["x"]) }],
        [{ kind: "record", namespace: "struct.test", key: "bad", mime: "application/json", body: new Blob(["{"]) }],
        [{ kind: "record", namespace: "struct.test", key: "bad-utf8", mime: "application/json", body: new Blob([new Uint8Array([0xff])]) }],
        [{ kind: "group", namespace: "group.test", key: "bad", mime: "application/x-ndjson", body: new Blob(['{"ok":true}\nnot-json\n']) }],
      ];
      const rejected = [];
      for (const content of invalid) {
        try { await window.__loomrealmPwaQualification.install(bundle(content)); rejected.push(false); }
        catch { rejected.push(true); }
      }
      const bounds = [];
      for (const candidate of [
        bundle(Array.from({ length: 4_097 }, () => null)),
        { ...bundle([]), executables: Array.from({ length: 1_025 }, () => null) },
      ]) {
        try { await window.__loomrealmPwaQualification.install(candidate); bounds.push(false); }
        catch { bounds.push(true); }
      }
      const legal = await window.__loomrealmPwaQualification.install(bundle([
        { kind: "resource", namespace: "resource.test", key: "legal.txt", mime: 'text/plain; note="a;b"', body: new Blob(["legal"]) },
      ]));
      const response = await fetch(`/_lr/v1/games/${encodeURIComponent(legal.installationId)}/resources/resource.test/legal.txt`);
      const observed = { status: response.status, mime: response.headers.get("content-type"), body: await response.text() };
      await window.__loomrealmPwaQualification.uninstall(legal.installationId);
      return { rejected, bounds, observed };
    });
    assert.deepEqual(result.rejected, [true, true, true, true]);
    assert.deepEqual(result.bounds, [true, true]);
    assert.deepEqual(result.observed, { status: 200, mime: 'text/plain; note="a;b"', body: "legal" });
  } finally { await product.close(); }
});

test("persistence grant, denial and quota paths are explicit; uninstall cannot be resurrected by cache residue", async () => {
  const product = await openProduct();
  try {
    const outcomes = await product.page.evaluate(async () => {
      const storage = navigator.storage;
      const original = storage.persist;
      Object.defineProperty(storage, "persist", { configurable: true, value: async () => true });
      const granted = await window.__loomrealmPwaQualification.inspectStorage();
      Object.defineProperty(storage, "persist", { configurable: true, value: async () => false });
      const denied = await window.__loomrealmPwaQualification.inspectStorage();
      let quota = null;
      try { await window.__loomrealmPwaQualification.inspectStorage(Number.MAX_SAFE_INTEGER); }
      catch (error) { quota = error.name; }
      Object.defineProperty(storage, "persist", { configurable: true, value: original });
      const installationId = window.__loomrealmPwa.installationId;
      await window.__loomrealmPwaQualification.uninstall();
      const after = await fetch(`/_lr/v1/games/${encodeURIComponent(installationId)}/records/struct.demo/config`);
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
      const record = { installationId: "orphan-test", generation: crypto.randomUUID(), state: "staging", rootId: "orphan-root", createdAt: Date.now(), gameEntryText: "{}", launchManifestText: "{}", gameEntry: placeholder, launchManifest: placeholder, contentIndex: [], executableIndex: [], persistence: "denied" };
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
      const installationId = window.__loomrealmPwa.installationId;
      const installation = await new Promise((resolve, reject) => { const tx = db.transaction("installations", "readonly"); const request = tx.objectStore("installations").get(installationId); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
      db.close();
      const entry = installation.contentIndex.find((value) => value.kind === "record" && value.namespace === "struct.demo" && value.key === "config");
      const root = await navigator.storage.getDirectory();
      const product = await root.getDirectoryHandle("loomrealm-pwa");
      const installations = await product.getDirectoryHandle("installations");
      const directory = await installations.getDirectoryHandle(installation.rootId);
      const objects = await directory.getDirectoryHandle("objects");
      const file = await objects.getFileHandle(entry.contentVersion.replace(":", "-"));
      const writer = await file.createWritable(); await writer.write("corrupt"); await writer.close();
      const first = await fetch(`/_lr/v1/games/${encodeURIComponent(installationId)}/records/struct.demo/config`);
      const second = await fetch(`/_lr/v1/games/${encodeURIComponent(installationId)}/records/struct.demo/config`);
      return { statuses: [first.status, second.status], installationId, rootId: installation.rootId };
    });
    assert.deepEqual(corruption.statuses, [422, 409]);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.documentElement.dataset.loomrealmProduct === "ready", null, { timeout: 30_000 });
    const maintained = await page.evaluate(async ({ oldInstallationId, oldRootId }) => {
      const db = await new Promise((resolve, reject) => { const request = indexedDB.open("loomrealm-pwa-installations-v1", 1); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
      const record = await new Promise((resolve, reject) => { const tx = db.transaction("installations", "readonly"); const request = tx.objectStore("installations").get(oldInstallationId); request.onsuccess = () => resolve(request.result ?? null); request.onerror = () => reject(request.error); });
      db.close();
      const root = await navigator.storage.getDirectory();
      let rootExists = true;
      try { const product = await root.getDirectoryHandle("loomrealm-pwa"); const installations = await product.getDirectoryHandle("installations"); await installations.getDirectoryHandle(oldRootId); }
      catch (error) { if (error.name === "NotFoundError") rootExists = false; else throw error; }
      return { record, rootExists, current: window.__loomrealmPwa.installationId };
    }, { oldInstallationId: corruption.installationId, oldRootId: corruption.rootId });
    assert.equal(maintained.record, null);
    assert.equal(maintained.rootExists, false);
    assert.notEqual(maintained.current, corruption.installationId);
  } finally { await product.close(); }
});

test("an installation cancelled after staging leaves neither a registry record nor an OPFS namespace", async () => {
  const product = await openProduct();
  try {
    const result = await product.page.evaluate(async () => {
      const records = async () => {
        const db = await new Promise((resolve, reject) => { const request = indexedDB.open("loomrealm-pwa-installations-v1", 1); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
        const values = await new Promise((resolve, reject) => { const tx = db.transaction("installations", "readonly"); const request = tx.objectStore("installations").getAll(); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
        db.close();
        return values;
      };
      const roots = async () => {
        const root = await navigator.storage.getDirectory();
        try {
          const product = await root.getDirectoryHandle("loomrealm-pwa");
          const installations = await product.getDirectoryHandle("installations");
          const names = [];
          for await (const [name] of installations.entries()) names.push(name);
          return names.sort();
        } catch (error) { if (error.name === "NotFoundError") return []; throw error; }
      };
      const beforeRecords = (await records()).map(({ installationId }) => installationId).sort();
      const beforeRoots = await roots();
      const controller = new AbortController();
      const source = "export default () => ({ frame: async () => ({ type: 'completed', value: null }) });";
      const install = window.__loomrealmPwaQualification.install({
        formatVersion: 1,
        gameEntryText: JSON.stringify({ formatVersion: 1, initial: { subsystem: "cancel", input: null }, subsystems: [{ key: "cancel" }] }),
        launchManifestText: JSON.stringify({ formatVersion: 1, subsystems: [{ key: "cancel", module: "cancel.mjs" }] }),
        content: [{ kind: "resource", namespace: "cancel", key: "large.bin", mime: "application/octet-stream", body: new Blob([new Uint8Array(8 * 1024 * 1024)]) }],
        executables: [{ logicalModule: "cancel.mjs", mime: "text/javascript", body: new Blob([source], { type: "text/javascript" }) }],
      }, controller.signal);
      const deadline = performance.now() + 10_000;
      while (performance.now() < deadline) {
        const staging = (await records()).find((record) => record.state === "staging" && !beforeRecords.includes(record.installationId));
        if (staging) { controller.abort(new Error("qualification cancellation")); break; }
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      let rejected = false;
      try { await install; } catch { rejected = true; }
      return {
        rejected,
        beforeRecords,
        afterRecords: (await records()).map(({ installationId }) => installationId).sort(),
        beforeRoots,
        afterRoots: await roots(),
      };
    });
    assert.equal(result.rejected, true);
    assert.deepEqual(result.afterRecords, result.beforeRecords);
    assert.deepEqual(result.afterRoots, result.beforeRoots);
  } finally { await product.close(); }
});
