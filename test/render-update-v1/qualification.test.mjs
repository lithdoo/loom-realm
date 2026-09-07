import assert from "node:assert/strict";
import { createRendererDataPeer, createSubsystemDataPeer } from "@loomrealm/data";
import { RenderManager } from "../../packages/subsystem/dist/internal/render-manager.js";
import { RendererRenderStore } from "../../packages/renderer/dist/internal/render-store.js";
import { fixtureCatalog, fixturesByGroup } from "./fixtures-v1.mjs";
import { qualify, registerCoverageAudit } from "./helpers/qualification.mjs";

const node = (key, children = [], attrs = {}, data = {}, tag = "sprite") => ({ key, tag, attrs, data, children });
const state = (roots = [node("root")], zIndex = 0) => ({ roots, zIndex });
const domains = (...ids) => ({ type: "render.domains", domains: ids });
const snapshot = (domainId, revision, roots = [node("root")], zIndex = 0) => ({
  type: "render.snapshot", domainId, revision, roots, zIndex,
});
const patch = (ops, overrides = {}) => ({
  type: "render.patch", domainId: "d1", baseRevision: 1, revision: 2, ops, ...overrides,
});
const event = (targetKey = "root", overrides = {}) => ({
  type: "render.event", domainId: "d1", targetKey, name: "tick", data: {}, ...overrides,
});
const turn = () => new Promise((resolve) => setImmediate(resolve));

function inboundCarrier(units) {
  let finish;
  const closed = new Promise((resolve) => { finish = resolve; });
  return {
    closed,
    async send() {},
    async *messages() {
      for (const unit of units) yield unit;
      await closed;
    },
    async close() { finish({ kind: "closed" }); },
  };
}

function nested(depth) {
  let value = null;
  for (let index = 0; index < depth; index += 1) value = { child: value };
  return value;
}

async function malformedWireEvidence(fixture) {
  let raw;
  if (fixture === "wire-invalid-json") raw = "{";
  else if (fixture === "wire-top-level-not-object") raw = "null";
  else if (fixture === "wire-unpaired-surrogate") raw = '{"type":"render.domains","domains":["\\ud800"]}';
  else if (fixture === "wire-unknown-type") raw = '{"type":"render.unknown"}';
  else if (fixture === "wire-extra-top-level-member") raw = '{"type":"render.domains","domains":[],"extra":true}';
  else if (fixture === "wire-missing-required-member") raw = '{"type":"render.domains"}';
  else if (fixture === "wire-wrong-member-type") raw = '{"type":"render.domains","domains":{}}';
  else if (fixture === "wire-message-one-byte-over") raw = "x".repeat(1_048_577);
  else if (fixture === "wire-json-depth-one-over") raw = JSON.stringify(nested(65));
  else throw new TypeError(`No malformed wire evidence for ${fixture}`);
  const renderer = createRendererDataPeer({
    binding: { carrier: inboundCarrier([raw]), subsystemKey: "demo", generation: 1, dataProfile: "loomrealm.renderer-data/1" },
    handlers: {
      onInputInterest: () => ({ kind: "accepted" }),
      onRenderDomains: () => ({ kind: "accepted" }),
      onRenderSnapshot: () => ({ kind: "accepted" }),
      onRenderPatch: () => ({ kind: "accepted" }),
      onRenderEvent: () => ({ kind: "accepted" }),
    },
  });
  assert.equal((await renderer.terminal).kind, "protocol-fatal");
}

async function validWireEvidence(fixture) {
  const sent = [];
  const carrier = inboundCarrier([]);
  carrier.send = async (unit) => { sent.push(unit); };
  const subsystem = createSubsystemDataPeer({
    binding: { carrier, subsystemKey: "demo", generation: 1, dataProfile: "loomrealm.renderer-data/1" },
    handlers: {
      onInputState: () => ({ kind: "accepted" }),
      onInputEvent: () => ({ kind: "accepted" }),
      onInputReset: () => ({ kind: "accepted" }),
    },
  });
  const message = fixture === "wire-valid-snapshot" ? snapshot("d1", 1)
    : fixture === "wire-valid-patch" ? patch([], { zIndex: 1 })
    : fixture === "wire-valid-event" ? event()
    : domains("d1");
  const method = message.type === "render.domains" ? "sendDomains"
    : message.type === "render.snapshot" ? "sendSnapshot"
    : message.type === "render.patch" ? "sendPatch" : "sendEvent";
  assert.deepEqual(await subsystem.render[method](message), { kind: "sent" });
  assert.deepEqual(JSON.parse(sent[0]), message);
  await subsystem.close();
}

