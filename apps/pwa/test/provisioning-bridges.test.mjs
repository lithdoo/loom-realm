import assert from "node:assert/strict";
import test from "node:test";
import { RunnerDataProvisioner, RunnerSessionEventProvisioner } from "../dist/types/runtime-hosting.js";
import { RunnerSessionEventsBinding } from "../dist/types/runner-session-events.js";
import { SessionWindowBridge } from "../dist/types/window-bridge.js";
import {
  createSessionEventHub,
  createSessionEventMessagePortCarrier,
  serveSessionEventCarrier,
} from "@loomrealm/session-events";

function windowRevoke(requestId, connectionId) {
  return Object.freeze({
    formatVersion: 1,
    type: "renderer-data/revoke",
    requestId,
    sessionEpoch: "epoch-1",
    subsystemKey: "demo",
    generation: 1,
    dataProfile: "data-v1",
    connectionId,
  });
}

test("Window bridge ignores a timed-out late result and remains usable", async () => {
  const channel = new MessageChannel();
  const bridge = new SessionWindowBridge(channel.port1, "epoch-1", 5);
  let first;
  channel.port2.addEventListener("message", (event) => {
    if (first === undefined) { first = event.data; return; }
    channel.port2.postMessage(Object.freeze({ formatVersion: 1, type: "install/result", requestId: event.data.requestId, sessionEpoch: "epoch-1", ok: true }));
  });
  channel.port2.start();
  await assert.rejects(bridge.request(windowRevoke("request-1", "connection-1")), /timed out/);
  channel.port2.postMessage(Object.freeze({ formatVersion: 1, type: "install/result", requestId: first.requestId, sessionEpoch: "epoch-1", ok: true }));
  await bridge.request(windowRevoke("request-2", "connection-2"));
  bridge.close();
  channel.port2.close();
});

test("Window bridge cancellation fences a late result without closing the bridge", async () => {
  const channel = new MessageChannel();
  const bridge = new SessionWindowBridge(channel.port1, "epoch-1", 1_000);
  const received = [];
  channel.port2.addEventListener("message", (event) => received.push(event.data));
  channel.port2.start();
  const controller = new AbortController();
  const cancelled = bridge.request(windowRevoke("request-cancelled", "connection-cancelled"), [], controller.signal);
  while (received.length === 0) await new Promise((resolve) => setTimeout(resolve, 0));
  controller.abort(new Error("superseded"));
  await assert.rejects(cancelled, /superseded/);
  channel.port2.postMessage(Object.freeze({ formatVersion: 1, type: "install/result", requestId: received[0].requestId, sessionEpoch: "epoch-1", ok: true }));
  const next = bridge.request(windowRevoke("request-current", "connection-current"));
  while (received.length < 2) await new Promise((resolve) => setTimeout(resolve, 0));
  channel.port2.postMessage(Object.freeze({ formatVersion: 1, type: "install/result", requestId: received[1].requestId, sessionEpoch: "epoch-1", ok: true }));
  await next;
  bridge.close();
  channel.port2.close();
});

test("Runner provisioner rejects timeout, ignores its late ack, and correlates the next request", async () => {
  const channel = new MessageChannel();
  const provisioner = new RunnerDataProvisioner(channel.port1, "demo", 5);
  let first;
  channel.port2.addEventListener("message", (event) => {
    if (first === undefined) { first = event.data; return; }
    channel.port2.postMessage(Object.freeze({ formatVersion: 1, type: "data/result", requestId: event.data.requestId, subsystemKey: "demo", connectionId: event.data.connectionId, ok: true }));
  });
  channel.port2.start();
  const request = (requestId, connectionId) => Object.freeze({ formatVersion: 1, type: "data/revoke", requestId, subsystemKey: "demo", generation: 1, dataProfile: "data-v1", connectionId });
  await assert.rejects(provisioner.revoke(request("request-1", "connection-1")), /timed out/);
  channel.port2.postMessage(Object.freeze({ formatVersion: 1, type: "data/result", requestId: first.requestId, subsystemKey: "demo", connectionId: first.connectionId, ok: true }));
  await provisioner.revoke(request("request-2", "connection-2"));
  provisioner.close();
  channel.port2.close();
});

