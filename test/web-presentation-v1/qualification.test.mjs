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
const CHROMIUM_TEST_TIMEOUT_MS = 30_000;
const ASYNC_STAGE_TIMEOUT_MS = 10_000;
const browserImportMap = JSON.stringify({
  imports: {
    "@loomrealm/foundation": "/packages/foundation/dist/index.js",
    "@loomrealm/foundation/testing": "/packages/foundation/dist/testing/index.js",
    "@loomrealm/wire": "/packages/wire/dist/index.js",
    "@loomrealm/data": "/packages/data/dist/index.js",
    "@loomrealm/platform-ports": "/packages/platform-ports/dist/index.js",
    "@loomrealm/renderer-control": "/packages/renderer-control/dist/index.js",
    "@loomrealm/renderer": "/packages/renderer/dist/index.js",
  },
});

async function within(promise, label, timeoutMs = ASYNC_STAGE_TIMEOUT_MS) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`Timed out waiting for ${label}`)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

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
      response.end(`<!doctype html><html><head><script type="importmap">${browserImportMap}</script></head><body></body></html>`);
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
    if (relative.startsWith("packages/") && relative.includes("/dist/") && relative.endsWith(".js")) {
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
  t.after(async () => {
    const closed = new Promise((resolve, reject) => server.close((error) => {
      if (error) reject(error);
      else resolve();
    }));
    // node:test runs after hooks in registration order, so the fixture server
    // closes before the Chromium hook registered by browserPage(). Retire every
    // keep-alive or in-flight fixture connection after stopping admission; this
    // makes teardown bounded without depending on a browser/version-specific
    // decision to release idle HTTP connections first.
    server.closeIdleConnections?.();
    server.closeAllConnections?.();
    await within(closed, "fixture server close");
  });
  return { origin: `http://127.0.0.1:${server.address().port}`, requests };
}

async function browserPage(t) {
  const browser = await chromium.launch({ headless: true, ...(executablePath() ? { executablePath: executablePath() } : {}) });
  t.after(() => within(browser.close(), "Chromium browser close"));
  return browser.newPage();
}

const dataAuthority = (subsystemKey, generation = 1) => ({ subsystemKey, generation, dataProfile: "loomrealm.renderer-data/1" });
const controlSnapshot = (sessionId, revision, dataAuthorities) => ({
  sessionId, revision, runtimes: dataAuthorities.map(({ subsystemKey }) => ({ subsystemKey, state: "ready" })),
  stack: [], inputTarget: null, dataAuthorities,
});
const turn = () => new Promise((resolve) => setImmediate(resolve));

