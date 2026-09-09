import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { createMemoryCarrierPair } from "@loomrealm/foundation/testing";
import { createSubsystemDataPeer } from "@loomrealm/data";
import { createMainRendererControlPeer, prepareRendererHelloResultV1 } from "@loomrealm/renderer-control";
import { createRendererControlHolder } from "@loomrealm/renderer";
import { attachRendererPresentation } from "../../packages/renderer/dist/internal/presentation-seam.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const version = `sha256:${"c".repeat(64)}`;

function executablePath() {
  const configured = process.env.LOOMREALM_CHROMIUM_PATH;
  const candidates = [
    configured,
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
  ].filter(Boolean);
  return candidates.find(existsSync);
}

async function fixtureServer(t) {
  const requests = [];
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    requests.push(url.pathname);
    if (url.pathname === "/") {
      response.setHeader("content-type", "text/html");
      response.end("<!doctype html><html><head></head><body></body></html>");
      return;
    }
    if (url.pathname === "/business/first.js") {
      response.setHeader("content-type", "text/javascript");
      response.end("globalThis.bootstrapOrder.push('script-1')");
      return;
    }
    if (url.pathname === "/business/second.js") {
      response.setHeader("content-type", "text/javascript");
      response.end("globalThis.bootstrapOrder.push('script-2'); customElements.define('lr-bootstrap', class extends HTMLElement {})");
      return;
    }
    if (url.pathname === "/business/failing.js") {
      response.setHeader("content-type", "text/javascript");
      response.end("throw new Error('business evaluation failed')");
      return;
    }
    if (url.pathname.startsWith("/business/") && url.pathname.endsWith(".css")) {
      response.setHeader("content-type", "text/css");
      response.end(":root { --loomrealm-qualified: 1; }");
      return;
    }
    if (url.pathname === "/_lr/v1/games/game/resources/images/icon.bin") {
      if (request.headers.authorization !== "Bearer private-token") {
        response.statusCode = 401;
        response.end();
        return;
      }
      response.setHeader("content-type", "application/octet-stream");
      response.setHeader("x-loom-content-version", version);
      response.setHeader("etag", `"${version}"`);
      response.end(Buffer.from([1, 2, 3, 4]));
      return;
    }
    if (url.pathname === "/_lr/v1/games/game/resources/images/slow.bin") {
      response.setHeader("content-type", "application/octet-stream");
      response.setHeader("x-loom-content-version", version);
      response.setHeader("etag", `"${version}"`);
      setTimeout(() => response.end(Buffer.from([5, 6])), 1_000);
      return;
    }
    const relative = url.pathname.slice(1);
    if (relative.startsWith("packages/renderer/dist/internal/") && relative.endsWith(".js")) {
      try {
        response.setHeader("content-type", "text/javascript");
        response.end(await readFile(path.join(root, relative)));
      } catch {
        response.statusCode = 404;
        response.end();
      }
      return;
    }
    response.statusCode = 404;
    response.end();
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return { origin: `http://127.0.0.1:${server.address().port}`, requests };
}

async function browserPage(t) {
  const browser = await chromium.launch({ headless: true, ...(executablePath() ? { executablePath: executablePath() } : {}) });
  t.after(() => browser.close());
  return browser.newPage();
}

const dataAuthority = (subsystemKey, generation = 1) => ({ subsystemKey, generation, dataProfile: "loomrealm.renderer-data/1" });
const controlSnapshot = (sessionId, revision, dataAuthorities) => ({
  sessionId, revision, runtimes: dataAuthorities.map(({ subsystemKey }) => ({ subsystemKey, state: "ready" })),
  stack: [], inputTarget: null, dataAuthorities,
});
const turn = () => new Promise((resolve) => setImmediate(resolve));

async function waitFor(predicate, label) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return;
    await turn();
  }
  assert.fail(`Timed out waiting for ${label}`);
}

function controlMain(pair, sessionId, authorities) {
  return createMainRendererControlPeer({
    carrier: pair.left,
    acceptHello() {
      const initial = controlSnapshot(sessionId, 1, authorities);
      return { kind: "accepted", snapshot: initial, preparedHelloText: prepareRendererHelloResultV1(initial) };
    },
  });
}

