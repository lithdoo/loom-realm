import assert from "node:assert/strict";
import test from "node:test";
import WebSocket from "ws";
import { createDesktopHostLifecycleEndpoint } from "../dist/host-lifecycle-websocket.js";

test("trusted Desktop lifecycle endpoint accepts only exact host lifecycle messages", async () => {
  const states = [];
  const endpoint = await createDesktopHostLifecycleEndpoint((state) => states.push(state));
  const socket = new WebSocket(endpoint.endpoint);
  await new Promise((resolve, reject) => { socket.once("open", resolve); socket.once("error", reject); });
  socket.send(JSON.stringify({ formatVersion: 1, type: "host.lifecycle", state: "background" }));
  socket.send(JSON.stringify({ formatVersion: 1, type: "host.lifecycle", state: "foreground" }));
  while (states.length < 2) await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(states, ["background", "foreground"]);
  socket.close();
  await endpoint.close();
});
