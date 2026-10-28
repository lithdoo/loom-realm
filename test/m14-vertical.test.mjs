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
import { RPGMapBuilder } from "@loomrealm-game/map";
import { attachRendererPresentation } from "../packages/renderer/dist/internal/presentation-seam.js";
import { prepareExamplePresentation } from "../examples/essentials-v21.1/test/prepare.mjs";
import baseSubsystem from "../examples/essentials-v21.1/subsystems/base.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const exampleRoot = path.join(root, "examples", "essentials-v21.1");
const scheduler = Object.freeze({ schedule(ms, callback) { const timer = setTimeout(callback, ms); return () => clearTimeout(timer); } });
const runtimePolicy = Object.freeze({ scheduler, helloDeadlineMs: 5_000, frameDeadlineMs: 5_000, terminalCleanupDeadlineMs: 100 });
const mainPolicy = Object.freeze({ runtimeBootstrapDeadlineMs: 5_000, frameDeadlineMs: 5_000, shutdownDeadlineMs: 5_000, terminationDeadlineMs: 1_000 });
const hash = (bytes) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
let activeMapControls;
const mapSubsystem = defineSubsystem((scope) => ({
  async frame(frame) {
    const input = frame.params;
    const map = new RPGMapBuilder(scope, frame).build({ player: { characterName: input.characterName } });
    map.onMapEntering((context) => {
      context.setNPC([{ instanceId: "guide", npcId: "guide", x: 14, y: 8, direction: 4, pattern: 2 }]);
    });
    activeMapControls = map.controls;
    try { return await map.run({ mapId: input.mapId, x: input.x, y: input.y }); }
    finally { activeMapControls = undefined; }
  },
}));
const subsystemDefinitions = Object.freeze({ base: baseSubsystem, map: mapSubsystem });

function mapRoot(view) {
  return view?.subsystems.find(({ subsystemKey }) => subsystemKey === "map")?.domains[0]?.roots[0];
}

function executablePath() {
  return [process.env.LOOMREALM_CHROMIUM_PATH, "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe", "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"].filter(Boolean).find(existsSync);
}

async function sampleVisibleTilePixel(page, sx, sy) {
  return page.evaluate(({ x: sx0, y: sy0 }) => {
    const canvases = [...(document.querySelector("lr-map-view")?.shadowRoot?.querySelectorAll("canvas.tile-layer") ?? [])].filter((canvas) => !canvas.hidden);
    for (const canvas of canvases) {
      const left = Number.parseFloat(canvas.style.left) || 0;
      const top = Number.parseFloat(canvas.style.top) || 0;
      const x = sx0 - left;
      const y = sy0 - top;
      if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) continue;
      return [...canvas.getContext("2d").getImageData(x, y, 1, 1).data];
    }
    return [0, 0, 0, 0];
  }, { x: sx, y: sy });
}

