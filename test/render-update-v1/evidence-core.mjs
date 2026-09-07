import assert from "node:assert/strict";
import { runM11RenderVertical } from "../../apps/desktop/test/helpers/m11-render-vertical.mjs";
import {
  assertAccepted, assertFatal, baseline, chain, committedDomain, connectedSender,
  domains, event, expectAtomicFatal, expectInboundAccepted, expectInboundRejected,
  expectOutboundAccepted, expectOutboundRejected, flatNodes, newStore, node, patch,
  settle, snapshot, state, terminalForRaw,
} from "./helpers/render-fixtures.mjs";

let verticalPromise;
const realVertical = () => (verticalPromise ??= runM11RenderVertical());

const validMessages = {
  "wire-valid-domains": domains("d1"),
  "wire-valid-snapshot": snapshot(),
  "wire-valid-patch": patch([], { zIndex: 1 }),
  "wire-valid-event": event(),
};

export const wireEvidence = new Map([
  ...Object.entries(validMessages).map(([id, message]) => [id, () => {
    const raw = JSON.stringify(message);
    assert.deepEqual(expectInboundAccepted(raw), message);
  }]),
  ["wire-top-level-not-object", () => expectInboundRejected("null", /object/)],
  ["wire-invalid-json", () => expectInboundRejected("{", /invalid JSON/)],
  ["wire-unpaired-surrogate", () => expectInboundRejected('{"type":"render.domains","domains":["\\ud800"]}', /Unicode/)],
  ["wire-unknown-type", () => expectInboundRejected('{"type":"render.unknown"}', /unknown/)],
  ["wire-extra-top-level-member", () => expectInboundRejected(JSON.stringify({ ...domains(), extra: true }), /closed schema/)],
  ["wire-missing-required-member", () => expectInboundRejected(JSON.stringify({ type: "render.domains" }), /Missing required/)],
  ["wire-wrong-member-type", () => expectInboundRejected(JSON.stringify({ type: "render.domains", domains: {} }), /array/)],
  ["wire-message-exact-byte-limit", () => {
    const base = JSON.stringify(domains());
    const raw = `${base}${" ".repeat(1_048_576 - Buffer.byteLength(base))}`;
    assert.equal(Buffer.byteLength(raw), 1_048_576);
    assert.deepEqual(expectInboundAccepted(raw), domains());
  }],
  ["wire-message-one-byte-over", () => {
    const base = JSON.stringify(domains());
    const raw = `${base}${" ".repeat(1_048_577 - Buffer.byteLength(base))}`;
    assert.equal(Buffer.byteLength(raw), 1_048_577);
    expectInboundRejected(raw, /byte limit/);
  }],
  ["wire-json-depth-exact-limit", () => {
    let raw = "null";
    for (let index = 0; index < 64; index += 1) raw = `{"child":${raw}}`;
    assert.throws(() => expectInboundAccepted(raw), (error) => !/depth limit/i.test(String(error)));
  }],
  ["wire-json-depth-one-over", () => {
    let raw = "null";
    for (let index = 0; index < 65; index += 1) raw = `{"child":${raw}}`;
    expectInboundRejected(raw, /depth limit/);
  }],
  ["wire-duplicate-source-member-follows-wire-jsonparse", () => assert.deepEqual(
    expectInboundAccepted('{"type":"render.unknown","type":"render.domains","domains":[]}'),
    domains(),
  )],
]);

