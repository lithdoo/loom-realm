/**
 * Map Viewport PR0 — frozen Hostra Desktop 640 baseline (main contract §10).
 *
 * Investigation harness ONLY (PR0: production zero diff). Mirrors the frozen
 * M15 Hostra product fixture/harness (test/m15-hostra-product.test.mjs) to
 * record the CURRENT 640x480 ordinary / nonresize-refresh movement
 * first-paint baseline with the single-Browser-Window performance.now() clock
 * (input-captured.at -> browser-first-motion-paint.at in the same Window).
 *
 * PR0 does NOT assert the unimplemented PR1/PR2 performance targets; the
 * measured baseline is recorded for the Map Docs Freeze reviewer.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import { existsSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { syncMapPresentation } from "../examples/essentials-v21.1-local/scripts/sync-map-presentation.mjs";

const repository = fileURLToPath(new URL("..", import.meta.url));
const hostraRoot = process.env.HOSTRA_SOURCE_DIR ??
  (existsSync(join(repository, ".qualification", "hostra")) ? join(repository, ".qualification", "hostra") : join(repository, "..", "hostra"));
const hostraScript = join(hostraRoot, "packages", "hostra", "scripts", "hostra.js");
const desktopEntry = join(repository, "apps", "desktop", "dist", "main-entry.js");

function waitFor(check, label, timeout = 20_000) {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      let value;
      try { value = check(); } catch (error) { reject(error); return; }
      if (value) { resolve(value); return; }
      if (Date.now() - startedAt > timeout) { reject(new Error(`Timed out waiting for ${label}`)); return; }
      setTimeout(tick, 25);
    };
    tick();
  });
}

async function rmBusy(target) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    try { await fs.rm(target, { recursive: true, force: true }); return; }
    catch (error) {
      if (error && (error.code === "EBUSY" || error.code === "EPERM") && attempt < 11) {
        await new Promise((resolve) => setTimeout(resolve, 100 * (attempt + 1)));
        continue;
      }
      throw error;
    }
  }
}

function terminateChild(child) {
  return new Promise((resolve) => {
    if (child.exitCode !== null) { resolve(); return; }
    child.once("exit", () => resolve());
    child.kill("SIGTERM");
    setTimeout(() => { if (child.exitCode === null) child.kill("SIGKILL"); }, 3000).unref();
  });
}

function launchHostra(eventLog, userData, overrides = {}) {
  const environment = {
    ...process.env,
    HOSTRA_RPC_PORT: "0",
    HOSTRA_RPC_TOKEN: `pr0-${Math.random().toString(36).slice(2)}`,
    HOSTRA_CDP_PORT: "0",
    HOSTRA_CONFIG_DIR: repository,
    HOSTRA_USER_DATA_DIR: userData,
    HOSTRA_SUBCMD: `"${process.execPath}" --inspect=0 "${desktopEntry}"`,
    LOOMREALM_M15_EVENT_LOG: eventLog,
    ...overrides,
  };
  delete environment.ELECTRON_RUN_AS_NODE;
  const child = spawn(process.execPath, [hostraScript], {
    cwd: repository,
    env: environment,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  const output = [];
  const ready = new Promise((resolve, reject) => {
    const onLine = (chunk) => {
      const text = chunk.toString();
      output.push(text);
      for (const line of text.split(/\r?\n/)) {
        const match = /^\[hostra:event\] (\{.*\})$/.exec(line);
        if (match === null) continue;
        try {
          const event = JSON.parse(match[1]);
          if (event.type === "hostra.ready") resolve(event);
        } catch { /* non-JSON line */ }
      }
    };
    child.stdout.on("data", onLine);
    child.stderr.on("data", onLine);
    child.once("exit", (code) => reject(new Error(`Hostra exited before ready (${code})\n${output.join("")}`)));
  });
  return { child, ready, output };
}

function nearestRank(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)];
}

/** Frozen M15 movement installation fixture: hosted example copy + cyclic
 * 128x8 Map 900001 (z0 all tileId 384) with x-edge wrap transfers. */