test("real Chromium proves ordered bootstrap, Custom Element registration, load barrier and evaluation failure", async (t) => {
  const fixture = await fixtureServer(t);
  const page = await browserPage(t);
  await page.goto(fixture.origin);
  const result = await page.evaluate(async ({ origin, version }) => {
    globalThis.bootstrapOrder = [];
    const { bootstrapWebPresentation } = await import(`${origin}/packages/renderer/dist/internal/web-presentation-bootstrap.js`);
    const { WebProjector } = await import(`${origin}/packages/renderer/dist/internal/web-projector.js`);
    let started = 0;
    let firstMutationReadyState;
    await bootstrapWebPresentation(window, {
      styles: ["first.css", "second.css"].map((name) => ({ namespace: "presentation", key: name, mime: "text/css", contentVersion: version, browserSource: `${origin}/business/${name}` })),
      scripts: ["first.js", "second.js"].map((name) => ({ namespace: "presentation", key: name, mime: "text/javascript", contentVersion: version, browserSource: `${origin}/business/${name}` })),
    }, () => {
      started += 1;
      globalThis.bootstrapOrder.push(`start:${document.readyState}`);
      const projector = new WebProjector({ document, resourceClient: { async resource() { throw new Error("unused"); } } });
      projector.reevaluate({ read: () => ({ sessionId: "bootstrap", subsystems: [{ subsystemKey: "A", generation: 1, eligible: true, domains: [{ domainId: "d", zIndex: 0, roots: [{ key: "root", tag: "lr-bootstrap", attrs: {}, data: {}, children: [] }] }] }] }) });
      firstMutationReadyState = document.readyState;
    });
    return {
      order: globalThis.bootstrapOrder,
      started,
      registered: customElements.get("lr-bootstrap") !== undefined,
      projected: document.body.children.length,
      firstMutationReadyState,
    };
  }, { origin: fixture.origin, version });
  assert.deepEqual(result, {
    order: ["script-1", "script-2", "start:complete"],
    started: 1,
    registered: true,
    projected: 1,
    firstMutationReadyState: "complete",
  });
  assert.ok(fixture.requests.indexOf("/business/first.css") < fixture.requests.indexOf("/business/second.css"));
  assert.ok(fixture.requests.indexOf("/business/first.js") < fixture.requests.indexOf("/business/second.js"));

  await page.goto(fixture.origin);
  const failure = await page.evaluate(async ({ origin, version }) => {
    const { bootstrapWebPresentation } = await import(`${origin}/packages/renderer/dist/internal/web-presentation-bootstrap.js`);
    let started = false;
    try {
      await bootstrapWebPresentation(window, { styles: [], scripts: [{ namespace: "presentation", key: "failing.js", mime: "text/javascript", contentVersion: version, browserSource: `${origin}/business/failing.js` }] }, () => { started = true; });
      return { rejected: false, started };
    } catch { return { rejected: true, started }; }
  }, { origin: fixture.origin, version });
  assert.deepEqual(failure, { rejected: true, started: false });

  await page.goto(fixture.origin);
  const loadFailure = await page.evaluate(async ({ origin, version }) => {
    const { bootstrapWebPresentation } = await import(`${origin}/packages/renderer/dist/internal/web-presentation-bootstrap.js`);
    let started = false;
    try {
      await bootstrapWebPresentation(window, { styles: [], scripts: [{ namespace: "presentation", key: "missing.js", mime: "text/javascript", contentVersion: version, browserSource: `${origin}/business/missing.js` }] }, () => { started = true; });
      return { rejected: false, started };
    } catch { return { rejected: true, started }; }
  }, { origin: fixture.origin, version });
  assert.deepEqual(loadFailure, { rejected: true, started: false });
});

