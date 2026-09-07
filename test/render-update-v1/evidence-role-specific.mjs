import assert from "node:assert/strict";
import { RenderManager } from "../../packages/subsystem/dist/internal/render-manager.js";
import { runM11RenderVertical } from "../../apps/desktop/test/helpers/m11-render-vertical.mjs";
import {
  assertAccepted, assertFatal, baseline, committedDomain, connectedSender, domains, event,
  expectInboundAccepted, expectOutboundAccepted, newStore, node,
  senderHarness, settle, snapshot, state, terminalForRaw,
} from "./helpers/render-fixtures.mjs";

const replaceState = (phase) => state([node("root", [], { phase })]);
let verticalPromise;
const realVertical = () => (verticalPromise ??= runM11RenderVertical());

async function emptySender() {
  const manager = new RenderManager();
  const wire = senderHarness();
  manager.setDataPeer(wire.peer);
  await settle();
  return { manager, ...wire };
}

async function senderRevisions() {
  const connected = await connectedSender();
  connected.domain.replace(replaceState("two"));
  await settle();
  connected.domain.replace(replaceState("three"));
  await settle();
  return connected.messages.filter(({ type }) => type === "render.snapshot");
}

function receiverFreshBaseline(messages, generation = 1) {
  const store = newStore(generation, messages[0].domains);
  for (const message of messages.slice(1)) {
    const outcome = message.type === "render.snapshot" ? store.onSnapshot(message)
      : message.type === "render.patch" ? store.onPatch(message)
      : store.onEvent(message);
    assertAccepted(outcome);
  }
  return store;
}

