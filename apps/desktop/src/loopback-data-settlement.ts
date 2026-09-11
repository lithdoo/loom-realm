import { randomBytes } from "node:crypto";
import type { AddressInfo } from "node:net";
import WebSocket, { type RawData, WebSocketServer } from "ws";
import type { DesktopRendererCandidateBinding } from "./data-broker.js";

interface Tuple { readonly subsystemKey: string; readonly generation: number; readonly dataProfile: string }
interface Pending { resolve(): void; reject(cause: unknown): void; detach(): void }

export interface LoopbackDataSettlement extends DesktopRendererCandidateBinding {
  readonly endpoint: string;
}

export async function createLoopbackDataSettlement(): Promise<LoopbackDataSettlement> {
  const path = `/_lr/data-settlement/${randomBytes(32).toString("base64url")}`;
  let claimed = false;
  let closed = false;
  let socket: WebSocket | null = null;
  let resolveSocket!: (value: WebSocket) => void;
  let rejectSocket!: (cause: unknown) => void;
  const connected = new Promise<WebSocket>((resolve, reject) => { resolveSocket = resolve; rejectSocket = reject; });
  void connected.catch(() => {});
  const server = new WebSocketServer({
    host: "127.0.0.1",
    port: 0,
    path,
    verifyClient: ({ req }, done) => {
      if (closed || claimed || req.url !== path) { done(false, 404); return; }
      claimed = true; done(true);
    },
  });
  await new Promise<void>((resolve, reject) => {
    const listening = () => { server.off("error", failed); resolve(); };
    const failed = (cause: unknown) => { server.off("listening", listening); reject(cause); };
    server.once("listening", listening); server.once("error", failed);
  });
  const pending = new Map<string, Pending>();
  const fail = (cause: unknown) => {
    if (closed) return;
    closed = true;
    rejectSocket(cause);
    for (const value of pending.values()) { value.detach(); value.reject(cause); }
    pending.clear();
    try { server.close(); } catch {}
    try { socket?.close(1000); } catch {}
  };
  server.once("connection", (value) => {
    if (closed) { value.close(1008); return; }
    socket = value; resolveSocket(value); server.close();
    value.on("message", (raw: RawData, binary: boolean) => {
      if (binary) { fail(new TypeError("Binary Data settlement message")); return; }
      let parsed: unknown;
      try { parsed = JSON.parse(raw.toString("utf8")); } catch { return; }
      if (parsed === null || typeof parsed !== "object") return;
      const message = parsed as Record<string, unknown>;
      if (message.type !== "prepared" || typeof message.candidateId !== "string" || typeof message.ok !== "boolean") return;
      const waiter = pending.get(message.candidateId);
      if (waiter === undefined) return;
      pending.delete(message.candidateId); waiter.detach();
      if (message.ok) waiter.resolve(); else waiter.reject(new Error("Renderer Data preparation failed"));
    });
    value.once("close", () => fail(new Error("Renderer Data settlement closed")));
    value.once("error", (cause) => fail(cause));
  });
  server.once("error", (cause) => fail(cause));
  const address = server.address() as AddressInfo;
  const send = async (message: Readonly<Record<string, unknown>>) => {
    const target = socket ?? await connected;
    if (closed || target.readyState !== WebSocket.OPEN) throw new Error("Renderer Data settlement unavailable");
    await new Promise<void>((resolve, reject) => target.send(JSON.stringify(message), (error) => error == null ? resolve() : reject(error)));
  };
  return Object.freeze({
    endpoint: `ws://127.0.0.1:${address.port}${path}`,
    prepare(candidateId: string, endpoint: string, tuple: Tuple, signal: AbortSignal): Promise<void> {
      if (closed) return Promise.reject(new Error("Renderer Data settlement closed"));
      if (signal.aborted) return Promise.reject(signal.reason);
      if (pending.has(candidateId)) return Promise.reject(new Error("Renderer Data candidate already pending"));
      return new Promise((resolve, reject) => {
        const onAbort = () => {
          const value = pending.get(candidateId);
          if (value === undefined) return;
          pending.delete(candidateId); value.detach(); reject(signal.reason);
          void send({ type: "revoke", candidateId }).catch(() => {});
        };
        signal.addEventListener("abort", onAbort, { once: true });
        pending.set(candidateId, { resolve, reject, detach: () => signal.removeEventListener("abort", onAbort) });
        void send({ type: "prepare", candidateId, endpoint, ...tuple }).catch((cause) => {
          const value = pending.get(candidateId);
          if (value === undefined) return;
          pending.delete(candidateId); value.detach(); reject(cause);
        });
      });
    },
    commit(candidateId: string, tuple: Tuple): boolean {
      if (closed) return false;
      void send({ type: "commit", candidateId, ...tuple }).catch(() => fail(new Error("Renderer Data commit failed")));
      return true;
    },
    revoke(candidateId: string): void { if (!closed) void send({ type: "revoke", candidateId }).catch(() => {}); },
    close(): void {
      if (closed) return;
      if (socket?.readyState === WebSocket.OPEN) try { socket.send(JSON.stringify({ type: "close" })); } catch {}
      fail(new Error("Renderer Data settlement closed"));
    },
  });
}
