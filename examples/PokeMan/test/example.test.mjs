import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { openFsdb, listFsdbEntries } from "@loomrealm/fsdb";
import { parseGameEntryV1 } from "@loomrealm/game-package";
import mapSubsystem from "../subsystems/map.mjs";

const root = new URL("../", import.meta.url);
const rootPath = fileURLToPath(root);
const fsdbRoot = new URL("[FSDB]PokeMan/", root);

test("Map subsystem module imports from the existing Map package", () => {
  assert.ok(mapSubsystem);
});

test("Game Entry starts only the Map subsystem in the player's home", async () => {
  const game = parseGameEntryV1(await readFile(new URL("game.json", root), "utf8"));
  assert.deepEqual(game, {
    formatVersion: 1,
    initial: {
      subsystem: "map",
      input: { mapId: 3, x: 3, y: 8, characterName: "Player" },
    },
    subsystems: [{ key: "map" }],
  });

  const launch = JSON.parse(await readFile(new URL("launch.hostra.json", root), "utf8"));
  assert.deepEqual(launch, {
    formatVersion: 1,
    subsystems: [{ key: "map", module: "subsystems/map.mjs" }],
  });
});

test("presentation config resolves Map browser assets from the installed FSDB", async () => {
  const presentation = JSON.parse(await readFile(new URL("presentation.json", root), "utf8"));
  assert.deepEqual(presentation, {
    formatVersion: 1,
    styles: [
      { namespace: "Presentation", key: "map/map.css" },
      { namespace: "Presentation", key: "page.css" },
    ],
    scripts: [
      { namespace: "Presentation", key: "map/map.browser.js" },
    ],
  });

  const sourceCss = await readFile(new URL("presentation.css", root), "utf8");
  const fsdbCss = await readFile(new URL("[FSDB]PokeMan/[resource]Presentation/page.css.css", root), "utf8");
  const fsdbBrowserScript = await readFile(new URL("[FSDB]PokeMan/[resource]Presentation/map/map.browser.js.js", root), "utf8");
  const mapBrowserSource = await readFile(new URL("../../../game-libs/map/browser/map.browser.js", import.meta.url), "utf8");
  assert.equal(sourceCss, fsdbCss);
  assert.equal(fsdbBrowserScript, mapBrowserSource, "FSDB Map browser script must match the current Map package source");
  assert.match(sourceCss, /overflow:\s*hidden/);
  assert.match(sourceCss, /lr-map-view\s*\{[^}]*width:\s*100vw[^}]*height:\s*100vh/s);
  assert.doesNotMatch(sourceCss, /lr-map-view\s*\{[^}]*width:\s*640px/);
});

test("Desktop discovers one root FSDB with all Map 3 content and presentation dependencies", async (t) => {
  const rootEntries = await readdir(rootPath, { withFileTypes: true });
  const fsdbRoots = rootEntries
    .filter((entry) => entry.isDirectory() && /^\[FSDB\].+$/u.test(entry.name))
    .map((entry) => entry.name);
  assert.deepEqual(fsdbRoots, ["[FSDB]PokeMan"]);

  const db = await openFsdb({ root: fileURLToPath(fsdbRoot) });
  t.after(() => db.close());

  const identities = new Set(listFsdbEntries(db).map(({ identity }) =>
    `${identity.kind}.${identity.table}/${identity.key}`,
  ));
  for (const identity of [
    "struct.Map/3",
    "struct.MapTransfer/3",
    "struct.Tileset/3",
    "resource.Graphics/Characters/Player",
    "resource.Graphics/Tilesets/Interior general",
    "resource.Graphics/Autotiles/Fountain2",
    "resource.Presentation/map/map.css",
    "resource.Presentation/map/map.browser.js",
    "resource.Presentation/page.css",
  ]) {
    assert.equal(identities.has(identity), true, `Missing FSDB dependency: ${identity}`);
  }

  const map = JSON.parse(await readFile(new URL("[FSDB]PokeMan/[struct]Map/3.json", root), "utf8"));
  const transfer = JSON.parse(await readFile(new URL("[FSDB]PokeMan/[struct]MapTransfer/3.json", root), "utf8"));
  const tileset = JSON.parse(await readFile(new URL("[FSDB]PokeMan/[struct]Tileset/3.json", root), "utf8"));
  const game = JSON.parse(await readFile(new URL("game.json", root), "utf8"));
  assert.equal(map.tileset_id, tileset.id);
  assert.equal(map.width, 31);
  assert.equal(map.height, 15);
  assert.equal(transfer.id, 3);
  assert.equal(transfer.contacts.some((contact) => contact.targetMapId === 2), true);
  assert.ok(game.initial.input.x >= 0 && game.initial.input.x < map.width);
  assert.ok(game.initial.input.y >= 0 && game.initial.input.y < map.height);
});
