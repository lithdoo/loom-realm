import type { MessageCarrier } from "@loomrealm/foundation";
import WebSocket from "ws";
import { createWebSocketCarrier } from "./websocket-carrier.js";

const STATE_RECEIVE_BUFFER = Object.freeze({
  maxBufferedMessages: 64,
  maxBufferedBytes: 64 * 1024 * 1024,
});

/** State-plane WebSocket adapter with binding-local receive resource bounds. */
export function createRealmStateWebSocketCarrier(socket: WebSocket): MessageCarrier {
  return createWebSocketCarrier(socket, STATE_RECEIVE_BUFFER);
}
