import type { MessageCarrier } from "@loomrealm/foundation";
import type { JsonValue } from "@loomrealm/wire";
import {
  isSessionEventFailure,
  sessionEventError,
  SessionEventError,
} from "./failure.js";
import type {
  SessionEvent,
  SessionEventBindingPublishDispatch,
  SessionEventBindingTerminalReason,
  SessionEventListener,
  SessionEventPhysicalBinding,
  SessionEventSubscription,
  SessionEventSubscriptionClose,
  SessionEventSubscriptionCloseReason,
} from "./model.js";
import {
  snapshotJsonValue,
  validateChannels,
  validatePublish,
} from "./validation.js";
import { SessionEventDelivery } from "./subscription.js";

const PROTOCOL = "loomrealm.session-events/1";
const MAX_PENDING_REQUESTS = 256;
const MAX_SUBSCRIPTION_CORRELATIONS = 320;
const MAX_OUTBOUND_MESSAGES = 256;
const MAX_OUTBOUND_BYTES = 32 * 1024 * 1024;
const MAX_MESSAGE_BYTES = 1024 * 1024;

type RequestKind = "publish" | "subscribe" | "unsubscribe";

interface PendingRequest<T = unknown> {
  readonly kind: RequestKind;
  readonly state: "pending" | "establishing";
  readonly decode: (value: unknown) => T;
  resolve(value: T): void;
  reject(error: unknown): void;
}

interface RequestOperation<T> {
  readonly id: number | null;
  readonly dispatched: Promise<void>;
  readonly result: Promise<T>;
}

interface OutboundLane {
  tail: Promise<void>;
  failure: unknown | null;
  messages: number;
  bytes: number;
}

const lanes = new WeakMap<MessageCarrier, OutboundLane>();

function laneFor(carrier: MessageCarrier): OutboundLane {
  let lane = lanes.get(carrier);
  if (lane === undefined) {
    lane = { tail: Promise.resolve(), failure: null, messages: 0, bytes: 0 };
    lanes.set(carrier, lane);
  }
  return lane;
}

function send(carrier: MessageCarrier, value: unknown): Promise<void> {
  const text = JSON.stringify(value);
  const bytes = new TextEncoder().encode(text).byteLength;
  if (bytes > MAX_MESSAGE_BYTES) return Promise.reject(new Error("Session Event message limit exceeded"));
  const lane = laneFor(carrier);
  if (lane.messages + 1 > MAX_OUTBOUND_MESSAGES || lane.bytes + bytes > MAX_OUTBOUND_BYTES) {
    return Promise.reject(new Error("Session Event outbound queue exceeded"));
  }
  lane.messages += 1;
  lane.bytes += bytes;
  const operation = lane.tail.then(async () => {
    if (lane.failure !== null) throw lane.failure;
    try { await carrier.send(text); }
    catch (error) { lane.failure = error; throw error; }
  });
  lane.tail = operation.catch(() => undefined);
  return operation.finally(() => { lane.messages -= 1; lane.bytes -= bytes; });
}

function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Invalid Session Event protocol object");
  }
  return value as Record<string, unknown>;
}

function exact(value: unknown, keys: readonly string[]): Record<string, unknown> {
  const record = object(value);
  const actual = Object.keys(record).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new TypeError("Unexpected Session Event protocol shape");
  }
  return record;
}

function positiveInteger(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new TypeError("Invalid Session Event correlation identity");
  }
  return value as number;
}

function parse(text: string): Record<string, unknown> {
  if (typeof text !== "string" || new TextEncoder().encode(text).byteLength > MAX_MESSAGE_BYTES) {
    throw new TypeError("Invalid Session Event protocol message");
  }
  try { return object(JSON.parse(text)); }
  catch { throw new TypeError("Invalid Session Event protocol message"); }
}

function failureObject(error: unknown): Readonly<Record<string, unknown>> {
  if (!isSessionEventFailure(error)) {
    throw new TypeError("Cannot encode an unknown Session Event failure");
  }
  return Object.freeze({
    code: error.code,
    message: error.message,
    ...(error.path === undefined ? {} : { path: error.path }),
  });
}

function decodeFailure(value: unknown): SessionEventError {
  const record = object(value);
  if (!isSessionEventFailure(record)) throw new TypeError("Invalid Session Event failure");
  return sessionEventError(record.code, record.message, record.path);
}