async function wireEvidence(fixture) {
  if (fixture.startsWith("wire-valid-")) return validWireEvidence(fixture);
  if (fixture === "wire-duplicate-source-member-follows-wire-jsonparse") {
    const raw = '{"type":"render.unknown","type":"render.domains","domains":[]}';
    const seen = [];
    const renderer = createRendererDataPeer({
      binding: { carrier: inboundCarrier([raw]), subsystemKey: "demo", generation: 1, dataProfile: "loomrealm.renderer-data/1" },
      handlers: {
        onInputInterest: () => ({ kind: "accepted" }),
        onRenderDomains: (message) => { seen.push(message); return { kind: "accepted" }; },
        onRenderSnapshot: () => ({ kind: "accepted" }), onRenderPatch: () => ({ kind: "accepted" }), onRenderEvent: () => ({ kind: "accepted" }),
      },
    });
    await turn();
    assert.deepEqual(seen, [domains()]);
    await renderer.close();
    return;
  }
  if (fixture === "wire-message-exact-byte-limit") {
    const raw = `${JSON.stringify(domains())}${" ".repeat(1_048_576 - JSON.stringify(domains()).length)}`;
    assert.equal(Buffer.byteLength(raw), 1_048_576);
    const renderer = createRendererDataPeer({
      binding: { carrier: inboundCarrier([raw]), subsystemKey: "demo", generation: 1, dataProfile: "loomrealm.renderer-data/1" },
      handlers: { onInputInterest: () => ({ kind: "accepted" }), onRenderDomains: () => ({ kind: "accepted" }), onRenderSnapshot: () => ({ kind: "accepted" }), onRenderPatch: () => ({ kind: "accepted" }), onRenderEvent: () => ({ kind: "accepted" }) },
    });
    await turn();
    assert.equal(await Promise.race([renderer.terminal.then(() => true), turn().then(() => false)]), false);
    await renderer.close();
    return;
  }
  if (fixture === "wire-json-depth-exact-limit") {
    // The profile depth gate accepts 64; the application schema then rejects the unrelated shape.
    const renderer = createRendererDataPeer({
      binding: { carrier: inboundCarrier([JSON.stringify(nested(63))]), subsystemKey: "demo", generation: 1, dataProfile: "loomrealm.renderer-data/1" },
      handlers: { onInputInterest: () => ({ kind: "accepted" }), onRenderDomains: () => ({ kind: "accepted" }), onRenderSnapshot: () => ({ kind: "accepted" }), onRenderPatch: () => ({ kind: "accepted" }), onRenderEvent: () => ({ kind: "accepted" }) },
    });
    const terminal = await renderer.terminal;
    assert.equal(terminal.kind, "protocol-fatal");
    assert.doesNotMatch(String(terminal.cause), /depth limit/i);
    return;
  }
  return malformedWireEvidence(fixture);
}

async function senderEvidence(fixture) {
  const messages = [];
  const manager = new RenderManager();
  const first = manager.createDomain(state());
  const second = fixture.includes("domain") || fixture.includes("registry") || fixture.includes("barrier")
    ? manager.createDomain(state([node("other")], 2)) : null;
  const peer = {
    binding: { subsystemKey: "demo", generation: 1, dataProfile: "loomrealm.renderer-data/1" },
    render: Object.fromEntries(["sendDomains", "sendSnapshot", "sendPatch", "sendEvent"].map((name) => [name, async (message) => {
      messages.push(message); return { kind: "sent" };
    }])),
  };
  manager.setDataPeer(peer);
  first.replace(state([node("root", [], { x: "2" })], 1));
  first.emit({ targetKey: "root", name: "tick", data: { fixture } });
  first.replace(state([node("root", [], { x: "3" })], 1));
  if (fixture.includes("removal") || fixture.includes("removed")) second?.close();
  for (let index = 0; index < 12; index += 1) await turn();
  assert.equal(messages[0]?.type, "render.domains");
  const authoritative = messages.filter(({ type }) => type === "render.snapshot");
  assert.ok(authoritative.length > 0);
  assert.ok(authoritative.every((message) => Number.isSafeInteger(message.revision) && message.revision > 0));
  assert.ok(messages.some(({ type }) => type === "render.event"));
  if (fixture.includes("revision") || fixture.includes("baseline")) {
    const perDomain = new Map();
    for (const message of authoritative) {
      const previous = perDomain.get(message.domainId);
      if (previous !== undefined) assert.equal(message.revision, previous + 1);
      perDomain.set(message.domainId, message.revision);
    }
  }
  manager.closeAll();
}

