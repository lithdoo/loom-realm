import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test, { describe } from "node:test";
import { fileURLToPath } from "node:url";
import mapDefinition from "@loomrealm-game/map";
import {
  JUMP_DURATION_MS,
  MAP_ACTION_SCHEMA_VERSION,
  planMovement,
  validateMapRecord,
  validateTilesetRecord,
} from "../game-libs/map/dist/semantics.js";
import { decodeRxdataBytes, defaultLocalFsdb } from "../tools/fixtures/essentials-v21.1/lib/essentials/v21.1/map-event-evidence.mjs";
import { projectMapRecord, projectTilesetRecords } from "../tools/fixtures/essentials-v21.1/lib/essentials/v21.1/m14-consumer.mjs";
import { projectMapActionRecord } from "../tools/fixtures/essentials-v21.1/lib/essentials/v21.1/map-action-consumer.mjs";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const fsdb = defaultLocalFsdb(repoRoot);

function player(state) { return state.roots[0].children[0].data; }
function view(state) { return state.roots[0].data; }

function applyDomainUpdate(state, update) {
  const next = structuredClone(state);
  for (const nodeUpdate of update.nodes ?? []) {
    const visit = (node) => {
      if (node.key === nodeUpdate.key) {
        if (nodeUpdate.data?.set) Object.assign(node.data, nodeUpdate.data.set);
        if (nodeUpdate.data?.remove) for (const key of nodeUpdate.data.remove) delete node.data[key];
      }
      node.children.forEach(visit);
    };
    next.roots.forEach(visit);
  }
  return next;
}

function emptyTransfer(id) {
  return { id, steps: [], contacts: [], edges: [] };
}

function fixtureTileset() {
  const passages = Array(386).fill(0);
  const priorities = Array(386).fill(0);
  return {
    id: 1,
    tileset_name: "unused",
    autotile_names: [null, null, null, null, null, null, null],
    passages: { dimensions: 1, xSize: 386, ySize: 1, zSize: 1, values: passages },
    priorities: { dimensions: 1, xSize: 386, ySize: 1, zSize: 1, values: priorities },
    terrain_tags: { dimensions: 1, xSize: 386, ySize: 1, zSize: 1, values: Array(386).fill(0) },
  };
}

function fixtureMap() {
  const values = Array(24 * 18 * 3).fill(384);
  return { tileset_id: 1, width: 24, height: 18, data: { dimensions: 3, xSize: 24, ySize: 18, zSize: 3, values } };
}