export const registryEvidence = new Map([
  ["fresh-carrier-first-render-message-domains", async () => {
    const { messages } = await connectedSender();
    assert.equal(messages[0].type, "render.domains");
  }],
  ["registry-empty-valid", () => {
    const store = newStore(1, []);
    assert.deepEqual(store.snapshotForQualification().domains, []);
  }],
  ["registry-full-replacement-atomic", () => {
    const store = newStore(1, ["a", "b"]);
    assertAccepted(store.onDomains(domains("b", "c")));
    assert.deepEqual(store.snapshotForQualification().domains.map(({ domainId }) => domainId), ["b", "c"]);
  }],
  ["registry-duplicate-domain-rejected", () => expectOutboundRejected(domains("d1", "d1"), /duplicate|canonical/)],
  ["registry-exact-count-limit", () => expectOutboundAccepted(domains(...Array.from({ length: 256 }, (_, i) => `d${i}`)))],
  ["registry-one-over-count-limit", () => expectOutboundRejected(domains(...Array.from({ length: 257 }, (_, i) => `d${i}`)), /limit/)],
  ["domain-absent-present-absent", () => {
    const store = newStore(1, []);
    assertAccepted(store.onDomains(domains("d1")));
    assertAccepted(store.onDomains(domains()));
    assert.equal(store.snapshotForQualification().domains.length, 0);
  }],
  ["domain-present-present-same-lifetime", () => {
    const store = baseline();
    assertAccepted(store.onDomains(domains("d1")));
    assert.equal(committedDomain(store).revision, 1);
  }],
  ["emitted-domain-id-one-shot-within-generation", () => {
    const store = baseline();
    assertAccepted(store.onDomains(domains()));
    assertFatal(store.onDomains(domains("d1")), /cannot reappear/);
  }],
  ["removed-domain-id-reintroduced-same-generation-rejected", () => {
    const store = baseline();
    assertAccepted(store.onDomains(domains()));
    assertFatal(store.onDomains(domains("d1")), /cannot reappear/);
  }],
  ["unemitted-coalesced-domain-does-not-consume-wire-id", async () => {
    const { RenderManager } = await import("../../packages/subsystem/dist/internal/render-manager.js");
    const fresh = new RenderManager();
    let unblock;
    const blocked = new Promise((resolve) => { unblock = resolve; });
    const trace = [];
    fresh.setDataPeer({
      binding: { subsystemKey: "demo", generation: 1, dataProfile: "loomrealm.renderer-data/1" },
      render: Object.fromEntries(["sendDomains", "sendSnapshot", "sendPatch", "sendEvent"].map((name) => [name, async (message) => {
        trace.push(message); if (trace.length === 1) await blocked; return { kind: "sent" };
      }])),
    });
    const transient = fresh.createDomain(state());
    transient.close();
    const durable = fresh.createDomain(state([node("durable")]));
    unblock();
    await settle();
    assert.equal(trace.some((message) => message.type === "render.snapshot" && message.roots[0]?.key !== "durable"), false);
    assert.equal(trace.find((message) => message.type === "render.snapshot").domainId, "d2");
    durable.close();
  }],
  ["registry-removal-retires-authoritative-replica", async () => {
    const trace = await realVertical();
    assert.equal(trace.reconnected.domains.length, 1);
    assert.deepEqual(trace.removed.domains, []);
  }],
  ["pending-domain-messages-discarded-after-removal", async () => {
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    let blocked = false;
    const { domain, messages } = await connectedSender({ hook: async (message) => {
      if (blocked && message.type === "render.snapshot") await gate;
    }});
    blocked = true;
    domain.replace(state([node("root", [], { phase: "pending" })]));
    await Promise.resolve();
    domain.emit({ targetKey: "root", name: "pending", data: {} });
    domain.close();
    release();
    await settle();
    assert.equal(messages.some((message) => message.type === "render.event" && message.name === "pending"), false);
    assert.deepEqual(messages.at(-1), domains());
  }],
  ["registry-order-does-not-affect-stacking", () => {
    const store = newStore(1, ["b", "a"]);
    assertAccepted(store.onSnapshot(snapshot("a", 1, [node("a")], 0)));
    assertAccepted(store.onSnapshot(snapshot("b", 1, [node("b")], 0)));
    assert.deepEqual(store.snapshotForQualification().logicalOrder, ["a", "b"]);
  }],
]);

