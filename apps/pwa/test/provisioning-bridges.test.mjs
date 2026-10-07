import assert from "node:assert/strict";
import test from "node:test";
import { RunnerDataProvisioner } from "../dist/types/runtime-hosting.js";
import { SessionWindowBridge } from "../dist/types/window-bridge.js";

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
