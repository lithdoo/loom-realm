import assert from "node:assert/strict";
import { RenderManager } from "../../packages/subsystem/dist/internal/render-manager.js";
import { runM11RenderVertical } from "../../apps/desktop/test/helpers/m11-render-vertical.mjs";
import {
  assertAccepted, baseline, committedDomain, connectedSender, deferred, domains, event,
  inboundCarrier, newStore, node, patch, realSenderPeer, senderHarness,
  settle, snapshot, state, terminalForRaw, turn,
} from "./helpers/render-fixtures.mjs";

const replaceState = (phase) => state([node("root", [], { phase })]);
let verticalPromise;
const realVertical = () => (verticalPromise ??= runM11RenderVertical());

async function generationTransition() {
  const manager = new RenderManager();
  const domain = manager.createDomain(state([node("once")]));
  const first = senderHarness(1);
  manager.setDataPeer(first.peer);
  await settle();
  const second = senderHarness(2);
  manager.setDataPeer(second.peer);
  await settle();
  return { manager, domain, first: first.messages, second: second.messages };
}

async function reconnectTrace() {
  const manager = new RenderManager();
  const domain = manager.createDomain(state());
  const first = senderHarness(1);
  manager.setDataPeer(first.peer);
  await settle();
  domain.emit({ targetKey: "root", name: "old", data: {} });
  await settle();
  manager.setDataPeer(null);
  const second = senderHarness(1);
  manager.setDataPeer(second.peer);
  await settle();
  return { manager, domain, first: first.messages, second: second.messages };
}

async function invalidCarrier(raw, store = newStore()) {
  return terminalForRaw(raw, {
    onRenderDomains: (value) => store.onDomains(value),
    onRenderSnapshot: (value) => store.onSnapshot(value),
    onRenderPatch: (value) => store.onPatch(value),
    onRenderEvent: (value) => store.onEvent(value),
  });
}

async function sameDomainBarrier() {
  const gate = deferred();
  let block = false;
  const connected = await connectedSender({ hook: async (message) => {
    if (block && message.type === "render.snapshot") { block = false; await gate.promise; }
  }});
  block = true;
  connected.domain.replace(replaceState("before"));
  connected.domain.emit({ targetKey: "root", name: "barrier", data: {} });
  connected.domain.replace(replaceState("after"));
  await turn();
  gate.resolve();
  await settle();
  assert.deepEqual(connected.messages.slice(-3).map(({ type }) => type), ["render.snapshot", "render.event", "render.snapshot"]);
}

