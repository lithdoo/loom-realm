import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const browserAsset = path.join(root, "game-libs", "battle", "dist", "browser", "battle.browser.js");
const version = `sha256:${"2".repeat(64)}`;
function executablePath() { return [process.env.LOOMREALM_CHROMIUM_PATH, "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe", "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"].filter(Boolean).find(existsSync); }
const ref = (key) => ({ namespace: "resource.Graphics", key, contentVersion: version });
const layout = (width = 640, height = 480) => { const barHeight = height < 480 ? 24 : height < 720 ? 32 : 48, contentHeight = height - barHeight, rows = Math.min(33, Math.max(14, Math.ceil(contentHeight / 32))), columns = Math.ceil(width / 32); return { viewportWidth: width, viewportHeight: height, barHeight, contentWidth: width, contentHeight, columns, rows, logicalWidth: columns * 32, logicalHeight: rows * 32, scaleX: width / (columns * 32), scaleY: contentHeight / (rows * 32) }; };
const viewData = (epoch, paused = false, width = 640, height = 480) => ({ sceneEpoch: 7, visualEpoch: epoch, paused, ...layout(width, height), mapWidth: 30, mapHeight: 20, cameraX: 0, cameraY: 0, tileset: ref("Tilesets/test.png"), autotiles: [ref("Autotiles/water[2]"),null,null,null,null,null,null], tiles: [[0,0,0,384,0],[1,0,0,48,0],[2,2,2,385,160]] });
const actorData = (id, epoch, x, motion = null, paused = false, hpLife = "alive", sprite = `Characters/${id}.png`) => ({ sceneEpoch: 7, visualEpoch: epoch, paused, actorId: id, tileX: x, tileY: 2, direction: id === "hero" ? 6 : 4, sprite: ref(sprite), life: hpLife, motion });
const effectData = (epoch, starts = [], paused = false) => ({ sceneEpoch: 7, visualEpoch: epoch, paused, effectStarts: starts });
const hudData = (epoch, heroHp = 100) => ({ sceneEpoch: 7, visualEpoch: epoch, actors: [{ actorId: "hero", team: "ally", hp: heroHp, maxHp: 100 }, { actorId: "enemy", team: "enemy", hp: 80, maxHp: 80 }] });
function domain(epoch, { paused = false, width = 640, height = 480, heroHp = 100, effects = [], movingBoth = false, missingHero = false } = {}) {
  const heroMotion = movingBoth ? { id: 17, fromWorldX: 64, fromWorldY: 64, toWorldX: 96, toWorldY: 64, durationMs: 400 } : null;
  const enemyMotion = movingBoth ? { id: 9, fromWorldX: 160, fromWorldY: 64, toWorldX: 128, toWorldY: 64, durationMs: 600 } : null;
  return { domainId: "battle-domain", zIndex: 0, roots: [{ key: "battle:view", tag: "lr-battle-view", attrs: {}, data: viewData(epoch, paused, width, height), children: [
    { key: "battle:actor:enemy", tag: "lr-battle-actor", attrs: { slot: "world" }, data: actorData("enemy", epoch, 5, enemyMotion, paused), children: [] },
    { key: "battle:actor:hero", tag: "lr-battle-actor", attrs: { slot: "world" }, data: actorData("hero", epoch, 2, heroMotion, paused, "alive", missingHero ? "Characters/missing.png" : "Characters/hero.png"), children: [] },
    { key: "battle:effects", tag: "lr-battle-effects", attrs: { slot: "world" }, data: effectData(epoch, effects, paused), children: [] },
    { key: "battle:hud", tag: "lr-battle-hud", attrs: { slot: "hud" }, data: hudData(epoch, heroHp), children: [] },
  ] }] };
}
const rendererView = (state) => ({ sessionId: "session", subsystems: state ? [{ subsystemKey: "battle", generation: 1, eligible: true, domains: [state] }] : [] });
async function waitFor(page, predicate, label) { const until = Date.now() + 10_000; while (!(await page.evaluate(predicate))) { if (Date.now() > until) assert.fail(`Timed out waiting for ${label}`); await new Promise((resolve) => setTimeout(resolve, 10)); } }

