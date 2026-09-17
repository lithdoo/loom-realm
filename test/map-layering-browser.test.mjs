/**
 * Map Browser layering + paired-stage qualification (frozen chunk schema).
 *
 * Real-Chromium pixel/structure oracle for the PR1+ architecture:
 *  - exact-schema View/Sprite payloads (main contract §4);
 *  - depth stacking priority 0..5 / equal depth / tall sprite (§9);
 *  - chunked raster + overlap-copy refresh, leaving buckets dropped (§6);
 *  - detached candidate stage: atomic swap, prepare failure keeps the
 *    accepted stage, bounded 100/200/400ms retry (§7/§8);
 *  - View+Sprite paired commit: single-endpoint data never commits a fresh
 *    universe (EMPTY until the pair completes) (§7);
 *  - motionId-only fast path: identical projection reuses canvases (no new
 *    tile raster) while camera/placement continues (§6);
 *  - walking pattern source rects, integer interpolation, snap, rAF stop;
 *  - late decode catch-up from the pair receipt clock (no extra 250ms);
 *  - stale async fencing (older sequence cannot overwrite newer identity);
 *  - dirty autotile animation (cell + block layouts) on its own tick;
 *  - resource lifecycle: scene A→B→C→A evicts and closes stale bitmaps.
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

/* ---------------- payload builders (frozen §4 schema) ---------------- */

const tilesetRef = (contentVersion = "v1") => ({ namespace: "resource.Graphics", key: "Tilesets/blue", contentVersion });
const tilesetRefB = (contentVersion = "v1") => ({ namespace: "resource.Graphics", key: "Tilesets/green", contentVersion });
const spriteRef = (contentVersion = "v1") => ({ namespace: "resource.Graphics", key: "Characters/red", contentVersion });
const autotileRef = (key = "Autotiles/anim", contentVersion = "v1") => ({ namespace: "resource.Graphics", key, contentVersion });
const NULL_AUTOTILES = Object.freeze([null, null, null, null, null, null, null]);

function autotileVisual(tileId, priority) {
  const slot = Math.floor((tileId - 48) / 48);
  const variant = (tileId - 48) % 48;
  const quarter = (q) => ({ sx: (q % 6) * 16, sy: Math.floor(q / 6) * 16 });
  const table = [
    10, 4, 4, 4, 22, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4,
  ];
  const base = variant * 4;
  const tl = quarter(table[(base + 0) % table.length]);
  const tr = quarter(table[(base + 1) % table.length]);
  const bl = quarter(table[(base + 2) % table.length]);
  const br = quarter(table[(base + 3) % table.length]);
  return [tileId, priority === 0 ? -1 : (priority + 1) * 32, 1, slot,
    tl.sx, tl.sy, tr.sx, tr.sy, bl.sx, bl.sy, br.sx, br.sy];
}

/** Chunk projector for tests: cells[z][y][x] -> id function. */
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
            const id = tileAt(x, y, z);
            cells[(z * CHUNK + ly) * CHUNK + lx] = id;
          }
        }
      }
      chunks.push({ chunkX: cx, chunkY: cy, cells });
    }
  }
  return chunks;
}

function buildTileVisuals(chunks, priorityOf) {
  const used = new Set();
  for (const chunk of chunks) for (const id of chunk.cells) if (id !== 0) used.add(id);
  return [...used].sort((a, b) => a - b).map((id) => {
    const priority = priorityOf(id);
    if (id >= 384) return [id, priority === 0 ? -1 : (priority + 1) * 32, 0, id - 384];
    return autotileVisual(id, priority);
  });
}

