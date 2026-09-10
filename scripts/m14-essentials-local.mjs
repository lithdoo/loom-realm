import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { createMemoryCarrierPair } from "@loomrealm/foundation/testing";
import { prepareHostraGame } from "@loomrealm/game-launcher-hostra";
import { runMain } from "@loomrealm/main";
import { createRendererControlHolder } from "@loomrealm/renderer";
import { createBoundContentClient, runSubsystem } from "@loomrealm/subsystem/host";
import { createDesktopContentService, prepareDesktopContentView } from "../apps/desktop/dist/index.js";
import mapDefinition from "@loomrealm-game/map";
import { attachRendererPresentation } from "../packages/renderer/dist/internal/presentation-seam.js";
import { run as runImporter } from "../tools/fixtures/essentials-v21.1/import.mjs";
import { buildSourceManifest } from "../tools/fixtures/essentials-v21.1/lib/source/manifest.mjs";
import { prepareExamplePresentation } from "../examples/essentials-v21.1/test/prepare.mjs";

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workRoot = path.join(repository, ".local", "m14-essentials");
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const scheduler = Object.freeze({ schedule(ms, callback) { const timer = setTimeout(callback, ms); return () => clearTimeout(timer); } });
const runtimePolicy = Object.freeze({ scheduler, helloDeadlineMs: 5_000, frameDeadlineMs: 5_000, terminalCleanupDeadlineMs: 100 });
const mainPolicy = Object.freeze({ runtimeBootstrapDeadlineMs: 5_000, frameDeadlineMs: 5_000, shutdownDeadlineMs: 5_000, terminationDeadlineMs: 1_000 });
const runnerPolicy = Object.freeze({ helloDeadlineMs: 5_000, frameDeadlineMs: 5_000, terminalCleanupDeadlineMs: 1_000, terminationGraceMs: 100 });

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

function executablePath() {
  return [process.env.LOOMREALM_CHROMIUM_PATH, "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe", "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"].filter(Boolean).find(existsSync);
}

