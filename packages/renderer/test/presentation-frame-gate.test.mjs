import test from "node:test";
import assert from "node:assert/strict";
import { PresentationFrameGate } from "../dist/internal/presentation-frame-gate.js";

const turn = () => new Promise((resolve) => setImmediate(resolve));
function deferred() {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
}

function snapshot(frameId = "world", activationId = "a1", subsystemKey = "game") {
  return {
    sessionId: "S",
    revision: 1,
    runtimes: [],
    stack: [{ frameId, subsystemKey, lifecycle: "active", activationId }],
    dataAuthorities: [],
  };
}

function peer(sendEvent) {
  return {
    binding: { subsystemKey: "game", generation: 1, dataProfile: "loomrealm.renderer-data/3" },
    viewport: { sendState: async () => ({ kind: "sent" }) },
    presentation: { sendEvent },
    terminal: new Promise(() => {}),
    close: async () => {},
  };
}

function event(targetPeer, overrides = {}) {
  return {
    sourceSessionId: "S",
    sourceSubsystemKey: "world",
    sourceGeneration: 1,
    sourcePeer: overrides.sourcePeer ?? targetPeer,
    targetSubsystemKey: "game",
    targetPeer,
    frameId: "world",
    activationId: "a1",
    channel: "controls.event",
    name: "input.event",
    domainId: "hud",
    targetKey: "controls",
    data: { sequence: overrides.sequence ?? 0 },
    ...overrides,
  };
}

function interest(frameId = "world", channels = ["controls.event"]) {
  return { type: "presentation.interest", frames: [{ frameId, channels }] };
}

test("sender gate requires exact top lease, target peer, interest, and current source", async () => {
  const sent = [];
  let sourceCurrent = true;
  const target = peer(async (message) => { sent.push(message); return { kind: "sent" }; });
  const gate = new PresentationFrameGate(() => sourceCurrent);
  gate.setControl(snapshot());
  gate.installData("game", target);

  gate.offer(event(target));
  await turn();
  assert.equal(sent.length, 0, "no interest means no send");

  gate.replaceInterest("game", target, interest());
  sourceCurrent = false;
  gate.offer(event(target));
  await turn();
  assert.equal(sent.length, 0, "retired source means no send");

  sourceCurrent = true;
  gate.offer(event(target));
  await turn();
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0], {
    type: "presentation.event",
    sourceSubsystemKey: "world",
    domainId: "hud",
    targetKey: "controls",
    frameId: "world",
    activationId: "a1",
    channel: "controls.event",
    name: "input.event",
    data: { sequence: 0 },
  });
});

test("accepted events never retarget across A1 to B1 or A2", async () => {
  const first = deferred();
  const sent = [];
  const target = peer((message) => {
    sent.push(message);
    return sent.length === 1 ? first.promise : Promise.resolve({ kind: "sent" });
  });
  const gate = new PresentationFrameGate(() => true);
  gate.setControl(snapshot());
  gate.installData("game", target);
  gate.replaceInterest("game", target, interest());

  gate.offer(event(target, { sequence: 1 }));
  gate.offer(event(target, { sequence: 2 }));
  assert.equal(sent.length, 1, "one Presentation send may be in flight");
  gate.setControl(snapshot("battle", "b1", "game"));
  first.resolve({ kind: "sent" });
  await turn();
  assert.deepEqual(sent.map((message) => message.data.sequence), [1]);

  gate.setControl(snapshot("world", "a2", "game"));
  gate.replaceInterest("game", target, interest("world"));
  gate.offer(event(target, { sequence: 3 }));
  await turn();
  assert.deepEqual(sent.map((message) => message.data.sequence), [1], "A1 does not execute in A2");
});

test("lease replacement immediately frees pending capacity for the new activation", async () => {
  const first = deferred();
  const sent = [];
  const target = peer(async (message) => {
    sent.push(message.data.sequence);
    if (message.data.sequence === 0) await first.promise;
    return { kind: "sent" };
  });
  const gate = new PresentationFrameGate(() => true);
  gate.installData("game", target);
  gate.replaceInterest("game", target, {
    type: "presentation.interest",
    frames: [
      { frameId: "battle", channels: ["controls.event"] },
      { frameId: "world", channels: ["controls.event"] },
    ],
  });
  gate.setControl(snapshot());
  gate.offer(event(target, { sequence: 0 }));
  for (let sequence = 1; sequence <= 256; sequence += 1) {
    gate.offer(event(target, { sequence }));
  }
  assert.deepEqual(sent, [0]);

  gate.setControl(snapshot("battle", "b1", "game"));
  gate.offer(event(target, {
    frameId: "battle",
    activationId: "b1",
    sequence: 999,
  }));
  first.resolve();
  await turn();
  assert.deepEqual(sent, [0, 999]);
});

