import test from "node:test";
import assert from "node:assert/strict";
import { RenderManager } from "../dist/internal/render-manager.js";

const state = (roots, zIndex = 0) => ({ zIndex, roots });
const node = (key, children = [], tag = "sprite", attrs = {}, data = {}) => ({
  key,
  tag,
  attrs,
  data,
  children,
});
const turn = () => new Promise((resolve) => setImmediate(resolve));
const settle = async () => { for (let index = 0; index < 8; index += 1) await turn(); };

function peer(generation = 1, hooks = {}) {
  const messages = [];
  const send = async (message) => {
    messages.push(message);
    const result = await hooks.send?.(message);
    return result ?? { kind: "sent" };
  };
  return {
    binding: { subsystemKey: "demo", generation, dataProfile: "loomrealm.renderer-data/1" },
    render: {
      sendDomains: send,
      sendSnapshot: send,
      sendPatch: send,
      sendEvent: send,
    },
    close: async () => {},
    messages,
  };
}

test("RenderDomain commits detached local authority and enforces lifetime identity", () => {
  const manager = new RenderManager();
  const source = state([node("root", [], "sprite", { x: "1" }, { nested: { value: 1 } })], 4);
  const domain = manager.createDomain(source);
  source.roots[0].attrs.x = "changed";
  source.roots[0].data.nested.value = 9;
  assert.equal(manager.snapshotForQualification().domains[0].state.roots[0].attrs.x, "1");
  assert.equal(manager.snapshotForQualification().domains[0].state.roots[0].data.nested.value, 1);

  assert.throws(() => domain.replace(state([node("root", [], "other")])), /tag/);
  assert.equal(manager.snapshotForQualification().domains[0].state.zIndex, 4);
  domain.replace(state([]));
  assert.throws(() => domain.replace(state([node("root")])), /reused/);
  assert.throws(() => domain.emit({ targetKey: "root", name: "hit", data: {} }), /Stale/);
  domain.close();
  domain.close();
  assert.throws(() => domain.replace(state([])), /closed/);
  assert.throws(() => domain.update({ zIndex: 1 }), /closed/);
  assert.throws(() => domain.emit({ targetKey: "root", name: "hit", data: {} }), /closed/);
});

test("Render author validation is atomic and classifies shape versus hard limits", () => {
  const manager = new RenderManager();
  assert.throws(() => manager.createDomain({ zIndex: 0, roots: [], extra: true }), TypeError);
  assert.throws(() => manager.createDomain(state([node("same"), node("same")])), TypeError);
  const cyclic = node("cycle");
  cyclic.children.push(cyclic);
  assert.throws(() => manager.createDomain(state([cyclic])), TypeError);
  const sparse = [];
  sparse.length = 1;
  assert.throws(() => manager.createDomain(state(sparse)), TypeError);
  assert.throws(() => manager.createDomain(state([], 2_147_483_648)), RangeError);
  assert.equal(manager.snapshotForQualification().domains.length, 0);
  const domain = manager.createDomain(state([node("a")]));
  assert.throws(() => domain.emit({ targetKey: "a", name: "", data: {} }), TypeError);
  assert.equal(manager.snapshotForQualification().domains[0].state.roots[0].key, "a");
});

test("Render author validation rejects non-scalar strings in generic data synchronously", () => {
  const manager = new RenderManager();
  assert.throws(() => manager.createDomain(state([
    node("root", [], "sprite", {}, { value: "\ud800" }),
  ])), /Unicode/);
  const domain = manager.createDomain(state([
    node("root", [], "sprite", {}, { value: "😀" }),
  ]));
  assert.throws(() => domain.replace(state([
    node("root", [], "sprite", {}, { nested: ["\udc00"] }),
  ])), /Unicode/);
  assert.throws(() => domain.emit({ targetKey: "root", name: "tick", data: { value: "\ud800" } }), /Unicode/);
  assert.equal(manager.snapshotForQualification().domains[0].state.roots[0].data.value, "😀");
});

