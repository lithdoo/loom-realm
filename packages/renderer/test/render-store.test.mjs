import test from "node:test";
import assert from "node:assert/strict";
import { RendererRenderStore } from "../dist/internal/render-store.js";

const node = (key, children = [], tag = "sprite", attrs = {}, data = {}) => ({
  key,
  tag,
  attrs,
  data,
  children,
});
const domains = (...ids) => ({ type: "render.domains", domains: ids });
const snapshot = (domainId, revision, roots, zIndex = 0) => ({
  type: "render.snapshot",
  domainId,
  revision,
  zIndex,
  roots,
});

test("Registry and Snapshot establish one atomic current replica", () => {
  const store = new RendererRenderStore(1);
  store.beginCarrier();
  assert.deepEqual(store.onDomains(domains("d1")), { kind: "accepted" });
  assert.deepEqual(store.onSnapshot(snapshot("d1", 7, [node("root")], 3)), { kind: "accepted" });
  const view = store.snapshotForQualification();
  assert.equal(view.currentCarrier, true);
  assert.equal(view.domains[0].revision, 7);
  assert.equal(view.domains[0].zIndex, 3);
  assert.equal(view.domains[0].roots[0].key, "root");
});

test("production presentation reads only narrow current Store facts", () => {
  const store = new RendererRenderStore(3);
  store.beginCarrier();
  store.onDomains(domains("d1"));
  store.onSnapshot(snapshot("d1", 7, [node("root")], 3));
  store.onEvent({ type: "render.event", domainId: "d1", targetKey: "root", name: "pulse", data: {} });
  const facts = store.readPresentationFacts();
  assert.deepEqual(Object.keys(facts).sort(), ["currentCarrier", "domains", "generation", "registrySeen"]);
  assert.deepEqual(Object.keys(facts.domains[0]).sort(), ["baselined", "domainId", "roots", "zIndex"]);
  assert.equal("events" in facts, false);
  assert.equal("logicalOrder" in facts, false);
  assert.equal("stalePresentationCache" in facts, false);
  assert.ok(Object.isFrozen(facts));
  assert.ok(Object.isFrozen(facts.domains));
});

test("Patch applies insert, move, update and remove in order with one final commit", () => {
  const store = new RendererRenderStore(1);
  store.beginCarrier();
  store.onDomains(domains("d1"));
  store.onSnapshot(snapshot("d1", 1, [node("a", [node("b")])]));
  const disposition = store.onPatch({
    type: "render.patch",
    domainId: "d1",
    baseRevision: 1,
    revision: 2,
    zIndex: 9,
    ops: [
      { op: "insert", parentKey: null, beforeKey: null, node: node("c") },
      { op: "move", key: "b", parentKey: null, beforeKey: "c" },
      { op: "update", key: "a", attrs: { set: { x: "4" } }, data: { set: { hp: 10 } } },
      { op: "remove", key: "c" },
    ],
  });
  assert.deepEqual(disposition, { kind: "accepted" });
  const view = store.snapshotForQualification().domains[0];
  assert.equal(view.revision, 2);
  assert.equal(view.zIndex, 9);
  assert.deepEqual(view.roots.map(({ key }) => key), ["a", "b"]);
  assert.equal(view.roots[0].attrs.x, "4");
  assert.equal(view.roots[0].data.hp, 10);
});

test("failed Patch leaves the committed replica unchanged", () => {
  const store = new RendererRenderStore(1);
  store.beginCarrier();
  store.onDomains(domains("d1"));
  store.onSnapshot(snapshot("d1", 1, [node("a", [node("b")])], 4));
  const before = JSON.stringify(store.snapshotForQualification().domains[0]);
  const disposition = store.onPatch({
    type: "render.patch",
    domainId: "d1",
    baseRevision: 1,
    revision: 2,
    ops: [
      { op: "update", key: "a", attrs: { set: { x: "changed" } } },
      { op: "move", key: "a", parentKey: "b", beforeKey: null },
    ],
  });
  assert.equal(disposition.kind, "protocol-fatal");
  assert.equal(JSON.stringify(store.snapshotForQualification().domains[0]), before);
});

