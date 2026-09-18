import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, promises as fs } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import WebSocket from "ws";
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
const desktopEntry = path.join(repository, "apps", "desktop", "dist", "main-entry.js");

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

async function events(file) {
  const source = await readFile(file, "utf8").catch(() => "");
  return source.trim() === "" ? [] : source.trim().split("\n").map((line) => JSON.parse(line));
}

function portClosed(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port });
    const finish = (value) => { socket.destroy(); resolve(value); };
    socket.once("connect", () => finish(false)); socket.once("error", () => finish(true));
    socket.setTimeout(1_000, () => finish(true));
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

function launchHostra(eventLog, userData, overrides = {}) {
  const rpcToken = `qualification-${Date.now()}-${Math.random()}`;
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

async function connectRpc(endpoint, token) {
  const url = new URL(endpoint); url.searchParams.set("token", token);
  const socket = new WebSocket(url);
  await new Promise((resolve, reject) => { socket.once("open", resolve); socket.once("error", reject); });
  let id = 0;
  const pending = new Map();
  socket.on("message", (raw) => {
    const message = JSON.parse(raw.toString());
    const waiter = pending.get(message.id);
    if (!waiter) return;
    pending.delete(message.id);
    if (message.error) waiter.reject(new Error(message.error.message)); else waiter.resolve(message.result);
  });
  return {
    call(method, params = {}) {
      const callId = ++id;
      return new Promise((resolve, reject) => {
        pending.set(callId, { resolve, reject });
        socket.send(JSON.stringify({ jsonrpc: "2.0", id: callId, method, params }));
      });
    },
    close() { socket.close(); },
  };
}

async function processRows() {
  if (process.platform === "win32") {
    const child = spawn("powershell.exe", ["-NoProfile", "-Command", "Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,CommandLine | ConvertTo-Json -Compress"], { windowsHide: true });
    let output = ""; child.stdout.on("data", (chunk) => { output += chunk; });
    await new Promise((resolve, reject) => { child.once("exit", (code) => code === 0 ? resolve() : reject(new Error("Process query failed"))); child.once("error", reject); });
    const parsed = JSON.parse(output);
    return (Array.isArray(parsed) ? parsed : [parsed]).map((row) => ({ pid: row.ProcessId, ppid: row.ParentProcessId, command: row.CommandLine ?? "" }));
  }
  const child = spawn("ps", ["-axo", "pid=,ppid=,command="], { stdio: ["ignore", "pipe", "ignore"] });
  let output = ""; child.stdout.on("data", (chunk) => { output += chunk; });
  await new Promise((resolve, reject) => { child.once("exit", (code) => code === 0 ? resolve() : reject(new Error("Process query failed"))); child.once("error", reject); });
  return output.trim().split("\n").map((line) => /^\s*(\d+)\s+(\d+)\s+(.*)$/u.exec(line)).filter(Boolean).map((match) => ({ pid: Number(match[1]), ppid: Number(match[2]), command: match[3] }));
}

async function connectInspector(endpoint) {
  const socket = new WebSocket(endpoint);
  await new Promise((resolve, reject) => { socket.once("open", resolve); socket.once("error", reject); });
  let id = 0;
  const pending = new Map();
  socket.on("message", (raw) => {
    const message = JSON.parse(raw.toString());
    const waiter = pending.get(message.id);
    if (!waiter) return;
    pending.delete(message.id);
    if (message.error) waiter.reject(new Error(message.error.message)); else waiter.resolve(message.result);
  });
  return {
    evaluate(expression) {
      const callId = ++id;
      return new Promise((resolve, reject) => {
        pending.set(callId, { resolve, reject });
        socket.send(JSON.stringify({ id: callId, method: "Runtime.evaluate", params: { expression, awaitPromise: true, returnByValue: true } }));
      });
    },
    close() { socket.close(); },
  };
}

const distJsPath = path.join(repository, "game-libs", "map", "dist", "browser", "map.browser.js");
const distCssPath = path.join(repository, "game-libs", "map", "dist", "browser", "map.css");

async function presentationFixture() {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "loomrealm-sync-map-"));
  const exampleRoot = path.join(temporary, "example");
  const fsdbRoot = path.join(exampleRoot, "[FSDB]sync");
  const mapDir = path.join(fsdbRoot, "[resource]Presentation", "map");
  await fs.mkdir(mapDir, { recursive: true });
  const targetJs = path.join(mapDir, "map.browser.js.js");
  const targetCss = path.join(mapDir, "map.css.css");
  await writeFile(targetJs, "stale-js");
  await writeFile(targetCss, "stale-css");
  return { temporary, exampleRoot, fsdbRoot, targetJs, targetCss };
}