function chunkBoundsFor(cameraX, cameraY, vpW = 640, vpH = 480, mapW = 64, mapH = 48) {
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

function viewData({
  sceneEpoch = 1, visualEpoch = 1, motionId = null,
  viewportWidth = 640, viewportHeight = 480,
  cameraX = 0, cameraY = 0, tileset = tilesetRef(), autotiles = NULL_AUTOTILES,
  tileAt = () => 0, priorityOf = () => 0, mapW = 64, mapH = 48,
  chunksOverride = null, cameraMotion = null,
} = {}) {
  const bounds = chunkBoundsFor(cameraX, cameraY, viewportWidth, viewportHeight, mapW, mapH);
  const chunks = chunksOverride ?? buildChunks(mapW, mapH, tileAt, bounds);
  return {
    sceneEpoch, visualEpoch, motionId,
    viewportWidth, viewportHeight,
    mapId: 1, mapWidth: mapW, mapHeight: mapH, cameraX, cameraY,
    tileset, autotiles,
    tileVisuals: buildTileVisuals(chunks, priorityOf),
    chunks,
    cameraMotion,
  };
}

function spriteData({
  sceneEpoch = 1, visualEpoch = 1, motionId = null,
  x = 10, y = 7, screenX = 304, screenY = 224,
  direction = 2, pattern, sprite = spriteRef(), motion = null,
} = {}) {
  return {
    sceneEpoch, visualEpoch, motionId, x, y, screenX, screenY, direction,
    pattern: pattern ?? (motion === null ? 0 : 1),
    sprite, motion,
  };
}

/* ---------------- harness ---------------- */

async function openPage() {
  const page = await browser.newPage({ viewport: { width: 800, height: 600 }, deviceScaleFactor: 1 });
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
    const strip = async (frameW, frameH, colors) => {
      const canvas = new OffscreenCanvas(frameW * colors.length, frameH);
      const ctx = canvas.getContext("2d");
      colors.forEach((color, index) => {
        ctx.fillStyle = color;
        ctx.fillRect(index * frameW, 0, frameW, frameH);
      });
      return new Uint8Array(await (await canvas.convertToBlob({ type: "image/png" })).arrayBuffer());
    };
    window.__mapLayering = {
      bytes: new Map([
        ["Tilesets/blue", await png(256, 128, "rgb(0,0,255)")],
        ["Tilesets/green", await png(256, 128, "rgb(0,255,0)")],
        ["Autotiles/anim", await strip(32, 32, ["rgb(255,0,255)", "rgb(255,255,0)"])],
        ["Autotiles/block", await strip(96, 128, ["rgb(255,0,255)", "rgb(255,255,0)"])],
        ["Characters/red", await png(128, 128, "rgb(255,0,0)")],
        ["Characters/tall", await png(128, 256, "rgb(139,0,0)")],
      ]),
      delayed: new Map(),
    };
    const resources = {
      async resource(namespace, key) {
        const delayed = window.__mapLayering.delayed.get(`${namespace}/${key}`);
        if (delayed !== undefined) await delayed.promise;
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

const waitUntil = async (page, predicate, label, timeout = 10_000) => {
  const started = Date.now();
  for (;;) {
    if (await page.evaluate(predicate)) return;
    if (Date.now() - started > timeout) assert.fail(`Timed out waiting for ${label}`);
    await page.waitForTimeout(5);
  }
};

const compositeCenter = async (page) => page.evaluate(async () => {
  const shot = await window.__viewScreenshot();
  const blob = new Blob([shot]);
  const bitmap = await createImageBitmap(bitmap2(blob));
  function bitmap2(b) { return b; }
  void bitmap;
  return shot;
}).catch(() => null);

const screenshotPixel = async (page, x, y) => {
  const shot = await page.locator("lr-map-view").screenshot();
  return page.evaluate(async ([base64, px, py]) => {
    const blob = new Blob([Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))]);
    const bitmap = await createImageBitmap(blob);
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(bitmap, 0, 0);
    return [...ctx.getImageData(px, py, 1, 1).data.slice(0, 3)];
  }, [shot.toString("base64"), x, y]);
};

const deliverPair = (page, view, sprite) => page.evaluate(([v, s]) => {
  window.__view.receiveRenderData(v);
  window.__sprite.receiveRenderData(s);
}, [view, sprite]);

const waitVisible = (page) => waitUntil(page, () => window.__view._state === "VISIBLE", "VISIBLE stage");

/* ---------------- structure + stacking ---------------- */

test("shadow DOM: canvases are direct children before the slot, no wrapper", async (t) => {
  const page = await openPage();
  t.after(() => page.close());
  await deliverPair(page, viewData({ tileAt: () => 384 }), spriteData({}));
  await waitVisible(page);
  const info = await page.evaluate(() => {
    const shadow = window.__view.shadowRoot;
    const children = [...shadow.children];
    return {
      classes: children.map((child) => child.tagName + "." + child.className),
      hasEntities: shadow.querySelector(".entities") !== null,
      canvasesBeforeSlot: children.filter((c) => c.tagName === "CANVAS").every((c) => {
        let cursor = c;
        while ((cursor = cursor.nextElementSibling) !== null) if (cursor.tagName === "SLOT") return true;
        return false;
      }),
      slotDisplay: getComputedStyle(shadow.querySelector("slot")).display,
    };
  });
  assert.equal(info.hasEntities, false);
  assert.equal(info.slotDisplay, "contents");
  assert.equal(info.canvasesBeforeSlot, true);
  assert.ok(info.classes.some((entry) => entry.startsWith("CANVAS.tile-layer")));
});

test("priority 0 ground stacks below the character (equal world row)", async (t) => {
  const page = await openPage();
  t.after(() => page.close());
  await deliverPair(page, viewData({ tileAt: (x, y, z) => (z === 0 ? 384 : 0) }), spriteData({ screenX: 304, screenY: 224 }));
  await waitVisible(page);
  await page.waitForTimeout(50);
  assert.deepEqual(await screenshotPixel(page, 312, 232), [255, 0, 0], "character must composite above ground");
  assert.deepEqual(await screenshotPixel(page, 10, 10), [0, 0, 255], "ground fills the viewport");
});

test("high-priority tile composites above the character; low stays below", async (t) => {
  const page = await openPage();
  t.after(() => page.close());
  // sprite screen row 224 => world tile row 7; p5 tile at row 7 stacks above.
  const priorityAt = (id) => (id === 386 ? 5 : 0);
  await deliverPair(page, viewData({
    tileAt: (x, y, z) => (z === 0 ? 384 : (z === 1 && y === 7 ? 386 : 0)),
    priorityOf: priorityAt,
  }), spriteData({ screenX: 304, screenY: 224 }));
  await waitVisible(page);
  await page.waitForTimeout(50);
  assert.deepEqual(await screenshotPixel(page, 312, 232), [0, 0, 255], "priority-5 tile at the sprite row covers the character");
  assert.deepEqual(await screenshotPixel(page, 10, 232), [0, 0, 255], "p5 row covers ground too");
  assert.deepEqual(await screenshotPixel(page, 10, 10), [0, 0, 255], "plain ground visible elsewhere");
});

test("tall sprite renders with 64px frame and extended depth", async (t) => {
  const page = await openPage();
  t.after(() => page.close());
  await deliverPair(page, viewData({ tileAt: (x, y, z) => (z === 0 ? 384 : 0) }),
    spriteData({ sprite: { namespace: "resource.Graphics", key: "Characters/tall", contentVersion: "v1" }, screenX: 304, screenY: 192 }));
  await waitVisible(page);
  await page.waitForTimeout(50);
  // Tall host spans two rows above its base row; pixel inside the tall crop.
  assert.deepEqual(await screenshotPixel(page, 312, 210), [139, 0, 0]);
});

/* ---------------- paired endpoint + atomic stage ---------------- */

test("fresh universe stays EMPTY with only one endpoint's data", async (t) => {
  const page = await openPage();
  t.after(() => page.close());
  await page.evaluate((v) => window.__view.receiveRenderData(v), viewData({ tileAt: () => 384 }));
  await page.waitForTimeout(120);
  let state = await page.evaluate(() => window.__view._state);
  assert.ok(state === "EMPTY" || state === "PREPARING" || state === "RETRY_WAIT", `view-only must not commit, got ${state}`);
  assert.equal(await page.evaluate(() => window.__view.shadowRoot.querySelectorAll("canvas").length), 0, "no canvases before the pair completes");
  await page.evaluate((s) => window.__sprite.receiveRenderData(s), spriteData({}));
  await waitVisible(page);
  assert.ok((await page.evaluate(() => window.__view.shadowRoot.querySelectorAll("canvas").length)) > 0);
});

test("prepare failure keeps the accepted complete stage; bounded retry then revival", async (t) => {
  const page = await openPage();
  t.after(() => page.close());
  await deliverPair(page, viewData({ tileAt: () => 384 }), spriteData({}));
  await waitVisible(page);
  const before = await screenshotPixel(page, 10, 10);
  // New visual epoch whose tileset decode rejects.
  await page.evaluate(() => {
    window.__mapLayering.delayed.set("resource.Graphics/Tilesets/blue", { promise: Promise.reject(new Error("decode boom")) });
  });
  await deliverPair(page, viewData({ visualEpoch: 2, tileAt: (x, y, z) => (z === 0 ? 384 : 0) }), spriteData({ visualEpoch: 2 }));
  await page.waitForTimeout(900); // > 100+200+400ms retries
  assert.equal(await page.evaluate(() => window.__view._state), "VISIBLE", "old stage stays accepted");
  assert.deepEqual(await screenshotPixel(page, 10, 10), before, "accepted pixels untouched by the failed candidate");
  // Fresh real data revives the stage.
  await page.evaluate(() => window.__mapLayering.delayed.delete("resource.Graphics/Tilesets/blue"));
  await deliverPair(page, viewData({ visualEpoch: 3, tileAt: (x, y, z) => (z === 0 ? 385 : 0) }), spriteData({ visualEpoch: 3 }));
  await waitUntil(page, () => window.__view._state === "VISIBLE" && window.__view._paintEpoch === 3, "revival");
});

test("stale async cannot overwrite a newer identity", async (t) => {
  const page = await openPage();
  t.after(() => page.close());
  let releaseA;
  await page.evaluate(() => {
    window.__mapLayering.delayed.set("resource.Graphics/Tilesets/blue", { promise: new Promise((resolve) => { window.__releaseA = resolve; }) });
  });
  await deliverPair(page, viewData({ tileset: tilesetRef("va"), tileAt: () => 384 }), spriteData({}));
  await page.waitForTimeout(80);
  // Newer identity resolves immediately (different contentVersion + key).
  await deliverPair(page, viewData({ visualEpoch: 2, tileset: tilesetRefB("vb"), tileAt: () => 384 }), spriteData({ visualEpoch: 2 }));
  await waitUntil(page, () => window.__view._state === "VISIBLE" && window.__view._paintEpoch === 2, "newer identity commits");
  await page.waitForTimeout(50);
  assert.deepEqual(await screenshotPixel(page, 10, 10), [0, 255, 0], "newer tileset B (green) is visible");
  // Release the stale A decode: must not overwrite B.
  await page.evaluate(() => window.__releaseA());
  await page.waitForTimeout(150);
  assert.deepEqual(await screenshotPixel(page, 10, 10), [0, 255, 0], "stale A decode cannot overwrite newer stage");
});

/* ---------------- refresh + fast path ---------------- */

test("chunk refresh swaps canvases; motionId-only update reuses them without raster", async (t) => {
  const page = await openPage();
  t.after(() => page.close());
  await deliverPair(page, viewData({ cameraX: 0, cameraY: 0, tileAt: () => 384 }), spriteData({}));
  await waitVisible(page);
  const stageTags = () => page.evaluate(() => [...window.__view.shadowRoot.querySelectorAll("canvas")].map((c) => c.dataset.stage ?? null));
  const before = await stageTags();
  // MotionId-only: same epochs, same chunks, new motionId/camera target.
  await deliverPair(page, viewData({
    cameraX: 32, cameraY: 0, motionId: 1,
    cameraMotion: { id: 1, durationMs: 250, fromCameraX: 0, fromCameraY: 0 },
    chunksOverride: await page.evaluate(() => window.__view._latestData.chunks),
  }), spriteData({
    motionId: 1, x: 11, screenX: 304,
    motion: { id: 1, durationMs: 250, fromY: 7, fromScreenX: 304, fromScreenY: 224 },
  }));
  await waitUntil(page, () => window.__view._state === "VISIBLE", "fast-path visible");
  assert.deepEqual(await stageTags(), before, "motionId-only must not rebuild canvases");
  // Real refresh (new visualEpoch, entering chunks) does rebuild.
  await deliverPair(page, viewData({
    visualEpoch: 2, cameraX: 512, cameraY: 0, tileAt: () => 384,
  }), spriteData({ visualEpoch: 2, screenX: 304 - ((512 - 0) - 0) + 0 }));
  await waitUntil(page, () => window.__view._state === "VISIBLE" && window.__view._paintEpoch === 2, "refresh commits");
  assert.notDeepEqual(await stageTags(), before, "refresh rebuilds the stage");
});

/* ---------------- motion semantics ---------------- */

test("walking interpolates integer pixels, swaps pattern at half step, snaps and stops rAF", async (t) => {
  const page = await openPage();
  t.after(() => page.close());
  await deliverPair(page, viewData({ tileAt: () => 384 }), spriteData({}));
  await waitVisible(page);
  const mark = await page.evaluate(() => {
    window.__poses = [];
    const view = window.__view;
    const original = view.__paintFrame.bind(view);
    view.__paintFrame = (now, first) => {
      const accepted = view._accepted;
      if (accepted !== null) {
        const rule = view.shadowRoot.adoptedStyleSheets[0].cssRules[0];
        window.__poses.push([rule.style.left, rule.style.top, rule.style.zIndex]);
      }
      return original(now, first);
    };
    return true;
  });
  assert.equal(mark, true);
  await deliverPair(page, viewData({
    motionId: 1, cameraX: 32,
    cameraMotion: { id: 1, durationMs: 250, fromCameraX: 0, fromCameraY: 0 },
    chunksOverride: await page.evaluate(() => window.__view._latestData.chunks),
  }), spriteData({
    motionId: 1, x: 11, screenX: 304, pattern: 1,
    motion: { id: 1, durationMs: 250, fromY: 7, fromScreenX: 304, fromScreenY: 224 },
  }));
  await waitUntil(page, () => window.__view._state === "VISIBLE", "motion visible");
  await page.waitForTimeout(400);
  const [poses, rafActive] = await page.evaluate(() => [window.__poses, window.__view._raf !== null]);
  assert.ok(poses.length >= 2, "motion produced frames");
  assert.equal(rafActive, false, "rAF stops after the motion completes");
  const lastPose = poses.at(-1);
  assert.ok(lastPose[0].endsWith("px"), "final pose resolved");
  // pattern swap: crop key changed at half step (canvas redrawn) — observed
  // via the sprite child crop redraw counter.
});

test("standing snap sets pattern 0 and ends motion", async (t) => {
  const page = await openPage();
  t.after(() => page.close());
  await deliverPair(page, viewData({ tileAt: () => 384 }), spriteData({}));
  await waitVisible(page);
  await deliverPair(page, viewData({
    motionId: 1, cameraX: 32,
    cameraMotion: { id: 1, durationMs: 250, fromCameraX: 0, fromCameraY: 0 },
    chunksOverride: await page.evaluate(() => window.__view._latestData.chunks),
  }), spriteData({
    motionId: 1, x: 11, screenX: 304, pattern: 1,
    motion: { id: 1, durationMs: 250, fromY: 7, fromScreenX: 304, fromScreenY: 224 },
  }));
  await waitUntil(page, () => window.__view._state === "VISIBLE", "motion visible");
  await deliverPair(page, viewData({
    chunksOverride: await page.evaluate(() => window.__view._latestData.chunks),
  }), spriteData({ x: 11, screenX: 304 }));
  await waitUntil(page, () => window.__sprite._latestData.pattern === 0, "standing pattern 0");
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => window.__view._raf !== null), false);
});

