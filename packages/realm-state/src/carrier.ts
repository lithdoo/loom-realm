import type { MessageCarrier } from "@loomrealm/foundation";
import type { JsonValue } from "@loomrealm/wire";
import { RealmStateError, isRealmStateFailure, realmStateError } from "./failure.js";
import { receiveRealmStateMessages, sendRealmStateMessage } from "./framing.js";
import type {
  RealmStateClient,
  RealmStateCommit,
  RealmStateIndexSnapshot,
  RealmStateInitialSnapshot,
  RealmStateKey,
  RealmStatePhysicalBinding,
  RealmStateSnapshot,
  RealmStateSubscription,
  RealmStateSubscriptionEvent,
  RealmStateTransaction,
} from "./model.js";
import {
  REALM_STATE_LIMITS,
  compareRealmStateKeys,
  snapshotJsonValue,
  validateKeyList,
  validateNamespace,
  validateAndSnapshotValue,
  validateRealmStateKey,
  validateTransaction,
  subscriptionRecordPayloadBytes,
} from "./validation.js";

const PROTOCOL = "loomrealm.realm-state/1";
interface PendingRequest {
  resolve(value: unknown): void;
  reject(error: unknown): void;
}

interface ClientSubscription {
  active: boolean;
  readonly listener: (event: RealmStateSubscriptionEvent) => void;
  readonly queue: RealmStateSubscriptionEvent[];
  delivering: boolean;
  pendingChanges: number;
  pendingBytes: number;
  terminalQueued: boolean;
}

function parseMessage(text: string): Record<string, unknown> {
  if (typeof text !== "string") {
    throw new TypeError("Invalid Realm State carrier message");
  }
  const value = JSON.parse(text) as unknown;
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Invalid Realm State carrier message");
  }
  return value as Record<string, unknown>;
}

function encode(value: unknown): string {
  const text = JSON.stringify(value);
  if (text === undefined) throw new TypeError("Invalid Realm State carrier message");
  return text;
}

function decodeFailure(value: unknown): RealmStateError {
  if (!isRealmStateFailure(value)) throw new TypeError("Invalid Realm State failure");
  return new RealmStateError(value.code, value.message, value.path);
}

function safeInteger(value: unknown, name: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new TypeError(`Invalid ${name}`);
  }
  return value as number;
}

function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Invalid Realm State response");
  }
  return value as Record<string, unknown>;
}

function decodeSnapshot(value: unknown): RealmStateSnapshot {
  const raw = object(value);
  const revision = safeInteger(raw.revision, "revision");
  if (!Array.isArray(raw.records)) throw new TypeError("Invalid records");
  const records = raw.records.map((entry) => {
    const item = object(entry);
    const key = validateRealmStateKey(item.key);
    const version = safeInteger(item.version, "version");
    const detached = validateAndSnapshotValue(item.value).value;
    return Object.freeze({ key, value: detached, version });
  });
  for (let index = 1; index < records.length; index += 1) {
    if (compareRealmStateKeys(records[index - 1]!.key, records[index]!.key) >= 0) {
      throw new TypeError("Non-canonical Realm State response");
    }
  }
  return Object.freeze({ revision, records: Object.freeze(records) });
}

function decodeInitial(value: unknown): RealmStateInitialSnapshot {
  const raw = object(value);
  if (!Array.isArray(raw.records)) throw new TypeError("Invalid records");
  const records = raw.records.map((entry) => {
    const item = object(entry);
    const key = validateRealmStateKey(item.key);
    const detached = validateAndSnapshotValue(item.value).value;
    return Object.freeze({ key, value: detached });
  });
  for (let index = 1; index < records.length; index += 1) {
    if (compareRealmStateKeys(records[index - 1]!.key, records[index]!.key) >= 0) {
      throw new TypeError("Non-canonical Realm State response");
    }
  }
  return Object.freeze({ records: Object.freeze(records) });
}

function decodeIndex(value: unknown): RealmStateIndexSnapshot {
  const raw = object(value);
  const revision = safeInteger(raw.revision, "revision");
  if (!Array.isArray(raw.records)) throw new TypeError("Invalid records");
  const records = raw.records.map((entry) => {
    const item = object(entry);
    return Object.freeze({
      key: validateRealmStateKey(item.key),
      version: safeInteger(item.version, "version"),
    });
  });
  for (let index = 1; index < records.length; index += 1) {
    if (compareRealmStateKeys(records[index - 1]!.key, records[index]!.key) >= 0) {
      throw new TypeError("Non-canonical Realm State response");
    }
  }
  return Object.freeze({ revision, records: Object.freeze(records) });
}

