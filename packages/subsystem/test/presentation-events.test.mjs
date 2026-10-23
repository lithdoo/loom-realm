import test from "node:test";
import assert from "node:assert/strict";
import { PresentationEventManager } from "../dist/internal/presentation-event-manager.js";

const sent = { kind: "sent" };

function harness() {
  const views = new WeakMap();
  const byId = new Map();
  const facts = {
    inspect(frame) { return views.get(frame) ?? { kind: "foreign" }; },
    inspectById(frameId) { return byId.get(frameId) ?? null; },
  };
  const frame = (id, activationId = "a1") => {
    const value = Object.freeze({ id, params: null, signal: new AbortController().signal, call: async () => ({ type: "cancelled" }) });
    const view = { kind: "live", frameId: id, activationId, deliveryOpen: true };
    views.set(value, view);
    byId.set(id, view);
    return value;
  };
  const set = (frameValue, next) => {
    views.set(frameValue, next);
    if (next.kind === "live") byId.set(next.frameId, next);
    else byId.delete(frameValue.id);
  };
  return { facts, frame, set };
}

function message(frameId, activationId = "a1", overrides = {}) {
  return {
    type: "presentation.event",
    sourceSubsystemKey: "world",
    domainId: "hud",
    targetKey: "controls",
    frameId,
    activationId,
    channel: "controls.event",
    name: "input.event",
    data: { action: "down" },
    ...overrides,
  };
}

function fakePeer(interests) {
  return {
    presentation: {
      async sendInterest(value) { interests.push(structuredClone(value)); return sent; },
    },
  };
}

test("listener requires an exactly-once bound owned live Frame", () => {
  const manager = new PresentationEventManager();
  const h = harness();
  const owned = h.frame("owned");
  assert.throws(() => manager.createListener({ frame: owned, channels: ["controls.event"] }), /Foreign Frame/);
  manager.bindRuntime(h.facts);
  assert.throws(() => manager.bindRuntime(h.facts), /already bound/);
  assert.throws(() => manager.createListener({ frame: owned, channels: ["\uD800"] }), /Invalid Presentation channel/);
  const foreign = Object.freeze({ id: "foreign" });
  assert.throws(() => manager.createListener({ frame: foreign, channels: ["controls.event"] }), /Foreign Frame/);
  h.set(owned, { kind: "closed" });
  assert.throws(() => manager.createListener({ frame: owned, channels: ["controls.event"] }), { name: "FrameClosedError" });
});

test("same-Subsystem frames and activations deliver only to the exact eligible listener", async () => {
  const manager = new PresentationEventManager();
  const h = harness();
  manager.bindRuntime(h.facts);
  const parent = h.frame("parent", "a-parent");
  const child = h.frame("child", "a-child");
  const seen = [];
  const parentListener = manager.createListener({ frame: parent, channels: ["controls.event"] });
  const childListener = manager.createListener({ frame: child, channels: ["controls.event"] });
  parentListener.on("controls.event", (event) => seen.push(["parent", event.source.subsystemKey]));
  childListener.on("controls.event", (event) => seen.push(["child", event.source.subsystemKey]));

  manager.onEvent(message("child", "a-child"));
  assert.deepEqual(seen, [["child", "world"]]);
  manager.onEvent(message("parent", "old"));
  assert.deepEqual(seen, [["child", "world"]]);
  h.set(child, { kind: "live", frameId: "child", activationId: "a2", deliveryOpen: true });
  manager.onEvent(message("child", "a-child"));
  assert.deepEqual(seen, [["child", "world"]]);
  manager.onEvent(message("child", "a2", { name: "controls.state", data: { held: ["south"] } }));
  assert.deepEqual(seen, [["child", "world"], ["child", "world"]]);
});