export const baselineEvidence = new Map([
  ["registry-add-domain-starts-unbaselined", () => assert.equal(newStore().snapshotForQualification().domains[0].baselined, false)],
  ["unbaselined-first-authoritative-message-snapshot", () => assertFatal(newStore().onPatch(patch()), /before current baseline/)],
  ["patch-before-baseline-retires-data", async () => {
    const store = newStore();
    const terminal = await terminalForRaw(JSON.stringify(patch()), { onRenderPatch: (message) => store.onPatch(message) });
    assert.equal(terminal.kind, "protocol-fatal");
  }],
  ["wellformed-event-before-baseline-drops", () => {
    const store = newStore(); assertAccepted(store.onEvent(event())); assert.equal(store.snapshotForQualification().events.length, 0);
  }],
  ["registry-may-change-before-all-domains-baselined", () => {
    const store = newStore(1, ["a", "b"]); assertAccepted(store.onSnapshot(snapshot("a"))); assertAccepted(store.onDomains(domains("a", "b", "c")));
  }],
  ["newly-added-domain-baselines-independently", () => {
    const store = baseline(); assertAccepted(store.onDomains(domains("d1", "d2"))); assertAccepted(store.onSnapshot(snapshot("d2", 7))); assert.equal(committedDomain(store, "d2").revision, 7);
  }],
  ["removed-unbaselined-domain-needs-no-snapshot", () => {
    const store = newStore(); assertAccepted(store.onDomains(domains())); assert.equal(store.snapshotForQualification().domains.length, 0);
  }],
  ["fresh-snapshot-arbitrary-positive-revision", () => assert.equal(committedDomain(baseline([], { revision: 91 })).revision, 91)],
  ["fresh-snapshot-not-compared-with-old-carrier-revision", () => {
    const store = baseline([], { revision: 50 }); store.retireCarrier(); store.beginCarrier(); assertAccepted(store.onDomains(domains("d1"))); assertAccepted(store.onSnapshot(snapshot("d1", 2, []))); assert.equal(committedDomain(store).revision, 2);
  }],
  ["fresh-snapshot-same-numeric-revision-different-carrier-valid", () => {
    const store = baseline([], { revision: 4 }); store.retireCarrier(); store.beginCarrier(); assertAccepted(store.onDomains(domains("d1"))); assertAccepted(store.onSnapshot(snapshot("d1", 4, [])));
  }],
  ["post-baseline-snapshot-exact-plus-one", () => assertAccepted(baseline().onSnapshot(snapshot("d1", 2)))],
  ["post-baseline-snapshot-stale-rejected", () => assertFatal(baseline().onSnapshot(snapshot("d1", 1)), /continuity/)],
  ["post-baseline-snapshot-gap-rejected", () => assertFatal(baseline().onSnapshot(snapshot("d1", 3)), /continuity/)],
  ["patch-base-matches-current", () => assertAccepted(baseline().onPatch(patch([], { zIndex: 1 })))],
  ["patch-revision-exactly-plus-one", () => assert.equal((() => { const store = baseline(); assertAccepted(store.onPatch(patch([], { zIndex: 1 }))); return committedDomain(store).revision; })(), 2)],
  ["patch-base-mismatch-rejected", () => assertFatal(baseline().onPatch(patch([], { baseRevision: 0, revision: 1, zIndex: 1 })), /continuity/)],
  ["patch-gap-revision-rejected", () => assertFatal(baseline().onPatch(patch([], { revision: 3, zIndex: 1 })), /continuity/)],
  ["revision-never-wraps", async () => {
    const connected = await connectedSender(); const oldId = connected.messages[1].domainId; connected.manager.setRevisionForQualification(oldId, Number.MAX_SAFE_INTEGER); connected.domain.replace(state([node("root", [], { changed: "yes" })])); await settle(); assert.notEqual(connected.messages.at(-1).domainId, oldId); assert.equal(connected.messages.at(-1).revision, 1);
  }],
]);

function minimalNodes(count) {
  return Array.from({ length: count }, (_, index) => node(index.toString(36), [], {}, {}, "x"));
}