async function waitFor(predicate, label, timeout = 10_000) {
  const deadline = Date.now() + timeout;
  while (!(await predicate())) {
    if (Date.now() >= deadline) assert.fail(`Timed out waiting for ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

async function evaluateWithTimeout(page, callback, argument, timeoutMs, label) {
  let timer;
  try {
    return await Promise.race([
      page.evaluate(callback, argument),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`Timed out waiting for ${label}`));
          void page.close({ runBeforeUnload: false }).catch(() => {});
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function createDataHub() {
  const waiting = new Map();
  const pairs = new Map();
  const take = (subsystemKey) => {
    const pending = waiting.get(subsystemKey) ?? [];
    const available = pairs.get(subsystemKey) ?? [];
    while (pending.length && available.length) pending.shift().resolve(available.shift());
  };
  return {
    subsystemBinding(subsystemKey) { return Object.freeze({
      acquire(signal) {
        if (signal.aborted) return Promise.reject(signal.reason);
        return new Promise((resolve, reject) => {
          const request = { resolve, reject };
          const pending = waiting.get(subsystemKey) ?? [];
          waiting.set(subsystemKey, pending);
          pending.push(request); take(subsystemKey);
          signal.addEventListener("abort", () => { const index = pending.indexOf(request); if (index >= 0) pending.splice(index, 1); reject(signal.reason); }, { once: true });
        });
      },
    }); },
    rendererBinding: Object.freeze({
      acquire(subsystemKey, generation, dataProfile) {
        const pair = createMemoryCarrierPair();
        const available = pairs.get(subsystemKey) ?? [];
        pairs.set(subsystemKey, available);
        available.push({ carrier: pair.left, generation, dataProfile }); take(subsystemKey);
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
      const leaf = path.basename(url.pathname);
      try { response.setHeader("content-type", "text/javascript"); response.end(await readFile(path.join(root, "packages", "renderer", "dist", "internal", leaf))); } catch { response.statusCode = 404; response.end(); }
      return;
    }
    for (const artifact of presentation?.artifacts.values() ?? []) {
      if (url.pathname === artifact.browserPath) { response.setHeader("content-type", artifact.mime); response.end(artifact.bytes); return; }
    }
    const resourcePrefix = "/_lr/v1/games/m14/resources/";
    if (url.pathname.startsWith(resourcePrefix)) {
      if (request.headers.authorization !== "Bearer m14-token") { response.statusCode = 401; response.end(); return; }
      const identity = decodeURIComponent(url.pathname.slice(resourcePrefix.length));
      const resource = resources.get(identity);
      if (!resource) { response.statusCode = 404; response.end(); return; }
      response.setHeader("content-type", resource.mime);
      response.setHeader("x-loom-content-version", resource.contentVersion);
      response.setHeader("etag", `"${resource.contentVersion}"`);
      response.end(resource.bytes); return;
    }
    response.statusCode = 404; response.end();
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  presentation = await prepareExamplePresentation(origin);
  return { origin, presentation };
}

test("M14 checked-in game traverses Main, Presentation Events, Render, Content and real Chromium", { timeout: 30_000 }, async (t) => {
  const fixture = JSON.parse(await readFile(path.join(exampleRoot, "fixtures", "semantic-content.json"), "utf8"));
  const tilesetBytes = await readFile(path.join(exampleRoot, "fixtures", "resources", "m14_tileset.png"));
  const playerBytes = await readFile(path.join(exampleRoot, "fixtures", "resources", "m14_player.png"));
  const npcBytes = await readFile(path.join(exampleRoot, "fixtures", "resources", "m14_npc.png"));
  const resources = new Map([
    ["resource.Graphics/Tilesets/m14_tileset", { bytes: tilesetBytes, mime: "image/png", contentVersion: hash(tilesetBytes) }],
    ["resource.Graphics/Characters/m14_player", { bytes: playerBytes, mime: "image/png", contentVersion: hash(playerBytes) }],
    ["resource.Graphics/Characters/m14_npc", { bytes: npcBytes, mime: "image/png", contentVersion: hash(npcBytes) }],
  ]);
  const server = await fixtureServer(t, resources);
  const game = parseGameEntryV1(await readFile(path.join(exampleRoot, "game.json"), "utf8"));
  const content = Object.freeze({
    async record(namespace, key) { const value = fixture.records[`${namespace}/${key}`]; if (!value) throw new Error("record missing"); return { value, contentVersion: hash(Buffer.from(JSON.stringify(value))) }; },
    async group() { throw new Error("group missing"); },
    async resource(namespace, key) { const value = resources.get(`${namespace}/${key}`); if (!value) throw new Error("resource missing"); return { ...value, bytes: Uint8Array.from(value.bytes) }; },
  });

  const browser = await chromium.launch({ headless: true, ...(executablePath() ? { executablePath: executablePath() } : {}) });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 800, height: 600 }, deviceScaleFactor: 1 });
  await page.goto(server.origin);
  await page.evaluate(async ({ origin, prepared }) => {
    const { bootstrapWebPresentation } = await import(`${origin}/packages/renderer/dist/internal/web-presentation-bootstrap.js`);
    const { createRendererResourceClient } = await import(`${origin}/packages/renderer/dist/internal/resource-client.js`);
    const { WebProjector } = await import(`${origin}/packages/renderer/dist/internal/web-projector.js`);
    const lifetime = new AbortController();
    const resourceClient = createRendererResourceClient({ origin, installationId: "m14", token: "m14-token" }, lifetime.signal);
    await bootstrapWebPresentation(window, prepared, () => {
      const projector = new WebProjector({ document, resourceClient });
      globalThis.applyM14View = (view) => projector.reevaluate({ read: () => view });
      globalThis.teardownM14 = () => { projector.teardown(); lifetime.abort(); };
    });
  }, { origin: server.origin, prepared: server.presentation.prepared });
  t.after(() => page.evaluate(() => globalThis.teardownM14?.()).catch(() => {}));

  const hub = createDataHub();
  const sessionEventHub = createSessionEventHub();
  t.after(() => sessionEventHub.terminate());
  let viewportEmit;
  const viewportSource = Object.freeze({ start(emit) { viewportEmit = emit; emit({ width: 800, height: 600 }); return () => {}; } });
  let holder;
  const rendererControl = Object.freeze({
    acquire(token, signal) {
      if (holder) return new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));
      const pair = createMemoryCarrierPair();
      holder = createRendererControlHolder(hub.rendererBinding, viewportSource, {
        async publish(event) {
          const publisher = sessionEventHub.createDelegatedPublisher(event.ownerSubsystemKey);
          await publisher.publish(
            event.channel,
            event.type,
            event.payload,
            event.broadcast ? undefined : event.ownerSubsystemKey,
          );
        },
      });
      void holder.connect({ carrier: pair.right, rendererControlToken: token });
      return Promise.resolve(pair.left);
    },
  });
  const runtimeHosting = Object.freeze({
    async launch(request) {
      assert.ok(request.subsystemKey in subsystemDefinitions);
      const pair = createMemoryCarrierPair();
      let acquired = false;
      const runtime = runSubsystem({
        definition: subsystemDefinitions[request.subsystemKey], runtimeControl: { acquire() { assert.equal(acquired, false); acquired = true; return Promise.resolve(pair.right); } },
        runtimePolicy, launch: { subsystemKey: request.subsystemKey, bootstrapToken: request.bootstrapToken, controlProtocolVersions: [1] }, data: hub.subsystemBinding(request.subsystemKey), content,
        state: (() => { const client = createSharedStateClient(); return Object.freeze({ client, terminate: () => client.terminate() }); })(),
        events: (() => { const client = createSessionEventClient(sessionEventHub.createBinding(request.subsystemKey)); return Object.freeze({ client, terminate: () => client.terminate() }); })(),
      });
      void runtime.catch(() => {});
      return Object.freeze({ runtimeControl: { acquire() { return Promise.resolve(pair.left); } }, terminated: runtime, async requestTermination() { await pair.left.close(); } });
    },
  });
  const controller = new AbortController();
  t.after(() => controller.abort(new Error("M14 cleanup")));
  const main = runMain({
    bootstrap: { subsystemKeys: game.subsystems.map(({ key }) => key), initial: { subsystemKey: game.initial.subsystem, input: game.initial.input } },
    policy: mainPolicy, signal: controller.signal,
    platform: { scheduler, opaqueMaterial: { generate: () => randomBytes(32).toString("base64url") }, runtimeHosting, rendererControl, dataConnections: { replace() {} } },
  });
  void main.catch(() => {});
  await waitFor(() => holder?.current() !== null, "Renderer");

  let browserDelivery = Promise.resolve(); let latestView;
  const detach = attachRendererPresentation(holder, { reevaluate(source) { latestView = structuredClone(source.read()); browserDelivery = browserDelivery.then(() => page.evaluate((view) => globalThis.applyM14View(view), latestView)); } });
  t.after(detach);
  await waitFor(() => activeMapControls && mapRoot(latestView)?.data?.viewportWidth === 800, "initial map Render state");
  await browserDelivery;
  await waitFor(async () => (await sampleVisibleTilePixel(page, 400, 268))[3] === 255, "initial Canvas paint");
  await waitFor(() => page.evaluate(() => document.querySelector("lr-map-sprite")?.shadowRoot?.querySelector("canvas")?.getContext("2d")?.getImageData(5, 5, 1, 1).data[3] === 255), "initial player paint");
  const initial = await page.evaluate(async () => {
    const view = document.querySelector("lr-map-view"); const sprite = document.querySelector("lr-map-sprite");
    view.instance = 1; sprite.instance = 2;
    return { size: [getComputedStyle(view).width, getComputedStyle(view).height], children: view.children.length, tags: [view.tagName, sprite.tagName], player: [...sprite.shadowRoot.querySelector("canvas").getContext("2d").getImageData(5, 5, 1, 1).data] };
  });
  initial.tile = await sampleVisibleTilePixel(page, 400, 268);
  assert.deepEqual(initial.size, ["800px", "600px"]); assert.equal(initial.children, 2); assert.deepEqual(initial.tags, ["LR-MAP-VIEW", "LR-MAP-SPRITE"]); assert.deepEqual(initial.tile, fixture.expectedPixels.tile385); assert.deepEqual(initial.player, fixture.expectedPixels.playerDown);
  assert.deepEqual(await page.evaluate(() => {
    const root = document.querySelector("lr-map-view").shadowRoot;
    const footer = root.querySelector("footer");
    const content = root.querySelector(".map-content");
    return [getComputedStyle(content).height, getComputedStyle(footer).height, footer.textContent];
  }), ["568px", "32px", "1"]);

  assert.equal(await page.locator("game-controls-input").count(), 1);
  activeMapControls.setMoveIntent(6);
  await waitFor(() => mapRoot(latestView)?.children[0]?.data?.x === 11, "first movement commit"); await browserDelivery;
  activeMapControls.setMoveIntent(null);
  const moved = mapRoot(latestView);
  assert.equal(moved.data.cameraX, 0); assert.deepEqual([moved.children[0].data.screenX, moved.children[0].data.screenY, moved.children[0].data.direction], [352, 256, 6]);
  await waitFor(() => page.evaluate(() => document.querySelector("lr-map-sprite")?.shadowRoot?.querySelector("canvas").getContext("2d").getImageData(5, 5, 1, 1).data[2] === 240), "right-facing player crop");
  assert.deepEqual(await page.evaluate(() => [...document.querySelector("lr-map-sprite").shadowRoot.querySelector("canvas").getContext("2d").getImageData(5, 5, 1, 1).data]), fixture.expectedPixels.playerRight);
  assert.deepEqual(await page.evaluate(() => [document.querySelector("lr-map-view").instance, document.querySelector("lr-map-sprite").instance]), [1, 2]);
  activeMapControls.setMoveIntent(6);
  await waitFor(() => mapRoot(latestView)?.children[0]?.data?.direction === 6, "blocked movement render"); await new Promise((resolve) => setTimeout(resolve, 20));
  const blocked = mapRoot(latestView);
  assert.equal(blocked.children[0].data.x, 11); assert.equal(blocked.data.cameraX, 0);
  assert.equal(await page.evaluate(() => document.querySelectorAll("lr-map-view lr-map-sprite").length), 2);
  assert.equal(await page.evaluate(() => document.querySelectorAll("lr-map-tile").length), 0);

  for (const expected of [
    { width: 640, height: 480, contentHeight: 448, barHeight: 32, columns: 20, rows: 14 },
    { width: 1280, height: 720, contentHeight: 672, barHeight: 48, columns: 40, rows: 21 },
    { width: 1920, height: 1080, contentHeight: 1032, barHeight: 48, columns: 60, rows: 33 },
    { width: 1920, height: 480, contentHeight: 448, barHeight: 32, columns: 60, rows: 14 },
    { width: 640, height: 1080, contentHeight: 1032, barHeight: 48, columns: 20, rows: 33 },
  ]) {
    await page.setViewportSize({ width: expected.width, height: expected.height });
    viewportEmit({ width: expected.width, height: expected.height });
    await waitFor(() => {
      const data = mapRoot(latestView)?.data;
      return data?.viewportWidth === expected.width && data?.viewportHeight === expected.height;
    }, `responsive ${expected.width}x${expected.height} Render state`);
    await browserDelivery;
    await waitFor(async () => (await page.evaluate(({ width, height }) => {
      const view = document.querySelector("lr-map-view");
      return view?.dataset.mapVisualState === "ready"
        && view?._accepted?.view?.viewportWidth === width
        && view?._accepted?.view?.viewportHeight === height;
    }, expected)), "responsive browser commit");
    const actual = await page.evaluate(() => {
      const view = document.querySelector("lr-map-view");
      const root = view.shadowRoot;
      const content = root.querySelector(".map-content");
      const footer = root.querySelector("footer");
      const world = root.querySelector(".map-world");
      return {
        inner: [innerWidth, innerHeight],
        host: [view.clientWidth, view.clientHeight],
        content: [content.clientWidth, content.clientHeight],
        footer: [footer.clientWidth, footer.clientHeight, footer.textContent],
        world: [world.clientWidth, world.clientHeight],
        transform: getComputedStyle(world).transform,
        state: view.dataset.mapVisualState,
      };
    });
    assert.deepEqual(actual.inner, [expected.width, expected.height]);
    assert.deepEqual(actual.host, [expected.width, expected.height]);
    assert.deepEqual(actual.content, [expected.width, expected.contentHeight]);
    assert.deepEqual(actual.footer, [expected.width, expected.barHeight, "1"]);
    assert.deepEqual(actual.world, [expected.columns * 32, expected.rows * 32]);
    assert.notEqual(actual.transform, "none");
    assert.equal(actual.state, "ready");
  }
  controller.abort(new Error("M14 qualification complete"));
  await main;
});

test("map view clears full state and delayed same-resource decode paints only latest data", { timeout: 15_000 }, async (t) => {
  const tileset = await readFile(path.join(exampleRoot, "fixtures", "resources", "m14_tileset.png"));
  const resources = new Map([["resource.Graphics/Tilesets/m14_tileset", { bytes: tileset, mime: "image/png", contentVersion: hash(tileset) }]]);
  const server = await fixtureServer(t, resources);
  const browser = await chromium.launch({ headless: true, ...(executablePath() ? { executablePath: executablePath() } : {}) }); t.after(() => browser.close());
  const page = await browser.newPage(); await page.goto(server.origin);
  await page.addScriptTag({ url: `${server.origin}/presentation/map/map.browser.js` });
  const result = await evaluateWithTimeout(page, async ({ bytes, version }) => {
    const view = document.createElement("lr-map-view"); document.body.append(view);
    let release; const gate = new Promise((resolve) => { release = resolve; });
    view.receiveRenderContext({ resources: { async resource() { await gate; return { bytes: Uint8Array.from(bytes), mime: "image/png", contentVersion: version }; } } });
    const tileset = { namespace: "resource.Graphics", key: "Tilesets/m14_tileset", contentVersion: version };
    const autotiles = [null, null, null, null, null, null, null];
    const viewPayload = (visualEpoch, localX, tileId, sourceIndex) => {
      return {
        sceneEpoch: 1, visualEpoch, motionId: null,
        viewportWidth: 640, viewportHeight: 480,
        barHeight: 32, contentWidth: 640, contentHeight: 448,
        columns: 20, rows: 14, logicalWidth: 640, logicalHeight: 448,
        scaleX: 1, scaleY: 1, mapName: "1",
        mapId: 1, mapWidth: 24, mapHeight: 18, cameraX: 0, cameraY: 0,
        tileset, autotiles,
        tiles: sourceIndex === null ? [] : [[localX, 0, 0, tileId, 0]],
        cameraMotion: null,
        bridgeLevel: 0,
      };
    };
    const sample = (sx, sy) => {
      const canvases = [...view.shadowRoot.querySelectorAll("canvas.tile-layer")].filter((canvas) => !canvas.hidden);
      for (const canvas of canvases) {
        const left = Number.parseFloat(canvas.style.left) || 0;
        const top = Number.parseFloat(canvas.style.top) || 0;
        const x = sx - left;
        const y = sy - top;
        if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) continue;
        return [...canvas.getContext("2d").getImageData(x, y, 1, 1).data];
      }
      return [0, 0, 0, 0];
    };
    let forceTimerFallbackOnce = true;
    const nextVisualPoll = () => new Promise((resolve) => {
      let settled = false;
      let frame = 0;
      let timer;
      const finish = () => {
        if (settled) return;
        settled = true;
        if (timer !== undefined) clearTimeout(timer);
        if (frame !== 0) cancelAnimationFrame(frame);
        resolve();
      };
      if (forceTimerFallbackOnce) forceTimerFallbackOnce = false;
      else frame = requestAnimationFrame(finish);
      timer = setTimeout(finish, 50);
    });
    const waitForSample = async (read, accept, label) => {
      const deadline = performance.now() + 5_000;
      while (true) {
        const value = read();
        if (accept(value)) return value;
        if (performance.now() >= deadline) throw new Error(`Timed out waiting for ${label}`);
        await nextVisualPoll();
      }
    };
    view.receiveRenderData(viewPayload(1, 0, 384, 0));
    view.receiveRenderData(viewPayload(2, 1, 385, 1));
    release();
    const latest = await waitForSample(
      () => sample(37, 5),
      (pixel) => pixel[0] === 40 && pixel[1] === 80 && pixel[2] === 220 && pixel[3] === 255,
      "latest map paint",
    );
    const stale = sample(5, 5);
    view.receiveRenderData(viewPayload(3, 0, 0, null));
    const cleared = await waitForSample(
      () => sample(37, 5),
      (pixel) => pixel[3] === 0,
      "cleared map paint",
    );
    return { stale, latest, cleared };
  }, { bytes: [...tileset], version: hash(tileset) }, 12_000, "bounded map paint evaluation");
  assert.equal(result.stale[3], 0); assert.deepEqual(result.latest, [40, 80, 220, 255]); assert.equal(result.cleared[3], 0);
});

test("browser evaluation watchdog bounds a non-settling page task", { timeout: 5_000 }, async (t) => {
  const browser = await chromium.launch({ headless: true, ...(executablePath() ? { executablePath: executablePath() } : {}) });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await assert.rejects(
    evaluateWithTimeout(
      page,
      async () => new Promise(() => {}),
      undefined,
      100,
      "hung browser evaluation",
    ),
    /Timed out waiting for hung browser evaluation/,
  );
  await waitFor(() => page.isClosed(), "watchdog page close", 1_000);
});

test("map browser registration fails closed when an owned tag is already registered", { timeout: 15_000 }, async (t) => {
  const browser = await chromium.launch({ headless: true, ...(executablePath() ? { executablePath: executablePath() } : {}) });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.setContent("<!doctype html><html><body></body></html>");
  await page.evaluate(() => customElements.define("lr-map-view", class ConflictingMapView extends HTMLElement {}));
  const browserSource = await readFile(path.join(root, "game-libs", "map", "dist", "browser", "map.browser.js"), "utf8");
  await assert.rejects(page.evaluate((source) => (0, eval)(source), browserSource), /register|defined/i);
  assert.equal(await page.evaluate(() => customElements.get("lr-map-sprite")), undefined);
});
