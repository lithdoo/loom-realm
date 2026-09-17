/**
 * Map Viewport PR0 — pre-freeze feasibility investigation (main contract §10).
 *
 * Investigation harness ONLY: no production code is modified by this file.
 * Measures, against the current executable subject:
 *  - §4 exact MapView data shape + VIEW_DATA_GUARD (<196608 B) for the fixed
 *    synthetic dense fixture at 320x240..1920x1080 (center, 4 edges,
 *    center->right source/target union);
 *  - the same §4 projection on the REAL local Essentials v21.1 FSDB Map002 /
 *    Map066 (densest windows at 640/720/1080 + edges) with real resource
 *    dimensions;
 *  - full `RenderDomain.update()` author validation cost on the new shape;
 *  - M13 `structurallyEqualJson` cost for camera-only changes (old flat-tile
 *    shape vs new chunked shape);
 *  - current Browser raster/receive baseline at 640 (dense) in real Chromium;
 *  - Map-private ShadowDOM `::slotted` + z-index stacking pixel oracle in real
 *    Chromium (main contract §6 feasibility);
 *  - Canvas backing / decoded+backing peak estimates vs 128/256 MiB budgets.
 *
 * PR0 does NOT require unimplemented PR1/PR2 performance targets to pass.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { RenderManager } from "../packages/subsystem/dist/internal/render-manager.js";
import { structurallyEqualJson } from "../packages/renderer/dist/internal/web-projector.js";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const FSDB = join(root, "examples", "essentials-v21.1-local", "[FSDB]Essentials v21.1");
const GUARD = 196608;
const SIZES = [
  [320, 240], [640, 480], [800, 600], [960, 540], [1280, 720], [1920, 1080],
];
const byteLength = (value) => new TextEncoder().encode(JSON.stringify(value)).byteLength;
const stats = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    n: sorted.length,
    p50: sorted[Math.max(0, Math.ceil(0.5 * sorted.length) - 1)],
    p95: sorted[Math.max(0, Math.ceil(0.95 * sorted.length) - 1)],
    max: sorted[sorted.length - 1],
  };
};

/* ------------------------------------------------------------------ */
/* §3/§4 projection — pure, shared by synthetic and real FSDB fixtures */
/* ------------------------------------------------------------------ */

function depthBiasOf(priority) { return priority === 0 ? -1 : (priority + 1) * 32; }
function tileDepthOf(worldY, priority) { return priority === 0 ? 0 : worldY * 32 + depthBiasOf(priority); }

function autotileQuadrants(variant, quarters) {
  const cell = (q) => ({ sx: (q % 6) * 16, sy: Math.floor(q / 6) * 16 });
  const i = variant * 4;
  return {
    tl: cell(quarters[i]), tr: cell(quarters[i + 1]),
    bl: cell(quarters[i + 2]), br: cell(quarters[i + 3]),
  };
}

// AUTOTILE_QUARTERS copied from game-libs/map/src/semantics.ts:89-107 (frozen).
const AUTOTILE_QUARTERS = [
  10, 4, 4, 4, 22, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4,
  10, 6, 6, 6, 22, 20, 20, 20, 22, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6,
  10, 4, 4, 4, 22, 18, 18, 18, 22, 24, 24, 24, 22, 16, 16, 16, 22, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4,
  10, 6, 6, 6, 22, 18, 18, 18, 22, 24, 24, 24, 22, 16, 16, 16, 22, 20, 20, 20, 22, 20, 20, 20, 22, 6, 6, 6, 6, 6, 6, 6,
  10, 4, 4, 4, 22, 18, 18, 18, 22, 24, 24, 24, 22, 16, 16, 16, 22, 12, 12, 12, 22, 12, 12, 12, 22, 12, 12, 12, 22, 4, 4, 4,
  10, 6, 6, 6, 22, 18, 18, 18, 22, 24, 24, 24, 22, 16, 16, 16, 22, 26, 26, 26, 22, 28, 28, 28, 22, 30, 30, 30, 22, 6, 6, 6,
  10, 14, 14, 14, 22, 18, 18, 18, 22, 24, 24, 24, 22, 16, 16, 16, 22, 12, 12, 12, 22, 12, 12, 12, 22, 12, 12, 12, 22, 14, 14, 14,
  10, 14, 14, 14, 22, 18, 18, 18, 22, 24, 24, 24, 22, 16, 16, 16, 22, 26, 26, 26, 22, 28, 28, 28, 22, 30, 30, 30, 22, 14, 14, 14,
  10, 14, 14, 14, 22, 20, 20, 20, 22, 20, 20, 20, 22, 20, 20, 20, 22, 20, 20, 20, 22, 20, 20, 20, 22, 20, 20, 20, 22, 14, 14, 14,
  10, 14, 14, 14, 22, 18, 18, 18, 22, 24, 24, 24, 22, 16, 16, 16, 22, 12, 12, 12, 22, 12, 12, 12, 22, 12, 12, 12, 22, 14, 14, 14,
  10, 14, 14, 14, 22, 18, 18, 18, 22, 24, 24, 24, 22, 16, 16, 16, 22, 26, 26, 26, 22, 28, 28, 28, 22, 30, 30, 30, 22, 14, 14, 14,
  10, 14, 14, 14, 22, 18, 18, 18, 22, 24, 24, 24, 22, 16, 16, 16, 22, 12, 12, 12, 22, 12, 12, 12, 22, 12, 12, 12, 22, 14, 14, 14,
  10, 14, 14, 14, 22, 18, 18, 18, 22, 24, 24, 24, 22, 16, 16, 16, 22, 26, 26, 26, 22, 28, 28, 28, 22, 30, 30, 30, 22, 14, 14, 14,
  10, 14, 14, 14, 22, 20, 20, 20, 22, 20, 20, 20, 22, 20, 20, 20, 22, 20, 20, 20, 22, 20, 20, 20, 22, 20, 20, 20, 22, 14, 14, 14,
  10, 14, 14, 14, 22, 18, 18, 18, 22, 24, 24, 24, 22, 16, 16, 16, 22, 12, 12, 12, 22, 12, 12, 12, 22, 12, 12, 12, 22, 14, 14, 14,
  10, 14, 14, 14, 22, 18, 18, 18, 22, 24, 24, 24, 22, 16, 16, 16, 22, 26, 26, 26, 22, 28, 28, 28, 22, 30, 30, 30, 22, 14, 14, 14,
  10, 14, 14, 14, 22, 18, 18, 18, 22, 24, 24, 24, 22, 16, 16, 16, 22, 12, 12, 12, 22, 12, 12, 12, 22, 12, 12, 12, 22, 14, 14, 14,
  10, 14, 14, 14, 22, 18, 18, 18, 22, 24, 24, 24, 22, 16, 16, 16, 22, 26, 26, 26, 22, 28, 28, 28, 22, 30, 30, 30, 22, 14, 14, 14,
];

