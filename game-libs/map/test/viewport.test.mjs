/**
 * Map PR2 dynamic-viewport qualification (frozen main contract §1/PR2):
 *  - runtime consumption of scope.viewport: initial value, sync-first
 *    delivery, null ignored, clamp min/max, same-size no-op;
 *  - 100ms trailing latest-wins settle (burst A/B/C/D -> only D commits);
 *  - resize during active logical step defers to the completion boundary;
 *  - authoritative commit republishes camera clamp + fresh chunks under a
 *    new visualEpoch, both endpoints paired;
 *  - browser host adopts the accepted logical size.
 */
import test from "node:test";
import assert from "node:assert/strict";
import mapDefinition from "@loomrealm-game/map";

const table = (dimensions, xSize, ySize, zSize, values) => ({ dimensions, xSize, ySize, zSize, values });

function fixtureMap(width = 80, height = 60) {
  const values = Array(width * height * 3).fill(0);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) values[x + y * width] = 384;
  return { tileset_id: 1, width, height, data: table(3, width, height, 3, values) };
}
const tileset = { id: 1, tileset_name: "t", autotile_names: [null,null,null,null,null,null,null], passages: table(1, 386, 1, 1, Array(386).fill(0)), priorities: table(1, 386, 1, 1, Array(386).fill(0)) };

async function startFrame(t, options = {}) {
  const records = {
    "struct.Map/1": options.map ?? fixtureMap(),
    "struct.Tileset/1": tileset,
    "struct.MapTransfer/1": { id: 1, steps: [], contacts: [], edges: [] },
  };
  const states = [];
  const updates = [];
  const replaces = [];
  const handlers = new Map();
  let viewportListener = null;
  const timers = [];
  const realSetTimeout = globalThis.setTimeout;
  const realClearTimeout = globalThis.clearTimeout;
  const tick = () => new Promise((resolve) => realSetTimeout(resolve, 0));
  globalThis.setTimeout = (callback, delay) => {
    const entry = { callback, delay, id: timers.length + 1 };
    timers.push(entry);
    return entry.id;
  };
  globalThis.clearTimeout = () => {};
  t.after(() => {
    globalThis.setTimeout = realSetTimeout;
    globalThis.clearTimeout = realClearTimeout;
  });
  const definition = mapDefinition({
    signal: new AbortController().signal,
    viewport: {
      current: options.initialViewport ?? null,
      subscribe(listener) {
        viewportListener = listener;
        if (options.initialViewport !== undefined && options.initialViewport !== null && options.syncInitial !== false) {
          listener(options.initialViewport);
        }
        return () => { viewportListener = null; };
      },
    },
    content: {
      async record(namespace, key) { const value = records[`${namespace}/${key}`]; if (value === undefined) throw new TypeError(`missing ${key}`); return { value, contentVersion: "v" }; },
      async resource() { return { bytes: new Uint8Array([1]), mime: "image/png", contentVersion: "v-image" }; },
    },
    createInputListener({ channels }) {
      assert.deepEqual([...channels], ["keyboard.event", "keyboard.state"]);
      return { on(channel, handler) { handlers.set(channel, handler); return () => {}; }, setChannels() {}, close() {} };
    },
    createRenderDomain(initial) {
      states.push(structuredClone(initial));
      return {
        replace(state) { states.push(structuredClone(state)); replaces.push(state); },
        update(update) {
          const merged = structuredClone(states.at(-1));
          for (const node of update.nodes) {
            const view = merged.roots[0];
            const target = node.key === "viewport" ? view : view.children[0];
            for (const [key, value] of Object.entries(node.data.set ?? {})) target.data[key] = value;
          }
          states.push(merged);
          updates.push(update);
        },
        emit() {}, close() {},
      };
    },
  });
  const controller = new AbortController();
  const pending = definition.frame({
    id: "f",
    params: { mapId: 1, x: 12, y: 9, characterName: "p" },
    signal: controller.signal,
    async call() { throw new Error("unused"); },
  });
  pending.catch(() => {});
  for (let attempt = 0; attempt < 40 && (states.length === 0 || !handlers.has("keyboard.event")); attempt += 1) {
    await tick();
  }
  assert.ok(states.length >= 1, "expected initial standing RenderDomain");
  const fireTimers = async (match) => {
    for (;;) {
      const entry = timers.find((item) => !item.fired && (match === undefined || item.delay === match));
      if (entry === undefined) break;
      entry.fired = true;
      await tick();
      entry.callback();
      await tick();
    }
  };
  const nextTimer = () => {
    const entry = timers.find((item) => !item.fired);
    return entry;
  };
  return {
    states, updates, replaces,
    emitEvent(payload) { return handlers.get("keyboard.event")(payload); },
    resize(size) { viewportListener?.(size); },
    fireTimers, nextTimer,
    abort() { controller.abort(); },
    pending,
  };
}

