import type { SessionEventHub } from "./hub.js";
import type { SessionEvent, SessionEventClient, SessionEventSubscription } from "./model.js";

export type HostLifecycleState = "background" | "foreground";

export interface HostLifecyclePublisher {
  publish(state: HostLifecycleState): Promise<void>;
  close(): void;
}

export interface HostLifecycleSnapshot {
  readonly sessionEpoch: string;
  readonly sequence: number;
  readonly state: HostLifecycleState;
}

export interface HostLifecyclePublisherOptions {
  readonly sessionEpoch: string;
  readonly initialState?: HostLifecycleState;
}

export interface HostLifecycleSubscription extends SessionEventSubscription {
  readonly initial: HostLifecycleSnapshot;
}

/** Host-owned adapter from physical lifecycle facts into Session Events. */
export function createHostLifecyclePublisher(hub: SessionEventHub, options: HostLifecyclePublisherOptions): HostLifecyclePublisher {
  if (hub === null || typeof hub !== "object" || !hub.ready) throw new TypeError("Invalid Session Event Hub");
  if (options === null || typeof options !== "object") throw new TypeError("Host lifecycle options are required");
  const owner = Symbol("host-lifecycle");
  hub.installHostLifecyclePublisher(owner, options.sessionEpoch, options.initialState);
  let closed = false;
  return Object.freeze({
    publish(state: HostLifecycleState): Promise<void> {
      if (closed) return Promise.reject(new Error("Host lifecycle publisher is closed"));
      return hub.publishHostLifecycle(owner, state);
    },
    close(): void {
      if (closed) return;
      closed = true;
      hub.closeHostLifecyclePublisher(owner);
    },
  });
}

function parseSnapshot(event: SessionEvent): HostLifecycleSnapshot | null {
  const value = event.payload;
  if (event.channel !== "host.lifecycle" || event.type !== "state" || event.source.subsystemKey !== "host"
    || value === null || typeof value !== "object" || Array.isArray(value)
    || Reflect.ownKeys(value).length !== 3) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.sessionEpoch !== "string" || record.sessionEpoch.length === 0
    || !Number.isSafeInteger(record.sequence) || (record.sequence as number) < 0
    || (record.state !== "background" && record.state !== "foreground")) return null;
  return Object.freeze({
    sessionEpoch: record.sessionEpoch,
    sequence: record.sequence as number,
    state: record.state,
  });
}

export async function subscribeHostLifecycle(
  client: SessionEventClient,
  listener: (snapshot: HostLifecycleSnapshot) => void | Promise<void>,
): Promise<HostLifecycleSubscription> {
  if (client === null || typeof client !== "object" || typeof client.subscribe !== "function") throw new TypeError("Invalid Session Event client");
  if (typeof listener !== "function") throw new TypeError("Host lifecycle listener must be a function");
  let resolveInitial!: (snapshot: HostLifecycleSnapshot) => void;
  const initial = new Promise<HostLifecycleSnapshot>((resolve) => { resolveInitial = resolve; });
  let current: HostLifecycleSnapshot | null = null;
  const subscription = await client.subscribe(["host.lifecycle"], async (event) => {
    const snapshot = parseSnapshot(event);
    if (snapshot === null) return;
    if (current !== null) {
      if (snapshot.sessionEpoch !== current.sessionEpoch || snapshot.sequence !== current.sequence + 1) return;
    }
    current = snapshot;
    resolveInitial(snapshot);
    await listener(snapshot);
  });
  const first = await Promise.race([
    initial,
    subscription.closed.then(({ reason }) => Promise.reject(new Error(`Host lifecycle subscription closed before snapshot: ${reason}`))),
  ]);
  return Object.freeze({ initial: first, closed: subscription.closed, close: () => subscription.close() });
}
