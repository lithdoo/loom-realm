import { test } from "node:test";
import assert from "node:assert/strict";
import { createMemoryCarrierPair } from "@loomrealm/foundation/testing";
import {
  connectSubsystemRuntimeControl,
  createMainRuntimeControlPeer,
} from "../dist/index.js";

const scheduler = {
  schedule(ms, callback) {
    const timer = setTimeout(callback, ms);
    return () => clearTimeout(timer);
  },
};
const handlers = {
  onShutdown: () => ({ kind: "success", result: {} }),
  onFrameInitialize: () => ({ kind: "success", result: {} }),
  onFrameActivate: () => ({ kind: "success", result: {} }),
  onFrameSuspend: () => ({ kind: "success", result: {} }),
  onFrameResume: () => ({ kind: "success", result: {} }),
  onFrameClose: () => ({ kind: "success", result: {} }),
};
const mainOptions = (carrier) => ({
  carrier,
  scheduler,
  frameDeadlineMs: 1000,
  shutdownDeadlineMs: 1000,
  authenticateHello: () => ({ kind: "accepted" }),
  handlers: {
    onStatus() {},
    onFrameCall: () => ({ kind: "success", result: { childFrameId: "child" } }),
    onFrameReturn: () => ({ kind: "success", result: {} }),
  },
});

async function rawMainSession() {
  const pair = createMemoryCarrierPair();
  const incoming = pair.right.messages()[Symbol.asyncIterator]();
  const main = createMainRuntimeControlPeer(mainOptions(pair.left));
  await pair.right.send(
    JSON.stringify({
      jsonrpc: "2.0",
      method: "subsystem.hello",
      params: { key: "s", bootstrapToken: "t", protocolVersions: [1] },
      id: 1,
    }),
  );
  await incoming.next();
  await main.identified;
  return { pair, incoming, main };
}

test("syntax and envelope failures map to distinct fatal diagnostics", async () => {
  for (const [text, code] of [
    ["{", -32700],
    [JSON.stringify({ jsonrpc: "2.0", wat: true }), -32600],
  ]) {
    const pair = createMemoryCarrierPair();
    const incoming = pair.right.messages()[Symbol.asyncIterator]();
    const main = createMainRuntimeControlPeer(mainOptions(pair.left));
    await pair.right.send(text);
    const diagnostic = JSON.parse((await incoming.next()).value);
    assert.equal(diagnostic.error.code, code);
    assert.equal(diagnostic.id, null);
    assert.equal((await main.terminal).kind, "protocol-fatal");
  }
});

test("responses are correlated while an ordered inbound handler is awaiting", async () => {
  const pair = createMemoryCarrierPair();
  let release;
  const blocked = new Promise((r) => {
    release = r;
  });
  let initializeCalls = 0;
  const main = createMainRuntimeControlPeer({
    ...mainOptions(pair.left),
    handlers: {
      onStatus() {},
      async onFrameCall() {
        await blocked;
        return { kind: "success", result: { childFrameId: "child" } };
      },
      onFrameReturn: () => ({ kind: "success", result: {} }),
    },
  });
  const connected = await connectSubsystemRuntimeControl({
    carrier: pair.right,
    scheduler,
    helloDeadlineMs: 1000,
    frameDeadlineMs: 1000,
    hello: { key: "s", bootstrapToken: "t", protocolVersions: [1] },
    handlers: {
      ...handlers,
      onFrameInitialize() {
        initializeCalls++;
        return { kind: "success", result: {} };
      },
    },
  });
  assert.equal(connected.kind, "connected");
  await main.identified;
  const blockedCall = connected.peer.frame.call({
    frameId: "f",
    activationId: "a",
    targetSubsystemKey: "x",
    input: null,
  });
  const initialize = main.frame.initialize({ frameId: "f", input: null });
  assert.deepEqual(await initialize, { kind: "success", result: {} });
  assert.equal(initializeCalls, 1);
  release();
  assert.equal((await blockedCall).kind, "success");
  await main.close();
});

test("response barrier blocks the next ordered dispatch until afterResponse completes", async () => {
  const pair = createMemoryCarrierPair();
  let release;
  const barrier = new Promise((r) => {
    release = r;
  });
  let activated = false;
  const main = createMainRuntimeControlPeer(mainOptions(pair.left));
  const connected = await connectSubsystemRuntimeControl({
    carrier: pair.right,
    scheduler,
    helloDeadlineMs: 1000,
    frameDeadlineMs: 1000,
    hello: { key: "s", bootstrapToken: "t", protocolVersions: [1] },
    handlers: {
      ...handlers,
      onFrameInitialize: () => ({
        kind: "success",
        result: {},
        afterResponse: () => barrier,
      }),
      onFrameActivate: () => {
        activated = true;
        return { kind: "success", result: {} };
      },
    },
  });
  assert.equal(connected.kind, "connected");
  await main.identified;
  assert.equal(
    (await main.frame.initialize({ frameId: "f", input: null })).kind,
    "success",
  );
  const activation = main.frame.activate({ frameId: "f", activationId: "a" });
  await new Promise((r) => setImmediate(r));
  assert.equal(activated, false);
  release();
  assert.equal((await activation).kind, "success");
  await main.close();
});

