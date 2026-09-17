import assert from "node:assert/strict";
import test, { describe } from "node:test";
import mapDefinition from "@loomrealm-game/map";
import { computeCamera, projectChunkWindow, validateMapRecord, validateTilesetRecord, viewportTileBounds } from "../dist/semantics.js";

const table = (dimensions, xSize, ySize, zSize, values) => ({ dimensions, xSize, ySize, zSize, values });
function fixture() {
  const values = Array(24 * 18 * 3).fill(0);
  for (let y = 0; y < 18; y += 1) for (let x = 0; x < 24; x += 1) values[x + y * 24] = 384;
  values[12 + 8 * 24] = 385;
  const passages = Array(386).fill(0); passages[385] = 0x02;
  const priorities = Array(386).fill(0); priorities[0] = 5;
  return {
    map: { tileset_id: 1, width: 24, height: 18, data: table(3, 24, 18, 3, values) },
    tileset: { id: 1, tileset_name: "m14_tileset", autotile_names: [null,null,null,null,null,null,null], passages: table(1, 386, 1, 1, passages), priorities: table(1, 386, 1, 1, priorities) },
  };
}

function emptyTransfer(id) {
  return { id, steps: [], contacts: [], edges: [] };
}

function wideMap(width = 64, height = 18) {
  const values = Array(width * height * 3).fill(0);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) values[x + y * width] = 384;
  const passages = Array(386).fill(0);
  const priorities = Array(386).fill(0);
  return {
    map: { tileset_id: 1, width, height, data: table(3, width, height, 3, values) },
    tileset: { id: 1, tileset_name: "m14_tileset", autotile_names: [null,null,null,null,null,null,null], passages: table(1, 386, 1, 1, passages), priorities: table(1, 386, 1, 1, priorities) },
  };
}

function autotileFilledMap({ width = 80, height = 40, name = "grass" } = {}) {
  const values = Array(width * height * 3).fill(48);
  const passages = Array(386).fill(0);
  const priorities = Array(386).fill(0);
  return {
    map: { tileset_id: 1, width, height, data: table(3, width, height, 3, values) },
    tileset: {
      id: 1,
      tileset_name: "m14_tileset",
      autotile_names: [name, name, name, name, name, name, name],
      passages: table(1, 386, 1, 1, passages),
      priorities: table(1, 386, 1, 1, priorities),
    },
  };
}

function secondMap() {
  const values = Array(24 * 18 * 3).fill(0);
  for (let y = 0; y < 18; y += 1) for (let x = 0; x < 24; x += 1) values[x + y * 24] = 384;
  const passages = Array(386).fill(0);
  const priorities = Array(386).fill(0);
  return {
    map: { tileset_id: 2, width: 24, height: 18, data: table(3, 24, 18, 3, values) },
    tileset: { id: 2, tileset_name: "target_tileset", autotile_names: [null,null,null,null,null,null,null], passages: table(1, 386, 1, 1, passages), priorities: table(1, 386, 1, 1, priorities) },
    transfer: emptyTransfer(2),
  };
}

async function flush(times = 40) {
  for (let attempt = 0; attempt < times; attempt += 1) await new Promise((resolve) => setImmediate(resolve));
}

function player(state) { return state.roots[0].children[0].data; }
function view(state) { return state.roots[0].data; }

function applyDomainUpdate(state, update) {
  const next = structuredClone(state);
  if (update.zIndex !== undefined) next.zIndex = update.zIndex;
  for (const nodeUpdate of update.nodes ?? []) {
    const visit = (node) => {
      if (node.key === nodeUpdate.key) {
        if (nodeUpdate.data?.set) Object.assign(node.data, nodeUpdate.data.set);
        if (nodeUpdate.data?.remove) for (const key of nodeUpdate.data.remove) delete node.data[key];
        if (nodeUpdate.attrs?.set) Object.assign(node.attrs, nodeUpdate.attrs.set);
        if (nodeUpdate.attrs?.remove) for (const key of nodeUpdate.attrs.remove) delete node.attrs[key];
      }
      node.children.forEach(visit);
    };
    next.roots.forEach(visit);
  }
  return next;
}

function renderHandle(states, onClose, updates = [], replaces = []) {
  return {
    replace(state) {
      replaces.push(structuredClone(state));
      states.push(structuredClone(state));
    },
    update(delta) {
      updates.push(structuredClone(delta));
      states.push(applyDomainUpdate(states.at(-1), delta));
    },
    emit() {},
    close() { onClose(); },
  };
}

function viewportSet(update) {
  return update?.nodes?.find((node) => node.key === "viewport")?.data?.set ?? {};
}

function playerSet(update) {
  return update?.nodes?.find((node) => node.key === "player")?.data?.set ?? {};
}

function assertPairedTokens(state) {
  const currentView = view(state);
  const currentPlayer = player(state);
  assert.equal(currentView.sceneEpoch, currentPlayer.sceneEpoch);
  assert.equal(currentView.visualEpoch, currentPlayer.visualEpoch);
  assert.equal(currentView.motionId, currentPlayer.motionId);
}

