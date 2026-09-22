import assert from "node:assert/strict";
import test from "node:test";
import { RPGMapBuilder, RPGMapError } from "@loomrealm-game/map";

const table = (dimensions, xSize, ySize, zSize, values) => ({ dimensions, xSize, ySize, zSize, values });
const png = () => {
  const bytes = new Uint8Array(24);
  bytes.set([137, 80, 78, 71], 0);
  new DataView(bytes.buffer).setUint32(16, 128);
  new DataView(bytes.buffer).setUint32(20, 128);
  return bytes;
};

async function createHarness(hook = (context) => context.setNPC([]), options = {}) {
  const aborter = new AbortController();
  const width = 10; const height = 10;
  const values = Array(width * height * 3).fill(384);
  const records = new Map([
    ["struct.Map/1", { tileset_id: 1, width, height, data: table(3, width, height, 3, values), behaviors: [] }],
    ["struct.MapTransfer/1", { id: 1, steps: [], contacts: [], edges: [] }],
    ["struct.Tileset/1", { id: 1, tileset_name: "tiles", autotile_names: [null, null, null, null, null, null, null], passages: table(1, 385, 1, 1, Array(385).fill(0)), priorities: table(1, 385, 1, 1, Array(385).fill(0)), terrain_tags: table(1, 385, 1, 1, Array(385).fill(0)) }],
    ["struct.NPC/guide", { name: "Guide", sprite: { namespace: "resource.Graphics", key: "Characters/guide" } }],
    ["struct.NPC/huge", { name: "Huge", sprite: { namespace: "resource.Graphics", key: `Characters/${"x".repeat(1_000_000)}` } }],
  ]);
  const states = [];
  const inputHandlers = new Map();
  let closed = false;
  const scope = {
    signal: aborter.signal,
    viewport: { current: { width: 640, height: 480 }, subscribe(listener) { listener(this.current); return () => {}; } },
    content: {
      async record(namespace, key) { const value = records.get(`${namespace}/${key}`); if (!value) throw new Error("missing record"); return { value, contentVersion: "record" }; },
      async resource(namespace, key) {
        if (options.resource) return await options.resource(namespace, key);
        return { bytes: png(), mime: "image/png", contentVersion: "image" };
      },
    },
    createInputListener() { return { on(channel, listener) { inputHandlers.set(channel, listener); return () => inputHandlers.delete(channel); }, setChannels() {}, close() {} }; },
    createRenderDomain(initial) {
      states.push(structuredClone(initial));
      return { replace(state) { states.push(structuredClone(state)); }, update() {}, emit() {}, close() { closed = true; } };
    },
  };
  const frame = { id: "public-api", params: {}, signal: aborter.signal, async call() { throw new Error("unused"); } };
  const handler = new RPGMapBuilder(scope, frame).build({ player: { characterName: "player" } });
  handler.onMapEntering(hook);
  const enteredUnsubscribers = (options.enteredListeners ?? []).map((listener) => handler.onMapEntered(listener));
  const pending = handler.run({ mapId: 1, x: 1, y: 1 });
  for (let attempt = 0; attempt < 20 && states.length === 0; attempt += 1) await new Promise((resolve) => setImmediate(resolve));
  return {
    aborter,
    closed: () => closed,
    emit(channel, value) { inputHandlers.get(channel)?.(value); },
    enteredUnsubscribers,
    handler,
    pending,
    states,
  };
}

test("public Builder/Handler normalizes NPCs and never reuses a retired RenderNode key", async () => {
  const harness = await createHarness();
  assert.deepEqual(harness.handler.getSnapshot()?.npcs, []);
  const placement = { instanceId: "guide-1", npcId: "guide", x: 2, y: 2, direction: 6, pattern: 3 };
  await harness.handler.setNPC([placement]);
  const firstKey = harness.states.at(-1).roots[0].children[1].key;
  await harness.handler.setNPC([{ ...placement, x: 3 }]);
  assert.equal(harness.states.at(-1).roots[0].children[1].key, firstKey);
  await harness.handler.setNPC([]);
  await harness.handler.setNPC([placement]);
  assert.notEqual(harness.states.at(-1).roots[0].children[1].key, firstKey);
  assert.equal(harness.handler.getSnapshot().npcs[0].pattern, 3);
  await assert.rejects(harness.handler.setNPC([{ ...placement, x: 1, y: 1 }]), (error) => error instanceof RPGMapError && error.code === "MAP_NPC_INVALID");
  const statesBeforeCapacityFailure = harness.states.length;
  const snapshotBeforeCapacityFailure = harness.handler.getSnapshot();
  await assert.rejects(harness.handler.setNPC([{ ...placement, npcId: "huge" }]), (error) => error instanceof RPGMapError && error.code === "MAP_NPC_INVALID");
  assert.equal(harness.states.length, statesBeforeCapacityFailure, "capacity failure must occur before Domain.replace");
  assert.deepEqual(harness.handler.getSnapshot(), snapshotBeforeCapacityFailure);
  harness.aborter.abort();
  assert.deepEqual(await harness.pending, { type: "cancelled" });
  assert.equal(harness.closed(), true);
  assert.equal(harness.handler.getSnapshot(), null);
});

