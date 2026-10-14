import type { MessageCarrier } from "@loomrealm/foundation";
import WebSocket from "ws";
import { createWebSocketCarrier } from "./websocket-carrier.js";

const EVENTS_RECEIVE_BUFFER = Object.freeze({
  maxBufferedMessages: 128,
  maxBufferedBytes: 32 * 1024 * 1024,
});

export function createSessionEventWebSocketCarrier(socket: WebSocket): MessageCarrier {
  return createWebSocketCarrier(socket, EVENTS_RECEIVE_BUFFER);
}
