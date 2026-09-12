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
const identityOf = (ref) => `${ref.namespace}\u0000${ref.key}\u0000${ref.contentVersion}`;

function viewData({ depth = 0, tileset = tilesetRef("v1"), tiles } = {}) {
  return {
    mapId: 1,
    mapWidth: 24,
    mapHeight: 18,
    cameraX: 0,
    cameraY: 0,
    tileset,
    tiles: tiles ?? [{ x: 0, y: 0, z: 0, tileId: 384, depth }],
  };
}

function spriteData(y = 0) {
  return { x: 0, y, screenX: 0, screenY: 0, direction: 2, pattern: 0, sprite: spriteRef };
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

async function openPage() {
  const page = await browser.newPage({ viewport: { width: 800, height: 600 }, deviceScaleFactor: 1 });
  await page.goto(origin);
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
      tilesetBytes: await pngBytes(32, 32, 0, 0, 255),
      characterBytes: await pngBytes(128, 128, 255, 0, 0),
      delayed: new Map(),
    };
    const resources = {
      async resource(namespace, key, contentVersion) {
        const id = `${namespace}\u0000${key}\u0000${contentVersion}`;
        if (window.__mapLayering.delayed.has(id)) return window.__mapLayering.delayed.get(id).promise;
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
    return visible.some((canvas) => canvas.style.zIndex === tileZ) && sprite?.style.zIndex === spriteZ;
  }, { tileZ: String(tileZIndex), spriteZ: String(spriteZIndex) }))) {
    if (Date.now() >= deadline) assert.fail(`Timed out waiting for tile z-index ${tileZIndex} and sprite z-index ${spriteZIndex}`);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

async function waitForPendingImage(page, ref) {
  const id = identityOf(ref);
  const deadline = Date.now() + 10_000;
  while (!(await page.evaluate((imageId) => window.__view._images.has(imageId), id))) {
    if (Date.now() >= deadline) assert.fail(`Timed out waiting for pending image ${id}`);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

async function settlePendingImage(page, ref, outcome) {
  const id = identityOf(ref);
  await page.evaluate(async ({ imageId, outcome: next }) => {
    const pending = window.__view._images.get(imageId);
    if (!pending) throw new Error(`stale image promise missing for ${imageId}`);
    const delayed = window.__mapLayering.delayed.get(imageId);
    if (!delayed) throw new Error(`delayed resource missing for ${imageId}`);
    if (next === "resolve") delayed.resolve({ bytes: window.__mapLayering.tilesetBytes, mime: "image/png" });
    else delayed.reject(new Error("stale tileset failed"));
    await pending.then(() => undefined, () => undefined);
  }, { imageId: id, outcome });
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
      spriteZIndex: document.querySelector("lr-map-sprite").style.zIndex,
    };
  });
}

async function secondLayerCleared(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector("lr-map-view").shadowRoot.querySelectorAll("canvas.tile-layer")[1];
    const data = canvas.getContext("2d").getImageData(0, 0, 640, 480).data;
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
        { x: 0, y: 0, z: 0, tileId: 384, depth: 0 },
        { x: 1, y: 0, z: 0, tileId: 384, depth: 64 },
      ],
    }),
    second: viewData({ tiles: [{ x: 0, y: 0, z: 0, tileId: 384, depth: 0 }] }),
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
      tiles: [{ x: 0, y: 0, z: 0, tileId: 384, depth: -1 }],
    }));
    const nonIntegerDepth = throwsSync(() => window.__view.receiveRenderData({
      ...validView,
      tiles: [{ x: 0, y: 0, z: 0, tileId: 384, depth: 1.5 }],
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
