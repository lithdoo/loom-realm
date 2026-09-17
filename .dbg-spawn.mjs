import mapDefinition from "file:///E:/Repo/lithdoo-lab/loom-realm/game-libs/map/dist/index.js";

const table = (dimensions, xSize, ySize, zSize, values) => ({ dimensions, xSize, ySize, zSize, values });
const values = Array(24 * 18 * 3).fill(0);
for (let y = 0; y < 18; y += 1) for (let x = 0; x < 24; x += 1) values[x + y * 24] = 384;
values[12 + 8 * 24] = 385;
const passages = Array(386).fill(0); passages[385] = 0x02;
const priorities = Array(386).fill(0); priorities[0] = 5;
const records = {
  "struct.Map/1": { tileset_id: 1, width: 24, height: 18, data: table(3, 24, 18, 3, values) },
  "struct.Tileset/1": { id: 1, tileset_name: "m14_tileset", autotile_names: [null,null,null,null,null,null,null], passages: table(1, 386, 1, 1, passages), priorities: table(1, 386, 1, 1, priorities) },
  "struct.MapTransfer/1": { id: 1, steps: [], contacts: [], edges: [] },
};
const states = []; const updates = [];
const handlers = new Map();
const definition = mapDefinition({
  signal: new AbortController().signal,
  content: {
    async record(namespace, key) { const id = `${namespace}/${key}`; const value = records[id]; if (value === undefined) throw new TypeError(`missing ${id}`); return { value, contentVersion: "v-record" }; },
    async resource() { return { bytes: new Uint8Array([1]), mime: "image/png", contentVersion: "v-image" }; },
  },
  createInputListener({ channels }) {
    return { on(channel, handler) { handlers.set(channel, handler); return () => {}; }, setChannels() {}, close() {} };
  },
  createRenderDomain(initial) {
    states.push(initial);
    return {
      replace(s) { states.push(s); },
      update(u) { updates.push(u); for (const node of u.nodes) { const target = states.at(-1).roots[0].key === node.key ? states.at(-1).roots[0] : states.at(-1).roots[0].children[0]; Object.assign(target.data, node.data.set); } },
      emit() {}, close() {},
    };
  },
});
const controller = new AbortController();
void definition.frame({ id: "f", params: { mapId: 1, x: 10, y: 8, characterName: "p" }, signal: controller.signal, async call() { throw new Error("unused"); } });
await new Promise((r) => setImmediate(r));
await new Promise((r) => setImmediate(r));
await new Promise((r) => setImmediate(r));
const spawn = states[0].roots[0].data;
console.log("spawn bounds chunks:", spawn.chunks.map((c) => `${c.chunkX},${c.chunkY}`).join(" "));
handlers.get("keyboard.event")({ action: "down", code: "ArrowRight", repeat: false });
await new Promise((r) => setImmediate(r));
const update = updates.at(-1);
console.log("update viewport set keys:", Object.keys(update.nodes[0].data.set));
if (update.nodes[0].data.set.chunks) console.log("refreshed chunks:", update.nodes[0].data.set.chunks.map((c) => `${c.chunkX},${c.chunkY}`).join(" "));
controller.abort();

