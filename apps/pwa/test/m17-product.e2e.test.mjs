import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { openProduct, waitForDemo } from "./helpers/browser.mjs";
import { runDesktopEquivalenceReference } from "./helpers/desktop-equivalence.mjs";

const repository = fileURLToPath(new URL("../../..", import.meta.url));

async function realMapFixture() {
  const example = join(repository, "examples", "essentials-v21.1");
  const fsdb = join(example, "[FSDB]essentials-v21.1");
  const text = async (...parts) => readFile(join(...parts), "utf8");
  const binary = async (...parts) => (await readFile(join(...parts))).toString("base64");
  return {
    gameEntryText: await text(example, "game.json"),
    launchManifestText: await text(example, "launch.hostra.json"),
    presentation: JSON.parse(await text(example, "presentation.json")),
    executable: await text(repository, "apps", "pwa", "dist", "qualification", "map-subsystem.mjs"),
    content: [
      { kind: "record", namespace: "struct.Map", key: "1", mime: "application/json; charset=utf-8", encoding: "text", body: await text(fsdb, "[struct]Map", "1.json") },
      { kind: "record", namespace: "struct.MapTransfer", key: "1", mime: "application/json; charset=utf-8", encoding: "text", body: await text(fsdb, "[struct]MapTransfer", "1.json") },
      { kind: "record", namespace: "struct.Tileset", key: "1", mime: "application/json; charset=utf-8", encoding: "text", body: await text(fsdb, "[struct]Tileset", "1.json") },
      { kind: "record", namespace: "struct.NPC", key: "guide", mime: "application/json; charset=utf-8", encoding: "text", body: await text(fsdb, "[struct]NPC", "guide.json") },
      { kind: "resource", namespace: "resource.Graphics", key: "Characters/m14_player", mime: "image/png", encoding: "base64", body: await binary(fsdb, "[resource]Graphics", "Characters", "m14_player.png") },
      { kind: "resource", namespace: "resource.Graphics", key: "Characters/m14_npc", mime: "image/png", encoding: "base64", body: await binary(fsdb, "[resource]Graphics", "Characters", "m14_npc.png") },
      { kind: "resource", namespace: "resource.Graphics", key: "Tilesets/m14_tileset", mime: "image/png", encoding: "base64", body: await binary(fsdb, "[resource]Graphics", "Tilesets", "m14_tileset.png") },
      { kind: "resource", namespace: "resource.Presentation", key: "map/map.browser.js", mime: "text/javascript; charset=utf-8", encoding: "text", body: await text(fsdb, "[resource]Presentation", "map", "map.browser.js.js") },
      { kind: "resource", namespace: "resource.Presentation", key: "map/map.css", mime: "text/css; charset=utf-8", encoding: "text", body: await text(fsdb, "[resource]Presentation", "map", "map.css.css") },
      { kind: "resource", namespace: "resource.Presentation", key: "essentials/page.css", mime: "text/css; charset=utf-8", encoding: "text", body: await text(fsdb, "[resource]Presentation", "essentials", "page.css.css") },
    ],
  };
}

test("M17 composes the browser product and matches a real Desktop/Hostra business run", { timeout: 30_000 }, async () => {
  const desktop = await runDesktopEquivalenceReference();
  const product = await openProduct();
  try {
    const { page } = product;
    await waitForDemo(page);
    await page.waitForFunction(() => document.querySelector("#loomrealm-demo")?.getAttribute("data-viewport") !== "pending");
    const render = await page.locator("#loomrealm-demo").evaluate((element) => ({
      content: element.getAttribute("data-content"),
      visits: Number(element.getAttribute("data-visits")),
      viewport: element.getAttribute("data-viewport"),
      presentation: document.documentElement.dataset.loomrealmPresentation,
      renderer: document.documentElement.dataset.loomrealmRenderer,
    }));
    assert.equal(render.content, "ready");
    assert.equal(render.visits, 1);
    assert.match(render.viewport, /^\d+x\d+$/);
    assert.equal(render.presentation, "ready");
    assert.equal(render.renderer, "installed");

    await page.keyboard.press("Enter");
    await page.waitForFunction(() => window.__loomrealmPwa.statuses.some((entry) => entry?.status === "settled"), null, { timeout: 20_000 });
    const result = await page.evaluate(() => window.__loomrealmPwa.statuses.find((entry) => entry?.status === "settled")?.result);
    assert.deepEqual(result, desktop.outcome);
    assert.equal(desktop.render.attrs["data-content"], render.content);
    assert.equal(Number(desktop.render.attrs["data-visits"]), render.visits);
    assert.equal(desktop.render.attrs["data-viewport"], render.viewport);
    assert.deepEqual(desktop.state, [{ key: { namespace: "demo", key: "visits" }, value: render.visits }]);
    assert.equal(desktop.rendererFailure, null);
    assert.equal(desktop.rendererCleaned, true);
  } finally { await product.close(); }
});