/**
 * mapLike: { width, height, data: { values } } flat x+y*mapW+z*mapW*mapH.
 * tilesetLike: { priorities: number[] (per tile id), autotile_names: (string|null)[] }.
 * bounds: { minX, minY, maxX, maxY } required tile bounds (already unioned).
 */
function buildTileVisuals(chunks, map, tileset) {
  const used = new Set();
  for (const chunk of chunks) {
    for (let index = 0; index < chunk.cells.length; index += 1) {
      const id = chunk.cells[index];
      if (id !== 0) used.add(id);
    }
  }
  const visuals = [...used].sort((a, b) => a - b).map((tileId) => {
    if (tileId >= 384) {
      const priority = tileset.priorities[tileId] ?? 0;
      return [tileId, depthBiasOf(priority), 0, tileId - 384];
    }
    const slot = Math.floor((tileId - 48) / 48);
    const variant = (tileId - 48) % 48;
    const q = autotileQuadrants(variant, AUTOTILE_QUARTERS);
    const priority = tileset.priorities[tileId] ?? 0;
    return [tileId, depthBiasOf(priority), 1, slot,
      q.tl.sx, q.tl.sy, q.tr.sx, q.tr.sy, q.bl.sx, q.bl.sy, q.br.sx, q.br.sy];
  });
  return visuals;
}

function requiredBoundsFor(map, viewport, playerX, playerY) {
  const anchorX = Math.floor((viewport.width - 32) / 2);
  const anchorY = Math.floor((viewport.height - 32) / 2);
  const cameraX = Math.max(0, Math.min(playerX * 32 - anchorX, Math.max(map.width * 32 - viewport.width, 0)));
  const cameraY = Math.max(0, Math.min(playerY * 32 - anchorY, Math.max(map.height * 32 - viewport.height, 0)));
  return { anchorX, anchorY, cameraX, cameraY };
}

function tileBounds(map, viewport, cameraX, cameraY) {
  return {
    minX: Math.max(0, Math.floor(cameraX / 32)),
    maxX: Math.min(map.width - 1, Math.floor((cameraX + viewport.width - 1) / 32)),
    minY: Math.max(0, Math.floor(cameraY / 32)),
    maxY: Math.min(map.height - 1, Math.floor((cameraY + viewport.height - 1) / 32)),
  };
}

function chunkBoundsFor(bounds) {
  // required tile bounds -> containing chunks -> +1 full chunk overscan
  const c0x = Math.floor(bounds.minX / 8) - 1;
  const c0y = Math.floor(bounds.minY / 8) - 1;
  const c1x = Math.floor(bounds.maxX / 8) + 1;
  const c1y = Math.floor(bounds.maxY / 8) + 1;
  return { c0x, c0y, c1x, c1y };
}