function decodeCommit(value: unknown): RealmStateCommit {
  const raw = decodeIndex(value);
  return Object.freeze({ revision: raw.revision, records: raw.records });
}

function decodeEvent(value: unknown): RealmStateSubscriptionEvent {
  const raw = object(value);
  if (raw.type === "baseline") {
    return Object.freeze({ type: "baseline", snapshot: decodeSnapshot(raw.snapshot) });
  }
  if (raw.type === "change") {
    const snapshot = decodeSnapshot({ revision: raw.revision, records: raw.records });
    return Object.freeze({ type: "change", revision: snapshot.revision, records: snapshot.records });
  }
  if (
    raw.type === "terminal" &&
    (raw.reason === "binding-terminal" || raw.reason === "overflow" || raw.reason === "authority-terminal")
  ) {
    return Object.freeze({ type: "terminal", reason: raw.reason });
  }
  throw new TypeError("Invalid Realm State subscription event");
}

export function createRealmStateCarrierBinding(
  carrier: MessageCarrier,
): RealmStatePhysicalBinding {
  let nextId = 1;
  let closed = false;
  const pending = new Map<number, PendingRequest>();
  const subscriptions = new Map<number, ClientSubscription>();
  const earlyEvents = new Map<number, RealmStateSubscriptionEvent[]>();

  const drainEvents = async (id: number, subscription: ClientSubscription) => {
    if (subscription.delivering || !subscription.active) return;
    subscription.delivering = true;
    try {
      while (subscription.active) {
        const event = subscription.queue.shift();
        if (event === undefined) break;
        if (event.type === "change") {
          subscription.pendingChanges -= 1;
          subscription.pendingBytes -= event.records.reduce((total, record) => total + subscriptionRecordPayloadBytes(record), 0);
        }
        try {
          const returned = subscription.listener(event) as unknown;
          if (returned !== null && (typeof returned === "object" || typeof returned === "function") && typeof (returned as { then?: unknown }).then === "function") {
            await Promise.resolve(returned).catch(() => undefined);
          }
        } catch {}
        if (event.type === "terminal") {
          subscription.active = false;
          subscriptions.delete(id);
        }
      }
    } finally {
      subscription.delivering = false;
      if (subscription.active && subscription.queue.length > 0) void drainEvents(id, subscription);
    }
  };
  const deliverEvent = (id: number, subscription: ClientSubscription, event: RealmStateSubscriptionEvent) => {
    if (!subscription.active || subscription.terminalQueued) return;
    if (event.type === "change") {
      const bytes = event.records.reduce((total, record) => total + subscriptionRecordPayloadBytes(record), 0);
      if (
        subscription.pendingChanges + 1 > REALM_STATE_LIMITS.subscriptionPendingEvents ||
        subscription.pendingBytes + bytes > REALM_STATE_LIMITS.subscriptionPendingPayloadBytes
      ) {
        for (let index = subscription.queue.length - 1; index >= 0; index -= 1) {
          if (subscription.queue[index]?.type === "change") subscription.queue.splice(index, 1);
        }
        subscription.pendingChanges = 0;
        subscription.pendingBytes = 0;
        subscription.terminalQueued = true;
        subscription.queue.push(Object.freeze({ type: "terminal", reason: "overflow" }));
        void drainEvents(id, subscription);
        return;
      }
      subscription.pendingChanges += 1;
      subscription.pendingBytes += bytes;
    } else if (event.type === "terminal") {
      subscription.terminalQueued = true;
    }
    subscription.queue.push(event);
    void drainEvents(id, subscription);
  };

  const failClosed = (cause: unknown) => {
    if (closed) return;
    closed = true;
    for (const request of pending.values()) request.reject(cause);
    pending.clear();
    for (const subscription of subscriptions.values()) {
      if (!subscription.active) continue;
      deliverEvent(-1, subscription, Object.freeze({ type: "terminal", reason: "binding-terminal" }));
    }
    subscriptions.clear();
    earlyEvents.clear();
  };

  void (async () => {
    try {
      for await (const text of receiveRealmStateMessages(carrier)) {
        const message = parseMessage(text);
        if (message.protocol !== PROTOCOL) throw new TypeError("Wrong Realm State protocol");
        if (message.type === "response") {
          const id = safeInteger(message.id, "request id");
          const request = pending.get(id);
          if (request === undefined) continue;
          pending.delete(id);
          if (message.ok === true) request.resolve(message.result);
          else if (message.ok === false) request.reject(decodeFailure(message.failure));
          else throw new TypeError("Invalid Realm State response");
          continue;
        }
        if (message.type === "event") {
          const id = safeInteger(message.subscriptionId, "subscription id");
          const subscription = subscriptions.get(id);
          const event = decodeEvent(message.event);
          if (subscription === undefined) {
            const buffered = earlyEvents.get(id) ?? [];
            buffered.push(event);
            earlyEvents.set(id, buffered);
          } else {
            deliverEvent(id, subscription, event);
          }
          continue;
        }
        throw new TypeError("Invalid Realm State carrier message type");
      }
    } catch (error) {
      failClosed(error);
      try { await carrier.close(); } catch {}
    }
  })();
  void carrier.closed.then(
    (fact) => failClosed(fact),
    (cause) => failClosed(cause),
  );

  const request = (
    method: string,
    params: unknown,
    signal?: AbortSignal,
  ): { readonly dispatched: Promise<void>; readonly result: Promise<unknown> } => {
    if (closed) {
      const error = unavailableCarrier();
      return Object.freeze({ dispatched: Promise.reject(error), result: Promise.reject(error) });
    }
    if (signal?.aborted) {
      return Object.freeze({ dispatched: Promise.reject(signal.reason), result: Promise.reject(signal.reason) });
    }
    const id = nextId++;
    const text = encode({ protocol: PROTOCOL, type: "request", id, method, params });
    let resolve!: (value: unknown) => void;
    let reject!: (error: unknown) => void;
    const result = new Promise<unknown>((res, rej) => { resolve = res; reject = rej; });
    pending.set(id, { resolve, reject });
    const dispatched = sendRealmStateMessage(carrier, text).catch((error) => {
      const current = pending.get(id);
      if (current !== undefined) {
        pending.delete(id);
        current.reject(error);
      }
      throw error;
    });
    if (signal !== undefined) {
      const onAbort = () => {
        const current = pending.get(id);
        if (current === undefined) return;
        pending.delete(id);
        current.reject(signal.reason);
      };
      signal.addEventListener("abort", onAbort, { once: true });
      void result.finally(() => signal.removeEventListener("abort", onAbort)).catch(() => undefined);
    }
    return Object.freeze({ dispatched, result });
  };

  const readRequest = async <T>(method: string, params: unknown, decodeResult: (value: unknown) => T, signal?: AbortSignal): Promise<T> => {
    const operation = request(method, params, signal);
    await operation.dispatched;
    return decodeResult(await operation.result);
  };

  const binding: RealmStatePhysicalBinding = {
    read(keys, options) {
      const validated = validateKeyList(keys, REALM_STATE_LIMITS.readKeys);
      return readRequest("read", { keys: validated }, decodeSnapshot, options?.signal);
    },
    readInitial(keys, options) {
      const validated = validateKeyList(keys, REALM_STATE_LIMITS.readKeys);
      return readRequest("readInitial", { keys: validated }, decodeInitial, options?.signal);
    },
    list(options) {
      const namespace = options?.namespace === undefined ? undefined : validateNamespace(options.namespace);
      return readRequest("list", { ...(namespace === undefined ? {} : { namespace }) }, decodeIndex, options?.signal);
    },
    scan(options) {
      const namespace = options?.namespace === undefined ? undefined : validateNamespace(options.namespace);
      return readRequest("scan", { ...(namespace === undefined ? {} : { namespace }) }, decodeSnapshot, options?.signal);
    },
    commit(transaction) {
      const validated = validateTransaction(transaction);
      const operation = request("commit", { transaction: validated });
      return Object.freeze({
        dispatched: operation.dispatched,
        result: operation.result.then(decodeCommit),
      });
    },
    async subscribe(keys, listener) {
      if (typeof listener !== "function") throw realmStateError("INVALID_REQUEST", "Invalid listener");
      const validated = validateKeyList(keys, REALM_STATE_LIMITS.subscribeKeys);
      const operation = request("subscribe", { keys: validated });
      await operation.dispatched;
      const response = object(await operation.result);
      const id = safeInteger(response.subscriptionId, "subscription id");
      const entry: ClientSubscription = {
        active: true,
        listener,
        queue: [],
        delivering: false,
        pendingChanges: 0,
        pendingBytes: 0,
        terminalQueued: false,
      };
      subscriptions.set(id, entry);
      const buffered = earlyEvents.get(id);
      earlyEvents.delete(id);
      if (buffered !== undefined) {
        for (const event of buffered) deliverEvent(id, entry, event);
      }
      const handle: RealmStateSubscription = Object.freeze({
        close() {
          if (!entry.active) return;
          entry.active = false;
          entry.queue.length = 0;
          subscriptions.delete(id);
          const close = request("unsubscribe", { subscriptionId: id });
          void close.dispatched.catch(() => undefined);
          void close.result.catch(() => undefined);
        },
      });
      return handle;
    },
    terminal: carrier.closed.then(() => undefined, () => undefined),
    close() { return carrier.close(); },
  };
  return Object.freeze(binding);
}