function decodeEvent(value: unknown): SessionEvent {
  const record = exact(value, ["channel", "type", "payload", "source"]);
  const source = exact(record.source, ["subsystemKey"]);
  if (typeof source.subsystemKey !== "string" || source.subsystemKey.length === 0) {
    throw new TypeError("Invalid Session Event source");
  }
  const validated = validatePublish(record.channel, record.type, record.payload);
  return Object.freeze({
    channel: validated.channel,
    type: validated.type,
    payload: snapshotJsonValue(validated.payload),
    source: Object.freeze({ subsystemKey: source.subsystemKey }),
  });
}

class RemoteSubscription extends SessionEventDelivery {
  constructor(
    readonly id: number,
    listener: SessionEventListener,
    private readonly onClose: (
      subscription: RemoteSubscription,
      reason: SessionEventSubscriptionCloseReason,
    ) => void,
  ) {
    super(listener, (reason) => onClose(this, reason));
  }
}

type RemoteSubscriptionCorrelation =
  | {
      readonly state: "live";
      readonly handle: RemoteSubscription;
    }
  | {
      readonly state: "retiring";
      readonly handle: RemoteSubscription;
      readonly unsubscribeRequestId: number;
    };

export function createSessionEventCarrierBinding(
  carrier: MessageCarrier,
): SessionEventPhysicalBinding {
  let nextId = 1;
  let lifecycle: "live" | "binding-terminal" = "live";
  let highestSubscriptionId = 0;
  const pending = new Map<number, PendingRequest>();
  // Subscription lifecycle is deliberately split across bounded structures:
  // ESTABLISHING is a pending subscribe request; LIVE/RETIRING live here;
  // RETIRED is absence with id <= highestSubscriptionId; BINDING_TERMINAL is
  // the binding lifecycle above. No per-subscription tombstone is retained.
  const subscriptions = new Map<number, RemoteSubscriptionCorrelation>();
  let settleTerminal!: (reason: SessionEventBindingTerminalReason) => void;
  const terminal = new Promise<SessionEventBindingTerminalReason>((resolve) => { settleTerminal = resolve; });

  const failClosed = (cause: unknown, reason: SessionEventBindingTerminalReason = "binding-terminal") => {
    if (lifecycle === "binding-terminal") return;
    lifecycle = "binding-terminal";
    for (const request of pending.values()) request.reject(cause);
    pending.clear();
    for (const subscription of subscriptions.values()) subscription.handle.terminate(reason);
    subscriptions.clear();
    settleTerminal(reason);
  };

  const request = <T>(method: RequestKind, params: unknown, decode: (value: unknown) => T): RequestOperation<T> => {
    const rejected = (error: unknown): RequestOperation<T> => {
      const dispatched = Promise.reject(error);
      const result = Promise.reject<T>(error);
      void dispatched.catch(() => undefined);
      void result.catch(() => undefined);
      return Object.freeze({ id: null, dispatched, result });
    };
    if (lifecycle === "binding-terminal" || pending.size >= MAX_PENDING_REQUESTS || nextId === Number.MAX_SAFE_INTEGER) {
      return rejected(sessionEventError("BINDING_UNAVAILABLE", "Session Event carrier is unavailable"));
    }
    const id = nextId++;
    let resolve!: (value: T) => void;
    let reject!: (error: unknown) => void;
    const result = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
    void result.catch(() => undefined);
    pending.set(id, {
      kind: method,
      state: method === "subscribe" ? "establishing" : "pending",
      decode,
      resolve,
      reject,
    });
    const dispatched = send(carrier, { protocol: PROTOCOL, type: "request", id, method, params })
      .catch((error) => {
        pending.delete(id);
        reject(error);
        failClosed(error);
        void carrier.close().catch(() => undefined);
        throw error;
      });
    return Object.freeze({ id, dispatched, result });
  };

  const localClose = (
    subscription: RemoteSubscription,
    _reason: SessionEventSubscriptionCloseReason,
  ) => {
    const correlation = subscriptions.get(subscription.id);
    if (correlation === undefined || correlation.state !== "live") return;
    if (lifecycle === "binding-terminal") return;
    const operation = request("unsubscribe", { subscriptionId: subscription.id }, (value) => {
      exact(value, []);
    });
    if (operation.id === null) {
      void operation.dispatched.catch((error) => failClosed(error));
      void operation.result.catch((error) => failClosed(error));
      return;
    }
    subscriptions.set(subscription.id, Object.freeze({
      state: "retiring" as const,
      handle: subscription,
      unsubscribeRequestId: operation.id,
    }));
    void operation.dispatched.catch((error) => failClosed(error));
    void operation.result.then(
      () => {
        const current = subscriptions.get(subscription.id);
        if (
          current?.state === "retiring" &&
          current.unsubscribeRequestId === operation.id
        ) subscriptions.delete(subscription.id);
      },
      (error) => failClosed(error),
    );
  };

  void (async () => {
    try {
      for await (const text of carrier.messages()) {
        const message = parse(text);
        if (message.protocol !== PROTOCOL) throw new TypeError("Wrong Session Event protocol");
        if (message.type === "response") {
          const shaped = message.ok === true
            ? exact(message, ["protocol", "type", "id", "ok", "result"])
            : exact(message, ["protocol", "type", "id", "ok", "failure"]);
          const id = positiveInteger(shaped.id);
          const correlation = pending.get(id);
          if (correlation === undefined) throw new TypeError("Impossible Session Event response correlation");
          pending.delete(id);
          if (shaped.ok === true) correlation.resolve(correlation.decode(shaped.result));
          else if (shaped.ok === false) correlation.reject(decodeFailure(shaped.failure));
          else throw new TypeError("Invalid Session Event response outcome");
          continue;
        }
        if (message.type === "event") {
          const shaped = exact(message, ["protocol", "type", "subscriptionId", "event"]);
          const subscriptionId = positiveInteger(shaped.subscriptionId);
          const event = decodeEvent(shaped.event);
          const subscription = subscriptions.get(subscriptionId);
          if (subscription === undefined) {
            if (subscriptionId <= highestSubscriptionId) continue;
            throw new TypeError("Impossible Session Event subscription correlation");
          }
          if (subscription.state === "live") subscription.handle.enqueue(event);
          continue;
        }
        if (message.type === "terminal") {
          const shaped = exact(message, ["protocol", "type", "subscriptionId", "reason"]);
          const subscriptionId = positiveInteger(shaped.subscriptionId);
          if (
            shaped.reason !== "overflow" && shaped.reason !== "binding-terminal" &&
            shaped.reason !== "client-terminal" && shaped.reason !== "hub-terminal" &&
            shaped.reason !== "closed"
          ) throw new TypeError("Invalid Session Event terminal reason");
          const subscription = subscriptions.get(subscriptionId);
          if (subscription === undefined) {
            if (subscriptionId <= highestSubscriptionId) continue;
            throw new TypeError("Impossible Session Event terminal correlation");
          }
          // A terminal is the peer's definitive retirement evidence. Remove the
          // physical correlation before settling the author handle so its local
          // terminal callback cannot emit a redundant unsubscribe.
          subscriptions.delete(subscriptionId);
          if (subscription.state === "live") subscription.handle.terminate(shaped.reason);
          continue;
        }
        throw new TypeError("Invalid Session Event carrier message type");
      }
      failClosed(new Error("Session Event carrier ended"));
    } catch (error) {
      failClosed(error);
      try { await carrier.close(); } catch {}
    }
  })();
  void carrier.closed.then(
    (fact) => failClosed(fact),
    (cause) => failClosed(cause),
  );

  return Object.freeze({
    publish(channel: string, type: string, payload: JsonValue): SessionEventBindingPublishDispatch {
      const validated = validatePublish(channel, type, payload);
      return request("publish", {
        channel: validated.channel,
        type: validated.type,
        payload: validated.payload,
      }, (value) => { exact(value, []); });
    },
    async subscribe(channels: readonly string[], listener: SessionEventListener) {
      if (typeof listener !== "function") {
        throw sessionEventError("INVALID_REQUEST", "Subscription listener must be a function", ["listener"]);
      }
      const validated = validateChannels(channels);
      const operation = request("subscribe", { channels: validated }, (value) => {
        const result = exact(value, ["subscriptionId"]);
        const id = positiveInteger(result.subscriptionId);
        if (
          id <= highestSubscriptionId || subscriptions.has(id) ||
          subscriptions.size >= MAX_SUBSCRIPTION_CORRELATIONS
        ) throw new TypeError("Duplicate or excessive Session Event subscription identity");
        highestSubscriptionId = id;
        const handle = new RemoteSubscription(id, listener, localClose);
        subscriptions.set(id, Object.freeze({ state: "live" as const, handle }));
        handle.reveal();
        return handle;
      });
      await operation.dispatched;
      return operation.result;
    },
    terminal,
    async close() {
      failClosed(sessionEventError("BINDING_UNAVAILABLE", "Session Event carrier is closed"));
      await carrier.close();
    },
  });
}