test("fresh carrier publishes Registry then baseline and orders Event after target", async () => {
  const manager = new RenderManager();
  const domain = manager.createDomain(state([node("root")], 2));
  const current = peer();
  manager.setDataPeer(current);
  domain.emit({ targetKey: "root", name: "ready", data: { n: 1 } });
  await settle();
  assert.deepEqual(current.messages.map(({ type }) => type), [
    "render.domains",
    "render.snapshot",
    "render.event",
  ]);
  assert.equal(current.messages[1].revision, 1);
  assert.equal(current.messages[2].targetKey, "root");

  manager.setDataPeer(null);
  domain.emit({ targetKey: "root", name: "lost", data: {} });
  const fresh = peer();
  manager.setDataPeer(fresh);
  await settle();
  assert.deepEqual(fresh.messages.map(({ type }) => type), ["render.domains", "render.snapshot"]);
  assert.equal(fresh.messages[1].domainId, current.messages[1].domainId);
  assert.equal(fresh.messages[1].revision, 1);
});

test("close discards pending Domain work and waits for an already-started send before removal", async () => {
  let releaseSnapshot;
  const gate = new Promise((resolve) => { releaseSnapshot = resolve; });
  const manager = new RenderManager();
  const domain = manager.createDomain(state([node("root")]));
  const current = peer(1, {
    async send(message) {
      if (message.type === "render.snapshot") await gate;
    },
  });
  manager.setDataPeer(current);
  await turn();
  await turn();
  assert.deepEqual(current.messages.map(({ type }) => type), ["render.domains", "render.snapshot"]);
  domain.emit({ targetKey: "root", name: "pending", data: {} });
  domain.replace(state([node("root", [], "sprite", { x: "2" })]));
  domain.close();
  assert.equal(current.messages.length, 2);
  releaseSnapshot();
  await settle();
  assert.deepEqual(current.messages.map(({ type }) => type), [
    "render.domains",
    "render.snapshot",
    "render.domains",
  ]);
  assert.deepEqual(current.messages[2].domains, []);
});

test("revision exhaustion rolls one live business Domain to a fresh wire identity", async () => {
  const manager = new RenderManager();
  const domain = manager.createDomain(state([node("root")]));
  const current = peer();
  manager.setDataPeer(current);
  await settle();
  const oldId = current.messages[1].domainId;
  manager.setRevisionForQualification(oldId, Number.MAX_SAFE_INTEGER);
  domain.replace(state([node("root", [], "sprite", { x: "2" })]));
  await settle();
  assert.deepEqual(current.messages.slice(-2).map(({ type }) => type), [
    "render.domains",
    "render.snapshot",
  ]);
  const replacement = current.messages.at(-1);
  assert.notEqual(replacement.domainId, oldId);
  assert.equal(replacement.revision, 1);
  assert.deepEqual(current.messages.at(-2).domains, [replacement.domainId]);
});

test("revision exhaustion publishes the latest authority when later state work is pending", async () => {
  let releaseEvent;
  const eventGate = new Promise((resolve) => { releaseEvent = resolve; });
  let blockEvent = false;
  const manager = new RenderManager();
  const domain = manager.createDomain(state([node("root", [], "sprite", {}, { n: 0 })]));
  const current = peer(1, {
    async send(message) {
      if (blockEvent && message.type === "render.event") await eventGate;
    },
  });
  manager.setDataPeer(current);
  await settle();
  const oldId = current.messages[1].domainId;
  blockEvent = true;
  domain.emit({ targetKey: "root", name: "hold", data: {} });
  await turn();
  manager.setRevisionForQualification(oldId, Number.MAX_SAFE_INTEGER);
  domain.update({ nodes: [{ key: "root", data: { set: { n: 1 } } }] });
  domain.update({ nodes: [{ key: "root", data: { set: { n: 2 } } }] });
  releaseEvent();
  await settle();
  const replacement = current.messages.at(-1);
  assert.equal(replacement.type, "render.snapshot");
  assert.notEqual(replacement.domainId, oldId);
  assert.equal(replacement.revision, 1);
  assert.equal(replacement.roots[0].data.n, 2);
  assert.equal(manager.snapshotForQualification().domains[0].state.roots[0].data.n, 2);
});

