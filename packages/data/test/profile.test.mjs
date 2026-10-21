import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryCarrierPair } from "@loomrealm/foundation/testing";
import {
  createRendererDataPeer,
  createSubsystemDataPeer,
  RENDERER_DATA_PROFILE_V2,
} from "../dist/index.js";

const accepted = () => ({ kind: "accepted" });
const binding = (carrier) => ({
  carrier,
  subsystemKey: "map",
  generation: 1,
  dataProfile: RENDERER_DATA_PROFILE_V2,
});
const tick = () => new Promise((resolve) => setImmediate(resolve));

test("routes Render and Viewport over Renderer Data Profile v2", async () => {
  const pair = createMemoryCarrierPair();
  const seen = [];
  const subsystem = createSubsystemDataPeer({
    binding: binding(pair.left),
    handlers: {
      onViewportState(message) { seen.push(["viewport", message.width]); return accepted(); },
    },
  });
  const renderer = createRendererDataPeer({
    binding: binding(pair.right),
    handlers: {
      onRenderDomains(message) { seen.push(["domains", message.domains.length]); return accepted(); },
      onRenderSnapshot: accepted,
      onRenderPatch: accepted,
      onRenderEvent: accepted,
    },
  });

  assert.deepEqual(await subsystem.render.sendDomains({ type: "render.domains", domains: ["hud"] }), { kind: "sent" });
  assert.deepEqual(await renderer.viewport.sendState({ type: "viewport.state", width: 800, height: 600 }), { kind: "sent" });
  await tick();
  assert.deepEqual(seen, [["domains", 1], ["viewport", 800]]);
  await subsystem.close();
  await renderer.terminal;
});

test("removed input.* messages fail closed as profile violations", async () => {
  const pair = createMemoryCarrierPair();
  const subsystem = createSubsystemDataPeer({
    binding: binding(pair.left),
    handlers: { onViewportState: accepted },
  });
  await pair.right.send(JSON.stringify({ type: "input.reset", frameId: "f1", activationId: "a1" }));
  const terminal = await subsystem.terminal;
  assert.equal(terminal.kind, "protocol-fatal");
  assert.equal(terminal.protocol, "profile");
});

test("wrong-direction inbound message fails the current Data peer", async () => {
  const pair = createMemoryCarrierPair();
  const subsystem = createSubsystemDataPeer({
    binding: binding(pair.left),
    handlers: { onViewportState: accepted },
  });
  await pair.right.send(JSON.stringify({ type: "render.domains", domains: [] }));
  const terminal = await subsystem.terminal;
  assert.equal(terminal.kind, "protocol-fatal");
  assert.equal(terminal.protocol, "render");
});