test("onMapEntering cancellation releases run even when the listener never settles", async () => {
  const harness = await createHarness(async () => await new Promise(() => {}));
  assert.equal(harness.states.length, 0);
  harness.aborter.abort();
  assert.deepEqual(await harness.pending, { type: "cancelled" });
});

test("setNPC preparation excludes movement and revalidates the stable player cell before commit", async () => {
  let releaseGuide;
  let guideRequestedResolve;
  const guideRequested = new Promise((resolve) => { guideRequestedResolve = resolve; });
  const harness = await createHarness(undefined, {
    resource: async (_namespace, key) => {
      if (key !== "Characters/guide") return { bytes: png(), mime: "image/png", contentVersion: "image" };
      guideRequestedResolve();
      return await new Promise((resolve) => { releaseGuide = () => resolve({ bytes: png(), mime: "image/png", contentVersion: "guide" }); });
    },
  });
  const setting = harness.handler.setNPC([{ instanceId: "guard", npcId: "guide", x: 2, y: 1, direction: 4, pattern: 2 }]);
  await guideRequested;
  harness.emit("keyboard.event", { code: "ArrowRight", action: "down", repeat: false });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(harness.handler.getSnapshot().player, { x: 1, y: 1, direction: 2 });
  assert.equal(harness.states.length, 1, "movement and NPC commit must both wait for preparation");
  releaseGuide();
  await setting;
  assert.deepEqual(harness.handler.getSnapshot(), {
    mapId: 1,
    player: { x: 1, y: 1, direction: 2 },
    npcs: [{ instanceId: "guard", npcId: "guide", x: 2, y: 1, direction: 4, pattern: 2 }],
  });
  harness.aborter.abort();
  await harness.pending;
});

test("failed delayed setNPC restores operability without changing NPCs, snapshot, or Domain", async () => {
  let failNextGuide = false;
  let rejectGuide;
  let guideRequestedResolve;
  let guideRequested = new Promise((resolve) => { guideRequestedResolve = resolve; });
  const harness = await createHarness(undefined, {
    resource: async (_namespace, key) => {
      if (key === "Characters/guide" && failNextGuide) {
        guideRequestedResolve();
        return await new Promise((_resolve, reject) => { rejectGuide = reject; });
      }
      return { bytes: png(), mime: "image/png", contentVersion: "image" };
    },
  });
  await harness.handler.setNPC([{ instanceId: "old", npcId: "guide", x: 3, y: 1, direction: 2 }]);
  const oldSnapshot = harness.handler.getSnapshot();
  const oldStateCount = harness.states.length;
  failNextGuide = true;
  guideRequested = new Promise((resolve) => { guideRequestedResolve = resolve; });
  const setting = harness.handler.setNPC([{ instanceId: "new", npcId: "guide", x: 2, y: 1, direction: 6 }]);
  await guideRequested;
  harness.emit("keyboard.event", { code: "ArrowRight", action: "down", repeat: false });
  assert.deepEqual(harness.handler.getSnapshot(), oldSnapshot);
  rejectGuide(new Error("injected NPC resource failure"));
  await assert.rejects(setting, (error) => error instanceof RPGMapError && error.code === "MAP_CONTENT_FAILED");
  assert.deepEqual(harness.handler.getSnapshot(), oldSnapshot);
  assert.equal(harness.states.length, oldStateCount);
  harness.emit("keyboard.event", { code: "ArrowRight", action: "up", repeat: false });
  harness.emit("keyboard.event", { code: "ArrowRight", action: "down", repeat: false });
  assert.equal(harness.handler.getSnapshot().player.x, 2, "movement must be available after preparation failure");
  harness.aborter.abort();
  await harness.pending;
});

test("onMapEntered unsubscribe remains idempotent during run and listener failures stay isolated", async () => {
  const seen = [];
  const diagnostics = [];
  const originalError = console.error;
  console.error = (...args) => { diagnostics.push(args); };
  try {
    const harness = await createHarness(undefined, {
      enteredListeners: [
        (event) => seen.push(`removed:${event.player.x}`),
        () => { throw new Error("listener boom"); },
        (event) => seen.push(`kept:${event.player.x}`),
      ],
    });
    assert.deepEqual(seen, ["removed:1", "kept:1"]);
    harness.enteredUnsubscribers[0]();
    harness.enteredUnsubscribers[0]();
    await harness.handler.enterMap({ mapId: 1, x: 2, y: 2 });
    assert.deepEqual(seen, ["removed:1", "kept:1", "kept:2"]);
    assert.equal(diagnostics.length, 2);
    assert.equal(diagnostics.every((entry) => entry[0] === "[RPGMap] MAP_ENTERED_LISTENER_FAILED"), true);
    harness.aborter.abort();
    await harness.pending;
  } finally {
    console.error = originalError;
  }
});