function projectChunks(map, bounds) {
  const { c0x, c0y, c1x, c1y } = chunkBoundsFor(bounds);
  const chunks = [];
  for (let cy = Math.max(0, c0y); cy <= c1y; cy += 1) {
    for (let cx = Math.max(0, c0x); cx <= c1x; cx += 1) {
      const cells = new Array(192).fill(0);
      for (let z = 0; z < 3; z += 1) {
        for (let ly = 0; ly < 8; ly += 1) {
          for (let lx = 0; lx < 8; lx += 1) {
            const x = cx * 8 + lx;
            const y = cy * 8 + ly;
            if (x >= map.width || y >= map.height) continue;
            cells[(z * 8 + ly) * 8 + lx] = map.data.values[x + y * map.width + z * map.width * map.height] ?? 0;
          }
        }
      }
      chunks.push({ chunkX: cx, chunkY: cy, cells });
    }
  }
  return chunks;
}

function buildMapViewData({ map, tileset, tilesetRef, autotiles, width, height, playerX, playerY, boundsOverride, sceneEpoch = 1, visualEpoch = 1, motionId = null, cameraMotion = null }) {
  const viewport = { width, height };
  const { cameraX, cameraY } = requiredBoundsFor(map, viewport, playerX, playerY);
  const bounds = boundsOverride ?? tileBounds(map, viewport, cameraX, cameraY);
  const chunks = projectChunks(map, bounds);
  const tileVisuals = buildTileVisuals(chunks, map, tileset);
  return {
    sceneEpoch, visualEpoch, motionId,
    viewportWidth: width, viewportHeight: height,
    mapId: map.id, mapWidth: map.width, mapHeight: map.height, cameraX, cameraY,
    tileset: tilesetRef, autotiles,
    tileVisuals, chunks, cameraMotion,
  };
}

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

const SYNTHETIC_MAP = (() => {
  const width = 128, height = 96;
  const values = new Array(width * height * 3).fill(0);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      values[x + y * width] = 384 + ((x + y) % 8);
      values[x + y * width + width * height] = 48 + ((x + 2 * y) % 48);
      values[x + y * width + 2 * width * height] = 384 + ((x + 3 * y) % 8);
    }
  }
  return { id: 1, width, height, data: { values } };
})();

const SYNTHETIC_TILESET = (() => {
  const priorities = [];
  for (let id = 0; id <= 391; id += 1) priorities[id] = 0;
  // regular 384..391 priorities 0,1,2,3,4,5,0,1 (main contract §10)
  [0, 1, 2, 3, 4, 5, 0, 1].forEach((p, i) => { priorities[384 + i] = p; });
  return { id: 1, priorities, autotile_names: ["grass", null, null, null, null, null, null] };
})();

const syntheticRef = { namespace: "resource.Graphics", key: "Tilesets/pr0-dense", contentVersion: "pr0-v1" };
const syntheticAutotiles = [
  { namespace: "resource.Graphics", key: "Autotiles/pr0-a0", contentVersion: "pr0-v1" },
  null, null, null, null, null, null,
];

function syntheticPositions(map) {
  const midX = Math.floor(map.width / 2), midY = Math.floor(map.height / 2);
  return {
    center: [midX, midY],
    topLeft: [0, 0],
    topRight: [map.width - 1, 0],
    bottomLeft: [0, map.height - 1],
    bottomRight: [map.width - 1, map.height - 1],
  };
}

function synthSample(width, height, x, y, extra = {}) {
  return buildMapViewData({
    map: SYNTHETIC_MAP, tileset: SYNTHETIC_TILESET,
    tilesetRef: syntheticRef, autotiles: syntheticAutotiles,
    width, height, playerX: x, playerY: y, ...extra,
  });
}

/* ------------------------------------------------------------------ */
/* 1. Fixed synthetic dense fixture: exact shape + byte guard           */
/* ------------------------------------------------------------------ */

