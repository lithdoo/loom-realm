import assert from "node:assert/strict";
import { join } from "node:path";
import test from "node:test";
import { MAP_ONLY_NPC_PLACEMENTS } from "../../../examples/PokeMan/subsystems/map.mjs";
import { createPokeManPwaFixture } from "../../../examples/PokeMan/scripts/prepare-pwa-content.mjs";
import { openProduct } from "./helpers/browser.mjs";
import { createPokeManRoutePlanner } from "./helpers/pokeman.mjs";

const executablePaths = Object.freeze({
  base: join(import.meta.dirname, "..", "dist", "qualification", "pokeman-base-subsystem.mjs"),
  map: join(import.meta.dirname, "..", "dist", "qualification", "pokeman-map-subsystem.mjs"),
});

async function mapSnapshot(page) {
  return page.evaluate(() => {
    const view = document.querySelector("lr-map-view");
    const sprites = [...document.querySelectorAll("lr-map-sprite")].map((element) => element._latestData);
    const player = sprites[0];
    return {
      mapId: view?._latestData?.mapId ?? null,
      visual: view?.dataset.mapVisualState ?? null,
      player: player ? { x: player.x, y: player.y, direction: player.direction, motion: player.motion } : null,
      npcs: sprites.slice(1).map((npc) => ({ x: npc.x, y: npc.y, direction: npc.direction })),
      product: document.documentElement.dataset.loomrealmProduct ?? null,
      presentation: document.documentElement.dataset.loomrealmPresentation ?? null,
      renderer: document.documentElement.dataset.loomrealmRenderer ?? null,
      failure: window.__loomrealmPwa.failure,
      sessionEpoch: window.__loomrealmPwa.sessionEpoch,
    };
  });
}

async function waitForState(page, expected) {
  await page.waitForFunction((target) => {
    const view = document.querySelector("lr-map-view");
    const player = document.querySelector("lr-map-sprite")?._latestData;
    return view?.dataset.mapVisualState === "ready"
      && view?._latestData?.mapId === target.mapId
      && player?.x === target.x
      && player?.y === target.y
      && player?.direction === target.direction
      && player?.motion === null
      && document.documentElement.dataset.loomrealmProduct === "ready"
      && window.__loomrealmPwa.failure === null;
  }, expected, { timeout: 20_000 });
}

async function runActions(page, actions, history) {
  for (const action of actions) {
    history.push(Object.freeze({ code: action.code, expected: action.expected }));
    await page.keyboard.press(action.code);
    await waitForState(page, action.expected);
  }
  return actions.at(-1)?.expected ?? null;
}

async function assertNpcProjection(page, mapId) {
  const expected = (MAP_ONLY_NPC_PLACEMENTS[mapId] ?? [])
    .map(({ x, y, direction }) => ({ x, y, direction }))
    .sort((left, right) => left.x - right.x || left.y - right.y || left.direction - right.direction);
  const observed = (await mapSnapshot(page)).npcs
    .sort((left, right) => left.x - right.x || left.y - right.y || left.direction - right.direction);
  assert.deepEqual(observed, expected, `Map ${mapId} NPC projection mismatch`);
}