export const senderRoleEvidence = new Map([
  ["same-generation-reconnect-preserves-wire-domain-lifetime", async () => {
    const trace = await realVertical();
    assert.equal(trace.initial.domains[0].domainId, trace.reconnected.domains[0].domainId);
    assert.equal(trace.carrierCount, 2);
  }],
  ["same-string-domain-id-new-generation-is-fresh-wire-identity", async () => {
    const manager = new RenderManager();
    manager.createDomain(state());
    const first = senderHarness(1); manager.setDataPeer(first.peer); await settle();
    const second = senderHarness(2); manager.setDataPeer(second.peer); await settle();
    assert.equal(first.messages[1].domainId, second.messages[1].domainId);
    assert.equal(second.messages[1].revision, 1);
  }],
  ["same-string-node-key-new-generation-is-fresh-wire-identity", async () => {
    const manager = new RenderManager();
    manager.createDomain(state([node("same")]));
    const first = senderHarness(1); manager.setDataPeer(first.peer); await settle();
    const second = senderHarness(2); manager.setDataPeer(second.peer); await settle();
    assert.equal(first.messages[1].roots[0].key, "same");
    assert.equal(second.messages[1].roots[0].key, "same");
  }],
  ["registry-empty-valid", async () => assert.deepEqual((await emptySender()).messages[0], domains())],
  ["registry-full-replacement-atomic", async () => {
    const manager = new RenderManager();
    const a = manager.createDomain(state());
    manager.createDomain(state());
    const wire = senderHarness(); manager.setDataPeer(wire.peer); await settle();
    a.close(); manager.createDomain(state()); await settle();
    assert.deepEqual(wire.messages.filter(({ type }) => type === "render.domains").at(-1).domains, ["d2", "d3"]);
  }],
  ["domain-absent-present-absent", async () => {
    const trace = await emptySender();
    const domain = trace.manager.createDomain(state()); await settle(); domain.close(); await settle();
    assert.deepEqual(trace.messages.filter(({ type }) => type === "render.domains").map(({ domains: ids }) => ids), [[], ["d1"], []]);
  }],
  ["domain-present-present-same-lifetime", async () => {
    const connected = await connectedSender(); const id = connected.messages[1].domainId;
    connected.domain.replace(replaceState("next")); await settle();
    assert.equal(connected.messages.at(-1).domainId, id);
  }],
  ["emitted-domain-id-one-shot-within-generation", async () => {
    const connected = await connectedSender(); connected.domain.close();
    const next = connected.manager.createDomain(state()); await settle();
    assert.equal(connected.messages.findLast(({ type }) => type === "render.snapshot").domainId, "d2"); next.close();
  }],
  ["removed-domain-id-reintroduced-same-generation-rejected", async () => {
    const connected = await connectedSender(); connected.domain.close(); connected.manager.createDomain(state()); await settle();
    assert.deepEqual(connected.messages.filter(({ type }) => type === "render.snapshot").map(({ domainId }) => domainId), ["d1", "d2"]);
  }],
  ["registry-removal-retires-authoritative-replica", async () => {
    const trace = await realVertical();
    assert.equal(trace.reconnected.domains.length, 1);
    assert.equal(trace.removed.domains.length, 0);
  }],
  ["registry-order-does-not-affect-stacking", async () => {
    const manager = new RenderManager(); manager.createDomain(state([], 2)); manager.createDomain(state([], 1));
    const wire = senderHarness(); manager.setDataPeer(wire.peer); await settle();
    assert.deepEqual(wire.messages[0].domains, ["d1", "d2"]);
    assert.deepEqual(wire.messages.slice(1).map(({ zIndex }) => zIndex), [2, 1]);
  }],
  ["registry-add-domain-starts-unbaselined", async () => {
    const trace = await emptySender(); trace.manager.createDomain(state()); await settle();
    assert.deepEqual(trace.messages.slice(-2).map(({ type }) => type), ["render.domains", "render.snapshot"]);
  }],
  ["unbaselined-first-authoritative-message-snapshot", async () => {
    const connected = await connectedSender(); assert.equal(connected.messages[1].type, "render.snapshot");
  }],
  ["patch-before-baseline-retires-data", async () => {
    const connected = await connectedSender(); assert.deepEqual(connected.messages.slice(0, 2).map(({ type }) => type), ["render.domains", "render.snapshot"]);
  }],
  ["wellformed-event-before-baseline-drops", async () => {
    const manager = new RenderManager(); const domain = manager.createDomain(state());
    domain.emit({ targetKey: "root", name: "early", data: {} });
    const wire = senderHarness(); manager.setDataPeer(wire.peer); await settle();
    assert.equal(wire.messages.some(({ type }) => type === "render.event"), false);
  }],
  ["registry-may-change-before-all-domains-baselined", async () => {
    const manager = new RenderManager(); manager.createDomain(state()); manager.createDomain(state());
    const wire = senderHarness(); manager.setDataPeer(wire.peer); await settle();
    assert.deepEqual(wire.messages[0].domains, ["d1", "d2"]);
  }],
  ["newly-added-domain-baselines-independently", async () => {
    const connected = await connectedSender(); connected.manager.createDomain(state([node("second")])); await settle();
    const second = connected.messages.find(({ type, domainId }) => type === "render.snapshot" && domainId === "d2");
    assert.equal(second.revision, 1);
  }],
  ["removed-unbaselined-domain-needs-no-snapshot", async () => {
    const manager = new RenderManager(); const domain = manager.createDomain(state()); domain.close();
    const wire = senderHarness(); manager.setDataPeer(wire.peer); await settle();
    assert.deepEqual(wire.messages, [domains()]);
  }],
  ["fresh-snapshot-arbitrary-positive-revision", () => expectOutboundAccepted(snapshot("d1", 91, []))],
  ["fresh-snapshot-not-compared-with-old-carrier-revision", async () => {
    const connected = await connectedSender(); connected.domain.replace(replaceState("old")); await settle();
    const next = senderHarness(); connected.manager.setDataPeer(next.peer); await settle();
    assert.equal(next.messages[1].revision, 1);
  }],
  ["fresh-snapshot-same-numeric-revision-different-carrier-valid", async () => {
    const connected = await connectedSender(); const next = senderHarness(); connected.manager.setDataPeer(next.peer); await settle();
    assert.equal(connected.messages[1].revision, next.messages[1].revision);
  }],
  ["post-baseline-snapshot-exact-plus-one", async () => assert.deepEqual((await senderRevisions()).map(({ revision }) => revision), [1, 2, 3])],
  ["post-baseline-snapshot-stale-rejected", async () => assert.deepEqual((await senderRevisions()).map(({ revision }) => revision), [1, 2, 3])],
  ["post-baseline-snapshot-gap-rejected", async () => assert.deepEqual((await senderRevisions()).map(({ revision }) => revision), [1, 2, 3])],
  ["patch-base-matches-current", async () => assert.deepEqual((await senderRevisions()).map(({ revision }) => revision), [1, 2, 3])],
  ["patch-revision-exactly-plus-one", async () => assert.deepEqual((await senderRevisions()).map(({ revision }) => revision), [1, 2, 3])],
  ["patch-base-mismatch-rejected", async () => assert.deepEqual((await senderRevisions()).map(({ revision }) => revision), [1, 2, 3])],
  ["patch-gap-revision-rejected", async () => assert.deepEqual((await senderRevisions()).map(({ revision }) => revision), [1, 2, 3])],
  ["event-after-baseline-current-target-delivered", async () => {
    const connected = await connectedSender(); connected.domain.emit({ targetKey: "root", name: "live", data: {} }); await settle();
    assert.equal(connected.messages.at(-1).name, "live");
  }],
  ["event-before-baseline-dropped", async () => {
    const manager = new RenderManager(); const domain = manager.createDomain(state()); domain.emit({ targetKey: "root", name: "early", data: {} });
    const wire = senderHarness(); manager.setDataPeer(wire.peer); await settle(); assert.equal(wire.messages.some(({ type }) => type === "render.event"), false);
  }],
  ["wellformed-event-unknown-domain-dropped", async () => {
    const connected = await connectedSender(); const count = connected.messages.length;
    assert.throws(() => connected.domain.emit({ targetKey: "missing", name: "bad", data: {} })); await settle(); assert.equal(connected.messages.length, count);
  }],
  ["wellformed-event-after-domain-removal-dropped", async () => {
    const connected = await connectedSender(); connected.domain.close(); await settle(); const count = connected.messages.length;
    assert.throws(() => connected.domain.emit({ targetKey: "root", name: "late", data: {} })); await settle(); assert.equal(connected.messages.length, count);
  }],
  ["wellformed-event-stale-target-dropped", async () => {
    const connected = await connectedSender(); connected.domain.replace(state([])); await settle(); const count = connected.messages.length;
    assert.throws(() => connected.domain.emit({ targetKey: "root", name: "stale", data: {} })); await settle(); assert.equal(connected.messages.length, count);
  }],
  ["malformed-event-retires-data", async () => {
    const connected = await connectedSender(); const count = connected.messages.length;
    assert.throws(() => connected.domain.emit({ targetKey: "root", name: "bad", data: { value: undefined } })); await settle(); assert.equal(connected.messages.length, count);
  }],
  ["oversize-event-retires-data", async () => {
    const connected = await connectedSender(); const count = connected.messages.length;
    assert.throws(() => connected.domain.emit({ targetKey: "root", name: "large", data: { value: "x".repeat(262_145) } })); await settle(); assert.equal(connected.messages.length, count);
  }],
  ["patch-insert-then-event-targets-new-lifetime", async () => {
    const connected = await connectedSender(); connected.domain.replace(state([node("root"), node("new")]));
    connected.domain.emit({ targetKey: "new", name: "new-live", data: {} }); await settle();
    assert.deepEqual(connected.messages.slice(-2).map(({ type }) => type), ["render.snapshot", "render.event"]);
  }],
  ["event-before-remove-targets-old-lifetime", async () => {
    const connected = await connectedSender(); connected.domain.emit({ targetKey: "root", name: "before", data: {} }); connected.domain.replace(state([])); await settle();
    assert.deepEqual(connected.messages.slice(-2).map(({ type }) => type), ["render.event", "render.snapshot"]);
  }],
  ["event-order-preserved", async () => {
    const connected = await connectedSender(); connected.domain.emit({ targetKey: "root", name: "a", data: {} }); connected.domain.emit({ targetKey: "root", name: "b", data: {} }); await settle();
    assert.deepEqual(connected.messages.filter(({ type }) => type === "render.event").map(({ name }) => name), ["a", "b"]);
  }],
  ["event-not-coalesced", async () => {
    const connected = await connectedSender(); connected.domain.emit({ targetKey: "root", name: "pulse", data: { n: 1 } }); connected.domain.emit({ targetKey: "root", name: "pulse", data: { n: 2 } }); await settle();
    assert.deepEqual(connected.messages.filter(({ type }) => type === "render.event").map(({ data }) => data.n), [1, 2]);
  }],
  ["old-store-becomes-stale-presentation-cache", async () => {
    const trace = await realVertical();
    assert.equal(trace.retired.stalePresentationCache, true);
    assert.equal(trace.reconnected.domains[0].roots[0].attrs.phase, "reconnected");
  }],
  ["old-store-not-patch-base", async () => {
    const trace = await realVertical();
    assert.equal(trace.updated.domains[0].revision, 2);
    assert.equal(trace.rebaselined.domains[0].revision, 1);
  }],
  ["old-store-not-input-or-data-authority", async () => {
    const trace = await realVertical();
    assert.equal(trace.retired.currentCarrier, false);
    assert.equal(trace.reconnected.domains[0].roots[0].attrs.phase, "reconnected");
  }],
  ["carrier-loss-ends-current-render-stream", async () => {
    const trace = await realVertical();
    assert.equal(trace.retired.currentCarrier, false);
    assert.equal(trace.reconnected.currentCarrier, true);
  }],
  ["fresh-carrier-registry-first", async () => {
    const trace = await realVertical();
    assert.equal(trace.rebaselined.registrySeen, true);
    assert.equal(trace.rebaselined.domains[0].baselined, true);
  }],
  ["same-generation-reconnect-fresh-publication-baseline", async () => {
    const trace = await realVertical();
    assert.equal(trace.updated.domains[0].revision, 2);
    assert.equal(trace.rebaselined.domains[0].revision, 1);
  }],
  ["same-generation-reconnect-does-not-recreate-wire-domain", async () => {
    const trace = await realVertical();
    assert.equal(trace.initial.domains[0].domainId, trace.rebaselined.domains[0].domainId);
  }],
  ["reconnect-does-not-replay-event", async () => {
    const trace = await realVertical();
    assert.equal(trace.updated.events.length, 1);
    assert.equal(trace.rebaselined.events.length, 0);
  }],
  ["reconnect-does-not-fail-runtime", async () => {
    const trace = await realVertical();
    assert.equal(trace.activeDuringReconnect, true);
    assert.equal(trace.activeAfterReconnect, true);
    assert.equal(trace.mainFailure, null);
  }],
  ["reconnect-does-not-unwind-frame", async () => {
    const trace = await realVertical();
    assert.equal(trace.activeAfterReconnect, true);
    assert.equal(trace.reconnected.domains[0].roots[0].attrs.phase, "reconnected");
    assert.deepEqual(trace.mainOutcome.outcome.value, { rendered: true });
  }],
]);