function nearestRank(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)];
}

async function setLogicalViewport(page, width, height) {
  const session = await page.context().newCDPSession(page);
  await session.send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await page.waitForFunction(([innerWidth, innerHeight]) => window.innerWidth === innerWidth && window.innerHeight === innerHeight, [width, height], { timeout: 10_000 });
  await page.waitForFunction(([boxWidth, boxHeight]) => {
    const data = document.querySelector("lr-map-view")?._latestData;
    return data?.viewportWidth === boxWidth && data?.viewportHeight === boxHeight;
  }, [width, height], { timeout: 10_000 });
}

async function mapPixel(page, sx = 352, sy = 224) {
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

async function prepareMovementInstallation({ cyclicMap = false } = {}) {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "loomrealm-movement-install-"));
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
  if (cyclicMap) {
    await writeFile(path.join(fsdb, "[struct]Map", "900001.json"), JSON.stringify({
      tileset_id: 1,
      width: 512,
      height: 8,
      data: {
        dimensions: 3,
        xSize: 512,
        ySize: 8,
        zSize: 3,
        values: [...Array(4096).fill(384), ...Array(8192).fill(0)],
      },
    }));
    await writeFile(path.join(transferDir, "900001.json"), JSON.stringify({
      id: 900001,
      steps: [],
      contacts: [],
      edges: Array.from({ length: 8 }, (_, y) => ({ x: 511, y, direction: 6, targetMapId: 900001, targetX: 0, targetY: y })),
    }));
    await writeFile(path.join(transferDir, "1.json"), JSON.stringify({
      id: 1,
      steps: [],
      contacts: [{ x: 10, y: 8, direction: 8, targetMapId: 900001, targetX: 8, targetY: 4, targetDirection: 6 }],
      edges: [],
    }));
  } else {
    await writeFile(path.join(transferDir, "1.json"), JSON.stringify({ id: 1, steps: [], contacts: [], edges: [] }));
  }
  return { temporary, exampleRoot };
}

test("syncMapPresentation replaces both Presentation files from map dist", async () => {
  const fixture = await presentationFixture();
  try {
    await syncMapPresentation({ repoRoot: repository, exampleRoot: fixture.exampleRoot, runBuild: false });
    assert.deepEqual(await readFile(fixture.targetJs), await readFile(distJsPath));
    assert.deepEqual(await readFile(fixture.targetCss), await readFile(distCssPath));
  } finally {
    await rm(fixture.temporary, { recursive: true, force: true });
  }
});

test("syncMapPresentation --check reports mismatch without writing", async () => {
  const fixture = await presentationFixture();
  try {
    await assert.rejects(
      () => syncMapPresentation({ repoRoot: repository, exampleRoot: fixture.exampleRoot, runBuild: false, checkOnly: true }),
      /hash/,
    );
    assert.equal(await readFile(fixture.targetJs, "utf8"), "stale-js");
    assert.equal(await readFile(fixture.targetCss, "utf8"), "stale-css");
  } finally {
    await rm(fixture.temporary, { recursive: true, force: true });
  }
});

test("syncMapPresentation rolls back both files if the second rename fails", async () => {
  const fixture = await presentationFixture();
  let stagingToTarget = 0;
  try {
    await assert.rejects(() => syncMapPresentation({
      repoRoot: repository,
      exampleRoot: fixture.exampleRoot,
      runBuild: false,
      fileOps: {
        ...fs,
        rename: async (from, to) => {
          if (String(from).includes(".loomrealm-sync.") && String(from).endsWith(".tmp")) {
            stagingToTarget += 1;
            if (stagingToTarget === 2) throw new Error("injected second rename failure");
          }
          return fs.rename(from, to);
        },
      },
    }), /injected second rename failure/);
    assert.equal(await readFile(fixture.targetJs, "utf8"), "stale-js");
    assert.equal(await readFile(fixture.targetCss, "utf8"), "stale-css");
  } finally {
    await rm(fixture.temporary, { recursive: true, force: true });
  }
});