test("deadline starts before a stalled send and timeout wins exactly once", async () => {
  let fire;
  let closeResolve;
  const closed = new Promise((r) => {
    closeResolve = r;
  });
  const carrier = {
    send() {
      return new Promise(() => {});
    },
    messages() {
      return {
        async *[Symbol.asyncIterator]() {
          await closed;
        },
      };
    },
    closed,
    async close() {
      closeResolve({ kind: "closed" });
    },
  };
  const manual = {
    schedule(_ms, callback) {
      fire = callback;
      let active = true;
      return () => {
        active = false;
      };
    },
  };
  const outcomePromise = connectSubsystemRuntimeControl({
    carrier,
    scheduler: manual,
    helloDeadlineMs: 10,
    frameDeadlineMs: 1000,
    hello: { key: "s", bootstrapToken: "t", protocolVersions: [1] },
    handlers,
  });
  await new Promise((r) => setImmediate(r));
  fire();
  const outcome = await outcomePromise;
  assert.deepEqual(outcome, { kind: "timeout" });
});

test("remote request IDs are positive and strictly increasing", async () => {
  const pair = createMemoryCarrierPair();
  const incoming = pair.right.messages()[Symbol.asyncIterator]();
  const main = createMainRuntimeControlPeer(mainOptions(pair.left));
  await pair.right.send(
    JSON.stringify({
      jsonrpc: "2.0",
      method: "subsystem.hello",
      params: { key: "s", bootstrapToken: "t", protocolVersions: [1] },
      id: 1,
    }),
  );
  assert.equal(
    JSON.parse((await incoming.next()).value).result.protocolVersion,
    1,
  );
  await main.identified;
  await pair.right.send(
    JSON.stringify({
      jsonrpc: "2.0",
      method: "frame.call",
      params: {
        frameId: "f",
        activationId: "a",
        targetSubsystemKey: "x",
        input: null,
      },
      id: 1,
    }),
  );
  const diagnostic = JSON.parse((await incoming.next()).value);
  assert.equal(diagnostic.error.code, -32600);
  assert.equal((await main.terminal).kind, "protocol-fatal");
});

test("invalid correlated response remains pending until terminal cleanup settles it", async () => {
  const { pair, incoming, main } = await rawMainSession();
  const request = main.frame.initialize({ frameId: "f", input: null });
  const outbound = JSON.parse((await incoming.next()).value);
  await pair.right.send(
    JSON.stringify({
      jsonrpc: "2.0",
      id: outbound.id,
      result: { unexpected: true },
    }),
  );
  const outcome = await request;
  assert.equal(outcome.kind, "terminal");
  assert.equal(outcome.terminal.kind, "protocol-fatal");
});

test("Frame profile-state errors settle as terminal, never as FrameRpcErrorData", async () => {
  const { pair, incoming, main } = await rawMainSession();
  const request = main.frame.initialize({ frameId: "f", input: null });
  const outbound = JSON.parse((await incoming.next()).value);
  await pair.right.send(
    JSON.stringify({
      jsonrpc: "2.0",
      id: outbound.id,
      error: {
        code: -32000,
        message: "Protocol state error",
        data: { code: "PROTOCOL_STATE_ERROR" },
      },
    }),
  );
  const outcome = await request;
  assert.equal(outcome.kind, "terminal");
  assert.equal(outcome.terminal.kind, "protocol-fatal");
});

test("terminal between Response acceptance and continuation skips afterResponse", async () => {
  let closeConnection;
  let resolveNext;
  const queued = [];
  const closed = new Promise((resolve) => {
    closeConnection = resolve;
  });
  const push = (message) => {
    if (resolveNext) {
      const resolve = resolveNext;
      resolveNext = undefined;
      resolve({ done: false, value: message });
    } else queued.push(message);
  };
  const carrier = {
    closed,
    messages() {
      return {
        [Symbol.asyncIterator]() {
          return {
            next() {
              const value = queued.shift();
              if (value !== undefined)
                return Promise.resolve({ done: false, value });
              return new Promise((resolve) => {
                resolveNext = resolve;
              });
            },
          };
        },
      };
    },
    async send(text) {
      const message = JSON.parse(text);
      if (message.method === "subsystem.hello") {
        push(
          JSON.stringify({
            jsonrpc: "2.0",
            id: message.id,
            result: { protocolVersion: 1 },
          }),
        );
      } else if (message.id === 7 && "result" in message) {
        closeConnection({ kind: "lost", cause: new Error("race") });
      }
    },
    async close() {
      closeConnection({ kind: "closed" });
    },
  };
  let afterResponseCalls = 0;
  const connected = await connectSubsystemRuntimeControl({
    carrier,
    scheduler,
    helloDeadlineMs: 1000,
    frameDeadlineMs: 1000,
    hello: { key: "s", bootstrapToken: "t", protocolVersions: [1] },
    handlers: {
      ...handlers,
      onFrameInitialize: () => ({
        kind: "success",
        result: {},
        afterResponse() {
          afterResponseCalls += 1;
        },
      }),
    },
  });
  assert.equal(connected.kind, "connected");
  push(
    JSON.stringify({
      jsonrpc: "2.0",
      method: "frame.initialize",
      params: { frameId: "f", input: null },
      id: 7,
    }),
  );
  assert.equal((await connected.peer.terminal).kind, "carrier-lost");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(afterResponseCalls, 0);
});

test("main shutdown intent rejects inbound Frame before stopping status", async () => {
  const { pair, incoming, main } = await rawMainSession();
  const shutdown = main.control.shutdown({ reason: "session-end" });
  await incoming.next();
  await pair.right.send(
    JSON.stringify({
      jsonrpc: "2.0",
      method: "frame.call",
      params: {
        frameId: "f",
        activationId: "a",
        targetSubsystemKey: "target",
        input: null,
      },
      id: 2,
    }),
  );
  const response = JSON.parse((await incoming.next()).value);
  assert.equal(response.id, 2);
  assert.equal(response.error.code, -32000);
  assert.deepEqual(response.error.data, { code: "PROTOCOL_STATE_ERROR" });
  assert.equal((await shutdown).kind, "terminal");
  assert.equal((await main.terminal).kind, "protocol-fatal");
});
