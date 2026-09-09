import assert from "node:assert/strict";
import test from "node:test";
import { createMemoryCarrierPair } from "@loomrealm/foundation/testing";
import { createSubsystemDataPeer } from "@loomrealm/data";
import { createMainRendererControlPeer, prepareRendererHelloResultV1 } from "@loomrealm/renderer-control";
import { createRendererControlHolder } from "../dist/index.js";
import { attachRendererPresentation } from "../dist/internal/presentation-seam.js";

const authority = (subsystemKey, generation = 1) => ({ subsystemKey, generation, dataProfile: "loomrealm.renderer-data/1" });
const snapshot = (sessionId, revision, dataAuthorities = []) => ({
  sessionId, revision, runtimes: dataAuthorities.map(({ subsystemKey }) => ({ subsystemKey, state: "ready" })),
  stack: [], inputTarget: null, dataAuthorities,
});
const turn = () => new Promise((resolve) => setImmediate(resolve));

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
