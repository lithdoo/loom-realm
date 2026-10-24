import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { parseGameEntryV1 } from "@loomrealm/game-package";
import { MAP_ONLY_NPC_PLACEMENTS, placementsForMap } from "../subsystems/map.mjs";

const root = new URL("../", import.meta.url);
const fsdbRoot = new URL("[FSDB]PokeMan/", root);
const requiredMapIds = Object.freeze([2, 3, 4, 5, 7, 8]);
const directions = new Set([2, 4, 6, 8]);

async function json(path) {
  return JSON.parse(await readFile(new URL(path, root), "utf8"));
}

test("the parsed Game Entry boots product-private Base then Map from the player home", async () => {
  const game = parseGameEntryV1(await readFile(new URL("game.json", root), "utf8"));
  assert.deepEqual(game, {
    formatVersion: 1,
    initial: {
      subsystem: "base",
      input: {
        mapId: 3,
        x: 3,
        y: 8,
        characterName: "Player",
      },
    },
    subsystems: [{ key: "base" }, { key: "map" }],
  });

  assert.deepEqual(await json("launch.hostra.json"), {
    formatVersion: 1,
    subsystems: [
      { key: "base", module: "subsystems/base.mjs" },
      { key: "map", module: "subsystems/map.mjs" },
    ],
  });
  const base = await readFile(new URL("subsystems/base.mjs", root), "utf8");
  assert.equal((base.match(/tag:\s*"game-controls-input"/g) ?? []).length, 1);
  assert.doesNotMatch(base, /createControlsConsumer|setMoveIntent|RPGMapBuilder/);
});

test("installation root exposes exactly one direct FSDB root", async () => {
  const entries = await readdir(root, { withFileTypes: true });
  assert.deepEqual(
    entries.filter((entry) => entry.isDirectory() && /^\[FSDB\].+$/u.test(entry.name)).map((entry) => entry.name),
    ["[FSDB]PokeMan"],
  );
  await assert.rejects(access(new URL("fsdb/[FSDB]PokeMan/", root)));
});

test("Map presentation is resolved from PokeMan Content resources", async () => {
  assert.deepEqual(await json("presentation.json"), {
    formatVersion: 1,
    styles: [
      { namespace: "Presentation", key: "map/map.css" },
      { namespace: "Presentation", key: "page.css" },
    ],
    scripts: [
      { namespace: "Presentation", key: "controls/device-input.browser.js" },
      { namespace: "Presentation", key: "map/map.browser.js" },
    ],
  });

  await access(new URL("[resource]Presentation/controls/device-input.browser.js.js", fsdbRoot));
  await access(new URL("[resource]Presentation/map/map.css.css", fsdbRoot));
  await access(new URL("[resource]Presentation/map/map.browser.js.js", fsdbRoot));
  await access(new URL("[resource]Presentation/page.css.css", fsdbRoot));
});

test("the required maps have valid dimensions and resolvable tileset graphics", async () => {
  for (const mapId of requiredMapIds) {
    const map = await json(`[FSDB]PokeMan/[struct]Map/${mapId}.json`);
    assert.ok(Number.isSafeInteger(map.width) && map.width > 0);
    assert.ok(Number.isSafeInteger(map.height) && map.height > 0);
    assert.equal(map.data.xSize, map.width);
    assert.equal(map.data.ySize, map.height);
    assert.equal(map.data.zSize, 3);
    assert.equal(map.data.values.length, map.width * map.height * 3);

    const tileset = await json(`[FSDB]PokeMan/[struct]Tileset/${map.tileset_id}.json`);
    assert.equal(tileset.id, map.tileset_id);
    await access(new URL(`[resource]Graphics/Tilesets/${tileset.tileset_name}.png`, fsdbRoot));
    for (const name of tileset.autotile_names.filter(Boolean)) {
      await access(new URL(`[resource]Graphics/Autotiles/${name}.png`, fsdbRoot));
    }
  }
});

