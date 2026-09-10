import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, stat } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import mapDefinition from "@loomrealm-game/map";
import { run as runImporter } from "../tools/fixtures/essentials-v21.1/import.mjs";
import { buildSourceManifest } from "../tools/fixtures/essentials-v21.1/lib/source/manifest.mjs";
import { prepareExamplePresentation } from "../examples/essentials-v21.1/test/prepare.mjs";

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workRoot = path.join(repository, ".local", "m14-essentials");
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const version = (bytes) => `sha256:${digest(bytes)}`;

function argumentsOf(argv) {
  if (argv.length === 5 && argv.every((value) => !value.startsWith("--"))) {
    argv = ["--source", argv[0], "--map-id", argv[1], "--x", argv[2], "--y", argv[3], "--character-name", argv[4]];
  }
  const result = {};
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index]; const value = argv[index + 1];
    if (!["--source", "--map-id", "--x", "--y", "--character-name"].includes(name) || value === undefined) throw new Error(`Invalid M14 local argument ${name ?? ""}`);
    result[name.slice(2)] = value;
  }
  for (const required of ["source", "map-id", "x", "y", "character-name"]) if (!(required in result)) throw new Error(`Missing --${required}`);
  for (const name of ["map-id", "x", "y"]) { const value = Number(result[name]); if (!Number.isSafeInteger(value) || value < (name === "map-id" ? 1 : 0)) throw new Error(`Invalid --${name}`); result[name] = value; }
  return result;
}

async function sourceFingerprint(source) {
  const info = await stat(source);
  if (info.isFile()) return digest(await readFile(source));
  const manifest = await buildSourceManifest(source);
  const lines = manifest.objects.filter((item) => item.kind === "file").map((item) => `${item.relativePath}\0${item.sha256}`).sort();
  return digest(Buffer.from(lines.join("\n")));
}

async function resourceFile(fsdbRoot, namespace, key) {
  const parts = key.split("/"); const leaf = parts.pop(); const directory = path.join(fsdbRoot, `[resource]${namespace}`, ...parts);
  const names = await readdir(directory);
  const match = names.find((name) => path.parse(name).name === leaf);
  if (!match) throw new Error(`Missing local resource ${namespace}/${key}`);
  return path.join(directory, match);
}

function executablePath() {
  return [process.env.LOOMREALM_CHROMIUM_PATH, "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe", "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"].filter(Boolean).find(existsSync);
}

