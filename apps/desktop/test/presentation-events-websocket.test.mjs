import assert from "node:assert/strict";
import test from "node:test";
import WebSocket from "ws";
import { createRendererPresentationEventBinding } from "@loomrealm/renderer";
import { connectBrowserControlCarrier } from "../dist/browser-control-carrier.js";
import { createDesktopPresentationEventEndpoint } from "../dist/presentation-events-websocket.js";

const publication = {
  sessionId: "session",
  ownerSubsystemKey: "owner",
  generation: 1,
  domainId: "domain",
  targetKey: "node",
  channel: "keyboard.state",
  type: "input.state",
  broadcast: true,
  payload: { domainId: "domain", targetKey: "node", data: { down: ["KeyW"] } },
};

test("Desktop dedicated Presentation Events endpoint is one-shot and request-correlated", async () => {
  const seen = [];
  const endpoint = await createDesktopPresentationEventEndpoint(async (event) => {
    seen.push(event);
    return event.generation === 1;
  });
  const controller = new AbortController();
  const carrier = await connectBrowserControlCarrier(endpoint.endpoint, controller.signal, WebSocket);
  const binding = createRendererPresentationEventBinding(carrier);
  await binding.publish(publication);
  await assert.rejects(binding.publish({ ...publication, generation: 2 }), /rejected/);
  assert.deepEqual(seen.map(({ generation }) => generation), [1, 2]);
  controller.abort();
  await endpoint.close();
});