export const eventEvidence = new Map([
  ["emitted-means-current-carrier-ordered-send-accepted", async () => { const connected = await connectedSender(); connected.domain.emit({ targetKey: "root", name: "ordered", data: {} }); await settle(); assert.deepEqual(connected.messages.slice(0, 3).map(({ type }) => type), ["render.domains", "render.snapshot", "render.event"]); }],
  ["emitted-authoritative-message-never-retracted", async () => { const connected = await connectedSender(); connected.domain.replace(replaceState("committed")); await settle(); const emitted = connected.messages.at(-1); connected.domain.close(); await settle(); assert.ok(connected.messages.includes(emitted)); }],
  ["send-accepted-then-loss-no-retry", async () => { const trace = await reconnectTrace(); const firstCount = trace.first.length; await settle(); assert.equal(trace.first.length, firstCount); assert.equal(trace.second.some(({ type }) => type === "render.event"), false); }],
  ["unsent-desired-state-may-rediff", async () => { const gate = deferred(); let block = false; const connected = await connectedSender({ hook: async (message) => { if (block && message.type === "render.snapshot") { block = false; await gate.promise; } } }); block = true; connected.domain.replace(replaceState("old")); connected.domain.replace(replaceState("latest")); await turn(); gate.resolve(); await settle(); assert.equal(connected.messages.at(-1).roots[0].attrs.phase, "latest"); }],
  ["snapshot-fallback-uses-next-revision", async () => { const connected = await connectedSender(); connected.domain.replace(replaceState("next")); await settle(); assert.deepEqual(connected.messages.filter(({ type }) => type === "render.snapshot").map(({ revision }) => revision), [1, 2]); }],
  ["registry-unsent-latest-state-coalescing", async () => { const gate = deferred(); const manager = new RenderManager(); const wire = senderHarness(1, async (_message, index) => { if (index === 0) await gate.promise; }); manager.setDataPeer(wire.peer); const transient = manager.createDomain(state()); transient.close(); manager.createDomain(state([node("durable")])); gate.resolve(); await settle(); assert.deepEqual(wire.messages.filter(({ type }) => type === "render.domains").at(-1).domains, ["d2"]); }],
  ["retained-event-preserves-causal-wire-position", sameDomainBarrier],
  ["domain-removal-discards-pending-unsent-domain-messages", async () => { const gate = deferred(); let block = false; const connected = await connectedSender({ hook: async (message) => { if (block && message.type === "render.snapshot") { block = false; await gate.promise; } } }); block = true; connected.domain.replace(replaceState("pending")); connected.domain.emit({ targetKey: "root", name: "discard", data: {} }); connected.domain.close(); gate.resolve(); await settle(); assert.equal(connected.messages.some(({ type, name }) => type === "render.event" && name === "discard"), false); }],
  ["event-after-baseline-current-target-delivered", () => { const store = baseline(); assertAccepted(store.onEvent(event())); assert.equal(store.snapshotForQualification().events.length, 1); }],
  ["event-before-baseline-dropped", () => { const store = newStore(); assertAccepted(store.onEvent(event())); assert.equal(store.snapshotForQualification().events.length, 0); }],
  ["wellformed-event-unknown-domain-dropped", () => { const store = baseline(); assertAccepted(store.onEvent(event("root", { domainId: "unknown" }))); assert.equal(store.snapshotForQualification().events.length, 0); }],
  ["wellformed-event-after-domain-removal-dropped", () => { const store = baseline(); assertAccepted(store.onDomains(domains())); assertAccepted(store.onEvent(event())); assert.equal(store.snapshotForQualification().events.length, 0); }],
  ["wellformed-event-stale-target-dropped", () => { const store = baseline(); assertAccepted(store.onEvent(event("missing"))); assert.equal(store.snapshotForQualification().events.length, 0); }],
  ["malformed-event-retires-data", async () => assert.equal((await invalidCarrier(JSON.stringify({ ...event(), extra: true }))).kind, "protocol-fatal")],
  ["oversize-event-retires-data", async () => assert.equal((await invalidCarrier("x".repeat(1_048_577))).kind, "protocol-fatal")],
  ["patch-insert-then-event-targets-new-lifetime", () => { const store = baseline(); assertAccepted(store.onPatch(patch([{ op: "insert", parentKey: null, beforeKey: null, node: node("new") }]))); assertAccepted(store.onEvent(event("new"))); assert.equal(store.snapshotForQualification().events.length, 1); }],
  ["event-before-remove-targets-old-lifetime", () => { const store = baseline(); assertAccepted(store.onEvent(event())); assertAccepted(store.onPatch(patch([{ op: "remove", key: "root" }]))); assert.equal(store.snapshotForQualification().events.length, 1); }],
  ["event-order-preserved", () => { const store = baseline(); store.onEvent(event("root", { name: "a" })); store.onEvent(event("root", { name: "b" })); assert.deepEqual(store.snapshotForQualification().events.map(({ name }) => name), ["a", "b"]); }],
  ["event-not-coalesced", () => { const store = baseline(); store.onEvent(event("root", { data: { n: 1 } })); store.onEvent(event("root", { data: { n: 2 } })); assert.equal(store.snapshotForQualification().events.length, 2); }],
  ["event-loss-not-replayed", async () => { const trace = await reconnectTrace(); assert.equal(trace.second.some(({ type }) => type === "render.event"), false); }],
  ["event-overflow-does-not-block-authoritative-progress", async () => { const gate = deferred(); let block = false; const connected = await connectedSender({ hook: async (message) => { if (block && message.type === "render.snapshot") { block = false; await gate.promise; } } }); block = true; connected.domain.replace(replaceState("blocked")); await turn(); for (let i = 0; i < 1_500; i += 1) connected.domain.emit({ targetKey: "root", name: "pulse", data: { i } }); connected.domain.replace(replaceState("latest")); assert.ok(connected.manager.snapshotForQualification().pendingWork <= 1_024); gate.resolve(); await settle(); assert.equal(connected.messages.at(-1).type, "render.snapshot"); assert.equal(connected.messages.at(-1).roots[0].attrs.phase, "latest"); }],
  ["retained-event-blocks-authoritative-coalesce-across-barrier", sameDomainBarrier],
  ["dropped-unemitted-event-releases-coalescing-barrier", async () => { const manager = new RenderManager(); const domain = manager.createDomain(state()); domain.emit({ targetKey: "root", name: "offline", data: {} }); const wire = senderHarness(); manager.setDataPeer(wire.peer); domain.replace(replaceState("a")); domain.replace(replaceState("b")); await settle(); assert.equal(wire.messages.some(({ type }) => type === "render.event"), false); assert.equal(wire.messages.filter(({ type }) => type === "render.snapshot").length, 1); }],
]);