describe("map runtime walking", { concurrency: false }, () => {
  function installTimers(t) {
    const realSetTimeout = globalThis.setTimeout;
    const realClearTimeout = globalThis.clearTimeout;
    const queued = [];
    let nextId = 1;
    let lastCallback = null;
    globalThis.setTimeout = (callback, delay) => {
      if (delay !== 250 && delay !== 100) return realSetTimeout(callback, delay);
      const id = nextId;
      nextId += 1;
      lastCallback = callback;
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
      queued,
      lastCallback: () => lastCallback,
      fireNextTimer() {
        const item = queued.shift();
        assert.ok(item, "expected a pending 250ms step timer");
        item.callback();
      },
      fireTimer(delay) {
        const index = queued.findIndex((item) => item.delay === delay);
        assert.ok(index >= 0, `expected a pending ${delay}ms timer`);
        const [item] = queued.splice(index, 1);
        item.callback();
      },
    };
  }

  async function startFrame(t, options = {}) {
    const { map, tileset } = fixture();
    const extra = secondMap();
    const records = {
      "struct.Map/1": map,
      "struct.Tileset/1": tileset,
      "struct.MapTransfer/1": emptyTransfer(1),
      "struct.Map/2": extra.map,
      "struct.Tileset/2": extra.tileset,
      "struct.MapTransfer/2": extra.transfer,
      ...options.records,
    };
    if (options.omitTransfer) delete records["struct.MapTransfer/1"];
    const gates = options.gates ?? {};
    const reads = [];
    const handlers = new Map();
    const states = [];
    const updates = [];
    const replaces = [];
    let listenerClosed = false;
    let domainClosed = false;
    const timers = installTimers(t);
    const viewport = options.viewport ?? (() => {
      let current = options.viewportCurrent ?? null;
      const listeners = new Set();
      return {
        get current() { return current; },
        subscribe(listener) {
          listeners.add(listener);
          listener(current);
          return () => listeners.delete(listener);
        },
        publish(value) {
          current = value;
          for (const listener of [...listeners]) listener(value);
        },
      };
    })();
    const definition = mapDefinition({
      signal: new AbortController().signal,
      viewport,
      content: {
        async record(namespace, key) {
          const id = `${namespace}/${key}`;
          reads.push(id);
          if (gates[id]) await gates[id];
          const value = records[id];
          if (value === undefined) throw new TypeError(`missing ${id}`);
          return { value, contentVersion: "v-record" };
        },
        async resource(_namespace, key) {
          reads.push(`resource:${key}`);
          return { bytes: new Uint8Array([1]), mime: "image/png", contentVersion: "v-image" };
        },
      },
      createInputListener({ channels }) {
        assert.deepEqual([...channels], ["keyboard.event", "keyboard.state"]);
        return {
          on(channel, handler) {
            handlers.set(channel, handler);
            if (channel === "keyboard.state" && options.baseline) handler(options.baseline);
            return () => {};
          },
          setChannels() {},
          close() { listenerClosed = true; },
        };
      },
      createRenderDomain(initial) {
        states.push(structuredClone(initial));
        const handle = renderHandle(states, () => { domainClosed = true; }, updates, replaces);
        if (options.throwOnUpdate) {
          const apply = handle.update;
          handle.update = (delta) => {
            const blocked = typeof options.throwOnUpdate === "function" ? options.throwOnUpdate() : true;
            if (blocked) throw new TypeError("injected author failure");
            apply(delta);
          };
        }
        if (options.throwOnReplace) {
          handle.replace = () => { throw new TypeError("injected author failure"); };
        }
        return handle;
      },
    });
    const controller = new AbortController();
    const pending = definition.frame({
      id: "f",
      params: { mapId: 1, x: 10, y: 8, characterName: "m14_player", ...options.params },
      signal: controller.signal,
      async call() { throw new Error("unused"); },
    });
    if (options.expectActivationFailure) {
      return { pending, reads, states, updates, replaces, listenerClosed: () => listenerClosed, domainClosed: () => domainClosed };
    }
    const ready = async () => {
      for (let attempt = 0; attempt < 40 && (states.length === 0 || !handlers.has("keyboard.event") || !handlers.has("keyboard.state")); attempt += 1) {
        await new Promise((resolve) => setImmediate(resolve));
      }
      assert.ok(states.length >= 1, "expected initial standing RenderDomain");
    };
    const attached = {
      emitEvent(payload) { return handlers.get("keyboard.event")(payload); },
      emitState(payload) { return handlers.get("keyboard.state")(payload); },
      states,
      updates,
      replaces,
      reads,
      latestState: () => states.at(-1),
      abort() { controller.abort(); },
      pending,
      viewport,
      fireNextTimer: timers.fireNextTimer,
      fireTimer: timers.fireTimer,
      lastCallback: timers.lastCallback,
      queued: timers.queued,
      listenerClosed: () => listenerClosed,
      domainClosed: () => domainClosed,
      ready,
    };
    if (options.attachOnly) return attached;
    await ready();
    return attached;
  }

  const down = (code) => ({ action: "down", code, repeat: false });
  const up = (code) => ({ action: "up", code, repeat: false });

  test("step start commits target tile, walking pattern and shared motion ids", async (t) => {
    const frame = await startFrame(t);
    assert.equal(player(frame.latestState()).pattern, 0);
    assert.equal(player(frame.latestState()).motion, null);
    await frame.emitEvent(down("ArrowRight"));
    const walked = frame.latestState();
    assert.deepEqual(player(walked), {
      sceneEpoch: 1, visualEpoch: 1, motionId: 1,
      x: 11, y: 8, screenX: 304, screenY: 224, direction: 6, pattern: 1,
      sprite: { namespace: "resource.Graphics", key: "Characters/m14_player", contentVersion: "v-image" },
      motion: { id: 1, durationMs: 250, fromY: 8, fromScreenX: 304, fromScreenY: 224 },
    });
    assert.equal(view(walked).cameraX, 48);
    assert.deepEqual(view(walked).cameraMotion, { id: 1, durationMs: 250, fromCameraX: 16, fromCameraY: 32 });
    assert.equal(player(walked).motion.id, view(walked).cameraMotion.id);
    frame.abort();
    assert.deepEqual(await frame.pending, { type: "cancelled" });
  });

  test("camera and screen formulas use source camera for fromScreen values", async (t) => {
    const frame = await startFrame(t);
    await frame.emitEvent(down("ArrowDown"));
    const walked = frame.latestState();
    assert.equal(player(walked).x, 10);
    assert.equal(player(walked).y, 9);
    assert.equal(player(walked).motion.fromScreenX, 10 * 32 - 16);
    assert.equal(player(walked).motion.fromScreenY, 8 * 32 - 32);
    assert.equal(player(walked).screenX, 10 * 32 - 16);
    assert.equal(player(walked).screenY, 9 * 32 - 64);
    assert.equal(view(walked).cameraY, 64);
    assert.equal(view(walked).cameraMotion.fromCameraY, 32);
    frame.abort();
    await frame.pending;
  });

  test("collision resets to standing pattern 0 without changing x/y", async (t) => {
    const frame = await startFrame(t);
    await frame.emitEvent(down("ArrowRight"));
    frame.fireNextTimer();
    const blocked = frame.latestState();
    assert.equal(player(blocked).x, 11);
    assert.equal(player(blocked).direction, 6);
    assert.equal(player(blocked).pattern, 0);
    assert.equal(player(blocked).motion, null);
    assert.equal(view(blocked).cameraMotion, null);
    await frame.emitEvent(down("ArrowDown"));
    assert.equal(player(frame.latestState()).pattern, 1);
    frame.abort();
    await frame.pending;
  });

  test("keyup does not cancel the current step", async (t) => {
    const frame = await startFrame(t);
    await frame.emitEvent(down("ArrowRight"));
    const walking = frame.states.length;
    await frame.emitEvent(up("ArrowRight"));
    assert.equal(frame.states.length, walking);
    assert.equal(player(frame.latestState()).motion.id, 1);
    assert.equal(player(frame.latestState()).x, 11);
    frame.abort();
    await frame.pending;
  });

  test("keyup then empty state does not walk an extra tile", async (t) => {
    const frame = await startFrame(t);
    await frame.emitEvent(down("ArrowRight"));
    await frame.emitEvent(up("ArrowRight"));
    await frame.emitState({ down: [] });
    frame.fireNextTimer();
    assert.equal(player(frame.latestState()).x, 11);
    assert.equal(player(frame.latestState()).pattern, 0);
    assert.equal(player(frame.latestState()).motion, null);
    assert.equal(frame.queued.length, 0);
    frame.abort();
    await frame.pending;
  });

  test("walking input only updates intent until the completion boundary", async (t) => {
    const frame = await startFrame(t);
    await frame.emitEvent(down("ArrowDown"));
    const walkingStates = frame.states.length;
    await frame.emitEvent(down("ArrowRight"));
    assert.equal(frame.states.length, walkingStates);
    assert.equal(player(frame.latestState()).direction, 2);
    assert.equal(player(frame.latestState()).y, 9);
    frame.fireNextTimer();
    assert.equal(player(frame.latestState()).direction, 6);
    assert.equal(player(frame.latestState()).x, 11);
    assert.equal(player(frame.latestState()).y, 9);
    frame.abort();
    await frame.pending;
  });

  test("completion turns to the held tail and four steps alternate 1/3/1/3", async (t) => {
    const frame = await startFrame(t);
    await frame.emitEvent(down("ArrowDown"));
    const patterns = [player(frame.latestState()).pattern];
    for (let step = 0; step < 3; step += 1) {
      frame.fireNextTimer();
      patterns.push(player(frame.latestState()).pattern);
    }
    assert.deepEqual(patterns, [1, 3, 1, 3]);
    await frame.emitEvent(up("ArrowDown"));
    frame.fireNextTimer();
    assert.equal(player(frame.latestState()).pattern, 0);
    assert.equal(player(frame.latestState()).motion, null);
    assert.equal(player(frame.latestState()).y, 12);
    frame.abort();
    await frame.pending;
  });

  test("stale step callback is ignored", async (t) => {
    const frame = await startFrame(t);
    await frame.emitEvent(down("ArrowRight"));
    await frame.emitEvent(up("ArrowRight"));
    const stale = frame.lastCallback();
    frame.fireNextTimer();
    const count = frame.states.length;
    stale();
    assert.equal(frame.states.length, count);
    assert.equal(player(frame.latestState()).pattern, 0);
    frame.abort();
    await frame.pending;
  });

  test("abort clears the step timer and rejects a late callback", async (t) => {
    const frame = await startFrame(t);
    await frame.emitEvent(down("ArrowRight"));
    const late = frame.lastCallback();
    frame.abort();
    assert.deepEqual(await frame.pending, { type: "cancelled" });
    assert.equal(frame.listenerClosed(), true);
    assert.equal(frame.domainClosed(), true);
    const count = frame.states.length;
    late();
    assert.equal(frame.states.length, count);
  });

  test("held precedence follows keydown order then keyup tail", async (t) => {
    const frame = await startFrame(t);
    await frame.emitEvent(down("ArrowDown"));
    assert.equal(player(frame.latestState()).direction, 2);
    await frame.emitEvent(down("ArrowRight"));
    frame.fireNextTimer();
    assert.equal(player(frame.latestState()).direction, 6);
    await frame.emitEvent(up("ArrowRight"));
    frame.fireNextTimer();
    assert.equal(player(frame.latestState()).direction, 2);
    await frame.emitEvent(down("ArrowLeft"));
    frame.fireNextTimer();
    assert.equal(player(frame.latestState()).direction, 4);
    await frame.emitEvent(up("ArrowLeft"));
    frame.fireNextTimer();
    assert.equal(player(frame.latestState()).direction, 2);
    await frame.emitEvent(up("ArrowDown"));
    frame.fireNextTimer();
    assert.equal(player(frame.latestState()).pattern, 0);
    assert.equal(player(frame.latestState()).motion, null);
    frame.abort();
    await frame.pending;
  });

  test("retained keyboard.state baseline uses fallback order and can start after domain exists", async (t) => {
    const frame = await startFrame(t, { baseline: { down: ["ArrowRight", "ArrowDown"] } });
    assert.ok(frame.states.length >= 2);
    const walked = frame.latestState();
    assert.equal(player(walked).direction, 6);
    assert.equal(player(walked).x, 11);
    assert.equal(player(walked).pattern, 1);
    assert.equal(player(walked).motion.id, view(walked).cameraMotion.id);
    frame.abort();
    await frame.pending;
  });

  test("one long-lived Frame accepts one move and one persisted reverse-entry block", async (t) => {
    const frame = await startFrame(t);
    assert.equal(frame.states.length, 1);
    await frame.emitEvent(down("ArrowRight"));
    assert.equal(player(frame.latestState()).x, 11);
    assert.equal(view(frame.latestState()).cameraX, 48);
    await frame.emitEvent(down("ArrowRight"));
    assert.equal(player(frame.latestState()).x, 11);
    assert.equal(player(frame.latestState()).direction, 6);
    frame.fireNextTimer();
    assert.equal(player(frame.latestState()).x, 11);
    assert.equal(player(frame.latestState()).pattern, 0);
    assert.equal(view(frame.latestState()).cameraX, 48);
    frame.abort();
    assert.deepEqual(await frame.pending, { type: "cancelled" });
    assert.equal(frame.listenerClosed(), true);
    assert.equal(frame.domainClosed(), true);
  });

  test("ordinary walking updates player/camera without replacing chunks identity", async (t) => {
    const frame = await startFrame(t);
    const spawnChunks = view(frame.latestState()).chunks;
    await frame.emitEvent(down("ArrowRight"));
    const lastUpdate = frame.updates.at(-1);
    assert.ok(lastUpdate, "expected RenderDomain.update after walking");
    assert.equal("chunks" in viewportSet(lastUpdate), false);
    assert.equal("cameraX" in viewportSet(lastUpdate), true);
    assert.equal("x" in playerSet(lastUpdate), true);
    assert.equal(frame.replaces.length, 0);
    assert.deepEqual(view(frame.latestState()).chunks, spawnChunks);
    assert.equal(player(frame.latestState()).x, 11);
    assert.equal(player(frame.latestState()).motion.id, 1);
    frame.abort();
    await frame.pending;
  });

  test("standing spawn window uses one-chunk overscan and walking stays inside it", async (t) => {
    const frame = await startFrame(t);
    const { map: raw, tileset: rawTileset } = fixture();
    const map = validateMapRecord(raw);
    const tileset = validateTilesetRecord(rawTileset, 1);
    const camera = computeCamera(map, 10, 8);
    const required = viewportTileBounds(map, camera.cameraX, camera.cameraY);
    const expected = projectChunkWindow(map, tileset, required);
    const spawnChunks = view(frame.latestState()).chunks;
    assert.equal(spawnChunks.length, expected.chunks.length);
    await frame.emitEvent(down("ArrowRight"));
    assert.equal("chunks" in viewportSet(frame.updates.at(-1)), false);
    frame.abort();
    await frame.pending;
  });

  test("update author failure does not install candidate movement", async (t) => {
    const frame = await startFrame(t, { throwOnUpdate: true });
    const before = frame.latestState();
    assert.throws(() => frame.emitEvent(down("ArrowRight")), /injected author failure/);
    assert.equal(frame.states.length, 1);
    assert.equal(player(frame.latestState()).x, player(before).x);
    assert.equal(player(frame.latestState()).motion, null);
    assert.equal(frame.updates.length, 0);
    frame.abort();
    await frame.pending;
  });

  test("collision uses replace rather than update", async (t) => {
    const frame = await startFrame(t);
    await frame.emitEvent(down("ArrowRight"));
    const updatesBefore = frame.updates.length;
    const replacesBefore = frame.replaces.length;
    frame.fireNextTimer();
    assert.equal(player(frame.latestState()).x, 11);
    assert.equal(player(frame.latestState()).motion, null);
    assert.ok(frame.replaces.length > replacesBefore);
    assert.equal(frame.updates.length, updatesBefore);
    frame.abort();
    await frame.pending;
  });

  test("window refresh includes chunks exactly once when coverage is insufficient", async (t) => {
    const wide = wideMap();
    const frame = await startFrame(t, {
      params: { x: 8, y: 8 },
      records: {
        "struct.Map/1": wide.map,
        "struct.Tileset/1": wide.tileset,
      },
    });
    const spawnMaxX = Math.max(...view(frame.latestState()).chunks.map((chunk) => chunk.chunkX));
    await frame.emitEvent(down("ArrowRight"));
    for (let step = 0; step < 16; step += 1) frame.fireNextTimer();
    const refreshUpdates = frame.updates.filter((update) => "chunks" in viewportSet(update));
    assert.ok(refreshUpdates.length >= 1, "expected a chunks refresh update");
    const latestRefresh = refreshUpdates.at(-1);
    assert.ok(Math.max(...viewportSet(latestRefresh).chunks.map((chunk) => chunk.chunkX)) > spawnMaxX);
    frame.abort();
    await frame.pending;
  });

  test("projection window uses exact one-chunk overscan under Map-owned budget", async (t) => {
    const filled = autotileFilledMap();
    const frame = await startFrame(t, {
      records: {
        "struct.Map/1": filled.map,
        "struct.Tileset/1": filled.tileset,
      },
    });
    const map = validateMapRecord(filled.map);
    const tileset = validateTilesetRecord(filled.tileset, 1);
    const camera = computeCamera(map, 10, 8);
    const required = viewportTileBounds(map, camera.cameraX, camera.cameraY);
    const expected = projectChunkWindow(map, tileset, required);
    assert.deepEqual(view(frame.latestState()).chunks, expected.chunks);
    frame.abort();
    await frame.pending;
  });

  test("projection budget exceeded fails activation before Domain create", async (t) => {
    const filled = autotileFilledMap({ name: "x".repeat(30_000) });
    const frame = await startFrame(t, {
      expectActivationFailure: true,
      records: {
        "struct.Map/1": filled.map,
        "struct.Tileset/1": filled.tileset,
      },
    });
    const outcome = await frame.pending;
    assert.equal(outcome.type, "failed");
    assert.equal(outcome.error.code, "MAP_ACTIVATION_FAILED");
    assert.match(outcome.error.message, /Map projection budget exceeded/);
    assert.equal(frame.states.length, 0);
  });

  test("null Core viewport keeps Frozen 640 and same-size samples do not update", async (t) => {
    const frame = await startFrame(t);
    assert.deepEqual([view(frame.latestState()).viewportWidth, view(frame.latestState()).viewportHeight], [640, 480]);
    const updates = frame.updates.length;
    frame.viewport.publish(null);
    frame.viewport.publish({ width: 640, height: 480 });
    assert.equal(frame.updates.length, updates);
    frame.abort();
    await frame.pending;
  });

  test("first legal different viewport commits immediately and later bursts settle at 100ms", async (t) => {
    const frame = await startFrame(t);
    const spawnVisual = view(frame.latestState()).visualEpoch;
    frame.viewport.publish({ width: 1280, height: 720 });
    const first = view(frame.latestState());
    assert.equal(first.visualEpoch, spawnVisual + 1);
    assert.deepEqual([first.viewportWidth, first.viewportHeight], [1280, 720]);
    assert.equal(player(frame.latestState()).motionId, null);
    assertPairedTokens(frame.latestState());
    frame.viewport.publish({ width: 1920, height: 1080 });
    assert.equal(view(frame.latestState()).viewportWidth, 1280);
    frame.fireTimer(100);
    const settled = view(frame.latestState());
    assert.equal(settled.viewportWidth, 1920);
    assert.equal(settled.viewportHeight, 1080);
    assert.equal(settled.visualEpoch, first.visualEpoch + 1);
    assertPairedTokens(frame.latestState());
    frame.abort();
    await frame.pending;
  });

  test("viewport samples clamp to 320x240 and 1920x1080", async (t) => {
    const frame = await startFrame(t);
    frame.viewport.publish({ width: 10, height: 10 });
    assert.deepEqual([view(frame.latestState()).viewportWidth, view(frame.latestState()).viewportHeight], [320, 240]);
    frame.viewport.publish({ width: 4000, height: 4000 });
    frame.fireTimer(100);
    assert.deepEqual([view(frame.latestState()).viewportWidth, view(frame.latestState()).viewportHeight], [1920, 1080]);
    frame.abort();
    await frame.pending;
  });

  test("active step stores latest pending viewport until the completion boundary", async (t) => {
    const frame = await startFrame(t);
    await frame.emitEvent(down("ArrowRight"));
    const walking = view(frame.latestState());
    assert.equal(walking.motionId, 1);
    frame.viewport.publish({ width: 1280, height: 720 });
    assert.equal(view(frame.latestState()).viewportWidth, 640);
    await frame.emitEvent(up("ArrowRight"));
    frame.fireNextTimer();
    const after = view(frame.latestState());
    const afterPlayer = player(frame.latestState());
    assert.equal(after.viewportWidth, 1280);
    assert.equal(after.viewportHeight, 720);
    assert.equal(afterPlayer.motionId, null);
    assert.equal(after.motionId, null);
    assertPairedTokens(frame.latestState());
    const { map: raw } = fixture();
    const camera = computeCamera(validateMapRecord(raw), 11, 8, { width: 1280, height: 720 });
    assert.equal(after.cameraX, camera.cameraX);
    assert.equal(after.cameraY, camera.cameraY);
    assert.equal(afterPlayer.screenX, 11 * 32 - camera.cameraX);
    assert.equal(afterPlayer.screenY, 8 * 32 - camera.cameraY);
    frame.abort();
    await frame.pending;
  });

  test("active step coalesces A/B/C resize burst to latest pending only", async (t) => {
    const frame = await startFrame(t);
    await frame.emitEvent(down("ArrowRight"));
    assert.equal(view(frame.latestState()).motionId, 1);
    const walkingVisual = view(frame.latestState()).visualEpoch;
    frame.viewport.publish({ width: 800, height: 600 });
    frame.viewport.publish({ width: 1280, height: 720 });
    frame.viewport.publish({ width: 1920, height: 1080 });
    assert.equal(view(frame.latestState()).viewportWidth, 640);
    assert.equal(view(frame.latestState()).visualEpoch, walkingVisual);
    assert.equal(player(frame.latestState()).motionId, 1);
    await frame.emitEvent(up("ArrowRight"));
    frame.fireNextTimer();
    const after = view(frame.latestState());
    assert.equal(after.viewportWidth, 1920);
    assert.equal(after.viewportHeight, 1080);
    assert.equal(after.visualEpoch, walkingVisual + 1);
    assert.equal(player(frame.latestState()).motionId, null);
    assertPairedTokens(frame.latestState());
    const publishedWidths = frame.updates
      .map((update) => viewportSet(update).viewportWidth)
      .filter((width) => width !== undefined);
    assert.deepEqual(publishedWidths, [1920]);
    frame.abort();
    await frame.pending;
  });

  test("viewport resize author failure does not mutate accepted viewport or epochs", async (t) => {
    const frame = await startFrame(t, { throwOnUpdate: true });
    const before = view(frame.latestState());
    frame.viewport.publish({ width: 1280, height: 720 });
    assert.equal(view(frame.latestState()).viewportWidth, 640);
    assert.equal(view(frame.latestState()).viewportHeight, 480);
    assert.equal(view(frame.latestState()).visualEpoch, before.visualEpoch);
    assert.equal(player(frame.latestState()).motionId, null);
    assert.equal(frame.updates.length, 0);
    assert.equal(frame.queued.filter((item) => item.delay === 100).length, 0);
    frame.abort();
    await frame.pending;
  });

  test("A to B to A within 100ms cancels pending B and never commits it", async (t) => {
    const frame = await startFrame(t);
    frame.viewport.publish({ width: 1280, height: 720 });
    const accepted = view(frame.latestState());
    assert.deepEqual([accepted.viewportWidth, accepted.viewportHeight], [1280, 720]);
    frame.viewport.publish({ width: 1920, height: 1080 });
    assert.equal(view(frame.latestState()).viewportWidth, 1280);
    assert.equal(frame.queued.filter((item) => item.delay === 100).length, 1);
    frame.viewport.publish({ width: 1280, height: 720 });
    assert.equal(frame.queued.filter((item) => item.delay === 100).length, 0);
    assert.equal(view(frame.latestState()).viewportWidth, 1280);
    assert.equal(view(frame.latestState()).visualEpoch, accepted.visualEpoch);
    assertPairedTokens(frame.latestState());
    frame.abort();
    await frame.pending;
  });

  test("standing A to B to C coalesces to trailing latest after 100ms", async (t) => {
    const frame = await startFrame(t);
    frame.viewport.publish({ width: 800, height: 600 });
    assert.deepEqual([view(frame.latestState()).viewportWidth, view(frame.latestState()).viewportHeight], [800, 600]);
    const firstVisual = view(frame.latestState()).visualEpoch;
    frame.viewport.publish({ width: 1280, height: 720 });
    frame.viewport.publish({ width: 1920, height: 1080 });
    assert.equal(view(frame.latestState()).viewportWidth, 800);
    frame.fireTimer(100);
    const settled = view(frame.latestState());
    assert.deepEqual([settled.viewportWidth, settled.viewportHeight], [1920, 1080]);
    assert.equal(settled.visualEpoch, firstVisual + 1);
    assertPairedTokens(frame.latestState());
    frame.abort();
    await frame.pending;
  });

  test("mid-step A to B to A does not commit B at the step boundary", async (t) => {
    const frame = await startFrame(t);
    await frame.emitEvent(down("ArrowRight"));
    const walkingVisual = view(frame.latestState()).visualEpoch;
    frame.viewport.publish({ width: 1280, height: 720 });
    frame.viewport.publish({ width: 640, height: 480 });
    await frame.emitEvent(up("ArrowRight"));
    frame.fireNextTimer();
    const after = view(frame.latestState());
    assert.equal(after.viewportWidth, 640);
    assert.equal(after.viewportHeight, 480);
    assert.equal(after.visualEpoch, walkingVisual);
    assert.equal(player(frame.latestState()).x, 11);
    assertPairedTokens(frame.latestState());
    frame.abort();
    await frame.pending;
  });

  test("initial current viewport is used at spawn and matching subscribe is a no-op", async (t) => {
    const frame = await startFrame(t, { viewportCurrent: { width: 1280, height: 720 } });
    assert.deepEqual([view(frame.latestState()).viewportWidth, view(frame.latestState()).viewportHeight], [1280, 720]);
    assert.equal(frame.updates.length, 0);
    assert.equal(frame.states.length, 1);
    assertPairedTokens(frame.latestState());
    frame.abort();
    await frame.pending;
  });

  test("viewport that changes during load converges on subscribe", async (t) => {
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const frame = await startFrame(t, { attachOnly: true, gates: { "struct.Map/1": gate } });
    frame.viewport.publish({ width: 1280, height: 720 });
    release();
    await frame.ready();
    assert.deepEqual([view(frame.latestState()).viewportWidth, view(frame.latestState()).viewportHeight], [1280, 720]);
    assertPairedTokens(frame.latestState());
    frame.abort();
    await frame.pending;
  });

  test("NaN viewport samples do not start a projection", async (t) => {
    const frame = await startFrame(t);
    const updates = frame.updates.length;
    frame.viewport.publish({ width: Number.NaN, height: Number.NaN });
    assert.equal(frame.updates.length, updates);
    assert.deepEqual([view(frame.latestState()).viewportWidth, view(frame.latestState()).viewportHeight], [640, 480]);
    frame.abort();
    await frame.pending;
  });

  test("late resize timer after abort does not mutate a closed Frame", async (t) => {
    const frame = await startFrame(t);
    frame.viewport.publish({ width: 1280, height: 720 });
    frame.viewport.publish({ width: 1920, height: 1080 });
    const late = frame.lastCallback();
    frame.abort();
    await frame.pending;
    assert.doesNotThrow(() => late());
    assert.equal(view(frame.latestState()).viewportWidth, 1280);
    assert.equal(view(frame.latestState()).viewportHeight, 720);
  });

  test("failed resize can recover on a later sample without auto-retry", async (t) => {
    let fail = true;
    const frame = await startFrame(t, { throwOnUpdate: () => fail });
    const before = view(frame.latestState());
    frame.viewport.publish({ width: 1280, height: 720 });
    assert.equal(view(frame.latestState()).viewportWidth, 640);
    assert.equal(view(frame.latestState()).visualEpoch, before.visualEpoch);
    assert.equal(frame.queued.filter((item) => item.delay === 100).length, 0);
    fail = false;
    frame.viewport.publish({ width: 1280, height: 720 });
    assert.deepEqual([view(frame.latestState()).viewportWidth, view(frame.latestState()).viewportHeight], [1280, 720]);
    assert.equal(view(frame.latestState()).visualEpoch, before.visualEpoch + 1);
    assertPairedTokens(frame.latestState());
    frame.abort();
    await frame.pending;
  });
});