type ServerRequest =
  | { readonly method: "publish"; readonly channel: string; readonly type: string; readonly payload: JsonValue }
  | { readonly method: "subscribe"; readonly channels: readonly string[] }
  | { readonly method: "unsubscribe"; readonly subscriptionId: number };

function decodeServerRequest(method: unknown, value: unknown): ServerRequest {
  try {
    if (method === "publish") {
      const params = exact(value, ["channel", "type", "payload"]);
      const validated = validatePublish(params.channel, params.type, params.payload);
      return Object.freeze({ method, channel: validated.channel, type: validated.type, payload: validated.payload });
    }
    if (method === "subscribe") {
      const params = exact(value, ["channels"]);
      return Object.freeze({ method, channels: validateChannels(params.channels) });
    }
    if (method === "unsubscribe") {
      const params = exact(value, ["subscriptionId"]);
      return Object.freeze({ method, subscriptionId: positiveInteger(params.subscriptionId) });
    }
    throw sessionEventError("INVALID_REQUEST", "Unknown Session Event method", ["method"]);
  } catch (error) {
    if (isSessionEventFailure(error)) throw error;
    throw sessionEventError("INVALID_REQUEST", "Invalid Session Event request");
  }
}

export interface SessionEventCarrierServer {
  readonly closed: Promise<void>;
  close(): Promise<void>;
}

