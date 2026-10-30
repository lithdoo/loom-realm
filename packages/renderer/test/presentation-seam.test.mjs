import assert from "node:assert/strict";
import test from "node:test";
import { createMemoryCarrierPair } from "@loomrealm/foundation/testing";
import { createSubsystemDataPeer } from "@loomrealm/data";
import { createMainRendererControlPeer, prepareRendererHelloResultV2 } from "@loomrealm/renderer-control";
import { createRendererControlHolder } from "../dist/index.js";
import { attachRendererPresentation } from "../dist/internal/presentation-seam.js";

const authority = (subsystemKey) => ({ subsystemKey, generation: 1, dataProfile: "loomrealm.renderer-data/3" });
const snapshot = (revision) => ({
  sessionId: "S",
  revision,
  runtimes: [{ subsystemKey: "owner", state: "ready" }],
  stack: [{ frameId: "frame", subsystemKey: "owner", lifecycle: "active", activationId: "activation" }],
  dataAuthorities: [authority("owner")],
});
const turn = () => new Promise((resolve) => setImmediate(resolve));

async function waitFor(predicate, label) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return;
    await turn();
  }
  assert.fail(`Timed out waiting for ${label}`);
}

test("Web Presentation events preserve channel, type, payload, owner, and broadcast routing", async (t) => {
  const dataPeers = [];
  const publications = [];
  const holder = createRendererControlHolder({
    async acquire(subsystemKey, generation, dataProfile) {
      const pair = createMemoryCarrierPair();
      const peer = createSubsystemDataPeer({
        binding: { carrier: pair.left, subsystemKey, generation, dataProfile },
        handlers: { onViewportState: () => ({ kind: "accepted" }) },
      });
      dataPeers.push(peer);
      return pair.right;
    },
  }, undefined, { async publish(event) { publications.push(structuredClone(event)); } });
  t.after(async () => Promise.allSettled(dataPeers.map((peer) => peer.close())));

  let emitNodeEvent;
  const detach = attachRendererPresentation(holder, {
    reevaluate(_source, emit) { emitNodeEvent = emit; },
  });
  t.after(detach);

  const control = createMemoryCarrierPair();
  const publisher = createMainRendererControlPeer({
    carrier: control.left,
    acceptHello() {
      const initial = snapshot(1);
      return { kind: "accepted", snapshot: initial, preparedHelloText: prepareRendererHelloResultV2(initial) };
    },
  });
  await holder.connect({ carrier: control.right, rendererControlToken: "token" });
  await waitFor(() => dataPeers.length === 1, "Data peer");
  await dataPeers[0].render.sendDomains({ type: "render.domains", domains: ["domain"] });
  await dataPeers[0].render.sendSnapshot({
    type: "render.snapshot", domainId: "domain", revision: 1, zIndex: 0,
    roots: [{ key: "node", tag: "lr-node", attrs: {}, data: {}, children: [] }],
  });
  await waitFor(() => typeof emitNodeEvent === "function", "presentation callback");

  const base = {
    sessionId: "S", subsystemKey: "owner", generation: 1,
    domainId: "domain", targetKey: "node",
  };
  emitNodeEvent({ ...base, name: "confirm", data: { value: 1 } });
  emitNodeEvent({ ...base, name: "input.event", data: { code: "Enter" }, options: { broadcast: true, channel: "keyboard.event" } });
  const deep = {};
  let cursor = deep;
  for (let index = 0; index < 65; index += 1) cursor = cursor.next = {};
  const wide = Object.fromEntries(Array.from({ length: 16_385 }, (_, index) => [`member${index}`, index]));
  emitNodeEvent({ ...base, name: "historical-cap.event", data: { deep, wide } });
  await waitFor(() => publications.length === 3, "publications");
  assert.deepEqual(publications.map(({ channel, type, broadcast }) => [channel, type, broadcast]), [
    ["x.loomrealm.web-presentation.event", "confirm", false],
    ["keyboard.event", "input.event", true],
    ["x.loomrealm.web-presentation.event", "historical-cap.event", false],
  ]);
  assert.deepEqual(publications[1].payload, { domainId: "domain", targetKey: "node", data: { code: "Enter" } });
  assert.equal(Object.keys(publications[2].payload.data.wide).length, 16_385);
  assert.equal(publications[2].payload.data.deep.next.next.next !== undefined, true);
  assert.equal(publications[1].ownerSubsystemKey, "owner");
  publisher.retire();
});