test("Runner provisioner cancellation fences a late ack and permits rollback", async () => {
  const channel = new MessageChannel();
  const provisioner = new RunnerDataProvisioner(channel.port1, "demo", 1_000);
  const received = [];
  channel.port2.addEventListener("message", (event) => received.push(event.data));
  channel.port2.start();
  const request = (requestId, connectionId) => Object.freeze({ formatVersion: 1, type: "data/revoke", requestId, subsystemKey: "demo", generation: 1, dataProfile: "data-v1", connectionId });
  const controller = new AbortController();
  const cancelled = provisioner.revoke(request("request-cancelled", "connection-cancelled"), controller.signal);
  while (received.length === 0) await new Promise((resolve) => setTimeout(resolve, 0));
  controller.abort(new Error("superseded"));
  await assert.rejects(cancelled, /superseded/);
  channel.port2.postMessage(Object.freeze({ formatVersion: 1, type: "data/result", requestId: received[0].requestId, subsystemKey: "demo", connectionId: received[0].connectionId, ok: true }));
  const next = provisioner.revoke(request("request-current", "connection-current"));
  while (received.length < 2) await new Promise((resolve) => setTimeout(resolve, 0));
  channel.port2.postMessage(Object.freeze({ formatVersion: 1, type: "data/result", requestId: received[1].requestId, subsystemKey: "demo", connectionId: received[1].connectionId, ok: true }));
  await next;
  provisioner.close();
  channel.port2.close();
});

function eventInstall(generation, suffix = String(generation), subsystemKey = "demo") {
  return Object.freeze({
    formatVersion: 1,
    type: "session-events/install",
    requestId: `se1:${generation}:request-${suffix}`,
    subsystemKey,
    bindingId: `se1:${generation}:binding-${suffix}`,
  });
}

function eventResult(request, overrides = {}) {
  return Object.freeze({
    formatVersion: 1,
    type: "session-events/result",
    requestId: request.requestId,
    subsystemKey: request.subsystemKey,
    bindingId: request.bindingId,
    ok: true,
    ...overrides,
  });
}

async function nextMessage(messages, count) {
  while (messages.length < count) await new Promise((resolve) => setTimeout(resolve, 0));
  return messages[count - 1];
}

test("Session Events provisioner requires an exact ack and permits a fresh retired binding", async () => {
  const channel = new MessageChannel();
  const provisioner = new RunnerSessionEventProvisioner(channel.port1, "demo", 1_000);
  const messages = [];
  channel.port2.addEventListener("message", (event) => messages.push(event.data));
  channel.port2.start();

  const firstPort = new MessageChannel();
  const first = eventInstall(1);
  const installed = provisioner.install(first, firstPort.port1);
  const receivedFirst = await nextMessage(messages, 1);
  channel.port2.postMessage(eventResult(receivedFirst));
  await installed;

  const blockedPort = new MessageChannel();
  await assert.rejects(
    provisioner.install(eventInstall(2), blockedPort.port1),
    /Invalid Session Events provisioning request/,
  );

  provisioner.retire(first.bindingId);
  const replacementPort = new MessageChannel();
  const replacement = eventInstall(3);
  const replaced = provisioner.install(replacement, replacementPort.port1);
  const receivedReplacement = await nextMessage(messages, 2);
  channel.port2.postMessage(eventResult(receivedReplacement));
  await replaced;

  provisioner.close();
  channel.port2.close();
  firstPort.port2.close();
  blockedPort.port2.close();
  replacementPort.port2.close();
});

test("Session Events provisioner fences wrong and late results plus reused identities", async () => {
  const channel = new MessageChannel();
  const provisioner = new RunnerSessionEventProvisioner(channel.port1, "demo", 1_000);
  const messages = [];
  channel.port2.addEventListener("message", (event) => messages.push(event.data));
  channel.port2.start();

  const firstPort = new MessageChannel();
  const first = eventInstall(1, "stale");
  const pending = provisioner.install(first, firstPort.port1);
  const received = await nextMessage(messages, 1);
  channel.port2.postMessage(eventResult(received, { bindingId: "wrong-binding" }));
  await assert.rejects(pending, /Invalid Session Events result/);

  channel.port2.postMessage(eventResult(received));
  const reusedRequestPort = new MessageChannel();
  await assert.rejects(
    provisioner.install(Object.freeze({ ...eventInstall(1, "fresh-binding"), requestId: first.requestId }), reusedRequestPort.port1),
    /Invalid Session Events provisioning request/,
  );
  const reusedBindingPort = new MessageChannel();
  await assert.rejects(
    provisioner.install(Object.freeze({ ...eventInstall(1, "fresh-request"), bindingId: first.bindingId }), reusedBindingPort.port1),
    /Invalid Session Events provisioning request/,
  );
  const wrongSubsystemPort = new MessageChannel();
  await assert.rejects(
    provisioner.install(eventInstall(2, "wrong", "other"), wrongSubsystemPort.port1),
    /Invalid Session Events provisioning request/,
  );

  provisioner.close();
  channel.port2.close();
  firstPort.port2.close();
  reusedRequestPort.port2.close();
  reusedBindingPort.port2.close();
  wrongSubsystemPort.port2.close();
});