test("real Chromium proves Projector identity, receiver ordering, currentness and permanent structural freeze", async (t) => {
  const fixture = await fixtureServer(t);
  const page = await browserPage(t);
  await page.goto(fixture.origin);
  const result = await page.evaluate(async ({ origin }) => {
    const { WebProjector } = await import(`${origin}/packages/renderer/dist/internal/web-projector.js`);
    globalThis.lifecycle = [];
    class QualifiedElement extends HTMLElement {
      receiveRenderContext(context) { this.context = context; globalThis.lifecycle.push(`context:${this.id || "new"}`); }
      connectedCallback() { globalThis.lifecycle.push(`connected:${this.context !== undefined}`); }
      disconnectedCallback() { globalThis.lifecycle.push("disconnected"); }
      receiveRenderData(data) { this.deliveries = (this.deliveries ?? 0) + 1; this.lastData = data; }
    }
    customElements.define("lr-qualified", QualifiedElement);
    const failures = [];
    const projector = new WebProjector({
      document,
      resourceClient: { async resource() { throw new Error("unused"); } },
      reportFailure(cause) { failures.push(String(cause)); },
    });
    let current;
    const source = { read() { return current; } };
    const node = (key, data = { a: 1, b: 2 }, children = []) => ({ key, tag: "lr-qualified", attrs: { "data-key": key }, data, children });
    current = {
      sessionId: "S",
      subsystems: [
        { subsystemKey: "B", generation: 1, eligible: true, domains: [{ domainId: "d", zIndex: 0, roots: [node("same")] }] },
        { subsystemKey: "A", generation: 1, eligible: true, domains: [{ domainId: "d", zIndex: 0, roots: [node("same", { a: 1, b: 2 }, [node("child")])] }] },
      ],
    };
    projector.reevaluate(source);
    const roots1 = [...document.body.children];
    const a = roots1[0];
    const b = roots1[1];
    const child = a.children[0];
    const initial = { tags: roots1.map((element) => element.getAttribute("data-key")), distinct: a !== b, connectedAfterContext: globalThis.lifecycle.filter((value) => value.startsWith("connected")).every((value) => value === "connected:true") };

    current = { sessionId: "S", subsystems: [
      { subsystemKey: "A", generation: 1, eligible: true, domains: [{ domainId: "d", zIndex: 0, roots: [node("child", { b: 2, a: 1 }, [node("same", { b: 2, a: 1 })])] }] },
      { subsystemKey: "B", generation: 1, eligible: false, domains: [] },
    ] };
    projector.reevaluate(source);
    const movedIdentity = document.body.children[0] === child && child.children[0] === a;
    const noObjectOrderRedelivery = a.deliveries === 1;
    const frozenBStillMounted = b.isConnected;

    current = { sessionId: "S", subsystems: [{ subsystemKey: "A", generation: 2, eligible: false, domains: [] }, { subsystemKey: "B", generation: 1, eligible: false, domains: [] }] };
    projector.reevaluate(source);
    const oldARetired = !a.isConnected && !child.isConnected;
    const bDisconnectsBefore = globalThis.lifecycle.filter((value) => value === "disconnected").length;

    current = { sessionId: "S", subsystems: [{ subsystemKey: "A", generation: 2, eligible: true, domains: [{ domainId: "d", zIndex: 0, roots: [node("same", [2, 1])] }] }, { subsystemKey: "B", generation: 1, eligible: false, domains: [] }] };
    projector.reevaluate(source);
    const freshA = document.body.children[0];
    const freshGeneration = freshA !== a;
    const frozenBNotDetached = globalThis.lifecycle.filter((value) => value === "disconnected").length === bDisconnectsBefore;

    current = { sessionId: "S-prime", subsystems: [{ subsystemKey: "A", generation: 2, eligible: true, domains: [{ domainId: "d", zIndex: 0, roots: [node("same", { session: "fresh" })] }] }] };
    projector.reevaluate(source);
    const freshSessionA = document.body.children[0];
    const freshSession = freshSessionA !== freshA && !freshA.isConnected && freshSessionA.isConnected;

    const beforeFailure = document.body.innerHTML;
    current = { sessionId: "S-prime", subsystems: [{ subsystemKey: "A", generation: 2, eligible: true, domains: [{ domainId: "d", zIndex: 0, roots: [node("same", { changed: true }), { ...node("bad"), tag: "lr-not-registered" }] }] }] };
    projector.reevaluate(source);
    const zeroMutation = document.body.innerHTML === beforeFailure;
    current = { sessionId: "S2", subsystems: [] };
    projector.reevaluate(source);
    const permanentFreeze = document.body.innerHTML === beforeFailure && projector.structuralFailed();
    return { initial, movedIdentity, noObjectOrderRedelivery, frozenBStillMounted, oldARetired, freshGeneration, freshSession, frozenBNotDetached, zeroMutation, permanentFreeze, failures: failures.length };
  }, { origin: fixture.origin });
  assert.deepEqual(result, {
    initial: { tags: ["same", "same"], distinct: true, connectedAfterContext: true },
    movedIdentity: true,
    noObjectOrderRedelivery: true,
    frozenBStillMounted: true,
    oldARetired: true,
    freshGeneration: true,
    freshSession: true,
    frozenBNotDetached: true,
    zeroMutation: true,
    permanentFreeze: true,
    failures: 1,
  });
});

