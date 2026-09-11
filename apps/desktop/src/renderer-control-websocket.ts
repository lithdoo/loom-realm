import type { CarrierClosed, MessageCarrier } from "@loomrealm/foundation";
import WebSocket, { type RawData } from "ws";
import type { DataBufferPolicy } from "./data-websocket.js";

export function createRendererControlWebSocketCarrier(socket: WebSocket, policy: DataBufferPolicy): MessageCarrier {
  let fact: CarrierClosed | null = null;
  let resolveClosed!: (value: CarrierClosed) => void;
  const closed = new Promise<CarrierClosed>((resolve) => { resolveClosed = resolve; });
  const queue: string[] = [];
  let queuedBytes = 0;
  let waiter: ((result: IteratorResult<string>) => void) | null = null;
  let claimed = false;
  const finish = (value: CarrierClosed) => {
    if (fact !== null) return;
    fact = Object.freeze(value); queue.length = 0; queuedBytes = 0;
    waiter?.({ done: true, value: undefined }); waiter = null; resolveClosed(fact);
  };
  socket.on("message", (raw: RawData, binary: boolean) => {
    if (binary) { socket.close(1003); finish({ kind: "lost", cause: new TypeError("Binary Renderer Control message") }); return; }
    const message = raw.toString("utf8");
    if (waiter !== null) { const resolve = waiter; waiter = null; resolve({ done: false, value: message }); return; }
    const bytes = Buffer.byteLength(message);
    if (queue.length >= policy.maxMessages || queuedBytes + bytes > policy.maxBytes) {
      socket.close(1009); finish({ kind: "lost", cause: new Error("Renderer Control buffer exceeded") }); return;
    }
    queue.push(message); queuedBytes += bytes;
  });
  socket.once("close", () => finish({ kind: "closed" }));
  socket.once("error", (cause) => finish({ kind: "lost", cause }));
  return Object.freeze({
    send(message: string) {
      if (typeof message !== "string") return Promise.reject(new TypeError("Renderer Control message must be text"));
      if (fact !== null || socket.readyState !== WebSocket.OPEN) return Promise.reject(new Error("Renderer Control carrier closed"));
      if (socket.bufferedAmount + Buffer.byteLength(message) > policy.maxBytes) return Promise.reject(new Error("Renderer Control send buffer exceeded"));
      return new Promise<void>((resolve, reject) => socket.send(message, (error) => error == null ? resolve() : reject(error)));
    },
    messages() {
      if (claimed) throw new TypeError("Renderer Control message stream is single-use");
      claimed = true;
      return { [Symbol.asyncIterator]() { return { next(): Promise<IteratorResult<string>> {
        const message = queue.shift();
        if (message !== undefined) { queuedBytes -= Buffer.byteLength(message); return Promise.resolve({ done: false, value: message }); }
        if (fact !== null) return Promise.resolve({ done: true, value: undefined });
        if (waiter !== null) return Promise.reject(new TypeError("Renderer Control read already pending"));
        return new Promise((resolve) => { waiter = resolve; });
      } }; } };
    },
    closed,
    async close() { if (fact === null) { socket.close(1000); finish({ kind: "closed" }); } },
  });
}
