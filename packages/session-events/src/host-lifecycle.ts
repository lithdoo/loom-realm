import type { SessionEventHub } from "./hub.js";

export type HostLifecycleState = "background" | "foreground";

export interface HostLifecyclePublisher {
  publish(state: HostLifecycleState): Promise<void>;
  close(): void;
}

/** Host-owned adapter from physical lifecycle facts into Session Events. */
export function createHostLifecyclePublisher(hub: SessionEventHub): HostLifecyclePublisher {
  if (hub === null || typeof hub !== "object" || !hub.ready) throw new TypeError("Invalid Session Event Hub");
  const publisher = hub.createDelegatedPublisher("host");
  let last: HostLifecycleState | undefined;
  let closed = false;
  let ordered = Promise.resolve();
  return Object.freeze({
    publish(state: HostLifecycleState): Promise<void> {
      if (state !== "background" && state !== "foreground") return Promise.reject(new TypeError("Invalid Host lifecycle state"));
      if (closed) return Promise.reject(new Error("Host lifecycle publisher is closed"));
      if (state === last) return ordered;
      last = state;
      ordered = ordered.then(() => publisher.publish("host.lifecycle", state, Object.freeze({}))).catch((cause) => {
        closed = true;
        throw cause;
      });
      return ordered;
    },
    close(): void { closed = true; },
  });
}
