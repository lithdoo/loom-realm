import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import test, { after, before } from "node:test";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mapBrowserPath = path.join(root, "game-libs", "map", "dist", "browser", "map.browser.js");

function executablePath() {
  return [process.env.LOOMREALM_CHROMIUM_PATH, "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe", "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"].filter(Boolean).find(existsSync);
}

const tilesetRef = (contentVersion) => ({ namespace: "resource.Graphics", key: "Tilesets/blue", contentVersion });
const spriteRef = Object.freeze({ namespace: "resource.Graphics", key: "Characters/red", contentVersion: "v1" });
const NULL_AUTOTILES = Object.freeze([null, null, null, null, null, null, null]);
const identityOf = (ref) => `${ref.namespace}\u0000${ref.key}\u0000${ref.contentVersion}`;
const autotileRef = (key, contentVersion = "v1") => ({ namespace: "resource.Graphics", key, contentVersion });
const AUTOTILE_CORNERS = Object.freeze([
  Object.freeze({ sx: 0, sy: 0 }),
  Object.freeze({ sx: 16, sy: 0 }),
  Object.freeze({ sx: 0, sy: 16 }),
  Object.freeze({ sx: 16, sy: 16 }),
]);

function autotilesAt(entries) {
  const list = [null, null, null, null, null, null, null];
  for (const [slot, ref] of entries) list[slot] = ref;
  return list;
}

function autotileTile({ x = 0, y = 0, z = 0, tileId = 48, depth = 0, slot = 0, corners = AUTOTILE_CORNERS } = {}) {
  return { x, y, z, tileId, depth, blit: { kind: "autotile", slot, corners } };
}

function regularTile({ x = 0, y = 0, z = 0, tileId = 384, depth = 0 } = {}) {
  return { x, y, z, tileId, depth, blit: { kind: "regular", sourceIndex: tileId - 384 } };
}

function visualFromTile(tile) {
  const depthBias = tile.depth === 0 ? -1 : tile.depth - tile.y * 32;
  if (tile.blit.kind === "regular") return [tile.tileId, depthBias, 0, tile.blit.sourceIndex];
  const corners = tile.blit.corners;
  return [
    tile.tileId, depthBias, 1, tile.blit.slot,
    corners[0].sx, corners[0].sy, corners[1].sx, corners[1].sy,
    corners[2].sx, corners[2].sy, corners[3].sx, corners[3].sy,
  ];
}

function chunksFromTiles(tiles) {
  const chunkMap = new Map();
  for (const tile of tiles) {
    const chunkX = Math.floor(tile.x / 8);
    const chunkY = Math.floor(tile.y / 8);
    const key = `${chunkX},${chunkY}`;
    let chunk = chunkMap.get(key);
    if (!chunk) {
      chunk = { chunkX, chunkY, cells: Array(192).fill(0) };
      chunkMap.set(key, chunk);
    }
    const localX = tile.x - chunkX * 8;
    const localY = tile.y - chunkY * 8;
    chunk.cells[((tile.z * 8 + localY) * 8) + localX] = tile.tileId;
  }
  return [...chunkMap.values()].sort((left, right) => left.chunkY - right.chunkY || left.chunkX - right.chunkX);
}

function viewData({ depth = 0, tileset = tilesetRef("v1"), autotiles = NULL_AUTOTILES, tiles, cameraX = 0, cameraY = 0, cameraMotion = null, sceneEpoch = 1, visualEpoch = 1, mapId = 1 } = {}) {
  const tileList = tiles ?? [regularTile({ depth })];
  const seen = new Set();
  const tileVisuals = [];
  for (const tile of tileList) {
    if (seen.has(tile.tileId)) continue;
    seen.add(tile.tileId);
    tileVisuals.push(visualFromTile(tile));
  }
  tileVisuals.sort((left, right) => left[0] - right[0]);
  return {
    sceneEpoch,
    visualEpoch,
    motionId: cameraMotion?.id ?? null,
    viewportWidth: 640,
    viewportHeight: 480,
    mapId,
    mapWidth: 24,
    mapHeight: 18,
    cameraX,
    cameraY,
    tileset,
    autotiles,
    tileVisuals,
    chunks: chunksFromTiles(tileList),
    cameraMotion,
  };
}

function spriteData(y = 0) {
  return {
    sceneEpoch: 1, visualEpoch: 1, motionId: null,
    x: 0, y, screenX: 0, screenY: y * 32, direction: 2, pattern: 0, sprite: spriteRef, motion: null,
  };
}

function walkingSprite({ y = 1, fromY = 0, screenX = 0, screenY = 32, fromScreenX = 0, fromScreenY = 0, pattern = 1, id = 1, sprite = spriteRef, direction = 2 } = {}) {
  return {
    sceneEpoch: 1, visualEpoch: 1, motionId: id,
    x: 0, y, screenX, screenY, direction, pattern, sprite,
    motion: { id, durationMs: 250, fromY, fromScreenX, fromScreenY },
  };
}

let browser;
let origin;
let server;

before(async () => {
  const source = await readFile(mapBrowserPath);
  server = http.createServer((request, response) => {
    if (new URL(request.url ?? "/", "http://localhost").pathname === "/map.browser.js") {
      response.setHeader("content-type", "text/javascript");
      response.end(source);
      return;
    }
    response.setHeader("content-type", "text/html");
    response.end("<!doctype html><html><head></head><body style=\"margin:0\"></body></html>");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true, ...(executablePath() ? { executablePath: executablePath() } : {}) });
});

after(async () => {
  await browser?.close();
  await new Promise((resolve) => server?.close(resolve));
});