async function prepareMovementInstallation() {
  const temporary = await mkdtemp(join(tmpdir(), "loomrealm-pr0-install-"));
  const exampleRoot = join(temporary, "essentials-v21.1");
  await fs.cp(join(repository, "examples", "essentials-v21.1"), exampleRoot, { recursive: true });
  await fs.symlink(join(repository, "node_modules"), join(exampleRoot, "node_modules"), process.platform === "win32" ? "junction" : "dir");
  await syncMapPresentation({ repoRoot: repository, exampleRoot, runBuild: false });
  const fsdb = join(exampleRoot, "[FSDB]essentials-v21.1");
  const tilesetPath = join(fsdb, "[struct]Tileset", "1.json");
  const tileset = JSON.parse(await fs.readFile(tilesetPath, "utf8"));
  if (!Object.hasOwn(tileset, "autotile_names")) {
    tileset.autotile_names = [null, null, null, null, null, null, null];
    await fs.writeFile(tilesetPath, `${JSON.stringify(tileset)}\n`);
  }
  const transferDir = join(fsdb, "[struct]MapTransfer");
  await fs.mkdir(transferDir, { recursive: true });
  await fs.writeFile(join(transferDir, ".info.meta"), "{}\n");
  await fs.writeFile(join(fsdb, "[struct]Map", "900001.json"), JSON.stringify({
    tileset_id: 1,
    width: 128,
    height: 8,
    data: {
      dimensions: 3,
      xSize: 128,
      ySize: 8,
      zSize: 3,
      values: [...Array(1024).fill(384), ...Array(2048).fill(0)],
    },
  }));
  await fs.writeFile(join(transferDir, "900001.json"), JSON.stringify({
    id: 900001,
    steps: [],
    contacts: [],
    edges: Array.from({ length: 8 }, (_, y) => ({ x: 127, y, direction: 6, targetMapId: 900001, targetX: 0, targetY: y })),
  }));
  await fs.writeFile(join(transferDir, "1.json"), JSON.stringify({
    id: 1,
    steps: [],
    contacts: [{ x: 10, y: 8, direction: 8, targetMapId: 900001, targetX: 8, targetY: 4, targetDirection: 6 }],
    edges: [],
  }));
  return { temporary, exampleRoot };
}