test("PokeMan installs and runs its map-only route in real Chromium", { timeout: 180_000 }, async () => {
  const fixture = await createPokeManPwaFixture({ executablePaths });
  const planner = createPokeManRoutePlanner(fixture);
  const product = await openProduct({ viewport: { width: 960, height: 720 } });
  const history = [];
  try {
    const { page, context, diagnostics } = product;
    const installationId = await page.evaluate(async (value) => {
      const decode = (entry) => Uint8Array.from(atob(entry.body), (character) => character.charCodeAt(0));
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
        executables: value.executables.map((entry) => ({
          logicalModule: entry.logicalModule,
          mime: entry.mime,
          body: new Blob([entry.source], { type: entry.mime }),
        })),
      });
      await window.__loomrealmPwaQualification.launch(installed.installationId, value.presentation);
      return installed.installationId;
    }, fixture);

    const initial = Object.freeze({ mapId: 3, x: 3, y: 8, direction: 2 });
    await page.locator("lr-map-view").waitFor({ state: "attached", timeout: 20_000 });
    await waitForState(page, initial);
    assert.equal(await page.locator("game-controls-input").count(), 1, "Base must keep exactly one active controls producer while Map is active");
    assert.equal(await page.locator('game-controls-input[data-input-disabled="duplicate"]').count(), 0);
    assert.deepEqual(await mapSnapshot(page), {
      mapId: 3,
      visual: "ready",
      player: { x: 3, y: 8, direction: 2, motion: null },
      npcs: [{ x: 6, y: 8, direction: 4 }],
      product: "ready",
      presentation: "ready",
      renderer: "installed",
      failure: null,
      sessionEpoch: (await mapSnapshot(page)).sessionEpoch,
    });
    await assertNpcProjection(page, 3);

    // The initial contact transfer must enter Map 2 once and remain there,
    // rather than immediately bouncing back to Map 3.
    const toMap2 = planner.planToMap(initial, 2);
    assert.equal(toMap2.length, 1);
    let state = await runActions(page, toMap2, history);
    await page.waitForTimeout(500);
    let observed = await mapSnapshot(page);
    assert.deepEqual({ mapId: observed.mapId, x: observed.player.x, y: observed.player.y }, { mapId: 2, x: 8, y: 7 });
    await assertNpcProjection(page, 2);

    // Reach an adjacent tile and prove the rendered Map runtime rejects a
    // movement into the static NPC, without substituting an input-event count.
    const collision = planner.planNpcCollision(state);
    const beforeTravel = state;
    if (collision.travel.length > 0) state = await runActions(page, collision.travel, history);
    assert.ok(collision.travel.some((action) => action.expected.mapId === beforeTravel.mapId
      && (action.expected.x !== beforeTravel.x || action.expected.y !== beforeTravel.y)), "route must prove legal movement");
    const beforeCollision = await mapSnapshot(page);
    state = await runActions(page, [collision.collision], history);
    const afterCollision = await mapSnapshot(page);
    assert.deepEqual(
      { mapId: afterCollision.mapId, x: afterCollision.player.x, y: afterCollision.player.y },
      { mapId: beforeCollision.mapId, x: beforeCollision.player.x, y: beforeCollision.player.y },
    );

    for (const targetMapId of [4, 2, 8, 2, 5, 7]) {
      const actions = planner.planToMap(state, targetMapId);
      assert.ok(actions.length > 0, `Map ${state.mapId} must route to Map ${targetMapId}`);
      state = await runActions(page, actions, history);
      observed = await mapSnapshot(page);
      assert.equal(observed.mapId, targetMapId);
      assert.equal(observed.visual, "ready");
      assert.equal(observed.failure, null);
      if ([4, 5, 7, 8].includes(targetMapId)) await assertNpcProjection(page, targetMapId);
    }

    const routes = await page.evaluate(async (id) => {
      const requests = {
        map: `/_lr/v1/games/${encodeURIComponent(id)}/records/struct.Map/3`,
        presentation: `/_lr/v1/games/${encodeURIComponent(id)}/resources/resource.Presentation/map/map.browser.js`,
        baseExecutable: `/_lr/internal/executables/${encodeURIComponent(id)}/subsystems/base.mjs`,
        mapExecutable: `/_lr/internal/executables/${encodeURIComponent(id)}/subsystems/map.mjs`,
      };
      const output = {};
      for (const [name, url] of Object.entries(requests)) {
        const response = await fetch(url);
        output[name] = {
          status: response.status,
          mime: response.headers.get("content-type"),
          version: response.headers.get("x-loom-content-version"),
          body: await response.text(),
        };
      }
      return output;
    }, installationId);
    assert.equal(routes.map.status, 200);
    assert.equal(routes.map.mime, "application/json; charset=utf-8");
    assert.match(routes.map.version, /^sha256:[0-9a-f]{64}$/);
    assert.equal(JSON.parse(routes.map.body).tileset_id, 3);
    assert.equal(routes.presentation.status, 200);
    assert.match(routes.presentation.mime, /^text\/javascript/);
    assert.match(routes.presentation.version, /^sha256:[0-9a-f]{64}$/);
    assert.equal(routes.baseExecutable.status, 200);
    assert.match(routes.baseExecutable.mime, /^text\/javascript/);
    assert.match(routes.baseExecutable.version, /^sha256:[0-9a-f]{64}$/);
    assert.match(routes.baseExecutable.body, /game-controls-input/);
    assert.equal(routes.mapExecutable.status, 200);
    assert.match(routes.mapExecutable.mime, /^text\/javascript/);
    assert.match(routes.mapExecutable.version, /^sha256:[0-9a-f]{64}$/);
    assert.match(routes.mapExecutable.body, /RPGMapBuilder/);
    assert.doesNotMatch(routes.mapExecutable.body, /from\s*["']@loomrealm/u);

    await context.setOffline(true);
    try {
      const offline = await page.evaluate(async (id) => {
        const response = await fetch(`/_lr/v1/games/${encodeURIComponent(id)}/resources/resource.Graphics/Characters/Player`);
        return {
          status: response.status,
          mime: response.headers.get("content-type"),
          version: response.headers.get("x-loom-content-version"),
          signature: [...new Uint8Array(await response.arrayBuffer()).slice(0, 8)],
        };
      }, installationId);
      assert.deepEqual(offline, {
        status: 200,
        mime: "image/png",
        version: offline.version,
        signature: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
      });
      assert.match(offline.version, /^sha256:[0-9a-f]{64}$/);
    } finally {
      await context.setOffline(false);
    }

    const previousEpoch = (await mapSnapshot(page)).sessionEpoch;
    await page.evaluate(() => window.__loomrealmPwaQualification.restart());
    await page.waitForFunction((epoch) => window.__loomrealmPwa.sessionEpoch !== epoch, previousEpoch, { timeout: 20_000 });
    await page.locator("lr-map-view").waitFor({ state: "attached", timeout: 20_000 });
    await waitForState(page, initial);
    assert.equal(await page.locator("game-controls-input").count(), 1);
    assert.equal(await page.locator('game-controls-input[data-input-disabled="duplicate"]').count(), 0);
    await assertNpcProjection(page, 3);
    const restarted = await mapSnapshot(page);
    assert.notEqual(restarted.sessionEpoch, previousEpoch);
    assert.equal(restarted.failure, null);
    assert.equal(restarted.presentation, "ready");
    assert.equal(restarted.renderer, "installed");
    assert.deepEqual(diagnostics.filter((entry) => entry.startsWith("pageerror:")), []);
    assert.equal(await page.evaluate(() => window.__loomrealmPwa.statuses.some((entry) => entry?.status === "failed")), false);
  } catch (cause) {
    const snapshot = await mapSnapshot(product.page).catch(() => null);
    throw new Error(`${cause instanceof Error ? cause.stack ?? cause.message : String(cause)}\nActions: ${JSON.stringify(history)}\nSnapshot: ${JSON.stringify(snapshot)}\nDiagnostics: ${product.diagnostics.join("\n")}`);
  } finally {
    await product.close();
  }
});