export const freshCarrierEvidence = new Map([
  ["carrier-loss-ends-current-render-stream", async () => { const trace = await realVertical(); assert.equal(trace.retired.currentCarrier, false); }],
  ["old-store-becomes-stale-presentation-cache", async () => { const trace = await realVertical(); assert.equal(trace.retired.stalePresentationCache, true); }],
  ["old-store-not-patch-base", async () => { const trace = await realVertical(); assert.equal(trace.rebaselined.domains[0].revision, 1); }],
  ["old-store-not-input-or-data-authority", async () => { const trace = await realVertical(); assert.equal(trace.retired.currentCarrier, false); assert.equal(trace.reconnected.currentCarrier, true); }],
  ["fresh-carrier-registry-first", async () => { const trace = await reconnectTrace(); assert.equal(trace.second[0].type, "render.domains"); }],
  ["fresh-carrier-snapshot-each-current-domain", async () => { const manager = new RenderManager(); manager.createDomain(state([node("a")])); manager.createDomain(state([node("b")])); const one = senderHarness(); manager.setDataPeer(one.peer); await settle(); const two = senderHarness(); manager.setDataPeer(two.peer); await settle(); assert.equal(two.messages.filter(({ type }) => type === "render.snapshot").length, 2); }],
  ["same-generation-reconnect-fresh-publication-baseline", async () => { const trace = await reconnectTrace(); assert.equal(trace.second[1].revision, 1); }],
  ["same-generation-reconnect-does-not-recreate-wire-domain", async () => { const trace = await reconnectTrace(); assert.equal(trace.second[1].domainId, trace.first[1].domainId); }],
  ["reconnect-does-not-replay-event", async () => { const trace = await reconnectTrace(); assert.equal(trace.second.some(({ type }) => type === "render.event"), false); }],
  ["reconnect-does-not-fail-runtime", async () => { const trace = await realVertical(); assert.equal(trace.mainFailure, null); assert.equal(trace.activeAfterReconnect, true); }],
  ["reconnect-does-not-unwind-frame", async () => { const trace = await realVertical(); assert.equal(trace.reconnected.domains[0].roots[0].attrs.phase, "reconnected"); }],
]);

