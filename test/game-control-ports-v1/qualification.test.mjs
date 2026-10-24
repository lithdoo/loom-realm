import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { createMemoryCarrierPair } from "@loomrealm/foundation/testing";
import { parseGameEntryV1 } from "@loomrealm/game-package";
import { runMain } from "@loomrealm/main";
import { createSharedStateClient } from "@loomrealm/shared-state";
import { createSessionEventClient, createSessionEventHub } from "@loomrealm/session-events";
import { createRendererControlHolder } from "@loomrealm/renderer";
import { defineSubsystem } from "@loomrealm/subsystem";
import { runSubsystem } from "@loomrealm/subsystem/host";
import { createControlsConsumer, createDirectionalControlsTracker } from "@loomrealm-game/common-controls/subsystem";
import { RPGMapBuilder } from "@loomrealm-game/map";
import { attachRendererPresentation } from "../../packages/renderer/dist/internal/presentation-seam.js";
import { prepareExamplePresentation } from "../../examples/essentials-v21.1/test/prepare.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const exampleRoot = path.join(root, "examples", "essentials-v21.1");
const scheduler = Object.freeze({ schedule(ms, callback) { const timer = setTimeout(callback, ms); return () => clearTimeout(timer); } });
const runtimePolicy = Object.freeze({ scheduler, helloDeadlineMs: 5_000, frameDeadlineMs: 5_000, terminalCleanupDeadlineMs: 100 });
const mainPolicy = Object.freeze({ runtimeBootstrapDeadlineMs: 5_000, frameDeadlineMs: 5_000, shutdownDeadlineMs: 5_000, terminationDeadlineMs: 1_000 });
const hash = (bytes) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const MAP_DIRECTIONS = Object.freeze({ up: 8, down: 2, left: 4, right: 6 });
const toMapDirection = (direction) => (direction === null ? null : MAP_DIRECTIONS[direction]);

const baseSubsystem = defineSubsystem((scope) => ({
  async frame(frame) {
    const inputHost = scope.createRenderDomain({
      zIndex: 0,
      roots: [{ key: "game-controls-input", tag: "game-controls-input", attrs: {}, data: {}, children: [] }],
    });
    try { return await frame.call("map", frame.params); }
    finally { inputHost.close(); }
  },
}));

const mapSubsystem = defineSubsystem((scope) => ({
  async frame(frame) {
    const input = frame.params;
    const map = new RPGMapBuilder(scope, frame).build({ player: { characterName: input.characterName } });
    map.onMapEntering((context) => { context.setNPC([]); });
    const directions = createDirectionalControlsTracker();
    const apply = () => map.controls.setMoveIntent(toMapDirection(directions.direction));
    const consumer = createControlsConsumer(scope.presentationEvents, frame, {
      onState(state) { directions.acceptState(state); apply(); },
      onEvent(event) { directions.acceptEvent(event); apply(); },
    });
    try { return await map.run({ mapId: input.mapId, x: input.x, y: input.y }); }
    finally { map.controls.setMoveIntent(null); directions.reset(); consumer.close(); }
  },
}));

const subsystemDefinitions = Object.freeze({ base: baseSubsystem, map: mapSubsystem });

function executablePath() {
  return [
    process.env.LOOMREALM_CHROMIUM_PATH,
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
  ].filter(Boolean).find(existsSync);
}

function domainRoot(view, tag) {
  for (const subsystem of view?.subsystems ?? []) {
    for (const domain of subsystem.domains ?? []) {
      const root = domain.roots?.find((item) => item.tag === tag);
      if (root) return { subsystem, domain, root };
    }
  }
  return null;
}