describe("map runtime transfer", { concurrency: false }, () => {
  function installTimers(t) {
    const realSetTimeout = globalThis.setTimeout;
    const realClearTimeout = globalThis.clearTimeout;
    const queued = [];
    let nextId = 1;
    let lastCallback = null;
    globalThis.setTimeout = (callback, delay) => {
      if (delay !== 250 && delay !== 100) return realSetTimeout(callback, delay);
      const id = nextId;
      nextId += 1;
      lastCallback = callback;
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
      queued,
      lastCallback: () => lastCallback,
      fireNextTimer() {
        const item = queued.shift();
        assert.ok(item, "expected a pending 250ms step timer");
        item.callback();
      },
      fireTimer(delay) {
        const index = queued.findIndex((item) => item.delay === delay);
        assert.ok(index >= 0, `expected a pending ${delay}ms timer`);
        const [item] = queued.splice(index, 1);
        item.callback();
      },
    };
  }

  async function startFrame(t, options = {}) {
    const { map, tileset } = fixture();
    const extra = secondMap();
    const records = {
      "struct.Map/1": map,
      "struct.Tileset/1": tileset,
      "struct.MapTransfer/1": emptyTransfer(1),
      "struct.Map/2": extra.map,
      "struct.Tileset/2": extra.tileset,
      "struct.MapTransfer/2": extra.transfer,
      ...options.records,
    };
    if (options.omitTransfer) delete records["struct.MapTransfer/1"];
    const gates = options.gates ?? {};
    const reads = [];
    const handlers = new Map();
    const states = [];
    const updates = [];
    const replaces = [];
    let listenerClosed = false;
    let domainClosed = false;
    const timers = installTimers(t);
    const viewport = options.viewport ?? (() => {
      let current = options.viewportCurrent ?? null;
      const listeners = new Set();
      return {
        get current() { return current; },
        subscribe(listener) {
          listeners.add(listener);
          listener(current);
          return () => listeners.delete(listener);
        },
        publish(value) {
          current = value;
          for (const listener of [...listeners]) listener(value);
        },
      };
    })();
    const definition = mapDefinition({
      signal: new AbortController().signal,
      viewport,
      content: {
        async record(namespace, key) {
          const id = `${namespace}/${key}`;
          reads.push(id);
          if (gates[id]) await gates[id];
          const value = records[id];
          if (value === undefined) throw new TypeError(`missing ${id}`);
          return { value, contentVersion: "v-record" };
        },
        async resource(_namespace, key) {
          reads.push(`resource:${key}`);
          return { bytes: new Uint8Array([1]), mime: "image/png", contentVersion: "v-image" };
        },
      },
      createInputListener({ channels }) {
        assert.deepEqual([...channels], ["keyboard.event", "keyboard.state"]);
        return {
          on(channel, handler) {
            handlers.set(channel, handler);
            if (channel === "keyboard.state" && options.baseline) handler(options.baseline);
            return () => {};
          },
          setChannels() {},
          close() { listenerClosed = true; },
        };
      },
      createRenderDomain(initial) {
        states.push(structuredClone(initial));
        const handle = renderHandle(states, () => { domainClosed = true; }, updates, replaces);
        if (options.throwOnUpdate) {
          handle.update = () => { throw new TypeError("injected author failure"); };
        }
        if (options.throwOnReplace) {
          handle.replace = () => { throw new TypeError("injected author failure"); };
        }
        return handle;
      },
    });
    const controller = new AbortController();
    const pending = definition.frame({
      id: "f",
      params: { mapId: 1, x: 10, y: 8, characterName: "m14_player", ...options.params },
      signal: controller.signal,
      async call() { throw new Error("unused"); },
    });
    if (options.expectActivationFailure) {
      return { pending, reads, states, updates, replaces, listenerClosed: () => listenerClosed, domainClosed: () => domainClosed };
    }
    for (let attempt = 0; attempt < 40 && (states.length === 0 || !handlers.has("keyboard.event") || !handlers.has("keyboard.state")); attempt += 1) {
      await new Promise((resolve) => setImmediate(resolve));
    }
    assert.ok(states.length >= 1, "expected initial standing RenderDomain");
    return {
      emitEvent(payload) { return handlers.get("keyboard.event")(payload); },
      emitState(payload) { return handlers.get("keyboard.state")(payload); },
      states,
      updates,
      replaces,
      reads,
      latestState: () => states.at(-1),
      abort() { controller.abort(); },
      pending,
      viewport,
      fireNextTimer: timers.fireNextTimer,
      fireTimer: timers.fireTimer,
      lastCallback: timers.lastCallback,
      queued: timers.queued,
      listenerClosed: () => listenerClosed,
      domainClosed: () => domainClosed,
    };
  }

  const down = (code) => ({ action: "down", code, repeat: false });
  const up = (code) => ({ action: "up", code, repeat: false });

  test("initial load reads Map then MapTransfer then Tileset", async (t) => {
    const frame = await startFrame(t);
    assert.deepEqual(frame.reads.slice(0, 4), [
      "struct.Map/1",
      "struct.MapTransfer/1",
      "struct.Tileset/1",
      "resource:Tilesets/m14_tileset",
    ]);
    assert.equal(view(frame.latestState()).mapId, 1);
    frame.abort();
    await frame.pending;
  });

  test("missing MapTransfer fails activation", async (t) => {
    const frame = await startFrame(t, { omitTransfer: true, expectActivationFailure: true });
    const outcome = await frame.pending;
    assert.equal(outcome.type, "failed");
    assert.equal(outcome.error.code, "MAP_ACTIVATION_FAILED");
    assert.equal(frame.states.length, 0);
  });

  test("step transfer fires after 250ms, not at step start", async (t) => {
    const frame = await startFrame(t, {
      records: {
        "struct.MapTransfer/1": {
          id: 1,
          steps: [{ x: 11, y: 8, targetMapId: 2, targetX: 4, targetY: 7, targetDirection: null }],
          contacts: [],
          edges: [],
        },
      },
    });
    await frame.emitEvent(down("ArrowRight"));
    assert.equal(view(frame.latestState()).mapId, 1);
    assert.equal(player(frame.latestState()).x, 11);
    assert.equal(player(frame.latestState()).pattern, 1);
    await frame.emitEvent(up("ArrowRight"));
    frame.fireNextTimer();
    await flush();
    assert.equal(view(frame.latestState()).mapId, 2);
    assert.equal(player(frame.latestState()).x, 4);
    assert.equal(player(frame.latestState()).y, 7);
    assert.equal(player(frame.latestState()).pattern, 0);
    assert.equal(player(frame.latestState()).motion, null);
    frame.abort();
    await frame.pending;
  });

  test("contact transfer precedes passable canMove", async (t) => {
    const frame = await startFrame(t, {
      params: { x: 11, y: 8 },
      records: {
        "struct.MapTransfer/1": {
          id: 1,
          steps: [],
          contacts: [{ x: 11, y: 8, direction: 6, targetMapId: 2, targetX: 4, targetY: 7, targetDirection: 8 }],
          edges: [],
        },
      },
    });
    await frame.emitEvent(down("ArrowRight"));
    await frame.emitEvent(up("ArrowRight"));
    await flush();
    assert.equal(view(frame.latestState()).mapId, 2);
    assert.equal(player(frame.latestState()).x, 4);
    assert.equal(player(frame.latestState()).direction, 8);
    frame.abort();
    await frame.pending;
  });

  test("edge hit transfers and edge miss stays blocked standing", async (t) => {
    const miss = await startFrame(t, { params: { x: 23, y: 8 } });
    await miss.emitEvent(down("ArrowRight"));
    assert.equal(view(miss.latestState()).mapId, 1);
    assert.equal(player(miss.latestState()).x, 23);
    assert.equal(player(miss.latestState()).pattern, 0);
    assert.equal(player(miss.latestState()).motion, null);
    miss.abort();
    await miss.pending;

    const hit = await startFrame(t, {
      params: { x: 23, y: 8 },
      records: {
        "struct.MapTransfer/1": {
          id: 1,
          steps: [],
          contacts: [],
          edges: [{ x: 23, y: 8, direction: 6, targetMapId: 2, targetX: 0, targetY: 8 }],
        },
      },
    });
    await hit.emitEvent(down("ArrowRight"));
    await hit.emitEvent(up("ArrowRight"));
    await flush();
    assert.equal(view(hit.latestState()).mapId, 2);
    assert.equal(player(hit.latestState()).x, 0);
    assert.equal(player(hit.latestState()).y, 8);
    assert.equal(player(hit.latestState()).direction, 6);
    hit.abort();
    await hit.pending;
  });

  test("source standing is painted before a delayed target load", async (t) => {
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const frame = await startFrame(t, {
      gates: { "struct.Map/2": gate },
      records: {
        "struct.MapTransfer/1": {
          id: 1,
          steps: [],
          contacts: [{ x: 10, y: 8, direction: 8, targetMapId: 2, targetX: 4, targetY: 7, targetDirection: 8 }],
          edges: [],
        },
      },
    });
    await frame.emitEvent(down("ArrowUp"));
    assert.equal(view(frame.latestState()).mapId, 1);
    assert.equal(player(frame.latestState()).x, 10);
    assert.equal(player(frame.latestState()).y, 8);
    assert.equal(player(frame.latestState()).pattern, 0);
    assert.equal(player(frame.latestState()).motion, null);
    assert.equal(view(frame.latestState()).cameraMotion, null);
    await frame.emitEvent(up("ArrowUp"));
    release();
    await flush();
    assert.equal(view(frame.latestState()).mapId, 2);
    assert.equal(player(frame.latestState()).x, 4);
    assert.equal(player(frame.latestState()).y, 7);
    frame.abort();
    await frame.pending;
  });

  test("target commit is atomic across map, tileset, position, and transfers", async (t) => {
    const frame = await startFrame(t, {
      records: {
        "struct.MapTransfer/1": {
          id: 1,
          steps: [],
          contacts: [{ x: 10, y: 8, direction: 6, targetMapId: 2, targetX: 5, targetY: 6, targetDirection: null }],
          edges: [],
        },
      },
    });
    await frame.emitEvent(down("ArrowRight"));
    await frame.emitEvent(up("ArrowRight"));
    await flush();
    const latest = frame.latestState();
    assert.equal(view(latest).mapId, 2);
    assert.equal(view(latest).tileset.key, "Tilesets/target_tileset");
    assert.equal(player(latest).x, 5);
    assert.equal(player(latest).y, 6);
    assert.equal(player(latest).direction, 6);
    assert.equal(player(latest).pattern, 0);
    frame.abort();
    await frame.pending;
  });

  test("contact can retain or replace facing; edges keep attempted direction", async (t) => {
    const retained = await startFrame(t, {
      records: {
        "struct.MapTransfer/1": {
          id: 1,
          steps: [],
          contacts: [{ x: 10, y: 8, direction: 4, targetMapId: 2, targetX: 4, targetY: 7, targetDirection: null }],
          edges: [],
        },
      },
    });
    await retained.emitEvent(down("ArrowLeft"));
    await retained.emitEvent(up("ArrowLeft"));
    await flush();
    assert.equal(player(retained.latestState()).direction, 4);
    retained.abort();
    await retained.pending;

    const turned = await startFrame(t, {
      records: {
        "struct.MapTransfer/1": {
          id: 1,
          steps: [],
          contacts: [{ x: 10, y: 8, direction: 4, targetMapId: 2, targetX: 4, targetY: 7, targetDirection: 8 }],
          edges: [],
        },
      },
    });
    await turned.emitEvent(down("ArrowLeft"));
    await turned.emitEvent(up("ArrowLeft"));
    await flush();
    assert.equal(player(turned.latestState()).direction, 8);
    turned.abort();
    await turned.pending;
  });

  test("held input continues walking on the target map", async (t) => {
    const frame = await startFrame(t, {
      records: {
        "struct.MapTransfer/1": {
          id: 1,
          steps: [],
          contacts: [{ x: 10, y: 8, direction: 6, targetMapId: 2, targetX: 4, targetY: 7, targetDirection: null }],
          edges: [],
        },
      },
    });
    await frame.emitEvent(down("ArrowRight"));
    await flush();
    assert.equal(view(frame.latestState()).mapId, 2);
    assert.equal(player(frame.latestState()).x, 5);
    assert.equal(player(frame.latestState()).y, 7);
    assert.equal(player(frame.latestState()).pattern, 1);
    frame.abort();
    await frame.pending;
  });

  test("a second transfer cannot start while transitioning", async (t) => {
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const frame = await startFrame(t, {
      gates: { "struct.Map/2": gate },
      records: {
        "struct.MapTransfer/1": {
          id: 1,
          steps: [],
          contacts: [
            { x: 10, y: 8, direction: 8, targetMapId: 2, targetX: 4, targetY: 7, targetDirection: 8 },
            { x: 10, y: 8, direction: 2, targetMapId: 2, targetX: 8, targetY: 8, targetDirection: 2 },
          ],
          edges: [],
        },
      },
    });
    await frame.emitEvent(down("ArrowUp"));
    const count = frame.states.length;
    await frame.emitEvent(down("ArrowDown"));
    assert.equal(frame.states.length, count);
    assert.equal(view(frame.latestState()).mapId, 1);
    await frame.emitEvent(up("ArrowUp"));
    await frame.emitEvent(up("ArrowDown"));
    release();
    await flush();
    assert.equal(view(frame.latestState()).mapId, 2);
    assert.equal(player(frame.latestState()).x, 4);
    assert.equal(player(frame.latestState()).y, 7);
    frame.abort();
    await frame.pending;
  });

  test("transfer failure settles MAP_TRANSFER_FAILED", async (t) => {
    const frame = await startFrame(t, {
      records: {
        "struct.MapTransfer/1": {
          id: 1,
          steps: [],
          contacts: [{ x: 10, y: 8, direction: 8, targetMapId: 2, targetX: 4, targetY: 7, targetDirection: 8 }],
          edges: [],
        },
        "struct.MapTransfer/2": undefined,
      },
    });
    await frame.emitEvent(down("ArrowUp"));
    const outcome = await frame.pending;
    assert.equal(outcome.type, "failed");
    assert.equal(outcome.error.code, "MAP_TRANSFER_FAILED");
    assert.equal(frame.domainClosed(), true);
  });

  test("abort wins over a late target load and does not replace a closed domain", async (t) => {
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const frame = await startFrame(t, {
      gates: { "struct.Map/2": gate },
      records: {
        "struct.MapTransfer/1": {
          id: 1,
          steps: [],
          contacts: [{ x: 10, y: 8, direction: 8, targetMapId: 2, targetX: 4, targetY: 7, targetDirection: 8 }],
          edges: [],
        },
      },
    });
    await frame.emitEvent(down("ArrowUp"));
    frame.abort();
    assert.deepEqual(await frame.pending, { type: "cancelled" });
    assert.equal(frame.domainClosed(), true);
    const count = frame.states.length;
    release();
    await flush();
    assert.equal(frame.states.length, count);
    assert.equal(view(frame.latestState()).mapId, 1);
  });

  test("contact A to B to A keeps one Frame", async (t) => {
    const frame = await startFrame(t, {
      params: { x: 12, y: 8 },
      records: {
        "struct.MapTransfer/1": {
          id: 1,
          steps: [],
          contacts: [{ x: 12, y: 8, direction: 8, targetMapId: 2, targetX: 4, targetY: 7, targetDirection: 8 }],
          edges: [],
        },
        "struct.MapTransfer/2": {
          id: 2,
          steps: [],
          contacts: [{ x: 4, y: 7, direction: 2, targetMapId: 1, targetX: 12, targetY: 7, targetDirection: null }],
          edges: [],
        },
      },
    });
    await frame.emitEvent(down("ArrowUp"));
    await frame.emitEvent(up("ArrowUp"));
    await flush();
    assert.equal(view(frame.latestState()).mapId, 2);
    assert.equal(player(frame.latestState()).x, 4);
    assert.equal(player(frame.latestState()).y, 7);
    assert.equal(player(frame.latestState()).direction, 8);
    await frame.emitEvent(down("ArrowDown"));
    await frame.emitEvent(up("ArrowDown"));
    await flush();
    assert.equal(view(frame.latestState()).mapId, 1);
    assert.equal(player(frame.latestState()).x, 12);
    assert.equal(player(frame.latestState()).y, 7);
    assert.equal(player(frame.latestState()).direction, 2);
    frame.abort();
    await frame.pending;
  });

  test("replace author failure during transfer keeps the old map", async (t) => {
    const frame = await startFrame(t, {
      throwOnReplace: true,
      records: {
        "struct.MapTransfer/1": {
          id: 1,
          steps: [],
          contacts: [{ x: 10, y: 8, direction: 6, targetMapId: 2, targetX: 4, targetY: 7, targetDirection: null }],
          edges: [],
        },
      },
    });
    await frame.emitEvent(down("ArrowRight"));
    await flush();
    const outcome = await Promise.race([
      frame.pending,
      new Promise((resolve) => setTimeout(() => resolve("still-open"), 50)),
    ]);
    if (outcome !== "still-open") {
      assert.equal(outcome.type, "failed");
      assert.equal(outcome.error.code, "MAP_TRANSFER_FAILED");
    }
    assert.equal(view(frame.latestState()).mapId, 1);
    assert.equal(player(frame.latestState()).x, 10);
    if (outcome === "still-open") {
      frame.abort();
      await frame.pending;
    }
  });

  test("successful transfer replace installs a fresh target window", async (t) => {
    const frame = await startFrame(t, {
      records: {
        "struct.MapTransfer/1": {
          id: 1,
          steps: [],
          contacts: [{ x: 10, y: 8, direction: 6, targetMapId: 2, targetX: 4, targetY: 7, targetDirection: null }],
          edges: [],
        },
      },
    });
    const spawnMapId = view(frame.latestState()).mapId;
    await frame.emitEvent(down("ArrowRight"));
    await flush();
    assert.equal(view(frame.latestState()).mapId, 2);
    assert.notEqual(view(frame.latestState()).mapId, spawnMapId);
    assert.ok(frame.replaces.length >= 1);
    assert.equal(view(frame.latestState()).tileset.key, "Tilesets/target_tileset");
    frame.abort();
    await frame.pending;
  });

  test("resize during transfer is applied on the successful target replace", async (t) => {
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const frame = await startFrame(t, {
      gates: { "struct.Map/2": gate },
      records: {
        "struct.MapTransfer/1": {
          id: 1,
          steps: [],
          contacts: [{ x: 10, y: 8, direction: 6, targetMapId: 2, targetX: 4, targetY: 7, targetDirection: null }],
          edges: [],
        },
      },
    });
    await frame.emitEvent(down("ArrowRight"));
    assert.equal(view(frame.latestState()).mapId, 1);
    assert.equal(view(frame.latestState()).viewportWidth, 640);
    frame.viewport.publish({ width: 1280, height: 720 });
    assert.equal(view(frame.latestState()).viewportWidth, 640);
    await frame.emitEvent(up("ArrowRight"));
    release();
    await flush();
    const latest = frame.latestState();
    assert.equal(view(latest).mapId, 2);
    assert.deepEqual([view(latest).viewportWidth, view(latest).viewportHeight], [1280, 720]);
    assert.equal(player(latest).x, 4);
    assert.equal(player(latest).y, 7);
    assertPairedTokens(latest);
    frame.abort();
    await frame.pending;
  });
});
