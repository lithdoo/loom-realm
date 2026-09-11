import type { MessageCarrier } from "@loomrealm/foundation";
import { connectBrowserDataCarrier } from "./browser-websocket-carrier.js";

const CONTROL_BUFFER_POLICY = Object.freeze({ maxMessages: 64, maxBytes: 1_048_576 });

export function connectBrowserControlCarrier(
  endpoint: string,
  signal: AbortSignal,
  NativeWebSocket: typeof WebSocket,
): Promise<MessageCarrier> {
  return connectBrowserDataCarrier(endpoint, signal, CONTROL_BUFFER_POLICY, NativeWebSocket);
}