export function serveSessionEventCarrier(
  binding: SessionEventPhysicalBinding,
  carrier: MessageCarrier,
): SessionEventCarrierServer {
  let nextSubscriptionId = 1;
  let lastRequestId = 0;
  let closed = false;
  const subscriptions = new Map<number, SessionEventSubscription>();
  let settle!: () => void;
  const closedPromise = new Promise<void>((resolve) => { settle = resolve; });
  const shutdown = () => {
    if (closed) return;
    closed = true;
    for (const subscription of subscriptions.values()) subscription.close();
    subscriptions.clear();
    try { void Promise.resolve(binding.close()).catch(() => undefined); } catch {}
    settle();
  };
  const response = (id: number, ok: boolean, body: unknown) => send(carrier, {
    protocol: PROTOCOL,
    type: "response",
    id,
    ok,
    ...(ok ? { result: body } : { failure: body }),
  });

  void (async () => {
    try {
      for await (const text of carrier.messages()) {
        const message = exact(parse(text), ["protocol", "type", "id", "method", "params"]);
        if (message.protocol !== PROTOCOL || message.type !== "request") {
          throw new TypeError("Invalid Session Event request envelope");
        }
        const id = positiveInteger(message.id);
        if (id <= lastRequestId) throw new TypeError("Stale Session Event request correlation");
        lastRequestId = id;
        let request: ServerRequest;
        try { request = decodeServerRequest(message.method, message.params); }
        catch (error) { await response(id, false, failureObject(error)); continue; }
        try {
          if (request.method === "publish") {
            const operation = binding.publish(request.channel, request.type, request.payload);
            await operation.dispatched;
            await operation.result;
            await response(id, true, Object.freeze({}));
          } else if (request.method === "subscribe") {
            if (nextSubscriptionId === Number.MAX_SAFE_INTEGER) throw new Error("Session Event subscription identity exhausted");
            const subscriptionId = nextSubscriptionId++;
            const subscription = await binding.subscribe(request.channels, async (event) => {
              try {
                await send(carrier, { protocol: PROTOCOL, type: "event", subscriptionId, event });
              } catch (error) {
                try { await carrier.close(); } catch {}
                throw error;
              }
            });
            subscriptions.set(subscriptionId, subscription);
            void subscription.closed.then(async ({ reason }) => {
              if (subscriptions.get(subscriptionId) !== subscription) return;
              subscriptions.delete(subscriptionId);
              try { await send(carrier, { protocol: PROTOCOL, type: "terminal", subscriptionId, reason }); }
              catch { try { await carrier.close(); } catch {} }
            });
            await response(id, true, Object.freeze({ subscriptionId }));
          } else {
            if (request.subscriptionId >= nextSubscriptionId) {
              throw new TypeError("Impossible Session Event unsubscribe correlation");
            }
            subscriptions.get(request.subscriptionId)?.close();
            subscriptions.delete(request.subscriptionId);
            await response(id, true, Object.freeze({}));
          }
        } catch (error) {
          if (!isSessionEventFailure(error)) throw error;
          await response(id, false, failureObject(error));
        }
      }
    } catch {
      try { await carrier.close(); } catch {}
    } finally {
      shutdown();
    }
  })();
  void carrier.closed.finally(shutdown).catch(shutdown);
  return Object.freeze({
    closed: closedPromise,
    async close() { shutdown(); await carrier.close(); },
  });
}
