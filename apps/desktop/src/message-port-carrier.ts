import type { CarrierClosed, MessageCarrier } from "@loomrealm/foundation";

interface PortLike {
  postMessage(message: unknown): void;
  start(): void;
  close(): void;
  on?: (name: "message" | "close", listener: (event?: unknown) => void) => unknown;
  off?: (name: "message" | "close", listener: (event?: unknown) => void) => unknown;
  addEventListener?: (name: "message" | "close", listener: (event: Event) => void) => void;
  removeEventListener?: (name: "message" | "close", listener: (event: Event) => void) => void;
}

interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve(value: T): void;
}

function deferred<T>(): Deferred<T> {
  let settled = false;
  let resolvePromise!: (value: T) => void;
  const promise = new Promise<T>((resolve) => { resolvePromise = resolve; });
  return { promise, resolve(value) { if (!settled) { settled = true; resolvePromise(value); } } };
}

export function createMessagePortCarrier(port: PortLike): MessageCarrier {
  if (port === null || typeof port !== "object" || typeof port.postMessage !== "function" ||
    typeof port.start !== "function" || typeof port.close !== "function") {
    throw new TypeError("Invalid MessagePort carrier");
  }
  const terminal = deferred<CarrierClosed>();
  const queued: string[] = [];
  let waiter: Deferred<IteratorResult<string>> | null = null;
  let closed = false;
  let streamClaimed = false;

  const detach = () => {
    if (typeof port.off === "function") {
      port.off("message", onMessage);
      port.off("close", onClose);
    } else {
      port.removeEventListener?.("message", onMessage as unknown as (event: Event) => void);
      port.removeEventListener?.("close", onClose as unknown as (event: Event) => void);
    }
  };
  const finish = (fact: CarrierClosed) => {
    if (closed) return;
    closed = true;
    detach();
    queued.length = 0;
    waiter?.resolve({ done: true, value: undefined });
    waiter = null;
    terminal.resolve(Object.freeze(fact));
  };
  function onMessage(event?: unknown): void {
    const data = event !== null && typeof event === "object" && "data" in event ? (event as { data: unknown }).data : event;
    if (typeof data !== "string") {
      try { port.close(); } catch {}
      finish({ kind: "lost", cause: new TypeError("MessagePort carrier received non-text data") });
      return;
    }
    if (waiter !== null) {
      const current = waiter;
      waiter = null;
      current.resolve({ done: false, value: data });
    } else queued.push(data);
  }
  function onClose(): void { finish({ kind: "closed" }); }

  if (typeof port.on === "function") {
    port.on("message", onMessage);
    port.on("close", onClose);
  } else if (typeof port.addEventListener === "function") {
    port.addEventListener("message", onMessage as unknown as (event: Event) => void);
    port.addEventListener("close", onClose as unknown as (event: Event) => void);
  } else throw new TypeError("Invalid MessagePort event surface");
  port.start();

  return Object.freeze({
    send(message: string): Promise<void> {
      if (typeof message !== "string") return Promise.reject(new TypeError("Message must be text"));
      if (closed) return Promise.reject(new Error("MessagePort carrier closed"));
      try { port.postMessage(message); return Promise.resolve(); }
      catch (cause) { finish({ kind: "lost", cause }); return Promise.reject(cause); }
    },
    messages(): AsyncIterable<string> {
      return {
        [Symbol.asyncIterator]() {
          if (streamClaimed) throw new TypeError("Message stream is single-use");
          streamClaimed = true;
          return {
            next(): Promise<IteratorResult<string>> {
              if (queued.length > 0) return Promise.resolve({ done: false, value: queued.shift()! });
              if (closed) return Promise.resolve({ done: true, value: undefined });
              if (waiter !== null) return Promise.reject(new TypeError("Message read already pending"));
              waiter = deferred<IteratorResult<string>>();
              return waiter.promise;
            },
          };
        },
      };
    },
    closed: terminal.promise,
    close(): Promise<void> {
      if (!closed) {
        try { port.close(); } finally { finish({ kind: "closed" }); }
      }
      return Promise.resolve();
    },
  });
}