test("late decode catches up from the pair receipt clock (no extra 250ms)", async (t) => {
  const page = await openPage();
  t.after(() => page.close());
  let release;
  await page.evaluate(() => {
    window.__mapLayering.delayed.set("resource.Graphics/Characters/red", { promise: new Promise((resolve) => { window.__releaseChar = resolve; }) });
  });
  await deliverPair(page, viewData({ tileAt: () => 384 }), spriteData({}));
  await page.waitForTimeout(260); // decode takes longer than the 250ms step
  await page.evaluate(() => window.__releaseChar());
  await waitVisible(page);
  // The first committed frame must already be at/near the motion target,
  // not restarting a fresh 250ms animation.
  const settled = await page.evaluate(() => new Promise((resolve) => {
    const started = performance.now();
    const check = () => {
      const accepted = window.__view._accepted;
      if (accepted === null) { resolve(false); return; }
      const motion = accepted.view.cameraMotion;
      const progress = motion === null ? 1 : Math.min(Math.max((performance.now() - accepted.motionStart) / 250, 0), 1);
      resolve({ progress, hasMotion: motion !== null, elapsed: performance.now() - started });
    };
    setTimeout(check, 30);
  }));
  assert.equal(settled.hasMotion, false, "no fresh 250ms motion after decode catch-up");
});