test("node and Domain one-shot identity survives same-generation carrier replacement", () => {
  const store = new RendererRenderStore(1);
  store.beginCarrier();
  store.onDomains(domains("d1"));
  store.onSnapshot(snapshot("d1", 1, [node("a")]));
  store.retireCarrier();
  assert.equal(store.snapshotForQualification().stalePresentationCache, true);
  store.beginCarrier();
  store.onDomains(domains("d1"));
  assert.deepEqual(store.onSnapshot(snapshot("d1", 9, [node("a")])), { kind: "accepted" });
  assert.equal(store.onSnapshot(snapshot("d1", 10, [])).kind, "accepted");
  assert.equal(store.onSnapshot(snapshot("d1", 11, [node("a")])).kind, "protocol-fatal");

  store.beginCarrier();
  store.onDomains(domains());
  assert.equal(store.onDomains(domains("d1")).kind, "protocol-fatal");
});

test("well-formed stale Events are accepted and dropped", () => {
  const store = new RendererRenderStore(1);
  store.beginCarrier();
  assert.deepEqual(store.onEvent({ type: "render.event", domainId: "missing", targetKey: "x", name: "hit", data: {} }), { kind: "accepted" });
  store.onDomains(domains("d1"));
  store.onEvent({ type: "render.event", domainId: "d1", targetKey: "x", name: "hit", data: {} });
  store.onSnapshot(snapshot("d1", 1, [node("x")]));
  store.onEvent({ type: "render.event", domainId: "d1", targetKey: "stale", name: "hit", data: {} });
  store.onEvent({ type: "render.event", domainId: "d1", targetKey: "x", name: "hit", data: { n: 1 } });
  assert.equal(store.snapshotForQualification().events.length, 1);
});

test("continuity violations are protocol-fatal", () => {
  const store = new RendererRenderStore(1);
  store.beginCarrier();
  assert.equal(store.onSnapshot(snapshot("d1", 1, [])).kind, "protocol-fatal");
  store.onDomains(domains("d1"));
  assert.equal(store.onPatch({ type: "render.patch", domainId: "d1", baseRevision: 1, revision: 2, ops: [] }).kind, "protocol-fatal");
  store.onSnapshot(snapshot("d1", 1, [node("x")]));
  assert.equal(store.onPatch({ type: "render.patch", domainId: "d1", baseRevision: 0, revision: 1, ops: [] }).kind, "protocol-fatal");
  assert.equal(store.onSnapshot(snapshot("d1", 3, [node("x")])).kind, "protocol-fatal");
});

test("logical stacking uses zIndex then UTF-8 lexical domain identity", () => {
  const store = new RendererRenderStore(1);
  store.beginCarrier();
  store.onDomains(domains("z", "😀", "\uE000", "a"));
  store.onSnapshot(snapshot("z", 1, [node("z")], 2));
  store.onSnapshot(snapshot("😀", 1, [node("emoji")], 1));
  store.onSnapshot(snapshot("\uE000", 1, [node("private")], 1));
  store.onSnapshot(snapshot("a", 1, [node("a")], 1));
  assert.deepEqual(store.snapshotForQualification().logicalOrder, ["a", "\uE000", "😀", "z"]);
});

test("fresh generation creates a fresh Domain and Node identity universe", () => {
  const oldStore = new RendererRenderStore(1);
  oldStore.beginCarrier();
  oldStore.onDomains(domains("d1"));
  oldStore.onSnapshot(snapshot("d1", 1, [node("same")]));
  oldStore.onDomains(domains());
  assert.equal(oldStore.onDomains(domains("d1")).kind, "protocol-fatal");

  const freshStore = new RendererRenderStore(2);
  freshStore.beginCarrier();
  assert.deepEqual(freshStore.onDomains(domains("d1")), { kind: "accepted" });
  assert.deepEqual(freshStore.onSnapshot(snapshot("d1", 1, [node("same")])), { kind: "accepted" });
});