test("syncMapPresentation rejects a Presentation symlink", async () => {
  const fixture = await presentationFixture();
  try {
    await assert.rejects(() => syncMapPresentation({
      repoRoot: repository,
      exampleRoot: fixture.exampleRoot,
      runBuild: false,
      fileOps: {
        ...fs,
        lstat: async (target) => {
          const stat = await fs.lstat(target);
          if (String(target) === fixture.targetJs) {
            return Object.assign(stat, {
              isSymbolicLink: () => true,
              isFile: () => false,
              isDirectory: () => false,
            });
          }
          return stat;
        },
      },
    }), /symlink/);
  } finally {
    await rm(fixture.temporary, { recursive: true, force: true });
  }
});

test("syncMapPresentation restores a stale backup before replacing", async () => {
  const fixture = await presentationFixture();
  try {
    await writeFile(`${fixture.targetJs}.loomrealm-sync.backup`, "backup-js");
    await writeFile(`${fixture.targetCss}.loomrealm-sync.backup`, "backup-css");
    await writeFile(fixture.targetJs, "interrupted-js");
    await writeFile(fixture.targetCss, "interrupted-css");
    await syncMapPresentation({ repoRoot: repository, exampleRoot: fixture.exampleRoot, runBuild: false });
    assert.deepEqual(await readFile(fixture.targetJs), await readFile(distJsPath));
    assert.deepEqual(await readFile(fixture.targetCss), await readFile(distCssPath));
    await assert.rejects(() => fs.lstat(`${fixture.targetJs}.loomrealm-sync.backup`));
    await assert.rejects(() => fs.lstat(`${fixture.targetCss}.loomrealm-sync.backup`));
  } finally {
    await rm(fixture.temporary, { recursive: true, force: true });
  }
});

