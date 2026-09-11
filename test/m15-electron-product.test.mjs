import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { _electron as electron } from "playwright";

const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "apps", "desktop");
const electronRoot = path.dirname(fileURLToPath(import.meta.resolve("electron")));
const execute = promisify(execFile);

async function events(log) {
  const source = await readFile(log, "utf8").catch(() => "");
  return source.trim() === "" ? [] : source.trim().split("\n").map((line) => JSON.parse(line));
}

async function waitFor(check, label, timeout = 15_000) {
  const deadline = Date.now() + timeout;
  while (!(await check())) {
    if (Date.now() >= deadline) throw new Error(`Timed out waiting for ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

async function processRows() {
  if (process.platform === "win32") {
    const { stdout } = await execute("powershell.exe", ["-NoProfile", "-Command", "Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,CommandLine | ConvertTo-Json -Compress"]);
    const parsed = JSON.parse(stdout);
    return (Array.isArray(parsed) ? parsed : [parsed]).map((row) => ({ pid: row.ProcessId, ppid: row.ParentProcessId, command: row.CommandLine ?? "" }));
  }
  const { stdout } = await execute("ps", ["-axo", "pid=,ppid=,command="]);
  return stdout.trim().split("\n").map((line) => {
    const match = /^\s*(\d+)\s+(\d+)\s+(.*)$/u.exec(line);
    return match ? { pid: Number(match[1]), ppid: Number(match[2]), command: match[3] } : null;
  }).filter(Boolean);
}

async function descendants(rootPid) {
  const rows = await processRows();
  const result = [];
  const parents = [rootPid];
  while (parents.length) {
    const parent = parents.shift();
    for (const row of rows) if (row.ppid === parent && !result.some((item) => item.pid === row.pid)) { result.push(row); parents.push(row.pid); }
  }
  return result;
}

function portClosed(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port });
    const finish = (closed) => { socket.destroy(); resolve(closed); };
    socket.once("connect", () => finish(false));
    socket.once("error", () => finish(true));
    socket.setTimeout(1_000, () => finish(true));
  });
}

test("M15 real Electron product reaches map input, reload, reconnect and shutdown", { timeout: 60_000 }, async (t) => {
  const environment = { ...process.env };
  delete environment.ELECTRON_RUN_AS_NODE;
  const temporary = await mkdtemp(path.join(os.tmpdir(), "loomrealm-m15-"));
  const eventLog = path.join(temporary, "events.jsonl");
  await writeFile(eventLog, "");
  environment.LOOMREALM_M15_EVENT_LOG = eventLog;
  const application = await electron.launch({
    executablePath: path.join(electronRoot, "dist", process.platform === "win32" ? "electron.exe" : "electron"),
    args: [path.resolve(desktopRoot, "..", "..", "test", "helpers", "m15-product-main.mjs")],
    env: environment,
  });
  t.after(async () => { await application.close().catch(() => {}); await rm(temporary, { recursive: true, force: true }); });
  const page = await Promise.race([
    application.firstWindow(),
    new Promise((_, reject) => application.process().once("exit", (code) => reject(new Error(`Electron exited before first Window (${code})`)))),
  ]);
  await page.waitForFunction(() => document.documentElement.dataset.loomrealmRenderer === "installed", null, { timeout: 20_000 });
  await page.waitForSelector("lr-map-view lr-map-sprite", { timeout: 20_000 });

  const boundary = await application.evaluate(({ BrowserWindow }) => {
    const [window] = BrowserWindow.getAllWindows();
    return window.webContents.getLastWebPreferences();
  });
  assert.equal(boundary.nodeIntegration, false);
  assert.equal(boundary.contextIsolation, true);
  assert.equal(boundary.sandbox, true);
  assert.equal(boundary.webSecurity, true);
  assert.match(page.url(), /^http:\/\/127\.0\.0\.1:\d+\/_loomrealm\/desktop\/$/);
  assert.deepEqual(await page.evaluate(() => ({ process: typeof globalThis.process, require: typeof globalThis.require, electron: "electron" in globalThis })), {
    process: "undefined", require: "undefined", electron: false,
  });
  await waitFor(async () => (await events(eventLog)).some(({ type }) => type === "data-current"), "initial Data candidate");
  const firstDocument = (await events(eventLog)).find(({ type }) => type === "document-bootstrap");
  assert.equal(typeof firstDocument?.rendererIdentity, "string");

  const mapPixel = () => page.locator("lr-map-view").evaluate((element) => {
    const canvas = element.shadowRoot.querySelector("canvas");
    return [...canvas.getContext("2d").getImageData(352, 240, 1, 1).data];
  });
  await page.bringToFront();
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.focus());
  await page.waitForFunction(() => document.hasFocus());
  await page.mouse.click(700, 550);
  await page.waitForFunction(() => {
    const canvas = document.querySelector("lr-map-view")?.shadowRoot?.querySelector("canvas");
    return canvas && canvas.getContext("2d").getImageData(352, 240, 1, 1).data[3] === 255;
  });
  assert.deepEqual((await mapPixel()).slice(0, 3), [220, 40, 40]);
  await page.keyboard.press("ArrowRight");
  await page.waitForFunction(() => {
    const canvas = document.querySelector("lr-map-view").shadowRoot.querySelector("canvas");
    return [...canvas.getContext("2d").getImageData(352, 240, 1, 1).data].slice(0, 3).join(",") === "40,80,220";
  }, null, { timeout: 3_000 });
  const moved = await mapPixel();
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(100);
  assert.deepEqual(await mapPixel(), moved);
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "ArrowLeft" })));
  await page.waitForTimeout(100);
  assert.deepEqual(await mapPixel(), moved);

  await page.reload();
  await page.waitForFunction(() => document.documentElement.dataset.loomrealmRenderer === "installed", null, { timeout: 20_000 });
  await page.waitForSelector("lr-map-view lr-map-sprite");
  assert.deepEqual(await mapPixel(), moved);
  await waitFor(async () => (await events(eventLog)).filter(({ type }) => type === "document-bootstrap").length >= 2, "fresh document bootstrap");
  const documents = (await events(eventLog)).filter(({ type }) => type === "document-bootstrap");
  assert.notEqual(documents[0].rendererIdentity, documents[1].rendererIdentity);

  await page.evaluate(() => {
    document.documentElement.dataset.fetchInterceptions = "0";
    document.documentElement.dataset.webSocketInterceptions = "0";
    globalThis.fetch = async () => {
      document.documentElement.dataset.fetchInterceptions = String(Number(document.documentElement.dataset.fetchInterceptions) + 1);
      throw new Error("business fetch replacement");
    };
    globalThis.WebSocket = class {
      constructor() {
        document.documentElement.dataset.webSocketInterceptions = String(Number(document.documentElement.dataset.webSocketInterceptions) + 1);
        throw new Error("business WebSocket replacement");
      }
    };
  });

  const currentBeforeLoss = (await events(eventLog)).filter(({ type }) => type === "data-current");
  const latestCurrent = currentBeforeLoss.at(-1);
  const currentIds = new Set([latestCurrent.candidateId]);
  const generation = latestCurrent.generation;
  await application.evaluate(() => globalThis.__m15DropCurrentData());
  await waitFor(async () => (await events(eventLog)).some(({ type, candidateId }) => type === "data-retired" && currentIds.has(candidateId)), "current Data retirement");
  try {
    await waitFor(async () => (await events(eventLog)).some(({ type, candidateId, generation: next }) => type === "data-current" && !currentIds.has(candidateId) && next === generation), "same-generation Data replacement");
  } catch (cause) {
    throw new Error(`${cause.message}: ${JSON.stringify(await events(eventLog))}`);
  }
  await new Promise((resolve) => setTimeout(resolve, 500));
  await page.mouse.click(700, 550);
  await page.waitForFunction(() => document.hasFocus());
  await page.keyboard.press("ArrowLeft");
  try {
    await page.waitForFunction(() => {
      const canvas = document.querySelector("lr-map-view").shadowRoot.querySelector("canvas");
      return [...canvas.getContext("2d").getImageData(352, 240, 1, 1).data].slice(0, 3).join(",") === "220,40,40";
    }, null, { timeout: 5_000 });
  } catch (cause) {
    throw new Error(`${cause.message}: ${JSON.stringify(await events(eventLog))}`);
  }
  assert.deepEqual(await page.evaluate(() => ({
    fetch: document.documentElement.dataset.fetchInterceptions,
    webSocket: document.documentElement.dataset.webSocketInterceptions,
  })), { fetch: "0", webSocket: "0" });

  const contentPort = Number(new URL(page.url()).port);
  const childRows = await descendants(application.process().pid);
  const runners = childRows.filter(({ command }) => /game-launcher-hostra[\\/]dist[\\/]runner[\\/]entry\.js/u.test(command));
  assert.equal(runners.length, 1, `Expected one Hostra Runner, saw: ${JSON.stringify(childRows)}`);
  const exited = new Promise((resolve) => application.process().once("exit", resolve));
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.close());
  await exited;
  const finalEvents = await events(eventLog);
  for (const type of ["main-settled", "renderer-control-closed", "data-broker-closed", "content-closed", "product-closed"]) assert.equal(finalEvents.some((event) => event.type === type), true, type);
  await waitFor(async () => {
    const rows = await processRows();
    return runners.every((runner) => !rows.some(({ pid }) => pid === runner.pid));
  }, "Runner child exit", 5_000);
  assert.equal(await portClosed(contentPort), true);
});