async function waitFor(predicate, label, timeout = 15_000) {
  const deadline = Date.now() + timeout;
  while (!(await predicate())) {
    if (Date.now() >= deadline) assert.fail(`Timed out waiting for ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

function createDataHub() {
  const waiting = [];
  const pairs = [];
  const take = () => { while (waiting.length && pairs.length) waiting.shift().resolve(pairs.shift()); };
  return {
    subsystemBinding: Object.freeze({
      acquire(signal) {
        if (signal.aborted) return Promise.reject(signal.reason);
        return new Promise((resolve, reject) => {
          const request = { resolve, reject };
          waiting.push(request); take();
          signal.addEventListener("abort", () => { const index = waiting.indexOf(request); if (index >= 0) waiting.splice(index, 1); reject(signal.reason); }, { once: true });
        });
      },
    }),
    rendererBinding: Object.freeze({
      acquire(_key, generation, dataProfile) {
        const pair = createMemoryCarrierPair();
        pairs.push({ carrier: pair.left, generation, dataProfile }); take();
        return Promise.resolve(pair.right);
      },
    }),
  };
}

async function fixtureServer(t, resources) {
  let presentation;
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    if (url.pathname === "/") { response.setHeader("content-type", "text/html"); response.end("<!doctype html><html><head></head><body></body></html>"); return; }
    const rendererPrefix = "/packages/renderer/dist/internal/";
    if (url.pathname.startsWith(rendererPrefix) && url.pathname.endsWith(".js")) {
      try {
        response.setHeader("content-type", "text/javascript");
        response.end(await readFile(path.join(root, "packages", "renderer", "dist", "internal", path.basename(url.pathname))));
      } catch { response.statusCode = 404; response.end(); }
      return;
    }
    for (const artifact of presentation?.artifacts.values() ?? []) {
      if (url.pathname === artifact.browserPath) { response.setHeader("content-type", artifact.mime); response.end(artifact.bytes); return; }
    }
    const resourcePrefix = "/_lr/v1/games/m14/resources/";
    if (url.pathname.startsWith(resourcePrefix)) {
      if (request.headers.authorization !== "Bearer m14-token") { response.statusCode = 401; response.end(); return; }
      const resource = resources.get(decodeURIComponent(url.pathname.slice(resourcePrefix.length)));
      if (!resource) { response.statusCode = 404; response.end(); return; }
      response.setHeader("content-type", resource.mime);
      response.setHeader("x-loom-content-version", resource.contentVersion);
      response.end(resource.bytes);
      return;
    }
    response.statusCode = 404; response.end();
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  presentation = await prepareExamplePresentation(origin);
  return { origin, presentation };
}

function fakePresentation() {
  const listeners = [];
  return {
    listeners,
    createListener({ channels }) {
      const handlers = new Map();
      const record = { channels: [...channels], handlers, closed: false };
      listeners.push(record);
      return {
        on(channel, handler) { handlers.set(channel, handler); return () => handlers.delete(channel); },
        setChannels(next) { record.channels = [...next]; },
        close() { record.closed = true; },
      };
    },
    emit(record, channel, name, data) {
      if (!record.closed) record.handlers.get(channel)?.({ channel, name, data, source: { subsystemKey: "base", domainId: "domain", targetKey: "game-controls-input" } });
    },
  };
}

test("overlay and child-frame composition keep activation-local controls", () => {
  const bus = fakePresentation();
  const intents = [];
  const remember = (direction) => {
    if (intents.at(-1) !== direction) intents.push(direction);
  };
  const first = new AbortController();
  const directions = createDirectionalControlsTracker();
  let active = true;
  const apply = () => remember(active ? toMapDirection(directions.direction) : null);
  const firstConsumer = createControlsConsumer(bus, { signal: first.signal }, {
    onState(state) { directions.acceptState(state); apply(); },
    onEvent(event) { directions.acceptEvent(event); apply(); },
  });
  const firstListener = bus.listeners[0];
  bus.emit(firstListener, "controls.state", "input.state", { down: ["up"] });
  assert.deepEqual(intents, [null, 8]);
  active = false;
  apply();
  bus.emit(firstListener, "controls.event", "input.event", { action: "down", button: "right", repeat: false });
  bus.emit(firstListener, "controls.state", "input.state", { down: ["up", "right"] });
  assert.equal(directions.direction, "right");
  assert.equal(intents.at(-1), null);
  active = true;
  apply();
  assert.equal(intents.at(-1), 6);

  remember(null);
  directions.reset();
  firstConsumer.close();
  assert.equal(directions.direction, null);
  bus.emit(firstListener, "controls.state", "input.state", { down: ["left"] });
  assert.equal(directions.direction, null);

  const second = new AbortController();
  const resumed = createDirectionalControlsTracker();
  const resumedConsumer = createControlsConsumer(bus, { signal: second.signal }, {
    onState(state) { resumed.acceptState(state); remember(toMapDirection(resumed.direction)); },
    onEvent(event) { resumed.acceptEvent(event); remember(toMapDirection(resumed.direction)); },
  });
  assert.equal(intents.at(-1), null);
  assert.equal(resumed.direction, null);
  bus.emit(bus.listeners[1], "controls.state", "input.state", { down: ["left"] });
  assert.equal(resumed.direction, "left");
  assert.equal(intents.at(-1), 4);
  resumedConsumer.close();
});

test("browser keyboard moves the map through game-controls-input, top-frame, and RPGMapControls", { timeout: 45_000 }, async (t) => {
  const fixture = JSON.parse(await readFile(path.join(exampleRoot, "fixtures", "semantic-content.json"), "utf8"));
  const tilesetBytes = await readFile(path.join(exampleRoot, "fixtures", "resources", "m14_tileset.png"));
  const playerBytes = await readFile(path.join(exampleRoot, "fixtures", "resources", "m14_player.png"));
  const resources = new Map([
    ["resource.Graphics/Tilesets/m14_tileset", { bytes: tilesetBytes, mime: "image/png", contentVersion: hash(tilesetBytes) }],
    ["resource.Graphics/Characters/m14_player", { bytes: playerBytes, mime: "image/png", contentVersion: hash(playerBytes) }],
  ]);
  const server = await fixtureServer(t, resources);
  const game = parseGameEntryV1(await readFile(path.join(exampleRoot, "game.json"), "utf8"));
  assert.equal(game.initial.subsystem, "base");
  assert.deepEqual(game.subsystems.map(({ key }) => key), ["base", "map"]);
  const content = Object.freeze({
    async record(namespace, key) {
      const value = fixture.records[`${namespace}/${key}`];
      if (!value) throw new Error("record missing");
      return { value, contentVersion: hash(Buffer.from(JSON.stringify(value))) };
    },
    async resource(namespace, key) {
      const value = resources.get(`${namespace}/${key}`);
      if (!value) throw new Error("resource missing");
      return { ...value, bytes: Uint8Array.from(value.bytes) };
    },
  });

  const browser = await chromium.launch({ headless: true, ...(executablePath() ? { executablePath: executablePath() } : {}) });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 800, height: 600 }, deviceScaleFactor: 1 });
  const forwarded = [];
  const forwardErrors = [];
  let emitNodeEvent = null;
  await page.exposeFunction("loomrealmForwardPresentationEvent", (event) => {
    forwarded.push(event);
    setTimeout(() => {
      try { emitNodeEvent?.(event); }
      catch (error) { forwardErrors.push(error instanceof Error ? error.message : String(error)); }
    }, 0);
  });
  await page.goto(server.origin);
  await page.evaluate(async ({ origin, prepared }) => {
    const { bootstrapWebPresentation } = await import(`${origin}/packages/renderer/dist/internal/web-presentation-bootstrap.js`);
    const { createRendererResourceClient } = await import(`${origin}/packages/renderer/dist/internal/resource-client.js`);
    const { WebProjector } = await import(`${origin}/packages/renderer/dist/internal/web-projector.js`);
    const lifetime = new AbortController();
    const resourceClient = createRendererResourceClient({ origin, installationId: "m14", token: "m14-token" }, lifetime.signal);
    await bootstrapWebPresentation(window, prepared, () => {
      const projector = new WebProjector({ document, resourceClient });
      globalThis.applyControlPortView = (view) => projector.reevaluate({ read: () => view }, (event) => {
        void globalThis.loomrealmForwardPresentationEvent(event);
      });
      globalThis.teardownControlPort = () => { projector.teardown(); lifetime.abort(); };
    });
  }, { origin: server.origin, prepared: server.presentation.prepared });
  t.after(() => page.evaluate(() => globalThis.teardownControlPort?.()).catch(() => {}));

  const hub = createDataHub();
  const sessionEventHub = createSessionEventHub();
  t.after(() => sessionEventHub.terminate());
  const viewportSource = Object.freeze({ start(emit) { emit({ width: 800, height: 600 }); return () => {}; } });
  let holder;
  const rendererControl = Object.freeze({
    acquire(token, signal) {
      if (holder) return new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));
      const pair = createMemoryCarrierPair();
      holder = createRendererControlHolder(hub.rendererBinding, viewportSource, {
        async publish(event) {
          const publisher = sessionEventHub.createDelegatedPublisher(event.ownerSubsystemKey);
          await publisher.publish(event.channel, event.type, event.payload, event.broadcast ? undefined : event.ownerSubsystemKey);
        },
      });
      void holder.connect({ carrier: pair.right, rendererControlToken: token });
      return Promise.resolve(pair.left);
    },
  });
  const runtimeHosting = Object.freeze({
    async launch(request) {
      const definition = subsystemDefinitions[request.subsystemKey];
      assert.ok(definition, request.subsystemKey);
      const pair = createMemoryCarrierPair();
      let acquired = false;
      const runtime = runSubsystem({
        definition,
        runtimeControl: { acquire() { assert.equal(acquired, false); acquired = true; return Promise.resolve(pair.right); } },
        runtimePolicy,
        launch: { subsystemKey: request.subsystemKey, bootstrapToken: request.bootstrapToken, controlProtocolVersions: [1] },
        data: hub.subsystemBinding,
        content,
        state: (() => { const client = createSharedStateClient(); return Object.freeze({ client, terminate: () => client.terminate() }); })(),
        events: (() => { const client = createSessionEventClient(sessionEventHub.createBinding(request.subsystemKey)); return Object.freeze({ client, terminate: () => client.terminate() }); })(),
      });
      void runtime.catch(() => {});
      return Object.freeze({ runtimeControl: { acquire() { return Promise.resolve(pair.left); } }, terminated: runtime, async requestTermination() { await pair.left.close(); } });
    },
  });
  const controller = new AbortController();
  t.after(() => controller.abort(new Error("control port qualification cleanup")));
  const main = runMain({
    bootstrap: { subsystemKeys: game.subsystems.map(({ key }) => key), initial: { subsystemKey: game.initial.subsystem, input: game.initial.input } },
    policy: mainPolicy,
    signal: controller.signal,
    platform: { scheduler, opaqueMaterial: { generate: () => randomBytes(32).toString("base64url") }, runtimeHosting, rendererControl, dataConnections: { replace() {} } },
  });
  void main.catch(() => {});
  await waitFor(() => holder?.current() !== null, "Renderer");
  let browserDelivery = Promise.resolve();
  let latestView;
  const detach = attachRendererPresentation(holder, {
    reevaluate(source, emit) {
      latestView = structuredClone(source.read());
      emitNodeEvent = emit;
      browserDelivery = browserDelivery.then(() => page.evaluate((view) => globalThis.applyControlPortView(view), latestView));
    },
  });
  t.after(detach);
  await waitFor(() => domainRoot(latestView, "lr-map-view")?.root?.data?.viewportWidth === 800 && domainRoot(latestView, "game-controls-input") !== null, "base producer and map view");
  await browserDelivery;
  await page.locator("game-controls-input").waitFor({ state: "attached", timeout: 10_000 });
  assert.equal(await page.locator("game-controls-input").count(), 1);
  await page.locator("body").click();
  const before = forwarded.length;
  await page.keyboard.down("ArrowRight");
  await waitFor(() => domainRoot(latestView, "lr-map-view")?.root?.children?.[0]?.data?.x === 11, `keyboard movement; forwarded=${JSON.stringify(forwarded.slice(before))} errors=${forwardErrors.join(" | ")}`);
  await page.keyboard.up("ArrowRight");
  await browserDelivery;
  const player = domainRoot(latestView, "lr-map-view").root.children[0].data;
  assert.equal(player.x, 11);
  assert.equal(player.y, 8);
  assert.equal(player.direction, 6);
  assert.equal(await page.locator("game-controls-input").count(), 1);
  assert.deepEqual(forwardErrors, []);
  assert.ok(forwarded.slice(before).some((event) => event?.options?.broadcast === "top-frame" && event?.options?.channel === "controls.event" && event?.data?.button === "right" && event?.data?.action === "down"));
  controller.abort(new Error("control port map qualification complete"));
  await main;
});

const dialogueImportMap = JSON.stringify({
  imports: {
    "@loomrealm/foundation": "/packages/foundation/dist/index.js",
    "@loomrealm/foundation/testing": "/packages/foundation/dist/testing/index.js",
    "@loomrealm/wire": "/packages/wire/dist/index.js",
    "@loomrealm/platform-ports": "/packages/platform-ports/dist/index.js",
    "@loomrealm/runtime-control": "/packages/runtime-control/dist/index.js",
    "@loomrealm/shared-state": "/packages/shared-state/dist/index.js",
    "@loomrealm/session-events": "/packages/session-events/dist/index.js",
    "@loomrealm/renderer-control": "/packages/renderer-control/dist/index.js",
    "@loomrealm/data": "/packages/data/dist/index.js",
    "@loomrealm/subsystem": "/packages/subsystem/dist/index.js",
    "@loomrealm/subsystem/host": "/packages/subsystem/dist/host/index.js",
    "@loomrealm/renderer": "/packages/renderer/dist/index.js",
    "@loomrealm/renderer/web-presentation": "/packages/renderer/dist/web-presentation.js",
    "@loomrealm-game/rpg-dialogue": "/game-libs/rpg-dialogue/dist/index.js",
    "@loomrealm-game/common-controls/subsystem": "/game-libs/game-common-controls/dist/subsystem.js",
  },
});

async function dialogueFixture(t) {
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    if (url.pathname === "/") {
      response.setHeader("content-type", "text/html");
      response.end(`<!doctype html><html><head>
        <script type="importmap">${dialogueImportMap}</script>
        <link rel="stylesheet" href="/game-libs/rpg-dialogue/dist/browser/rpg-dialogue.browser.css">
        <script src="/game-libs/rpg-dialogue/dist/browser/rpg-dialogue.browser.js"></script>
        <script src="/game-libs/game-common-controls/dist/browser/device-input.browser.js"></script>
      </head><body></body></html>`);
      return;
    }
    const relative = decodeURIComponent(url.pathname.slice(1));
    if ((relative.startsWith("packages/") || relative.startsWith("game-libs/")) && relative.includes("/dist/")) {
      try {
        response.setHeader("content-type", relative.endsWith(".css") ? "text/css" : "text/javascript");
        response.end(await readFile(path.join(root, relative)));
      } catch { response.statusCode = 404; response.end(); }
      return;
    }
    response.statusCode = 404;
    response.end();
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

test("browser keyboard reaches a test-local Dialogue semantic control through unified controls", { timeout: 45_000 }, async (t) => {
  const origin = await dialogueFixture(t);
  const browser = await chromium.launch({ headless: true, ...(executablePath() ? { executablePath: executablePath() } : {}) });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.goto(origin);
  await page.evaluate(async () => {
    const [foundation, runtimeControl, rendererControl, sharedState, sessionEvents, subsystem, subsystemHost, renderer, presentation, dialogueModule, controls] = await Promise.all([
      import("@loomrealm/foundation/testing"),
      import("@loomrealm/runtime-control"),
      import("@loomrealm/renderer-control"),
      import("@loomrealm/shared-state"),
      import("@loomrealm/session-events"),
      import("@loomrealm/subsystem"),
      import("@loomrealm/subsystem/host"),
      import("@loomrealm/renderer"),
      import("@loomrealm/renderer/web-presentation"),
      import("@loomrealm-game/rpg-dialogue"),
      import("@loomrealm-game/common-controls/subsystem"),
    ]);
    const waitFor = async (predicate, label) => {
      const deadline = performance.now() + 10_000;
      while (performance.now() < deadline) {
        if (predicate()) return;
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      const boot = globalThis.controlPortBoot;
      throw new Error(`Timed out waiting for ${label}; error=${boot?.error ?? "none"}; statuses=${(boot?.statuses ?? []).map((status) => status?.state ?? status?.type ?? "status").join(",")}; failures=${(boot?.failures ?? []).join(" | ")}; controlsDefined=${customElements.get("game-controls-input") !== undefined}; dialogueView=${document.querySelector("lr-dialogue-view") !== null}`);
    };
    const localScheduler = { schedule(ms, callback) { const timer = setTimeout(callback, ms); return () => clearTimeout(timer); } };
    const runtimePair = foundation.createMemoryCarrierPair();
    const dataPair = foundation.createMemoryCarrierPair();
    const rendererPair = foundation.createMemoryCarrierPair();
    const eventHub = sessionEvents.createSessionEventHub();
    const eventsClient = sessionEvents.createSessionEventClient(eventHub.createBinding("dialogue"));
    const presentationPublisher = eventHub.createDelegatedPublisher("web-presentation");
    const statuses = [];
    const renderEvents = [];
    const projectorFailures = [];
    globalThis.controlPortBoot = { statuses, error: null, failures: projectorFailures };
    const mainRuntime = runtimeControl.createMainRuntimeControlPeer({
      carrier: runtimePair.left,
      scheduler: localScheduler,
      frameDeadlineMs: 10_000,
      shutdownDeadlineMs: 5_000,
      authenticateHello: () => ({ kind: "accepted" }),
      handlers: {
        onStatus(status) { statuses.push(status); },
        onFrameCall() { return { kind: "failure", error: { code: "UNEXPECTED_CALL" } }; },
        onFrameReturn() { return { kind: "success", result: {} }; },
      },
    });
    const runtime = subsystemHost.runSubsystem({
      definition: subsystem.defineSubsystem((scope) => ({
        async frame(frame) {
          try {
          const inputHost = scope.createRenderDomain({
            zIndex: 0,
            roots: [{ key: "game-controls-input", tag: "game-controls-input", attrs: {}, data: {}, children: [] }],
          });
          const dialogue = new dialogueModule.RPGDialogue(scope, frame, { cancelable: false, zIndex: 2 });
          // Test-local composition. This button table is not a Dialogue package contract.
          const consumer = controls.createControlsConsumer(scope.presentationEvents, frame, {
            onEvent(event) {
              if (event.action !== "down" || event.repeat || event.button !== "south") return;
              dialogue.controls.confirm();
            },
          });
          try {
            return await dialogue.openConversation({
              conversation: {
                speakerName: "Guide",
                text: "This qualified line is deliberately long enough to remain partially revealed until confirm completes it.",
                choices: [],
                data: { windowStyle: "qualified" },
              },
              characters: [],
            });
          } finally {
            consumer.close();
            inputHost.close();
            dialogue.close();
          }
          } catch (error) {
            globalThis.controlPortBoot.error = error instanceof Error ? `${error.name}: ${error.message}\n${error.stack}` : String(error);
            throw error;
          }
        },
      })),
      runtimeControl: { async acquire() { return runtimePair.right; } },
      runtimePolicy: { scheduler: localScheduler, helloDeadlineMs: 5_000, frameDeadlineMs: 10_000, terminalCleanupDeadlineMs: 1_000 },
      launch: { subsystemKey: "dialogue", bootstrapToken: "secret", controlProtocolVersions: [1] },
      data: { async acquire() { return { carrier: dataPair.left, generation: 1, dataProfile: "loomrealm.renderer-data/3" }; } },
      state: (() => { const client = sharedState.createSharedStateClient(); return Object.freeze({ client, terminate: () => client.terminate() }); })(),
      events: (() => Object.freeze({ client: eventsClient, terminate: () => { eventsClient.terminate(); eventHub.terminate(); } }))(),
    });
    runtime.catch(() => {});
    const holder = renderer.createRendererControlHolder({
      async acquire(subsystemKey, generation, dataProfile) {
        if (subsystemKey !== "dialogue" || generation !== 1 || dataProfile !== "loomrealm.renderer-data/3") throw new Error("Unexpected Data authority");
        return dataPair.right;
      },
    }, undefined, {
      publish(event) { return presentationPublisher.publish(event.channel, event.type, event.payload, event.ownerSubsystemKey); },
    });
    const projector = new presentation.WebProjector({
      document,
      resourceClient: { async resource() { throw new Error("unused"); } },
      reportFailure(error) { projectorFailures.push(String(error)); },
    });
    presentation.attachRendererPresentation(holder, {
      reevaluate(source, emitNodeEvent) { projector.reevaluate(source, emitNodeEvent); },
      deliverRenderEvent(event) { renderEvents.push(structuredClone(event)); projector.deliverRenderEvent(event); },
    });
    const snapshot = {
      sessionId: "control-port-dialogue",
      revision: 1,
      runtimes: [{ subsystemKey: "dialogue", state: "ready" }],
      stack: [{ frameId: "dialogue-frame", subsystemKey: "dialogue", lifecycle: "active", activationId: "dialogue-activation" }],
      dataAuthorities: [{ subsystemKey: "dialogue", generation: 1, dataProfile: "loomrealm.renderer-data/3" }],
    };
    rendererControl.createMainRendererControlPeer({
      carrier: rendererPair.left,
      acceptHello() { return { kind: "accepted", snapshot, preparedHelloText: rendererControl.prepareRendererHelloResultV2(snapshot) }; },
    });
    await holder.connect({ carrier: rendererPair.right, rendererControlToken: "renderer-token" });
    await mainRuntime.identified;
    await waitFor(() => statuses.some((status) => status.state === "ready"), "Subsystem ready");
    await mainRuntime.frame.initialize({ frameId: "dialogue-frame", input: null });
    await mainRuntime.frame.activate({ frameId: "dialogue-frame", activationId: "dialogue-activation" });
    await waitFor(() => document.querySelector("lr-dialogue-conversation") !== null && document.querySelector("game-controls-input") !== null, "projected Dialogue and controls");
    globalThis.controlPortDialogue = {
      renderEvents,
      projectorFailures,
      ignoredKeyboard(code) {
        return presentationPublisher.publish("keyboard.event", "input.event", {
          domainId: "keyboard-device", targetKey: "keyboard-device",
          data: { action: "down", code, repeat: false },
        });
      },
    };
  });

  assert.equal(await page.locator("game-controls-input").count(), 1);
  assert.equal(await page.evaluate(() => document.querySelector("lr-dialogue-conversation")._revealComplete), false);
  await page.evaluate(() => globalThis.controlPortDialogue.ignoredKeyboard("KeyZ"));
  assert.equal(await page.evaluate(() => document.querySelector("lr-dialogue-conversation")._revealComplete), false);
  await page.keyboard.press("KeyZ");
  await page.waitForFunction(() => document.querySelector("lr-dialogue-conversation")?._revealComplete === true);
  const observed = await page.evaluate(() => ({
    names: globalThis.controlPortDialogue.renderEvents.map((event) => event.name),
    failures: globalThis.controlPortDialogue.projectorFailures,
    producers: document.querySelectorAll("game-controls-input").length,
  }));
  assert.deepEqual(observed.failures, []);
  assert.equal(observed.producers, 1);
  assert.equal(observed.names[0], "commit");
});