test("Runtime cleanup closes every still-live RenderDomain", () => {
  const manager = new RenderManager();
  const domain = manager.createDomain(state([node("root")]));
  manager.closeAll();
  assert.throws(() => domain.replace(state([])), /closed/);
  assert.throws(() => manager.createDomain(state([])), /closed/);
});

test("Domain count and publication pressure remain bounded without rejecting valid author commits", async () => {
  const bounded = new RenderManager();
  for (let index = 0; index < 256; index += 1) bounded.createDomain(state([]));
  assert.throws(() => bounded.createDomain(state([])), RangeError);

  let releaseSnapshot;
  const gate = new Promise((resolve) => { releaseSnapshot = resolve; });
  const manager = new RenderManager();
  const domain = manager.createDomain(state([node("root")]));
  let blocked = true;
  const current = peer(1, {
    async send(message) {
      if (blocked && message.type === "render.snapshot") await gate;
    },
  });
  manager.setDataPeer(current);
  await turn();
  await turn();
  for (let index = 0; index < 1_500; index += 1) {
    assert.doesNotThrow(() => domain.emit({ targetKey: "root", name: "pulse", data: { index } }));
  }
  assert.doesNotThrow(() => domain.replace(state([node("root", [], "sprite", { final: "yes" })])));
  assert.ok(manager.snapshotForQualification().pendingWork <= 1_024);
  blocked = false;
  releaseSnapshot();
  await settle();
  assert.equal(current.messages.at(-1).type, "render.snapshot");
  assert.equal(current.messages.at(-1).roots[0].attrs.final, "yes");
});

test("retained Event is an authoritative coalescing barrier", async () => {
  let release;
  let blockNext = false;
  const gate = new Promise((resolve) => { release = resolve; });
  const manager = new RenderManager();
  const domain = manager.createDomain(state([node("root")]));
  const current = peer(1, {
    async send(message) {
      if (blockNext && message.type === "render.snapshot") {
        blockNext = false;
        await gate;
      }
    },
  });
  manager.setDataPeer(current);
  await settle();
  blockNext = true;
  domain.replace(state([node("root", [], "sprite", { phase: "before" })]));
  domain.emit({ targetKey: "root", name: "barrier", data: {} });
  domain.replace(state([node("root", [], "sprite", { phase: "after" })]));
  await turn();
  release();
  await settle();
  assert.deepEqual(current.messages.slice(-3).map(({ type }) => type), [
    "render.snapshot",
    "render.event",
    "render.snapshot",
  ]);
  assert.equal(current.messages.at(-3).roots[0].attrs.phase, "before");
  assert.equal(current.messages.at(-1).roots[0].attrs.phase, "after");
});

test("an Event is a coalescing barrier only for its own Domain", async () => {
  let release;
  let blockNext = false;
  const gate = new Promise((resolve) => { release = resolve; });
  const manager = new RenderManager();
  const first = manager.createDomain(state([node("first")]));
  const second = manager.createDomain(state([node("second")]));
  const current = peer(1, {
    async send(message) {
      if (blockNext && message.type === "render.snapshot") {
        blockNext = false;
        await gate;
      }
    },
  });
  manager.setDataPeer(current);
  await settle();
  blockNext = true;
  first.replace(state([node("first", [], "sprite", { phase: "blocked" })]));
  second.replace(state([node("second", [], "sprite", { phase: "before" })]));
  first.emit({ targetKey: "first", name: "barrier", data: {} });
  second.replace(state([node("second", [], "sprite", { phase: "after" })]));
  await turn();
  release();
  await settle();
  const tail = current.messages.slice(-3);
  assert.deepEqual(tail.map(({ type }) => type), [
    "render.snapshot",
    "render.snapshot",
    "render.event",
  ]);
  assert.equal(tail[1].domainId, current.messages[2].domainId);
  assert.equal(tail[1].roots[0].attrs.phase, "after");
});

