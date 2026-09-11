import type { MessageCarrier } from "@loomrealm/foundation";
import type { RendererDataBinding } from "@loomrealm/platform-ports";
import { connectBrowserDataCarrier } from "./browser-websocket-carrier.js";
import type { DataBufferPolicy } from "./data-websocket.js";

const BROWSER_DATA_BUFFER_POLICY: DataBufferPolicy = Object.freeze({ maxMessages: 64, maxBytes: 1_048_576 });

interface Tuple { readonly subsystemKey: string; readonly generation: number; readonly dataProfile: string }
interface PortLike {
  postMessage(message: unknown): void; start(): void; close(): void;
  on?: (name: "message" | "close", listener: (event?: unknown) => void) => unknown;
  off?: (name: "message" | "close", listener: (event?: unknown) => void) => unknown;
  addEventListener?: (name: "message" | "close", listener: (event: Event) => void) => void;
  removeEventListener?: (name: "message" | "close", listener: (event: Event) => void) => void;
}

function listen(port: PortLike, name: "message" | "close", listener: (event?: unknown) => void): () => void {
  if (typeof port.on === "function") { port.on(name, listener); return () => { port.off?.(name, listener); }; }
  if (typeof port.addEventListener === "function") {
    const dom = listener as unknown as (event: Event) => void;
    port.addEventListener(name, dom); return () => port.removeEventListener?.(name, dom);
  }
  throw new TypeError("Invalid Window Data port");
}

function sameTuple(left: Tuple, right: Tuple): boolean {
  return left.subsystemKey === right.subsystemKey && left.generation === right.generation && left.dataProfile === right.dataProfile;
}

interface Prepared extends Tuple { readonly candidateId: string; readonly carrier: MessageCarrier }
interface Slot { prepared: Prepared | null; current: (Prepared & { delivered: boolean }) | null; waiter: { tuple: Tuple; signal: AbortSignal; resolve(value: MessageCarrier): void; reject(cause: unknown): void; detach(): void } | null }

