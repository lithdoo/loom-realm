import type { MessageCarrier } from "@loomrealm/foundation";
import type { JsonValue } from "@loomrealm/wire";
import { RealmStateError, isRealmStateFailure, realmStateError } from "./failure.js";
import { receiveRealmStateMessages, sendRealmStateMessage } from "./framing.js";
import {
  RealmStateSubscriptionDelivery,
  type SubscriptionDeactivation,
} from "./subscription-delivery.js";
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
  identityToken,
  snapshotJsonValue,
  validateKeyList,
  validateNamespace,
  validateAndSnapshotValue,
  validateRealmStateKey,
  validateTransaction,
} from "./validation.js";

const PROTOCOL = "loomrealm.realm-state/1";
type PendingRequestState = "active" | "locally-ignored";

interface PendingRequestCorrelation<T = unknown> {
  state: PendingRequestState;
  readonly decodeResult: (value: unknown) => T;
  resolve(value: T): void;
  reject(error: unknown): void;
  disposeAbort?(): void;
}

type SubscriptionCorrelationState =
  | "active"
  | "closing"
  | "terminal-seen"
  | "retired";

interface SubscriptionCorrelation {
  state: SubscriptionCorrelationState;
  readonly id: number;
  readonly keys: readonly RealmStateKey[];
  readonly delivery: RealmStateSubscriptionDelivery;
  baselineSeen: boolean;
  lastRevision: number;
}

const MAX_PENDING_REQUESTS = 1024;