test("M15 frozen Hostra owns the Window and reaches the M14 map", { timeout: 90_000 }, async (t) => {
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
  assert.match(ready.data.cdpEndpoint, /^http:\/\/127\.0\.0\.1:\d+$/u);
  browser = await chromium.connectOverCDP(ready.data.cdpEndpoint);
  const context = browser.contexts()[0];
  try {
    await waitFor(() => context.pages().some((candidate) => /\/_lr\/window\//u.test(candidate.url())), "Hostra Window");
  } catch (cause) {
    throw new Error(`${cause.message}\n${hostra.output()}\n${JSON.stringify(await events(eventLog))}`);
  }
  const page = context.pages().find((candidate) => /\/_lr\/window\//u.test(candidate.url()));
  const browserMessages = [];
  page.on("console", (message) => browserMessages.push(`console:${message.type()}:${message.text()}`));
  page.on("pageerror", (error) => browserMessages.push(`pageerror:${error.stack ?? error.message}`));
  try {
    await page.waitForFunction(() => document.documentElement.dataset.loomrealmRenderer === "installed", null, { timeout: 30_000 });
  } catch (cause) {
    const state = await page.evaluate(() => ({ url: location.href, html: document.documentElement.outerHTML, dataset: { ...document.documentElement.dataset } })).catch((error) => ({ error: error.message }));
    throw new Error(`${cause.message}\n${JSON.stringify(state)}\n${browserMessages.join("\n")}\n${hostra.output()}\n${JSON.stringify(await events(eventLog))}`);
  }
  try {
    await page.waitForSelector("lr-map-view lr-map-sprite", { timeout: 20_000 });
  } catch (cause) {
    const state = await page.evaluate(() => ({ url: location.href, html: document.documentElement.outerHTML.slice(0, 4000), dataset: { ...document.documentElement.dataset } })).catch((error) => ({ error: error.message }));
    throw new Error(`${cause.message}\n${JSON.stringify(state)}\n${browserMessages.join("\n")}\n${hostra.output()}\n${JSON.stringify(await events(eventLog))}`);
  }
  await setLogicalViewport(page, 640, 480);
  await waitFor(async () => (await events(eventLog)).some(({ type }) => type === "data-current"), "initial Data candidate");
  const rpc = await connectRpc(ready.data.rpcEndpoint, hostra.rpcToken);
  const hostState = await rpc.call("getHostState");
  const windows = await rpc.call("getAllWindows");
  const startup = (await events(eventLog)).find(({ stage }) => stage === "window-open");
  assert.equal(hostState.host.pid, ready.data.pid);
  assert.equal(hostState.subprocess.pid, (await events(eventLog))[0].pid);
  assert.deepEqual(windows.map(({ windowId }) => windowId), [startup.windowId]);
  assert.equal(await rpc.call("getVersion"), "44.1.1");
  rpc.close();
  const rows = await processRows();
  const loomProcess = rows.find(({ pid }) => pid === hostState.subprocess.pid);
  assert.equal(loomProcess?.ppid, ready.data.pid);
  const runners = rows.filter(({ ppid, command }) => ppid === loomProcess.pid && /game-launcher-hostra[\\/]dist[\\/]runner[\\/]entry\.js/u.test(command));
  assert.equal(runners.length, 1, JSON.stringify(rows.filter(({ ppid }) => ppid === loomProcess.pid)));
  const firstIdentity = await page.evaluate(() => document.documentElement.dataset.loomrealmRendererIdentity);
  const firstDocuments = (await events(eventLog)).filter(({ type }) => type === "document-bootstrap").length;
  assert.equal(typeof firstIdentity, "string");

  await page.evaluate(async () => {
    const response = await fetch(location.href);
    document.documentElement.dataset.navigationFetchStatus = String(response.status);
    const frame = document.createElement("iframe");
    frame.src = location.href;
    document.body.append(frame);
    await new Promise((resolve) => setTimeout(resolve, 100));
    frame.remove();
  });
  assert.equal(await page.evaluate(() => document.documentElement.dataset.navigationFetchStatus), "404");
  assert.equal(await page.evaluate(() => document.documentElement.dataset.loomrealmRendererIdentity), firstIdentity);
  assert.equal((await events(eventLog)).filter(({ type }) => type === "document-bootstrap").length, firstDocuments);

  const mapPixelAt = () => mapPixel(page, 352, 224);
  await page.bringToFront();
  await page.mouse.click(320, 240);
  await page.waitForFunction(() => document.hasFocus());
  assert.deepEqual((await mapPixelAt()).slice(0, 3), [220, 40, 40]);
  await page.keyboard.press("ArrowRight");
  await page.waitForFunction(() => {
    const canvases = [...(document.querySelector("lr-map-view")?.shadowRoot?.querySelectorAll("canvas.tile-layer") ?? [])].filter((canvas) => !canvas.hidden);
    for (const canvas of canvases) {
      const left = Number.parseFloat(canvas.style.left) || 0;
      const top = Number.parseFloat(canvas.style.top) || 0;
      const x = 352 - left;
      const y = 224 - top;
      if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) continue;
      return [...canvas.getContext("2d").getImageData(x, y, 1, 1).data].slice(0, 3).join(",") === "40,80,220";
    }
    return false;
  });
  const moved = await mapPixelAt();
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(100);
  assert.deepEqual(await mapPixelAt(), moved);
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "ArrowLeft" })));
  await page.waitForTimeout(100);
  assert.deepEqual(await mapPixelAt(), moved);

  await page.reload();
  await page.waitForFunction(() => document.documentElement.dataset.loomrealmRenderer === "installed", null, { timeout: 30_000 });
  await page.waitForSelector("lr-map-view lr-map-sprite");
  await setLogicalViewport(page, 640, 480);
  await waitFor(async () => (await events(eventLog)).filter(({ type }) => type === "document-bootstrap").length > firstDocuments, "fresh document bootstrap");
  const secondIdentity = await page.evaluate(() => document.documentElement.dataset.loomrealmRendererIdentity);
  assert.notEqual(secondIdentity, firstIdentity);
  assert.deepEqual(await mapPixelAt(), moved);

  await page.evaluate(() => {
    document.documentElement.dataset.fetchInterceptions = "0";
    document.documentElement.dataset.webSocketInterceptions = "0";
    globalThis.fetch = async () => {
      document.documentElement.dataset.fetchInterceptions = String(Number(document.documentElement.dataset.fetchInterceptions) + 1);
      throw new Error("qualification fetch replacement");
    };
    globalThis.WebSocket = class {
      constructor() {
        document.documentElement.dataset.webSocketInterceptions = String(Number(document.documentElement.dataset.webSocketInterceptions) + 1);
        throw new Error("qualification WebSocket replacement");
      }
    };
  });
  const beforeLoss = (await events(eventLog)).filter(({ type }) => type === "data-current");
  const current = beforeLoss.at(-1);
  const physical = (await events(eventLog)).findLast(({ type, candidateId }) => type === "data-physical" && candidateId === current.candidateId);
  await waitFor(() => /Debugger listening on (ws:\/\/127\.0\.0\.1:\d+\/[a-f0-9-]+)/u.test(hostra.output()), "LoomRealm inspector");
  const inspectorEndpoint = /Debugger listening on (ws:\/\/127\.0\.0\.1:\d+\/[a-f0-9-]+)/u.exec(hostra.output())[1];
  const inspector = await connectInspector(inspectorEndpoint);
  const result = await inspector.evaluate(`(() => { const socket = process._getActiveHandles().find((handle) => handle?.constructor?.name === "Socket" && handle.localPort === ${Number(physical.rendererPort)}); if (!socket) return false; socket.destroy(); return true; })()`);
  inspector.close();
  assert.equal(result.result.value, true);
  await waitFor(async () => (await events(eventLog)).some(({ type, candidateId }) => type === "data-retired" && candidateId === current.candidateId), "Data retirement");
  await waitFor(async () => (await events(eventLog)).some(({ type, candidateId, generation }) => type === "data-current" && candidateId !== current.candidateId && generation === current.generation), "same-generation Data replacement");
  assert.equal(await page.evaluate(() => document.documentElement.dataset.loomrealmRendererIdentity), secondIdentity);
  await page.waitForTimeout(500);
  await page.bringToFront();
  await page.mouse.click(320, 240);
  await page.waitForFunction(() => document.hasFocus());
  await page.keyboard.press("ArrowLeft");
  await page.waitForFunction(() => {
    const canvases = [...(document.querySelector("lr-map-view")?.shadowRoot?.querySelectorAll("canvas.tile-layer") ?? [])].filter((canvas) => !canvas.hidden);
    for (const canvas of canvases) {
      const left = Number.parseFloat(canvas.style.left) || 0;
      const top = Number.parseFloat(canvas.style.top) || 0;
      const x = 352 - left;
      const y = 224 - top;
      if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) continue;
      return [...canvas.getContext("2d").getImageData(x, y, 1, 1).data].slice(0, 3).join(",") === "220,40,40";
    }
    return false;
  });
  assert.deepEqual(await page.evaluate(() => ({
    fetch: document.documentElement.dataset.fetchInterceptions,
    webSocket: document.documentElement.dataset.webSocketInterceptions,
  })), { fetch: "0", webSocket: "0" });
  const contentPort = Number(new URL(page.url()).port);
  assert.equal(await portClosed(contentPort), false);
  await page.close();
  await new Promise((resolve, reject) => {
    if (hostra.child.exitCode !== null) { resolve(); return; }
    const timer = setTimeout(() => reject(new Error(`Hostra did not converge\n${hostra.output()}`)), 15_000);
    hostra.child.once("exit", () => { clearTimeout(timer); resolve(); });
  });
  const final = await events(eventLog);
  const requiredTerminal = process.platform === "win32"
    ? []
    : ["termination-began", "main-settled", "renderer-control-closed", "data-broker-closed", "content-closed", "product-closed"];
  for (const type of requiredTerminal) {
    assert.equal(final.some((event) => event.type === type), true, `${type}: ${JSON.stringify(final)}\n${hostra.output()}`);
  }
  assert.equal(await portClosed(contentPort), true);
  await waitFor(async () => {
    const remaining = await processRows();
    return runners.every(({ pid }) => !remaining.some((row) => row.pid === pid));
  }, "Runner process exit", 5_000);
});