test("PR0 synthetic dense fixture: all sizes/positions satisfy the 196608B guard and exact chunk invariants", () => {
  const report = [];
  let maxBytes = 0;
  for (const [width, height] of SIZES) {
    const positions = syntheticPositions(SYNTHETIC_MAP);
    for (const [name, [x, y]] of Object.entries(positions)) {
      const data = synthSample(width, height, x, y);
      // exact chunk invariants: 192 cells, Y/X order, no duplicates.
      const seen = new Set();
      let lastY = -1, lastX = -1;
      for (const chunk of data.chunks) {
        assert.equal(chunk.cells.length, 192);
        assert.ok(!seen.has(`${chunk.chunkY},${chunk.chunkX}`), `duplicate chunk ${chunk.chunkY},${chunk.chunkX}`);
        seen.add(`${chunk.chunkY},${chunk.chunkX}`);
        assert.ok(
          chunk.chunkY > lastY || (chunk.chunkY === lastY && chunk.chunkX > lastX),
          `chunk Y/X order violated at ${chunk.chunkY},${chunk.chunkX}`,
        );
        lastY = chunk.chunkY; lastX = chunk.chunkX;
        assert.ok(Number.isSafeInteger(chunk.chunkX) && chunk.chunkX >= 0);
        assert.ok(Number.isSafeInteger(chunk.chunkY) && chunk.chunkY >= 0);
      }
      // tileVisuals strictly ascending, all used ids present exactly once.
      for (let i = 1; i < data.tileVisuals.length; i += 1) {
        assert.ok(data.tileVisuals[i][0] > data.tileVisuals[i - 1][0], "tileVisuals ascending");
      }
      const bytes = byteLength(data);
      assert.ok(bytes < GUARD, `${width}x${height} ${name}: ${bytes}B >= ${GUARD}B`);
      maxBytes = Math.max(maxBytes, bytes);
      report.push({ size: `${width}x${height}`, position: name, bytes, chunks: data.chunks.length, tileVisuals: data.tileVisuals.length });
    }
    // center -> right one tile: source/target visible-bounds union projection.
    const midX = Math.floor(SYNTHETIC_MAP.width / 2), midY = Math.floor(SYNTHETIC_MAP.height / 2);
    const a = requiredBoundsFor(SYNTHETIC_MAP, { width, height }, midX, midY);
    const b = requiredBoundsFor(SYNTHETIC_MAP, { width, height }, midX + 1, midY);
    const union = {
      minX: Math.min(tileBounds(SYNTHETIC_MAP, { width, height }, a.cameraX, a.cameraY).minX, tileBounds(SYNTHETIC_MAP, { width, height }, b.cameraX, b.cameraY).minX),
      minY: Math.min(tileBounds(SYNTHETIC_MAP, { width, height }, a.cameraX, a.cameraY).minY, tileBounds(SYNTHETIC_MAP, { width, height }, b.cameraX, b.cameraY).minY),
      maxX: Math.max(tileBounds(SYNTHETIC_MAP, { width, height }, a.cameraX, a.cameraY).maxX, tileBounds(SYNTHETIC_MAP, { width, height }, b.cameraX, b.cameraY).maxX),
      maxY: Math.max(tileBounds(SYNTHETIC_MAP, { width, height }, a.cameraX, a.cameraY).maxY, tileBounds(SYNTHETIC_MAP, { width, height }, b.cameraX, b.cameraY).maxY),
    };
    const unionData = synthSample(width, height, midX, midY, { boundsOverride: union });
    const unionBytes = byteLength(unionData);
    assert.ok(unionBytes < GUARD, `union ${width}x${height}: ${unionBytes}B`);
    report.push({ size: `${width}x${height}`, position: "centerRightUnion", bytes: unionBytes, chunks: unionData.chunks.length, tileVisuals: unionData.tileVisuals.length });
  }
  process.stdout.write(`MAP_VIEWPORT_PR0_SYNTHETIC ${JSON.stringify({ guard: GUARD, maxBytes, samples: report.length, report })}\n`);
});

/* ------------------------------------------------------------------ */
/* 2. Real local Essentials FSDB Map002 / Map066                        */
/* ------------------------------------------------------------------ */

async function loadFsdbRecord(kind, id) {
  const path = join(FSDB, `[struct]${kind}`, `${id}.json`);
  if (!existsSync(path)) return null;
  return JSON.parse(await readFile(path, "utf8"));
}

