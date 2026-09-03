import type { CarrierClosed, MessageCarrier } from "@loomrealm/foundation";
import WebSocket, { type RawData } from "ws";

interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve(value: T): void;
}

function deferred<T>(): Deferred<T> {
  let settled = false;
  let resolvePromise!: (value: T) => void;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });
  return {
    promise,
    resolve(value) {
      if (settled) return;
      settled = true;
      resolvePromise(value);
    },
  };
}

export function createWebSocketCarrier(socket: WebSocket): MessageCarrier {
  const terminal = deferred<CarrierClosed>();
  const queued: string[] = [];
  const waiters: ((result: IteratorResult<string>) => void)[] = [];
  let terminalFact: CarrierClosed | null = null;
  let readerClaimed = false;

  const settle = (fact: CarrierClosed) => {
    if (terminalFact !== null) return;
    terminalFact = Object.freeze(fact);
    terminal.resolve(terminalFact);
    while (waiters.length > 0) waiters.shift()!({ done: true, value: undefined });
  };

  const lose = (cause?: unknown) => {
    settle(cause === undefined ? { kind: "lost" } : { kind: "lost", cause });
    try {
      socket.terminate();
    } catch {
      // The terminal fact is already immutable.
    }
  };

  socket.on("message", (data: RawData, isBinary: boolean) => {
    if (terminalFact !== null) return;
    if (isBinary) {
      lose(new TypeError("Binary WebSocket message is not supported"));
      return;
    }
    const message = typeof data === "string" ? data : data.toString("utf8");
    const waiter = waiters.shift();
    if (waiter === undefined) queued.push(message);
    else waiter({ done: false, value: message });
  });
  socket.once("error", () => lose(new Error("WebSocket transport failed")));
  socket.once("close", () => settle({ kind: "closed" }));

  return {
    send(message: string): Promise<void> {
      if (typeof message !== "string") return Promise.reject(new TypeError("Carrier message must be a string"));
      if (terminalFact !== null || socket.readyState !== WebSocket.OPEN) {
        return Promise.reject(new Error("Message carrier is closed"));
      }
      return new Promise<void>((resolve, reject) => {
        socket.send(message, (error) => {
          if (error == null) resolve();
          else {
            const failure = new Error("WebSocket send failed");
            lose(failure);
            reject(failure);
          }
        });
      });
    },
    messages(): AsyncIterable<string> {
      if (readerClaimed) throw new Error("Message carrier reader already acquired");
      readerClaimed = true;
      return {
        [Symbol.asyncIterator]() {
          return {
            next(): Promise<IteratorResult<string>> {
              const message = queued.shift();
              if (message !== undefined) return Promise.resolve({ done: false, value: message });
              if (terminalFact !== null) return Promise.resolve({ done: true, value: undefined });
              return new Promise((resolve) => waiters.push(resolve));
            },
          };
        },
      };
    },
    closed: terminal.promise,
    async close(): Promise<void> {
      if (terminalFact !== null) return;
      if (socket.readyState === WebSocket.CLOSED) {
        settle({ kind: "closed" });
        return;
      }
      socket.close();
      await terminal.promise;
    },
  };
}