const down = (code) => ({ action: "down", code, repeat: false });
const up = (code) => ({ action: "up", code, repeat: false });

test("default 640x480 when scope.viewport.current is null", async (t) => {
  const frame = await startFrame(t);
  const view = frame.states[0].roots[0].data;
  assert.equal(view.viewportWidth, 640);
  assert.equal(view.viewportHeight, 480);
  frame.abort();
  await frame.pending;
});

test("initial viewport sample sizes the spawn window and camera", async (t) => {
  const frame = await startFrame(t, { initialViewport: { width: 1280, height: 720 } });
  const view = frame.states[0].roots[0].data;
  assert.equal(view.viewportWidth, 1280);
  assert.equal(view.viewportHeight, 720);
  // anchor for 1280x720: floor((1280-32)/2)=624 -> cameraX = 12*32-624 = -240 -> clamped 0
  assert.equal(view.cameraX, 0);
  const sprite = frame.states[0].roots[0].children[0].data;
  assert.equal(sprite.screenX, 12 * 32 - 0);
  frame.abort();
  await frame.pending;
});

test("resize clamps to 320x240..1920x1080 and same-size is a no-op", async (t) => {
  const frame = await startFrame(t);
  frame.resize({ width: 100, height: 50 });            // below min -> 320x240
  await frame.fireTimers(100);
  frame.resize({ width: 320, height: 240 });           // same as accepted -> no-op
  await frame.fireTimers(100);
  frame.resize({ width: 4000, height: 3000 });         // above max -> 1920x1080
  await frame.fireTimers(100);
  const widths = frame.states.map((state) => state.roots[0].data.viewportWidth);
  assert.ok(widths.includes(320), "min clamp applied");
  assert.ok(widths.includes(1920), "max clamp applied");
  assert.equal(widths.filter((width) => width === 320).length, 1, "same-size resize republishes nothing");
  assert.ok(widths.indexOf(1920) > widths.indexOf(320), "max resize commits after the same-size no-op");
  frame.abort();
  await frame.pending;
});

test("burst A/B/C/D settles to only D (100ms trailing latest-wins)", async (t) => {
  const frame = await startFrame(t);
  frame.resize({ width: 800, height: 600 });
  frame.resize({ width: 960, height: 540 });
  frame.resize({ width: 1280, height: 720 });
  frame.resize({ width: 1024, height: 768 });
  await frame.fireTimers(100);
  const widths = frame.states.map((state) => state.roots[0].data.viewportWidth);
  assert.ok(!widths.includes(800) && !widths.includes(960) && !widths.includes(1280), "intermediate burst sizes never commit");
  assert.ok(widths.includes(1024), "final burst size commits");
  frame.abort();
  await frame.pending;
});

test("resize during active step defers to the completion boundary", async (t) => {
  const frame = await startFrame(t);
  await frame.emitEvent(down("ArrowRight"));
  const beforeCount = frame.states.length;
  frame.resize({ width: 960, height: 540 });
  await frame.fireTimers(100);
  assert.equal(frame.states.length, beforeCount, "no mid-step authoritative commit");
  await frame.emitEvent(up("ArrowRight"));
  // Fire the 250ms step timer: the resize commits at the boundary.
  const step = frame.nextTimer();
  assert.equal(step.delay, 250);
  step.fired = true;
  step.callback();
  await Promise.resolve();
  const view = frame.states.at(-1).roots[0].data;
  assert.equal(view.viewportWidth, 960);
  assert.equal(view.viewportHeight, 540);
  assert.ok(view.visualEpoch >= 2, "resize bumps visualEpoch");
  assert.ok(Array.isArray(view.chunks) && view.chunks.length > 0, "fresh chunk projection published");
  const sprite = frame.states.at(-1).roots[0].children[0].data;
  assert.equal(sprite.visualEpoch, view.visualEpoch, "paired sprite epoch matches");
  frame.abort();
  await frame.pending;
});

test("resize while standing commits after the settle timer", async (t) => {
  const frame = await startFrame(t);
  frame.resize({ width: 320, height: 240 });
  await frame.fireTimers(100);
  const view = frame.states.at(-1).roots[0].data;
  assert.equal(view.viewportWidth, 320);
  assert.equal(view.viewportHeight, 240);
  // camera re-clamped for the small viewport: anchor floor((320-32)/2)=144
  // cameraX = 13*32-144 = 272 (player moved? no: x=12 -> 384-144=240)
  assert.equal(view.cameraX, Math.max(Math.min(12 * 32 - 144, 80 * 32 - 320), 0));
  frame.abort();
  await frame.pending;
});

test("null viewport sample is ignored", async (t) => {
  const frame = await startFrame(t);
  const before = frame.states.length;
  frame.resize(null);
  await frame.fireTimers(100);
  assert.equal(frame.states.length, before, "null sample publishes nothing");
  frame.abort();
  await frame.pending;
});