test("real Control/Data/Store commits drive the real Chromium Projector with per-subsystem currentness", async (t) => {
  const fixture = await fixtureServer(t);
  const page = await browserPage(t);
  await page.goto(fixture.origin);
  await page.evaluate(async ({ origin }) => {
    const { WebProjector } = await import(`${origin}/packages/renderer/dist/internal/web-projector.js`);
    let serial = 0;
    class VerticalElement extends HTMLElement {
      constructor() { super(); this.instance = ++serial; }
      receiveRenderContext() { this.contexts = (this.contexts ?? 0) + 1; }
      connectedCallback() { this.connects = (this.connects ?? 0) + 1; }
      disconnectedCallback() { this.disconnects = (this.disconnects ?? 0) + 1; }
      receiveRenderData(data) { this.deliveries = (this.deliveries ?? 0) + 1; this.value = data.value; }
    }
    customElements.define("lr-vertical", VerticalElement);
    const projector = new WebProjector({ document, resourceClient: { async resource() { throw new Error("unused"); } } });
    globalThis.applyRendererView = (view) => projector.reevaluate({ read: () => view });
  }, { origin: fixture.origin });

  const peers = [];
  const holder = createRendererControlHolder({
    async acquire(subsystemKey, generation, dataProfile) {
      const pair = createMemoryCarrierPair();
      const peer = createSubsystemDataPeer({
        binding: { carrier: pair.left, subsystemKey, generation, dataProfile },
        handlers: {
          onInputState: () => ({ kind: "accepted" }), onInputEvent: () => ({ kind: "accepted" }), onInputReset: () => ({ kind: "accepted" }),
        },
      });
      peers.push({ subsystemKey, generation, peer });
      return pair.right;
    },
  });
  t.after(async () => Promise.allSettled(peers.map(({ peer }) => peer.close())));
  let browserDelivery = Promise.resolve();
  let presentationNotifications = 0;
  const detach = attachRendererPresentation(holder, {
    reevaluate(source) {
      presentationNotifications += 1;
      const view = structuredClone(source.read());
      browserDelivery = browserDelivery.then(() => page.evaluate((next) => globalThis.applyRendererView(next), view));
    },
  });
  t.after(detach);

  const control = createMemoryCarrierPair();
  const publisher = controlMain(control, "S", [dataAuthority("A"), dataAuthority("B")]);
  await holder.connect({ carrier: control.right, rendererControlToken: "token" });
  await waitFor(() => peers.length === 2, "A/B Data peers");
  const node = (key, value) => ({ key, tag: "lr-vertical", attrs: { "data-key": key }, data: { value }, children: [] });
  for (const entry of peers) {
    await entry.peer.render.sendDomains({ type: "render.domains", domains: ["d"] });
    await entry.peer.render.sendSnapshot({ type: "render.snapshot", domainId: "d", revision: 1, zIndex: 0, roots: [node("same", entry.subsystemKey)] });
  }
  await browserDelivery;
  const initial = await page.evaluate(() => [...document.body.children].map((element) => ({ key: element.getAttribute("data-key"), value: element.value, instance: element.instance })));
  assert.deepEqual(initial.map(({ value }) => value), ["A", "B"]);
  assert.notEqual(initial[0].instance, initial[1].instance);

  const notificationsBeforeEvent = presentationNotifications;
  const eventPeer = peers.find((entry) => entry.subsystemKey === "B");
  await eventPeer.peer.render.sendEvent({ type: "render.event", domainId: "d", targetKey: "same", name: "ignored", data: {} });
  await turn();
  assert.equal(presentationNotifications, notificationsBeforeEvent, "RenderEvent does not trigger presentation");

  const a = peers.find((entry) => entry.subsystemKey === "A");
  await a.peer.close();
  await waitFor(() => peers.filter((entry) => entry.subsystemKey === "A").length === 2, "A replacement carrier");
  const aBefore = initial[0].instance;
  const b = peers.find((entry) => entry.subsystemKey === "B");
  await b.peer.render.sendPatch({ type: "render.patch", domainId: "d", baseRevision: 1, revision: 2, ops: [{ op: "update", key: "same", data: { set: { value: "B2" } } }] });
  await browserDelivery;
  assert.deepEqual(await page.evaluate(() => [...document.body.children].map((element) => [element.value, element.instance])), [["A", aBefore], ["B2", initial[1].instance]]);

  const replacementA = peers.filter((entry) => entry.subsystemKey === "A").at(-1);
  await replacementA.peer.render.sendDomains({ type: "render.domains", domains: ["d", "later"] });
  await replacementA.peer.render.sendSnapshot({ type: "render.snapshot", domainId: "d", revision: 10, zIndex: 0, roots: [node("same", "A-partial")] });
  await browserDelivery;
  assert.equal(await page.evaluate(() => document.body.children[0].value), "A");
  await replacementA.peer.render.sendSnapshot({ type: "render.snapshot", domainId: "later", revision: 1, zIndex: 1, roots: [] });
  await browserDelivery;
  assert.deepEqual(await page.evaluate(() => [document.body.children[0].value, document.body.children[0].instance]), ["A-partial", aBefore]);

  publisher.publish(controlSnapshot("S", 2, [dataAuthority("B")]));
  await waitFor(() => holder.current().snapshot.revision === 2, "authority removal");
  await browserDelivery;
  assert.deepEqual(await page.evaluate(() => [...document.body.children].map((element) => element.value)), ["B2"]);

  const beforeControlLoss = await page.evaluate(() => {
    const element = document.body.children[0];
    return { html: document.body.innerHTML, instance: element.instance, contexts: element.contexts, connects: element.connects, disconnects: element.disconnects ?? 0, deliveries: element.deliveries };
  });
  publisher.retire();
  await waitFor(() => holder.current() === null, "Control terminal");
  await browserDelivery;
  const afterControlLoss = await page.evaluate(() => {
    const element = document.body.children[0];
    return { html: document.body.innerHTML, instance: element.instance, contexts: element.contexts, connects: element.connects, disconnects: element.disconnects ?? 0, deliveries: element.deliveries };
  });
  assert.deepEqual(afterControlLoss, beforeControlLoss, "Control transport loss freezes the mounted browser presentation");
});

