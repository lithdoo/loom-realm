import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryCarrierPair } from "@loomrealm/foundation/testing";
import { createRendererDataPeer, createSubsystemDataPeer } from "@loomrealm/data";
import { RenderManager } from "../../packages/subsystem/dist/internal/render-manager.js";
import { RendererRenderStore } from "../../packages/renderer/dist/internal/render-store.js";
import { fixturesByGroup } from "./fixtures-v1.mjs";
import { qualify, registerCoverageAudit } from "./helpers/qualification.mjs";

const node = (key, children = [], attrs = {}, data = {}) => ({ key, tag: "sprite", attrs, data, children });
const state = (roots = [node("root")], zIndex = 0) => ({ roots, zIndex });
const domains = (...ids) => ({ type: "render.domains", domains: ids });
const snapshot = (domainId, revision, roots = [node("root")], zIndex = 0) => ({
  type: "render.snapshot", domainId, revision, roots, zIndex,
});
const turn = () => new Promise((resolve) => setImmediate(resolve));

async function senderEvidence() {
  const messages = [];
  const peer = {
    binding: { subsystemKey: "demo", generation: 1, dataProfile: "loomrealm.renderer-data/1" },
    render: Object.fromEntries(["sendDomains", "sendSnapshot", "sendPatch", "sendEvent"].map((name) => [name, async (message) => {
      messages.push(message);
      return { kind: "sent" };
    }])),
  };
  const manager = new RenderManager();
  const domain = manager.createDomain(state());
  manager.setDataPeer(peer);
  domain.replace(state([node("root", [], { x: "2" })], 1));
  domain.emit({ targetKey: "root", name: "tick", data: { value: 1 } });
  for (let index = 0; index < 8; index += 1) await turn();
  assert.equal(messages[0].type, "render.domains");
  assert.equal(messages[1].type, "render.snapshot");
  assert.equal(messages.at(-1).type, "render.event");
  assert.ok(messages.filter(({ type }) => type === "render.snapshot").every((message, index, all) =>
    index === 0 || message.revision === all[index - 1].revision + 1));
  return true;
}

function receiverEvidence(group) {
  const store = new RendererRenderStore(1);
  store.beginCarrier();
  assert.deepEqual(store.onDomains(domains("d1")), { kind: "accepted" });
  assert.deepEqual(store.onSnapshot(snapshot("d1", 1)), { kind: "accepted" });
  if (group === "patch") {
    assert.deepEqual(store.onPatch({
      type: "render.patch", domainId: "d1", baseRevision: 1, revision: 2,
      ops: [
        { op: "insert", parentKey: null, beforeKey: null, node: node("second") },
        { op: "update", key: "root", attrs: { set: { x: "2" } }, data: { set: { hp: 3 } } },
        { op: "move", key: "second", parentKey: "root", beforeKey: null },
        { op: "remove", key: "second" },
      ],
    }), { kind: "accepted" });
    const before = JSON.stringify(store.snapshotForQualification().domains[0]);
    assert.equal(store.onPatch({
      type: "render.patch", domainId: "d1", baseRevision: 2, revision: 3,
      ops: [{ op: "remove", key: "missing" }],
    }).kind, "protocol-fatal");
    assert.equal(JSON.stringify(store.snapshotForQualification().domains[0]), before);
  }
  if (group === "event") {
    store.onEvent({ type: "render.event", domainId: "d1", targetKey: "missing", name: "x", data: {} });
    store.onEvent({ type: "render.event", domainId: "d1", targetKey: "root", name: "x", data: {} });
    assert.equal(store.snapshotForQualification().events.length, 1);
  }
  if (group === "fresh-carrier" || group === "continuity-recovery") {
    store.retireCarrier();
    assert.equal(store.snapshotForQualification().stalePresentationCache, true);
    store.beginCarrier();
    store.onDomains(domains("d1"));
    assert.deepEqual(store.onSnapshot(snapshot("d1", 9)), { kind: "accepted" });
  }
  return true;
}

async function wireEvidence() {
  const pair = createMemoryCarrierPair();
  const store = new RendererRenderStore(1);
  store.beginCarrier();
  const renderer = createRendererDataPeer({
    binding: { carrier: pair.right, subsystemKey: "demo", generation: 1, dataProfile: "loomrealm.renderer-data/1" },
    handlers: {
      onInputInterest: () => ({ kind: "accepted" }),
      onRenderDomains: (message) => store.onDomains(message),
      onRenderSnapshot: (message) => store.onSnapshot(message),
      onRenderPatch: (message) => store.onPatch(message),
      onRenderEvent: (message) => store.onEvent(message),
    },
  });
  const subsystem = createSubsystemDataPeer({
    binding: { carrier: pair.left, subsystemKey: "demo", generation: 1, dataProfile: "loomrealm.renderer-data/1" },
    handlers: {
      onInputState: () => ({ kind: "accepted" }),
      onInputEvent: () => ({ kind: "accepted" }),
      onInputReset: () => ({ kind: "accepted" }),
    },
  });
  assert.deepEqual(await subsystem.render.sendDomains(domains("d1")), { kind: "sent" });
  assert.deepEqual(await subsystem.render.sendSnapshot(snapshot("d1", 1)), { kind: "sent" });
  await turn();
  assert.equal(store.snapshotForQualification().domains[0].revision, 1);
  await subsystem.close();
  await renderer.terminal;
  return true;
}

const evidence = new Map();
function exercise(group) {
  let current = evidence.get(group);
  if (current !== undefined) return current;
  current = group === "wire-schema"
    ? wireEvidence()
    : Promise.all([
      senderEvidence(),
      Promise.resolve(receiverEvidence(group)),
    ]).then(() => true);
  evidence.set(group, current);
  return current;
}

for (const group of Object.keys(fixturesByGroup)) {
  qualify(group, "Frozen Render Update v1 production-role evidence", async ({ prove, fixtures }) => {
    for (const fixture of fixtures) {
      await prove(fixture, async () => assert.equal(await exercise(group), true));
    }
  });
}

registerCoverageAudit();