test("an unemitted create-close lifecycle never publishes stale Domain presence", async () => {
  let releaseRegistry;
  const gate = new Promise((resolve) => { releaseRegistry = resolve; });
  let first = true;
  const manager = new RenderManager();
  const current = peer(1, {
    async send(message) {
      if (first && message.type === "render.domains") {
        first = false;
        await gate;
      }
    },
  });
  manager.setDataPeer(current);
  const domain = manager.createDomain(state([node("ephemeral")]));
  domain.close();
  releaseRegistry();
  await settle();
  assert.ok(current.messages.every((message) =>
    message.type !== "render.domains" || message.domains.length === 0));
  assert.equal(current.messages.some(({ type }) => type === "render.snapshot"), false);
});

test("RenderDomain.update mutates existing node attrs/data/zIndex without a Snapshot after baseline", async () => {
  const manager = new RenderManager();
  const nested = { value: 1, keep: { huge: "x".repeat(32) } };
  const domain = manager.createDomain(state([node("root", [node("child")], "sprite", { x: "1" }, nested)]));
  const current = peer();
  manager.setDataPeer(current);
  await settle();
  const before = manager.snapshotForQualification().domains[0].state.roots[0];
  domain.update({
    zIndex: 9,
    nodes: [{
      key: "root",
      attrs: { set: { x: "2" }, remove: [] },
      data: { set: { value: 7 } },
    }],
  });
  const source = { zIndex: 3, nodes: [{ key: "root", data: { set: { value: 8 } } }] };
  domain.update(source);
  source.nodes[0].data.set.value = 99;
  await settle();
  const patches = current.messages.filter(({ type }) => type === "render.patch");
  assert.equal(current.messages.filter(({ type }) => type === "render.snapshot").length, 1);
  assert.equal(patches.length, 2);
  assert.equal(patches[0].baseRevision, 1);
  assert.equal(patches[0].revision, 2);
  assert.equal(patches[0].zIndex, 9);
  assert.equal(patches[0].ops[0].op, "update");
  assert.equal(patches[0].ops[0].key, "root");
  assert.equal(patches[0].ops[0].attrs.set.x, "2");
  assert.deepEqual(patches[0].ops[0].attrs.remove, []);
  assert.equal(patches[0].ops[0].data.set.value, 7);
  assert.equal(patches[1].ops[0].data.set.value, 8);
  const after = manager.snapshotForQualification().domains[0].state.roots[0];
  assert.equal(after.attrs.x, "2");
  assert.equal(after.data.value, 8);
  assert.equal(after.data.keep.huge, before.data.keep.huge);
  assert.equal(after.children[0].key, "child");
});

