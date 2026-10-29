#!/usr/bin/env node
/**
 * Map Presentation v1.1 projection-shift benchmark.
 * Measures overlap pixel-copy cost and update latency under controlled workloads.
 *
 * Usage:
 *   node scripts/map-projection-benchmark.mjs --label after-fix
 */
import { existsSync } from "node:fs";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mapBrowserPath = path.join(root, "game-libs", "map", "dist", "browser", "map.browser.js");

function argValue(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index < 0) return fallback;
  return process.argv[index + 1] ?? fallback;
}

const label = argValue("--label", "current");
const outDir = path.resolve(root, argValue("--out", "artifacts/map-projection-bench"));
const warmup = Number(argValue("--warmup", "10"));
const samples = Number(argValue("--samples", "100"));

function executablePath() {
  return [
    process.env.LOOMREALM_CHROMIUM_PATH,
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
  ].filter(Boolean).find(existsSync);
}

function percentile(sorted, p) {
  if (sorted.length === 0) return null;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

function summarize(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    count: sorted.length,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    max: sorted[sorted.length - 1] ?? null,
    mean: sorted.length ? sorted.reduce((sum, value) => sum + value, 0) / sorted.length : null,
  };
}

async function main() {
  if (!existsSync(mapBrowserPath)) {
    throw new Error(`Missing ${mapBrowserPath}; build @loomrealm-game/map first`);
  }
  const source = await readFile(mapBrowserPath);
  const server = http.createServer((request, response) => {
    if (new URL(request.url ?? "/", "http://localhost").pathname === "/map.browser.js") {
      response.setHeader("content-type", "text/javascript");
      response.end(source);
      return;
    }
    response.setHeader("content-type", "text/html");
    response.end("<!doctype html><html><head></head><body style=\"margin:0\"></body></html>");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  console.log(`launching browser label=${label}`);
  const browser = await chromium.launch({
    headless: true,
    ...(executablePath() ? { executablePath: executablePath() } : {}),
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  await page.goto(origin);
  await page.addScriptTag({ url: `${origin}/map.browser.js` });
  console.log(`browser ready version=${await browser.version()}`);

  const browserVersion = await browser.version();
  const machine = {
    platform: process.platform,
    arch: process.arch,
    cpuModel: os.cpus()[0]?.model ?? "unknown",
    cpuCount: os.cpus().length,
    totalMemBytes: os.totalmem(),
    node: process.version,
    browserVersion,
    label,
    warmup,
    samples,
    startedAt: new Date().toISOString(),
  };

  // Projection windows are intentionally modest so pixel-copy cost remains the
  // dominant measured factor without multi-minute Canvas readbacks.
  const workloads = [
    { name: "dense-high-overlap", viewport: [320, 240], shift: 1, width: 10, height: 7, dense: true },
    { name: "dense-high-overlap", viewport: [640, 480], shift: 1, width: 20, height: 14, dense: true },
    { name: "dense-mid-overlap", viewport: [640, 480], shift: 6, width: 20, height: 14, dense: true },
    { name: "dense-low-overlap", viewport: [640, 480], shift: 14, width: 20, height: 14, dense: true },
    { name: "dense-zero-overlap", viewport: [640, 480], shift: 20, width: 20, height: 14, dense: true },
    { name: "sparse-high-overlap", viewport: [640, 480], shift: 1, width: 20, height: 14, dense: false },
    { name: "dense-high-overlap", viewport: [1280, 720], shift: 1, width: 30, height: 18, dense: true },
    { name: "dense-high-overlap", viewport: [1920, 1080], shift: 1, width: 40, height: 24, dense: true },
    { name: "delete-churn", viewport: [640, 480], shift: 1, width: 20, height: 14, dense: true, deleteEvery: 3 },
    { name: "depth-churn", viewport: [640, 480], shift: 1, width: 12, height: 8, dense: true, depthChurn: true },
    { name: "resize-churn", viewport: [640, 480], shift: 0, width: 12, height: 8, dense: true, resize: true },
  ];

  const results = [];
  for (const workload of workloads) {
    process.stdout.write(`running ${workload.name} ${workload.viewport.join("x")} ... `);
    const startedWorkload = Date.now();
    const raw = await page.evaluate(async ({ workload: spec, warmup: warm, samples: sampleCount }) => {
      const TILE = 32;
      const pngBytes = async (width, height, r, g, b) => {
        const canvas = new OffscreenCanvas(width, height);
        const context = canvas.getContext("2d");
        context.fillStyle = `rgb(${r},${g},${b})`;
        context.fillRect(0, 0, width, height);
        const blob = await canvas.convertToBlob({ type: "image/png" });
        return new Uint8Array(await blob.arrayBuffer());
      };
      const tilesetBytes = await pngBytes(256, 32, 0, 0, 255);
      const characterBytes = await pngBytes(128, 128, 255, 0, 0);
      const resources = {
        async resource(_namespace, key) {
          if (key.startsWith("Tilesets/")) return { bytes: tilesetBytes, mime: "image/png" };
          if (key.startsWith("Characters/")) return { bytes: characterBytes, mime: "image/png" };
          throw new Error(`missing ${key}`);
        },
      };
      document.body.replaceChildren();
      const view = document.createElement("lr-map-view");
      const sprite = document.createElement("lr-map-sprite");
      view.append(sprite);
      document.body.append(view);
      view.receiveRenderContext({ resources });
      sprite.receiveRenderContext({ resources });

      const [viewportWidth, viewportHeight] = spec.viewport;
      const barHeight = viewportHeight < 480 ? 24 : viewportHeight < 720 ? 32 : 48;
      // Keep RenderData layout valid (rows in [14, 33]) independent of CSS viewport.
      const columns = Math.max(20, Math.ceil(viewportWidth / TILE));
      const rows = Math.min(33, Math.max(14, Math.ceil((viewportHeight - barHeight) / TILE)));
      const contentWidth = viewportWidth;
      const contentHeight = viewportHeight - barHeight;
      const logicalWidth = columns * TILE;
      const logicalHeight = rows * TILE;
      const mapWidth = 8192;
      const mapHeight = 256;
      const maxCameraX = Math.max(mapWidth * TILE - logicalWidth, 0);

      function makeTiles(minX, width, height, epoch, dense) {
        const tiles = [];
        for (let y = 0; y < height; y += 1) {
          for (let x = minX; x < minX + width; x += 1) {
            if (!dense && ((x + y) % 3 === 0)) continue;
            if (spec.deleteEvery && epoch > 0 && (x % spec.deleteEvery === 0) && (y % 2 === 0)) continue;
            const depth = spec.depthChurn ? ((minX + epoch) % 4) * 32 : 0;
            tiles.push([x, y, 0, 384, depth]);
          }
        }
        tiles.sort((left, right) => left[2] - right[2] || left[1] - right[1] || left[0] - right[0]);
        return tiles;
      }

      function payload(minX, epoch) {
        const width = spec.resize ? spec.width + (epoch % 4) : spec.width;
        const height = spec.resize ? spec.height + (epoch % 3) : spec.height;
        const cameraX = Math.min(minX * TILE, maxCameraX);
        return {
          sceneEpoch: 1,
          visualEpoch: epoch + 1,
          motionId: null,
          viewportWidth,
          viewportHeight,
          barHeight,
          contentWidth,
          contentHeight,
          columns,
          rows,
          logicalWidth,
          logicalHeight,
          scaleX: contentWidth / logicalWidth,
          scaleY: contentHeight / logicalHeight,
          mapName: "1",
          mapId: 1,
          mapWidth,
          mapHeight,
          cameraX,
          cameraY: 0,
          tileset: { namespace: "resource.Graphics", key: "Tilesets/blue", contentVersion: "v1" },
          autotiles: [null, null, null, null, null, null, null],
          projectionBounds: {
            minTileX: minX,
            minTileY: 0,
            maxTileX: minX + width - 1,
            maxTileY: height - 1,
          },
          tiles: makeTiles(minX, width, height, epoch, spec.dense),
          cameraMotion: null,
          bridgeLevel: 0,
        };
      }

      function spritePayload(viewData) {
        return {
          sceneEpoch: viewData.sceneEpoch,
          visualEpoch: viewData.visualEpoch,
          motionId: null,
          x: 0,
          y: 0,
          screenX: 0,
          screenY: 0,
          direction: 2,
          pattern: 0,
          sprite: { namespace: "resource.Graphics", key: "Characters/red", contentVersion: "v1" },
          motion: null,
          bridgeLevel: 0,
        };
      }

      async function waitAccepted(epoch) {
        const deadline = performance.now() + 15_000;
        while (view._acceptedVisualScene?.view.visualEpoch !== epoch || view._state !== "VISIBLE") {
          if (performance.now() > deadline) {
            throw new Error(`timeout waiting for epoch ${epoch} state=${view._state}`);
          }
          await new Promise((resolve) => requestAnimationFrame(resolve));
        }
      }

      function snapshotCounters() {
        return {
          overlapSnapshots: view._overlapSnapshots || 0,
          overlapPixels: view._overlapSnapshotPixels || 0,
          overlapMaxPixels: view._overlapSnapshotMaxPixels || 0,
          overlapReadBytes: view._overlapReadBytes || 0,
          overlapWriteBytes: view._overlapWriteBytes || 0,
          overlapGetMs: view._overlapGetImageDataMs || 0,
          overlapPutMs: view._overlapPutImageDataMs || 0,
          overlapCopyMs: view._overlapCopyMs || 0,
          dirty: view._dirtyCellDraws || 0,
          full: view._fullRasterPasses || 0,
          fullScene: view._fullRasterScenePasses || 0,
          fullNoOverlap: view._fullRasterNoOverlapPasses || 0,
          fullResize: view._fullRasterResizePasses || 0,
          fullFallback: view._fullRasterFallbackPasses || 0,
          incremental: view._incrementalRasterPasses || 0,
          allocations: view._surfaceAllocations || 0,
          resizes: view._surfaceResizes || 0,
          shifts: view._projectionShifts || 0,
          live: view._liveSurfaceCount || 0,
          pool: view._surfacePool.length || 0,
        };
      }

      const first = payload(0, 0);
      view.receiveRenderData(first);
      sprite.receiveRenderData(spritePayload(first));
      await waitAccepted(1);

      const total = warm + sampleCount;
      const updates = [];
      for (let index = 1; index <= total; index += 1) {
        const minX = (spec.shift || 0) * index;
        const next = payload(minX, index);
        const before = snapshotCounters();
        const started = performance.now();
        view.receiveRenderData(next);
        sprite.receiveRenderData(spritePayload(next));
        await waitAccepted(index + 1);
        const elapsed = performance.now() - started;
        const after = snapshotCounters();
        if (index > warm) {
          updates.push({
            index,
            elapsedMs: elapsed,
            overlapSnapshots: after.overlapSnapshots - before.overlapSnapshots,
            overlapPixels: after.overlapPixels - before.overlapPixels,
            overlapReadBytes: after.overlapReadBytes - before.overlapReadBytes,
            overlapWriteBytes: after.overlapWriteBytes - before.overlapWriteBytes,
            overlapGetMs: after.overlapGetMs - before.overlapGetMs,
            overlapPutMs: after.overlapPutMs - before.overlapPutMs,
            overlapCopyMs: after.overlapCopyMs - before.overlapCopyMs,
            dirty: after.dirty - before.dirty,
            fullNoOverlap: after.fullNoOverlap - before.fullNoOverlap,
            fullResize: after.fullResize - before.fullResize,
            fullFallback: after.fullFallback - before.fullFallback,
            incremental: after.incremental - before.incremental,
            allocations: after.allocations - before.allocations,
            resizes: after.resizes - before.resizes,
          });
        }
      }
      return { updates, final: snapshotCounters() };
    }, { workload, warmup, samples });

    const latency = summarize(raw.updates.map((row) => row.elapsedMs));
    const copyMs = summarize(raw.updates.map((row) => row.overlapCopyMs));
    const overlapPixels = summarize(raw.updates.map((row) => row.overlapPixels));
    const readBytes = summarize(raw.updates.map((row) => row.overlapReadBytes));
    const writeBytes = summarize(raw.updates.map((row) => row.overlapWriteBytes));
    const dirty = summarize(raw.updates.map((row) => row.dirty));
    results.push({
      workload: {
        ...workload,
        viewport: `${workload.viewport[0]}x${workload.viewport[1]}`,
      },
      latencyMs: latency,
      overlapCopyMs: copyMs,
      overlapPixels,
      overlapReadBytes: readBytes,
      overlapWriteBytes: writeBytes,
      dirtyCellDraws: dirty,
      totals: {
        overlapSnapshots: raw.updates.reduce((sum, row) => sum + row.overlapSnapshots, 0),
        fullNoOverlap: raw.updates.reduce((sum, row) => sum + row.fullNoOverlap, 0),
        fullResize: raw.updates.reduce((sum, row) => sum + row.fullResize, 0),
        fullFallback: raw.updates.reduce((sum, row) => sum + row.fullFallback, 0),
        incremental: raw.updates.reduce((sum, row) => sum + row.incremental, 0),
        allocations: raw.updates.reduce((sum, row) => sum + row.allocations, 0),
        resizes: raw.updates.reduce((sum, row) => sum + row.resizes, 0),
      },
      finalCounters: raw.final,
      samples: raw.updates,
    });
    console.log(
      `done ${(Date.now() - startedWorkload)}ms`
      + ` latency(p50/p95/max)=${latency.p50?.toFixed(3)}/${latency.p95?.toFixed(3)}/${latency.max?.toFixed(3)}`
      + ` copyMs(p50)=${copyMs.p50?.toFixed(3)}`
      + ` overlapPx(p50)=${overlapPixels.p50}`,
    );
  }

  await browser.close();
  await new Promise((resolve) => server.close(resolve));

  await mkdir(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const jsonPath = path.join(outDir, `${label}-${stamp}.json`);
  const mdPath = path.join(outDir, `${label}-${stamp}.md`);
  const payload = { machine, results };
  await writeFile(jsonPath, `${JSON.stringify(payload, null, 2)}\n`);

  const lines = [
    `# Map projection benchmark (${label})`,
    "",
    `- CPU: ${machine.cpuModel} × ${machine.cpuCount}`,
    `- Platform: ${machine.platform}/${machine.arch}`,
    `- Node: ${machine.node}`,
    `- Browser: ${machine.browserVersion}`,
    `- Warmup: ${warmup}; samples: ${samples}`,
    `- Started: ${machine.startedAt}`,
    "",
    "| Workload | Viewport | Shift | Latency p50/p95/max (ms) | Copy p50 (ms) | Overlap px p50 | Read B p50 | Write B p50 | Dirty p50 | Full no-overlap | Full resize |",
    "|---|---|---:|---|---:|---:|---:|---:|---:|---:|---:|",
  ];
  for (const row of results) {
    lines.push(
      `| ${row.workload.name} | ${row.workload.viewport} | ${row.workload.shift}`
      + ` | ${row.latencyMs.p50?.toFixed(3)} / ${row.latencyMs.p95?.toFixed(3)} / ${row.latencyMs.max?.toFixed(3)}`
      + ` | ${row.overlapCopyMs.p50?.toFixed(3)}`
      + ` | ${row.overlapPixels.p50}`
      + ` | ${row.overlapReadBytes.p50}`
      + ` | ${row.overlapWriteBytes.p50}`
      + ` | ${row.dirtyCellDraws.p50}`
      + ` | ${row.totals.fullNoOverlap}`
      + ` | ${row.totals.fullResize} |`,
    );
  }
  lines.push("");
  lines.push(`Raw JSON: \`${path.relative(root, jsonPath)}\``);
  lines.push("");
  lines.push("Notes:");
  lines.push("- Overlap read/write bytes are counted separately (`width * height * 4` each).");
  lines.push("- Copy timings wrap only `getImageData` / `putImageData`, not the whole update.");
  lines.push("- Large-area pixel copy remains in the incremental path; this measures it rather than removing it.");
  await writeFile(mdPath, `${lines.join("\n")}\n`);
  console.log(`wrote ${jsonPath}`);
  console.log(`wrote ${mdPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