test("real Chromium proves structural data delivery and independent optional receivers", async (t) => {
  const fixture = await fixtureServer(t);
  const page = await browserPage(t);
  await page.goto(fixture.origin);
  const result = await page.evaluate(async ({ origin }) => {
    const { WebProjector } = await import(`${origin}/packages/renderer/dist/internal/web-projector.js`);
    globalThis.receiverLog = [];
    class Both extends HTMLElement {
      constructor() { super(); globalThis.receiverLog.push("construct"); }
      receiveRenderContext() { this.contexts = (this.contexts ?? 0) + 1; globalThis.receiverLog.push("context"); }
      connectedCallback() { globalThis.receiverLog.push("connected"); }
      receiveRenderData() { this.dataAttempts = (this.dataAttempts ?? 0) + 1; globalThis.receiverLog.push("data"); throw new Error("business callback"); }
    }
    class ContextOnly extends HTMLElement { receiveRenderContext() { this.contexts = (this.contexts ?? 0) + 1; } }
    class DataOnly extends HTMLElement { receiveRenderData() { this.deliveries = (this.deliveries ?? 0) + 1; } }
    class Neither extends HTMLElement {}
    customElements.define("lr-both", Both);
    customElements.define("lr-context-only", ContextOnly);
    customElements.define("lr-data-only", DataOnly);
    customElements.define("lr-neither", Neither);
    const failures = [];
    const projector = new WebProjector({ document, resourceClient: { async resource() { throw new Error("unused"); } }, reportFailure(error) { failures.push(String(error)); } });
    let data = { a: 1, b: 2 };
    let attrs = {};
    const source = { read: () => ({ sessionId: "S", subsystems: [{ subsystemKey: "A", generation: 1, eligible: true, domains: [{ domainId: "d", zIndex: 0, roots: [
      { key: "both", tag: "lr-both", attrs, data, children: [] },
      { key: "context", tag: "lr-context-only", attrs: {}, data: {}, children: [] },
      { key: "data", tag: "lr-data-only", attrs: {}, data: {}, children: [] },
      { key: "neither", tag: "lr-neither", attrs: {}, data: {}, children: [] },
    ] }] }] }) };
    projector.reevaluate(source);
    const both = document.querySelector("lr-both");
    const initialOrder = globalThis.receiverLog.slice(0, 4);
    data = { b: 2, a: 1 };
    projector.reevaluate(source);
    const reorderedAttempts = both.dataAttempts;
    data = { values: [1, 2] };
    projector.reevaluate(source);
    attrs = { changed: "yes" };
    projector.reevaluate(source);
    const attrsOnlyAttempts = both.dataAttempts;
    data = { values: [2, 1] };
    projector.reevaluate(source);
    return {
      initialOrder,
      contexts: both.contexts,
      reorderedAttempts,
      attrsOnlyAttempts,
      finalAttempts: both.dataAttempts,
      contextOnly: document.querySelector("lr-context-only").contexts,
      dataOnly: document.querySelector("lr-data-only").deliveries,
      failed: projector.structuralFailed(),
      failures: failures.length,
    };
  }, { origin: fixture.origin });
  assert.deepEqual(result, {
    initialOrder: ["construct", "context", "connected", "data"],
    contexts: 1,
    reorderedAttempts: 1,
    attrsOnlyAttempts: 2,
    finalAttempts: 3,
    contextOnly: 1,
    dataOnly: 1,
    failed: false,
    failures: 3,
  });
});

