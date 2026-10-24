import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { openProduct } from "./helpers/browser.mjs";
import { createPokeManRoutePlanner } from "./helpers/pokeman.mjs";

const initial = Object.freeze({ mapId: 3, x: 3, y: 8, direction: 2 });

async function waitForMap(page, target) {
  await page.waitForFunction((state) => {
    const view = document.querySelector("lr-map-view");
    const player = document.querySelector("lr-map-sprite")?._latestData;
    return document.documentElement.dataset.loomrealmProduct === "ready"
      && view?.dataset.mapVisualState === "ready"
      && view?._latestData?.mapId === state.mapId
      && player?.x === state.x
      && player?.y === state.y
      && player?.direction === state.direction
      && player?.motion === null
      && window.__loomrealmPwa.failure === null;
  }, target, { timeout: 25_000 });
}

async function act(page, steps) {
  for (const step of steps) {
    await page.keyboard.press(step.code);
    await waitForMap(page, step.expected);
  }
  return steps.at(-1)?.expected;
}

test("staging PokeMan boots from /pwa/pokeman, moves, blocks NPC, transfers, and reloads", { timeout: 180_000 }, async () => {
  const fixture = JSON.parse(await readFile(new URL("../dist/staging/pwa/pokeman/pokeman-bundle.json", import.meta.url), "utf8"));
  const planner = createPokeManRoutePlanner(fixture);
  const product = await openProduct({ viewport: { width: 960, height: 720 } });
  try {
    const { page, context, diagnostics } = product;
    await waitForMap(page, initial);
    assert.equal(await page.locator("game-controls-input").count(), 1);
    assert.equal(await page.locator('game-controls-input[data-input-disabled="duplicate"]').count(), 0);
    assert.equal(await page.evaluate(() => typeof window.__loomrealmPwaQualification), "undefined", "Staging must not expose qualification controls");

    const scope = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration("/pwa/pokeman/");
      return registration ? new URL(registration.scope).pathname : null;
    });
    assert.equal(scope, "/pwa/pokeman/");

    const installationId = await page.evaluate(() => window.__loomrealmPwa.installationId);
    assert.match(installationId, /./);
    const map = await page.evaluate(async (id) => {
      const res = await fetch(`/pwa/pokeman/_lr/v1/games/${encodeURIComponent(id)}/records/struct.Map/3`);
      return { status: res.status, value: res.ok ? await res.json() : null };
    }, installationId);
    assert.equal(map.status, 200);
    assert.equal(map.value.tileset_id, 3);
    assert.equal(map.value.width, 31);

    const map2 = planner.planToMap(initial, 2);
    assert.equal(map2.length, 1);
    let state = await act(page, map2);
    assert.equal(state.mapId, 2);

    const collision = planner.planNpcCollision(state);
    if (collision.travel.length > 0) state = await act(page, collision.travel);
    const before = state;
    state = await act(page, [collision.collision]);
    assert.equal(state.mapId, before.mapId);
    assert.equal(state.x, before.x);
    assert.equal(state.y, before.y);

    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForMap(page, initial);
    assert.equal(await page.locator("game-controls-input").count(), 1);
    assert.equal(await page.locator('game-controls-input[data-input-disabled="duplicate"]').count(), 0);
    assert.equal(await page.evaluate(() => window.__loomrealmPwa.installationId), installationId, "Refresh must reuse installed content");
    assert.equal(await page.evaluate(() => window.__loomrealmPwa.failure), null);
    const forbidden = await context.request.get(new URL("/service-worker.js", page.url()).href);
    assert.equal(forbidden.status(), 404, "Staging Service Worker must not be exposed at origin root");
    assert.deepEqual(diagnostics.filter((entry) => entry.startsWith("pageerror:")), []);
  } catch (cause) {
    throw new Error(`${cause instanceof Error ? cause.stack ?? cause.message : String(cause)}\nDiagnostics: ${product.diagnostics.join("\n")}`);
  } finally {
    await product.close();
  }
});
