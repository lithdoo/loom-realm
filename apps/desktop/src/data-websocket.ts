import { randomBytes } from "node:crypto";
import type { AddressInfo } from "node:net";
import type { CarrierClosed, MessageCarrier } from "@loomrealm/foundation";
import WebSocket, { type RawData, WebSocketServer } from "ws";

export interface DataBufferPolicy {
  readonly maxMessages: number;
  readonly maxBytes: number;
}

export const DEFAULT_DATA_BUFFER_POLICY: DataBufferPolicy = Object.freeze({
  maxMessages: 64,
  maxBytes: 1_048_576,
});

interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve(value: T): void;
  reject(reason: unknown): void;
}

function deferred<T>(): Deferred<T> {
  let settled = false;
  let resolvePromise!: (value: T) => void;
  let rejectPromise!: (reason: unknown) => void;
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return {
    promise,
    resolve(value) { if (!settled) { settled = true; resolvePromise(value); } },
    reject(reason) { if (!settled) { settled = true; rejectPromise(reason); } },
  };
}

function listen(server: WebSocketServer): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
}

function closeServer(server: WebSocketServer): void {
  try { server.close(); } catch {}
}

interface Endpoint {
  readonly endpoint: string;
  readonly connected: Promise<WebSocket>;
  close(): void;
}

async function createEndpoint(onConnection: (socket: WebSocket) => void): Promise<Endpoint> {
  const capabilityPath = `/${randomBytes(32).toString("base64url")}`;
  let claimed = false;
  const connected = deferred<WebSocket>();
  const server = new WebSocketServer({
    host: "127.0.0.1",
    port: 0,
    path: capabilityPath,
    verifyClient: ({ req }, done) => {
      if (claimed || req.url !== capabilityPath) {
        done(false);
        return;
      }
      claimed = true;
      done(true);
    },
  });
  server.once("connection", (socket) => {
    closeServer(server);
    onConnection(socket);
    connected.resolve(socket);
  });
  server.once("error", (error) => connected.reject(error));
  await listen(server);
  const address = server.address() as AddressInfo;
  return {
    endpoint: `ws://127.0.0.1:${address.port}${capabilityPath}`,
    connected: connected.promise,
    close: () => closeServer(server),
  };
}

export interface DesktopDataWebSocketPair {
  readonly rendererEndpoint: string;
  readonly runnerEndpoint: string;
  readonly prepared: Promise<void>;
  install(): boolean;
  dispose(): void;
}

export async function createDesktopDataWebSocketPair(
  policy: DataBufferPolicy,
  onFailure: (cause: unknown) => void,
): Promise<DesktopDataWebSocketPair> {
  let renderer: Endpoint | null = null;
  let runner: Endpoint | null = null;
  let rendererSocket: WebSocket | null = null;
  let runnerSocket: WebSocket | null = null;
  let state: "preparing" | "installed" | "retired" = "preparing";
  let failed = false;
  const fail = (cause: unknown) => {
    if (failed || state === "retired") return;
    failed = true;
    state = "retired";
    renderer?.close();
    runner?.close();
    try { rendererSocket?.terminate(); } catch {}
    try { runnerSocket?.terminate(); } catch {}
    onFailure(cause);
  };
  const installRelay = (source: WebSocket, target: () => WebSocket | null) => {
    const queue: string[] = [];
    let queuedBytes = 0;
    let sending = false;
    const flush = () => {
      if (sending || state !== "installed") return;
      const message = queue.shift();
      if (message === undefined) return;
      queuedBytes -= Buffer.byteLength(message, "utf8");
      const peer = target();
      if (peer === null || peer.readyState !== WebSocket.OPEN) {
        fail(new Error("Data relay peer is unavailable"));
        return;
      }
      sending = true;
      peer.send(message, (error) => {
        sending = false;
        if (error != null) fail(new Error("Data relay send failed"));
        else flush();
      });
    };
    source.on("message", (data: RawData, isBinary: boolean) => {
      if (state !== "installed") {
        fail(new Error("Pre-install Data application traffic"));
        return;
      }
      if (isBinary) {
        fail(new TypeError("Binary Data application traffic is unsupported"));
        return;
      }
      const message = typeof data === "string" ? data : data.toString("utf8");
      const bytes = Buffer.byteLength(message, "utf8");
      if (queue.length + 1 > policy.maxMessages || queuedBytes + bytes > policy.maxBytes) {
        fail(new Error("Data relay buffer exceeded"));
        return;
      }
      queue.push(message);
      queuedBytes += bytes;
      flush();
    });
    source.once("error", () => fail(new Error("Data relay WebSocket failed")));
    source.once("close", () => fail(new Error("Data relay WebSocket closed")));
  };
  renderer = await createEndpoint((socket) => {
    rendererSocket = socket;
    installRelay(socket, () => runnerSocket);
  });
  try {
    runner = await createEndpoint((socket) => {
      runnerSocket = socket;
      installRelay(socket, () => rendererSocket);
    });
  } catch (error) {
    renderer.close();
    throw error;
  }
  const rendererEndpoint = renderer;
  const runnerEndpoint = runner;
  const prepared = Promise.all([renderer.connected, runner.connected]).then(() => {
    if (state === "retired") throw new Error("Data WebSocket pair was retired");
  });
  return Object.freeze({
    rendererEndpoint: rendererEndpoint.endpoint,
    runnerEndpoint: runnerEndpoint.endpoint,
    prepared,
    install() {
      if (state !== "preparing" || rendererSocket === null || runnerSocket === null || failed) return false;
      state = "installed";
      return true;
    },
    dispose() {
      if (state === "retired") return;
      state = "retired";
      rendererEndpoint.close();
      runnerEndpoint.close();
      try { rendererSocket?.close(); } catch {}
      try { runnerSocket?.close(); } catch {}
    },
  });
}

