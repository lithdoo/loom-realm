import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryCarrierPair } from "@loomrealm/foundation/testing";
import {
  createRendererDataPeer,
  createSubsystemDataPeer,
  RENDERER_DATA_PROFILE_V3,
} from "../dist/index.js";

const accepted = () => ({ kind: "accepted" });
const binding = (carrier) => ({
  carrier,
  subsystemKey: "battle",
  generation: 1,
  dataProfile: RENDERER_DATA_PROFILE_V3,
});
const turn = () => new Promise((resolve) => setImmediate(resolve));

function renderer(pair, seen) {
  return createRendererDataPeer({
    binding: binding(pair.right),
    handlers: {
      onRenderDomains: accepted,
      onRenderSnapshot: accepted,
      onRenderPatch: accepted,
      onRenderEvent: accepted,
      onPresentationInterest(message) { seen.push(message); return accepted(); },
    },
  });
}

function subsystem(pair, seen) {
  return createSubsystemDataPeer({
    binding: binding(pair.left),
    handlers: {
      onViewportState: accepted,
      onPresentationEvent(message) { seen.push(message); return accepted(); },
    },
  });
}

test("presentation interest and events share the v3 DataRuntime writer in opposite directions", async () => {
  const pair = createMemoryCarrierPair();
  const interests = [];
  const events = [];
  const left = subsystem(pair, events);
  const right = renderer(pair, interests);
  const interest = {
    type: "presentation.interest",
    frames: [{ frameId: "f1", channels: ["controls.event", "controls.state"] }],
  };
  const event = {
    type: "presentation.event",
    sourceSubsystemKey: "world",
    domainId: "hud",
    targetKey: "controls",
    frameId: "f1",
    activationId: "a1",
    channel: "controls.event",
    name: "input.event",
    data: { action: "down" },
  };
  assert.deepEqual(await left.presentation.sendInterest(interest), { kind: "sent" });
  assert.deepEqual(await right.presentation.sendEvent(event), { kind: "sent" });
  await turn();
  assert.deepEqual(interests, [interest]);
  assert.deepEqual(events, [event]);
  await left.close();
  await right.terminal;
});

test("presentation.event exceeds historical depth, byte, and identity thresholds", async () => {
  const pair = createMemoryCarrierPair();
  const events = [];
  const left = subsystem(pair, events);
  const right = renderer(pair, []);
  let data = {};
  for (let depth = 0; depth < 80; depth += 1) data = { child: data };
  data.payload = "x".repeat(300_000);
  const event = {
    type: "presentation.event",
    sourceSubsystemKey: "world".repeat(100),
    domainId: "hud".repeat(100),
    targetKey: "controls".repeat(100),
    frameId: "f1".repeat(100),
    activationId: "a1".repeat(100),
    channel: "controls.event".repeat(30),
    name: "input.event".repeat(30),
    data,
  };
  assert.deepEqual(await right.presentation.sendEvent(event), { kind: "sent" });
  await turn();
  assert.equal(events.length, 1);
  await left.close();
  await right.terminal;
});

test("presentation interest exceeds historical frame/channel/pair caps", async () => {
  const pair = createMemoryCarrierPair();
  const interests = [];
  const left = subsystem(pair, []);
  const right = renderer(pair, interests);
  const frames = Array.from({ length: 129 }, (_, frameIndex) => ({
    frameId: `frame-${String(frameIndex).padStart(3, "0")}`,
    channels: Array.from({ length: 65 }, (_, channelIndex) =>
      `channel-${String(channelIndex).padStart(3, "0")}-${"x".repeat(260)}`),
  }));
  assert.deepEqual(await left.presentation.sendInterest({ type: "presentation.interest", frames }), { kind: "sent" });
  await turn();
  assert.equal(interests[0].frames.length, 129);
  assert.equal(interests[0].frames.reduce((count, frame) => count + frame.channels.length, 0), 8_385);
  await left.close();
  await right.terminal;
});

test("presentation schemas are closed, canonical, and direction checked", async (t) => {
  for (const [name, raw, protocol] of [
    ["unsorted frames", { type: "presentation.interest", frames: [
      { frameId: "z", channels: ["controls.event"] },
      { frameId: "a", channels: ["controls.event"] },
    ] }, "presentation"],
    ["empty frame contribution", { type: "presentation.interest", frames: [{ frameId: "f", channels: [] }] }, "presentation"],
    ["control channel", { type: "presentation.interest", frames: [{ frameId: "f", channels: ["bad\nchannel"] }] }, "presentation"],
    ["forged extra event field", {
      type: "presentation.event", sourceSubsystemKey: "world", domainId: "d", targetKey: "n",
      frameId: "f", activationId: "a", channel: "c", name: "n", data: {}, targetSubsystemKey: "battle",
    }, "presentation"],
  ]) {
    await t.test(name, async () => {
      const pair = createMemoryCarrierPair();
      const peer = raw.type === "presentation.interest" ? renderer(pair, []) : subsystem(pair, []);
      const sender = raw.type === "presentation.interest" ? pair.left : pair.right;
      await sender.send(JSON.stringify(raw));
      const terminal = await peer.terminal;
      assert.equal(terminal.kind, "protocol-fatal");
      assert.equal(terminal.protocol, protocol);
    });
  }

  const wrong = createMemoryCarrierPair();
  const peer = subsystem(wrong, []);
  await wrong.right.send(JSON.stringify({ type: "presentation.interest", frames: [] }));
  const terminal = await peer.terminal;
  assert.equal(terminal.kind, "protocol-fatal");
  assert.equal(terminal.protocol, "presentation");
});

test("profile v2 binding is rejected before a carrier reader is claimed", () => {
  let reads = 0;
  const carrier = {
    closed: new Promise(() => {}),
    send: async () => {},
    messages() { reads += 1; return { async *[Symbol.asyncIterator]() {} }; },
    close: async () => {},
  };
  assert.throws(() => createSubsystemDataPeer({
    binding: { carrier, subsystemKey: "battle", generation: 1, dataProfile: "loomrealm.renderer-data/2" },
    handlers: { onViewportState: accepted },
  }), TypeError);
  assert.equal(reads, 0);
});