test("M15 Runner fatal converges through Main and the one product funnel", { timeout: 90_000 }, async (t) => {
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
  await waitFor(() => context.pages().some((candidate) => /\/_lr\/window\//u.test(candidate.url())), "fatal-test Window");
  const page = context.pages().find((candidate) => /\/_lr\/window\//u.test(candidate.url()));
  await page.waitForFunction(() => document.documentElement.dataset.loomrealmRenderer === "installed", null, { timeout: 30_000 });
  await waitFor(async () => (await events(eventLog)).some(({ type }) => type === "data-current"), "fatal-test Data current");
  await waitFor(() => /Debugger listening on (ws:\/\/127\.0\.0\.1:\d+\/[a-f0-9-]+)/u.test(hostra.output()), "fatal-test inspector");
  const endpoint = /Debugger listening on (ws:\/\/127\.0\.0\.1:\d+\/[a-f0-9-]+)/u.exec(hostra.output())[1];
  const inspector = await connectInspector(endpoint);
  const killed = await inspector.evaluate(`(() => { const child = process._getActiveHandles().find((handle) => handle?.constructor?.name === "ChildProcess"); if (!child) return false; return child.kill("SIGKILL"); })()`);
  inspector.close();
  assert.equal(killed.result.value, true);
  await new Promise((resolve, reject) => {
    if (hostra.child.exitCode !== null) { resolve(); return; }
    const timer = setTimeout(async () => reject(new Error(`Runner fatal did not converge\n${hostra.output()}\n${JSON.stringify(await events(eventLog))}`)), 15_000);
    hostra.child.once("exit", () => { clearTimeout(timer); resolve(); });
  });
  const final = await events(eventLog);
  for (const type of ["termination-began", "renderer-control-closed", "data-broker-closed", "content-closed", "product-closed"]) {
    assert.equal(final.some((event) => event.type === type), true, `${type}: ${JSON.stringify(final)}\n${hostra.output()}`);
  }
});

test("M15 startup failure closes partial resources and lets Hostra converge", { timeout: 60_000 }, async (t) => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "loomrealm-hostra-startup-failure-"));
  const eventLog = path.join(temporary, "events.jsonl");
  await writeFile(eventLog, "");
  const hostra = launchHostra(eventLog, path.join(temporary, "hostra-user-data"), {
    LOOMREALM_DESKTOP_INSTALLATION_ROOT: path.join(temporary, "missing-installation"),
  });
  t.after(async () => {
    try {
      await terminateChild(hostra.child);
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  });
  const ready = await hostra.ready;
  const rpcPort = Number(new URL(ready.data.rpcEndpoint).port);
  await new Promise((resolve, reject) => {
    if (hostra.child.exitCode !== null) { resolve(); return; }
    const timer = setTimeout(() => reject(new Error(`Startup failure did not converge\n${hostra.output()}`)), 15_000);
    hostra.child.once("exit", () => { clearTimeout(timer); resolve(); });
  });
  const final = await events(eventLog);
  assert.equal(final.some(({ type }) => type === "startup-failed"), true);
  assert.equal(final.some(({ type }) => type === "product-closed"), true);
  assert.equal(final.some(({ stage }) => stage === "window-open"), false);
  assert.equal(await portClosed(rpcPort), true);
});

test("M15 movement latency harness records input-to-paint traces", { timeout: 90_000 }, async (t) => {
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
  await waitFor(() => context.pages().some((candidate) => /\/_lr\/window\//u.test(candidate.url())), "latency Window");
  const page = context.pages().find((candidate) => /\/_lr\/window\//u.test(candidate.url()));
  await page.waitForFunction(() => document.documentElement.dataset.loomrealmRenderer === "installed", null, { timeout: 30_000 });
  await page.waitForSelector("lr-map-view lr-map-sprite", { timeout: 20_000 });
  await setLogicalViewport(page, 640, 480);
  await page.evaluate(() => {
    const records = [];
    globalThis.__loomrealmMovementRecords = records;
    globalThis.__loomrealmMovementQualification = (record) => { records.push(record); };
  });
  await page.bringToFront();
  await page.mouse.click(320, 240);
  await page.waitForFunction(() => document.hasFocus());
  const viewport = page.locator("lr-map-view");
  const beforePixels = await viewport.screenshot();
  await page.keyboard.press("ArrowRight");
  try {
    await page.waitForFunction(() => {
      const records = globalThis.__loomrealmMovementRecords ?? [];
      return records.some((record) => record.name === "input-captured")
        && records.some((record) => record.name === "browser-first-motion-paint");
    }, null, { timeout: 30_000 });
  } catch (cause) {
    const state = await page.evaluate(() => ({
      records: globalThis.__loomrealmMovementRecords ?? [],
      focused: document.hasFocus(),
      visibilityState: document.visibilityState,
      mapId: document.querySelector("lr-map-view")?._latestData?.mapId ?? null,
      x: document.querySelector("lr-map-sprite")?._latestData?.x ?? null,
    }));
    throw new Error(`${cause.message}\n${JSON.stringify(state)}`);
  }
  const records = await page.evaluate(() => globalThis.__loomrealmMovementRecords);
  const input = records.find((record) => record.name === "input-captured");
  const paint = records.find((record) => record.name === "browser-first-motion-paint");
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve())));
  const afterPixels = await viewport.screenshot();
  assert.equal(input.detail.code, "ArrowRight");
  assert.equal(typeof input.at, "number");
  assert.equal(typeof paint.detail.visualX, "number");
  assert.equal(typeof paint.detail.visualY, "number");
  assert.ok(paint.at >= input.at, JSON.stringify({ input, paint, records }));
  assert.equal(beforePixels.equals(afterPixels), false, "logical first paint must produce a screenshot pixel difference within one display frame");
});

test("M15 Hostra 640/720/1080 ordinary and refresh first-paint P95", { timeout: 3_600_000 }, async (t) => {
  const installation = await prepareMovementInstallation({ cyclicMap: true });
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
  await waitFor(() => context.pages().some((candidate) => /\/_lr\/window\//u.test(candidate.url())), "128x8 Window");
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
      const view = document.querySelector("lr-map-view");
      const data = view?._latestData;
      globalThis.__loomrealmMovementRecords.length = 0;
      globalThis.__loomrealmPreviousVisualEpoch = data?.visualEpoch ?? null;
      globalThis.__loomrealmPreviousDraws = view?._tileDrawCount ?? 0;
      globalThis.__loomrealmPreviousCameraOnly = view?._cameraOnlyCommits ?? 0;
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
      const view = document.querySelector("lr-map-view");
      const data = view?._latestData;
      const draws = view?._tileDrawCount ?? 0;
      const cameraOnly = view?._cameraOnlyCommits ?? 0;
      return {
        records: globalThis.__loomrealmMovementRecords.slice(),
        x: document.querySelector("lr-map-sprite")?._latestData?.x ?? null,
        mapId: data?.mapId ?? null,
        viewportWidth: data?.viewportWidth ?? null,
        viewportHeight: data?.viewportHeight ?? null,
        refresh: data?.visualEpoch !== globalThis.__loomrealmPreviousVisualEpoch,
        cameraOnlyDelta: cameraOnly - (globalThis.__loomrealmPreviousCameraOnly ?? 0),
        tileDrawsDelta: draws - (globalThis.__loomrealmPreviousDraws ?? 0),
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
      cameraOnlyDelta: after.cameraOnlyDelta,
      tileDrawsDelta: after.tileDrawsDelta,
      viewportWidth: after.viewportWidth,
      viewportHeight: after.viewportHeight,
    };
  };

  const sizes = [
    { width: 640, height: 480, refreshMs: 50 },
    { width: 1280, height: 720, refreshMs: 75 },
    { width: 1920, height: 1080, refreshMs: 100 },
  ];
  const table = [];
  for (const size of sizes) {
    await setLogicalViewport(page, size.width, size.height);
    await page.mouse.click(Math.min(320, size.width - 8), Math.min(240, size.height - 8));
    await page.waitForFunction(() => document.hasFocus());
    const rounds = [];
    for (let round = 1; round <= 3; round += 1) {
      const ordinary = [];
      const refresh = [];
      const ordinaryCameraOnly = [];
      const ordinaryTileDraws = [];
      let attempts = 0;
      let invalid = 0;
      let warmupLeft = 20;
      while (ordinary.length < 100 || refresh.length < 30) {
        attempts += 1;
        if (attempts > 1500) break;
        if (attempts % 25 === 0) {
          await page.mouse.click(Math.min(320, size.width - 8), Math.min(240, size.height - 8));
          await page.waitForFunction(() => document.hasFocus()).catch(() => undefined);
          const progress = { size, round, attempts, invalid, ordinary: ordinary.length, refresh: refresh.length };
          t.diagnostic(JSON.stringify(progress));
          process.stdout.write(`M15_P95_PROGRESS ${JSON.stringify(progress)}\n`);
        }
        const sample = await sampleMove();
        if (sample === null) {
          invalid += 1;
          continue;
        }
        if (sample.viewportWidth !== size.width || sample.viewportHeight !== size.height) {
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
        if (ordinary.length < 100) {
          ordinary.push(sample.latency);
          ordinaryCameraOnly.push(sample.cameraOnlyDelta);
          ordinaryTileDraws.push(sample.tileDrawsDelta);
        }
      }
      assert.ok(invalid / attempts <= 0.05, JSON.stringify({ size, round, attempts, invalid, ordinary: ordinary.length, refresh: refresh.length }));
      assert.equal(ordinary.length, 100, JSON.stringify({ size, round, attempts, invalid, ordinary: ordinary.length, refresh: refresh.length }));
      assert.equal(refresh.length, 30, JSON.stringify({ size, round, attempts, invalid, ordinary: ordinary.length, refresh: refresh.length }));
      rounds.push({ round, attempts, invalid, ordinary, refresh, ordinaryCameraOnly, ordinaryTileDraws });
    }
    const ordinary = rounds.flatMap((round) => round.ordinary);
    const refresh = rounds.flatMap((round) => round.refresh);
    const ordinaryCameraOnly = rounds.flatMap((round) => round.ordinaryCameraOnly);
    const ordinaryTileDraws = rounds.flatMap((round) => round.ordinaryTileDraws);
    const cameraOnlyHits = ordinaryCameraOnly.filter((delta) => delta >= 1).length;
    const zeroTileDrawHits = ordinaryTileDraws.filter((delta) => delta === 0).length;
    const row = {
      viewport: `${size.width}x${size.height}`,
      refreshGateMs: size.refreshMs,
      ordinary: { p50: nearestRank(ordinary, 0.5), p95: nearestRank(ordinary, 0.95), max: Math.max(...ordinary), n: ordinary.length },
      refresh: { p50: nearestRank(refresh, 0.5), p95: nearestRank(refresh, 0.95), max: Math.max(...refresh), n: refresh.length },
      cameraOnly: { hits: cameraOnlyHits, n: ordinaryCameraOnly.length, zeroTileDrawHits },
      rounds,
    };
    table.push(row);
    assert.ok(row.ordinary.p95 <= 50, JSON.stringify(row.ordinary));
    assert.ok(row.refresh.p95 <= size.refreshMs, JSON.stringify(row.refresh));
    assert.ok(cameraOnlyHits / ordinaryCameraOnly.length >= 0.95, JSON.stringify(row.cameraOnly));
    assert.ok(zeroTileDrawHits / ordinaryTileDraws.length >= 0.95, JSON.stringify(row.cameraOnly));
  }
  const report = {
    subject: process.env.GITHUB_SHA ?? "local-worktree",
    clock: "same Browser Window performance.now(); input-captured.at to browser-first-motion-paint.at",
    platform: { node: process.version, os: `${process.platform} ${os.release()}`, cpu: os.cpus()[0]?.model ?? "unknown" },
    table,
  };
  await fs.mkdir(path.join(repository, "artifacts"), { recursive: true });
  await writeFile(path.join(repository, "artifacts", "map-viewport-pr3-hostra.json"), `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`M15_MOVEMENT_QUALIFICATION ${JSON.stringify(report)}\n`);
});
