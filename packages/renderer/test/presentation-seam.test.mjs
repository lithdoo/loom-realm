import assert from "node:assert/strict";
import test from "node:test";
import { createMemoryCarrierPair } from "@loomrealm/foundation/testing";
import {
  createSubsystemDataPeer,
  validateInputPayloadV1,
  WEB_PRESENTATION_EVENT_CHANNEL_V1,
} from "@loomrealm/data";
import { createMainRendererControlPeer, prepareRendererHelloResultV1 } from "@loomrealm/renderer-control";
import { createRendererControlHolder } from "../dist/index.js";
import { attachRendererPresentation } from "../dist/internal/presentation-seam.js";

const authority = (subsystemKey, generation = 1) => ({ subsystemKey, generation, dataProfile: "loomrealm.renderer-data/1" });
const snapshot = (sessionId, revision, dataAuthorities = []) => ({
  sessionId, revision, runtimes: dataAuthorities.map(({ subsystemKey }) => ({ subsystemKey, state: "ready" })),
  stack: [], inputTarget: null, dataAuthorities,
});
const turn = () => new Promise((resolve) => setImmediate(resolve));

function deferred() {
  let resolve;
  const promise = new Promise((next) => { resolve = next; });
  return { promise, resolve };
}

function controlledOutboundCarrier(endpoint) {
  let blocked = null;
  return {
    carrier: {
      closed: endpoint.closed,
      messages: () => endpoint.messages(),
      close: () => endpoint.close(),
      async send(message) {
        const pending = blocked;
        if (pending !== null) {
          blocked = null;
          pending.started.resolve();
          await pending.release.promise;
        }
        return endpoint.send(message);
      },
    },
    blockNextSend() {
      if (blocked !== null) throw new Error("A Data send is already blocked");
      const started = deferred();
      const release = deferred();
      blocked = { started, release };
      return { started: started.promise, release: release.resolve };
    },
  };
}

function main(pair, sessionId, dataAuthorities) {
  return createMainRendererControlPeer({
    carrier: pair.left,
    acceptHello() {
      const initial = snapshot(sessionId, 1, dataAuthorities);
      return { kind: "accepted", snapshot: initial, preparedHelloText: prepareRendererHelloResultV1(initial) };
    },
  });
}

async function waitFor(predicate, label) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return;
    await turn();
  }
  assert.fail(`Timed out waiting for ${label}`);
}

test("presentation seam reads current Control/Store facts and only observes successful commits", async (t) => {
  const dataPeers = [];
  const holder = createRendererControlHolder({
    async acquire(subsystemKey, generation, dataProfile) {
      const pair = createMemoryCarrierPair();
      const peer = createSubsystemDataPeer({
        binding: { carrier: pair.left, subsystemKey, generation, dataProfile },
        handlers: {
          onInputState: () => ({ kind: "accepted" }),
          onInputEvent: () => ({ kind: "accepted" }),
          onInputReset: () => ({ kind: "accepted" }),
          onViewportState: () => ({ kind: "accepted" }),
        },
      });
      dataPeers.push(peer);
      return pair.right;
    },
  });
  t.after(async () => Promise.allSettled(dataPeers.map((peer) => peer.close())));
  const observations = [];
  const detach = attachRendererPresentation(holder, {
    reevaluate(source) { observations.push(structuredClone(source.read())); },
  });
  t.after(detach);

  const control = createMemoryCarrierPair();
  const publisher = main(control, "S", [authority("A")]);
  await holder.connect({ carrier: control.right, rendererControlToken: "token" });
  await waitFor(() => dataPeers.length === 1, "Data peer");
  assert.equal(observations.at(-1).subsystems[0].eligible, false);

  await dataPeers[0].render.sendDomains({ type: "render.domains", domains: ["d"] });
  await turn();
  assert.equal(observations.at(-1).subsystems[0].eligible, false);
  await dataPeers[0].render.sendSnapshot({
    type: "render.snapshot", domainId: "d", revision: 1, zIndex: 0,
    roots: [{ key: "root", tag: "lr-qualified", attrs: {}, data: {}, children: [] }],
  });
  await waitFor(() => observations.at(-1)?.subsystems[0]?.eligible === true, "eligible Store view");
  const beforeFailure = observations.length;
  await dataPeers[0].render.sendPatch({
    type: "render.patch", domainId: "d", baseRevision: 999, revision: 1000, ops: [],
  });
  await turn();
  assert.equal(observations.length, beforeFailure);

  publisher.publish(snapshot("S", 2, []));
  await waitFor(() => observations.at(-1)?.subsystems.length === 0, "authority removal");
  const beforeTerminal = observations.length;
  publisher.retire();
  await turn();
  assert.equal(observations.length, beforeTerminal, "Control transport loss does not invent empty authority");
});