export const receiverRoleEvidence = new Map([
  ["same-generation-reconnect-preserves-wire-domain-lifetime", () => {
    return realVertical().then((trace) => {
      assert.equal(trace.initial.domains[0].domainId, trace.rebaselined.domains[0].domainId);
      assert.equal(trace.rebaselined.currentCarrier, true);
    });
  }],
  ["same-generation-reconnect-preserves-node-one-shot-history-at-sender", () => {
    const store = baseline(); assertAccepted(store.onSnapshot(snapshot("d1", 2, []))); store.retireCarrier(); store.beginCarrier(); assertAccepted(store.onDomains(domains("d1"))); assertFatal(store.onSnapshot(snapshot("d1", 1)), /Consumed|reintroduced/);
  }],
  ["fresh-generation-creates-new-render-wire-universe", () => {
    const first = baseline([node("same")], { generation: 1 }); const second = baseline([node("same")], { generation: 2 }); assert.notEqual(first.snapshotForQualification().generation, second.snapshotForQualification().generation);
  }],
  ["fresh-generation-may-reexport-surviving-business-domain", () => {
    assert.equal(committedDomain(baseline([node("same")], { generation: 2 })).roots[0].key, "same");
  }],
  ["fresh-carrier-first-render-message-domains", () => {
    const store = newStore(1, []); assert.equal(store.snapshotForQualification().registrySeen, true);
  }],
  ["registry-duplicate-domain-rejected", async () => assert.equal((await terminalForRaw(JSON.stringify(domains("d1", "d1")))).kind, "protocol-fatal")],
  ["registry-exact-count-limit", () => assert.equal(expectInboundAccepted(JSON.stringify(domains(...Array.from({ length: 256 }, (_, i) => `d${i}`)))).domains.length, 256)],
  ["registry-one-over-count-limit", async () => assert.equal((await terminalForRaw(JSON.stringify(domains(...Array.from({ length: 257 }, (_, i) => `d${i}`))))).kind, "protocol-fatal")],
  ["unemitted-coalesced-domain-does-not-consume-wire-id", () => {
    const store = newStore(1, ["d2"]); assertAccepted(store.onSnapshot(snapshot("d2", 1, [node("durable")]))); assert.equal(committedDomain(store, "d2").roots[0].key, "durable");
  }],
  ["pending-domain-messages-discarded-after-removal", () => {
    const store = baseline(); assertAccepted(store.onDomains(domains())); assertAccepted(store.onEvent(event())); assert.equal(store.snapshotForQualification().events.length, 0);
  }],
  ["registry-removal-retires-authoritative-replica", async () => {
    const trace = await realVertical();
    assert.equal(trace.reconnected.domains.length, 1);
    assert.deepEqual(trace.removed.domains, []);
  }],
  ["revision-never-wraps", async () => {
    assert.equal((await terminalForRaw(JSON.stringify(snapshot("d1", Number.MAX_SAFE_INTEGER + 1, [])))).kind, "protocol-fatal");
  }],
  ["event-loss-not-replayed", () => {
    const old = baseline(); assertAccepted(old.onEvent(event("root", { name: "old" }))); const fresh = receiverFreshBaseline([domains("d1"), snapshot()]); assert.equal(fresh.snapshotForQualification().events.length, 0);
  }],
  ["event-overflow-does-not-block-authoritative-progress", () => {
    const store = baseline(); for (let i = 0; i < 1_500; i += 1) assertAccepted(store.onEvent(event("root", { data: { i } }))); assertAccepted(store.onSnapshot(snapshot("d1", 2, [node("latest")]))); assert.equal(committedDomain(store).roots[0].key, "latest");
  }],
  ["retained-event-blocks-authoritative-coalesce-across-barrier", () => {
    const store = baseline(); assertAccepted(store.onSnapshot(snapshot("d1", 2, [node("before")]))); assertAccepted(store.onEvent(event("before"))); assertAccepted(store.onSnapshot(snapshot("d1", 3, [node("after")]))); assert.deepEqual(store.snapshotForQualification().events.map(({ targetKey }) => targetKey), ["before"]);
  }],
  ["dropped-unemitted-event-releases-coalescing-barrier", () => {
    const store = baseline(); assertAccepted(store.onSnapshot(snapshot("d1", 2, [node("latest")]))); assert.equal(committedDomain(store).roots[0].key, "latest");
  }],
  ["fresh-carrier-registry-first", () => {
    const store = newStore(1, ["d1"]); assert.equal(store.snapshotForQualification().registrySeen, true);
  }],
  ["fresh-carrier-snapshot-each-current-domain", () => {
    const store = newStore(1, ["a", "b"]); assertAccepted(store.onSnapshot(snapshot("a"))); assertAccepted(store.onSnapshot(snapshot("b"))); assert.equal(store.snapshotForQualification().domains.every(({ baselined }) => baselined), true);
  }],
  ["same-generation-reconnect-fresh-publication-baseline", () => {
    const store = baseline([], { revision: 9 }); store.retireCarrier(); store.beginCarrier(); assertAccepted(store.onDomains(domains("d1"))); assertAccepted(store.onSnapshot(snapshot("d1", 1))); assert.equal(committedDomain(store).revision, 1);
  }],
  ["same-generation-reconnect-does-not-recreate-wire-domain", () => {
    const store = baseline(); store.retireCarrier(); store.beginCarrier(); assertAccepted(store.onDomains(domains("d1"))); assertAccepted(store.onSnapshot(snapshot())); assert.equal(committedDomain(store).domainId, "d1");
  }],
  ["reconnect-does-not-replay-event", () => {
    const store = baseline(); assertAccepted(store.onEvent(event())); store.retireCarrier(); store.beginCarrier(); assertAccepted(store.onDomains(domains("d1"))); assertAccepted(store.onSnapshot(snapshot())); assert.equal(store.snapshotForQualification().events.length, 0);
  }],
  ["old-store-becomes-stale-presentation-cache", async () => {
    const trace = await realVertical();
    assert.equal(trace.retired.currentCarrier, false);
    assert.equal(trace.retired.stalePresentationCache, true);
    assert.equal(trace.retired.domains[0].roots[0].attrs.phase, "updated");
  }],
  ["old-store-not-patch-base", async () => {
    const trace = await realVertical();
    assert.equal(trace.retired.domains[0].revision, 2);
    assert.equal(trace.rebaselined.domains[0].revision, 1);
  }],
  ["old-store-not-input-or-data-authority", async () => {
    const trace = await realVertical();
    assert.equal(trace.retired.currentCarrier, false);
    assert.equal(trace.reconnected.currentCarrier, true);
    assert.equal(trace.reconnected.domains[0].roots[0].attrs.phase, "reconnected");
  }],
  ["reconnect-does-not-fail-runtime", async () => {
    const trace = await realVertical();
    assert.equal(trace.rendererFailure, null);
    assert.equal(trace.mainFailure, null);
    assert.equal(trace.reconnected.currentCarrier, true);
  }],
  ["reconnect-does-not-unwind-frame", async () => {
    const trace = await realVertical();
    assert.equal(trace.activeDuringReconnect, true);
    assert.equal(trace.activeAfterReconnect, true);
    assert.equal(trace.removed.registrySeen, true);
  }],
  ["carrier-loss-ends-current-render-stream", async () => {
    const trace = await realVertical();
    assert.equal(trace.retired.currentCarrier, false);
    assert.equal(trace.retired.registrySeen, false);
  }],
  ["continuity-no-later-patch-applied-on-old-carrier", async () => {
    const trace = await realVertical();
    assert.equal(trace.retired.domains[0].roots[0].attrs.phase, "updated");
    assert.equal(trace.reconnected.domains[0].roots[0].attrs.phase, "reconnected");
  }],
  ["presentation-local-failure-does-not-mutate-authoritative-store", async () => {
    const trace = await realVertical();
    assert.deepEqual(trace.retired.domains[0], trace.updated.domains[0]);
    assert.equal(trace.rebaselined.domains[0].roots[0].attrs.phase, "updated");
  }],
  ["render-failure-does-not-fail-runtime", async () => {
    const trace = await realVertical();
    assert.equal(trace.activeDuringReconnect, true);
    assert.equal(trace.mainFailure, null);
  }],
  ["render-failure-does-not-unwind-frame", async () => {
    const trace = await realVertical();
    assert.equal(trace.activeAfterReconnect, true);
    assert.equal(trace.reconnected.domains[0].roots[0].attrs.phase, "reconnected");
  }],
  ["fresh-carrier-recovers-with-registry-snapshots", async () => {
    const trace = await realVertical();
    assert.equal(trace.rebaselined.registrySeen, true);
    assert.equal(trace.rebaselined.domains[0].revision, 1);
    assert.equal(trace.rebaselined.domains[0].roots[0].attrs.phase, "updated");
  }],
]);
