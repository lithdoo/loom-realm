import { randomBytes } from "node:crypto";
import type { AddressInfo } from "node:net";
import WebSocket, { WebSocketServer } from "ws";
import type { HostLifecycleState } from "@loomrealm/session-events";

export interface DesktopHostLifecycleEndpoint {
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

export async function createDesktopHostLifecycleEndpoint(
  publish: (state: HostLifecycleState) => void | Promise<void>,
): Promise<DesktopHostLifecycleEndpoint> {
  if (typeof publish !== "function") throw new TypeError("Invalid Desktop Host lifecycle publisher");
  const path = `/_lr/host-lifecycle/${randomBytes(32).toString("base64url")}`;
  let claimed = false;
  let closed = false;
  let socket: WebSocket | null = null;
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
    connected.on("message", (raw, isBinary) => {
      if (closed || socket !== connected) return;
      if (isBinary) { connected.close(1003); return; }
      let value: unknown;
      try { value = JSON.parse(raw.toString("utf8")); } catch { connected.close(1007); return; }
      const message = value as Record<string, unknown> | null;
      if (message === null || typeof message !== "object" || Object.keys(message).length !== 3
          || message.formatVersion !== 1 || message.type !== "host.lifecycle"
          || (message.state !== "background" && message.state !== "foreground")) {
        connected.close(1008);
        return;
      }
      void Promise.resolve(publish(message.state)).catch(() => connected.close(1011));
    });
    server.close();
  });
  const address = server.address() as AddressInfo;
  return Object.freeze({
    endpoint: `ws://127.0.0.1:${address.port}${path}`,
    async close() {
      if (closed) return;
      closed = true;
      try { server.close(); } catch {}
      try { socket?.close(1000); } catch {}
    },
  });
}