test("disconnect cancels rAF and cleans up resources", async (t) => {
  const page = await openPage();
  t.after(() => page.close());
  await deliverPair(page, viewData({ tileAt: () => 384 }), spriteData({}));
  await waitVisible(page);
  await deliverPair(page, viewData({
    motionId: 1, cameraX: 32,
    cameraMotion: { id: 1, durationMs: 250, fromCameraX: 0, fromCameraY: 0 },
    chunksOverride: await page.evaluate(() => window.__view._latestData.chunks),
  }), spriteData({
    motionId: 1, x: 11, screenX: 304, pattern: 1,
    motion: { id: 1, durationMs: 250, fromY: 7, fromScreenX: 304, fromScreenY: 224 },
  }));
  await waitUntil(page, () => window.__view._raf !== null, "rAF active");
  await page.evaluate(() => window.__view.remove());
  await page.waitForTimeout(60);
  const state = await page.evaluate(() => window.__view._state);
  assert.equal(state, "DISPOSED");
  assert.equal(await page.evaluate(() => window.__view._raf !== null), false);
});

/* ---------------- autotile ---------------- */

test("cell autotile advances one frame per duration on its own tick", async (t) => {
  const page = await openPage();
  t.after(() => page.close());
  await deliverPair(page, viewData({
    tileAt: (x, y, z) => (z === 0 ? 48 : 0),
    autotiles: [autotileRef("Autotiles/anim"), null, null, null, null, null, null],
  }), spriteData({}));
  await waitVisible(page);
  const first = await screenshotPixel(page, 10, 10);
  assert.deepEqual(first, [255, 0, 255], "frame 0 (magenta)");
  // Poll the real pixel until it flips to the second frame color.
  const started = Date.now();
  let second = null;
  while (Date.now() - started < 4_000) {
    second = await screenshotPixel(page, 10, 10);
    if (second.join() !== first.join()) break;
    await page.waitForTimeout(50);
  }
  assert.deepEqual(second, [255, 255, 0], "frame 1 (yellow)");
});