async function browserQualification(renderState, resources) {
  let presentation;
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    if (url.pathname === "/") { response.setHeader("content-type", "text/html"); response.end("<!doctype html><html><body></body></html>"); return; }
    if (url.pathname.startsWith("/packages/renderer/dist/internal/") && url.pathname.endsWith(".js")) {
      try { response.setHeader("content-type", "text/javascript"); response.end(await readFile(path.join(repository, "packages", "renderer", "dist", "internal", path.basename(url.pathname)))); } catch { response.statusCode = 404; response.end(); } return;
    }
    for (const artifact of presentation?.artifacts.values() ?? []) if (url.pathname === artifact.browserPath) { response.setHeader("content-type", artifact.mime); response.end(artifact.bytes); return; }
    const prefix = "/_lr/v1/games/m14-local/resources/";
    if (url.pathname.startsWith(prefix)) {
      const item = resources.get(decodeURIComponent(url.pathname.slice(prefix.length)));
      if (!item) { response.statusCode = 404; response.end(); return; }
      response.setHeader("content-type", item.mime); response.setHeader("x-loom-content-version", item.contentVersion); response.setHeader("etag", `"${item.contentVersion}"`); response.end(item.bytes); return;
    }
    response.statusCode = 404; response.end();
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`; presentation = await prepareExamplePresentation(origin);
  const browser = await chromium.launch({ headless: true, ...(executablePath() ? { executablePath: executablePath() } : {}) });
  try {
    const page = await browser.newPage({ viewport: { width: 800, height: 600 }, deviceScaleFactor: 1 }); await page.goto(origin);
    const result = await page.evaluate(async ({ origin, prepared, renderState }) => {
      const { bootstrapWebPresentation } = await import(`${origin}/packages/renderer/dist/internal/web-presentation-bootstrap.js`);
      const { createRendererResourceClient } = await import(`${origin}/packages/renderer/dist/internal/resource-client.js`);
      const { WebProjector } = await import(`${origin}/packages/renderer/dist/internal/web-projector.js`);
      await bootstrapWebPresentation(window, prepared, () => {
        const client = createRendererResourceClient({ origin, installationId: "m14-local", token: "local" }, new AbortController().signal);
        const projector = new WebProjector({ document, resourceClient: client });
        projector.reevaluate({ read: () => ({ sessionId: "local", subsystems: [{ subsystemKey: "map", generation: 1, eligible: true, domains: [{ domainId: "opaque", ...renderState }] }] }) });
      });
      const visible = (values) => { for (let index = 3; index < values.length; index += 4) if (values[index] !== 0) return true; return false; };
      const view = document.querySelector("lr-map-view"); const sprite = document.querySelector("lr-map-sprite");
      let tileVisible = false; let playerVisible = false;
      for (let attempt = 0; attempt < 500 && (!tileVisible || !playerVisible); attempt += 1) {
        const mapCanvas = view?.shadowRoot?.querySelector("canvas"); const spriteCanvas = sprite?.shadowRoot?.querySelector("canvas");
        if (mapCanvas) tileVisible = visible(mapCanvas.getContext("2d").getImageData(0, 0, 640, 480).data);
        if (spriteCanvas?.width && spriteCanvas?.height) playerVisible = visible(spriteCanvas.getContext("2d").getImageData(0, 0, spriteCanvas.width, spriteCanvas.height).data);
        if (!tileVisible || !playerVisible) await new Promise((resolve) => setTimeout(resolve, 10));
      }
      return { size: [getComputedStyle(view).width, getComputedStyle(view).height], tileVisible, playerVisible, dom: view.children[0] === sprite };
    }, { origin, prepared: presentation.prepared, renderState });
    assert.deepEqual(result.size, ["640px", "480px"]); assert.equal(result.tileVisible, true); assert.equal(result.playerVisible, true); assert.equal(result.dom, true);
    return result;
  } finally { await browser.close(); await new Promise((resolve) => server.close(resolve)); }
}

const options = argumentsOf(process.argv.slice(2));
await mkdir(workRoot, { recursive: true });
const fingerprint = await sourceFingerprint(path.resolve(options.source));
const fsdbRoot = process.env.LOOMREALM_M14_REUSE_FSDB
  ? path.resolve(process.env.LOOMREALM_M14_REUSE_FSDB)
  : await runImporter(["--source", options.source, "--output", workRoot]);
const map = JSON.parse(await readFile(path.join(fsdbRoot, "[struct]Map", `${options["map-id"]}.json`), "utf8"));
const tileset = JSON.parse(await readFile(path.join(fsdbRoot, "[struct]Tileset", `${map.tileset_id}.json`), "utf8"));
assert.deepEqual(Object.keys(map), ["tileset_id", "width", "height", "data"]);
assert.deepEqual(Object.keys(tileset), ["id", "tileset_name", "passages", "priorities"]);
const tilesetPath = await resourceFile(fsdbRoot, "Graphics", `Tilesets/${tileset.tileset_name}`);
const playerPath = await resourceFile(fsdbRoot, "Graphics", `Characters/${options["character-name"]}`);
const tilesetBytes = await readFile(tilesetPath); const playerBytes = await readFile(playerPath);
const resources = new Map([
  [`Graphics/Tilesets/${tileset.tileset_name}`, { bytes: tilesetBytes, mime: "image/png", contentVersion: version(tilesetBytes) }],
  [`Graphics/Characters/${options["character-name"]}`, { bytes: playerBytes, mime: "image/png", contentVersion: version(playerBytes) }],
]);
let handler; const states = []; const controller = new AbortController();
const definition = mapDefinition({ signal: controller.signal, content: {
  async record(namespace, key) { return { value: namespace === "Map" ? map : tileset, contentVersion: version(Buffer.from(`${namespace}/${key}`)) }; },
  async resource(namespace, key) { const item = resources.get(`${namespace}/${key}`); if (!item) throw new Error("missing resource"); return { ...item, bytes: Uint8Array.from(item.bytes) }; },
}, createInputListener() { return { on(_channel, value) { handler = value; return () => {}; }, setChannels() {}, close() {} }; }, createRenderDomain(initial) { states.push(initial); return { replace(value) { states.push(value); }, emit() {}, close() {} }; } });
const pending = definition.frame({ id: "local", params: { mapId: options["map-id"], x: options.x, y: options.y, characterName: options["character-name"] }, signal: controller.signal, async call() { throw new Error("unused"); } });
for (let attempt = 0; attempt < 200 && !handler; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 10));
if (!handler) throw new Error("Local map Runtime did not start");
const before = states.at(-1).roots[0].children[0].data;
await handler({ action: "down", code: "ArrowRight", repeat: false });
const after = states.at(-1).roots[0].children[0].data;
const browser = await browserQualification(states.at(-1), resources);
controller.abort(); await pending;
const record = { sourceFingerprint: `sha256:${fingerprint}`, fsdbRoot, selection: { mapId: options["map-id"], x: options.x, y: options.y, characterName: options["character-name"] }, tileset: tileset.tileset_name, movement: { code: "ArrowRight", before: { x: before.x, y: before.y }, after: { x: after.x, y: after.y }, direction: after.direction }, browser, pass: true };
await import("node:fs/promises").then(({ writeFile }) => writeFile(path.join(workRoot, "last-qualification.json"), `${JSON.stringify(record, null, 2)}\n`));
console.log(JSON.stringify(record, null, 2));
