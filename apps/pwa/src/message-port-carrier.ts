import type { CarrierClosed, MessageCarrier } from "@loomrealm/foundation";

const CLOSE = "\u001eloomrealm.pwa.port.close/1";

export function createMessagePortCarrier(port: MessagePort): MessageCarrier {
  if (port === null || typeof port !== "object" || typeof port.postMessage !== "function") throw new TypeError("Invalid MessagePort");
  const queue: string[] = [];
  const waiters: Array<(value: IteratorResult<string>) => void> = [];
  let terminal: CarrierClosed | null = null;
  let settle!: (value: CarrierClosed) => void;
  const closed = new Promise<CarrierClosed>((resolve) => { settle = resolve; });
  const finish = (fact: CarrierClosed) => {
    if (terminal !== null) return;
    terminal = Object.freeze(fact);
    port.removeEventListener("message", onMessage);
    port.removeEventListener("messageerror", onError);
    while (waiters.length > 0) waiters.shift()!({ done: true, value: undefined });
    try { port.close(); }
    catch (cause) {
      terminal = Object.freeze({ kind: "lost", cause: new AggregateError([fact.kind === "lost" ? fact.cause : undefined, cause].filter((value) => value !== undefined), "MessagePort carrier close failed") });
    }
    settle(terminal);
  };
  const onMessage = (event: MessageEvent<unknown>) => {
    if (event.data === CLOSE) { finish({ kind: "closed" }); return; }
    if (typeof event.data !== "string") { finish({ kind: "lost", cause: new TypeError("Non-string MessagePort unit") }); return; }
    const waiter = waiters.shift();
    if (waiter) waiter({ done: false, value: event.data }); else queue.push(event.data);
  };
  const onError = (event: MessageEvent<unknown>) => finish({ kind: "lost", cause: event });
  port.addEventListener("message", onMessage);
  port.addEventListener("messageerror", onError);
  port.start();
  return Object.freeze({
    send(message: string) {
      if (terminal !== null) return Promise.reject(new Error("MessagePort carrier closed"));
      if (typeof message !== "string" || message === CLOSE) return Promise.reject(new TypeError("Invalid MessagePort unit"));
      try {
        port.postMessage(message);
        return Promise.resolve();
      } catch (cause) {
        finish({ kind: "lost", cause });
        return Promise.reject(cause);
      }
    },
    messages() {
      let acquired = false;
      return Object.freeze({
        [Symbol.asyncIterator]() {
          if (acquired) throw new Error("MessagePort stream already acquired");
          acquired = true;
          return Object.freeze({
            next(): Promise<IteratorResult<string>> {
              const value = queue.shift();
              if (value !== undefined) return Promise.resolve({ done: false, value });
              if (terminal !== null) return Promise.resolve({ done: true, value: undefined });
              return new Promise((resolve) => waiters.push(resolve));
            },
          });
        },
      });
    },
    closed,
    async close() {
      if (terminal !== null) return;
      try { port.postMessage(CLOSE); }
      catch (cause) {
        finish({ kind: "lost", cause });
        throw cause;
      }
      finish({ kind: "closed" });
    },
  });
}