export const snapshotEvidence = new Map([
  ["snapshot-zero-root-domain", () => assert.deepEqual(committedDomain(baseline([])).roots, [])],
  ["snapshot-multiple-roots-preserve-order", () => assert.deepEqual(committedDomain(baseline([node("b"), node("a")])).roots.map(({ key }) => key), ["b", "a"])],
  ["snapshot-atomic-replacement", () => { const store = baseline(); assertAccepted(store.onSnapshot(snapshot("d1", 2, [node("next")]))); assert.deepEqual(committedDomain(store).roots.map(({ key }) => key), ["next"]); }],
  ["snapshot-node-key-domain-wide-unique", () => assertAccepted(newStore().onSnapshot(snapshot("d1", 1, [node("a", [node("b")]), node("c")])))],
  ["snapshot-node-key-duplicate-rejected", () => { const store = baseline(); expectAtomicFatal(store, () => store.onSnapshot(snapshot("d1", 2, [node("dup"), node("dup")])), /Duplicate/); }],
  ["snapshot-live-key-tag-stable", () => { const store = baseline([node("same", [], {}, {}, "a")]); assertAccepted(store.onSnapshot(snapshot("d1", 2, [node("same", [], {}, {}, "a")]))); }],
  ["snapshot-live-key-tag-change-rejected", () => { const store = baseline([node("same", [], {}, {}, "a")]); expectAtomicFatal(store, () => store.onSnapshot(snapshot("d1", 2, [node("same", [], {}, {}, "b")])), /tag changed/); }],
  ["snapshot-fresh-key-introduced", () => { const store = baseline(); assertAccepted(store.onSnapshot(snapshot("d1", 2, [node("root"), node("fresh")]))); }],
  ["snapshot-previously-removed-key-reintroduced-rejected", () => { const store = baseline([node("once")]); assertAccepted(store.onSnapshot(snapshot("d1", 2, []))); assertFatal(store.onSnapshot(snapshot("d1", 3, [node("once")])), /reintroduced/); }],
  ["snapshot-removal-consumes-key", () => { const store = baseline([node("once")]); assertAccepted(store.onSnapshot(snapshot("d1", 2, []))); assertFatal(store.onSnapshot(snapshot("d1", 3, [node("once")])), /Consumed/); }],
  ["same-generation-fresh-baseline-can-contain-still-live-key", () => { const store = baseline([node("live")]); store.retireCarrier(); store.beginCarrier(); assertAccepted(store.onDomains(domains("d1"))); assertAccepted(store.onSnapshot(snapshot("d1", 9, [node("live")]))); }],
  ["snapshot-invalid-tree-no-partial-commit", () => { const store = baseline(); expectAtomicFatal(store, () => store.onSnapshot(snapshot("d1", 2, [node("dup"), node("dup")])), /Duplicate/); }],
  ["snapshot-exact-node-count-limit", () => assertAccepted(newStore().onSnapshot(snapshot("d1", 1, minimalNodes(16_384))))],
  ["snapshot-one-over-node-count-limit", () => assertFatal(newStore().onSnapshot(snapshot("d1", 1, minimalNodes(16_385))), /count limit/)],
  ["snapshot-exact-tree-depth-limit", () => assertAccepted(newStore().onSnapshot(snapshot("d1", 1, [chain(30)])))],
  ["snapshot-one-over-tree-depth-limit", () => assertFatal(newStore().onSnapshot(snapshot("d1", 1, [chain(31)])), /depth limit/)],
  ["zindex-min", () => assert.equal(expectInboundAccepted(JSON.stringify(snapshot("d1", 1, [], -2_147_483_648))).zIndex, -2_147_483_648)],
  ["zindex-max", () => assert.equal(expectInboundAccepted(JSON.stringify(snapshot("d1", 1, [], 2_147_483_647))).zIndex, 2_147_483_647)],
  ["zindex-below-min", () => expectInboundRejected(JSON.stringify(snapshot("d1", 1, [], -2_147_483_649)), /zIndex/)],
  ["zindex-above-max", () => expectInboundRejected(JSON.stringify(snapshot("d1", 1, [], 2_147_483_648)), /zIndex/)],
  ["higher-zindex-above-lower", () => { const store = newStore(1, ["high", "low"]); assertAccepted(store.onSnapshot(snapshot("high", 1, [], 2))); assertAccepted(store.onSnapshot(snapshot("low", 1, [], 1))); assert.deepEqual(store.snapshotForQualification().logicalOrder, ["low", "high"]); }],
  ["same-zindex-domainid-utf8-lexical-tiebreak", () => { const store = newStore(1, ["é", "z"]); assertAccepted(store.onSnapshot(snapshot("é", 1, []))); assertAccepted(store.onSnapshot(snapshot("z", 1, []))); assert.deepEqual(store.snapshotForQualification().logicalOrder, ["z", "é"]); }],
  ["registry-order-not-stacking-order", () => { const store = newStore(1, ["high", "low"]); assertAccepted(store.onSnapshot(snapshot("high", 1, [], 2))); assertAccepted(store.onSnapshot(snapshot("low", 1, [], 1))); assert.deepEqual(store.snapshotForQualification().logicalOrder, ["low", "high"]); }],
]);