test("real Chromium business context reaches Renderer-private resource bytes and dies with Window presentation", async (t) => {
  const fixture = await fixtureServer(t);
  const page = await browserPage(t);
  await page.goto(fixture.origin);
  const result = await page.evaluate(async ({ origin, version }) => {
    const { createRendererResourceClient } = await import(`${origin}/packages/renderer/dist/internal/resource-client.js`);
    const { WebProjector } = await import(`${origin}/packages/renderer/dist/internal/web-projector.js`);
    class ResourceElement extends HTMLElement {
      receiveRenderContext(context) { this.resources = context.resources; }
      async receiveRenderData() { this.first = await this.resources.resource("images", "icon.bin", version); }
    }
    customElements.define("lr-resource", ResourceElement);
    const rendererLifetime = new AbortController();
    const privateClient = createRendererResourceClient({ origin, installationId: "game", token: "private-token" }, rendererLifetime.signal);
    const projector = new WebProjector({ document, resourceClient: privateClient });
    const view = { sessionId: "S", subsystems: [{ subsystemKey: "A", generation: 1, eligible: true, domains: [{ domainId: "d", zIndex: 0, roots: [{ key: "resource", tag: "lr-resource", attrs: {}, data: {}, children: [] }] }] }] };
    projector.reevaluate({ read: () => view });
    const element = document.querySelector("lr-resource");
    while (element.first === undefined) await new Promise((resolve) => setTimeout(resolve, 0));
    const bytes = [...element.first.bytes];
    element.first.bytes[0] = 99;
    const second = await element.resources.resource("images", "icon.bin", version);
    const caller = new AbortController();
    const callerPending = element.resources.resource("images", "slow.bin", version, { signal: caller.signal });
    caller.abort();
    let callerCancellation;
    try { await callerPending; } catch (error) { callerCancellation = error.code; }
    let conflict;
    try { await element.resources.resource("images", "icon.bin", `sha256:${"d".repeat(64)}`); } catch (error) { conflict = error.code; }
    const exposed = ["origin", "installationId", "token", "resourceClient"].some((key) => key in element.resources);
    const lifetimePending = element.resources.resource("images", "slow.bin", version);
    projector.teardown();
    let lifetimeCancellation;
    try { await lifetimePending; } catch (error) { lifetimeCancellation = error.code; }
    let postTeardown;
    try { await element.resources.resource("images", "icon.bin", version); } catch (error) { postTeardown = error.code; }
    return { bytes, second: [...second.bytes], exposed, callerCancellation, conflict, lifetimeCancellation, postTeardown };
  }, { origin: fixture.origin, version });
  assert.deepEqual(result, {
    bytes: [1, 2, 3, 4],
    second: [1, 2, 3, 4],
    exposed: false,
    callerCancellation: "CONTENT_CANCELLED",
    conflict: "CONTENT_CONFLICT",
    lifetimeCancellation: "CONTENT_CANCELLED",
    postTeardown: "CONTENT_CANCELLED",
  });
});
