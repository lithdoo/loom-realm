import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (relative) => readFile(new URL(relative, root), "utf8");
const json = async (relative) => JSON.parse(await read(relative));

async function productionSources(relative) {
  const files = [];
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(target);
      else if (/\.(?:ts|js|mjs)$/u.test(entry.name)) files.push(target);
    }
  }
  await walk(path.resolve(new URL(relative, root).pathname.slice(process.platform === "win32" ? 1 : 0)));
  return Promise.all(files.map(async (file) => ({ file, source: await readFile(file, "utf8") })));
}

test("canonical M14 installation is checked-in and Hostra-ready without executable policy", async () => {
  assert.deepEqual(await json("examples/essentials-v21.1/launch.hostra.json"), {
    formatVersion: 1,
    subsystems: [{ key: "map", module: "subsystems/map.mjs" }],
  });
  assert.equal((await read("examples/essentials-v21.1/subsystems/map.mjs")).trim(), 'export { default } from "@loomrealm-game/map";');
  for (const relative of [
    "[struct]Map/1.json", "[struct]Tileset/1.json",
    "[resource]Graphics/Characters/m14_player.png", "[resource]Graphics/Tilesets/m14_tileset.png",
    "[resource]Presentation/map/map.browser.js.js", "[resource]Presentation/map/map.css.css",
    "[resource]Presentation/essentials/page.css.css",
  ]) await access(new URL(`examples/essentials-v21.1/[FSDB]essentials-v21.1/${relative}`, root));
  const launch = await read("examples/essentials-v21.1/launch.hostra.json");
  assert.doesNotMatch(launch, /ELECTRON_RUN_AS_NODE|execPath|executable|node(?:\.exe)?/iu);
});

test("M15 exposes only the bounded trusted presentation seam and pinned Electron build", async () => {
  const renderer = await json("packages/renderer/package.json");
  assert.deepEqual(renderer.exports["./web-presentation"], { types: "./dist/web-presentation.d.ts", import: "./dist/web-presentation.js" });
  const desktop = await json("apps/desktop/package.json");
  assert.equal(desktop.devDependencies.electron, "44.3.0");
  assert.equal(desktop.dependencies["@loomrealm/main"], "0.1.0-alpha.0");
  assert.equal(desktop.dependencies["@loomrealm/renderer"], "0.1.0-alpha.0");
  assert.equal(desktop.dependencies["@loomrealm/renderer-control"], "0.1.0-alpha.0");
});

test("Desktop product freezes the Electron world, origin and one-shot bootstrap boundaries", async () => {
  const product = await read("apps/desktop/src/product-composition.ts");
  for (const preference of ["nodeIntegration: false", "contextIsolation: true", "sandbox: true", "webSecurity: true"]) assert.match(product, new RegExp(preference));
  assert.match(product, /did-finish-load/);
  assert.match(product, /webContents\.postMessage\(DESKTOP_BOOTSTRAP_CHANNEL/);
  assert.match(product, /window\.loadURL\(content\.shell\.href\)/);
  assert.doesNotMatch(product, /file:\/\//);
  const preload = await read("apps/desktop/src/preload.ts");
  assert.match(preload, /ipcRenderer\.once\(DESKTOP_BOOTSTRAP_CHANNEL/);
  assert.doesNotMatch(preload, /contextBridge|exposeInMainWorld|ipcRenderer\.(?:send|invoke|on)\(/);
  const content = await read("apps/desktop/src/content-service.ts");
  assert.doesNotMatch(content, /Access-Control-Allow|\bOPTIONS\b/);
});

test("Window settlement IPC is not a second Data application plane", async () => {
  const settlement = await read("apps/desktop/src/window-data-binding.ts");
  assert.match(settlement, /connectBrowserDataCarrier\(value\.endpoint/);
  const sentTypes = [...settlement.matchAll(/postMessage\(\{ type: "([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual([...new Set(sentTypes)].sort(), ["close", "commit", "prepare", "prepared", "revoke"]);
  assert.doesNotMatch(settlement, /rendererControlToken/);
});

test("M15 production sources stay inside the frozen abstraction budget", async () => {
  const sources = await productionSources("apps/desktop/src/");
  const joined = sources.map(({ source }) => source).join("\n");
  assert.doesNotMatch(joined, /packages[\\/]renderer[\\/]dist[\\/]internal|@loomrealm\/renderer\/internal/);
  assert.doesNotMatch(joined, /DesktopRuntimeHost|MiniDesktopHost|WindowRegistry|ConnectionRegistry|GameManager|ServiceLocator|UniversalRendererHost|PresentationHost|PresentationRuntime|InputDeviceManager|BrowserPrimitiveRegistry|LocalWebServer|RecoveryManager|UtilityProcess/);
  assert.doesNotMatch(joined, /contextBridge|file:\/\//);
  assert.doesNotMatch(joined, /from\s+["']@loomrealm\/(?:store|subsystem\/internal|main\/internal)["']/);
});

test("Hostra alone synthesizes Electron Node mode while retaining canonical execPath", async () => {
  const hosting = await read("packages/game-launcher-hostra/src/runtime-hosting.ts");
  const resolver = await read("packages/game-launcher-hostra/src/module-resolver.ts");
  assert.match(hosting, /process\.versions\.electron/);
  assert.match(hosting, /ELECTRON_RUN_AS_NODE/);
  assert.match(resolver, /realpath\(process\.execPath\)/);
  assert.match(hosting, /spawn\(plan\.canonicalNodeExecutable/);
  const product = await read("apps/desktop/src/product-composition.ts");
  assert.doesNotMatch(product, /ELECTRON_RUN_AS_NODE|UtilityProcess|executable\s*:/);
});

test("the M15 gate preserves M14 first and has a dedicated workflow", async () => {
  const monorepo = await json("package.json");
  assert.match(monorepo.scripts["test:m15"], /^npm run test:m14 && /);
  assert.match(monorepo.scripts["test:m15:electron"], /m15-electron-input\.test\.mjs/);
  assert.match(monorepo.scripts["test:m15:electron"], /m15-electron-product\.test\.mjs/);
  assert.match(monorepo.scripts["test:m15:essentials-local"], /m15-essentials-electron-local\.mjs/);
  const workflow = await read(".github/workflows/m15.yml");
  assert.match(workflow, /node: \[24\]/);
  assert.match(workflow, /npm run test:m15/);
});