test("PR0 Hostra baseline: current 640 ordinary/refresh movement first-paint (3 rounds)", { timeout: 600_000, skip: (!existsSync(hostraScript) || !existsSync(desktopEntry)) ? "EVIDENCE MISSING: hostra checkout or desktop build absent" : false }, async (t) => {
  const installation = await prepareMovementInstallation();
  const eventLog = join(installation.temporary, "events.jsonl");
  await fs.writeFile(eventLog, "");
  const hostra = launchHostra(eventLog, join(installation.temporary, "hostra-user-data"), {
    LOOMREALM_DESKTOP_INSTALLATION_ROOT: installation.exampleRoot,
  });
  let browser = null;
  t.after(async () => {
    try {
      await browser?.close().catch(() => {});
      await terminateChild(hostra.child);
    } finally {
      await rmBusy(installation.temporary);
    }
  });
  const ready = await hostra.ready;
  browser = await chromium.connectOverCDP(ready.data.cdpEndpoint);
  const context = browser.contexts()[0];
  await waitFor(() => context.pages().some((candidate) => /\/_lr\/window\//u.test(candidate.url())), "PR0 Window");
  const page = context.pages().find((candidate) => /\/_lr\/window\//u.test(candidate.url()));
  await page.waitForFunction(() => document.documentElement.dataset.loomrealmRenderer === "installed", null, { timeout: 30_000 });
  await page.waitForSelector("lr-map-view lr-map-sprite", { timeout: 20_000 });
  await page.evaluate(() => {
    const records = [];
    globalThis.__loomrealmMovementRecords = records;
    globalThis.__loomrealmMovementQualification = (record) => { records.push(record); };
  });
  await page.bringToFront();
  await page.mouse.click(320, 240);
  await page.waitForFunction(() => document.hasFocus());
  await page.keyboard.press("ArrowUp");
  await page.waitForFunction(() => document.querySelector("lr-map-view")?._latestData?.mapId === 900001, null, { timeout: 10_000 });

  const sampleMove = async () => {
    const beforeX = await page.evaluate(() => {
      const tiles = document.querySelector("lr-map-view")?._latestData?.tiles;
      globalThis.__loomrealmMovementRecords.length = 0;
      globalThis.__loomrealmMovementPreviousCoverage = Array.isArray(tiles) && tiles.length > 0
        ? `${Math.min(...tiles.map((tile) => tile.x))},${Math.min(...tiles.map((tile) => tile.y))},${Math.max(...tiles.map((tile) => tile.x))},${Math.max(...tiles.map((tile) => tile.y))},${tiles.length}`
        : null;
      return document.querySelector("lr-map-sprite")?._latestData?.x ?? null;
    });
    await page.keyboard.press("ArrowRight");
    try {
      await page.waitForFunction(() => {
        const records = globalThis.__loomrealmMovementRecords ?? [];
        return records.some((record) => record.name === "input-captured")
          && records.some((record) => record.name === "browser-first-motion-paint");
      }, null, { timeout: 1_000 });
    } catch {
      return null;
    }
    await page.waitForFunction(() => {
      const records = globalThis.__loomrealmMovementRecords ?? [];
      return records.some((record) => record.name === "browser-motion-complete");
    }, null, { timeout: 2_000 }).catch(() => undefined);
    const after = await page.evaluate(() => {
      const tiles = document.querySelector("lr-map-view")?._latestData?.tiles;
      const coverage = Array.isArray(tiles) && tiles.length > 0
        ? `${Math.min(...tiles.map((tile) => tile.x))},${Math.min(...tiles.map((tile) => tile.y))},${Math.max(...tiles.map((tile) => tile.x))},${Math.max(...tiles.map((tile) => tile.y))},${tiles.length}`
        : null;
      return {
        records: globalThis.__loomrealmMovementRecords.slice(),
        x: document.querySelector("lr-map-sprite")?._latestData?.x ?? null,
        mapId: document.querySelector("lr-map-view")?._latestData?.mapId ?? null,
        refresh: coverage !== globalThis.__loomrealmMovementPreviousCoverage,
      };
    });
    if (after.mapId !== 900001 || after.x === null || (beforeX !== null && after.x <= beforeX)) return null;
    const input = after.records.find((record) => record.name === "input-captured");
    const paint = after.records.find((record) => record.name === "browser-first-motion-paint");
    if (!input || !paint) return null;
    if (typeof input.at !== "number" || typeof paint.at !== "number" || paint.at < input.at) return null;
    return { latency: paint.at - input.at, refresh: after.refresh };
  };

  // Warmup (discarded).
  for (let i = 0; i < 20; i += 1) await sampleMove();

  const rounds = [];
  for (let round = 1; round <= 3; round += 1) {
    const ordinary = [];
    const refresh = [];
    let attempts = 0;
    let invalid = 0;
    while ((ordinary.length < 100 || refresh.length < 30) && attempts < 800) {
      attempts += 1;
      const sample = await sampleMove();
      if (sample === null) { invalid += 1; continue; }
      if (sample.refresh) { if (refresh.length < 30) refresh.push(sample.latency); }
      else if (ordinary.length < 100) ordinary.push(sample.latency);
    }
    assert.ok(invalid / attempts <= 0.05, `round ${round} invalid ratio ${(invalid / attempts).toFixed(3)} > 0.05`);
    rounds.push({ round, attempts, invalid, ordinary, refresh });
  }

  const allOrdinary = rounds.flatMap((entry) => entry.ordinary);
  const allRefresh = rounds.flatMap((entry) => entry.refresh);
  const summary = {
    subject: process.env.GITHUB_SHA ?? "local-worktree",
    platform: { node: process.version, os: `${process.platform} ${process.release?.osVersion ?? ""}`, cpu: process.env.PROCESSOR_IDENTIFIER ?? "unknown" },
    viewport: "640x480 (current fixed product)",
    rounds: rounds.map((entry) => ({ round: entry.round, attempts: entry.attempts, invalid: entry.invalid, ordinary: entry.ordinary, refresh: entry.refresh })),
    ordinary: { n: allOrdinary.length, p50: nearestRank(allOrdinary, 0.5), p95: nearestRank(allOrdinary, 0.95), max: Math.max(...allOrdinary) },
    refresh: { n: allRefresh.length, p50: nearestRank(allRefresh, 0.5), p95: nearestRank(allRefresh, 0.95), max: Math.max(...allRefresh) },
    note: "PR0 baseline only: unimplemented PR1/PR2 performance targets are NOT asserted here",
  };
  process.stdout.write(`MAP_VIEWPORT_PR0_HOSTRA ${JSON.stringify(summary)}\n`);
  assert.equal(allOrdinary.length, 300);
  assert.ok(allRefresh.length >= 60, `refresh samples ${allRefresh.length} < 60`);
});