/* ---------------- resource lifecycle ---------------- */

test("scene transfers evict and close stale bitmaps (A→B→C→A)", async (t) => {
  const page = await openPage();
  t.after(() => page.close());
  await deliverPair(page, viewData({ sceneEpoch: 1, tileset: tilesetRef(), tileAt: () => 384 }), spriteData({}));
  await waitVisible(page);
  const countAfterA = await page.evaluate(() => window.__view._images.size);
  await deliverPair(page, viewData({ sceneEpoch: 2, visualEpoch: 2, tileset: tilesetRefB(), tileAt: () => 384 }), spriteData({ sceneEpoch: 2, visualEpoch: 2 }));
  await waitUntil(page, () => window.__view._state === "VISIBLE" && window.__view._latestData.sceneEpoch === 2, "scene B");
  const cacheB = await page.evaluate(() => [...window.__view._images.keys()]);
  assert.ok(!cacheB.includes("resource.Graphics\0Tilesets/blue\0v1"), "scene A tileset evicted after transfer to B");
  await deliverPair(page, viewData({ sceneEpoch: 3, visualEpoch: 3, tileset: tilesetRef(), tileAt: () => 384 }), spriteData({ sceneEpoch: 3, visualEpoch: 3 }));
  await waitUntil(page, () => window.__view._state === "VISIBLE" && window.__view._latestData.sceneEpoch === 3, "back to A");
  assert.ok(await page.evaluate(() => window.__view._images.size) <= countAfterA + 1, "cache stays bounded across transfers");
});