interface CarrierRequestOperation<T> {
  readonly dispatched: Promise<void>;
  readonly result: Promise<T>;
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
  exactObject(value, ["code", "message"], ["path"]);
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

function exactObject(
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = [],
): Record<string, unknown> {
  const result = object(value);
  const allowed = new Set([...required, ...optional]);
  if (
    required.some((key) => !Object.prototype.hasOwnProperty.call(result, key)) ||
    Object.keys(result).some((key) => !allowed.has(key))
  ) {
    throw new TypeError("Invalid Realm State protocol object");
  }
  return result;
}

function decodeCarrierPayload<T>(decode: () => T): T {
  try {
    return decode();
  } catch {
    // Validation helpers intentionally produce author-facing failures for
    // local input. The same invalidity in a peer payload is protocol
    // corruption, never a request-local RealmStateFailure.
    throw new TypeError("Invalid Realm State carrier payload");
  }
}

function decodeSnapshot(value: unknown): RealmStateSnapshot {
  const raw = exactObject(value, ["revision", "records"]);
  const revision = safeInteger(raw.revision, "revision");
  if (!Array.isArray(raw.records)) throw new TypeError("Invalid records");
  const records = raw.records.map((entry) => {
    const item = exactObject(entry, ["key", "value", "version"]);
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
  const raw = exactObject(value, ["records"]);
  if (!Array.isArray(raw.records)) throw new TypeError("Invalid records");
  const records = raw.records.map((entry) => {
    const item = exactObject(entry, ["key", "value"]);
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
  const raw = exactObject(value, ["revision", "records"]);
  const revision = safeInteger(raw.revision, "revision");
  if (!Array.isArray(raw.records)) throw new TypeError("Invalid records");
  const records = raw.records.map((entry) => {
    const item = exactObject(entry, ["key", "version"]);
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

function assertExactIdentities(
  records: readonly { readonly key: RealmStateKey }[],
  expected: readonly RealmStateKey[],
  label: string,
): void {
  if (records.length !== expected.length) {
    throw new TypeError(`Invalid ${label} identity set`);
  }
  const expectedTokens = new Set(expected.map(identityToken));
  if (records.some((record) => !expectedTokens.has(identityToken(record.key)))) {
    throw new TypeError(`Invalid ${label} identity set`);
  }
}

function assertIdentitySubset(
  records: readonly { readonly key: RealmStateKey }[],
  expected: readonly RealmStateKey[],
  label: string,
): void {
  if (records.length === 0) throw new TypeError(`Invalid empty ${label}`);
  const expectedTokens = new Set(expected.map(identityToken));
  if (records.some((record) => !expectedTokens.has(identityToken(record.key)))) {
    throw new TypeError(`Invalid ${label} identity set`);
  }
}

function decodeSnapshotForKeys(
  value: unknown,
  keys: readonly RealmStateKey[],
): RealmStateSnapshot {
  const snapshot = decodeSnapshot(value);
  assertExactIdentities(snapshot.records, keys, "Realm State read response");
  return snapshot;
}

function decodeInitialForKeys(
  value: unknown,
  keys: readonly RealmStateKey[],
): RealmStateInitialSnapshot {
  const snapshot = decodeInitial(value);
  assertExactIdentities(snapshot.records, keys, "Realm State initial response");
  return snapshot;
}

function decodeIndexForNamespace(
  value: unknown,
  namespace: string | undefined,
): RealmStateIndexSnapshot {
  const snapshot = decodeIndex(value);
  if (
    namespace !== undefined &&
    snapshot.records.some((record) => record.key.namespace !== namespace)
  ) {
    throw new TypeError("Invalid Realm State list namespace");
  }
  return snapshot;
}

function decodeSnapshotForNamespace(
  value: unknown,
  namespace: string | undefined,
): RealmStateSnapshot {
  const snapshot = decodeSnapshot(value);
  if (
    namespace !== undefined &&
    snapshot.records.some((record) => record.key.namespace !== namespace)
  ) {
    throw new TypeError("Invalid Realm State scan namespace");
  }
  return snapshot;
}

function decodeCommitForWrites(
  value: unknown,
  transaction: RealmStateTransaction,
): RealmStateCommit {
  const commit = decodeCommit(value);
  assertExactIdentities(
    commit.records,
    transaction.writes.map((write) => write.key),
    "Realm State commit response",
  );
  return commit;
}

function decodeEvent(value: unknown): RealmStateSubscriptionEvent {
  const raw = object(value);
  if (raw.type === "baseline") {
    exactObject(value, ["type", "snapshot"]);
    return Object.freeze({ type: "baseline", snapshot: decodeSnapshot(raw.snapshot) });
  }
  if (raw.type === "change") {
    exactObject(value, ["type", "revision", "records"]);
    const snapshot = decodeSnapshot({ revision: raw.revision, records: raw.records });
    return Object.freeze({ type: "change", revision: snapshot.revision, records: snapshot.records });
  }
  if (
    raw.type === "terminal" &&
    (raw.reason === "binding-terminal" || raw.reason === "overflow" || raw.reason === "authority-terminal")
  ) {
    exactObject(value, ["type", "reason"]);
    return Object.freeze({ type: "terminal", reason: raw.reason });
  }
  throw new TypeError("Invalid Realm State subscription event");
}

export function createRealmStateCarrierBinding(
  carrier: MessageCarrier,
): RealmStatePhysicalBinding {
  let nextId = 1;
  let closed = false;
  const pending = new Map<number, PendingRequestCorrelation>();
  const subscriptions = new Map<number, SubscriptionCorrelation>();
  let settleTerminal!: () => void;
  const terminal = new Promise<void>((resolve) => { settleTerminal = resolve; });

  const failClosed = (cause: unknown) => {
    if (closed) return;
    closed = true;
    settleTerminal();
    for (const request of pending.values()) {
      request.disposeAbort?.();
      if (request.state === "active") request.reject(cause);
    }
    pending.clear();
    for (const subscription of subscriptions.values()) {
      if (subscription.state === "active") {
        subscription.delivery.enqueue(Object.freeze({
          type: "terminal",
          reason: "binding-terminal",
        }));
      }
      subscription.state = "retired";
    }
    subscriptions.clear();
  };

  const request = <T>(
    method: string,
    params: unknown,
    decodeResult: (value: unknown) => T,
    signal?: AbortSignal,
  ): CarrierRequestOperation<T> => {
    const rejectBeforeDispatch = (error: unknown): CarrierRequestOperation<T> => {
      const dispatched = Promise.reject(error);
      const result = Promise.reject<T>(error);
      void dispatched.catch(() => undefined);
      void result.catch(() => undefined);
      return Object.freeze({ dispatched, result });
    };
    if (closed) {
      return rejectBeforeDispatch(unavailableCarrier());
    }
    if (signal?.aborted) {
      return rejectBeforeDispatch(signal.reason);
    }
    if (pending.size >= MAX_PENDING_REQUESTS || nextId === Number.MAX_SAFE_INTEGER) {
      return rejectBeforeDispatch(unavailableCarrier());
    }
    const id = nextId++;
    const text = encode({ protocol: PROTOCOL, type: "request", id, method, params });
    let resolve!: (value: T) => void;
    let reject!: (error: unknown) => void;
    const result = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
    // The binding exposes dispatch and result as independent evidence. Observe
    // the result internally as well so a pre-dispatch rejection cannot become
    // an unhandled rejection while a caller is still awaiting dispatched.
    void result.catch(() => undefined);
    const correlation: PendingRequestCorrelation<T> = {
      state: "active",
      decodeResult,
      resolve,
      reject,
    };
    pending.set(id, correlation as PendingRequestCorrelation);
    const dispatched = sendRealmStateMessage(carrier, text).catch((error) => {
      const current = pending.get(id);
      if (current !== undefined) {
        pending.delete(id);
        current.disposeAbort?.();
        if (current.state === "active") current.reject(error);
      }
      failClosed(error);
      void carrier.close().catch(() => undefined);
      throw error;
    });
    if (signal !== undefined) {
      const onAbort = () => {
        const current = pending.get(id);
        if (current === undefined || current.state !== "active") return;
        current.state = "locally-ignored";
        current.reject(signal.reason);
      };
      signal.addEventListener("abort", onAbort, { once: true });
      correlation.disposeAbort = () => signal.removeEventListener("abort", onAbort);
    }
    return Object.freeze({ dispatched, result });
  };

  const retireSubscription = (subscription: SubscriptionCorrelation): void => {
    if (subscription.state === "retired") return;
    if (subscriptions.get(subscription.id) === subscription) {
      subscriptions.delete(subscription.id);
    }
    subscription.state = "retired";
  };

  const terminalizeForInternalRequest = (error: unknown): void => {
    if (closed) return;
    failClosed(error);
    void carrier.close().catch(() => undefined);
  };

  const beginSubscriptionClose = (
    subscription: SubscriptionCorrelation,
    reason: SubscriptionDeactivation,
  ): void => {
    if (subscription.state !== "active") return;
    subscription.state = "closing";
    if (closed || (reason !== "closed" && reason !== "overflow")) return;
    const operation = request(
      "unsubscribe",
      { subscriptionId: subscription.id },
      (value) => {
        exactObject(value, []);
      },
    );
    void operation.dispatched.catch(terminalizeForInternalRequest);
    void operation.result.then(
      () => retireSubscription(subscription),
      terminalizeForInternalRequest,
    );
  };

  const handleSubscriptionEvent = (
    subscription: SubscriptionCorrelation,
    value: unknown,
  ): void => {
    const event = decodeEvent(value);
    const deliver = subscription.state === "active";
    if (event.type === "baseline") {
      if (subscription.baselineSeen) {
        throw new TypeError("Duplicate Realm State subscription baseline");
      }
      assertExactIdentities(
        event.snapshot.records,
        subscription.keys,
        "Realm State subscription baseline",
      );
      subscription.baselineSeen = true;
      subscription.lastRevision = event.snapshot.revision;
    } else if (event.type === "change") {
      if (!subscription.baselineSeen || event.revision <= subscription.lastRevision) {
        throw new TypeError("Out-of-order Realm State subscription event");
      }
      assertIdentitySubset(
        event.records,
        subscription.keys,
        "Realm State subscription change",
      );
      subscription.lastRevision = event.revision;
    } else {
      subscription.state = "terminal-seen";
      retireSubscription(subscription);
    }
    if (deliver) subscription.delivery.enqueue(event);
  };

  void (async () => {
    try {
      for await (const text of receiveRealmStateMessages(carrier)) {
        const message = parseMessage(text);
        if (message.protocol !== PROTOCOL) throw new TypeError("Wrong Realm State protocol");
        if (message.type === "response") {
          if (message.ok === true) {
            exactObject(message, ["protocol", "type", "id", "ok", "result"]);
          } else if (message.ok === false) {
            exactObject(message, ["protocol", "type", "id", "ok", "failure"]);
          } else {
            throw new TypeError("Invalid Realm State response");
          }
          const id = safeInteger(message.id, "request id");
          const correlation = pending.get(id);
          if (correlation === undefined) {
            throw new TypeError("Impossible Realm State response correlation");
          }

          // A correlation remains active until its complete response, including
          // request-specific semantics, has been decoded. If decoding throws,
          // failClosed() still owns and rejects every in-flight operation.
          const settlement = message.ok === true
            ? {
                ok: true as const,
                value: decodeCarrierPayload(() => correlation.decodeResult(message.result)),
              }
            : { ok: false as const, error: decodeFailure(message.failure) };
          pending.delete(id);
          correlation.disposeAbort?.();
          if (correlation.state === "active") {
            if (settlement.ok) correlation.resolve(settlement.value);
            else correlation.reject(settlement.error);
          }
          continue;
        }
        if (message.type === "event") {
          exactObject(message, ["protocol", "type", "subscriptionId", "event"]);
          const id = safeInteger(message.subscriptionId, "subscription id");
          const subscription = subscriptions.get(id);
          if (subscription === undefined) {
            throw new TypeError("Impossible Realm State subscription correlation");
          }
          decodeCarrierPayload(() => handleSubscriptionEvent(subscription, message.event));
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

  const readRequest = async <T>(
    method: string,
    params: unknown,
    decodeResult: (value: unknown) => T,
    signal?: AbortSignal,
  ): Promise<T> => {
    const operation = request(method, params, decodeResult, signal);
    try {
      await operation.dispatched;
    } catch (error) {
      void operation.result.catch(() => undefined);
      throw error;
    }
    return operation.result;
  };

  const binding: RealmStatePhysicalBinding = {
    read(keys, options) {
      const validated = validateKeyList(keys, REALM_STATE_LIMITS.readKeys);
      return readRequest(
        "read",
        { keys: validated },
        (value) => decodeSnapshotForKeys(value, validated),
        options?.signal,
      );
    },
    readInitial(keys, options) {
      const validated = validateKeyList(keys, REALM_STATE_LIMITS.readKeys);
      return readRequest(
        "readInitial",
        { keys: validated },
        (value) => decodeInitialForKeys(value, validated),
        options?.signal,
      );
    },
    list(options) {
      const namespace = options?.namespace === undefined ? undefined : validateNamespace(options.namespace);
      return readRequest(
        "list",
        { ...(namespace === undefined ? {} : { namespace }) },
        (value) => decodeIndexForNamespace(value, namespace),
        options?.signal,
      );
    },
    scan(options) {
      const namespace = options?.namespace === undefined ? undefined : validateNamespace(options.namespace);
      return readRequest(
        "scan",
        { ...(namespace === undefined ? {} : { namespace }) },
        (value) => decodeSnapshotForNamespace(value, namespace),
        options?.signal,
      );
    },
    commit(transaction) {
      const validated = validateTransaction(transaction);
      const operation = request(
        "commit",
        { transaction: validated },
        (value) => decodeCommitForWrites(value, validated),
      );
      return Object.freeze({
        dispatched: operation.dispatched,
        result: operation.result,
      });
    },
    async subscribe(keys, listener) {
      if (typeof listener !== "function") throw realmStateError("INVALID_REQUEST", "Invalid listener");
      const validated = validateKeyList(keys, REALM_STATE_LIMITS.subscribeKeys);
      const operation = request(
        "subscribe",
        { keys: validated },
        (value): RealmStateSubscription => {
          const decoded = exactObject(value, ["subscriptionId"]);
          const id = safeInteger(decoded.subscriptionId, "subscription id");
          if (id === 0 || subscriptions.has(id)) {
            throw new TypeError("Invalid Realm State subscription correlation");
          }
          let entry!: SubscriptionCorrelation;
          const delivery = new RealmStateSubscriptionDelivery(
            listener,
            (reason) => beginSubscriptionClose(entry, reason),
          );
          entry = {
            state: "active",
            id,
            keys: validated,
            delivery,
            baselineSeen: false,
            lastRevision: -1,
          };
          subscriptions.set(id, entry);
          return delivery;
        },
      );
      try {
        await operation.dispatched;
      } catch (error) {
        void operation.result.catch(() => undefined);
        throw error;
      }
      return operation.result;
    },
    terminal,
    async close() {
      failClosed(unavailableCarrier());
      await carrier.close();
    },
  };
  return Object.freeze(binding);
}

function unavailableCarrier(): RealmStateError {
  return realmStateError("BINDING_UNAVAILABLE", "Realm State carrier is closed");
}

function failureObject(error: unknown): Readonly<Record<string, unknown>> {
  if (!isRealmStateFailure(error)) {
    throw new TypeError("Cannot encode an unknown Realm State failure");
  }
  return Object.freeze({
    code: error.code,
    message: error.message,
    ...(error.path === undefined ? {} : { path: error.path }),
  });
}

type DecodedServerRequest =
  | { readonly method: "read" | "readInitial"; readonly keys: readonly RealmStateKey[] }
  | { readonly method: "list" | "scan"; readonly namespace?: string }
  | { readonly method: "commit"; readonly transaction: RealmStateTransaction }
  | { readonly method: "subscribe"; readonly keys: readonly RealmStateKey[] }
  | { readonly method: "unsubscribe"; readonly subscriptionId: number };

function decodeServerRequest(method: unknown, value: unknown): DecodedServerRequest {
  try {
    switch (method) {
      case "read":
      case "readInitial": {
        const params = exactObject(value, ["keys"]);
        return Object.freeze({
          method,
          keys: validateKeyList(params.keys, REALM_STATE_LIMITS.readKeys),
        });
      }
      case "list":
      case "scan": {
        const params = exactObject(value, [], ["namespace"]);
        const namespace = params.namespace === undefined
          ? undefined
          : validateNamespace(params.namespace);
        return Object.freeze({
          method,
          ...(namespace === undefined ? {} : { namespace }),
        });
      }
      case "commit": {
        const params = exactObject(value, ["transaction"]);
        return Object.freeze({
          method,
          transaction: validateTransaction(params.transaction),
        });
      }
      case "subscribe": {
        const params = exactObject(value, ["keys"]);
        return Object.freeze({
          method,
          keys: validateKeyList(params.keys, REALM_STATE_LIMITS.subscribeKeys),
        });
      }
      case "unsubscribe": {
        const params = exactObject(value, ["subscriptionId"]);
        return Object.freeze({
          method,
          subscriptionId: safeInteger(params.subscriptionId, "subscription id"),
        });
      }
      default:
        throw realmStateError("INVALID_REQUEST", "Unknown Realm State method", ["method"]);
    }
  } catch (error) {
    if (isRealmStateFailure(error)) throw error;
    throw realmStateError("INVALID_REQUEST", "Invalid Realm State request");
  }
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
        if (
          message.protocol !== PROTOCOL ||
          message.type !== "request" ||
          Object.keys(message).length !== 5 ||
          !Object.prototype.hasOwnProperty.call(message, "id") ||
          !Object.prototype.hasOwnProperty.call(message, "method") ||
          !Object.prototype.hasOwnProperty.call(message, "params")
        ) {
          throw new TypeError("Invalid Realm State request");
        }
        const id = safeInteger(message.id, "request id");
        let request: DecodedServerRequest;
        try {
          request = decodeServerRequest(message.method, message.params);
        } catch (error) {
          await sendResponse(id, false, failureObject(error));
          continue;
        }
        let result: unknown;
        try {
          switch (request.method) {
            case "read":
              result = await authority.read(request.keys);
              break;
            case "readInitial":
              result = await authority.readInitial(request.keys);
              break;
            case "list":
              result = await authority.list(
                request.namespace === undefined ? undefined : { namespace: request.namespace },
              );
              break;
            case "scan":
              result = await authority.scan(
                request.namespace === undefined ? undefined : { namespace: request.namespace },
              );
              break;
            case "commit":
              result = await authority.commit(request.transaction);
              break;
            case "subscribe": {
              if (nextSubscriptionId === Number.MAX_SAFE_INTEGER) {
                throw new Error("Realm State subscription identity exhausted");
              }
              const subscriptionId = nextSubscriptionId++;
              const subscription = await authority.subscribe(
                request.keys,
                (event) => {
                  if (closed) return;
                  const sent = sendRealmStateMessage(carrier, encode({
                    protocol: PROTOCOL,
                    type: "event",
                    subscriptionId,
                    event,
                  }));
                  return sent.then(
                    () => {
                      if (event.type === "terminal") subscriptions.delete(subscriptionId);
                    },
                    async (error) => {
                      try { await carrier.close(); } catch {}
                      throw error;
                    },
                  );
                },
              );
              subscriptions.set(subscriptionId, subscription);
              result = Object.freeze({ subscriptionId });
              break;
            }
            case "unsubscribe": {
              subscriptions.get(request.subscriptionId)?.close();
              subscriptions.delete(request.subscriptionId);
              result = Object.freeze({});
              break;
            }
          }
        } catch (error) {
          if (!isRealmStateFailure(error)) throw error;
          await sendResponse(id, false, failureObject(error));
          continue;
        }
        await sendResponse(id, true, result);
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
