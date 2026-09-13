import assert from "node:assert/strict";
import test, { describe } from "node:test";
import mapDefinition from "@loomrealm-game/map";

const table = (dimensions, xSize, ySize, zSize, values) => ({ dimensions, xSize, ySize, zSize, values });
function fixture() {
  const values = Array(24 * 18 * 3).fill(0);
  for (let y = 0; y < 18; y += 1) for (let x = 0; x < 24; x += 1) values[x + y * 24] = 384;
  values[12 + 8 * 24] = 385;
  const passages = Array(386).fill(0); passages[385] = 0x02;
  const priorities = Array(386).fill(0); priorities[0] = 5;
  return {
    map: { tileset_id: 1, width: 24, height: 18, data: table(3, 24, 18, 3, values) },
    tileset: { id: 1, tileset_name: "m14_tileset", passages: table(1, 386, 1, 1, passages), priorities: table(1, 386, 1, 1, priorities) },
  };
}

function player(state) { return state.roots[0].children[0].data; }
function view(state) { return state.roots[0].data; }

describe("map runtime walking", { concurrency: false }, () => {
  function installTimers(t) {
    const realSetTimeout = globalThis.setTimeout;
    const realClearTimeout = globalThis.clearTimeout;
    const queued = [];
    let nextId = 1;
    let lastCallback = null;
    globalThis.setTimeout = (callback, delay) => {
      assert.equal(delay, 250);
      const id = nextId;
      nextId += 1;
      lastCallback = callback;
      queued.push({ id, callback });
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
    };
  }

  async function startFrame(t, { baseline } = {}) {
    const { map, tileset } = fixture();
    const records = { "struct.Map/1": map, "struct.Tileset/1": tileset };
    const handlers = new Map();
    const states = [];
    let listenerClosed = false;
    let domainClosed = false;
    const timers = installTimers(t);
    const definition = mapDefinition({
      signal: new AbortController().signal,
      content: {
        async record(namespace, key) { return { value: records[`${namespace}/${key}`], contentVersion: "v-record" }; },
        async resource() { return { bytes: new Uint8Array([1]), mime: "image/png", contentVersion: "v-image" }; },
      },
      createInputListener({ channels }) {
        assert.deepEqual([...channels], ["keyboard.event", "keyboard.state"]);
        return {
          on(channel, handler) {
            handlers.set(channel, handler);
            if (channel === "keyboard.state" && baseline) handler(baseline);
            return () => {};
          },
          setChannels() {},
          close() { listenerClosed = true; },
        };
      },
      createRenderDomain(initial) {
        states.push(structuredClone(initial));
        return { replace(state) { states.push(structuredClone(state)); }, emit() {}, close() { domainClosed = true; } };
      },
    });
    const controller = new AbortController();
    const pending = definition.frame({
      id: "f",
      params: { mapId: 1, x: 10, y: 8, characterName: "m14_player" },
      signal: controller.signal,
      async call() { throw new Error("unused"); },
    });
    for (let attempt = 0; attempt < 40 && (states.length === 0 || !handlers.has("keyboard.event") || !handlers.has("keyboard.state")); attempt += 1) {
      await new Promise((resolve) => setImmediate(resolve));
    }
    assert.ok(states.length >= 1, "expected initial standing RenderDomain");
    return {
      emitEvent(payload) { return handlers.get("keyboard.event")(payload); },
      emitState(payload) { return handlers.get("keyboard.state")(payload); },
      states,
      latestState: () => states.at(-1),
      abort() { controller.abort(); },
      pending,
      fireNextTimer: timers.fireNextTimer,
      lastCallback: timers.lastCallback,
      queued: timers.queued,
      listenerClosed: () => listenerClosed,
      domainClosed: () => domainClosed,
    };
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
});