test("M17 installs and runs the existing essentials map game-lib artifact through the PWA pipeline", { timeout: 45_000 }, async () => {
  const fixture = await realMapFixture();
  const product = await openProduct();
  try {
    const { page } = product;
    const installationId = await page.evaluate(async (value) => {
      const decode = (entry) => entry.encoding === "base64"
        ? Uint8Array.from(atob(entry.body), (character) => character.charCodeAt(0))
        : entry.body;
      const installed = await window.__loomrealmPwaQualification.install({
        formatVersion: 1,
        gameEntryText: value.gameEntryText,
        launchManifestText: value.launchManifestText,
        content: value.content.map((entry) => ({
          kind: entry.kind,
          namespace: entry.namespace,
          key: entry.key,
          mime: entry.mime,
          body: new Blob([decode(entry)], { type: entry.mime }),
        })),
        executables: [{ logicalModule: "subsystems/map.mjs", mime: "text/javascript", body: new Blob([value.executable], { type: "text/javascript" }) }],
      });
      await window.__loomrealmPwaQualification.launch(installed.installationId, value.presentation);
      return installed.installationId;
    }, fixture);
    await page.locator("lr-map-view").waitFor({ state: "attached", timeout: 20_000 });
    await page.waitForFunction(() => document.querySelector("lr-map-view")?.dataset.mapVisualState === "ready" && document.querySelector("lr-map-sprite")?._latestData, null, { timeout: 20_000 });
    const initial = await page.evaluate(() => {
      const view = document.querySelector("lr-map-view");
      const player = document.querySelector("lr-map-sprite");
      return {
        mapId: view._latestData.mapId,
        visual: view.dataset.mapVisualState,
        player: { x: player._latestData.x, y: player._latestData.y },
        presentation: document.documentElement.dataset.loomrealmPresentation,
        renderer: document.documentElement.dataset.loomrealmRenderer,
        runtimeCreated: window.__loomrealmPwa.statuses.some((entry) => entry?.event?.type === "runtime-created"),
      };
    });
    assert.deepEqual(initial, {
      mapId: 1,
      visual: "ready",
      player: { x: 10, y: 8 },
      presentation: "ready",
      renderer: "installed",
      runtimeCreated: true,
    });
    await page.keyboard.press("ArrowRight");
    await page.waitForFunction((x) => document.querySelector("lr-map-sprite")?._latestData?.x !== x, initial.player.x, { timeout: 5_000 });
    const moved = await page.evaluate(() => {
      const player = document.querySelector("lr-map-sprite")._latestData;
      return { x: player.x, y: player.y, direction: player.direction };
    });
    assert.deepEqual(moved, { x: 11, y: 8, direction: 6 });
    const executable = await page.evaluate(async (id) => {
      const response = await fetch(`/_lr/internal/executables/${encodeURIComponent(id)}/subsystems/map.mjs`);
      return { status: response.status, mime: response.headers.get("content-type"), source: await response.text() };
    }, installationId);
    assert.equal(executable.status, 200);
    assert.match(executable.mime, /^text\/javascript/);
    assert.match(executable.source, /RPGMapBuilder/);
    assert.doesNotMatch(executable.source, /from\s+["']@loomrealm/);

    // A fresh Session in the same Window (the BFCache shape) must reuse the
    // document bootstrap capability rather than evaluating one-shot custom
    // element registration scripts a second time.
    const previousEpoch = await page.evaluate(() => window.__loomrealmPwa.sessionEpoch);
    await page.evaluate(() => window.__loomrealmPwaQualification.restart());
    await page.waitForFunction((epoch) => window.__loomrealmPwa.sessionEpoch !== epoch && document.documentElement.dataset.loomrealmProduct === "ready", previousEpoch, { timeout: 20_000 });
    await page.locator("lr-map-view").waitFor({ state: "attached", timeout: 20_000 });
    await page.waitForFunction(() => document.querySelector("lr-map-view")?.dataset.mapVisualState === "ready", null, { timeout: 20_000 });
    assert.equal(await page.evaluate(() => window.__loomrealmPwa.failure), null);
  } finally { await product.close(); }
});
