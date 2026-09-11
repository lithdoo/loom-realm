import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import WebSocket from "ws";

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workspace = path.resolve(repository, "..");
const defaultHostra = path.join(workspace, "hostra");
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

test("M15 frozen Hostra owns the Window and reaches the M14 map", { timeout: 90_000 }, async (t) => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "loomrealm-hostra-m15-"));
  const eventLog = path.join(temporary, "events.jsonl");
  await writeFile(eventLog, "");
  const hostra = launchHostra(eventLog, path.join(temporary, "hostra-user-data"));
  let browser = null;
  t.after(async () => {
    await browser?.close().catch(() => {});
    if (hostra.child.exitCode === null) hostra.child.kill("SIGTERM");
    await new Promise((resolve) => hostra.child.exitCode === null ? hostra.child.once("exit", resolve) : resolve());
    await rm(temporary, { recursive: true, force: true });
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
  await page.waitForSelector("lr-map-view lr-map-sprite", { timeout: 20_000 });
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

  const mapPixel = () => page.locator("lr-map-view").evaluate((element) => {
    const canvas = element.shadowRoot.querySelector("canvas");
    return [...canvas.getContext("2d").getImageData(352, 240, 1, 1).data];
  });
  await page.bringToFront();
  await page.mouse.click(700, 550);
  await page.waitForFunction(() => document.hasFocus());
  assert.deepEqual((await mapPixel()).slice(0, 3), [220, 40, 40]);
  await page.keyboard.press("ArrowRight");
  await page.waitForFunction(() => {
    const canvas = document.querySelector("lr-map-view")?.shadowRoot?.querySelector("canvas");
    return canvas && [...canvas.getContext("2d").getImageData(352, 240, 1, 1).data].slice(0, 3).join(",") === "40,80,220";
  });
  const moved = await mapPixel();
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(100);
  assert.deepEqual(await mapPixel(), moved);
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "ArrowLeft" })));
  await page.waitForTimeout(100);
  assert.deepEqual(await mapPixel(), moved);

  await page.reload();
  await page.waitForFunction(() => document.documentElement.dataset.loomrealmRenderer === "installed", null, { timeout: 30_000 });
  await page.waitForSelector("lr-map-view lr-map-sprite");
  await waitFor(async () => (await events(eventLog)).filter(({ type }) => type === "document-bootstrap").length > firstDocuments, "fresh document bootstrap");
  const secondIdentity = await page.evaluate(() => document.documentElement.dataset.loomrealmRendererIdentity);
  assert.notEqual(secondIdentity, firstIdentity);
  assert.deepEqual(await mapPixel(), moved);

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
  await page.mouse.click(700, 550);
  await page.waitForFunction(() => document.hasFocus());
  await page.keyboard.press("ArrowLeft");
  await page.waitForFunction(() => {
    const canvas = document.querySelector("lr-map-view")?.shadowRoot?.querySelector("canvas");
    return canvas && [...canvas.getContext("2d").getImageData(352, 240, 1, 1).data].slice(0, 3).join(",") === "220,40,40";
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
  const temporary = await mkdtemp(path.join(os.tmpdir(), "loomrealm-hostra-fatal-"));
  const eventLog = path.join(temporary, "events.jsonl");
  await writeFile(eventLog, "");
  const hostra = launchHostra(eventLog, path.join(temporary, "hostra-user-data"));
  let browser = null;
  t.after(async () => {
    await browser?.close().catch(() => {});
    if (hostra.child.exitCode === null) hostra.child.kill("SIGTERM");
    await new Promise((resolve) => hostra.child.exitCode === null ? hostra.child.once("exit", resolve) : resolve());
    await rm(temporary, { recursive: true, force: true });
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
    if (hostra.child.exitCode === null) hostra.child.kill("SIGTERM");
    await new Promise((resolve) => hostra.child.exitCode === null ? hostra.child.once("exit", resolve) : resolve());
    await rm(temporary, { recursive: true, force: true });
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