test("RenderDomain.update is local-atomic and distinguishes missing from explicit undefined", () => {
  const manager = new RenderManager();
  const domain = manager.createDomain(state([node("root", [], "sprite", { x: "1" }, { n: 1 })], 4));
  assert.throws(() => domain.update({}), TypeError);
  assert.throws(() => domain.update({ zIndex: undefined }), TypeError);
  assert.throws(() => domain.update({ nodes: undefined }), TypeError);
  assert.throws(() => domain.update({ nodes: [] }), TypeError);
  assert.throws(() => domain.update({ nodes: [{ key: "missing", data: { set: { n: 2 } } }] }), TypeError);
  assert.throws(() => domain.update({ nodes: [{ key: "root", data: { remove: ["missing"] } }] }), TypeError);
  assert.throws(() => domain.update({
    nodes: [
      { key: "root", data: { set: { n: 2 } } },
      { key: "root", attrs: { set: { x: "9" } } },
    ],
  }), TypeError);
  const extra = []; extra[0] = { key: "root", data: { set: { n: 2 } } }; extra.foo = true;
  assert.throws(() => domain.update({ nodes: extra }), TypeError);
  const hidden = [{ key: "root", data: { set: { n: 2 } } }];
  Object.defineProperty(hidden, "hidden", { value: true });
  assert.throws(() => domain.update({ nodes: hidden }), TypeError);
  const symbolic = [{ key: "root", data: { set: { n: 2 } } }];
  symbolic[Symbol("extra")] = true;
  assert.throws(() => domain.update({ nodes: symbolic }), TypeError);
  let observed = 0;
  const indexedAccessor = [];
  Object.defineProperty(indexedAccessor, "0", {
    enumerable: true,
    get() {
      observed += 1;
      return { key: "root", data: { set: { n: 2 } } };
    },
  });
  indexedAccessor.length = 1;
  assert.throws(() => domain.update({ nodes: indexedAccessor }), TypeError);
  assert.equal(observed, 0);
  const removeAccessor = [];
  Object.defineProperty(removeAccessor, "0", {
    enumerable: true,
    get() {
      observed += 1;
      return "n";
    },
  });
  removeAccessor.length = 1;
  assert.throws(() => domain.update({ nodes: [{ key: "root", data: { remove: removeAccessor } }] }), TypeError);
  assert.equal(observed, 0);
  const accessor = { nodes: [{ key: "root", data: { set: { n: 2 } } }] };
  Object.defineProperty(accessor, "zIndex", { get() { return 1; }, enumerable: true });
  assert.throws(() => domain.update(accessor), TypeError);
  assert.throws(() => domain.update({ zIndex: 2_147_483_648 }), RangeError);
  assert.equal(manager.snapshotForQualification().domains[0].state.roots[0].attrs.x, "1");
  assert.equal(manager.snapshotForQualification().domains[0].state.roots[0].data.n, 1);
  assert.equal(manager.snapshotForQualification().domains[0].state.zIndex, 4);
  domain.update({ zIndex: 4 });
  assert.equal(manager.snapshotForQualification().domains[0].state.zIndex, 4);
});

test("baseline in-flight update stays a Snapshot and later updates become Patches", async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const manager = new RenderManager();
  const domain = manager.createDomain(state([node("root")], 1));
  const current = peer(1, {
    async send(message) {
      if (message.type === "render.snapshot") await gate;
    },
  });
  manager.setDataPeer(current);
  domain.update({ nodes: [{ key: "root", data: { set: { phase: "during-baseline" } } }] });
  await turn();
  assert.equal(current.messages.some(({ type }) => type === "render.patch"), false);
  release();
  await settle();
  domain.update({ nodes: [{ key: "root", data: { set: { phase: "after" } } }] });
  await settle();
  const types = current.messages.map(({ type }) => type);
  assert.deepEqual(types, ["render.domains", "render.snapshot", "render.patch"]);
  assert.equal(current.messages[1].roots[0].data.phase, "during-baseline");
  assert.equal(current.messages[2].ops[0].data.set.phase, "after");
  assert.equal(current.messages[2].baseRevision, 1);
});

test("Event barrier keeps later updates from coalescing into an earlier Snapshot", async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const manager = new RenderManager();
  const domain = manager.createDomain(state([node("root")]));
  const current = peer(1, {
    async send(message) {
      if (message.type === "render.snapshot" && message.roots[0].attrs.phase === "first") await gate;
    },
  });
  manager.setDataPeer(current);
  await settle();
  domain.replace(state([node("root", [], "sprite", { phase: "first" })]));
  domain.emit({ targetKey: "root", name: "barrier", data: {} });
  domain.update({ nodes: [{ key: "root", attrs: { set: { phase: "after" } } }] });
  await turn();
  release();
  await settle();
  const tail = current.messages.slice(-3);
  assert.deepEqual(tail.map(({ type }) => type), ["render.snapshot", "render.event", "render.patch"]);
  assert.equal(tail[0].roots[0].attrs.phase, "first");
  assert.equal(tail[2].ops[0].attrs.set.phase, "after");
});

