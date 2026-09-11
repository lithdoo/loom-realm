import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

const execute = promisify(execFile);
const root = new URL("../", import.meta.url);
const repository = path.resolve(root.pathname.slice(process.platform === "win32" ? 1 : 0));
const hostraRoot = process.env.HOSTRA_SOURCE_DIR
  ? path.resolve(process.env.HOSTRA_SOURCE_DIR)
  : path.resolve(repository, "..", "hostra");
const read = (relative) => readFile(new URL(relative, root), "utf8");
const json = async (relative) => JSON.parse(await read(relative));

async function sources(directory) {
  const result = [];
  async function walk(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const target = path.join(current, entry.name);
      if (entry.isDirectory() && entry.name !== "node_modules" && entry.name !== "dist") await walk(target);
      else if (/\.(?:ts|js|mjs)$/u.test(entry.name)) result.push({ file: target, source: await readFile(target, "utf8") });
    }
  }
  await walk(path.resolve(repository, directory));
  return result;
}

test("frozen Hostra qualification baseline is exact", async () => {
  const manifest = JSON.parse(await readFile(path.join(hostraRoot, "packages", "hostra", "package.json"), "utf8"));
  assert.equal(manifest.name, "hostra");
  assert.equal(manifest.version, "1.0.1-beta.1");
  assert.equal(manifest.hostra.electronVersion, "44.1.1");
  const { stdout } = await execute("git", ["rev-parse", "HEAD"], { cwd: hostraRoot });
  assert.equal(stdout.trim(), "d863beab3c59c3bd4f271514a228fa8fee0bf5b6");
});

test("canonical Desktop is a plain Node Hostra child with no Electron ownership", async () => {
  const desktop = await json("apps/desktop/package.json");
  assert.equal(desktop.dependencies?.electron, undefined);
  assert.equal(desktop.devDependencies?.electron, undefined);
  assert.equal(desktop.scripts?.start, undefined);
  const production = await sources("apps/desktop/src");
  const joined = production.map(({ source }) => source).join("\n");
  assert.doesNotMatch(joined, /(?:from|import\s*\()\s*["']electron["']|BrowserWindow|MessageChannelMain|MessagePortMain|ipcMain|ipcRenderer|app\.quit/u);
  assert.doesNotMatch(joined, /ELECTRON_RUN_AS_NODE|UtilityProcess|executable\s*:/u);
  assert.match(await read("apps/desktop/src/main-entry.ts"), /SIGTERM/);
  assert.match(await read("apps/desktop/src/main-entry.ts"), /SIGINT/);
});

test("Hostra RPC remains Desktop-private host control", async () => {
  const rpc = await read("apps/desktop/src/hostra-rpc.ts");
  for (const operation of ["openWindow", "closeWindow", "getHostState", "getAllWindows", "hostra.event"]) assert.match(rpc, new RegExp(operation));
  assert.doesNotMatch(rpc, /rendererControlToken|candidateId|dataProfile|frame-call|render-update/u);
  const outsideDesktop = [...await sources("packages"), ...await sources("game-libs")].filter(({ file }) => /[\\/]src[\\/]/u.test(file));
  assert.equal(outsideDesktop.some(({ source }) => /HostraRpc|HOSTRA_RPC_PORT|HOSTRA_RPC_TOKEN/u.test(source)), false);
});

test("Control, settlement and document bootstrap stay inside the frozen abstraction budget", async () => {
  const production = await sources("apps/desktop/src");
  const joined = production.map(({ source }) => source).join("\n");
  assert.doesNotMatch(joined, /IHostraClient|HostraManager|HostraSession|WindowRegistry|WindowLifecycleManager|DocumentManager|BootstrapCoordinator|ConnectionManager|TransportRegistry|RecoveryManager|BrowserPrimitiveRegistry/u);
  const control = await read("apps/desktop/src/loopback-renderer-control.ts");
  assert.match(control, /pendingAcquire/); assert.match(control, /pendingDocument/); assert.match(control, /currentDocument/);
  assert.match(control, /127\.0\.0\.1/); assert.match(control, /claimed/);
  const settlement = await read("apps/desktop/src/loopback-data-settlement.ts");
  const sentTypes = [...settlement.matchAll(/type:\s*"([^"]+)"/gu)].map((match) => match[1]);
  assert.deepEqual([...new Set(sentTypes)].sort(), ["close", "commit", "prepare", "revoke"]);
  assert.doesNotMatch(settlement, /rendererControlToken|application payload/u);
  const content = await read("apps/desktop/src/content-service.ts");
  assert.match(content, /sec-fetch-mode/); assert.match(content, /sec-fetch-dest/);
  assert.doesNotMatch(content, /Access-Control-Allow|\bOPTIONS\b/u);
});

test("M15 canonical gate runs M14 first and then frozen Hostra", async () => {
  const monorepo = await json("package.json");
  assert.match(monorepo.scripts["test:m15"], /^npm run test:m14 && /u);
  assert.match(monorepo.scripts["test:m15"], /test:m15:hostra/u);
  assert.equal(monorepo.scripts["test:m15:electron"], undefined);
  const workflow = await read(".github/workflows/m15.yml");
  assert.match(workflow, /lithdoo\/hostra/u);
  assert.match(workflow, /d863beab3c59c3bd4f271514a228fa8fee0bf5b6/u);
  assert.match(workflow, /npm run test:m15/u);
});