function pngDimensions(bytes) {
  // Minimal IHDR parse: width at offset 16, height at 20 (big endian).
  if (bytes.length < 24 || bytes[12] !== 0x49 || bytes[13] !== 0x48) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

async function tilesetResourceName(tilesetRecord) {
  const graphicsDir = join(FSDB, "[resource]Graphics", "Tilesets");
  const entries = await readdir(graphicsDir);
  const name = tilesetRecord.tileset_name;
  const hit = entries.find((entry) => entry === `${name}.png` || entry === name);
  return hit ? join(graphicsDir, hit) : null;
}

test("PR0 real local FSDB Map002/Map066: densest windows at 640/720/1080 with real resources", async () => {
  if (!existsSync(FSDB)) {
    process.stdout.write("MAP_VIEWPORT_PR0_LOCAL EVIDENCE MISSING: local FSDB not present\n");
    return;
  }
  const report = [];
  for (const mapId of [2, 66]) {
    const mapRecord = await loadFsdbRecord("Map", mapId);
    if (mapRecord === null) {
      report.push({ mapId, result: "EVIDENCE MISSING: no [struct]Map record" });
      continue;
    }
    const tilesetRecord = await loadFsdbRecord("Tileset", mapRecord.tileset_id);
    assert.ok(tilesetRecord !== null, `Tileset ${mapRecord.tileset_id} missing`);
    const map = {
      id: mapId, width: mapRecord.width, height: mapRecord.height,
      data: { values: mapRecord.data.values },
    };
    // densest window heuristic: scan every tile position, largest sum of
    // nonzero cells across the window bounds+overscan (bounded scan).
    const tileset = {
      id: mapRecord.tileset_id,
      priorities: tilesetRecord.priorities ?? [],
      autotile_names: tilesetRecord.autotile_names ?? [],
    };
    const tilesetRef = {
      namespace: "resource.Graphics",
      key: `Tilesets/${tilesetRecord.tileset_name}`,
      contentVersion: "local-fsdb",
    };
    const autotiles = (tileset.autotile_names ?? []).map((name) => name === null ? null : ({
      namespace: "resource.Graphics", key: `Autotiles/${name}`, contentVersion: "local-fsdb",
    }));
    while (autotiles.length < 7) autotiles.push(null);

    const positions = [
      ["center", Math.floor(map.width / 2), Math.floor(map.height / 2)],
      ["topLeft", 0, 0], ["topRight", map.width - 1, 0],
      ["bottomLeft", 0, map.height - 1], ["bottomRight", map.width - 1, map.height - 1],
    ];
    const resourcePath = await tilesetResourceName(tilesetRecord);
    const resourceDims = resourcePath ? pngDimensions(await readFile(resourcePath)) : null;
    let maxBytes = 0;
    for (const [width, height] of [[640, 480], [1280, 720], [1920, 1080]]) {
      for (const [name, x, y] of positions) {
        const data = buildMapViewData({ map, tileset, tilesetRef, autotiles, width, height, playerX: x, playerY: y });
        const bytes = byteLength(data);
        maxBytes = Math.max(maxBytes, bytes);
        report.push({
          mapId, map: `${map.width}x${map.height}x3`, size: `${width}x${height}`, position: name,
          bytes, chunks: data.chunks.length, tileVisuals: data.tileVisuals.length,
          guardPass: bytes < GUARD,
        });
      }
    }
    // report guard status without failing the investigation: guard failure on
    // real data is a STOP finding for the evidence ledger, recorded as-is.
    process.stdout.write(`MAP_VIEWPORT_PR0_LOCAL_MAP ${JSON.stringify({ mapId, tileset: tilesetRecord.tileset_name, resourcePath, resourceDims, maxBytes })}\n`);
  }
  process.stdout.write(`MAP_VIEWPORT_PR0_LOCAL_SAMPLES ${JSON.stringify(report)}\n`);
  // All real samples must at least project without crashing and be reported.
  assert.ok(report.length >= 30, "expected 2 maps x 3 sizes x 5 positions");
});

/* ------------------------------------------------------------------ */
/* 3. RenderDomain.update full-state validation + M13 equality costs    */
/* ------------------------------------------------------------------ */

function renderStateFor(data, spriteData) {
  return {
    zIndex: 0,
    roots: [{
      key: "viewport", tag: "lr-map-view", attrs: {},
      data,
      children: [{ key: "player", tag: "lr-map-sprite", attrs: {}, data: spriteData, children: [] }],
    }],
  };
}

test("PR0 Core/M13 middle-layer costs on the new shape (camera-only changes)", () => {
  const dense = synthSample(1920, 1080, 64, 48);
  const sprite = { sceneEpoch: 1, visualEpoch: 1, motionId: 1, x: 64, y: 48, screenX: 944, screenY: 512, direction: 2, pattern: 0, sprite: syntheticRef, motion: null };
  const manager = new RenderManager();
  const domain = manager.createDomain(renderStateFor(dense, sprite));

  // (a) full-data RenderDomain.update author cost (movement-style delta on
  // both nodes; the Render Update validator re-validates the full new data).
  // Measured at BOTH 640-dense and 1080-dense for scaling characterization.
  const updateTimesBySize = {};
  for (const [width, height] of [[640, 480], [1920, 1080]]) {
    const denseN = synthSample(width, height, 64, 48);
    const managerN = new RenderManager();
    const domainN = managerN.createDomain(renderStateFor(denseN, sprite));
    const updateN = {
      nodes: [
        { key: "viewport", data: { set: { cameraX: denseN.cameraX + 32, cameraY: denseN.cameraY, motionId: 2, cameraMotion: { id: 2, durationMs: 250, fromCameraX: denseN.cameraX, fromCameraY: denseN.cameraY } } } },
        { key: "player", data: { set: { x: 65, y: 48, screenX: 944, screenY: 512, motionId: 2, motion: { id: 2, durationMs: 250, fromY: 48, fromScreenX: 944, fromScreenY: 512 } } } },
      ],
    };
    const times = [];
    for (let i = 0; i < 200; i += 1) {
      const t0 = performance.now();
      domainN.update(updateN);
      times.push(performance.now() - t0);
    }
    updateTimesBySize[`${width}x${height}`] = { ...stats(times), chunks: denseN.chunks.length };
  }

  // (b) M13 structurallyEqualJson camera-only compare on the new shape:
  // identical frozen chunk objects, only camera/motion fields differ.
  const changed = { ...dense, cameraX: dense.cameraX + 32, cameraMotion: { id: 2, durationMs: 250, fromCameraX: dense.cameraX, fromCameraY: dense.cameraY } };
  const compareTimes = [];
  let unequal = 0;
  for (let i = 0; i < 200; i += 1) {
    const t0 = performance.now();
    if (!structurallyEqualJson(dense, changed)) unequal += 1;
    compareTimes.push(performance.now() - t0);
  }
  const equalTimes = [];
  for (let i = 0; i < 100; i += 1) {
    const t0 = performance.now();
    structurallyEqualJson(dense, dense);
    equalTimes.push(performance.now() - t0);
  }

  // (c) same compare on the CURRENT flat-tile shape at 640 for reference.
  const flatTiles = [];
  for (let y = 0; y < 15 + 2; y += 1) {
    for (let x = 0; x < 20 + 2; x += 1) {
      for (let z = 0; z < 3; z += 1) {
        const tileId = SYNTHETIC_MAP.data.values[x + y * SYNTHETIC_MAP.width + z * SYNTHETIC_MAP.width * SYNTHETIC_MAP.height];
        if (tileId === 0) continue;
        flatTiles.push({ x, y, z, tileId, depth: 0, blit: { kind: "regular", sourceIndex: tileId - 384 } });
      }
    }
  }
  const flatOld = { mapId: 1, mapWidth: 128, mapHeight: 96, cameraX: 0, cameraY: 0, tileset: syntheticRef, autotiles: syntheticAutotiles, tiles: flatTiles, cameraMotion: null };
  const flatNew = { ...flatOld, cameraX: 32, cameraMotion: { id: 1, durationMs: 250, fromCameraX: 0, fromCameraY: 0 } };
  const flatTimes = [];
  for (let i = 0; i < 200; i += 1) {
    const t0 = performance.now();
    structurallyEqualJson(flatOld, flatNew);
    flatTimes.push(performance.now() - t0);
  }

  assert.equal(unequal, 200, "camera-only change must be structurally unequal (drives M13 callback)");
  process.stdout.write(`MAP_VIEWPORT_PR0_MIDDLE_LAYER ${JSON.stringify({
    domainUpdateMsBySize: updateTimesBySize,
    m13CompareNewShapeCameraOnlyMs: stats(compareTimes),
    m13CompareNewShapeEqualMs: stats(equalTimes),
    m13CompareOldFlat640CameraOnlyMs: stats(flatTimes),
    newShapeChunks: dense.chunks.length,
    flatTileCount640: flatTiles.length,
  })}\n`);
});

/* ------------------------------------------------------------------ */
/* 4. Real Chromium: current Browser 640 baseline + private stacking    */
/* ------------------------------------------------------------------ */

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

test("PR0 Chromium: current browser 640 baseline raster + Map-private slotted stacking oracle", { timeout: 120_000 }, async (t) => {
  const bundle = await readFile(join(root, "game-libs", "map", "dist", "browser", "map.browser.js"), "utf8");
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
  t.after(async () => { await browser?.close(); server?.close(); });

  const page = await browser.newPage({ viewport: { width: 800, height: 600 }, deviceScaleFactor: 1 });
  await page.goto(origin);
  await page.addScriptTag({ url: `${origin}/map.browser.js` });

  // In-page PNG fixtures + fake resource client (mirrors map-layering harness).
  await page.evaluate(async () => {
    const png = async (width, height, color) => {
      const canvas = new OffscreenCanvas(width, height);
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, width, height);
      return new Uint8Array(await (await canvas.convertToBlob({ type: "image/png" })).arrayBuffer());
    };
    window.__pr0 = {
      bytes: new Map([
        ["Tilesets/pr0-dense", await png(256, 128, "rgb(0,0,255)")],
        ["Autotiles/pr0-a0", await png(192, 128, "rgb(0,128,0)")],
        ["Characters/pr0-char", await png(128, 128, "rgb(255,0,0)")],
      ]),
    };
    const resources = {
      async resource(namespace, key) {
        const bytes = window.__pr0.bytes.get(key);
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

  // Dense 640 flat-tile payloads on the CURRENT shape (map 128x96 formulas).
  const tilesetRef = { namespace: "resource.Graphics", key: "Tilesets/pr0-dense", contentVersion: "v1" };
  const autotiles = [{ namespace: "resource.Graphics", key: "Autotiles/pr0-a0", contentVersion: "v1" }, null, null, null, null, null, null];
  const windowTiles = (cameraX, cameraY) => {
    const tiles = [];
    const minX = Math.max(0, Math.floor(cameraX / 32) - 1);
    const maxX = Math.min(127, Math.floor((cameraX + 639) / 32) + 1);
    const minY = Math.max(0, Math.floor(cameraY / 32) - 1);
    const maxY = Math.min(95, Math.floor((cameraY + 479) / 32) + 1);
    for (let z = 0; z < 3; z += 1) {
      for (let y = minY; y <= maxY; y += 1) {
        for (let x = minX; x <= maxX; x += 1) {
          const id = 384 + ((x + [0, 2, 3][z] * y) % 8);
          tiles.push({ x, y, z, tileId: id, depth: 0, blit: { kind: "regular", sourceIndex: id - 384 } });
        }
      }
    }
    return tiles;
  };
  const flatPayload = (cameraX, cameraY, motion) => ({
    mapId: 1, mapWidth: 128, mapHeight: 96, cameraX, cameraY,
    tileset: tilesetRef, autotiles, tiles: windowTiles(cameraX, cameraY), cameraMotion: motion,
  });
  const spritePayload = {
    x: 64, y: 48, screenX: 304, screenY: 224, direction: 2, pattern: 0,
    sprite: { namespace: "resource.Graphics", key: "Characters/pr0-char", contentVersion: "v1" },
    motion: null,
  };

  // Warm: initial paint + decoded bitmaps.
  await page.evaluate(async ([viewData, spriteData]) => {
    window.__view.receiveRenderData(viewData);
    window.__sprite.receiveRenderData(spriteData);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }, [flatPayload(16, 32, null), spritePayload]);
  await page.waitForFunction(() => window.__view._latestData !== undefined);

  // Baseline A: camera-motion updates (ordinary) with fresh tiles identity
  // each iteration — worst case for the current full-raster implementation.
  const ordinaryPayloads = [];
  for (let i = 0; i < 60; i += 1) {
    ordinaryPayloads.push(flatPayload(48, 32, { id: i + 1, durationMs: 250, fromCameraX: 16, fromCameraY: 32 }));
  }
  const ordinary = await page.evaluate(async (payloads) => {
    const times = [];
    for (const data of payloads) {
      const t0 = performance.now();
      window.__view.receiveRenderData(data);
      times.push(performance.now() - t0);
      await new Promise((resolve) => setTimeout(resolve, 4));
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
    return times;
  }, ordinaryPayloads);

  // Baseline B: tiles-identity refresh (projection window change).
  const refreshPayloads = [];
  for (let i = 0; i < 40; i += 1) {
    refreshPayloads.push(flatPayload(48 + ((i % 4) * 128), 32, null));
  }
  const refresh = await page.evaluate(async (payloads) => {
    const times = [];
    for (const data of payloads) {
      const t0 = performance.now();
      window.__view.receiveRenderData(data);
      times.push(performance.now() - t0);
      await new Promise((resolve) => setTimeout(resolve, 8));
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
    return times;
  }, refreshPayloads);

  // Map-private stacking oracle (§6): parent shadow canvases + ::slotted rule
  // (mutable rule via adoptedStyleSheets — CSSOM works while detached).
  await page.evaluate(() => {
    class Pr0Parent extends HTMLElement {
      constructor() {
        super();
        this.attachShadow({ mode: "open" });
        const style = document.createElement("style");
        style.textContent = `
          :host { display:block; position:relative; width:320px; height:96px; overflow:hidden; background:#fff; }
          canvas { position:absolute; inset:0; }
          slot { display: contents; }
        `;
        this.shadowRoot.append(style);
        const ground = document.createElement("canvas");
        ground.width = 320; ground.height = 96;
        const groundCtx = ground.getContext("2d");
        groundCtx.fillStyle = "rgb(0,0,255)";
        groundCtx.fillRect(0, 0, 320, 96);
        ground.style.zIndex = "0";
        const overhead = document.createElement("canvas");
        overhead.width = 64; overhead.height = 96;
        const overheadCtx = overhead.getContext("2d");
        overheadCtx.fillStyle = "rgb(0,255,0)";
        overheadCtx.fillRect(0, 0, 64, 96);
        overhead.style.zIndex = "130";
        overhead.style.left = "0px";
        const sheet = new CSSStyleSheet();
        sheet.replaceSync(`::slotted(pr0-sprite) { position:absolute; left:144px; top:32px; z-index:65; }`);
        this.shadowRoot.append(ground, overhead, document.createElement("slot"));
        this.shadowRoot.adoptedStyleSheets = [sheet];
        this._slottedRule = sheet.cssRules[0];
      }
    }
    class Pr0Sprite extends HTMLElement {
      constructor() {
        super();
        const shadow = this.attachShadow({ mode: "open" });
        const canvas = document.createElement("canvas");
        canvas.width = 32; canvas.height = 32;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "rgb(255,0,0)";
        ctx.fillRect(0, 0, 32, 32);
        shadow.append(canvas);
      }
    }
    customElements.define("pr0-parent", Pr0Parent);
    customElements.define("pr0-sprite", Pr0Sprite);
    const parent = document.createElement("pr0-parent");
    const sprite = document.createElement("pr0-sprite");
    parent.append(sprite);
    document.body.replaceChildren(parent);
    window.__pr0Parent = parent;
  });
  const sampleStack = async () => {
    const shot = await page.locator("pr0-parent").screenshot();
    return page.evaluate(async (base64) => {
      const blob = new Blob([await (await fetch(`data:application/octet-stream;base64,${base64}`)).arrayBuffer()]);
      const bitmap = await createImageBitmap(blob);
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const ctx = canvas.getContext("2d");
      ctx.drawImage(bitmap, 0, 0);
      const sample = (x, y) => [...ctx.getImageData(x, y, 1, 1).data.slice(0, 3)];
      return { center: sample(160, 48), off: sample(10, 10) };
    }, shot.toString("base64"));
  };
  const above = await sampleStack();
  // Move the slotted sprite UNDER the ground layer via the parent-owned rule.
  await page.evaluate(() => { window.__pr0Parent._slottedRule.style.zIndex = "-1"; });
  await page.waitForTimeout(50);
  const below = await sampleStack();
  // Sprite (red) above ground (blue), under overhead (green): center red.
  assert.deepEqual(above.center, [255, 0, 0], "slotted sprite must composite above ground");
  assert.deepEqual(above.off, [0, 255, 0], "overhead canvas must cover ground");
  // zIndex -1 on the parent-owned ::slotted rule moves the sprite under ground.
  assert.deepEqual(below.center, [0, 0, 255], "parent-owned rule must re-stack the slotted sprite");

  process.stdout.write(`MAP_VIEWPORT_PR0_BROWSER ${JSON.stringify({
    ordinaryReceiveMs: stats(ordinary),
    refreshReceiveMs: stats(refresh),
    privateSlottedStackingFeasible: true,
  })}\n`);
  await page.close();
});

/* ------------------------------------------------------------------ */
/* 5. Canvas backing / decoded peak estimates vs budgets                */
/* ------------------------------------------------------------------ */

test("PR0 canvas backing and decoded+backing peak estimates vs budgets (exact bucket model)", () => {
  const MIB = 1024 * 1024;
  const report = [];
  for (const [width, height] of SIZES) {
    const worldW = Math.min(128 * 32, width + 2 * 8 * 32);
    const worldH = Math.min(96 * 32, height + 2 * 8 * 32);
    const rows = Math.ceil(worldH / 32);
    // Exact bucket model from the fixture: depth value -> set of world rows
    // (priority 0 collapses to the single depth-0 bucket spanning all rows).
    const bucketRows = new Map([[0, new Set()]]);
    for (let y = 0; y < rows; y += 1) {
      const priorities = new Set();
      for (let x = 0; x < Math.ceil(worldW / 32); x += 1) {
        for (let z = 0; z < 3; z += 1) {
          const tileId = SYNTHETIC_MAP.data.values[x + y * SYNTHETIC_MAP.width + z * SYNTHETIC_MAP.width * SYNTHETIC_MAP.height];
          priorities.add(SYNTHETIC_TILESET.priorities[tileId] ?? 0);
        }
      }
      for (const p of priorities) {
        const depth = p === 0 ? 0 : y * 32 + depthBiasOf(p);
        let set = bucketRows.get(depth);
        if (set === undefined) { set = new Set(); bucketRows.set(depth, set); }
        set.add(y);
      }
    }
    // per bucket: canvas covers its rows at full world width (conservative:
    // rows of one bucket may be non-contiguous -> bounding box)
    let backingPixels = 0;
    const bucketHeights = [];
    for (const [depth, rowSet] of bucketRows) {
      let minY = Infinity, maxY = -Infinity;
      for (const y of rowSet) { minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
      const bucketH = (maxY - minY + 1) * 32;
      bucketHeights.push(bucketH);
      backingPixels += worldW * bucketH;
    }
    // visible stage + one detached candidate stage + 32x32 sprite crop
    const visibleCanvasBytes = backingPixels * 4 + 32 * 32 * 4;
    const detachedCandidateCanvasBytes = backingPixels * 4;
    // decoded: real Essentials Tileset/Outside.png 256x16064 + autotile +
    // character, old+new scene during transfer preparation
    const decodedImageBytes = (256 * 16064 + 192 * 128 + 128 * 128) * 4 * 2;
    report.push({
      size: `${width}x${height}`, world: `${worldW}x${worldH}`,
      depthBuckets: bucketRows.size,
      visibleMiB: +(visibleCanvasBytes / MIB).toFixed(2),
      candidateMiB: +(detachedCandidateCanvasBytes / MIB).toFixed(2),
      decodedMiB: +(decodedImageBytes / MIB).toFixed(2),
      totalPeakMiB: +((visibleCanvasBytes + detachedCandidateCanvasBytes + decodedImageBytes) / MIB).toFixed(2),
    });
  }
  process.stdout.write(`MAP_VIEWPORT_PR0_MEMORY ${JSON.stringify(report)}\n`);
  // Owner-approved dual budget (2026-09-17, main contract SS5 revision):
  // visible <= 128MiB AND visible+detached+decoded peak <= 256MiB, at every
  // size including adversarial dense 1920x1080.
  for (const row of report) {
    assert.ok(row.visibleMiB <= 128, `${row.size} visible ${row.visibleMiB}MiB > 128MiB`);
    assert.ok(row.totalPeakMiB <= 256, `${row.size} total peak ${row.totalPeakMiB}MiB > 256MiB`);
  }
});
