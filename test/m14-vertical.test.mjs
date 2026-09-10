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
import { createRendererControlHolder } from "@loomrealm/renderer";
import { runSubsystem } from "@loomrealm/subsystem/host";
import mapDefinition from "@loomrealm-game/map";
import { attachRendererPresentation } from "../packages/renderer/dist/internal/presentation-seam.js";
import { prepareExamplePresentation } from "../examples/essentials-v21.1/test/prepare.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const exampleRoot = path.join(root, "examples", "essentials-v21.1");
const scheduler = Object.freeze({ schedule(ms, callback) { const timer = setTimeout(callback, ms); return () => clearTimeout(timer); } });
const runtimePolicy = Object.freeze({ scheduler, helloDeadlineMs: 5_000, frameDeadlineMs: 5_000, terminalCleanupDeadlineMs: 100 });
const mainPolicy = Object.freeze({ runtimeBootstrapDeadlineMs: 5_000, frameDeadlineMs: 5_000, shutdownDeadlineMs: 5_000, terminationDeadlineMs: 1_000 });
const hash = (bytes) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;

function executablePath() {
  return [process.env.LOOMREALM_CHROMIUM_PATH, "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe", "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"].filter(Boolean).find(existsSync);
}

async function waitFor(predicate, label, timeout = 10_000) {
  const deadline = Date.now() + timeout;
  while (!(await predicate())) {
    if (Date.now() >= deadline) assert.fail(`Timed out waiting for ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

function createDataHub() {
  const waiting = [];
  const pairs = [];
  const take = () => {
    while (waiting.length && pairs.length) waiting.shift().resolve(pairs.shift());
  };
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

test("M14 checked-in game traverses Main, Input, Render, Content and real Chromium", { timeout: 30_000 }, async (t) => {
  const fixture = JSON.parse(await readFile(path.join(exampleRoot, "fixtures", "semantic-content.json"), "utf8"));
  const tilesetBytes = await readFile(path.join(exampleRoot, "fixtures", "resources", "m14_tileset.png"));
  const playerBytes = await readFile(path.join(exampleRoot, "fixtures", "resources", "m14_player.png"));
  const resources = new Map([
    ["resource.Graphics/Tilesets/m14_tileset", { bytes: tilesetBytes, mime: "image/png", contentVersion: hash(tilesetBytes) }],
    ["resource.Graphics/Characters/m14_player", { bytes: playerBytes, mime: "image/png", contentVersion: hash(playerBytes) }],
  ]);
  const server = await fixtureServer(t, resources);
  const game = parseGameEntryV1(await readFile(path.join(exampleRoot, "game.json"), "utf8"));
  const content = Object.freeze({
    async record(namespace, key) { const value = fixture.records[`${namespace}/${key}`]; if (!value) throw new Error("record missing"); return { value, contentVersion: hash(Buffer.from(JSON.stringify(value))) }; },
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
  let inputEmit;
  const inputSource = Object.freeze({ start(emit) { inputEmit = emit; emit({ kind: "availability", channel: "keyboard.event", available: true }); return () => {}; } });
  let holder;
  const rendererControl = Object.freeze({
    acquire(token, signal) {
      if (holder) return new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));
      const pair = createMemoryCarrierPair();
      holder = createRendererControlHolder(hub.rendererBinding, inputSource);
      void holder.connect({ carrier: pair.right, rendererControlToken: token });
      return Promise.resolve(pair.left);
    },
  });
  const runtimeHosting = Object.freeze({
    async launch(request) {
      assert.equal(request.subsystemKey, "map");
      const pair = createMemoryCarrierPair();
      let acquired = false;
      const runtime = runSubsystem({
        definition: mapDefinition, runtimeControl: { acquire() { assert.equal(acquired, false); acquired = true; return Promise.resolve(pair.right); } },
        runtimePolicy, launch: { subsystemKey: request.subsystemKey, bootstrapToken: request.bootstrapToken, controlProtocolVersions: [1] }, data: hub.subsystemBinding, content,
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
  await waitFor(() => holder?.current() !== null && typeof inputEmit === "function", "Renderer and input source");

  let browserDelivery = Promise.resolve(); let latestView;
  const detach = attachRendererPresentation(holder, { reevaluate(source) { latestView = structuredClone(source.read()); browserDelivery = browserDelivery.then(() => page.evaluate((view) => globalThis.applyM14View(view), latestView)); } });
  t.after(detach);
  await waitFor(() => latestView?.subsystems[0]?.domains[0]?.roots[0]?.data?.cameraX === 16, "initial map Render state");
  await browserDelivery;
  await waitFor(() => page.evaluate(() => document.querySelector("lr-map-view")?.shadowRoot?.querySelector("canvas").getContext("2d").getImageData(373, 229, 1, 1).data[3] === 255), "initial Canvas paint");
  await waitFor(() => page.evaluate(() => document.querySelector("lr-map-sprite")?.shadowRoot?.querySelector("canvas").getContext("2d").getImageData(5, 5, 1, 1).data[3] === 255), "initial player paint");
  const initial = await page.evaluate(() => {
    const view = document.querySelector("lr-map-view"); const sprite = document.querySelector("lr-map-sprite");
    view.instance = 1; sprite.instance = 2;
    return { size: [getComputedStyle(view).width, getComputedStyle(view).height], children: view.children.length, tags: [view.tagName, sprite.tagName], tile: [...view.shadowRoot.querySelector("canvas").getContext("2d").getImageData(373, 229, 1, 1).data], player: [...sprite.shadowRoot.querySelector("canvas").getContext("2d").getImageData(5, 5, 1, 1).data] };
  });
  assert.deepEqual(initial.size, ["640px", "480px"]); assert.equal(initial.children, 1); assert.deepEqual(initial.tags, ["LR-MAP-VIEW", "LR-MAP-SPRITE"]); assert.deepEqual(initial.tile, fixture.expectedPixels.tile385); assert.deepEqual(initial.player, fixture.expectedPixels.playerDown);

  inputEmit({ kind: "event", channel: "keyboard.event", payload: { action: "down", code: "ArrowRight", repeat: false } });
  await waitFor(() => latestView?.subsystems[0]?.domains[0]?.roots[0]?.children[0]?.data?.x === 11, "first movement commit"); await browserDelivery;
  const moved = latestView.subsystems[0].domains[0].roots[0];
  assert.equal(moved.data.cameraX, 48); assert.deepEqual([moved.children[0].data.screenX, moved.children[0].data.screenY, moved.children[0].data.direction], [304, 224, 6]);
  await waitFor(() => page.evaluate(() => document.querySelector("lr-map-sprite")?.shadowRoot?.querySelector("canvas").getContext("2d").getImageData(5, 5, 1, 1).data[2] === 240), "right-facing player crop");
  assert.deepEqual(await page.evaluate(() => [...document.querySelector("lr-map-sprite").shadowRoot.querySelector("canvas").getContext("2d").getImageData(5, 5, 1, 1).data]), fixture.expectedPixels.playerRight);
  assert.deepEqual(await page.evaluate(() => [document.querySelector("lr-map-view").instance, document.querySelector("lr-map-sprite").instance]), [1, 2]);
  inputEmit({ kind: "event", channel: "keyboard.event", payload: { action: "down", code: "ArrowRight", repeat: false } });
  await waitFor(() => latestView?.subsystems[0]?.domains[0]?.roots[0]?.children[0]?.data?.direction === 6, "blocked movement render"); await new Promise((resolve) => setTimeout(resolve, 20));
  const blocked = latestView.subsystems[0].domains[0].roots[0];
  assert.equal(blocked.children[0].data.x, 11); assert.equal(blocked.data.cameraX, 48);
  assert.equal(await page.evaluate(() => document.querySelectorAll("lr-map-view lr-map-sprite").length), 1);
  assert.equal(await page.evaluate(() => document.querySelectorAll("lr-map-tile").length), 0);
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
  const result = await page.evaluate(async ({ bytes, version }) => {
    const view = document.createElement("lr-map-view"); document.body.append(view);
    let release; const gate = new Promise((resolve) => { release = resolve; });
    view.receiveRenderContext({ resources: { async resource() { await gate; return { bytes: Uint8Array.from(bytes), mime: "image/png", contentVersion: version }; } } });
    const tileset = { namespace: "resource.Graphics", key: "Tilesets/m14_tileset", contentVersion: version };
    view.receiveRenderData({ mapId: 1, mapWidth: 24, mapHeight: 18, cameraX: 0, cameraY: 0, tileset, tiles: [{ x: 0, y: 0, z: 0, tileId: 384 }] });
    view.receiveRenderData({ mapId: 1, mapWidth: 24, mapHeight: 18, cameraX: 0, cameraY: 0, tileset, tiles: [{ x: 1, y: 0, z: 0, tileId: 385 }] });
    release(); await new Promise((resolve) => setTimeout(resolve, 50));
    const context = view.shadowRoot.querySelector("canvas").getContext("2d");
    const stale = [...context.getImageData(5, 5, 1, 1).data]; const latest = [...context.getImageData(37, 5, 1, 1).data];
    view.receiveRenderData({ mapId: 1, mapWidth: 24, mapHeight: 18, cameraX: 0, cameraY: 0, tileset, tiles: [] });
    const cleared = [...context.getImageData(37, 5, 1, 1).data];
    return { stale, latest, cleared };
  }, { bytes: [...tileset], version: hash(tileset) });
  assert.equal(result.stale[3], 0); assert.deepEqual(result.latest, [40, 80, 220, 255]); assert.equal(result.cleared[3], 0);
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
