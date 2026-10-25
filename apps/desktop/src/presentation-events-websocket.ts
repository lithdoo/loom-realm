import { randomBytes } from "node:crypto";
import type { AddressInfo } from "node:net";
import {
  serveRendererPresentationEventCarrier,
  type PresentationEventCarrierServer,
  type PresentationEventPublication,
} from "@loomrealm/renderer";
import WebSocket, { WebSocketServer } from "ws";
import { DEFAULT_DATA_BUFFER_POLICY } from "./data-websocket.js";
import { createRendererControlWebSocketCarrier } from "./renderer-control-websocket.js";

export interface DesktopPresentationEventEndpoint {
  readonly endpoint: string;
  close(): Promise<void>;
}

function listen(server: WebSocketServer): Promise<void> {
  return new Promise((resolve, reject) => {
    const onListening = () => { server.off("error", onError); resolve(); };
    const onError = (cause: unknown) => { server.off("listening", onListening); reject(cause); };
    server.once("listening", onListening);
    server.once("error", onError);
  });
}

export async function createDesktopPresentationEventEndpoint(
  publish: (event: PresentationEventPublication) => boolean | Promise<boolean>,
): Promise<DesktopPresentationEventEndpoint> {
  if (typeof publish !== "function") throw new TypeError("Invalid Desktop Presentation Event publisher");
  const path = `/_lr/presentation-events/${randomBytes(32).toString("base64url")}`;
  let claimed = false;
  let closed = false;
  let socket: WebSocket | null = null;
  let carrierServer: PresentationEventCarrierServer | null = null;
  const server = new WebSocketServer({
    host: "127.0.0.1",
    port: 0,
    path,
    verifyClient: ({ req }, done) => {
      if (closed || claimed || req.url !== path) { done(false, 404); return; }
      claimed = true;
      done(true);
    },
  });
  await listen(server);
  server.once("connection", (connected) => {
    if (closed) { connected.close(1008); return; }
    socket = connected;
    carrierServer = serveRendererPresentationEventCarrier(
      createRendererControlWebSocketCarrier(connected, DEFAULT_DATA_BUFFER_POLICY),
      publish,
    );
    server.close();
  });
  const address = server.address() as AddressInfo;
  return Object.freeze({
    endpoint: `ws://127.0.0.1:${address.port}${path}`,
    async close() {
      if (closed) return;
      closed = true;
      try { server.close(); } catch {}
      try { await carrierServer?.close(); } catch {}
      try { socket?.close(1000); } catch {}
    },
  });
}