test("presentation attachment callback is stable, detach-revoked, and fresh on reattach", async () => {
  const holder = createRendererControlHolder();
  const callbacks = [];
  const detachFirst = attachRendererPresentation(holder, {
    reevaluate(_source, emitNodeEvent) { callbacks.push(emitNodeEvent); },
  });
  const control = createMemoryCarrierPair();
  const publisher = main(control, "S", []);
  await holder.connect({ carrier: control.right, rendererControlToken: "token" });
  publisher.publish(snapshot("S", 2, []));
  await waitFor(() => callbacks.length >= 2, "repeat presentation notification");
  assert.equal(callbacks[0], callbacks[1]);
  const oldCallback = callbacks[0];

  detachFirst();
  assert.doesNotThrow(() => oldCallback({
    sessionId: "S",
    subsystemKey: "missing",
    generation: 1,
    domainId: "missing",
    targetKey: "missing",
    name: Symbol("stale"),
    data: 1n,
  }));

  let freshCallback;
  const detachSecond = attachRendererPresentation(holder, {
    reevaluate(_source, emitNodeEvent) { freshCallback = emitNodeEvent; },
  });
  assert.equal(typeof freshCallback, "function");
  assert.notEqual(freshCallback, oldCallback);
  assert.doesNotThrow(() => oldCallback({
    sessionId: "S",
    subsystemKey: "missing",
    generation: 1,
    domainId: "missing",
    targetKey: "missing",
    name: "old",
    data: {},
  }));
  detachSecond();
  publisher.retire();
});