export const continuityEvidence = new Map([
  ["same-generation-reconnect-preserves-wire-domain-lifetime", async () => { const trace = await reconnectTrace(); assert.equal(trace.second[1].domainId, trace.first[1].domainId); }],
  ["same-generation-reconnect-preserves-node-one-shot-history-at-sender", async () => { const trace = await reconnectTrace(); trace.domain.replace(state([])); assert.throws(() => trace.domain.replace(state([node("root")])), /reused/); }],
  ["fresh-generation-creates-new-render-wire-universe", async () => { const transition = await generationTransition(); const g1 = baseline([node("once")], { generation: 1 }); const g2 = baseline([node("once")], { generation: 2 }); assert.notEqual(g1.snapshotForQualification().generation, g2.snapshotForQualification().generation); assert.equal(transition.second[1].revision, 1); }],
  ["fresh-generation-may-reexport-surviving-business-domain", async () => { const transition = await generationTransition(); assert.equal(transition.second[1].domainId, transition.first[1].domainId); assert.equal(transition.second[1].roots[0].key, "once"); }],
  ["same-string-domain-id-new-generation-is-fresh-wire-identity", () => { const g1 = baseline([], { generation: 1 }); g1.onDomains(domains()); const g2 = newStore(2); assertAccepted(g2.onSnapshot(snapshot())); }],
  ["same-string-node-key-new-generation-is-fresh-wire-identity", () => { const g1 = baseline([node("once")], { generation: 1 }); g1.onSnapshot(snapshot("d1", 2, [])); const g2 = baseline([node("once")], { generation: 2 }); assert.equal(committedDomain(g2).roots[0].key, "once"); }],
  ["protocol-invalid-json-retires-data", async () => assert.equal((await invalidCarrier("{")).kind, "protocol-fatal")],
  ["protocol-unknown-type-retires-data", async () => assert.equal((await invalidCarrier('{"type":"render.unknown"}')).kind, "protocol-fatal")],
  ["protocol-closed-schema-violation-retires-data", async () => assert.equal((await invalidCarrier(JSON.stringify({ ...domains(), extra: true }))).kind, "protocol-fatal")],
  ["protocol-hard-limit-violation-retires-data", async () => assert.equal((await invalidCarrier("x".repeat(1_048_577))).kind, "protocol-fatal")],
  ["continuity-domain-lifecycle-violation-retires-data", async () => { const store = baseline(); store.onDomains(domains()); assert.equal((await invalidCarrier(JSON.stringify(domains("d1")), store)).kind, "protocol-fatal"); }],
  ["continuity-patch-before-baseline-retires-data", async () => assert.equal((await invalidCarrier(JSON.stringify(patch([], { zIndex: 1 })))).kind, "protocol-fatal")],
  ["continuity-patch-base-mismatch-retires-data", async () => assert.equal((await invalidCarrier(JSON.stringify(patch([], { baseRevision: 0, revision: 1, zIndex: 1 })), baseline())).kind, "protocol-fatal")],
  ["continuity-patch-precondition-failure-retires-data", async () => assert.equal((await invalidCarrier(JSON.stringify(patch([{ op: "remove", key: "missing" }])), baseline())).kind, "protocol-fatal")],
  ["continuity-invalid-final-tree-retires-data", async () => assert.equal((await invalidCarrier(JSON.stringify(patch([{ op: "insert", parentKey: null, beforeKey: null, node: node("root") }])), baseline())).kind, "protocol-fatal")],
  ["continuity-no-later-patch-applied-on-old-carrier", async () => { const trace = await realVertical(); assert.equal(trace.retired.domains[0].revision, 2); assert.equal(trace.rebaselined.domains[0].revision, 1); }],
  ["event-applicability-miss-drop-only", () => { const store = baseline(); assertAccepted(store.onEvent(event("missing"))); assert.equal(store.snapshotForQualification().currentCarrier, true); }],
  ["presentation-local-failure-does-not-mutate-authoritative-store", async () => { const trace = await realVertical(); assert.deepEqual(trace.retired.domains[0], trace.updated.domains[0]); }],
  ["render-failure-does-not-fail-runtime", async () => { const trace = await realVertical(); assert.equal(trace.activeDuringReconnect, true); assert.equal(trace.mainFailure, null); }],
  ["render-failure-does-not-unwind-frame", async () => { const trace = await realVertical(); assert.equal(trace.activeAfterReconnect, true); }],
  ["fresh-carrier-recovers-with-registry-snapshots", async () => { const trace = await realVertical(); assert.equal(trace.rebaselined.registrySeen, true); assert.equal(trace.rebaselined.domains[0].revision, 1); }],
  ["registry-before-domain-state", async () => { const connected = await connectedSender(); assert.deepEqual(connected.messages.slice(0, 2).map(({ type }) => type), ["render.domains", "render.snapshot"]); }],
  ["fresh-carrier-snapshot-before-patch", async () => { const trace = await reconnectTrace(); assert.equal(trace.second[1].type, "render.snapshot"); assert.equal(trace.second.some(({ type }) => type === "render.patch"), false); }],
  ["fresh-carrier-snapshot-before-retained-event-targeting-domain", async () => { const trace = await reconnectTrace(); trace.domain.emit({ targetKey: "root", name: "new", data: {} }); await settle(); assert.deepEqual(trace.second.slice(0, 3).map(({ type }) => type), ["render.domains", "render.snapshot", "render.event"]); }],
  ["revision-strict-plus-one-after-baseline", async () => { const connected = await connectedSender(); connected.domain.replace(replaceState("1")); connected.domain.replace(replaceState("2")); await settle(); const revisions = connected.messages.filter(({ type }) => type === "render.snapshot").map(({ revision }) => revision); assert.deepEqual(revisions, revisions.map((_, index) => index + 1)); }],
  ["lastEmittedRevision-reset-per-carrier", async () => { const trace = await reconnectTrace(); assert.equal(trace.first.find(({ type }) => type === "render.snapshot").revision, 1); assert.equal(trace.second.find(({ type }) => type === "render.snapshot").revision, 1); }],
  ["same-generation-one-shot-history-retained", async () => { const trace = await reconnectTrace(); trace.domain.replace(state([])); assert.throws(() => trace.domain.replace(state([node("root")])), /reused/); }],
  ["retained-event-is-coalescing-barrier", sameDomainBarrier],
  ["no-ack-wait", async () => { const sent = []; const carrier = inboundCarrier([]); carrier.send = async (raw) => { sent.push(JSON.parse(raw)); }; const peer = await realSenderPeer(carrier); const manager = new RenderManager(); const domain = manager.createDomain(state()); manager.setDataPeer(peer); await settle(); domain.replace(replaceState("next")); await settle(); assert.deepEqual(sent.slice(0, 3).map(({ type }) => type), ["render.domains", "render.snapshot", "render.snapshot"]); await peer.close(); }],
  ["no-event-replay", async () => { const trace = await reconnectTrace(); assert.equal(trace.second.some(({ type }) => type === "render.event"), false); }],
  ["outbound-preflight-before-send", async () => { const connected = await connectedSender(); const count = connected.messages.length; assert.throws(() => connected.domain.replace(state([node("dup"), node("dup")]))); await settle(); assert.equal(connected.messages.length, count); }],
]);
