import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function json(path) {
  return JSON.parse(await readFile(new URL(path, root), "utf8"));
}

test("PokeMan currently boots only the Map subsystem from the player home", async () => {
  assert.deepEqual(await json("game.json"), {
    formatVersion: 1,
    initial: {
      subsystem: "map",
      input: {
        mapId: 3,
        x: 3,
        y: 8,
        characterName: "Player",
      },
    },
    subsystems: [{ key: "map" }],
  });

  assert.deepEqual(await json("launch.hostra.json"), {
    formatVersion: 1,
    subsystems: [{ key: "map", module: "subsystems/map.mjs" }],
  });
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
      { namespace: "Presentation", key: "map/map.browser.js" },
    ],
  });
});

test("the frozen prologue maps required by the Map-only slice exist", async () => {
  for (const mapId of [2, 3, 4, 5, 7, 8]) {
    const map = await json(`[FSDB]PokeMan/[struct]Map/${mapId}.json`);
    const transfer = await json(`[FSDB]PokeMan/[struct]MapTransfer/${mapId}.json`);
    assert.ok(Number.isSafeInteger(map.width) && map.width > 0);
    assert.ok(Number.isSafeInteger(map.height) && map.height > 0);
    assert.equal(transfer.id, mapId);
  }
});

test("Map-only NPC definitions and player graphics required by the slice exist", async () => {
  for (const npcId of [
    "home-family",
    "town-resident",
    "professor",
    "rival-lab",
    "road-bandit",
    "route-trainee",
    "center-servant",
    "rival-casual",
  ]) {
    const npc = await json(`[FSDB]PokeMan/[struct]NPC/${npcId}.json`);
    assert.equal(npc.sprite.namespace, "resource.Graphics");
    await access(new URL(`[FSDB]PokeMan/[resource]Graphics/${npc.sprite.key}.png`, root));
  }
  await access(new URL("[FSDB]PokeMan/[resource]Graphics/Characters/Player.png", root));
});