async function waitFor(predicate, label, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
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

test("real Chromium proves ordered bootstrap, Custom Element registration, load barrier and evaluation failure", { timeout: CHROMIUM_TEST_TIMEOUT_MS }, async (t) => {
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

test("real Chromium proves Projector identity, receiver ordering, currentness and permanent structural freeze", { timeout: CHROMIUM_TEST_TIMEOUT_MS }, async (t) => {
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

test("real Control/Data/Store commits drive the real Chromium Projector with per-subsystem currentness", { timeout: CHROMIUM_TEST_TIMEOUT_MS }, async (t) => {
  const fixture = await fixtureServer(t);
  const page = await browserPage(t);
  await within(page.goto(fixture.origin), "initial Chromium navigation");
  await within(page.evaluate(async ({ origin }) => {
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
  }, { origin: fixture.origin }), "initial Projector bootstrap");

  const peers = [];
  const holder = createRendererControlHolder({
    async acquire(subsystemKey, generation, dataProfile) {
      const pair = createMemoryCarrierPair();
      const peer = createSubsystemDataPeer({
        binding: { carrier: pair.left, subsystemKey, generation, dataProfile },
        handlers: {
          onInputState: () => ({ kind: "accepted" }), onInputEvent: () => ({ kind: "accepted" }), onInputReset: () => ({ kind: "accepted" }), onViewportState: () => ({ kind: "accepted" }),
        },
      });
      peers.push({ subsystemKey, generation, peer });
      return pair.right;
    },
  });
  t.after(() => within(
    Promise.allSettled(peers.map(({ peer }) => peer.close())),
    "Renderer Data peer cleanup",
  ));
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
  await within(
    holder.connect({ carrier: control.right, rendererControlToken: "token" }),
    "Renderer Control connect",
  );
  await waitFor(() => peers.length === 2, "A/B Data peers");
  const node = (key, value) => ({ key, tag: "lr-vertical", attrs: { "data-key": key }, data: { value }, children: [] });
  for (const entry of peers) {
    await entry.peer.render.sendDomains({ type: "render.domains", domains: ["d"] });
    await entry.peer.render.sendSnapshot({ type: "render.snapshot", domainId: "d", revision: 1, zIndex: 0, roots: [node("same", entry.subsystemKey)] });
  }
  await within(browserDelivery, "initial browser delivery");
  const initial = await page.evaluate(() => [...document.body.children].map((element) => ({ key: element.getAttribute("data-key"), value: element.value, instance: element.instance })));
  assert.deepEqual(initial.map(({ value }) => value), ["A", "B"]);
  assert.notEqual(initial[0].instance, initial[1].instance);

  const notificationsBeforeEvent = presentationNotifications;
  const eventPeer = peers.find((entry) => entry.subsystemKey === "B");
  await eventPeer.peer.render.sendEvent({ type: "render.event", domainId: "d", targetKey: "same", name: "ignored", data: {} });
  await turn();
  assert.equal(presentationNotifications, notificationsBeforeEvent, "effect without deliverRenderEvent drops without retained reevaluation");

  const a = peers.find((entry) => entry.subsystemKey === "A");
  await within(a.peer.close(), "retire A Data peer");
  await waitFor(() => peers.filter((entry) => entry.subsystemKey === "A").length === 2, "A replacement carrier");
  const aBefore = initial[0].instance;
  const b = peers.find((entry) => entry.subsystemKey === "B");
  await b.peer.render.sendPatch({ type: "render.patch", domainId: "d", baseRevision: 1, revision: 2, ops: [{ op: "update", key: "same", data: { set: { value: "B2" } } }] });
  await within(browserDelivery, "B patch browser delivery");
  assert.deepEqual(await page.evaluate(() => [...document.body.children].map((element) => [element.value, element.instance])), [["A", aBefore], ["B2", initial[1].instance]]);

  const replacementA = peers.filter((entry) => entry.subsystemKey === "A").at(-1);
  await replacementA.peer.render.sendDomains({ type: "render.domains", domains: ["d", "later"] });
  await replacementA.peer.render.sendSnapshot({ type: "render.snapshot", domainId: "d", revision: 10, zIndex: 0, roots: [node("same", "A-partial")] });
  await within(browserDelivery, "replacement A partial browser delivery");
  assert.equal(await page.evaluate(() => document.body.children[0].value), "A");
  await replacementA.peer.render.sendSnapshot({ type: "render.snapshot", domainId: "later", revision: 1, zIndex: 1, roots: [] });
  await within(browserDelivery, "replacement A complete browser delivery");
  assert.deepEqual(await page.evaluate(() => [document.body.children[0].value, document.body.children[0].instance]), ["A-partial", aBefore]);

  publisher.publish(controlSnapshot("S", 2, [dataAuthority("B")]));
  await waitFor(() => holder.current().snapshot.revision === 2, "authority removal");
  await within(browserDelivery, "authority removal browser delivery");
  assert.deepEqual(await page.evaluate(() => [...document.body.children].map((element) => element.value)), ["B2"]);

  const beforeControlLoss = await page.evaluate(() => {
    const element = document.body.children[0];
    return { html: document.body.innerHTML, instance: element.instance, contexts: element.contexts, connects: element.connects, disconnects: element.disconnects ?? 0, deliveries: element.deliveries };
  });
  publisher.retire();
  await waitFor(() => holder.current() === null, "Control terminal");
  await within(browserDelivery, "control terminal browser delivery");
  const afterControlLoss = await page.evaluate(() => {
    const element = document.body.children[0];
    return { html: document.body.innerHTML, instance: element.instance, contexts: element.contexts, connects: element.connects, disconnects: element.disconnects ?? 0, deliveries: element.deliveries };
  });
  assert.deepEqual(afterControlLoss, beforeControlLoss, "Control transport loss freezes the mounted browser presentation");
});

test("real Chromium WebPresentationContext emits current node events through User Input v1", { timeout: CHROMIUM_TEST_TIMEOUT_MS }, async (t) => {
  const fixture = await fixtureServer(t);
  const page = await browserPage(t);
  await within(page.goto(fixture.origin), "node event qualification navigation");

  const result = await within(page.evaluate(async () => {
    const [foundation, data, rendererControl, renderer, presentation] = await Promise.all([
      import("@loomrealm/foundation/testing"),
      import("@loomrealm/data"),
      import("@loomrealm/renderer-control"),
      import("@loomrealm/renderer"),
      import("/packages/renderer/dist/web-presentation.js"),
    ]);
    const waitForBrowser = async (predicate, label) => {
      const deadline = performance.now() + 5_000;
      while (performance.now() < deadline) {
        if (predicate()) return;
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      throw new Error(`Timed out waiting for ${label}`);
    };

    const received = [];
    const peers = [];
    const holder = renderer.createRendererControlHolder({
      async acquire(subsystemKey, generation, dataProfile) {
        const pair = foundation.createMemoryCarrierPair();
        const peer = data.createSubsystemDataPeer({
          binding: { carrier: pair.left, subsystemKey, generation, dataProfile },
          handlers: {
            onInputState: () => ({ kind: "accepted" }),
            onInputEvent: (message) => {
              received.push(message);
              return { kind: "accepted" };
            },
            onInputReset: () => ({ kind: "accepted" }),
            onViewportState: () => ({ kind: "accepted" }),
          },
        });
        peers.push(peer);
        return pair.right;
      },
    });

    class EventQualifiedElement extends HTMLElement {
      receiveRenderContext(context) {
        this.presentationContext = context;
        this.contextShape = {
          resources: context.resources !== null && typeof context.resources === "object",
          emitCustomEvent: typeof context.emitCustomEvent,
        };
      }
    }
    customElements.define("lr-event-qualified", EventQualifiedElement);
    const projector = new presentation.WebProjector({
      document,
      resourceClient: { async resource() { throw new Error("unused"); } },
    });
    const detach = presentation.attachRendererPresentation(holder, projector);

    const authority = {
      subsystemKey: "forms",
      generation: 1,
      dataProfile: data.RENDERER_DATA_PROFILE_V1,
    };
    const initial = {
      sessionId: "browser-session",
      revision: 1,
      runtimes: [{ subsystemKey: "forms", state: "ready" }],
      stack: [{
        frameId: "browser-frame",
        subsystemKey: "forms",
        lifecycle: "active",
        activationId: "browser-activation",
      }],
      inputTarget: {
        subsystemKey: "forms",
        frameId: "browser-frame",
        activationId: "browser-activation",
      },
      dataAuthorities: [authority],
    };
    const controlPair = foundation.createMemoryCarrierPair();
    const publisher = rendererControl.createMainRendererControlPeer({
      carrier: controlPair.left,
      acceptHello() {
        return {
          kind: "accepted",
          snapshot: initial,
          preparedHelloText: rendererControl.prepareRendererHelloResultV1(initial),
        };
      },
    });
    await holder.connect({ carrier: controlPair.right, rendererControlToken: "browser-token" });
    await waitForBrowser(() => peers.length === 1, "browser Data peer");
    await peers[0].input.sendInterest({
      type: "input.interest",
      frames: [{
        frameId: "browser-frame",
        channels: [data.WEB_PRESENTATION_EVENT_CHANNEL_V1],
      }],
    });
    const renderNode = (key) => ({
      key,
      tag: "lr-event-qualified",
      attrs: { "data-key": key },
      data: {},
      children: [],
    });
    await peers[0].render.sendDomains({ type: "render.domains", domains: ["form-domain"] });
    await peers[0].render.sendSnapshot({
      type: "render.snapshot",
      domainId: "form-domain",
      revision: 1,
      zIndex: 0,
      roots: [renderNode("node-A"), renderNode("node-B")],
    });
    await waitForBrowser(() => document.body.children.length === 2, "two projected event nodes");
    const [nodeA, nodeB] = document.body.children;
    const contextShape = [nodeA.contextShape, nodeB.contextShape];

    nodeA.presentationContext.emitCustomEvent("browser-test", { value: 1 });
    nodeB.presentationContext.emitCustomEvent("browser-test", { value: 2 });
    nodeB.presentationContext.emitCustomEvent("omitted-data");
    nodeB.presentationContext.emitCustomEvent("undefined-data", undefined);
    await waitForBrowser(() => received.length === 4, "initial browser node events");

    let invalidTypeError = false;
    let nullTypeError = false;
    try {
      nodeB.presentationContext.emitCustomEvent("invalid", { value: 1n });
    } catch (error) {
      invalidTypeError = error instanceof TypeError;
    }
    try {
      nodeB.presentationContext.emitCustomEvent("null", null);
    } catch (error) {
      nullTypeError = error instanceof TypeError;
    }
    nodeB.presentationContext.emitCustomEvent("after-invalid", { healthy: true });
    await waitForBrowser(() => received.length === 5, "valid browser event after invalid payloads");

    const staleContext = nodeA.presentationContext;
    await peers[0].render.sendPatch({
      type: "render.patch",
      domainId: "form-domain",
      baseRevision: 1,
      revision: 2,
      ops: [{ op: "remove", key: "node-A" }],
    });
    await waitForBrowser(() => document.body.children.length === 1, "removed browser node");
    staleContext.emitCustomEvent("stale", { ignored: true });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const eventCountAfterStale = received.length;

    detach();
    projector.teardown();
    publisher.retire();
    await Promise.allSettled(peers.map((peer) => peer.close()));
    return {
      contextShape,
      invalidTypeError,
      nullTypeError,
      eventCountAfterStale,
      events: received.map(({ frameId, activationId, channel, payload }) => ({
        frameId,
        activationId,
        channel,
        payload,
      })),
    };
  }), "browser node event qualification");

  assert.deepEqual(result.contextShape, [
    { resources: true, emitCustomEvent: "function" },
    { resources: true, emitCustomEvent: "function" },
  ]);
  assert.equal(result.invalidTypeError, true);
  assert.equal(result.nullTypeError, true);
  assert.equal(result.eventCountAfterStale, 5);
  assert.deepEqual(result.events.map(({ payload }) => [payload.targetKey, payload.name, payload.data]), [
    ["node-A", "browser-test", { value: 1 }],
    ["node-B", "browser-test", { value: 2 }],
    ["node-B", "omitted-data", {}],
    ["node-B", "undefined-data", {}],
    ["node-B", "after-invalid", { healthy: true }],
  ]);
  assert.ok(result.events.every(({ frameId, activationId, channel }) =>
    frameId === "browser-frame" &&
    activationId === "browser-activation" &&
    channel === "x.loomrealm.web-presentation.event"));
});

test("real Chromium qualifies RenderDomain Event delivery, ordering, currentness, failure isolation, and staged reverse input", { timeout: CHROMIUM_TEST_TIMEOUT_MS }, async (t) => {
  const fixture = await fixtureServer(t);
  const page = await browserPage(t);
  await within(page.goto(fixture.origin), "render event qualification navigation");

  const result = await within(page.evaluate(async () => {
    const [foundation, data, rendererControl, renderer, presentation, subsystem] = await Promise.all([
      import("@loomrealm/foundation/testing"),
      import("@loomrealm/data"),
      import("@loomrealm/renderer-control"),
      import("@loomrealm/renderer"),
      import("/packages/renderer/dist/web-presentation.js"),
      import("/packages/subsystem/dist/internal/render-manager.js"),
    ]);
    const waitForBrowser = async (predicate, label) => {
      const deadline = performance.now() + 5_000;
      while (performance.now() < deadline) {
        if (predicate()) return;
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      throw new Error(`Timed out waiting for ${label}`);
    };

    const log = [];
    const reverseInputs = [];
    const presentationFailures = [];
    let inForwardReceiver = false;
    let mutationTypeError = false;
    let exactBusinessShape = false;
    class RenderEventElement extends HTMLElement {
      receiveRenderContext(context) { this.presentationContext = context; }
      receiveRenderData(value) { this.value = value.value; log.push(`data:${value.value}`); }
      receiveRenderEvent(event) {
        inForwardReceiver = true;
        try {
          exactBusinessShape = Object.keys(event).sort().join(",") === "data,name";
          log.push(`event:${event.name}:start:${this.isConnected}`);
          if (event.name === "after-update") {
            try { event.data.nested.value = 99; } catch (error) { mutationTypeError = error instanceof TypeError; }
          }
          if (event.name === "reverse") {
            this.presentationContext.emitCustomEvent("reverse-a", { order: 1 });
            this.presentationContext.emitCustomEvent("reverse-b", { order: 2 });
            log.push(`reverse-staged:${reverseInputs.length}`);
          }
          if (event.name === "reverse-throw") {
            this.presentationContext.emitCustomEvent("survives-throw", { order: 3 });
            throw new Error("receiver presentation failure");
          }
          log.push(`event:${event.name}:end`);
        } finally {
          inForwardReceiver = false;
        }
      }
      disconnectedCallback() { log.push("disconnected"); }
    }
    customElements.define("lr-render-event-qualified", RenderEventElement);

    const peers = [];
    const holder = renderer.createRendererControlHolder({
      async acquire(subsystemKey, generation, dataProfile) {
        const pair = foundation.createMemoryCarrierPair();
        const peer = data.createSubsystemDataPeer({
          binding: { carrier: pair.left, subsystemKey, generation, dataProfile },
          handlers: {
            onInputState: () => ({ kind: "accepted" }),
            onInputEvent(message) {
              reverseInputs.push({ message, synchronous: inForwardReceiver });
              return { kind: "accepted" };
            },
            onInputReset: () => ({ kind: "accepted" }),
            onViewportState: () => ({ kind: "accepted" }),
          },
        });
        peers.push(peer);
        return pair.right;
      },
    });
    const projector = new presentation.WebProjector({
      document,
      resourceClient: { async resource() { throw new Error("unused"); } },
      reportFailure(cause) { presentationFailures.push(String(cause)); },
    });
    const detach = presentation.attachRendererPresentation(holder, projector);
    const authority = (generation) => ({
      subsystemKey: "game",
      generation,
      dataProfile: data.RENDERER_DATA_PROFILE_V1,
    });
    const controlSnapshot = (revision, generation) => ({
      sessionId: "event-session",
      revision,
      runtimes: [{ subsystemKey: "game", state: "ready" }],
      stack: [{ frameId: "frame", subsystemKey: "game", lifecycle: "active", activationId: "activation" }],
      inputTarget: { subsystemKey: "game", frameId: "frame", activationId: "activation" },
      dataAuthorities: [authority(generation)],
    });
    const controlPair = foundation.createMemoryCarrierPair();
    const publisher = rendererControl.createMainRendererControlPeer({
      carrier: controlPair.left,
      acceptHello() {
        const initial = controlSnapshot(1, 1);
        return { kind: "accepted", snapshot: initial, preparedHelloText: rendererControl.prepareRendererHelloResultV1(initial) };
      },
    });
    await holder.connect({ carrier: controlPair.right, rendererControlToken: "event-token" });
    await waitForBrowser(() => peers.length === 1, "generation 1 Data peer");
    await peers[0].input.sendInterest({
      type: "input.interest",
      frames: [{ frameId: "frame", channels: [data.WEB_PRESENTATION_EVENT_CHANNEL_V1] }],
    });

    const renderState = (value, roots = null) => ({
      zIndex: 0,
      roots: roots ?? [{
        key: "target",
        tag: "lr-render-event-qualified",
        attrs: {},
        data: { value },
        children: [],
      }],
    });
    const manager = new subsystem.RenderManager();
    const domain = manager.createDomain(renderState(1));
    manager.setDataPeer(peers[0]);
    await waitForBrowser(() => document.querySelector("lr-render-event-qualified")?.value === 1, "initial retained projection");

    domain.replace(renderState(2));
    domain.emit({ targetKey: "target", name: "after-update", data: { nested: { value: 1 } } });
    await waitForBrowser(() => log.some((entry) => entry.startsWith("event:after-update")), "RenderDomain event after retained update");
    const dataBeforeEvent = log.indexOf("data:2") < log.indexOf("event:after-update:start:true");

    domain.emit({ targetKey: "target", name: "A", data: {} });
    domain.emit({ targetKey: "target", name: "B", data: {} });
    await waitForBrowser(() => log.includes("event:B:end"), "same target FIFO");
    const fifo = log.filter((entry) => /^event:[AB]:(start|end)/.test(entry));

    domain.emit({ targetKey: "target", name: "reverse", data: {} });
    await waitForBrowser(() => reverseInputs.length === 2, "reverse input FIFO");
    domain.emit({ targetKey: "target", name: "reverse-throw", data: {} });
    domain.emit({ targetKey: "target", name: "after-throw", data: {} });
    await waitForBrowser(() => reverseInputs.length === 3 && log.includes("event:after-throw:end"), "throw isolation and staged input survival");

    domain.emit({ targetKey: "target", name: "before-remove", data: {} });
    domain.replace(renderState(3, []));
    await waitForBrowser(() => log.includes("disconnected"), "later target removal");
    const beforeRemoveEnd = log.indexOf("event:before-remove:end");
    const disconnected = log.indexOf("disconnected");

    const deliveredBeforeGenerationChange = log.filter((entry) => entry.startsWith("event:") && entry.includes(":start:")).length;
    publisher.publish(controlSnapshot(2, 2));
    await waitForBrowser(() => peers.length === 2, "generation 2 Data peer");
    try {
      await peers[0].render.sendEvent({ type: "render.event", domainId: "d1", targetKey: "target", name: "old-generation", data: {} });
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 0));
    const oldGenerationDropped = log.filter((entry) => entry.startsWith("event:") && entry.includes(":start:")).length === deliveredBeforeGenerationChange;

    await peers[1].input.sendInterest({
      type: "input.interest",
      frames: [{ frameId: "frame", channels: [data.WEB_PRESENTATION_EVENT_CHANNEL_V1] }],
    });
    const node = (value) => ({ key: "target", tag: "lr-render-event-qualified", attrs: {}, data: { value }, children: [] });
    await peers[1].render.sendDomains({ type: "render.domains", domains: ["a", "b"] });
    await peers[1].render.sendSnapshot({ type: "render.snapshot", domainId: "a", revision: 1, zIndex: 0, roots: [node(20)] });
    const beforePartial = log.length;
    await peers[1].render.sendEvent({ type: "render.event", domainId: "a", targetKey: "target", name: "partial", data: {} });
    await peers[1].render.sendSnapshot({ type: "render.snapshot", domainId: "b", revision: 1, zIndex: 1, roots: [] });
    await waitForBrowser(() => document.querySelector("lr-render-event-qualified")?.value === 20, "complete generation 2 baseline");
    const partialDroppedWithoutReplay = !log.slice(beforePartial).some((entry) => entry.startsWith("event:partial"));
    await peers[1].render.sendEvent({ type: "render.event", domainId: "a", targetKey: "target", name: "fresh-generation", data: {} });
    await waitForBrowser(() => log.includes("event:fresh-generation:end"), "fresh generation event");

    const eventsBeforeFailure = log.filter((entry) => entry.startsWith("event:") && entry.includes(":start:")).length;
    await peers[1].render.sendSnapshot({
      type: "render.snapshot",
      domainId: "a",
      revision: 2,
      zIndex: 0,
      roots: [node(21), { key: "bad", tag: "lr-not-registered-event", attrs: {}, data: {}, children: [] }],
    });
    await peers[1].render.sendEvent({ type: "render.event", domainId: "a", targetKey: "target", name: "failed-window", data: {} });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const failedWindowDropped = projector.structuralFailed() &&
      log.filter((entry) => entry.startsWith("event:") && entry.includes(":start:")).length === eventsBeforeFailure;

    detach();
    projector.teardown();
    publisher.retire();
    manager.setDataPeer(null);
    await Promise.allSettled(peers.map((peer) => peer.close()));
    return {
      dataBeforeEvent,
      fifo,
      exactBusinessShape,
      mutationTypeError,
      reverseNames: reverseInputs.map(({ message }) => message.payload.name),
      reverseSynchronous: reverseInputs.map(({ synchronous }) => synchronous),
      reverseStagedCount: log.find((entry) => entry.startsWith("reverse-staged:")),
      beforeRemoveOrder: beforeRemoveEnd >= 0 && beforeRemoveEnd < disconnected,
      oldGenerationDropped,
      partialDroppedWithoutReplay,
      failedWindowDropped,
      presentationFailures: presentationFailures.length,
    };
  }), "browser Render Event delivery qualification", 20_000);

  assert.deepEqual(result, {
    dataBeforeEvent: true,
    fifo: ["event:A:start:true", "event:A:end", "event:B:start:true", "event:B:end"],
    exactBusinessShape: true,
    mutationTypeError: true,
    reverseNames: ["reverse-a", "reverse-b", "survives-throw"],
    reverseSynchronous: [false, false, false],
    reverseStagedCount: "reverse-staged:0",
    beforeRemoveOrder: true,
    oldGenerationDropped: true,
    partialDroppedWithoutReplay: true,
    failedWindowDropped: true,
    presentationFailures: 2,
  });
});

test("real Chromium proves structural data delivery and independent optional receivers", { timeout: CHROMIUM_TEST_TIMEOUT_MS }, async (t) => {
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

test("real Chromium business context reaches Renderer-private resource bytes and dies with Window presentation", { timeout: CHROMIUM_TEST_TIMEOUT_MS }, async (t) => {
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
