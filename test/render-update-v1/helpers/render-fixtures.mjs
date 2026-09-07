import assert from "node:assert/strict";
import { createRendererDataPeer, createSubsystemDataPeer } from "@loomrealm/data";
import { RenderManager } from "../../../packages/subsystem/dist/internal/render-manager.js";
import { RendererRenderStore } from "../../../packages/renderer/dist/internal/render-store.js";
import { decodeForRole, encodeForRole } from "../../../packages/data/dist/profile-codec.js";

export const node = (key, children = [], attrs = {}, data = {}, tag = "sprite") => ({
  key, tag, attrs, data, children,
});
export const state = (roots = [node("root")], zIndex = 0) => ({ roots, zIndex });
export const domains = (...ids) => ({ type: "render.domains", domains: ids });
export const snapshot = (domainId = "d1", revision = 1, roots = [node("root")], zIndex = 0) => ({
  type: "render.snapshot", domainId, revision, zIndex, roots,
});
export const patch = (ops = [], overrides = {}) => ({
  type: "render.patch", domainId: "d1", baseRevision: 1, revision: 2, ops, ...overrides,
});
export const event = (targetKey = "root", overrides = {}) => ({
  type: "render.event", domainId: "d1", targetKey, name: "tick", data: {}, ...overrides,
});
export const turn = () => new Promise((resolve) => setImmediate(resolve));
export const settle = async () => { for (let index = 0; index < 10; index += 1) await turn(); };

export function newStore(generation = 1, ids = ["d1"]) {
  const store = new RendererRenderStore(generation);
  store.beginCarrier();
  assertAccepted(store.onDomains(domains(...ids)));
  return store;
}

export function baseline(roots = [node("root")], options = {}) {
  const store = options.store ?? newStore(options.generation ?? 1, options.ids ?? ["d1"]);
  assertAccepted(store.onSnapshot(snapshot(
    options.domainId ?? "d1",
    options.revision ?? 1,
    roots,
    options.zIndex ?? 0,
  )));
  return store;
}

export function assertAccepted(outcome) {
  assert.deepEqual(outcome, { kind: "accepted" });
}

export function assertFatal(outcome, pattern) {
  assert.equal(outcome.kind, "protocol-fatal");
  if (pattern !== undefined) assert.match(String(outcome.cause), pattern);
}

export function committedDomain(store, domainId = "d1") {
  return store.snapshotForQualification().domains.find((domain) => domain.domainId === domainId);
}

export function expectAtomicFatal(store, operation, pattern) {
  const before = JSON.stringify(store.snapshotForQualification());
  assertFatal(operation(), pattern);
  assert.equal(JSON.stringify(store.snapshotForQualification()), before);
}

export function chain(depth, prefix = "n") {
  let current = node(`${prefix}${depth}`);
  for (let index = depth - 1; index >= 1; index -= 1) current = node(`${prefix}${index}`, [current]);
  return current;
}

export function flatNodes(count, prefix = "n") {
  return Array.from({ length: count }, (_, index) => node(`${prefix}${index}`));
}

export function nestedData(depth) {
  let value = null;
  for (let index = 0; index < depth; index += 1) value = { child: value };
  return value;
}

export function objectMembers(count) {
  return Object.fromEntries(Array.from({ length: count }, (_, index) => [`k${index}`, null]));
}

export function expectOutboundAccepted(message) {
  assert.doesNotThrow(() => encodeForRole(message, "subsystem"));
}

export function expectOutboundRejected(message, pattern) {
  assert.throws(() => encodeForRole(message, "subsystem"), pattern);
}

export function expectInboundAccepted(raw) {
  return decodeForRole(raw, "renderer");
}

export function expectInboundRejected(raw, pattern) {
  assert.throws(() => decodeForRole(raw, "renderer"), pattern);
}

export function senderHarness(generation = 1, hook = async () => {}) {
  const messages = [];
  const peer = {
    binding: { subsystemKey: "demo", generation, dataProfile: "loomrealm.renderer-data/1" },
    render: Object.fromEntries(["sendDomains", "sendSnapshot", "sendPatch", "sendEvent"].map((name) => [name, async (message) => {
      messages.push(message);
      await hook(message, messages.length - 1);
      return { kind: "sent" };
    }])),
  };
  return { peer, messages };
}

export async function connectedSender(options = {}) {
  const manager = options.manager ?? new RenderManager();
  const domain = options.domain ?? manager.createDomain(options.initialState ?? state());
  const wire = senderHarness(options.generation ?? 1, options.hook);
  manager.setDataPeer(wire.peer);
  await settle();
  return { manager, domain, ...wire };
}

export function inboundCarrier(units) {
  let finish;
  const closed = new Promise((resolve) => { finish = resolve; });
  return {
    closed,
    async send() {},
    async *messages() {
      for (const unit of units) yield unit;
      await closed;
    },
    async close() { finish({ kind: "closed" }); },
  };
}

export async function terminalForRaw(raw, handlers = {}) {
  const renderer = createRendererDataPeer({
    binding: { carrier: inboundCarrier([raw]), subsystemKey: "demo", generation: 1, dataProfile: "loomrealm.renderer-data/1" },
    handlers: {
      onInputInterest: () => ({ kind: "accepted" }),
      onRenderDomains: handlers.onRenderDomains ?? (() => ({ kind: "accepted" })),
      onRenderSnapshot: handlers.onRenderSnapshot ?? (() => ({ kind: "accepted" })),
      onRenderPatch: handlers.onRenderPatch ?? (() => ({ kind: "accepted" })),
      onRenderEvent: handlers.onRenderEvent ?? (() => ({ kind: "accepted" })),
    },
  });
  return renderer.terminal;
}

export async function realSenderPeer(carrier, generation = 1) {
  return createSubsystemDataPeer({
    binding: { carrier, subsystemKey: "demo", generation, dataProfile: "loomrealm.renderer-data/1" },
    handlers: {
      onInputState: () => ({ kind: "accepted" }),
      onInputEvent: () => ({ kind: "accepted" }),
      onInputReset: () => ({ kind: "accepted" }),
    },
  });
}

export function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

