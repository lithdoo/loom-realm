import { EventEmitter } from "node:events";
import test from "node:test";
import assert from "node:assert/strict";
import WebSocket, { WebSocketServer } from "ws";
import { createHostraRuntimeDataProvisioner } from "../dist/data-provisioning.js";
import { createRunnerDataProvisioning } from "../dist/runner/data-provisioning.js";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

async function waitFor(predicate, message) {
  const deadline = Date.now() + 3000;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error(`Timed out waiting for ${message}`);
    await new Promise((resolve) => setImmediate(resolve));
  }
}

class BackpressuredChild extends EventEmitter {
  connected = true;
  sent = [];

  send(message, callback) {
    this.sent.push(message);
    queueMicrotask(() => callback?.(null));
    return false;
  }
}

class CallbackFailingChild extends EventEmitter {
  connected = true;
  sent = [];

  send(message, callback) {
    this.sent.push(message);
    queueMicrotask(() => callback?.(new Error("injected IPC send failure")));
    return true;
  }
}

class FakeRunnerIpc extends EventEmitter {
  sent = [];

  send(message) {
    this.sent.push(message);
    return true;
  }
}

test("host treats child.send false as flow control and waits for the IPC callback/message outcome", async () => {
  const child = new BackpressuredChild();
  const provisioner = createHostraRuntimeDataProvisioner(child);
  const request = {
    candidateId: "candidate-a",
    endpoint: `ws://127.0.0.1:12345/${"a".repeat(43)}`,
    generation: 1,
    dataProfile: "loomrealm.renderer-data/1",
  };

  const preparing = provisioner.prepare(request, new AbortController().signal);
  assert.equal(child.sent[0].type, "provision");
  child.emit("message", { type: "prepared", candidateId: request.candidateId });
  await preparing;

  const committing = provisioner.commit(request.candidateId, new AbortController().signal);
  assert.equal(child.sent[1].type, "commit");
  child.emit("message", { type: "committed", candidateId: request.candidateId });
  await committing;
});

test("host treats child.send callback error as authoritative IPC terminal failure", async () => {
  const child = new CallbackFailingChild();
  const provisioner = createHostraRuntimeDataProvisioner(child);
  const request = {
    candidateId: "candidate-a",
    endpoint: `ws://127.0.0.1:12345/${"a".repeat(43)}`,
    generation: 1,
    dataProfile: "loomrealm.renderer-data/1",
  };

  await assert.rejects(
    provisioner.prepare(request, new AbortController().signal),
    /unavailable/,
  );
  assert.equal(child.sent.length, 1);
  assert.equal(child.sent[0].type, "provision");
  await assert.rejects(
    provisioner.prepare(
      { ...request, candidateId: "candidate-b" },
      new AbortController().signal,
    ),
    /unavailable/,
  );
  assert.equal(child.sent.length, 1, "terminal provisioner never sends new Data work");
});

test("runner IPC disconnect rejects a pending Data acquire without terminating Runtime Control", async () => {
  const ipc = new FakeRunnerIpc();
  const provisioning = createRunnerDataProvisioning(ipc);
  assert.notEqual(provisioning, null);
  const acquiring = provisioning.binding.acquire(new AbortController().signal);
  ipc.emit("disconnect");
  await assert.rejects(acquiring, /terminal/);
  await assert.rejects(
    provisioning.binding.acquire(new AbortController().signal),
    /terminal/,
  );
});

test("runner IPC disconnect closes committed-undelivered Data material", async (t) => {
  const path = `/${"b".repeat(43)}`;
  const server = new WebSocketServer({ host: "127.0.0.1", port: 0, path });
  t.after(() => new Promise((resolve) => server.close(() => resolve())));
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const connection = deferred();
  server.once("connection", connection.resolve);
  const address = server.address();
  assert.equal(typeof address, "object");

  const ipc = new FakeRunnerIpc();
  const provisioning = createRunnerDataProvisioning(ipc);
  ipc.emit("message", {
    type: "provision",
    candidateId: "candidate-a",
    endpoint: `ws://127.0.0.1:${address.port}${path}`,
    generation: 1,
    dataProfile: "loomrealm.renderer-data/1",
  });
  const socket = await connection.promise;
  await waitFor(() => ipc.sent.some(({ type }) => type === "prepared"), "prepared ACK");
  ipc.emit("message", { type: "commit", candidateId: "candidate-a" });
  await waitFor(() => ipc.sent.some(({ type }) => type === "committed"), "commit ACK");

  const closed = new Promise((resolve) => socket.once("close", resolve));
  ipc.emit("disconnect");
  await closed;
  assert.notEqual(socket.readyState, WebSocket.OPEN);
  await assert.rejects(
    provisioning.binding.acquire(new AbortController().signal),
    /terminal/,
  );
});