async function waitFor(predicate, label, timeout = 15_000) {
  const deadline = Date.now() + timeout;
  while (!(await predicate())) {
    if (Date.now() >= deadline) throw new Error(`Timed out waiting for ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

function createDataHub() {
  const waiting = [];
  const pairs = [];
  const take = () => {
    while (waiting.length && pairs.length) waiting.shift().resolve(pairs.shift());
  };
  return {
    subsystemBinding: Object.freeze({
      acquire(signal) {
        if (signal.aborted) return Promise.reject(signal.reason);
        return new Promise((resolve, reject) => {
          const request = { resolve, reject };
          waiting.push(request); take();
          signal.addEventListener("abort", () => { const index = waiting.indexOf(request); if (index >= 0) waiting.splice(index, 1); reject(signal.reason); }, { once: true });
        });
      },
    }),
    rendererBinding: Object.freeze({
      acquire(_key, generation, dataProfile) {
        const pair = createMemoryCarrierPair();
        pairs.push({ carrier: pair.left, generation, dataProfile }); take();
        return Promise.resolve(pair.right);
      },
    }),
  };
}

async function prepareProductionContent(options) {
  const installationRoot = await mkdtemp(path.join(workRoot, "installation-"));
  const subsystems = path.join(installationRoot, "subsystems");
  await mkdir(subsystems, { recursive: true });
  await Promise.all([
    writeFile(path.join(installationRoot, "game.json"), `${JSON.stringify({
      formatVersion: 1,
      initial: { subsystem: "map", input: { mapId: options["map-id"], x: options.x, y: options.y, characterName: options["character-name"] } },
      subsystems: [{ key: "map" }],
    }, null, 2)}\n`),
    writeFile(path.join(installationRoot, "launch.hostra.json"), '{"formatVersion":1,"subsystems":[{"key":"map","module":"subsystems/map.mjs"}]}\n'),
    writeFile(path.join(subsystems, "map.mjs"), "export default () => ({ frame() {} });\n"),
  ]);
  const fsdbRoot = await runImporter(["--source", options.source, "--output", installationRoot]);
  const prepared = await prepareHostraGame({ source: { installationRoot }, runnerPolicy });
  const view = await prepareDesktopContentView(prepared);
  const service = await createDesktopContentService({ view });
  const grant = service.createGrant({ permissions: ["records", "resources"], expiresAtUnixMs: Date.now() + 60 * 60 * 1000 });
  const access = service.access(grant);
  const lifetime = new AbortController();
  const content = createBoundContentClient({ origin: access.origin.href, installationId: access.installationId, token: access.token }, lifetime.signal);
  return { access, content, fsdbRoot, installationRoot, lifetime, prepared, service };
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
const production = await prepareProductionContent(options);
const controller = new AbortController();
let main;
let detach = () => {};
try {
  const mapResult = await production.content.record("struct.Map", String(options["map-id"]));
  const map = mapResult.value;
  const tilesetResult = await production.content.record("struct.Tileset", String(map.tileset_id));
  const tileset = tilesetResult.value;
  assert.deepEqual(Object.keys(map), ["tileset_id", "width", "height", "data"]);
  assert.deepEqual(Object.keys(tileset), ["id", "tileset_name", "passages", "priorities"]);
  const tilesetResource = await production.content.resource("resource.Graphics", `Tilesets/${tileset.tileset_name}`);
  const playerResource = await production.content.resource("resource.Graphics", `Characters/${options["character-name"]}`);
  assert.equal(tilesetResource.mime, "image/png");
  assert.equal(playerResource.mime, "image/png");
  const resources = new Map([
    [`resource.Graphics/Tilesets/${tileset.tileset_name}`, tilesetResource],
    [`resource.Graphics/Characters/${options["character-name"]}`, playerResource],
  ]);

  const hub = createDataHub();
  let inputEmit;
  const inputSource = Object.freeze({ start(emit) { inputEmit = emit; emit({ kind: "availability", channel: "keyboard.event", available: true }); return () => {}; } });
  let holder;
  const rendererControl = Object.freeze({
    acquire(token, signal) {
      if (holder) return new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));
      const pair = createMemoryCarrierPair();
      holder = createRendererControlHolder(hub.rendererBinding, inputSource);
      void holder.connect({ carrier: pair.right, rendererControlToken: token });
      return Promise.resolve(pair.left);
    },
  });
  const runtimeHosting = Object.freeze({
    async launch(request) {
      assert.equal(request.subsystemKey, "map");
      const pair = createMemoryCarrierPair();
      let acquired = false;
      const runtime = runSubsystem({
        definition: mapDefinition,
        runtimeControl: { acquire() { assert.equal(acquired, false); acquired = true; return Promise.resolve(pair.right); } },
        runtimePolicy,
        launch: { subsystemKey: request.subsystemKey, bootstrapToken: request.bootstrapToken, controlProtocolVersions: [1] },
        data: hub.subsystemBinding,
        content: production.content,
      });
      void runtime.catch(() => {});
      return Object.freeze({ runtimeControl: { acquire() { return Promise.resolve(pair.left); } }, terminated: runtime, async requestTermination() { await pair.left.close(); } });
    },
  });
  main = runMain({
    bootstrap: production.prepared.logicalBootstrap,
    policy: mainPolicy,
    signal: controller.signal,
    platform: { scheduler, opaqueMaterial: { generate: () => randomBytes(32).toString("base64url") }, runtimeHosting, rendererControl, dataConnections: { replace() {} } },
  });
  void main.catch(() => {});
  await waitFor(() => holder?.current() !== null && typeof inputEmit === "function", "Renderer and M10 input source");
  let latestView;
  detach = attachRendererPresentation(holder, { reevaluate(source) { latestView = structuredClone(source.read()); } });
  await waitFor(() => latestView?.subsystems[0]?.domains[0]?.roots[0]?.children[0]?.data?.direction === 2, "initial exact-source Render state");
  const before = latestView.subsystems[0].domains[0].roots[0].children[0].data;
  inputEmit({ kind: "event", channel: "keyboard.event", payload: { action: "down", code: "ArrowRight", repeat: false } });
  await waitFor(() => latestView?.subsystems[0]?.domains[0]?.roots[0]?.children[0]?.data?.direction === 6, "ArrowRight through M10");
  const domain = latestView.subsystems[0].domains[0];
  const after = domain.roots[0].children[0].data;
  const browser = await browserQualification(domain, resources);
  const record = {
    sourceFingerprint: `sha256:${fingerprint}`,
    fsdbRoot: production.fsdbRoot,
    content: { seam: "Desktop FSDB HTTP -> Bound ContentClient", mapVersion: mapResult.contentVersion, tilesetVersion: tilesetResult.contentVersion, tilesetMime: tilesetResource.mime, playerMime: playerResource.mime },
    input: { seam: "RendererInputSource -> M10 -> Data -> Subsystem InputListener", action: "down", code: "ArrowRight", repeat: false },
    selection: { mapId: options["map-id"], x: options.x, y: options.y, characterName: options["character-name"] },
    tileset: tileset.tileset_name,
    movement: { code: "ArrowRight", before: { x: before.x, y: before.y }, after: { x: after.x, y: after.y }, direction: after.direction },
    browser,
    pass: true,
  };
  await writeFile(path.join(workRoot, "last-qualification.json"), `${JSON.stringify(record, null, 2)}\n`);
  console.log(JSON.stringify(record, null, 2));
} finally {
  detach();
  controller.abort(new Error("M14 exact-source qualification complete"));
  if (main) await main.catch(() => {});
  production.lifetime.abort();
  await production.service.close().catch(() => {});
  await rm(production.installationRoot, { recursive: true, force: true });
}
