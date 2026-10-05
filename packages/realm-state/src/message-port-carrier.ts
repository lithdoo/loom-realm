import type { CarrierClosed, MessageCarrier } from "@loomrealm/foundation";

const CLOSE_SENTINEL = "\u001eloomrealm.realm-state.port.close/1";

interface PortMessageEvent {
  readonly data: unknown;
}

export interface RealmStateMessagePort {
  postMessage(message: string): void;
  addEventListener(type: "message", listener: (event: PortMessageEvent) => void): void;
  addEventListener(type: "messageerror", listener: (event: unknown) => void): void;
  removeEventListener(type: "message", listener: (event: PortMessageEvent) => void): void;
  removeEventListener(type: "messageerror", listener: (event: unknown) => void): void;
  start?(): void;
  close?(): void;
}

interface Waiter {
  resolve(value: IteratorResult<string>): void;
}

/** Browser/DedicatedWorker MessagePort realization with a State-plane close sentinel. */
export function createRealmStateMessagePortCarrier(
  port: RealmStateMessagePort,
): MessageCarrier {
  if (
    port === null ||
    typeof port !== "object" ||
    typeof port.postMessage !== "function" ||
    typeof port.addEventListener !== "function" ||
    typeof port.removeEventListener !== "function"
  ) {
    throw new TypeError("Invalid Realm State MessagePort");
  }
  const queue: string[] = [];
  const waiters: Waiter[] = [];
  let terminal: CarrierClosed | null = null;
  let settleClosed!: (fact: CarrierClosed) => void;
  const closed = new Promise<CarrierClosed>((resolve) => { settleClosed = resolve; });

  const finish = (fact: CarrierClosed) => {
    if (terminal !== null) return;
    terminal = Object.freeze(fact);
    port.removeEventListener("message", onMessage);
    port.removeEventListener("messageerror", onMessageError);
    while (waiters.length > 0) waiters.shift()!.resolve({ done: true, value: undefined });
    settleClosed(terminal);
    try { port.close?.(); } catch {}
  };
  const onMessage = (event: PortMessageEvent) => {
    if (terminal !== null) return;
    if (event.data === CLOSE_SENTINEL) {
      finish({ kind: "closed" });
      return;
    }
    if (typeof event.data !== "string") {
      finish({ kind: "lost", cause: new TypeError("Realm State MessagePort received a non-string unit") });
      return;
    }
    const waiter = waiters.shift();
    if (waiter === undefined) queue.push(event.data);
    else waiter.resolve({ done: false, value: event.data });
  };
  const onMessageError = (event: unknown) => finish({ kind: "lost", cause: event });
  port.addEventListener("message", onMessage);
  port.addEventListener("messageerror", onMessageError);
  port.start?.();

  const carrier: MessageCarrier = Object.freeze({
    async send(message: string) {
      if (terminal !== null) throw new Error("Realm State MessagePort is closed");
      if (typeof message !== "string" || message === CLOSE_SENTINEL) {
        throw new TypeError("Invalid Realm State MessagePort unit");
      }
      port.postMessage(message);
    },
    messages(): AsyncIterable<string> {
      let acquired = false;
      return Object.freeze({
        [Symbol.asyncIterator]() {
          if (acquired) throw new Error("Realm State MessagePort stream already acquired");
          acquired = true;
          return Object.freeze({
            next(): Promise<IteratorResult<string>> {
              const value = queue.shift();
              if (value !== undefined) return Promise.resolve({ done: false, value });
              if (terminal !== null) return Promise.resolve({ done: true, value: undefined });
              return new Promise((resolve) => waiters.push({ resolve }));
            },
          });
        },
      });
    },
    closed,
    async close() {
      if (terminal !== null) return;
      try { port.postMessage(CLOSE_SENTINEL); } catch {}
      finish({ kind: "closed" });
    },
  });
  return carrier;
}
