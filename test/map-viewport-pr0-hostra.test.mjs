import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, promises as fs } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { syncMapPresentation } from "../examples/essentials-v21.1-local/scripts/sync-map-presentation.mjs";

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workspace = path.resolve(repository, "..");
const qualificationHostra = path.join(repository, ".qualification", "hostra");
const siblingHostra = path.join(workspace, "hostra");
const defaultHostra = existsSync(path.join(qualificationHostra, "packages", "hostra", "scripts", "hostra.js"))
  ? qualificationHostra
  : siblingHostra;
const hostraRoot = process.env.HOSTRA_SOURCE_DIR ? path.resolve(process.env.HOSTRA_SOURCE_DIR) : defaultHostra;
const hostraScript = path.join(hostraRoot, "packages", "hostra", "scripts", "hostra.js");
const electronExe = path.join(hostraRoot, "packages", "hostra", "electron_bin", "electron.exe");
const desktopEntry = path.join(repository, "apps", "desktop", "dist", "main-entry.js");
const localFsdb = path.join(repository, "examples", "essentials-v21.1-local", "[FSDB]Essentials v21.1");

function waitFor(check, label, timeout = 20_000) {
  const deadline = Date.now() + timeout;
  return new Promise((resolve, reject) => {
    const poll = async () => {
      try { if (await check()) { resolve(); return; } } catch {}
      if (Date.now() >= deadline) { reject(new Error(`Timed out waiting for ${label}`)); return; }
      setTimeout(poll, 25);
    };
    void poll();
  });
}

function childExited(child) {
  return child.exitCode !== null || child.signalCode !== null;
}

function waitForChildExit(child, timeoutMs) {
  if (childExited(child)) return Promise.resolve(true);
  return new Promise((resolve) => {
    const finish = (exited) => {
      clearTimeout(timer);
      child.off("exit", onExit);
      resolve(exited);
    };
    const onExit = () => finish(true);
    const timer = setTimeout(() => finish(childExited(child)), timeoutMs);
    child.once("exit", onExit);
  });
}

async function terminateChild(child) {
  if (childExited(child)) return;
  child.kill("SIGTERM");
  if (await waitForChildExit(child, 3_000)) return;
  child.kill("SIGKILL");
  if (!await waitForChildExit(child, 3_000)) {
    throw new Error(`Child process ${child.pid ?? "unknown"} did not terminate`);
  }
}

async function rmBusy(target) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    try {
      await rm(target, { recursive: true, force: true });
      return;
    } catch (cause) {
      if (cause && (cause.code === "EBUSY" || cause.code === "EPERM") && attempt < 11) {
        await new Promise((resolve) => setTimeout(resolve, 100 * (attempt + 1)));
        continue;
      }
      throw cause;
    }
  }
}