test("Map-only NPC placements stay in bounds and resolve NPC sprites", async () => {
  for (const mapId of requiredMapIds) {
    const map = await json(`[FSDB]PokeMan/[struct]Map/${mapId}.json`);
    const placements = placementsForMap(mapId);
    assert.equal(placements, MAP_ONLY_NPC_PLACEMENTS[mapId]);
    for (const placement of placements) {
      assert.ok(placement.x >= 0 && placement.x < map.width, `${placement.instanceId} x is outside Map ${mapId}`);
      assert.ok(placement.y >= 0 && placement.y < map.height, `${placement.instanceId} y is outside Map ${mapId}`);
      assert.ok(directions.has(placement.direction), `${placement.instanceId} has an invalid direction`);
      if (placement.pattern !== undefined) {
        assert.ok(Number.isSafeInteger(placement.pattern) && placement.pattern >= 0 && placement.pattern <= 3);
      }
      const npc = await json(`[FSDB]PokeMan/[struct]NPC/${placement.npcId}.json`);
      assert.equal(npc.sprite.namespace, "resource.Graphics");
      await access(new URL(`[resource]Graphics/${npc.sprite.key}.png`, fsdbRoot));
    }
  }
  assert.deepEqual(placementsForMap(999), []);
  await access(new URL("[resource]Graphics/Characters/Player.png", fsdbRoot));
});

test("critical MapTransfer rules have valid source and target geometry", async () => {
  for (const mapId of requiredMapIds) {
    const map = await json(`[FSDB]PokeMan/[struct]Map/${mapId}.json`);
    const transfer = await json(`[FSDB]PokeMan/[struct]MapTransfer/${mapId}.json`);
    assert.equal(transfer.id, mapId);
    for (const kind of ["contacts", "steps", "edges"]) {
      assert.ok(Array.isArray(transfer[kind]), `Map ${mapId} ${kind} must be an array`);
      for (const rule of transfer[kind]) {
        assert.ok(rule.x >= 0 && rule.x < map.width, `Map ${mapId} ${kind} source x is outside the map`);
        assert.ok(rule.y >= 0 && rule.y < map.height, `Map ${mapId} ${kind} source y is outside the map`);
        if (kind !== "steps") assert.ok(directions.has(rule.direction), `Map ${mapId} ${kind} direction is invalid`);
        if (rule.targetDirection !== undefined && rule.targetDirection !== null) {
          assert.ok(directions.has(rule.targetDirection), `Map ${mapId} ${kind} target direction is invalid`);
        }
        const target = await json(`[FSDB]PokeMan/[struct]Map/${rule.targetMapId}.json`);
        assert.ok(rule.targetX >= 0 && rule.targetX < target.width, `Map ${mapId} target x is outside Map ${rule.targetMapId}`);
        assert.ok(rule.targetY >= 0 && rule.targetY < target.height, `Map ${mapId} target y is outside Map ${rule.targetMapId}`);
      }
    }
  }
});

test("the intended Map-only route graph is represented by transfer rules", async () => {
  const targetsFrom = async (mapId) => {
    const transfer = await json(`[FSDB]PokeMan/[struct]MapTransfer/${mapId}.json`);
    return new Set([...transfer.contacts, ...transfer.steps, ...transfer.edges].map((rule) => rule.targetMapId));
  };
  assert.ok((await targetsFrom(3)).has(2), "Map 3 must lead to Map 2");
  for (const target of [4, 5, 8]) assert.ok((await targetsFrom(2)).has(target), `Map 2 must lead to Map ${target}`);
  assert.ok((await targetsFrom(4)).has(2), "Map 4 must lead back to Map 2");
  assert.ok((await targetsFrom(8)).has(2), "Map 8 must lead back to Map 2");
  assert.ok((await targetsFrom(5)).has(7), "Map 5 must lead to Map 7");
  assert.ok((await targetsFrom(7)).has(5), "Map 7 must lead back to Map 5");
});

test("page CSS fills the viewport and startup synchronizes Presentation before Hostra", async () => {
  const css = await readFile(new URL("presentation.css", root), "utf8");
  assert.match(css, /body\s*\{[^}]*overflow:\s*hidden/s);
  assert.match(css, /lr-map-view\s*\{[^}]*width:\s*100vw[^}]*height:\s*100vh/s);
  assert.doesNotMatch(css, /lr-map-view\s*\{[^}]*width:\s*640px/s);

  const play = await readFile(new URL("play.bat", root), "utf8");
  const syncIndex = play.indexOf("scripts\\sync-map-presentation.mjs");
  const hostraIndex = play.indexOf('"%NODE%" "%HOSTRA_JS%"');
  assert.ok(syncIndex >= 0 && hostraIndex > syncIndex, "play.bat must sync Presentation before launching Hostra");
});