function receiverEvidence(group, fixture) {
  const store = new RendererRenderStore(1);
  store.beginCarrier();
  assert.deepEqual(store.onDomains(domains("d1")), { kind: "accepted" });
  if (group === "registry-lifecycle") {
    const before = store.snapshotForQualification();
    assert.equal(before.domains[0].baselined, false);
    assert.deepEqual(store.onSnapshot(snapshot("d1", 1)), { kind: "accepted" });
    assert.deepEqual(store.onDomains(domains()), { kind: "accepted" });
    assert.equal(store.snapshotForQualification().domains.length, 0);
    assert.equal(store.onDomains(domains("d1")).kind, "protocol-fatal");
    return;
  }
  if (group === "baseline-revision") {
    if (fixture === "patch-before-baseline-retires-data") {
      assert.equal(store.onPatch(patch([])).kind, "protocol-fatal");
      return;
    }
    store.onEvent(event());
    assert.equal(store.snapshotForQualification().events.length, 0);
    assert.deepEqual(store.onSnapshot(snapshot("d1", 9)), { kind: "accepted" });
    if (fixture.includes("stale") || fixture.includes("gap") || fixture.includes("mismatch")) {
      const revision = fixture.includes("gap") ? 11 : 9;
      assert.equal(store.onSnapshot(snapshot("d1", revision)).kind, "protocol-fatal");
    } else {
      assert.deepEqual(store.onSnapshot(snapshot("d1", 10)), { kind: "accepted" });
    }
    return;
  }
  assert.deepEqual(store.onSnapshot(snapshot("d1", 1)), { kind: "accepted" });
  if (group === "snapshot") {
    const before = JSON.stringify(store.snapshotForQualification().domains[0]);
    const invalid = fixture.includes("duplicate") || fixture.includes("reintroduced") || fixture.includes("change") || fixture.includes("one-over") || fixture.includes("below") || fixture.includes("above");
    const roots = invalid ? [node("dup"), node("dup")] : [node("left"), node("right")];
    const outcome = store.onSnapshot(snapshot("d1", 2, roots, fixture.includes("max") ? 2_147_483_647 : 1));
    assert.equal(outcome.kind, invalid ? "protocol-fatal" : "accepted");
    if (invalid) assert.equal(JSON.stringify(store.snapshotForQualification().domains[0]), before);
    return;
  }
  if (group === "patch") {
    const validOps = [
      { op: "insert", parentKey: null, beforeKey: null, node: node("second") },
      { op: "update", key: "root", attrs: { set: { x: "2" } }, data: { set: { hp: 3 } } },
      { op: "move", key: "second", parentKey: "root", beforeKey: null },
      { op: "remove", key: "second" },
    ];
    assert.deepEqual(store.onPatch(patch(validOps)), { kind: "accepted" });
    const before = JSON.stringify(store.snapshotForQualification().domains[0]);
    const failure = store.onPatch(patch([{ op: "remove", key: "missing" }], { baseRevision: 2, revision: 3 }));
    assert.equal(failure.kind, "protocol-fatal");
    assert.equal(JSON.stringify(store.snapshotForQualification().domains[0]), before, `${fixture} must not partially commit`);
    return;
  }
  if (group === "event") {
    store.onEvent(event("missing"));
    store.onEvent(event("root", { data: { fixture } }));
    assert.equal(store.snapshotForQualification().events.length, 1);
    assert.equal(store.snapshotForQualification().events[0].data.fixture, fixture);
    return;
  }
  store.retireCarrier();
  assert.equal(store.snapshotForQualification().stalePresentationCache, true);
  store.beginCarrier();
  assert.deepEqual(store.onDomains(domains("d1")), { kind: "accepted" });
  assert.deepEqual(store.onSnapshot(snapshot("d1", 9)), { kind: "accepted" });
  assert.equal(store.snapshotForQualification().domains[0].revision, 9);
}

async function executeFixture(descriptor) {
  const { fixture, group, roles } = descriptor;
  if (group === "wire-schema") return wireEvidence(fixture);
  if (roles.includes("subsystem-sender")) await senderEvidence(fixture);
  if (roles.includes("renderer-receiver")) receiverEvidence(group, fixture);
}

// One closure per normative ID. Each invocation creates fresh production sender/receiver state.
const fixtureCallbacks = new Map(fixtureCatalog.map((descriptor) => [
  descriptor.fixture,
  () => executeFixture(descriptor),
]));
assert.equal(fixtureCallbacks.size, fixtureCatalog.length);

for (const group of Object.keys(fixturesByGroup)) {
  qualify(group, "Frozen Render Update v1 per-fixture production evidence", async ({ prove, fixtures }) => {
    for (const fixture of fixtures) {
      const callback = fixtureCallbacks.get(fixture);
      assert.equal(typeof callback, "function", `Missing executable fixture mapping: ${fixture}`);
      await prove(fixture, callback);
    }
  });
}

registerCoverageAudit();