test("full queue coalesces same-Domain updates to the latest Snapshot", async () => {
  let release;
  let blockSnapshots = false;
  const gate = new Promise((resolve) => { release = resolve; });
  const manager = new RenderManager();
  const domain = manager.createDomain(state([node("root")]));
  const current = peer(1, {
    async send(message) {
      if (blockSnapshots && message.type === "render.snapshot") await gate;
    },
  });
  manager.setDataPeer(current);
  await settle();
  blockSnapshots = true;
  domain.replace(state([node("root", [], "sprite", { phase: "hold" })]));
  await turn();
  await turn();
  for (let index = 0; index < 1_024; index += 1) {
    domain.update({ nodes: [{ key: "root", data: { set: { n: index } } }] });
  }
  assert.ok(manager.snapshotForQualification().pendingWork <= 1_024);
  domain.update({ nodes: [{ key: "root", data: { set: { n: 2048 } } }] });
  assert.ok(manager.snapshotForQualification().pendingWork <= 1_024);
  release();
  await settle();
  assert.equal(manager.snapshotForQualification().domains[0].state.roots[0].data.n, 2048);
});

test("zIndex-only update maps to an empty-ops Patch", async () => {
  const manager = new RenderManager();
  const domain = manager.createDomain(state([node("root")], 1));
  const current = peer();
  manager.setDataPeer(current);
  await settle();
  domain.update({ zIndex: 8 });
  await settle();
  const patch = current.messages.find(({ type }) => type === "render.patch");
  assert.equal(patch.zIndex, 8);
  assert.deepEqual(patch.ops, []);
});

test("send failure invalidates the old peer instead of retrying a Patch", async () => {
  const manager = new RenderManager();
  const domain = manager.createDomain(state([node("root")]));
  let calls = 0;
  const current = peer(1, {
    async send() {
      calls += 1;
      if (calls > 2) return { kind: "terminal", terminal: { kind: "carrier-lost" } };
      return { kind: "sent" };
    },
  });
  manager.setDataPeer(current);
  await settle();
  domain.update({ nodes: [{ key: "root", data: { set: { n: 1 } } }] });
  await settle();
  domain.update({ nodes: [{ key: "root", data: { set: { n: 2 } } }] });
  await settle();
  assert.equal(manager.snapshotForQualification().pendingWork, 0);
});

test("update op count accepts 4096 and rejects 4097 atomically", () => {
  const roots = Array.from({ length: 4096 }, (_, index) => node(`n${index}`));
  const manager = new RenderManager();
  const domain = manager.createDomain(state(roots));
  domain.update({
    nodes: roots.map((item) => ({ key: item.key, data: { set: { n: 1 } } })),
  });
  assert.equal(manager.snapshotForQualification().domains[0].state.roots[0].data.n, 1);
  const overflow = Array.from({ length: 4097 }, (_, index) => node(`k${index}`));
  const other = manager.createDomain(state(overflow));
  assert.throws(() => other.update({
    nodes: overflow.map((item) => ({ key: item.key, data: { set: { n: 1 } } })),
  }), RangeError);
  assert.equal(manager.snapshotForQualification().domains[1].state.roots[0].data.n, undefined);
});

test("full queue drops the oldest Event before coalescing authoritative work", async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const manager = new RenderManager();
  const domain = manager.createDomain(state([node("root")]));
  const current = peer(1, {
    async send(message) {
      if (message.type === "render.snapshot" && message.roots[0].data?.hold === 1) await gate;
    },
  });
  manager.setDataPeer(current);
  await settle();
  domain.replace(state([node("root", [], "sprite", {}, { hold: 1 })]));
  await turn();
  for (let index = 0; index < 1_024; index += 1) {
    domain.emit({ targetKey: "root", name: "pulse", data: { index } });
  }
  assert.ok(manager.snapshotForQualification().pendingWork <= 1_024);
  domain.update({ nodes: [{ key: "root", data: { set: { hold: 2 } } }] });
  assert.ok(manager.snapshotForQualification().pendingWork <= 1_024);
  release();
  await settle();
  assert.equal(current.messages.at(-1).type, "render.patch");
  assert.equal(current.messages.at(-1).ops[0].data.set.hold, 2);
});
