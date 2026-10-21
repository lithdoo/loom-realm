import assert from "node:assert/strict";
import test from "node:test";
import { createMemoryCarrierPair } from "@loomrealm/foundation/testing";
import { createSubsystemDataPeer } from "@loomrealm/data";
import { createMainRendererControlPeer, prepareRendererHelloResultV2 } from "@loomrealm/renderer-control";
import { createRendererControlHolder } from "../dist/index.js";
import { attachRendererPresentation } from "../dist/internal/presentation-seam.js";

const authority = (subsystemKey) => ({ subsystemKey, generation: 1, dataProfile: "loomrealm.renderer-data/2" });
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
  await waitFor(() => publications.length === 2, "publications");
  assert.deepEqual(publications.map(({ channel, type, broadcast }) => [channel, type, broadcast]), [
    ["x.loomrealm.web-presentation.event", "confirm", false],
    ["keyboard.event", "input.event", true],
  ]);
  assert.deepEqual(publications[1].payload, { domainId: "domain", targetKey: "node", data: { code: "Enter" } });
  assert.equal(publications[1].ownerSubsystemKey, "owner");
  publisher.retire();
});