export function connectBoundedDataCarrier(
  endpoint: string,
  signal: AbortSignal,
  policy: DataBufferPolicy,
): Promise<MessageCarrier> {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(endpoint);
    let settled = false;
    const fail = (reason: unknown) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", abort);
      try { socket.terminate(); } catch {}
      reject(reason);
    };
    const abort = () => fail(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    socket.once("open", () => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", abort);
      resolve(createBoundedCarrier(socket, policy));
    });
    socket.once("error", fail);
  });
}

function createBoundedCarrier(socket: WebSocket, policy: DataBufferPolicy): MessageCarrier {
  const terminal = deferred<CarrierClosed>();
  const queue: string[] = [];
  const waiters: Array<(result: IteratorResult<string>) => void> = [];
  let queuedBytes = 0;
  let terminalFact: CarrierClosed | null = null;
  let readerClaimed = false;
  const settle = (fact: CarrierClosed) => {
    if (terminalFact !== null) return;
    terminalFact = Object.freeze(fact);
    terminal.resolve(terminalFact);
    while (waiters.length > 0) waiters.shift()!({ done: true, value: undefined });
  };
  const lose = (cause: unknown) => {
    settle({ kind: "lost", cause });
    try { socket.terminate(); } catch {}
  };
  socket.on("message", (data: RawData, isBinary: boolean) => {
    if (terminalFact !== null) return;
    if (isBinary) { lose(new TypeError("Binary Data message is unsupported")); return; }
    const message = typeof data === "string" ? data : data.toString("utf8");
    const waiter = waiters.shift();
    if (waiter !== undefined) { waiter({ done: false, value: message }); return; }
    const bytes = Buffer.byteLength(message, "utf8");
    if (queue.length + 1 > policy.maxMessages || queuedBytes + bytes > policy.maxBytes) {
      lose(new Error("Role-undelivered Data buffer exceeded"));
      return;
    }
    queue.push(message);
    queuedBytes += bytes;
  });
  socket.once("error", () => lose(new Error("Data WebSocket failed")));
  socket.once("close", () => settle({ kind: "closed" }));
  return Object.freeze({
    send(message: string) {
      if (typeof message !== "string") return Promise.reject(new TypeError("Data message must be text"));
      if (terminalFact !== null || socket.readyState !== WebSocket.OPEN) return Promise.reject(new Error("Data carrier is closed"));
      return new Promise<void>((yes, no) => socket.send(message, (error) => {
        if (error == null) yes();
        else { const failure = new Error("Data WebSocket send failed"); lose(failure); no(failure); }
      }));
    },
    messages() {
      if (readerClaimed) throw new Error("Data carrier reader already acquired");
      readerClaimed = true;
      return {
        [Symbol.asyncIterator]() {
          return {
            next(): Promise<IteratorResult<string>> {
              const message = queue.shift();
              if (message !== undefined) {
                queuedBytes -= Buffer.byteLength(message, "utf8");
                return Promise.resolve({ done: false, value: message });
              }
              if (terminalFact !== null) return Promise.resolve({ done: true, value: undefined });
              return new Promise((resolveNext) => waiters.push(resolveNext));
            },
          };
        },
      };
    },
    closed: terminal.promise,
    async close() {
      if (terminalFact !== null) return;
      socket.close();
      await terminal.promise;
    },
  });
}