function launchHostra(eventLog, userData, overrides = {}) {
  const rpcToken = `pr0-${Date.now()}-${Math.random()}`;
  const environment = {
    ...process.env,
    HOSTRA_RPC_PORT: "0",
    HOSTRA_RPC_TOKEN: rpcToken,
    HOSTRA_CDP_PORT: "0",
    HOSTRA_CONFIG_DIR: repository,
    HOSTRA_USER_DATA_DIR: userData,
    HOSTRA_SUBCMD: `"${process.execPath}" --inspect=0 "${desktopEntry}"`,
    LOOMREALM_M15_EVENT_LOG: eventLog,
    ...overrides,
  };
  delete environment.ELECTRON_RUN_AS_NODE;
  const child = spawn(process.execPath, [hostraScript], { cwd: repository, env: environment, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
  let output = "";
  let readyResolve;
  let readyReject;
  const ready = new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
  const consume = (chunk) => {
    output += chunk.toString();
    for (const line of output.split(/\r?\n/u)) {
      const match = /^\[hostra:event\] (\{.*\})$/u.exec(line);
      if (!match) continue;
      try { const value = JSON.parse(match[1]); if (value.type === "hostra.ready") readyResolve(value); } catch {}
    }
  };
  child.stdout.on("data", consume); child.stderr.on("data", consume);
  child.once("exit", (code, signal) => readyReject(new Error(`Hostra exited before ready (${code ?? signal})\n${output}`)));
  return { child, ready, rpcToken, output: () => output };
}

async function prepareMovementInstallation() {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "loomrealm-pr0-hostra-"));
  const exampleRoot = path.join(temporary, "essentials-v21.1");
  await fs.cp(path.join(repository, "examples", "essentials-v21.1"), exampleRoot, { recursive: true });
  await fs.symlink(path.join(repository, "node_modules"), path.join(exampleRoot, "node_modules"), process.platform === "win32" ? "junction" : "dir");
  await syncMapPresentation({ repoRoot: repository, exampleRoot, runBuild: false });
  const fsdb = path.join(exampleRoot, "[FSDB]essentials-v21.1");
  const tilesetPath = path.join(fsdb, "[struct]Tileset", "1.json");
  const tileset = JSON.parse(await readFile(tilesetPath, "utf8"));
  if (!Object.hasOwn(tileset, "autotile_names")) {
    tileset.autotile_names = [null, null, null, null, null, null, null];
    await writeFile(tilesetPath, `${JSON.stringify(tileset)}\n`);
  }
  const transferDir = path.join(fsdb, "[struct]MapTransfer");
  await fs.mkdir(transferDir, { recursive: true });
  await writeFile(path.join(transferDir, ".info.meta"), "{}\n");
  await writeFile(path.join(fsdb, "[struct]Map", "900001.json"), JSON.stringify({
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
  await writeFile(path.join(transferDir, "900001.json"), JSON.stringify({
    id: 900001,
    steps: [],
    contacts: [],
    edges: Array.from({ length: 8 }, (_, y) => ({ x: 127, y, direction: 6, targetMapId: 900001, targetX: 0, targetY: y })),
  }));
  await writeFile(path.join(transferDir, "1.json"), JSON.stringify({
    id: 1,
    steps: [],
    contacts: [{ x: 10, y: 8, direction: 8, targetMapId: 900001, targetX: 8, targetY: 4, targetDirection: 6 }],
    edges: [],
  }));
  return { temporary, exampleRoot };
}

function nearestRank(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)];
}

function environmentStatus() {
  const missing = [];
  if (!existsSync(hostraScript)) missing.push(`Hostra script ${hostraScript}`);
  if (process.platform === "win32" && !existsSync(electronExe)) missing.push(`Hostra Electron ${electronExe}`);
  if (!existsSync(desktopEntry)) missing.push(`Desktop entry ${desktopEntry}`);
  if (!existsSync(localFsdb)) missing.push(`local FSDB ${localFsdb}`);
  return { hostraRoot, hostraScript, electronExe, desktopEntry, localFsdb, missing };
}

test("PR0 records Hostra/local environment before product timing", () => {
  const status = environmentStatus();
  process.stdout.write(`MAP_VIEWPORT_PR0_HOSTRA_ENV ${JSON.stringify(status)}\n`);
  if (status.missing.length > 0) {
    assert.fail(`EVIDENCE MISSING: ${status.missing.join("; ")}`);
  }
});

test("current Hostra 640 ordinary/refresh historical-seam baseline", { timeout: 600_000 }, async (t) => {
  const status = environmentStatus();
  if (status.missing.length > 0) {
    t.diagnostic(`EVIDENCE MISSING: ${status.missing.join("; ")}`);
    assert.fail(`EVIDENCE MISSING: ${status.missing.join("; ")}`);
  }
  const installation = await prepareMovementInstallation();
  const eventLog = path.join(installation.temporary, "events.jsonl");
  await writeFile(eventLog, "");
  const hostra = launchHostra(eventLog, path.join(installation.temporary, "hostra-user-data"), {
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
  await waitFor(() => context.pages().some((candidate) => /\/_lr\/window\//u.test(candidate.url())), "PR0 640 Window");
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
      globalThis.__loomrealmPreviousCoverage = Array.isArray(tiles) && tiles.length > 0
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
        refresh: coverage !== globalThis.__loomrealmPreviousCoverage,
      };
    });
    if (after.mapId !== 900001 || after.x === null || (beforeX !== null && after.x <= beforeX)) return null;
    const input = after.records.find((record) => record.name === "input-captured");
    const paint = after.records.find((record) => record.name === "browser-first-motion-paint");
    if (!input || !paint || typeof input.at !== "number" || typeof paint.at !== "number" || paint.at < input.at) {
      return null;
    }
    return {
      latency: paint.at - input.at,
      refresh: after.refresh === true,
    };
  };

  const rounds = [];
  for (let round = 1; round <= 3; round += 1) {
    const ordinary = [];
    const refresh = [];
    let attempts = 0;
    let invalid = 0;
    let warmupLeft = 20;
    while (ordinary.length < 100 || refresh.length < 30) {
      attempts += 1;
      if (attempts > 800) break;
      const sample = await sampleMove();
      if (sample === null) {
        invalid += 1;
        continue;
      }
      if (warmupLeft > 0) {
        warmupLeft -= 1;
        continue;
      }
      if (sample.refresh) {
        if (refresh.length < 30) refresh.push(sample.latency);
        continue;
      }
      if (ordinary.length < 100) ordinary.push(sample.latency);
    }
    assert.ok(invalid / attempts <= 0.05, JSON.stringify({ round, attempts, invalid, ordinary: ordinary.length, refresh: refresh.length }));
    assert.equal(ordinary.length, 100, JSON.stringify({ round, attempts, invalid, ordinary: ordinary.length, refresh: refresh.length }));
    assert.equal(refresh.length, 30, JSON.stringify({ round, attempts, invalid, ordinary: ordinary.length, refresh: refresh.length }));
    rounds.push({ round, attempts, invalid, ordinary, refresh });
  }
  const ordinary = rounds.flatMap((round) => round.ordinary);
  const refresh = rounds.flatMap((round) => round.refresh);
  const report = {
    subject: process.env.GITHUB_SHA ?? "local-worktree",
    clock: "same Browser Window performance.now(); input-captured.at to browser-first-motion-paint.at",
    platform: { node: process.version, os: `${process.platform} ${os.release()}`, cpu: os.cpus()[0]?.model ?? "unknown" },
    hostraRoot,
    viewport: "640x480 current product; 720/1080 product path OUT OF SCOPE for this baseline",
    rounds,
    ordinary: { p50: nearestRank(ordinary, 0.5), p95: nearestRank(ordinary, 0.95), max: Math.max(...ordinary), n: ordinary.length, latencies: ordinary },
    refresh: { p50: nearestRank(refresh, 0.5), p95: nearestRank(refresh, 0.95), max: Math.max(...refresh), n: refresh.length, latencies: refresh },
    note: "PR0 baseline only. Does not claim PR1/PR2 camera-only or 720/1080 PASS.",
  };
  await fs.mkdir(path.join(repository, "artifacts"), { recursive: true });
  await writeFile(path.join(repository, "artifacts", "map-viewport-pr0-hostra.json"), `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`MAP_VIEWPORT_PR0_HOSTRA ${JSON.stringify(report)}\n`);
  assert.equal(report.ordinary.n, 300);
  assert.equal(report.refresh.n, 90);
});