test("every handler is re-gated and synchronous throw or Promise rejection stays local", async () => {
  const manager = new PresentationEventManager();
  const h = harness();
  manager.bindRuntime(h.facts);
  const frame = h.frame("frame", "a1");
  const listener = manager.createListener({ frame, channels: ["controls.event"] });
  const seen = [];
  listener.on("controls.event", () => {
    seen.push("first");
    h.set(frame, { kind: "live", frameId: "frame", activationId: null, deliveryOpen: false });
    throw new Error("business failure");
  });
  listener.on("controls.event", () => { seen.push("must-not-run"); });
  assert.deepEqual(manager.onEvent(message("frame")), { kind: "accepted" });
  assert.deepEqual(seen, ["first"]);

  listener.close();
  h.set(frame, { kind: "live", frameId: "frame", activationId: "a2", deliveryOpen: true });
  const second = manager.createListener({ frame, channels: ["controls.event"] });
  second.on("controls.event", async () => { seen.push("rejecting"); throw new Error("async business failure"); });
  second.on("controls.event", () => { seen.push("sibling"); });
  manager.onEvent(message("frame", "a2"));
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(seen.slice(-2), ["rejecting", "sibling"]);
});

test("Interest is a canonical union, republishes on fresh peer, shrinks on close, and terminal cleanup is inert", async () => {
  const manager = new PresentationEventManager();
  const h = harness();
  manager.bindRuntime(h.facts);
  const b = h.frame("b");
  const a = h.frame("a");
  const first = manager.createListener({ frame: b, channels: ["z", "a"] });
  const second = manager.createListener({ frame: a, channels: ["m"] });
  manager.createListener({ frame: b, channels: ["a", "m"] });
  const publications = [];
  manager.setDataPeer(fakePeer(publications));
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(publications.at(-1), {
    type: "presentation.interest",
    frames: [
      { frameId: "a", channels: ["m"] },
      { frameId: "b", channels: ["a", "m", "z"] },
    ],
  });

  const replacement = [];
  manager.setDataPeer(fakePeer(replacement));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(replacement.length, 1);
  manager.closeFrame("b");
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(replacement.at(-1), {
    type: "presentation.interest",
    frames: [{ frameId: "a", channels: ["m"] }],
  });
  assert.throws(() => first.on("a", () => {}), /closed/);
  second.close();
  manager.closeAll();
  assert.throws(() => manager.createListener({ frame: a, channels: ["m"] }), /Foreign Frame|closed/);
});

test("Interest canonicalization uses Unicode scalar order rather than UTF-16 code units", async () => {
  const manager = new PresentationEventManager();
  const h = harness();
  manager.bindRuntime(h.facts);
  const supplementary = h.frame("\u{10000}");
  const bmp = h.frame("\uE000");
  manager.createListener({ frame: supplementary, channels: ["\u{10000}", "\uE000"] });
  manager.createListener({ frame: bmp, channels: ["channel"] });
  const publications = [];
  manager.setDataPeer(fakePeer(publications));
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(publications.at(-1), {
    type: "presentation.interest",
    frames: [
      { frameId: "\uE000", channels: ["channel"] },
      { frameId: "\u{10000}", channels: ["\uE000", "\u{10000}"] },
    ],
  });
});

test("a fresh activation starts neutral: old transient state and edge events are never replayed", () => {
  const manager = new PresentationEventManager();
  const h = harness();
  manager.bindRuntime(h.facts);
  const frame = h.frame("frame", "a1");
  const listener = manager.createListener({ frame, channels: ["controls.state", "controls.event"] });
  const seen = [];
  listener.on("controls.state", (event) => seen.push(event.data));
  listener.on("controls.event", (event) => seen.push(event.data));
  manager.onEvent(message("frame", "a1", { channel: "controls.state", name: "controls.state", data: { held: ["south"] } }));
  manager.onEvent(message("frame", "a1", { data: { action: "down" } }));
  h.set(frame, { kind: "live", frameId: "frame", activationId: "a2", deliveryOpen: true });
  manager.onEvent(message("frame", "a1", { channel: "controls.state", name: "controls.state", data: { held: ["south"] } }));
  assert.equal(seen.length, 2);
  manager.onEvent(message("frame", "a2", { channel: "controls.state", name: "controls.state", data: { held: [] } }));
  assert.deepEqual(seen.at(-1), { held: [] });
});
