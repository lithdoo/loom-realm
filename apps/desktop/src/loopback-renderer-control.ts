import { randomBytes } from "node:crypto";
import type { AddressInfo } from "node:net";
import type { MessageCarrier } from "@loomrealm/foundation";
import type { RendererControlBinding } from "@loomrealm/platform-ports";
import WebSocket, { WebSocketServer } from "ws";
import { DEFAULT_DATA_BUFFER_POLICY } from "./data-websocket.js";
import { createRendererControlWebSocketCarrier } from "./renderer-control-websocket.js";

interface AcquireWaiter {
  readonly token: string;
  readonly signal: AbortSignal;
  readonly resolve: (carrier: MessageCarrier) => void;
  readonly reject: (cause: unknown) => void;
  detach(): void;
}

interface DocumentWaiter {
  readonly signal: AbortSignal;
  readonly resolve: (candidate: LoopbackRendererDocument) => void;
  readonly reject: (cause: unknown) => void;
  detach(): void;
}

interface ControlEndpoint {
  readonly href: string;
  close(cause: unknown): void;
}

export interface LoopbackRendererDocument {
  readonly rendererControlToken: string;
  readonly controlEndpoint: string;
  readonly rendererIdentity: string;
  retire(cause?: unknown): void;
}

function listen(server: WebSocketServer): Promise<void> {
  return new Promise((resolve, reject) => {
    const onListening = () => { server.off("error", onError); resolve(); };
    const onError = (cause: unknown) => { server.off("listening", onListening); reject(cause); };
    server.once("listening", onListening);
    server.once("error", onError);
  });
}

async function createControlEndpoint(waiter: AcquireWaiter): Promise<ControlEndpoint> {
  const path = `/_lr/control/${randomBytes(32).toString("base64url")}`;
  let claimed = false;
  let delivered = false;
  let socket: WebSocket | null = null;
  let terminal = false;
  const server = new WebSocketServer({
    host: "127.0.0.1",
    port: 0,
    path,
    verifyClient: ({ req }, done) => {
      if (terminal || claimed || req.url !== path) { done(false, 404); return; }
      claimed = true;
      done(true);
    },
  });
  await listen(server);
  server.once("connection", (connected) => {
    if (terminal || waiter.signal.aborted) { connected.close(1008); return; }
    socket = connected;
    delivered = true;
    waiter.detach();
    waiter.resolve(createRendererControlWebSocketCarrier(connected, DEFAULT_DATA_BUFFER_POLICY));
    server.close();
  });
  const address = server.address() as AddressInfo;
  return {
    href: `ws://127.0.0.1:${address.port}${path}`,
    close(cause) {
      if (terminal) return;
      terminal = true;
      waiter.detach();
      if (!delivered) waiter.reject(cause);
      try { server.close(); } catch {}
      try { socket?.close(1000); } catch {}
    },
  };
}

export class LoopbackRendererControlBinding {
  readonly binding: RendererControlBinding;
  private pendingAcquire: AcquireWaiter | null = null;
  private pendingDocument: DocumentWaiter | null = null;
  private currentDocument: LoopbackRendererDocument | null = null;
  private pairing = false;
  private closed = false;

  constructor() {
    this.binding = Object.freeze({ acquire: (token: string, signal: AbortSignal) => this.acquire(token, signal) });
  }

  private acquire(token: string, signal: AbortSignal): Promise<MessageCarrier> {
    if (typeof token !== "string" || token.length === 0) return Promise.reject(new TypeError("Invalid Renderer Control token"));
    if (signal.aborted) return Promise.reject(signal.reason);
    if (this.closed) return Promise.reject(new Error("Renderer Control binding closed"));
    if (this.pendingAcquire !== null || this.pairing) return Promise.reject(new Error("Renderer Control acquire already pending"));
    return new Promise((resolve, reject) => {
      const onAbort = () => {
        if (this.pendingAcquire?.resolve !== resolve) return;
        this.pendingAcquire = null;
        reject(signal.reason);
      };
      signal.addEventListener("abort", onAbort, { once: true });
      this.pendingAcquire = { token, signal, resolve, reject, detach: () => signal.removeEventListener("abort", onAbort) };
      this.tryPair();
    });
  }

  beginDocument(signal: AbortSignal): Promise<LoopbackRendererDocument> {
    if (signal.aborted) return Promise.reject(signal.reason);
    if (this.closed) return Promise.reject(new Error("Renderer Control binding closed"));
    this.currentDocument?.retire(new Error("Renderer document superseded"));
    this.currentDocument = null;
    if (this.pendingDocument !== null) {
      const stale = this.pendingDocument;
      this.pendingDocument = null;
      stale.detach();
      stale.reject(new Error("Renderer document superseded"));
    }
    return new Promise((resolve, reject) => {
      const onAbort = () => {
        if (this.pendingDocument?.resolve !== resolve) return;
        this.pendingDocument = null;
        reject(signal.reason);
      };
      signal.addEventListener("abort", onAbort, { once: true });
      this.pendingDocument = { signal, resolve, reject, detach: () => signal.removeEventListener("abort", onAbort) };
      this.tryPair();
    });
  }

  private tryPair(): void {
    if (this.closed || this.pairing || this.pendingAcquire === null || this.pendingDocument === null) return;
    const acquire = this.pendingAcquire;
    const document = this.pendingDocument;
    this.pendingAcquire = null;
    this.pendingDocument = null;
    document.detach();
    this.pairing = true;
    void createControlEndpoint(acquire).then((endpoint) => {
      this.pairing = false;
      if (this.closed || acquire.signal.aborted || document.signal.aborted) {
        endpoint.close(acquire.signal.reason ?? document.signal.reason ?? new Error("Renderer document cancelled"));
        document.reject(document.signal.reason ?? new Error("Renderer document cancelled"));
        return;
      }
      let retired = false;
      const onAbort = () => candidate.retire(document.signal.reason);
      const candidate: LoopbackRendererDocument = Object.freeze({
        rendererControlToken: acquire.token,
        controlEndpoint: endpoint.href,
        rendererIdentity: randomBytes(32).toString("base64url"),
        retire: (cause: unknown = new Error("Renderer document retired")) => {
          if (retired) return;
          retired = true;
          document.signal.removeEventListener("abort", onAbort);
          endpoint.close(cause);
          if (this.currentDocument === candidate) this.currentDocument = null;
        },
      });
      document.signal.addEventListener("abort", onAbort, { once: true });
      this.currentDocument = candidate;
      document.resolve(candidate);
      this.tryPair();
    }, (cause) => {
      this.pairing = false;
      acquire.detach();
      acquire.reject(cause);
      document.reject(cause);
      this.tryPair();
    });
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    const failure = new Error("Renderer Control binding closed");
    this.pendingAcquire?.detach(); this.pendingAcquire?.reject(failure); this.pendingAcquire = null;
    this.pendingDocument?.detach(); this.pendingDocument?.reject(failure); this.pendingDocument = null;
    this.currentDocument?.retire(failure); this.currentDocument = null;
  }
}
