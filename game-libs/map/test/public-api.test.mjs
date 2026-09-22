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

async function createHarness(hook = (context) => context.setNPC([])) {
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
  let closed = false;
  const scope = {
    signal: aborter.signal,
    viewport: { current: { width: 640, height: 480 }, subscribe(listener) { listener(this.current); return () => {}; } },
    content: {
      async record(namespace, key) { const value = records.get(`${namespace}/${key}`); if (!value) throw new Error("missing record"); return { value, contentVersion: "record" }; },
      async resource() { return { bytes: png(), mime: "image/png", contentVersion: "image" }; },
    },
    createInputListener() { return { on() { return () => {}; }, setChannels() {}, close() {} }; },
    createRenderDomain(initial) {
      states.push(structuredClone(initial));
      return { replace(state) { states.push(structuredClone(state)); }, update() {}, emit() {}, close() { closed = true; } };
    },
  };
  const frame = { id: "public-api", params: {}, signal: aborter.signal, async call() { throw new Error("unused"); } };
  const handler = new RPGMapBuilder(scope, frame).build({ player: { characterName: "player" } });
  handler.onMapEntering(hook);
  const pending = handler.run({ mapId: 1, x: 1, y: 1 });
  for (let attempt = 0; attempt < 20 && states.length === 0; attempt += 1) await new Promise((resolve) => setImmediate(resolve));
  return { aborter, closed: () => closed, handler, pending, states };
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
