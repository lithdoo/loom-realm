import type { CarrierClosed, MessageCarrier } from "@loomrealm/foundation";
import type { DataBufferPolicy } from "./data-websocket.js";

interface Deferred<T> { readonly promise: Promise<T>; resolve(value: T): void; reject(cause: unknown): void }
function deferred<T>(): Deferred<T> {
  let settled = false;
  let resolvePromise!: (value: T) => void;
  let rejectPromise!: (cause: unknown) => void;
  const promise = new Promise<T>((resolve, reject) => { resolvePromise = resolve; rejectPromise = reject; });
  return {
    promise,
    resolve(value) { if (!settled) { settled = true; resolvePromise(value); } },
    reject(cause) { if (!settled) { settled = true; rejectPromise(cause); } },
  };
}

export async function connectBrowserDataCarrier(
  endpoint: string,
  signal: AbortSignal,
  policy: DataBufferPolicy,
  NativeWebSocket: typeof WebSocket,
): Promise<MessageCarrier> {
  if (signal.aborted) throw signal.reason;
  const socket = new NativeWebSocket(endpoint);
  const opened = deferred<void>();
  const onOpen = () => opened.resolve();
  const onInitialError = () => opened.reject(new Error("Browser Data WebSocket failed"));
  const onAbort = () => { try { socket.close(); } catch {} opened.reject(signal.reason); };
  socket.addEventListener("open", onOpen, { once: true });
  socket.addEventListener("error", onInitialError, { once: true });
  signal.addEventListener("abort", onAbort, { once: true });
  try { await opened.promise; }
  finally {
    socket.removeEventListener("open", onOpen);
    socket.removeEventListener("error", onInitialError);
    signal.removeEventListener("abort", onAbort);
  }

  const terminal = deferred<CarrierClosed>();
  const encoder = new TextEncoder();
  const queued: string[] = [];
  let queuedBytes = 0;
  let waiter: Deferred<IteratorResult<string>> | null = null;
  let closed = false;
  let streamClaimed = false;
  const finish = (fact: CarrierClosed) => {
    if (closed) return;
    closed = true;
    queued.length = 0; queuedBytes = 0;
    waiter?.resolve({ done: true, value: undefined }); waiter = null;
    terminal.resolve(Object.freeze(fact));
  };
  const onMessage = (event: MessageEvent<unknown>) => {
    if (typeof event.data !== "string") {
      try { socket.close(1003); } catch {}
      finish({ kind: "lost", cause: new TypeError("Browser Data carrier received non-text data") });
      return;
    }
    const size = encoder.encode(event.data).byteLength;
    if (queued.length >= policy.maxMessages || queuedBytes + size > policy.maxBytes) {
      try { socket.close(1009); } catch {}
      finish({ kind: "lost", cause: new Error("Browser Data carrier buffer exceeded") });
      return;
    }
    if (waiter !== null) { const current = waiter; waiter = null; current.resolve({ done: false, value: event.data }); }
    else { queued.push(event.data); queuedBytes += size; }
  };
  socket.addEventListener("message", onMessage);
  socket.addEventListener("close", () => finish({ kind: "closed" }), { once: true });
  socket.addEventListener("error", () => finish({ kind: "lost", cause: new Error("Browser Data WebSocket lost") }), { once: true });

  return Object.freeze({
    send(message: string): Promise<void> {
      if (typeof message !== "string") return Promise.reject(new TypeError("Message must be text"));
      if (closed || socket.readyState !== NativeWebSocket.OPEN) return Promise.reject(new Error("Browser Data carrier closed"));
      if (socket.bufferedAmount + encoder.encode(message).byteLength > policy.maxBytes) return Promise.reject(new Error("Browser Data send buffer exceeded"));
      try { socket.send(message); return Promise.resolve(); } catch (cause) { finish({ kind: "lost", cause }); return Promise.reject(cause); }
    },
    messages(): AsyncIterable<string> {
      return { [Symbol.asyncIterator]() {
        if (streamClaimed) throw new TypeError("Message stream is single-use");
        streamClaimed = true;
        return { next(): Promise<IteratorResult<string>> {
          if (queued.length > 0) { const value = queued.shift()!; queuedBytes -= encoder.encode(value).byteLength; return Promise.resolve({ done: false, value }); }
          if (closed) return Promise.resolve({ done: true, value: undefined });
          if (waiter !== null) return Promise.reject(new TypeError("Message read already pending"));
          waiter = deferred<IteratorResult<string>>(); return waiter.promise;
        } };
      } };
    },
    closed: terminal.promise,
    close(): Promise<void> { if (!closed) { try { socket.close(1000); } finally { finish({ kind: "closed" }); } } return Promise.resolve(); },
  });
}