test("presentation node events pass currentness and validation before targeted User Input delivery", async (t) => {
  const inputEvents = [];
  const dataPeers = [];
  const dataSendControls = [];
  let holdReplacement = false;
  let releaseReplacement;
  const holder = createRendererControlHolder({
    async acquire(subsystemKey, generation, dataProfile) {
      if (holdReplacement) {
        await new Promise((resolve) => { releaseReplacement = resolve; });
      }
      const pair = createMemoryCarrierPair();
      const outbound = controlledOutboundCarrier(pair.right);
      const peer = createSubsystemDataPeer({
        binding: { carrier: pair.left, subsystemKey, generation, dataProfile },
        handlers: {
          onInputState: () => ({ kind: "accepted" }),
          onInputEvent: (message) => {
            inputEvents.push(message);
            return { kind: "accepted" };
          },
          onInputReset: () => ({ kind: "accepted" }),
          onViewportState: () => ({ kind: "accepted" }),
        },
      });
      dataPeers.push(peer);
      dataSendControls.push(outbound);
      return outbound.carrier;
    },
  });
  t.after(async () => Promise.allSettled(dataPeers.map((peer) => peer.close())));

  let emitNodeEvent;
  const detach = attachRendererPresentation(holder, {
    reevaluate(_source, emit) { emitNodeEvent = emit; },
  });
  t.after(detach);

  const activeSnapshot = (revision) => ({
    sessionId: "S",
    revision,
    runtimes: [{ subsystemKey: "A", state: "ready" }],
    stack: [{ frameId: "frame", subsystemKey: "A", lifecycle: "active", activationId: "activation" }],
    inputTarget: { subsystemKey: "A", frameId: "frame", activationId: "activation" },
    dataAuthorities: [authority("A")],
  });
  const control = createMemoryCarrierPair();
  const publisher = createMainRendererControlPeer({
    carrier: control.left,
    acceptHello() {
      const initial = activeSnapshot(1);
      return { kind: "accepted", snapshot: initial, preparedHelloText: prepareRendererHelloResultV1(initial) };
    },
  });
  await holder.connect({ carrier: control.right, rendererControlToken: "token" });
  await waitFor(() => dataPeers.length === 1, "current Data peer");
  await dataPeers[0].render.sendDomains({ type: "render.domains", domains: ["domain"] });
  await dataPeers[0].render.sendSnapshot({
    type: "render.snapshot",
    domainId: "domain",
    revision: 1,
    zIndex: 0,
    roots: [{ key: "node", tag: "lr-node", attrs: {}, data: {}, children: [] }],
  });
  await waitFor(() => typeof emitNodeEvent === "function", "presentation event callback");
  await turn();

  const nodeEvent = (overrides = {}) => ({
    sessionId: "S",
    subsystemKey: "A",
    generation: 1,
    domainId: "domain",
    targetKey: "node",
    name: "commit",
    data: { value: 7 },
    ...overrides,
  });

  emitNodeEvent(nodeEvent({ name: "no-interest", data: {} }));
  await turn();
  assert.equal(inputEvents.length, 0);
  await dataPeers[0].input.sendInterest({
    type: "input.interest",
    frames: [{ frameId: "frame", channels: [WEB_PRESENTATION_EVENT_CHANNEL_V1] }],
  });
  await turn();

  emitNodeEvent(nodeEvent({ targetKey: "missing", name: Symbol("stale"), data: 1n }));
  emitNodeEvent(nodeEvent({ sessionId: "old", name: Symbol("stale"), data: 1n }));
  emitNodeEvent(nodeEvent({ generation: 2, name: Symbol("stale"), data: 1n }));
  assert.equal(inputEvents.length, 0, "stale sources are dropped before argument validation");

  for (const invalidName of [null, "", "x".repeat(129), "\ud800"]) {
    assert.throws(() => emitNodeEvent(nodeEvent({ name: invalidName })), TypeError);
  }
  const cyclic = {};
  cyclic.self = cyclic;
  class InvalidInstance { value = 1; }
  for (const invalidData of [
    null,
    [],
    new Date(),
    new InvalidInstance(),
    cyclic,
    { value: NaN },
    { value: Infinity },
    { value: 1n },
    { value() {} },
    { value: Symbol("invalid") },
    { value: "x".repeat(262_145) },
  ]) {
    assert.throws(() => emitNodeEvent(nodeEvent({ data: invalidData })), TypeError);
  }
  assert.equal(inputEvents.length, 0);

  let acceptedLength = 0;
  let rejectedLength = 1_024;
  while (true) {
    try {
      validateInputPayloadV1({ value: "x".repeat(rejectedLength) });
      acceptedLength = rejectedLength;
      rejectedLength *= 2;
    } catch {
      break;
    }
  }
  while (rejectedLength - acceptedLength > 1) {
    const candidate = Math.floor((acceptedLength + rejectedLength) / 2);
    try {
      validateInputPayloadV1({ value: "x".repeat(candidate) });
      acceptedLength = candidate;
    } catch {
      rejectedLength = candidate;
    }
  }
  const envelopeOverflowData = { value: "x".repeat(acceptedLength) };
  assert.equal(validateInputPayloadV1(envelopeOverflowData), envelopeOverflowData);
  assert.throws(() => validateInputPayloadV1({
    domainId: "domain",
    targetKey: "node",
    name: "commit",
    data: envelopeOverflowData,
  }));
  assert.throws(
    () => emitNodeEvent(nodeEvent({ data: envelopeOverflowData })),
    TypeError,
  );
  await turn();
  assert.equal(inputEvents.length, 0, "invalid full envelope never enters Data publication");
  assert.equal(
    await Promise.race([
      dataPeers[0].terminal.then(() => true),
      turn().then(() => false),
    ]),
    false,
    "invalid full envelope leaves the Data connection healthy",
  );

  const mutable = { value: 7 };
  emitNodeEvent(nodeEvent({ data: mutable }));
  mutable.value = 99;
  await waitFor(() => inputEvents.length === 1, "custom event delivery");
  assert.deepEqual(inputEvents[0], {
    type: "input.event",
    frameId: "frame",
    activationId: "activation",
    channel: WEB_PRESENTATION_EVENT_CHANNEL_V1,
    payload: {
      domainId: "domain",
      targetKey: "node",
      name: "commit",
      data: { value: 7 },
    },
  });
  const blocked = dataSendControls[0].blockNextSend();
  emitNodeEvent(nodeEvent({ name: "blocked-before-remove", data: { order: 1 } }));
  await blocked.started;
  emitNodeEvent(nodeEvent({ name: "queued-before-remove", data: { order: 2 } }));
  await dataPeers[0].render.sendPatch({
    type: "render.patch",
    domainId: "domain",
    baseRevision: 1,
    revision: 2,
    ops: [{ op: "remove", key: "node" }],
  });
  await turn();
  assert.equal(inputEvents.length, 1, "blocked send keeps both accepted events pending");
  blocked.release();
  await waitFor(() => inputEvents.length === 3, "queued events after node removal");
  assert.deepEqual(
    inputEvents.slice(1).map(({ payload }) => [payload.name, payload.data.order]),
    [["blocked-before-remove", 1], ["queued-before-remove", 2]],
  );
  assert.doesNotThrow(() => emitNodeEvent(nodeEvent({ name: Symbol("removed"), data: 1n })));
  assert.equal(inputEvents.length, 3);

  const oldAttachmentCallback = emitNodeEvent;
  detach();
  let freshAttachmentCallback;
  const detachFresh = attachRendererPresentation(holder, {
    reevaluate(_source, emit) { freshAttachmentCallback = emit; },
  });
  t.after(detachFresh);
  assert.notEqual(freshAttachmentCallback, oldAttachmentCallback);
  assert.doesNotThrow(() => oldAttachmentCallback(nodeEvent({ name: Symbol("revoked"), data: 1n })));

  publisher.publish(activeSnapshot(2));
  holdReplacement = true;
  await dataPeers[0].close();
  await waitFor(() => typeof releaseReplacement === "function", "retired carrier replacement acquire");
  assert.doesNotThrow(() => freshAttachmentCallback(nodeEvent({ name: Symbol("retired"), data: 1n })));
  assert.equal(inputEvents.length, 3);
  releaseReplacement();
  await waitFor(() => dataPeers.length === 2, "replacement Data peer");
  await dataPeers[1].input.sendInterest({
    type: "input.interest",
    frames: [{ frameId: "frame", channels: [WEB_PRESENTATION_EVENT_CHANNEL_V1] }],
  });
  await dataPeers[1].render.sendDomains({ type: "render.domains", domains: ["domain"] });
  assert.doesNotThrow(() => freshAttachmentCallback(nodeEvent({ name: Symbol("partial"), data: 1n })));
  assert.equal(inputEvents.length, 3);
  await dataPeers[1].render.sendSnapshot({
    type: "render.snapshot",
    domainId: "domain",
    revision: 9,
    zIndex: 0,
    roots: [{ key: "node-after-rebaseline", tag: "lr-node", attrs: {}, data: {}, children: [] }],
  });
  await turn();
  freshAttachmentCallback(nodeEvent({
    targetKey: "node-after-rebaseline",
    name: "after-rebaseline",
    data: {},
  }));
  await waitFor(() => inputEvents.length === 4, "event after complete rebaseline");
  assert.equal(inputEvents[3].payload.name, "after-rebaseline");
  assert.equal(inputEvents.some(({ payload }) => payload.name === "revoked"), false);
  publisher.retire();
});