function unavailableCarrier(): RealmStateError {
  return realmStateError("BINDING_UNAVAILABLE", "Realm State carrier is closed");
}

function failureObject(error: unknown): Readonly<Record<string, unknown>> {
  if (isRealmStateFailure(error)) {
    return Object.freeze({
      code: error.code,
      message: error.message,
      ...(error.path === undefined ? {} : { path: error.path }),
    });
  }
  return Object.freeze({ code: "TERMINAL", message: "Realm State carrier request failed" });
}

export interface RealmStateCarrierServer {
  readonly closed: Promise<void>;
  close(): Promise<void>;
}

export function serveRealmStateCarrier(
  authority: RealmStateClient,
  carrier: MessageCarrier,
): RealmStateCarrierServer {
  let nextSubscriptionId = 1;
  let closed = false;
  const subscriptions = new Map<number, RealmStateSubscription>();
  let settle!: () => void;
  const closedPromise = new Promise<void>((resolve) => { settle = resolve; });
  const sendResponse = (id: number, ok: boolean, body: unknown) =>
    sendRealmStateMessage(carrier, encode({
      protocol: PROTOCOL,
      type: "response",
      id,
      ok,
      ...(ok ? { result: body } : { failure: body }),
    }));
  const shutdown = () => {
    if (closed) return;
    closed = true;
    for (const subscription of subscriptions.values()) subscription.close();
    subscriptions.clear();
    settle();
  };
  void (async () => {
    try {
      for await (const text of receiveRealmStateMessages(carrier)) {
        const message = parseMessage(text);
        if (message.protocol !== PROTOCOL || message.type !== "request") {
          throw new TypeError("Invalid Realm State request");
        }
        const id = safeInteger(message.id, "request id");
        const method = message.method;
        const params = object(message.params);
        try {
          let result: unknown;
          switch (method) {
            case "read":
              result = await authority.read(params.keys as readonly RealmStateKey[]);
              break;
            case "readInitial":
              result = await authority.readInitial(params.keys as readonly RealmStateKey[]);
              break;
            case "list":
              result = await authority.list(params.namespace === undefined ? undefined : { namespace: params.namespace as string });
              break;
            case "scan":
              result = await authority.scan(params.namespace === undefined ? undefined : { namespace: params.namespace as string });
              break;
            case "commit":
              result = await authority.commit(params.transaction as RealmStateTransaction);
              break;
            case "subscribe": {
              const subscriptionId = nextSubscriptionId++;
              const subscription = await authority.subscribe(
                params.keys as readonly RealmStateKey[],
                (event) => {
                  if (closed) return;
                  void sendRealmStateMessage(carrier, encode({ protocol: PROTOCOL, type: "event", subscriptionId, event })).catch(() => {
                    void carrier.close().catch(() => undefined);
                  });
                  if (event.type === "terminal") subscriptions.delete(subscriptionId);
                },
              );
              subscriptions.set(subscriptionId, subscription);
              result = Object.freeze({ subscriptionId });
              break;
            }
            case "unsubscribe": {
              const subscriptionId = safeInteger(params.subscriptionId, "subscription id");
              subscriptions.get(subscriptionId)?.close();
              subscriptions.delete(subscriptionId);
              result = Object.freeze({});
              break;
            }
            default:
              throw realmStateError("INVALID_REQUEST", "Unknown Realm State method");
          }
          await sendResponse(id, true, result);
        } catch (error) {
          await sendResponse(id, false, failureObject(error));
        }
      }
    } catch {
      try { await carrier.close(); } catch {}
    } finally {
      shutdown();
    }
  })();
  void carrier.closed.finally(shutdown).catch(() => shutdown());
  return Object.freeze({
    closed: closedPromise,
    async close() {
      shutdown();
      await carrier.close();
    },
  });
}