test("RenderDomain state traverses WebProjector into battle custom elements", { timeout: 30_000 }, async (t) => {
  const asset = await readFile(browserAsset); let server;
  server = http.createServer(async (request, response) => {
    const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
    if (pathname === "/battle.browser.js") { response.setHeader("content-type", "text/javascript"); response.end(asset); return; }
    if (pathname.startsWith("/renderer/") && pathname.endsWith(".js")) { try { response.setHeader("content-type", "text/javascript"); response.end(await readFile(path.join(root, "packages", "renderer", "dist", "internal", path.basename(pathname)))); } catch { response.statusCode = 404; response.end(); } return; }
    response.setHeader("content-type", "text/html"); response.end("<!doctype html><html><body style='margin:0'></body></html>");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve)); t.after(() => new Promise((resolve) => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`; const browser = await chromium.launch({ headless: true, ...(executablePath() ? { executablePath: executablePath() } : {}) }); t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 900, height: 700 } }); await page.goto(origin); await page.addScriptTag({ url: `${origin}/battle.browser.js` });
  await page.evaluate(async ({ origin }) => {
    const { WebProjector } = await import(`${origin}/renderer/web-projector.js`);
    const png = async (w, h, colors) => { const canvas = new OffscreenCanvas(w, h), g = canvas.getContext("2d"); colors.forEach((color, index) => { g.fillStyle = color; g.fillRect(index * (w / colors.length), 0, w / colors.length, h); }); return new Uint8Array(await (await canvas.convertToBlob({ type: "image/png" })).arrayBuffer()); };
    const tiles = await png(256, 64, ["#294", "#49c", "#fc4", "#a4f", "#e55", "#5ee", "#ddd", "#222"]), autotile = await png(64, 32, ["#f00", "#00f"]), character = await png(128, 128, ["#f33", "#3f3", "#33f", "#ff3"]), tall = await png(192, 256, ["#c44", "#4c4", "#44c", "#cc4"]), effect = await png(32, 32, ["#fff"]);
    const resourceClient = { async resource(_namespace, key, contentVersion) { if (key.includes("missing")) throw new Error("decode failed"); return { bytes: key.startsWith("Tilesets/") ? tiles : key.startsWith("Autotiles/") ? autotile : key.startsWith("BattleEffects/") ? effect : key.includes("enemy") ? tall : character, mime: "image/png", contentVersion }; } };
    const failures = []; const projector = new WebProjector({ document, resourceClient, reportFailure(error) { failures.push(String(error)); } }); window.applyBattle = (view) => projector.reevaluate({ read: () => view }); window.closeBattle = () => projector.teardown(); window.battleFailures = failures;
  }, { origin });
  await page.evaluate((view) => window.applyBattle(view), rendererView(domain(1))); await waitFor(page, () => document.querySelectorAll("lr-battle-view lr-battle-actor").length === 2 && document.querySelector("lr-battle-actor")?.style.zIndex === "255", "initial actor tree and tall sprite");
  assert.deepEqual(await page.evaluate(() => ({ tags: [...document.querySelector("lr-battle-view").children].map((e) => e.tagName), hud: [...document.querySelector("lr-battle-hud").shadowRoot.querySelectorAll("span")].map((e) => e.textContent), tallStack: document.querySelector("lr-battle-actor").style.zIndex, failures: window.battleFailures })), { tags: ["LR-BATTLE-ACTOR","LR-BATTLE-ACTOR","LR-BATTLE-EFFECTS","LR-BATTLE-HUD"], hud: ["Ally 100 / 100", "Enemy 80 / 80"], tallStack: "255", failures: [] });
  const autotilePixel = () => page.evaluate(() => { const canvas = [...document.querySelector("lr-battle-view").shadowRoot.querySelectorAll(".tiles canvas")].find((item) => item.style.left === "32px"); return [...canvas.getContext("2d").getImageData(8,8,1,1).data]; });
  await page.evaluate(() => { const view = document.querySelector("lr-battle-view"); view._animationStart = performance.now(); view._pauseTotal = 0; view._paintTiles(view._sequence); }); const frameOne = await autotilePixel(); await new Promise((resolve) => setTimeout(resolve, 120)); const frameTwo = await autotilePixel(); assert.notDeepEqual(frameOne, frameTwo, "[2] autotile advances at 2 * 50ms");
  await page.evaluate((view) => window.applyBattle(view), rendererView(domain(2, { movingBoth: true }))); await waitFor(page, () => [...document.querySelectorAll("lr-battle-actor")].every((e) => e._motion), "two motions"); assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll("lr-battle-actor")].map((e) => e._motion.id).sort((a,b)=>a-b)), [9,17]);
  const start = { effectId: "hit-1", result: "hit", image: ref("BattleEffects/spark.png"), worldX: 96, worldY: 80, fadeInMs: 50, holdMs: 300, fadeOutMs: 50 };
  await page.evaluate((view) => window.applyBattle(view), rendererView(domain(3, { heroHp: 70, effects: [start] }))); await waitFor(page, () => document.querySelector("lr-battle-effects")._active.size === 1, "hit effect"); assert.match(await page.evaluate(() => document.querySelector("lr-battle-hud").shadowRoot.textContent), /Ally 70 \/ 100/);
  await page.evaluate((view) => window.applyBattle(view), rendererView(domain(4, { paused: true, heroHp: 70, width: 800, height: 600 }))); assert.deepEqual(await page.evaluate(() => ({ paused: document.querySelector("lr-battle-effects")._paused, width: document.querySelector("lr-battle-view").style.width, active: document.querySelector("lr-battle-effects")._active.size })), { paused: true, width: "800px", active: 1 });
  await page.evaluate((view) => window.applyBattle(view), rendererView(domain(5, { heroHp: 70, width: 800, height: 600 }))); assert.equal(await page.evaluate(() => document.querySelector("lr-battle-effects")._paused), false);
  await page.evaluate((view) => window.applyBattle(view), rendererView(domain(6, { heroHp: 70, width: 800, height: 600, missingHero: true }))); await waitFor(page, () => document.querySelectorAll("lr-battle-actor")[1]?.shadowRoot.querySelector(".fallback")?.hidden === false, "character placeholder fallback");
  await page.evaluate((view) => window.applyBattle(view), rendererView(null)); await waitFor(page, () => !document.querySelector("lr-battle-view"), "close cleanup"); await page.evaluate(() => window.closeBattle());
});