test("Session Events provisioner abort and close settle pending installs without accepting late acks", async () => {
  const channel = new MessageChannel();
  const provisioner = new RunnerSessionEventProvisioner(channel.port1, "demo", 1_000);
  const messages = [];
  channel.port2.addEventListener("message", (event) => messages.push(event.data));
  channel.port2.start();

  const controller = new AbortController();
  const abortedPort = new MessageChannel();
  const request = eventInstall(1, "abort");
  const pending = provisioner.install(request, abortedPort.port1, controller.signal);
  const received = await nextMessage(messages, 1);
  controller.abort(new Error("superseded"));
  await assert.rejects(pending, /superseded/);
  channel.port2.postMessage(eventResult(received));

  const closePort = new MessageChannel();
  const closing = provisioner.install(eventInstall(2, "close"), closePort.port1);
  await nextMessage(messages, 2);
  provisioner.close();
  await assert.rejects(closing, /provisioning closed/);

  channel.port2.close();
  abortedPort.port2.close();
  closePort.port2.close();
});

test("production PWA Runner controller replaces a dedicated Event port on the same logical client", async () => {
  const provisioning = new MessageChannel();
  const host = new RunnerSessionEventProvisioner(provisioning.port1, "demo", 1_000);
  const runner = new RunnerSessionEventsBinding(provisioning.port2, "demo");
  const hub = createSessionEventHub();

  const install = async (generation, suffix) => {
    const events = new MessageChannel();
    const served = serveSessionEventCarrier(
      hub.createBinding("demo"),
      createSessionEventMessagePortCarrier(events.port1),
    );
    const request = eventInstall(generation, suffix);
    await host.install(request, events.port2);
    return { served, request };
  };

  const first = await install(1, "a");
  await runner.initial;
  const seen = [];
  const old = await runner.client.subscribe(["replacement"], (event) => seen.push(event.type));
  await runner.client.publish("replacement", "before-loss", null);
  await nextMessage(seen, 1);

  await first.served.close();
  assert.deepEqual(await old.closed, { reason: "binding-terminal" });
  await assert.rejects(
    runner.client.publish("replacement", "known-not-accepted", null),
    { code: "BINDING_UNAVAILABLE" },
  );
  host.retire(first.request.bindingId);

  const second = await install(2, "b");
  await runner.client.publish("replacement", "no-replay-without-fresh-subscription", null);
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.deepEqual(seen, ["before-loss"]);
  const fresh = await runner.client.subscribe(["replacement"], (event) => seen.push(event.type));
  await runner.client.publish("replacement", "after-replacement", null);
  await nextMessage(seen, 2);
  assert.deepEqual(seen, ["before-loss", "after-replacement"]);

  fresh.close();
  await runner.close();
  host.close();
  await second.served.close();
  hub.terminate();
});

test("Session Events PWA currentness remains bounded across 1000+ replacements and fences generation one", async () => {
  const provisioning = new MessageChannel();
  const host = new RunnerSessionEventProvisioner(provisioning.port1, "demo", 1_000);
  const runner = new RunnerSessionEventsBinding(provisioning.port2, "demo");
  const hub = createSessionEventHub();
  let current = null;
  let firstRequest = null;

  for (let generation = 1; generation <= 1001; generation += 1) {
    const events = new MessageChannel();
    const served = serveSessionEventCarrier(
      hub.createBinding("demo"),
      createSessionEventMessagePortCarrier(events.port1),
    );
    const request = eventInstall(generation, `cycle-${generation}`);
    await host.install(request, events.port2);
    firstRequest ??= request;
    if (generation < 1001) {
      await served.close();
      host.retire(request.bindingId);
      while (runner.client.isBound) await new Promise((resolve) => setTimeout(resolve, 0));
    } else {
      current = { served, request };
    }
  }

  const stalePort = new MessageChannel();
  const staleResult = new Promise((resolve) => {
    const listener = (event) => {
      if (event.data?.requestId !== firstRequest.requestId) return;
      provisioning.port1.removeEventListener("message", listener);
      resolve(event.data);
    };
    provisioning.port1.addEventListener("message", listener);
  });
  provisioning.port1.postMessage(Object.freeze({ ...firstRequest, port: stalePort.port1 }), [stalePort.port1]);
  assert.equal((await staleResult).ok, false);
  await runner.client.publish("x", "fresh-still-current", null);

  await runner.close();
  host.close();
  await current.served.close();
  stalePort.port2.close();
  hub.terminate();
});