async function openPage({ clock = false } = {}) {
  const page = await browser.newPage({ viewport: { width: 800, height: 600 }, deviceScaleFactor: 1 });
  if (clock) await page.clock.install({ time: Date.now() });
  await page.goto(origin);
  if (clock) {
    await page.clock.pauseAt(Date.now() + 24 * 60 * 60 * 1000);
    await page.evaluate(() => {
      // Playwright fake rAF is 16ms-quantized and cannot hit exact duration
      // boundaries; clock tests still drive time with runFor via 0-delay timeouts.
      const scheduled = new Map();
      let nextId = 1;
      window.requestAnimationFrame = (callback) => {
        const id = nextId++;
        const timer = window.setTimeout(() => {
          scheduled.delete(id);
          callback(performance.now());
        }, 0);
        scheduled.set(id, timer);
        return id;
      };
      window.cancelAnimationFrame = (id) => {
        const timer = scheduled.get(id);
        if (timer !== undefined) {
          window.clearTimeout(timer);
          scheduled.delete(id);
        }
      };
    });
  }
  await page.addScriptTag({ url: `${origin}/map.browser.js` });
  await page.evaluate(async () => {
    const pngBytes = async (width, height, r, g, b) => {
      const canvas = new OffscreenCanvas(width, height);
      const context = canvas.getContext("2d");
      context.fillStyle = `rgb(${r}, ${g}, ${b})`;
      context.fillRect(0, 0, width, height);
      const blob = await canvas.convertToBlob({ type: "image/png" });
      return new Uint8Array(await blob.arrayBuffer());
    };
    window.__mapLayering = {
      resourceBytes: new Map(),
      fetchCount: 0,
      tilesetBytes: await pngBytes(32, 32, 0, 0, 255),
      characterBytes: await (async () => {
        const canvas = new OffscreenCanvas(128, 128);
        const context = canvas.getContext("2d");
        const colors = ["rgb(255, 0, 0)", "rgb(0, 255, 0)", "rgb(0, 0, 255)", "rgb(255, 255, 0)"];
        for (let column = 0; column < 4; column += 1) {
          context.fillStyle = colors[column];
          context.fillRect(column * 32, 0, 32, 128);
        }
        const blob = await canvas.convertToBlob({ type: "image/png" });
        return new Uint8Array(await blob.arrayBuffer());
      })(),
      delayed: new Map(),
    };
    const resources = {
      async resource(namespace, key, contentVersion) {
        const id = `${namespace}\u0000${key}\u0000${contentVersion}`;
        window.__mapLayering.fetchCount += 1;
        if (window.__mapLayering.delayed.has(id)) return window.__mapLayering.delayed.get(id).promise;
        if (window.__mapLayering.resourceBytes.has(key)) return { bytes: window.__mapLayering.resourceBytes.get(key), mime: "image/png" };
        if (key.startsWith("Tilesets/")) return { bytes: window.__mapLayering.tilesetBytes, mime: "image/png" };
        if (key.startsWith("Characters/")) return { bytes: window.__mapLayering.characterBytes, mime: "image/png" };
        throw new Error(`missing resource ${namespace}/${key}`);
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
    window.__tileDestX = () => {
      const canvas = document.querySelector("lr-map-view")?.shadowRoot?.querySelector("canvas.tile-layer:not([hidden])");
      if (!canvas) return null;
      const left = Number.parseFloat(canvas.style.left);
      if (!Number.isFinite(left) || left <= -32) return null;
      return left;
    };
  });
  return page;
}

async function waitUntil(page, predicate, label, timeout = 10_000) {
  const deadline = Date.now() + timeout;
  while (!(await page.evaluate(predicate))) {
    if (Date.now() >= deadline) assert.fail(`Timed out waiting for ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

async function waitPainted(page, tileZIndex, spriteZIndex = "65") {
  const deadline = Date.now() + 10_000;
  while (!(await page.evaluate(({ tileZ, spriteZ }) => {
    const view = document.querySelector("lr-map-view");
    const sprite = document.querySelector("lr-map-sprite");
    const visible = [...(view?.shadowRoot?.querySelectorAll("canvas.tile-layer") ?? [])].filter((canvas) => !canvas.hidden);
    return visible.some((canvas) => canvas.style.zIndex === tileZ) && getComputedStyle(sprite).zIndex === spriteZ;
  }, { tileZ: String(tileZIndex), spriteZ: String(spriteZIndex) }))) {
    if (Date.now() >= deadline) assert.fail(`Timed out waiting for tile z-index ${tileZIndex} and sprite z-index ${spriteZIndex}`);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

async function waitForPendingImage(page, ref, host = "__view") {
  const id = identityOf(ref);
  const deadline = Date.now() + 10_000;
  while (!(await page.evaluate(({ imageId, host: name }) => window[name]._images.has(imageId), { imageId: id, host }))) {
    if (Date.now() >= deadline) assert.fail(`Timed out waiting for pending image ${id}`);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

async function settlePendingImage(page, ref, outcome, host = "__view") {
  const id = identityOf(ref);
  await page.evaluate(async ({ imageId, outcome: next, host: name }) => {
    const pending = window[name]._images.get(imageId);
    if (!pending) throw new Error(`stale image promise missing for ${imageId}`);
    const delayed = window.__mapLayering.delayed.get(imageId);
    if (!delayed) throw new Error(`delayed resource missing for ${imageId}`);
    if (next === "resolve") delayed.resolve({ bytes: name === "__sprite" ? window.__mapLayering.characterBytes : window.__mapLayering.tilesetBytes, mime: "image/png" });
    else delayed.reject(new Error("stale tileset failed"));
    await pending.then(() => undefined, () => undefined);
  }, { imageId: id, outcome, host });
}

async function tilePixel(page, x = 8, y = 8) {
  return page.evaluate(({ x: sampleX, y: sampleY }) => {
    const canvas = document.querySelector("lr-map-view")?.shadowRoot?.querySelector("canvas.tile-layer:not([hidden])");
    if (!canvas) return null;
    return [...canvas.getContext("2d").getImageData(sampleX, sampleY, 1, 1).data];
  }, { x, y });
}

async function makeStrip(page, frameWidth, frameHeight, colors) {
  return page.evaluate(async ({ frameWidth: width, frameHeight: height, colors: fills }) => {
    const canvas = new OffscreenCanvas(width * fills.length, height);
    const context = canvas.getContext("2d");
    for (let index = 0; index < fills.length; index += 1) {
      context.fillStyle = fills[index];
      context.fillRect(index * width, 0, width, height);
    }
    const blob = await canvas.convertToBlob({ type: "image/png" });
    return [...new Uint8Array(await blob.arrayBuffer())];
  }, { frameWidth, frameHeight, colors });
}

async function installAutotile(page, key, bytes) {
  await page.evaluate(({ key: resourceKey, bytes: raw }) => {
    window.__mapLayering.resourceBytes.set(resourceKey, Uint8Array.from(raw));
  }, { key, bytes });
}

async function paintAutotile(page, viewPayload) {
  await page.evaluate((payload) => window.__view.receiveRenderData(payload), viewPayload);
  await waitUntil(page, () => {
    const canvas = document.querySelector("lr-map-view")?.shadowRoot?.querySelector("canvas.tile-layer:not([hidden])");
    if (!canvas) return false;
    const data = canvas.getContext("2d").getImageData(0, 0, 32, 32).data;
    for (let index = 3; index < data.length; index += 4) if (data[index] === 255) return true;
    return false;
  }, "autotile first paint");
}

async function spritePixel(page, x = 5, y = 5) {
  return page.evaluate(({ x: sampleX, y: sampleY }) => {
    const canvas = document.querySelector("lr-map-sprite").shadowRoot.querySelector("canvas");
    return [...canvas.getContext("2d").getImageData(sampleX, sampleY, 1, 1).data];
  }, { x, y });
}

async function spriteBox(page) {
  return page.evaluate(() => {
    const sprite = document.querySelector("lr-map-sprite");
    return { left: getComputedStyle(sprite).left, top: getComputedStyle(sprite).top, zIndex: getComputedStyle(sprite).zIndex, raf: sprite._raf };
  });
}

async function compositeCenter(page) {
  const pngBytes = await page.locator("lr-map-view").screenshot();
  return page.evaluate(async (b64) => {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext("2d");
    context.drawImage(bitmap, 0, 0);
    const [r, g, b, a] = context.getImageData(16, 16, 1, 1).data;
    return [r, g, b, a];
  }, pngBytes.toString("base64"));
}

async function layerInfo(page) {
  return page.evaluate(() => {
    const root = document.querySelector("lr-map-view").shadowRoot;
    const slot = root.querySelector("slot");
    const canvases = [...root.querySelectorAll("canvas.tile-layer")];
    const children = [...root.children];
    return {
      entities: Boolean(root.querySelector(".entities")),
      slotDisplay: getComputedStyle(slot).display,
      tileLayersDirect: canvases.every((canvas) => canvas.parentNode === root),
      canvasesBeforeSlot: canvases.every((canvas) => children.indexOf(canvas) >= 0 && children.indexOf(canvas) < children.indexOf(slot)),
      canvasCount: canvases.length,
      hidden: canvases.map((canvas) => canvas.hidden),
      zIndex: canvases.map((canvas) => canvas.style.zIndex),
      spriteZIndex: getComputedStyle(document.querySelector("lr-map-sprite")).zIndex,
    };
  });
}

async function secondLayerCleared(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector("lr-map-view").shadowRoot.querySelectorAll("canvas.tile-layer")[1];
    const data = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
    for (let index = 0; index < data.length; index += 1) if (data[index] !== 0) return false;
    return canvas.hidden === true;
  });
}

async function delayTileset(page, ref) {
  await page.evaluate((id) => {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    window.__mapLayering.delayed.set(id, { promise, resolve, reject });
  }, identityOf(ref));
}

async function warmPresentation(page) {
  await page.evaluate(({ viewPayload, spritePayload }) => {
    window.__view.receiveRenderData(viewPayload);
    window.__sprite.receiveRenderData(spritePayload);
  }, { viewPayload: viewData({ depth: 0 }), spritePayload: spriteData(0) });
  await waitPainted(page, "0");
  await page.evaluate(async ({ tilesetId, spriteId }) => {
    const tileset = window.__view._images.get(tilesetId);
    const sprite = window.__sprite._images.get(spriteId);
    if (!tileset || !sprite) throw new Error("warmPresentation missing decoded images");
    await tileset;
    await sprite;
  }, { tilesetId: identityOf(tilesetRef("v1")), spriteId: identityOf(spriteRef) });
}

test("A. MapView shadow DOM has no entities wrapper and canvases precede slot", { timeout: 30_000 }, async (t) => {
  const page = await openPage();
  t.after(() => page.close());
  await page.evaluate(({ viewPayload, spritePayload }) => {
    window.__view.receiveRenderData(viewPayload);
    window.__sprite.receiveRenderData(spritePayload);
  }, { viewPayload: viewData({ depth: 0 }), spritePayload: spriteData(0) });
  await waitPainted(page, "0");
  const info = await layerInfo(page);
  assert.equal(info.entities, false);
  assert.equal(info.slotDisplay, "contents");
  assert.equal(info.tileLayersDirect, true);
  assert.equal(info.canvasesBeforeSlot, true);
  assert.ok(info.canvasCount >= 1);
});

test("B. equal depth stacks character above tile", { timeout: 30_000 }, async (t) => {
  const page = await openPage();
  t.after(() => page.close());
  await page.evaluate(({ viewPayload, spritePayload }) => {
    window.__view.receiveRenderData(viewPayload);
    window.__sprite.receiveRenderData(spritePayload);
  }, { viewPayload: viewData({ depth: 32 }), spritePayload: spriteData(0) });
  await waitPainted(page, "64", "65");
  const info = await layerInfo(page);
  assert.equal(info.zIndex[0], "64");
  assert.equal(info.spriteZIndex, "65");
});

test("C. high tile composites above the character", { timeout: 30_000 }, async (t) => {
  const page = await openPage();
  t.after(() => page.close());
  await page.evaluate(({ viewPayload, spritePayload }) => {
    window.__view.receiveRenderData(viewPayload);
    window.__sprite.receiveRenderData(spritePayload);
  }, { viewPayload: viewData({ depth: 64 }), spritePayload: spriteData(0) });
  await waitPainted(page, "128", "65");
  const info = await layerInfo(page);
  assert.equal(info.zIndex[0], "128");
  assert.equal(info.spriteZIndex, "65");
  assert.ok(Number(info.zIndex[0]) > Number(info.spriteZIndex));
  assert.deepEqual(await compositeCenter(page), [0, 0, 255, 255]);
});

test("D. low tile composites below the character", { timeout: 30_000 }, async (t) => {
  const page = await openPage();
  t.after(() => page.close());
  await page.evaluate(({ viewPayload, spritePayload }) => {
    window.__view.receiveRenderData(viewPayload);
    window.__sprite.receiveRenderData(spritePayload);
  }, { viewPayload: viewData({ depth: 0 }), spritePayload: spriteData(0) });
  await waitPainted(page, "0", "65");
  const info = await layerInfo(page);
  assert.equal(info.zIndex[0], "0");
  assert.equal(info.spriteZIndex, "65");
  assert.ok(Number(info.zIndex[0]) < Number(info.spriteZIndex));
  assert.deepEqual(await compositeCenter(page), [255, 0, 0, 255]);
});

test("E. stale buckets hide and clear leftover canvases", { timeout: 30_000 }, async (t) => {
  const page = await openPage();
  t.after(() => page.close());
  await page.evaluate(({ first, second, spritePayload }) => {
    window.__view.receiveRenderData(first);
    window.__sprite.receiveRenderData(spritePayload);
    window.__firstPayload = first;
    window.__secondPayload = second;
  }, {
    first: viewData({
      tiles: [
        regularTile({ depth: 0 }),
        regularTile({ x: 1, tileId: 385, depth: 64 }),
      ],
    }),
    second: viewData({ tiles: [regularTile({ depth: 0 })] }),
    spritePayload: spriteData(0),
  });
  await waitUntil(page, () => {
    const canvases = [...document.querySelector("lr-map-view").shadowRoot.querySelectorAll("canvas.tile-layer")].filter((canvas) => !canvas.hidden);
    return canvases.length === 2 && canvases[0].style.zIndex === "0" && canvases[1].style.zIndex === "128";
  }, "two visible depth buckets");
  await page.evaluate(() => window.__view.receiveRenderData(window.__secondPayload));
  await waitPainted(page, "0", "65");
  const info = await layerInfo(page);
  assert.equal(info.canvasCount, 2);
  assert.equal(info.hidden[1], true);
  assert.equal(await secondLayerCleared(page), true);
});

test("F. stale async success cannot overwrite a newer tileset identity", { timeout: 30_000 }, async (t) => {
  const page = await openPage();
  t.after(() => page.close());
  const firstRef = tilesetRef("old");
  const secondRef = tilesetRef("new");
  await delayTileset(page, firstRef);
  await page.evaluate(({ viewPayload, spritePayload }) => {
    window.__view.receiveRenderData(viewPayload);
    window.__sprite.receiveRenderData(spritePayload);
  }, { viewPayload: viewData({ depth: 64, tileset: firstRef }), spritePayload: spriteData(0) });
  await waitForPendingImage(page, firstRef);
  await page.evaluate(({ viewPayload }) => {
    window.__view.receiveRenderData(viewPayload);
  }, { viewPayload: viewData({ depth: 0, tileset: secondRef }) });
  await waitPainted(page, "0", "65");
  await settlePendingImage(page, firstRef, "resolve");
  const info = await layerInfo(page);
  const visibleZ = info.zIndex.filter((_, index) => info.hidden[index] === false);
  assert.deepEqual(visibleZ, ["0"]);
  assert.deepEqual(await compositeCenter(page), [255, 0, 0, 255]);
});

test("G. stale async failure cannot clear a newer tileset identity", { timeout: 30_000 }, async (t) => {
  const page = await openPage();
  t.after(() => page.close());
  const firstRef = tilesetRef("old");
  const secondRef = tilesetRef("new");
  await delayTileset(page, firstRef);
  await page.evaluate(({ viewPayload, spritePayload }) => {
    window.__view.receiveRenderData(viewPayload);
    window.__sprite.receiveRenderData(spritePayload);
  }, { viewPayload: viewData({ depth: 0, tileset: firstRef }), spritePayload: spriteData(0) });
  await waitForPendingImage(page, firstRef);
  await page.evaluate(({ viewPayload }) => {
    window.__view.receiveRenderData(viewPayload);
  }, { viewPayload: viewData({ depth: 64, tileset: secondRef }) });
  await waitPainted(page, "128", "65");
  const before = await layerInfo(page);
  await settlePendingImage(page, firstRef, "reject");
  const after = await layerInfo(page);
  assert.equal(after.hidden[0], false);
  assert.equal(after.zIndex[0], before.zIndex[0]);
  assert.equal(after.zIndex[0], "128");
  assert.deepEqual(await compositeCenter(page), [0, 0, 255, 255]);
});

test("H. tile depth and player y validate synchronously", { timeout: 30_000 }, async (t) => {
  const page = await openPage();
  t.after(() => page.close());
  const result = await page.evaluate(({ validView, sprite }) => {
    const throwsSync = (run) => {
      try {
        run();
        return { threw: false };
      } catch (error) {
        return { threw: true, name: error.name, message: error.message };
      }
    };
    const negativeDepth = throwsSync(() => window.__view.receiveRenderData({
      ...validView,
      tileVisuals: [[384, 0.5, 0, 0]],
    }));
    const nonIntegerDepth = throwsSync(() => window.__view.receiveRenderData({
      ...validView,
      chunks: [{ chunkX: 0, chunkY: 0, cells: Array(191).fill(0) }],
    }));
    const negativeY = throwsSync(() => window.__sprite.receiveRenderData({ ...sprite, y: -1 }));
    const nonIntegerY = throwsSync(() => window.__sprite.receiveRenderData({ ...sprite, y: 0.5 }));
    return { negativeDepth, nonIntegerDepth, negativeY, nonIntegerY };
  }, { validView: viewData({ depth: 0 }), sprite: spriteData(0) });
  for (const key of ["negativeDepth", "nonIntegerDepth", "negativeY", "nonIntegerY"]) {
    assert.equal(result[key].threw, true, key);
    assert.equal(result[key].name, "TypeError", key);
  }
});

test("walking uses four pattern source rects and swaps at half step", { timeout: 30_000 }, async (t) => {
  const page = await openPage();
  t.after(() => page.close());
  await warmPresentation(page);
  assert.deepEqual(await spritePixel(page), [255, 0, 0, 255]);

  await page.evaluate(({ viewPayload, spritePayload }) => {
    window.__view.receiveRenderData(viewPayload);
    window.__sprite.receiveRenderData(spritePayload);
  }, {
    viewPayload: viewData({ depth: 0, cameraMotion: { id: 1, durationMs: 250, fromCameraX: 0, fromCameraY: 0 } }),
    spritePayload: walkingSprite({ pattern: 1, screenY: 0, fromScreenY: 0, y: 0, fromY: 0 }),
  });
  await waitUntil(page, () => {
    const canvas = document.querySelector("lr-map-sprite")?.shadowRoot?.querySelector("canvas");
    if (!canvas) return false;
    const [r, g] = canvas.getContext("2d").getImageData(5, 5, 1, 1).data;
    return r === 0 && g === 255;
  }, "startPattern 1 first half");
  await waitUntil(page, () => {
    const [r, g, b] = document.querySelector("lr-map-sprite").shadowRoot.querySelector("canvas").getContext("2d").getImageData(5, 5, 1, 1).data;
    return r === 0 && g === 0 && b === 255;
  }, "startPattern 1 second half");

  await page.evaluate(({ viewPayload, spritePayload }) => {
    window.__view.receiveRenderData(viewPayload);
    window.__sprite.receiveRenderData(spritePayload);
  }, {
    viewPayload: viewData({ depth: 0, cameraMotion: { id: 2, durationMs: 250, fromCameraX: 0, fromCameraY: 0 } }),
    spritePayload: walkingSprite({ pattern: 3, screenY: 0, fromScreenY: 0, y: 0, fromY: 0, id: 2 }),
  });
  await waitUntil(page, () => {
    const [r, g] = document.querySelector("lr-map-sprite").shadowRoot.querySelector("canvas").getContext("2d").getImageData(5, 5, 1, 1).data;
    return r === 255 && g === 255;
  }, "startPattern 3 first half");
  await waitUntil(page, () => {
    const [r, g, b] = document.querySelector("lr-map-sprite").shadowRoot.querySelector("canvas").getContext("2d").getImageData(5, 5, 1, 1).data;
    return r === 255 && g === 0 && b === 0;
  }, "startPattern 3 second half");
});

test("walking interpolates integer pixels then snaps to target and stops rAF", { timeout: 30_000 }, async (t) => {
  const page = await openPage();
  t.after(() => page.close());
  await warmPresentation(page);
  await page.evaluate(({ viewPayload, spritePayload }) => {
    window.__view.receiveRenderData(viewPayload);
    window.__sprite.receiveRenderData(spritePayload);
  }, {
    viewPayload: viewData({ depth: 0, cameraX: 32, cameraMotion: { id: 1, durationMs: 250, fromCameraX: 0, fromCameraY: 0 } }),
    spritePayload: walkingSprite({}),
  });
  await waitUntil(page, () => {
    const destX = window.__tileDestX();
    const top = Number.parseFloat(getComputedStyle(document.querySelector("lr-map-sprite")).top);
    return Number.isInteger(destX) && destX >= -31 && destX <= -1
      && Number.isInteger(top) && top > 0 && top < 32;
  }, "integer camera and sprite mid-step");
  await waitUntil(page, () => {
    const view = document.querySelector("lr-map-view");
    const sprite = document.querySelector("lr-map-sprite");
    return window.__tileDestX() === null
      && getComputedStyle(sprite).top === "32px"
      && view?._raf === undefined
      && sprite?._raf === undefined;
  }, "progress 1 camera and sprite target and rAF stop");
  const box = await spriteBox(page);
  assert.equal(box.top, "32px");
  assert.equal(Number.isInteger(Number.parseFloat(box.left)), true);
  assert.equal(box.raf, undefined);
  assert.equal(await page.evaluate(() => window.__view._raf), undefined);
  assert.equal(await page.evaluate(() => window.__tileDestX()), null);
});

test("standing latest state snaps pattern 0 and cancels motion", { timeout: 30_000 }, async (t) => {
  const page = await openPage();
  t.after(() => page.close());
  await page.evaluate(({ viewPayload, spritePayload }) => {
    window.__view.receiveRenderData(viewPayload);
    window.__sprite.receiveRenderData(spritePayload);
  }, { viewPayload: viewData({ depth: 0, cameraMotion: { id: 1, durationMs: 250, fromCameraX: 0, fromCameraY: 0 } }), spritePayload: walkingSprite({}) });
  await waitUntil(page, () => getComputedStyle(document.querySelector("lr-map-sprite")).top !== "auto" && getComputedStyle(document.querySelector("lr-map-sprite")).top !== "0px" || document.querySelector("lr-map-sprite")._lastPaintedScreen, "walking paint started");
  await page.evaluate(({ viewPayload, spritePayload }) => {
    window.__view.receiveRenderData(viewPayload);
    window.__sprite.receiveRenderData(spritePayload);
  }, { viewPayload: viewData({ depth: 0 }), spritePayload: spriteData(1) });
  await waitUntil(page, () => {
    const sprite = document.querySelector("lr-map-sprite");
    const canvas = sprite?.shadowRoot?.querySelector("canvas");
    if (!sprite || !canvas) return false;
    const [r, g, b] = canvas.getContext("2d").getImageData(5, 5, 1, 1).data;
    return getComputedStyle(sprite).top === "32px" && sprite._raf === undefined && r === 255 && g === 0 && b === 0;
  }, "standing snap");
});

test("moving depth is below the tile before the boundary pixel and above at it", { timeout: 30_000 }, async (t) => {
  const page = await openPage();
  t.after(() => page.close());
  await warmPresentation(page);
  await page.evaluate(({ viewPayload, spritePayload }) => {
    window.__view.receiveRenderData(viewPayload);
    window.__sprite.receiveRenderData(spritePayload);
  }, {
    viewPayload: viewData({ depth: 48, cameraMotion: { id: 1, durationMs: 250, fromCameraX: 0, fromCameraY: 0 } }),
    spritePayload: walkingSprite({ y: 1, fromY: 0, screenY: 0, fromScreenY: 0, pattern: 3 }),
  });
  await waitUntil(page, () => {
    const z = Number(getComputedStyle(document.querySelector("lr-map-sprite")).zIndex);
    const tileZ = document.querySelector("lr-map-view")?.shadowRoot?.querySelector("canvas.tile-layer:not([hidden])")?.style.zIndex;
    return z > 0 && z < 97 && tileZ === "96";
  }, "character still below tile depth 48");
  let belowPixel;
  const belowDeadline = Date.now() + 200;
  while (Date.now() < belowDeadline) {
    const z = await page.evaluate(() => Number(getComputedStyle(document.querySelector("lr-map-sprite")).zIndex));
    if (z > 0 && z < 97) {
      belowPixel = await compositeCenter(page);
      if (belowPixel[2] === 255 && belowPixel[0] === 0) break;
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.deepEqual(belowPixel, [0, 0, 255, 255]);
  await waitUntil(page, () => Number(getComputedStyle(document.querySelector("lr-map-sprite")).zIndex) >= 97, "character reached tile depth 48");
  assert.deepEqual(await compositeCenter(page), [255, 0, 0, 255]);
});

test("newer walking replaces old motion and standing cancel still wins", { timeout: 30_000 }, async (t) => {
  const page = await openPage();
  t.after(() => page.close());
  await warmPresentation(page);
  await page.evaluate(({ firstView, secondView, first, second }) => {
    window.__view.receiveRenderData(firstView);
    window.__sprite.receiveRenderData(first);
    window.__view.receiveRenderData(secondView);
    window.__sprite.receiveRenderData(second);
  }, {
    firstView: viewData({ depth: 0, cameraMotion: { id: 1, durationMs: 250, fromCameraX: 0, fromCameraY: 0 } }),
    secondView: viewData({ depth: 0, cameraMotion: { id: 2, durationMs: 250, fromCameraX: 0, fromCameraY: 0 } }),
    first: walkingSprite({ id: 1, screenY: 32 }),
    second: walkingSprite({ id: 2, y: 2, fromY: 1, screenY: 64, fromScreenY: 32, pattern: 3 }),
  });
  await waitUntil(page, () => {
    const top = Number.parseFloat(getComputedStyle(document.querySelector("lr-map-sprite")).top);
    return Number.isInteger(top) && top > 32 && top < 64;
  }, "newer walking in progress");
  await page.evaluate(({ viewPayload, spritePayload }) => {
    window.__view.receiveRenderData(viewPayload);
    window.__sprite.receiveRenderData(spritePayload);
  }, { viewPayload: viewData({ depth: 0 }), spritePayload: spriteData(2) });
  await waitUntil(page, () => {
    const sprite = document.querySelector("lr-map-sprite");
    const canvas = sprite?.shadowRoot?.querySelector("canvas");
    if (!sprite || !canvas) return false;
    const [r, g, b] = canvas.getContext("2d").getImageData(5, 5, 1, 1).data;
    return getComputedStyle(sprite).top === "64px" && sprite._raf === undefined && r === 255 && g === 0 && b === 0;
  }, "standing latest state");
});

test("disconnect cancels rAF so a stale callback cannot paint", { timeout: 30_000 }, async (t) => {
  const page = await openPage();
  t.after(() => page.close());
  await warmPresentation(page);
  await page.evaluate(({ viewPayload, spritePayload }) => {
    window.__view.receiveRenderData(viewPayload);
    window.__sprite.receiveRenderData(spritePayload);
  }, { viewPayload: viewData({ depth: 0, cameraMotion: { id: 1, durationMs: 250, fromCameraX: 0, fromCameraY: 0 } }), spritePayload: walkingSprite({}) });
  await waitUntil(page, () => document.querySelector("lr-map-sprite")?._raf !== undefined, "rAF started");
  await page.evaluate(() => {
    const sprite = window.__sprite;
    sprite.remove();
    window.__disconnectedRaf = sprite._raf;
  });
  await waitUntil(page, () => window.__sprite._raf === undefined, "rAF cancelled after disconnect");
  assert.equal(await page.evaluate(() => window.__sprite.isConnected), false);
});

test("stale sprite image success and failure do not override newer walking", { timeout: 30_000 }, async (t) => {
  const page = await openPage();
  t.after(() => page.close());
  const firstRef = { namespace: "resource.Graphics", key: "Characters/red", contentVersion: "old" };
  const secondRef = { namespace: "resource.Graphics", key: "Characters/red", contentVersion: "new" };
  await delayTileset(page, firstRef);
  await page.evaluate(({ viewPayload, spritePayload }) => {
    window.__view.receiveRenderData(viewPayload);
    window.__sprite.receiveRenderData(spritePayload);
  }, { viewPayload: viewData({ depth: 0, cameraMotion: { id: 1, durationMs: 250, fromCameraX: 0, fromCameraY: 0 } }), spritePayload: walkingSprite({ sprite: firstRef, screenY: 32 }) });
  await waitForPendingImage(page, firstRef, "__sprite");
  await page.evaluate(({ viewPayload, spritePayload }) => {
    window.__view.receiveRenderData(viewPayload);
    window.__sprite.receiveRenderData(spritePayload);
  }, {
    viewPayload: viewData({ depth: 0, cameraMotion: { id: 2, durationMs: 250, fromCameraX: 0, fromCameraY: 0 } }),
    spritePayload: walkingSprite({ sprite: secondRef, id: 2, y: 2, fromY: 1, screenY: 64, fromScreenY: 32, pattern: 3 }),
  });
  await waitUntil(page, () => getComputedStyle(document.querySelector("lr-map-sprite")).top === "64px", "newer sprite painted");
  await settlePendingImage(page, firstRef, "resolve", "__sprite");
  assert.equal((await spriteBox(page)).top, "64px");

  const failRef = { namespace: "resource.Graphics", key: "Characters/red", contentVersion: "fail" };
  await delayTileset(page, failRef);
  await page.evaluate(({ viewPayload, spritePayload }) => {
    window.__view.receiveRenderData(viewPayload);
    window.__sprite.receiveRenderData(spritePayload);
  }, {
    viewPayload: viewData({ depth: 0, cameraMotion: { id: 3, durationMs: 250, fromCameraX: 0, fromCameraY: 0 } }),
    spritePayload: walkingSprite({ sprite: failRef, id: 3, y: 3, fromY: 2, screenY: 96, fromScreenY: 64, pattern: 1 }),
  });
  await waitForPendingImage(page, failRef, "__sprite");
  await page.evaluate(({ viewPayload, spritePayload }) => {
    window.__view.receiveRenderData(viewPayload);
    window.__sprite.receiveRenderData(spritePayload);
  }, {
    viewPayload: viewData({ depth: 0, cameraMotion: { id: 4, durationMs: 250, fromCameraX: 0, fromCameraY: 0 } }),
    spritePayload: walkingSprite({ sprite: secondRef, id: 4, y: 2, fromY: 1, screenY: 64, fromScreenY: 32, pattern: 3 }),
  });
  await waitUntil(page, () => getComputedStyle(document.querySelector("lr-map-sprite")).top === "64px", "replacement after failed stale request");
  const before = await spriteBox(page);
  await settlePendingImage(page, failRef, "reject", "__sprite");
  assert.equal((await spriteBox(page)).top, before.top);
});

test("late decode catches up from receivedAt and skips rAF after 250ms", { timeout: 30_000 }, async (t) => {
  const page = await openPage();
  t.after(() => page.close());
  const delayedRef = { namespace: "resource.Graphics", key: "Characters/red", contentVersion: "late" };
  await delayTileset(page, delayedRef);
  await page.evaluate(({ viewPayload, spritePayload }) => {
    window.__view.receiveRenderData(viewPayload);
    window.__sprite.receiveRenderData(spritePayload);
  }, { viewPayload: viewData({ depth: 0, cameraMotion: { id: 1, durationMs: 250, fromCameraX: 0, fromCameraY: 0 } }), spritePayload: walkingSprite({ sprite: delayedRef }) });
  await waitForPendingImage(page, delayedRef, "__sprite");
  await page.evaluate(async () => {
    const started = performance.now();
    while (performance.now() - started < 260) await new Promise((resolve) => requestAnimationFrame(resolve));
  });
  await settlePendingImage(page, delayedRef, "resolve", "__sprite");
  await waitUntil(page, () => {
    const sprite = document.querySelector("lr-map-sprite");
    return getComputedStyle(sprite).top === "32px" && sprite._raf === undefined;
  }, "late decode lands on target without rAF");
  assert.deepEqual(await spritePixel(page), [0, 0, 255, 255]);
});

test("late tileset decode catches up from receivedAt and skips MapView rAF", { timeout: 30_000 }, async (t) => {
  const page = await openPage();
  t.after(() => page.close());
  const delayedRef = { namespace: "resource.Graphics", key: "Tilesets/blue", contentVersion: "late" };
  await delayTileset(page, delayedRef);
  await page.evaluate(({ viewPayload }) => window.__view.receiveRenderData(viewPayload), {
    viewPayload: viewData({
      depth: 0,
      tileset: delayedRef,
      cameraX: 32,
      cameraMotion: { id: 1, durationMs: 250, fromCameraX: 0, fromCameraY: 0 },
      tiles: [regularTile({ x: 1, depth: 0 })],
    }),
  });
  await waitForPendingImage(page, delayedRef, "__view");
  await page.evaluate(async () => {
    const started = performance.now();
    while (performance.now() - started < 260) await new Promise((resolve) => requestAnimationFrame(resolve));
  });
  await settlePendingImage(page, delayedRef, "resolve", "__view");
  await waitUntil(page, () => {
    const canvas = document.querySelector("lr-map-view")?.shadowRoot?.querySelector("canvas.tile-layer:not([hidden])");
    if (!canvas) return false;
    const [r, g, b, a] = canvas.getContext("2d").getImageData(5, 5, 1, 1).data;
    return a === 255 && r === 0 && g === 0 && b === 255 && document.querySelector("lr-map-view")._raf === undefined;
  }, "late tileset decode lands on target camera without rAF");
  assert.equal(await page.evaluate(() => window.__tileDestX()), 0);
});

test("late source tileset decode cannot overwrite a newer map-transfer target", { timeout: 30_000 }, async (t) => {
  const page = await openPage();
  t.after(() => page.close());
  const sourceRef = tilesetRef("source");
  const targetRef = tilesetRef("target");
  await delayTileset(page, sourceRef);
  await page.evaluate(({ viewPayload, spritePayload }) => {
    window.__view.receiveRenderData(viewPayload);
    window.__sprite.receiveRenderData(spritePayload);
  }, {
    viewPayload: { ...viewData({
      depth: 64,
      tileset: sourceRef,
      tiles: [regularTile({ depth: 64 })],
    }), mapId: 66 },
    spritePayload: spriteData(0),
  });
  await waitForPendingImage(page, sourceRef);
  await page.evaluate(({ viewPayload }) => {
    window.__view.receiveRenderData(viewPayload);
  }, {
    viewPayload: { ...viewData({
      depth: 0,
      tileset: targetRef,
      tiles: [regularTile({ depth: 0 })],
    }), mapId: 2 },
  });
  await waitPainted(page, "0", "65");
  await settlePendingImage(page, sourceRef, "resolve");
  const info = await layerInfo(page);
  const visibleZ = info.zIndex.filter((_, index) => info.hidden[index] === false);
  assert.deepEqual(visibleZ, ["0"]);
  assert.deepEqual(await compositeCenter(page), [255, 0, 0, 255]);
});

const CELL_COLORS = ["rgb(255, 0, 0)", "rgb(0, 255, 0)", "rgb(0, 0, 255)", "rgb(255, 255, 0)", "rgb(255, 0, 255)"];
const CELL_PIXELS = [
  [255, 0, 0, 255],
  [0, 255, 0, 255],
  [0, 0, 255, 255],
  [255, 255, 0, 255],
  [255, 0, 255, 255],
];

function cellView(ref, extra = {}) {
  return viewData({
    autotiles: autotilesAt([[0, ref]]),
    tiles: [autotileTile({ slot: 0, tileId: 48 })],
    ...extra,
  });
}

test("single-cell autotile advances one 32px frame per duration on a paused clock", { timeout: 30_000 }, async (t) => {
  const page = await openPage({ clock: true });
  t.after(() => page.close());
  const ref = autotileRef("Autotiles/Test Flowers [1]");
  await installAutotile(page, ref.key, await makeStrip(page, 32, 32, CELL_COLORS));
  await paintAutotile(page, cellView(ref));
  assert.deepEqual(await tilePixel(page), CELL_PIXELS[0]);
  for (const expected of [1, 2, 3, 4, 0]) {
    await page.clock.runFor(50);
    assert.deepEqual(await tilePixel(page), CELL_PIXELS[expected]);
  }
  const sample = await page.evaluate(() => {
    const canvas = document.querySelector("lr-map-view").shadowRoot.querySelector("canvas.tile-layer:not([hidden])");
    const data = canvas.getContext("2d").getImageData(0, 0, 32, 32).data;
    const colors = new Set();
    for (let index = 0; index < data.length; index += 4) {
      if (data[index + 3] !== 255) continue;
      colors.add(`${data[index]},${data[index + 1]},${data[index + 2]}`);
    }
    return [...colors];
  });
  assert.deepEqual(sample, ["255,0,0"]);
});

test("single-cell autotile smoke observes two frames under real rAF", { timeout: 30_000 }, async (t) => {
  const page = await openPage();
  t.after(() => page.close());
  const ref = autotileRef("Autotiles/Test Flowers [1]");
  await installAutotile(page, ref.key, await makeStrip(page, 32, 32, CELL_COLORS));
  await paintAutotile(page, cellView(ref));
  const first = await tilePixel(page);
  await page.evaluate((pixel) => { window.__firstAutotilePixel = pixel; }, first);
  await waitUntil(page, () => {
    const canvas = document.querySelector("lr-map-view")?.shadowRoot?.querySelector("canvas.tile-layer:not([hidden])");
    if (!canvas) return false;
    const [r, g, b, a] = canvas.getContext("2d").getImageData(8, 8, 1, 1).data;
    const firstPixel = window.__firstAutotilePixel;
    return a === 255 && (r !== firstPixel[0] || g !== firstPixel[1] || b !== firstPixel[2]);
  }, "a second autotile frame");
});

test("block autotile keeps variant corners and only shifts the 96px frame base", { timeout: 30_000 }, async (t) => {
  const page = await openPage({ clock: true });
  t.after(() => page.close());
  const ref = autotileRef("Autotiles/Test Sea [1]");
  const corners = [
    { sx: 0, sy: 0 },
    { sx: 16, sy: 0 },
    { sx: 0, sy: 16 },
    { sx: 16, sy: 16 },
  ];
  await installAutotile(page, ref.key, await makeStrip(page, 96, 128, ["rgb(255, 0, 0)", "rgb(0, 255, 0)", "rgb(0, 0, 255)"]));
  await paintAutotile(page, viewData({
    autotiles: autotilesAt([[3, ref]]),
    tiles: [autotileTile({ slot: 3, tileId: 192, corners })],
  }));
  const samples = async () => page.evaluate(() => {
    const canvas = document.querySelector("lr-map-view").shadowRoot.querySelector("canvas.tile-layer:not([hidden])");
    const context = canvas.getContext("2d");
    return {
      tl: [...context.getImageData(4, 4, 1, 1).data],
      tr: [...context.getImageData(20, 4, 1, 1).data],
      bl: [...context.getImageData(4, 20, 1, 1).data],
      br: [...context.getImageData(20, 20, 1, 1).data],
    };
  });
  const first = await samples();
  assert.deepEqual(first.tl, [255, 0, 0, 255]);
  assert.deepEqual(first.tr, first.tl);
  assert.deepEqual(first.bl, first.tl);
  assert.deepEqual(first.br, first.tl);
  await page.clock.runFor(50);
  const second = await samples();
  assert.deepEqual(second.tl, [0, 255, 0, 255]);
  assert.deepEqual(second.tr, second.tl);
  assert.deepEqual(second.bl, second.tl);
  assert.deepEqual(second.br, second.tl);
});

test("different slots modulo their own frameCount", { timeout: 30_000 }, async (t) => {
  const page = await openPage({ clock: true });
  t.after(() => page.close());
  const five = autotileRef("Autotiles/Five [1]");
  const four = autotileRef("Autotiles/Four [1]");
  await installAutotile(page, five.key, await makeStrip(page, 32, 32, CELL_COLORS));
  await installAutotile(page, four.key, await makeStrip(page, 32, 32, CELL_COLORS.slice(0, 4)));
  await paintAutotile(page, viewData({
    autotiles: autotilesAt([[0, five], [1, four]]),
    tiles: [
      autotileTile({ slot: 0, tileId: 48 }),
      autotileTile({ x: 1, slot: 1, tileId: 96 }),
    ],
  }));
  await page.clock.runFor(200);
  assert.deepEqual(await tilePixel(page, 8, 8), CELL_PIXELS[4]);
  assert.deepEqual(await tilePixel(page, 40, 8), CELL_PIXELS[0]);
});

test("aliased ResourceRef decodes once and paints every used slot", { timeout: 30_000 }, async (t) => {
  const page = await openPage({ clock: true });
  t.after(() => page.close());
  const shared = autotileRef("Autotiles/Shared [1]");
  await installAutotile(page, shared.key, await makeStrip(page, 32, 32, CELL_COLORS));
  await page.evaluate(() => { window.__mapLayering.fetchCount = 0; });
  await paintAutotile(page, viewData({
    autotiles: autotilesAt([[2, shared], [5, shared]]),
    tiles: [
      autotileTile({ slot: 2, tileId: 144 }),
      autotileTile({ x: 1, slot: 5, tileId: 288 }),
    ],
  }));
  assert.equal(await page.evaluate(() => window.__mapLayering.fetchCount), 1);
  await page.clock.runFor(50);
  assert.deepEqual(await tilePixel(page, 8, 8), CELL_PIXELS[1]);
  assert.deepEqual(await tilePixel(page, 40, 8), CELL_PIXELS[1]);
});

async function assertAutotileDuration(t, key, holdMs) {
  const page = await openPage({ clock: true });
  t.after(() => page.close());
  const ref = autotileRef(key);
  await installAutotile(page, ref.key, await makeStrip(page, 32, 32, CELL_COLORS));
  await paintAutotile(page, cellView(ref));
  assert.deepEqual(await tilePixel(page), CELL_PIXELS[0]);
  await page.clock.runFor(holdMs);
  assert.deepEqual(await tilePixel(page), CELL_PIXELS[0]);
  await page.clock.runFor(1);
  assert.deepEqual(await tilePixel(page), CELL_PIXELS[1]);
}

test("autotile duration uses default 250ms, [1], [ 2 ], and unmatched names", { timeout: 60_000 }, async (t) => {
  await assertAutotileDuration(t, "Autotiles/PlainSea", 249);
  await assertAutotileDuration(t, "Autotiles/Tick [1]", 49);
  await assertAutotileDuration(t, "Autotiles/Spaced [ 2 ]", 99);
  await assertAutotileDuration(t, "Autotiles/Name[2]tail", 249);
});

test("illegal autotile duration fail-closed clears layers and stops RAF", { timeout: 30_000 }, async (t) => {
  const page = await openPage({ clock: true });
  t.after(() => page.close());
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const key of ["Autotiles/Bad [0]", "Autotiles/Huge [9007199254740992]"]) {
    const ref = autotileRef(key);
    await installAutotile(page, ref.key, await makeStrip(page, 32, 32, CELL_COLORS));
    await page.evaluate((payload) => window.__view.receiveRenderData(payload), cellView(ref));
    await waitUntil(page, () => {
      const view = document.querySelector("lr-map-view");
      const canvases = [...(view?.shadowRoot?.querySelectorAll("canvas.tile-layer") ?? [])];
      return canvases.length > 0 && canvases.every((canvas) => canvas.hidden) && view._raf === undefined;
    }, `fail-closed ${key}`);
  }
  assert.deepEqual(errors, []);
});

test("walking RenderData does not reset autotile phase", { timeout: 30_000 }, async (t) => {
  const page = await openPage({ clock: true });
  t.after(() => page.close());
  const ref = autotileRef("Autotiles/Test Flowers [1]");
  await installAutotile(page, ref.key, await makeStrip(page, 32, 32, CELL_COLORS));
  await paintAutotile(page, cellView(ref));
  await page.clock.runFor(50);
  assert.deepEqual(await tilePixel(page), CELL_PIXELS[1]);
  await page.evaluate((payload) => window.__view.receiveRenderData(payload), cellView(ref, {
    cameraX: 32,
    cameraMotion: { id: 1, durationMs: 250, fromCameraX: 0, fromCameraY: 0 },
  }));
  await waitUntil(page, () => {
    const canvas = document.querySelector("lr-map-view")?.shadowRoot?.querySelector("canvas.tile-layer:not([hidden])");
    if (!canvas) return false;
    const [r, g, b, a] = canvas.getContext("2d").getImageData(8, 8, 1, 1).data;
    return a === 255 && r === 0 && g === 255 && b === 0;
  }, "same autotile frame after walking RenderData");
  await page.clock.runFor(50);
  assert.deepEqual(await tilePixel(page), CELL_PIXELS[2]);
});

test("stale animated prepared loop cannot paint after a newer map", { timeout: 30_000 }, async (t) => {
  const page = await openPage({ clock: true });
  t.after(() => page.close());
  const ref = autotileRef("Autotiles/Test Flowers [1]");
  await installAutotile(page, ref.key, await makeStrip(page, 32, 32, CELL_COLORS));
  await paintAutotile(page, { ...cellView(ref), mapId: 66 });
  await page.clock.runFor(50);
  await page.evaluate(({ viewPayload, spritePayload }) => {
    window.__view.receiveRenderData(viewPayload);
    window.__sprite.receiveRenderData(spritePayload);
  }, { viewPayload: { ...viewData({ depth: 0, visualEpoch: 2 }), mapId: 2 }, spritePayload: { ...spriteData(0), visualEpoch: 2 } });
  await page.clock.runFor(1);
  await waitPainted(page, "0");
  await page.clock.runFor(200);
  assert.deepEqual(await tilePixel(page), [0, 0, 255, 255]);
  assert.deepEqual(await compositeCenter(page), [255, 0, 0, 255]);
});

test("single-frame idle autotile does not keep a permanent RAF", { timeout: 30_000 }, async (t) => {
  const page = await openPage({ clock: true });
  t.after(() => page.close());
  const ref = autotileRef("Autotiles/Still");
  await installAutotile(page, ref.key, await makeStrip(page, 32, 32, ["rgb(0, 128, 0)"]));
  await paintAutotile(page, cellView(ref));
  assert.equal(await page.evaluate(() => window.__view._raf), undefined);
});

test("synchronous reparent keeps the original animated prepared loop", { timeout: 30_000 }, async (t) => {
  const page = await openPage({ clock: true });
  t.after(() => page.close());
  const ref = autotileRef("Autotiles/Test Flowers [1]");
  await installAutotile(page, ref.key, await makeStrip(page, 32, 32, CELL_COLORS));
  await paintAutotile(page, cellView(ref));
  assert.deepEqual(await tilePixel(page), CELL_PIXELS[0]);
  await page.evaluate(() => {
    const view = window.__view;
    view.remove();
    document.body.append(view);
  });
  await page.clock.runFor(50);
  assert.deepEqual(await tilePixel(page), CELL_PIXELS[1]);
  assert.notEqual(await page.evaluate(() => window.__view._raf), undefined);
});

test("motion state machine keeps startedAt for same id/fingerprint and rejects drift", { timeout: 30_000 }, async (t) => {
  const page = await openPage();
  t.after(() => page.close());
  await warmPresentation(page);
  const walking = walkingSprite({ id: 1, screenY: 32, fromScreenY: 0 });
  const drifted = walkingSprite({ id: 1, screenY: 64, fromScreenY: 0, y: 2, fromY: 0 });
  const standing = spriteData(1);
  const result = await page.evaluate(async ({ walking: first, drifted: second, standing: rest }) => {
    const throwsSync = (run) => {
      try {
        run();
        return { threw: false };
      } catch (error) {
        return { threw: true, name: error.name };
      }
    };
    window.__sprite.receiveRenderData(first);
    const startedAt = window.__sprite._activeMotion.startedAt;
    const epoch = window.__sprite._paintEpoch;
    window.__sprite.receiveRenderData(first);
    const same = {
      startedAtUnchanged: window.__sprite._activeMotion.startedAt === startedAt,
      epochAdvanced: window.__sprite._paintEpoch === epoch + 1,
      id: window.__sprite._activeMotion.id,
    };
    const drift = throwsSync(() => window.__sprite.receiveRenderData(second));
    const afterDrift = {
      startedAt: window.__sprite._activeMotion.startedAt,
      latestY: window.__sprite._latestData.y,
      epoch: window.__sprite._paintEpoch,
    };
    window.__sprite.receiveRenderData(rest);
    return {
      same,
      drift,
      afterDrift,
      cleared: window.__sprite._activeMotion === null,
      latestY: window.__sprite._latestData.y,
    };
  }, { walking, drifted, standing });
  assert.equal(result.same.startedAtUnchanged, true);
  assert.equal(result.same.epochAdvanced, true);
  assert.equal(result.same.id, 1);
  assert.equal(result.drift.threw, true);
  assert.equal(result.drift.name, "TypeError");
  assert.equal(result.afterDrift.latestY, 1);
  assert.equal(result.cleared, true);
  assert.equal(result.latestY, 1);
});

test("null to null motion snaps without a timeline", { timeout: 30_000 }, async (t) => {
  const page = await openPage();
  t.after(() => page.close());
  await page.evaluate(({ firstView, secondView, first, second }) => {
    window.__view.receiveRenderData(firstView);
    window.__sprite.receiveRenderData(first);
    window.__view.receiveRenderData(secondView);
    window.__sprite.receiveRenderData(second);
  }, {
    firstView: viewData({ depth: 0 }),
    secondView: viewData({ depth: 0 }),
    first: spriteData(0),
    second: spriteData(2),
  });
  await waitUntil(page, () => getComputedStyle(document.querySelector("lr-map-sprite")).top === "64px", "standing snap to y=2");
  assert.equal(await page.evaluate(() => window.__sprite._activeMotion), null);
  assert.equal(await page.evaluate(() => window.__sprite._raf), undefined);
});

test("camera-only update keeps tile canvas backing", { timeout: 30_000 }, async (t) => {
  const page = await openPage();
  t.after(() => page.close());
  const tiles = [regularTile({ depth: 0 })];
  const first = viewData({ tiles, cameraX: 0, visualEpoch: 1 });
  const refreshed = viewData({ tiles, tileset: tilesetRef("v2"), cameraX: 32, visualEpoch: 2 });
  await page.evaluate((payload) => window.__view.receiveRenderData(payload), first);
  await waitUntil(page, () => {
    const view = document.querySelector("lr-map-view");
    return (view?._tileDrawCount ?? 0) > 0 && view.shadowRoot?.querySelector("canvas.tile-layer:not([hidden])")?.width > 0;
  }, "first raster");
  const info = await page.evaluate(async (next) => {
    const view = window.__view;
    const canvas = view.shadowRoot.querySelector("canvas.tile-layer:not([hidden])");
    const snapshot = () => ({
      width: canvas.width,
      height: canvas.height,
      left: canvas.style.left,
      draws: view._tileDrawCount,
      clears: view._tileClearCount,
      resizes: view._tileResizeCount,
      cameraOnly: view._cameraOnlyCommits,
    });
    const before = snapshot();
    const accepted = view._latestData;
    view.receiveRenderData({
      ...accepted,
      cameraX: accepted.cameraX + 32,
    });
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const afterCamera = snapshot();
    view.receiveRenderData(next);
    const deadline = performance.now() + 2_000;
    while (view._tileDrawCount === afterCamera.draws && performance.now() < deadline) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    return { before, afterCamera, afterRefresh: snapshot() };
  }, refreshed);
  assert.equal(info.before.draws > 0, true);
  assert.equal(info.afterCamera.draws, info.before.draws);
  assert.equal(info.afterCamera.clears, info.before.clears);
  assert.equal(info.afterCamera.resizes, info.before.resizes);
  assert.equal(info.afterCamera.width, info.before.width);
  assert.equal(info.afterCamera.height, info.before.height);
  assert.equal(info.afterCamera.cameraOnly, info.before.cameraOnly + 1);
  assert.equal(info.afterCamera.left, "-32px");
  assert.ok(info.afterRefresh.draws > info.afterCamera.draws, JSON.stringify(info));
  assert.ok(info.afterRefresh.resizes > info.afterCamera.resizes, JSON.stringify(info));
});

test("disconnect increments paint epoch so stale rAF cannot paint", { timeout: 30_000 }, async (t) => {
  const page = await openPage();
  t.after(() => page.close());
  await warmPresentation(page);
  await page.evaluate(({ viewPayload, spritePayload }) => {
    window.__view.receiveRenderData(viewPayload);
    window.__sprite.receiveRenderData(spritePayload);
  }, {
    viewPayload: viewData({ depth: 0, cameraMotion: { id: 1, durationMs: 250, fromCameraX: 0, fromCameraY: 0 } }),
    spritePayload: walkingSprite({}),
  });
  await waitUntil(page, () => document.querySelector("lr-map-sprite")?._raf !== undefined, "rAF started");
  const before = await page.evaluate(() => window.__sprite._paintEpoch);
  await page.evaluate(() => window.__sprite.remove());
  await waitUntil(page, () => window.__sprite._raf === undefined, "rAF cancelled after disconnect");
  assert.ok(await page.evaluate((epoch) => window.__sprite._paintEpoch > epoch && window.__sprite._activeMotion === null, before));
});