test("target replacement and interest shrink fence queued work", async () => {
  const first = deferred();
  const sent = [];
  const oldPeer = peer((message) => {
    sent.push(message.data.sequence);
    return sent.length === 1 ? first.promise : Promise.resolve({ kind: "sent" });
  });
  const nextPeer = peer(async (message) => { sent.push(message.data.sequence); return { kind: "sent" }; });
  const gate = new PresentationFrameGate(() => true);
  gate.setControl(snapshot());
  gate.installData("game", oldPeer);
  gate.replaceInterest("game", oldPeer, interest());
  gate.offer(event(oldPeer, { sequence: 1 }));
  gate.offer(event(oldPeer, { sequence: 2 }));
  gate.replaceInterest("game", oldPeer, { type: "presentation.interest", frames: [] });
  gate.replaceInterest("game", oldPeer, interest());
  first.resolve({ kind: "sent" });
  await turn();
  assert.deepEqual(sent, [1]);

  gate.installData("game", nextPeer);
  gate.replaceInterest("game", nextPeer, interest());
  gate.offer(event(oldPeer, { targetPeer: oldPeer, sequence: 3 }));
  gate.offer(event(nextPeer, { sequence: 4 }));
  await turn();
  assert.deepEqual(sent, [1, 4]);
});

test("source replacement eagerly frees capacity in every cross-Subsystem target queue", async () => {
  const first = deferred();
  const sent = [];
  const target = peer(async (message) => {
    sent.push(message.data.sequence);
    if (message.data.sequence === 0) await first.promise;
    return { kind: "sent" };
  });
  const oldSource = peer(async () => ({ kind: "sent" }));
  const nextSource = peer(async () => ({ kind: "sent" }));
  let currentSource = oldSource;
  const gate = new PresentationFrameGate((candidate) => candidate.sourcePeer === currentSource);
  gate.setControl(snapshot());
  gate.installData("game", target);
  gate.installData("world", oldSource);
  gate.replaceInterest("game", target, interest());
  for (let sequence = 0; sequence <= 256; sequence += 1) {
    gate.offer(event(target, { sourcePeer: oldSource, sequence }));
  }
  assert.deepEqual(sent, [0]);

  currentSource = nextSource;
  gate.installData("world", nextSource);
  gate.offer(event(target, { sourcePeer: nextSource, sequence: 999 }));
  first.resolve();
  await turn();
  assert.deepEqual(sent, [0, 999]);
});

test("a retired source RenderNode cannot occupy pending capacity for a current sibling", async () => {
  const first = deferred();
  const sent = [];
  const target = peer(async (message) => {
    sent.push(message.data.sequence);
    if (message.data.sequence === 0) await first.promise;
    return { kind: "sent" };
  });
  const liveTargets = new Set(["source-a", "source-b"]);
  const gate = new PresentationFrameGate((candidate) => liveTargets.has(candidate.targetKey));
  gate.setControl(snapshot());
  gate.installData("game", target);
  gate.replaceInterest("game", target, interest());
  for (let sequence = 0; sequence <= 256; sequence += 1) {
    gate.offer(event(target, { targetKey: "source-a", sequence }));
  }
  assert.deepEqual(sent, [0]);

  liveTargets.delete("source-a");
  gate.offer(event(target, { targetKey: "source-b", sequence: 999 }));
  first.resolve();
  await turn();
  assert.deepEqual(sent, [0, 999]);
});

test("Presentation queue exceeds historical 256 pending, stays FIFO, and uses one in-flight send", async () => {
  const first = deferred();
  const sent = [];
  let active = 0;
  let maxActive = 0;
  const target = peer(async (message) => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    sent.push(message.data.sequence);
    if (message.data.sequence === 0) await first.promise;
    active -= 1;
    return { kind: "sent" };
  });
  const gate = new PresentationFrameGate(() => true);
  gate.setControl(snapshot());
  gate.installData("game", target);
  gate.replaceInterest("game", target, interest());
  for (let sequence = 0; sequence < 300; sequence += 1) gate.offer(event(target, { sequence }));
  assert.deepEqual(sent, [0]);
  first.resolve();
  for (let attempt = 0; attempt < 20 && sent.length < 300; attempt += 1) await turn();
  assert.equal(sent.length, 300);
  assert.deepEqual(sent, Array.from({ length: 300 }, (_, index) => index));
  assert.equal(maxActive, 1);
});