export function createWindowRendererDataBinding(
  port: PortLike,
  NativeWebSocket: typeof WebSocket,
  policy: DataBufferPolicy = BROWSER_DATA_BUFFER_POLICY,
): RendererDataBinding {
  const slots = new Map<string, Slot>();
  const preparing = new Map<string, AbortController>();
  let closed = false;
  const slot = (key: string) => { let value = slots.get(key); if (!value) { value = { prepared: null, current: null, waiter: null }; slots.set(key, value); } return value; };
  const revoke = (candidateId: string) => {
    preparing.get(candidateId)?.abort(new Error("Window Data candidate revoked"));
    preparing.delete(candidateId);
    for (const value of slots.values()) {
      if (value.prepared?.candidateId === candidateId) { void value.prepared.carrier.close(); value.prepared = null; }
      if (value.current?.candidateId === candidateId) { void value.current.carrier.close(); value.current = null; }
    }
  };
  const close = () => {
    if (closed) return; closed = true;
    for (const controller of preparing.values()) controller.abort(new Error("Window Renderer Data binding closed"));
    preparing.clear();
    for (const value of slots.values()) {
      if (value.prepared) void value.prepared.carrier.close();
      if (value.current) void value.current.carrier.close();
      value.waiter?.detach(); value.waiter?.reject(new Error("Window Renderer Data binding closed"));
    }
    slots.clear(); try { port.close(); } catch {}
  };
  listen(port, "close", close);
  listen(port, "message", (event) => {
    const message = event !== null && typeof event === "object" && "data" in event ? (event as { data: unknown }).data : event;
    if (message === null || typeof message !== "object") return;
    const value = message as Record<string, unknown>;
    if (value.type === "close") return close();
    if (typeof value.candidateId !== "string") return;
    if (value.type === "revoke") return revoke(value.candidateId);
    if (typeof value.subsystemKey !== "string" || !Number.isSafeInteger(value.generation) || typeof value.dataProfile !== "string") return;
    const tuple: Tuple = { subsystemKey: value.subsystemKey, generation: value.generation as number, dataProfile: value.dataProfile };
    const currentSlot = slot(tuple.subsystemKey);
    if (value.type === "prepare") {
      if (typeof value.endpoint !== "string" || currentSlot.prepared !== null || preparing.has(value.candidateId) || closed) { port.postMessage({ type: "prepared", candidateId: value.candidateId, ok: false }); return; }
      const controller = new AbortController();
      preparing.set(value.candidateId, controller);
      void connectBrowserDataCarrier(value.endpoint, controller.signal, policy, NativeWebSocket).then((carrier) => {
        preparing.delete(value.candidateId as string);
        if (closed || controller.signal.aborted || currentSlot.prepared !== null) { void carrier.close(); if (!closed && !controller.signal.aborted) port.postMessage({ type: "prepared", candidateId: value.candidateId, ok: false }); return; }
        const prepared: Prepared = Object.freeze({ candidateId: value.candidateId as string, carrier, ...tuple });
        currentSlot.prepared = prepared;
        void carrier.closed.then(() => { if (currentSlot.prepared === prepared) currentSlot.prepared = null; if (currentSlot.current?.candidateId === prepared.candidateId) currentSlot.current = null; });
        port.postMessage({ type: "prepared", candidateId: value.candidateId, ok: true });
      }, () => { preparing.delete(value.candidateId as string); if (!closed && !controller.signal.aborted) port.postMessage({ type: "prepared", candidateId: value.candidateId, ok: false }); });
      return;
    }
    if (value.type === "commit") {
      const prepared = currentSlot.prepared;
      if (!prepared || prepared.candidateId !== value.candidateId || !sameTuple(prepared, tuple)) return;
      currentSlot.prepared = null;
      const current = { ...prepared, delivered: false }; currentSlot.current = current;
      const waiter = currentSlot.waiter;
      if (waiter && sameTuple(waiter.tuple, tuple) && !waiter.signal.aborted) { currentSlot.waiter = null; waiter.detach(); current.delivered = true; waiter.resolve(current.carrier); }
    }
  });
  port.start();
  return Object.freeze({
    acquire(subsystemKey: string, generation: number, dataProfile: string, signal: AbortSignal): Promise<MessageCarrier> {
      if (signal.aborted) return Promise.reject(signal.reason);
      if (closed) return Promise.reject(new Error("Window Renderer Data binding closed"));
      const tuple = { subsystemKey, generation, dataProfile }; const currentSlot = slot(subsystemKey);
      if (currentSlot.waiter) return Promise.reject(new Error("Window Renderer Data acquire already pending"));
      if (currentSlot.current && !currentSlot.current.delivered && sameTuple(currentSlot.current, tuple)) { currentSlot.current.delivered = true; return Promise.resolve(currentSlot.current.carrier); }
      return new Promise((resolve, reject) => {
        const onAbort = () => { if (currentSlot.waiter?.resolve !== resolve) return; currentSlot.waiter = null; reject(signal.reason); };
        signal.addEventListener("abort", onAbort, { once: true });
        currentSlot.waiter = { tuple, signal, resolve, reject, detach: () => signal.removeEventListener("abort", onAbort) };
      });
    },
  });
}

export async function connectLoopbackRendererDataBinding(
  endpoint: string,
  NativeWebSocket: typeof WebSocket,
): Promise<RendererDataBinding> {
  const socket = new NativeWebSocket(endpoint);
  await new Promise<void>((resolve, reject) => {
    const opened = () => { socket.removeEventListener("error", failed); resolve(); };
    const failed = () => { socket.removeEventListener("open", opened); reject(new Error("Renderer Data settlement connection failed")); };
    socket.addEventListener("open", opened, { once: true });
    socket.addEventListener("error", failed, { once: true });
  });
  const messageListeners = new Map<(event?: unknown) => void, (event: MessageEvent<unknown>) => void>();
  const closeListeners = new Map<(event?: unknown) => void, (event: CloseEvent) => void>();
  const port: PortLike = {
    postMessage(message) { socket.send(JSON.stringify(message)); },
    start() {},
    close() { socket.close(1000); },
    on(name, listener) {
      if (name === "message") {
        const wrapped = (event: MessageEvent<unknown>) => {
          if (typeof event.data !== "string") return listener({ data: null });
          try { listener({ data: JSON.parse(event.data) }); } catch { listener({ data: null }); }
        };
        messageListeners.set(listener, wrapped); socket.addEventListener("message", wrapped);
      } else {
        const wrapped = (event: CloseEvent) => listener(event);
        closeListeners.set(listener, wrapped); socket.addEventListener("close", wrapped);
      }
    },
    off(name, listener) {
      if (name === "message") {
        const wrapped = messageListeners.get(listener); if (wrapped) socket.removeEventListener("message", wrapped);
        messageListeners.delete(listener);
      } else {
        const wrapped = closeListeners.get(listener); if (wrapped) socket.removeEventListener("close", wrapped);
        closeListeners.delete(listener);
      }
    },
  };
  return createWindowRendererDataBinding(port, NativeWebSocket);
}
