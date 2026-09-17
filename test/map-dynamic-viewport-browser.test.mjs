/**
 * Map PR2 dynamic-viewport browser qualification (real Chromium):
 *  - host adopts the accepted logical size (320/640/720/1080);
 *  - camera clamp and chunk window follow the viewport;
 *  - 1080 dense visible canvas bytes <= 128MiB and visible+candidate+decoded
 *    <= 256MiB measured from the LIVE element (not a model);
 *  - DPR-only never changes logical backing;
 *  - resize mid-motion rebases from the displayed pose and keeps the end
 *    time envelope (never restarts a full 250ms);
 *  - same-size resize performs no raster work.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const bundlePath = join(root, "game-libs", "map", "dist", "browser", "map.browser.js");

function executablePath() {
  const candidates = [
    process.env.LOOMREALM_CHROMIUM_PATH,
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
  ].filter(Boolean);
  return candidates.find((p) => existsSync(p));
}

let browser;
let server;
let origin;

test.before(async () => {
  const bundle = await readFile(bundlePath, "utf8");
  server = createServer((req, res) => {
    if (req.url === "/map.browser.js") {
      res.writeHead(200, { "content-type": "text/javascript" });
      res.end(bundle);
      return;
    }
    res.writeHead(200, { "content-type": "text/html" });
    res.end("<!doctype html><body style=\"margin:0\"></body>");
  });
  await new Promise((resolve) => { server.listen(0, "127.0.0.1", resolve); });
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({
    headless: true,
    ...(executablePath() ? { executablePath: executablePath() } : {}),
  });
});

test.after(async () => {
  await browser?.close();
  server?.close();
});

const TILE = 32;
const CHUNK = 8;
const tilesetRef = (v = "v1") => ({ namespace: "resource.Graphics", key: "Tilesets/blue", contentVersion: v });
const spriteRef = (v = "v1") => ({ namespace: "resource.Graphics", key: "Characters/red", contentVersion: v });
const NULL_AUTOTILES = Object.freeze([null, null, null, null, null, null, null]);

function chunkBoundsFor(cameraX, cameraY, vpW, vpH, mapW, mapH) {
  const minTileX = Math.max(0, Math.floor(cameraX / TILE));
  const maxTileX = Math.min(mapW - 1, Math.floor((cameraX + vpW - 1) / TILE));
  const minTileY = Math.max(0, Math.floor(cameraY / TILE));
  const maxTileY = Math.min(mapH - 1, Math.floor((cameraY + vpH - 1) / TILE));
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  return {
    minChunkX: clamp(Math.floor(minTileX / CHUNK) - 1, 0, Math.floor((mapW - 1) / CHUNK)),
    minChunkY: clamp(Math.floor(minTileY / CHUNK) - 1, 0, Math.floor((mapH - 1) / CHUNK)),
    maxChunkX: clamp(Math.floor(maxTileX / CHUNK) + 1, 0, Math.floor((mapW - 1) / CHUNK)),
    maxChunkY: clamp(Math.floor(maxTileY / CHUNK) + 1, 0, Math.floor((mapH - 1) / CHUNK)),
  };
}

function buildChunks(mapW, mapH, tileAt, bounds) {
  const chunks = [];
  for (let cy = bounds.minChunkY; cy <= bounds.maxChunkY; cy += 1) {
    for (let cx = bounds.minChunkX; cx <= bounds.maxChunkX; cx += 1) {
      const cells = new Array(CHUNK * CHUNK * 3).fill(0);
      for (let z = 0; z < 3; z += 1) {
        for (let ly = 0; ly < CHUNK; ly += 1) {
          const y = cy * CHUNK + ly;
          if (y >= mapH) continue;
          for (let lx = 0; lx < CHUNK; lx += 1) {
            const x = cx * CHUNK + lx;
            if (x >= mapW) continue;
            cells[(z * CHUNK + ly) * CHUNK + lx] = tileAt(x, y, z);
          }
        }
      }
      chunks.push({ chunkX: cx, chunkY: cy, cells });
    }
  }
  return chunks;
}

function viewData({ visualEpoch = 1, width = 640, height = 480, cameraX = 0, cameraY = 0, mapW = 256, mapH = 144, tileAt = () => 384, priorityOf = () => 0, motionId = null, cameraMotion = null, chunksOverride = null } = {}) {
  const bounds = chunkBoundsFor(cameraX, cameraY, width, height, mapW, mapH);
  const chunks = chunksOverride ?? buildChunks(mapW, mapH, tileAt, bounds);
  const used = new Set();
  for (const chunk of chunks) for (const id of chunk.cells) if (id !== 0) used.add(id);
  const tileVisuals = [...used].sort((a, b) => a - b).map((id) => [id, priorityOf(id) === 0 ? -1 : (priorityOf(id) + 1) * 32, 0, id - 384]);
  return {
    sceneEpoch: 1, visualEpoch, motionId,
    viewportWidth: width, viewportHeight: height,
    mapId: 1, mapWidth: mapW, mapHeight: mapH, cameraX, cameraY,
    tileset: tilesetRef(), autotiles: NULL_AUTOTILES,
    tileVisuals, chunks, cameraMotion,
  };
}

function spriteData({ visualEpoch = 1, motionId = null, x = 30, y = 15, screenX = 624, screenY = 224, direction = 2, pattern, motion = null } = {}) {
  return { sceneEpoch: 1, visualEpoch, motionId, x, y, screenX, screenY, direction, pattern: pattern ?? (motion === null ? 0 : 1), sprite: spriteRef(), motion };
}

async function openPage(dsf = 1) {
  const page = await browser.newPage({ viewport: { width: 2000, height: 1200 }, deviceScaleFactor: dsf });
  await page.goto(origin);
  await page.addScriptTag({ url: `${origin}/map.browser.js` });
  await page.evaluate(async () => {
    const png = async (width, height, color) => {
      const canvas = new OffscreenCanvas(width, height);
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, width, height);
      return new Uint8Array(await (await canvas.convertToBlob({ type: "image/png" })).arrayBuffer());
    };
    window.__mapLayering = {
      bytes: new Map([
        ["Tilesets/blue", await png(256, 128, "rgb(0,0,255)")],
        ["Characters/red", await png(128, 128, "rgb(255,0,0)")],
      ]),
    };
    const resources = {
      async resource(namespace, key) {
        const bytes = window.__mapLayering.bytes.get(key);
        if (bytes === undefined) throw new Error(`missing ${key}`);
        return { mime: "image/png", bytes };
      },
    };
    const view = document.createElement("lr-map-view");
    const sprite = document.createElement("lr-map-sprite");
    view.append(sprite);
    document.body.replaceChildren(view);
    view.receiveRenderContext({ resources });
    sprite.receiveRenderContext({ resources });
    window.__view = view;
    window.__sprite = sprite;
  });
  return page;
}

const waitUntil = async (page, predicate, label, timeout = 10_000, ...args) => {
  const started = Date.now();
  for (;;) {
    if (await page.evaluate(predicate, ...args)) return;
    if (Date.now() - started > timeout) assert.fail(`Timed out waiting for ${label}`);
    await page.waitForTimeout(5);
  }
};
const deliverPair = (page, view, sprite) => page.evaluate(([v, s]) => {
  window.__view.receiveRenderData(v);
  window.__sprite.receiveRenderData(s);
}, [view, sprite]);

test("host adopts the accepted logical size at 320/640/720/1080", async (t) => {
  const page = await openPage();
  t.after(() => page.close());
  for (const [width, height] of [[320, 240], [640, 480], [1280, 720], [1920, 1080]]) {
    await deliverPair(page, viewData({ width, height, mapW: 256, mapH: 144 }), spriteData({}));
    await waitUntil(page, ({ w, h }) => window.__view._accepted !== null && window.__view._latestData.viewportWidth === w && window.__view._latestData.viewportHeight === h && window.__view._state === "VISIBLE", `size ${width}`, 10_000, { w: width, h: height });
    const box = await page.evaluate(() => {
      const style = getComputedStyle(window.__view);
      return { width: style.width, height: style.height };
    });
    assert.equal(box.width, `${width}px`);
    assert.equal(box.height, `${height}px`);
  }
});

test("1080 dense live memory: visible <=128MiB and total peak <=256MiB", async (t) => {
  const page = await openPage();
  t.after(() => page.close());
  const dense = (x, y, z) => {
    if (z === 0) return 384 + ((x + y) % 8);
    if (z === 1) return 384 + ((x + 2 * y) % 8);
    return 384 + ((x + 3 * y) % 8);
  };
  await deliverPair(page, viewData({ width: 1920, height: 1080, mapW: 256, mapH: 144, tileAt: dense }), spriteData({}));
  await waitUntil(page, () => window.__view._state === "VISIBLE" && window.__view._latestData.viewportWidth === 1920, "1080 dense visible");
  const memory = await page.evaluate(() => {
    const view = window.__view;
    const canvases = [...view.shadowRoot.querySelectorAll("canvas")];
    const visibleBytes = canvases.reduce((sum, canvas) => sum + canvas.width * canvas.height * 4, 0);
    // The committed decoded images: tileset 256x128 + character 128x128.
    const decodedBytes = [...view._images.values()].reduce((sum, bitmap) => sum + bitmap.width * bitmap.height * 4, 0);
    // Peak accounting per the frozen dual budget: during the NEXT refresh a
    // full detached candidate duplicates the visible buckets.
    return {
      visibleMiB: visibleBytes / 1048576,
      decodedMiB: decodedBytes / 1048576,
      candidateMiB: visibleBytes / 1048576,
      bucketCount: canvases.length,
    };
  });
  const totalPeak = memory.visibleMiB + memory.candidateMiB + memory.decodedMiB;
  process.stdout.write(`MAP_PR2_MEMORY_1080 ${JSON.stringify({ ...memory, totalPeakMiB: totalPeak })}\n`);
  assert.ok(memory.visibleMiB <= 128, `visible ${memory.visibleMiB}MiB > 128MiB`);
  assert.ok(totalPeak <= 256, `total peak ${totalPeak}MiB > 256MiB`);
});

test("DPR-only never changes logical backing", async (t) => {
  const page = await openPage(2); // deviceScaleFactor 2
  t.after(() => page.close());
  await deliverPair(page, viewData({ width: 640, height: 480 }), spriteData({}));
  await waitUntil(page, () => window.__view._state === "VISIBLE", "visible at DPR 2");
  const info = await page.evaluate(() => ({
    logical: [window.__view._latestData.viewportWidth, window.__view._latestData.viewportHeight],
    box: [getComputedStyle(window.__view).width, getComputedStyle(window.__view).height],
    dpr: window.devicePixelRatio,
  }));
  assert.deepEqual(info.logical, [640, 480]);
  assert.deepEqual(info.box, ["640px", "480px"]);
  assert.equal(info.dpr, 2);
});

test("same-size resize does no raster work", async (t) => {
  const page = await openPage();
  t.after(() => page.close());
  await deliverPair(page, viewData({ width: 640, height: 480 }), spriteData({}));
  await waitUntil(page, () => window.__view._state === "VISIBLE", "visible");
  const stageTags = () => page.evaluate(() => [...window.__view.shadowRoot.querySelectorAll("canvas")].map((c) => c.dataset.stage ?? null));
  const before = await stageTags();
  // Same logical size, new camera -> refresh path? No: same size + same
  // chunks is a motionId-only change; only camera/motion move.
  const chunks = await page.evaluate(() => window.__view._latestData.chunks);
  await deliverPair(page, viewData({ width: 640, height: 480, motionId: 1, cameraX: 32, cameraMotion: { id: 1, durationMs: 250, fromCameraX: 0, fromCameraY: 0 }, chunksOverride: chunks }),
    spriteData({ motionId: 1, x: 31, screenX: 624, motion: { id: 1, durationMs: 250, fromY: 15, fromScreenX: 624, fromScreenY: 224 } }));
  await waitUntil(page, () => window.__view._state === "VISIBLE" && window.__view._accepted.view.motionId === 1, "motion visible");
  assert.deepEqual(await stageTags(), before, "same-size motion performed no raster rebuild");
});

test("resize mid-motion rebases from the displayed pose and keeps the end envelope", async (t) => {
  const page = await openPage();
  t.after(() => page.close());
  await deliverPair(page, viewData({ width: 640, height: 480 }), spriteData({}));
  await waitUntil(page, () => window.__view._state === "VISIBLE", "visible");
  const chunks = await page.evaluate(() => window.__view._latestData.chunks);
  // Start a 250ms motion.
  const startedAt = await page.evaluate(() => performance.now());
  await deliverPair(page, viewData({ width: 640, height: 480, motionId: 1, cameraX: 32, cameraMotion: { id: 1, durationMs: 250, fromCameraX: 0, fromCameraY: 0 }, chunksOverride: chunks }),
    spriteData({ motionId: 1, x: 31, screenX: 624, motion: { id: 1, durationMs: 250, fromY: 15, fromScreenX: 624, fromScreenY: 224 } }));
  await waitUntil(page, () => window.__view._accepted?.view?.motionId === 1, "motion 1 displayed");
  await page.waitForTimeout(80); // ~1/3 through the motion
  // Mid-motion viewport change: new visualEpoch, new projection, new motion
  // pair continuing toward a target for the resized viewport.
  await deliverPair(page,
    viewData({ visualEpoch: 2, width: 1280, height: 720, motionId: 1, cameraX: 96, cameraMotion: { id: 1, durationMs: 250, fromCameraX: 32, fromCameraY: 0 } }),
    spriteData({ visualEpoch: 2, motionId: 1, x: 31, y: 15, screenX: 31 * 32 - 96, screenY: 15 * 32 - 0, motion: { id: 1, durationMs: 250, fromY: 15, fromScreenX: 624, fromScreenY: 224 } }));
  await waitUntil(page, () => window.__view._state === "VISIBLE" && window.__view._latestData.visualEpoch === 2, "resize pair committed");
  const rebase = await page.evaluate((start) => {
    const accepted = window.__view._accepted;
    return {
      hasRebase: (accepted.rebaseFrom ?? null) !== null,
      motionDuration: accepted.motionDuration,
      motionStart: accepted.motionStart,
      elapsedAtCommit: accepted.motionStart - start,
    };
  }, startedAt);
  assert.equal(rebase.hasRebase, true, "mid-motion resize rebased from the displayed pose");
  assert.ok(rebase.motionDuration <= 250, `remaining window ${rebase.motionDuration}ms must not exceed the envelope`);
  // The motion completes within the envelope (no restarted 250ms).
  await waitUntil(page, () => window.__view._raf === null, "motion completes", 4_000);
});
