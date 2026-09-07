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
    await hooks.send?.(message);
    return { kind: "sent" };
  };
  return {
    binding: { subsystemKey: "demo", generation, dataProfile: "loomrealm.renderer-data/1" },
    render: {
      sendDomains: send,
      sendSnapshot: send,
      sendPatch: send,
      sendEvent: send,
    },
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