describe("terrain behavior live FSDB product (SKIP when official maps absent)", { concurrency: false }, () => {
  function installTimers(t) {
    const realSetTimeout = globalThis.setTimeout;
    const realClearTimeout = globalThis.clearTimeout;
    const queued = [];
    globalThis.setTimeout = (callback, delay) => {
      if (delay !== 250 && delay !== 100 && delay !== 400) return realSetTimeout(callback, delay);
      const id = queued.length + 1;
      queued.push({ id, callback, delay });
      return id;
    };
    globalThis.clearTimeout = (id) => {
      const index = queued.findIndex((item) => item.id === id);
      if (index >= 0) queued.splice(index, 1);
    };
    t.after(() => {
      globalThis.setTimeout = realSetTimeout;
      globalThis.clearTimeout = realClearTimeout;
    });
    return {
      fireTimer(delay) {
        const index = queued.findIndex((item) => item.delay === delay);
        assert.ok(index >= 0, `expected a pending ${delay}ms timer`);
        const [item] = queued.splice(index, 1);
        item.callback();
      },
    };
  }

  async function startFrame(t, options) {
    const records = {
      "struct.Map/1": fixtureMap(),
      "struct.Tileset/1": fixtureTileset(),
      "struct.MapTransfer/1": emptyTransfer(1),
      ...options.records,
    };
    const handlers = new Map();
    const states = [];
    const timers = installTimers(t);
    const definition = mapDefinition({
      signal: new AbortController().signal,
      viewport: {
        current: { width: 640, height: 480 },
        subscribe(listener) {
          listener({ width: 640, height: 480 });
          return () => {};
        },
      },
      content: {
        async record(namespace, key) {
          const id = `${namespace}/${key}`;
          const value = records[id];
          if (value === undefined) throw new TypeError(`missing ${id}`);
          return { value, contentVersion: "v-record" };
        },
        async resource() {
          return { bytes: new Uint8Array([1]), mime: "image/png", contentVersion: "v-image" };
        },
      },
      createInputListener({ channels }) {
        assert.deepEqual([...channels], ["keyboard.event", "keyboard.state"]);
        return {
          on(channel, handler) {
            handlers.set(channel, handler);
            return () => {};
          },
          setChannels() {},
          close() {},
        };
      },
      createRenderDomain(initial) {
        states.push(structuredClone(initial));
        return {
          replace(state) { states.push(structuredClone(state)); },
          update(delta) { states.push(applyDomainUpdate(states.at(-1), delta)); },
          emit() {},
          close() {},
        };
      },
    });
    const controller = new AbortController();
    const pending = definition.frame({
      id: "live",
      params: options.params,
      signal: controller.signal,
      async call() { throw new Error("unused"); },
    });
    for (let attempt = 0; attempt < 40 && (states.length === 0 || !handlers.has("keyboard.event")); attempt += 1) {
      await new Promise((resolve) => setImmediate(resolve));
    }
    assert.ok(states.length >= 1, "expected initial standing RenderDomain");
    return {
      emitEvent(payload) { return handlers.get("keyboard.event")(payload); },
      latestState: () => states.at(-1),
      abort() { controller.abort(); },
      pending,
      fireTimer: timers.fireTimer,
    };
  }

  const down = (code) => ({ action: "down", code, repeat: false });
  const up = (code) => ({ action: "up", code, repeat: false });

  async function loadLiveMap(mapId) {
    const padded = String(mapId).padStart(3, "0");
    const filename = `Map${padded}.rxdata`;
    const mapPath = join(fsdb, "[resource]Data", filename);
    if (!existsSync(mapPath)) return null;
    const data = join(fsdb, "[resource]Data");
    const mapRoot = decodeRxdataBytes(await readFile(mapPath), filename).root;
    const map = validateMapRecord(projectMapRecord({ filename, root: mapRoot }).value);
    const tilesets = projectTilesetRecords({
      filename: "Tilesets.rxdata",
      root: decodeRxdataBytes(await readFile(join(data, "Tilesets.rxdata")), "Tilesets.rxdata").root,
    });
    const tilesetEntry = tilesets.find((record) => Number(record.key) === map.tileset_id);
    assert.ok(tilesetEntry, `tileset ${map.tileset_id} for Map${padded}`);
    const tileset = validateTilesetRecord(tilesetEntry.value, map.tileset_id);
    const actions = projectMapActionRecord({ filename, root: mapRoot }).value;
    return { map, tileset, actions, mapRoot };
  }

  test("live Map47 (16,9) down is one jump to (16,11)", async (t) => {
    const loaded = await loadLiveMap(47);
    if (!loaded) {
      t.skip("local official FSDB is not present; synthetic ledge tests still ran in @loomrealm-game/map");
      return;
    }
    const jump = planMovement(loaded.map, loaded.tileset, 16, 9, 2, 0);
    assert.equal(jump.kind, "jump");
    assert.equal(jump.fromX, 16);
    assert.equal(jump.fromY, 9);
    assert.equal(jump.toX, 16);
    assert.equal(jump.toY, 11);
    assert.equal(jump.skippedX, 16);
    assert.equal(jump.skippedY, 10);
    assert.equal(jump.durationMs, JUMP_DURATION_MS);
    assert.equal(planMovement(loaded.map, loaded.tileset, 16, 11, 8, 0).kind, "blocked");
  });

  test("live Map21 On at EV004 occupancy changes bridgeLevel", async (t) => {
    const loaded = await loadLiveMap(21);
    if (!loaded) {
      t.skip("local official FSDB is not present; synthetic Bridge product tests still ran in @loomrealm-game/map");
      return;
    }
    const on = loaded.actions.actions.find((action) => action.eventId === 4 && action.op === "bridge-on");
    assert.ok(on, "Map21 event 4 must project as bridge-on");
    const frame = await startFrame(t, {
      params: { mapId: 21, x: 21, y: 47, characterName: "m14_player" },
      records: {
        [`struct.Map/21`]: loaded.map,
        [`struct.Tileset/${loaded.map.tileset_id}`]: loaded.tileset,
        "struct.MapTransfer/21": emptyTransfer(21),
        "struct.MapAction/21": loaded.actions,
      },
    });
    await frame.emitEvent(down("ArrowLeft"));
    frame.fireTimer(250);
    await frame.emitEvent(up("ArrowLeft"));
    assert.equal(player(frame.latestState()).x, 20);
    assert.equal(player(frame.latestState()).y, 47);
    assert.equal(player(frame.latestState()).bridgeLevel, 2);
    assert.equal(view(frame.latestState()).bridgeLevel, 2);
    frame.abort();
    await frame.pending;
  });

  test("live Map47 (16,9) product jump lands on (16,11)", async (t) => {
    const loaded = await loadLiveMap(47);
    if (!loaded) {
      t.skip("local official FSDB is not present; synthetic Ledge product tests still ran in @loomrealm-game/map");
      return;
    }
    const frame = await startFrame(t, {
      params: { mapId: 47, x: 16, y: 9, characterName: "m14_player" },
      records: {
        "struct.Map/47": loaded.map,
        [`struct.Tileset/${loaded.map.tileset_id}`]: loaded.tileset,
        "struct.MapTransfer/47": emptyTransfer(47),
        "struct.MapAction/47": {
          id: 47,
          schemaVersion: MAP_ACTION_SCHEMA_VERSION,
          actions: [],
          opaqueRelated: [],
        },
      },
    });
    await frame.emitEvent(down("ArrowDown"));
    await frame.emitEvent(up("ArrowDown"));
    assert.equal(player(frame.latestState()).y, 11);
    assert.equal(player(frame.latestState()).motion.kind, "jump");
    assert.equal(player(frame.latestState()).motion.durationMs, JUMP_DURATION_MS);
    frame.fireTimer(400);
    assert.equal(player(frame.latestState()).y, 11);
    assert.equal(player(frame.latestState()).motion, null);
    frame.abort();
    await frame.pending;
  });
});
