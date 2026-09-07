import assert from "node:assert/strict";
import { InputManager } from "../../../packages/subsystem/dist/internal/input-manager.js";
import { RendererInputGate } from "../../../packages/renderer/dist/internal/input-gate.js";
import {
  decodeForRole,
  encodeForRole,
} from "../../../packages/data/dist/profile-codec.js";

export { decodeForRole, encodeForRole };

export function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

export async function turn() {
  await new Promise((resolve) => setImmediate(resolve));
}

export function snapshot({
  revision = 1,
  target = { subsystemKey: "demo", frameId: "root", activationId: "a1" },
  stack = target === null ? [] : [{
    frameId: target.frameId,
    subsystemKey: target.subsystemKey,
    lifecycle: "active",
    activationId: target.activationId,
  }],
  authorities = [{
    subsystemKey: "demo",
    generation: 1,
    dataProfile: "loomrealm.renderer-data/1",
  }],
} = {}) {
  return {
    sessionId: "qualification",
    revision,
    runtimes: [{ subsystemKey: "demo", state: "ready" }],
    stack,
    inputTarget: target,
    dataAuthorities: authorities,
  };
}

export function rendererRole({ deferredSends = false } = {}) {
  const sent = [];
  const gates = [];
  const send = (message) => {
    sent.push(message);
    if (!deferredSends) return Promise.resolve({ kind: "sent" });
    const gate = deferred();
    gates.push(gate);
    return gate.promise;
  };
  const peer = { input: { sendState: send, sendEvent: send, sendReset: send } };
  const gate = new RendererInputGate();
  gate.installData("demo", peer);
  return {
    gate,
    peer,
    sent,
    gates,
    interest(frames = [{ frameId: "root", channels: ["keyboard.state"] }]) {
      gate.replaceInterest("demo", peer, { type: "input.interest", frames });
    },
    release(index, outcome = { kind: "sent" }) {
      assert.ok(gates[index], `missing deferred send ${index}`);
      gates[index].resolve(outcome);
    },
  };
}

export function subsystemRole({ frameCount = 1 } = {}) {
  const manager = new InputManager();
  const views = new Map();
  const frames = Array.from({ length: frameCount }, (_, index) => {
    const id = index === 0 ? "root" : `f${String(index).padStart(3, "0")}`;
    const frame = Object.freeze({
      id,
      params: null,
      signal: new AbortController().signal,
      async call() {},
    });
    views.set(id, {
      kind: "live",
      frameId: id,
      activationId: "a1",
      deliveryOpen: true,
    });
    return frame;
  });
  manager.bindRuntime({
    inspect(frame) {
      const current = frames.find((candidate) => candidate === frame);
      return current === undefined ? { kind: "foreign" } : views.get(current.id);
    },
    inspectById(frameId) {
      return views.get(frameId) ?? null;
    },
  });
  const interests = [];
  const sends = [];
  const peer = {
    input: {
      sendInterest(message) {
        interests.push(message);
        const gate = deferred();
        sends.push(gate);
        return gate.promise;
      },
    },
  };
  manager.setDataPeer(peer);
  return {
    manager,
    frame: frames[0],
    frames,
    view: views.get("root"),
    views,
    interests,
    sends,
    peer,
    release(index, outcome = { kind: "sent" }) {
      assert.ok(sends[index], `missing Interest send ${index}`);
      sends[index].resolve(outcome);
    },
  };
}

export function state(channel = "keyboard.state", payload = { down: [] }, overrides = {}) {
  return {
    type: "input.state",
    frameId: "root",
    activationId: "a1",
    channel,
    payload,
    ...overrides,
  };
}

export function event(channel = "keyboard.event", payload = {
  action: "down",
  code: "KeyA",
  repeat: false,
}, overrides = {}) {
  return {
    type: "input.event",
    frameId: "root",
    activationId: "a1",
    channel,
    payload,
    ...overrides,
  };
}

export function reset(overrides = {}) {
  return {
    type: "input.reset",
    frameId: "root",
    activationId: "a1",
    ...overrides,
  };
}

export function expectProtocolError(action, pattern) {
  assert.throws(action, (error) => {
    assert.equal(error?.name, "Error");
    if (pattern !== undefined) assert.match(error.message, pattern);
    return true;
  });
}