test("top-frame branches inside Renderer and crosses the target Data peer with trusted source provenance", async (t) => {
  const peers = new Map();
  const events = [];
  const publications = [];
  const holder = createRendererControlHolder({
    async acquire(subsystemKey, generation, dataProfile) {
      const pair = createMemoryCarrierPair();
      const peer = createSubsystemDataPeer({
        binding: { carrier: pair.left, subsystemKey, generation, dataProfile },
        handlers: {
          onViewportState: () => ({ kind: "accepted" }),
          onPresentationEvent(message) { events.push([subsystemKey, structuredClone(message)]); return { kind: "accepted" }; },
        },
      });
      peers.set(subsystemKey, peer);
      return pair.right;
    },
  }, undefined, { async publish(event) { publications.push(event); } });
  t.after(async () => Promise.allSettled([...peers.values()].map((peer) => peer.close())));

  let emitNodeEvent;
  const detach = attachRendererPresentation(holder, {
    reevaluate(_source, emit) { emitNodeEvent = emit; },
  });
  t.after(detach);

  const initial = {
    sessionId: "S",
    revision: 1,
    runtimes: [
      { subsystemKey: "owner", state: "ready" },
      { subsystemKey: "battle", state: "ready" },
    ],
    stack: [{ frameId: "battle-frame", subsystemKey: "battle", lifecycle: "active", activationId: "battle-a1" }],
    dataAuthorities: [authority("owner"), authority("battle")],
  };
  const control = createMemoryCarrierPair();
  const publisher = createMainRendererControlPeer({
    carrier: control.left,
    acceptHello() {
      return { kind: "accepted", snapshot: initial, preparedHelloText: prepareRendererHelloResultV2(initial) };
    },
  });
  await holder.connect({ carrier: control.right, rendererControlToken: "token" });
  await waitFor(() => peers.size === 2, "both Data peers");
  await peers.get("battle").presentation.sendInterest({
    type: "presentation.interest",
    frames: [{ frameId: "battle-frame", channels: ["controls.event"] }],
  });
  await peers.get("owner").render.sendDomains({ type: "render.domains", domains: ["domain"] });
  await peers.get("owner").render.sendSnapshot({
    type: "render.snapshot", domainId: "domain", revision: 1, zIndex: 0,
    roots: [{ key: "node", tag: "lr-node", attrs: {}, data: {}, children: [] }],
  });
  await waitFor(() => typeof emitNodeEvent === "function", "presentation callback");
  await turn();

  const source = {
    sessionId: "S", subsystemKey: "owner", generation: 1,
    domainId: "domain", targetKey: "node",
  };
  emitNodeEvent({
    ...source,
    name: "input.event",
    data: { action: "down", button: "south" },
    options: { broadcast: "top-frame", channel: "controls.event" },
  });
  await waitFor(() => events.length === 1, "top-frame Data event");
  assert.equal(publications.length, 0, "top-frame must not enter the Platform publication path");
  assert.equal(events[0][0], "battle");
  assert.deepEqual(events[0][1], {
    type: "presentation.event",
    sourceSubsystemKey: "owner",
    domainId: "domain",
    targetKey: "node",
    frameId: "battle-frame",
    activationId: "battle-a1",
    channel: "controls.event",
    name: "input.event",
    data: { action: "down", button: "south" },
  });

  publisher.publish({ ...initial, revision: 2, stack: [] });
  await turn();
  emitNodeEvent({
    ...source,
    name: "input.event",
    data: { action: "up" },
    options: { broadcast: "top-frame", channel: "controls.event" },
  });
  await turn();
  assert.equal(events.length, 1, "no active top silently drops");
  assert.throws(() => emitNodeEvent({ ...source, name: "x", data: {}, options: { broadcast: "bad" } }), TypeError);
  publisher.retire();
});
