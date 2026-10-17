import type { JsonValue } from "@loomrealm/wire";
import { sharedStateError } from "./failure.js";
import type {
  PreparedSharedStateDefinition,
  SharedStateClient,
  SharedStateCommit,
  SharedStateIndexRecord,
  SharedStateIndexSnapshot,
  SharedStateInitialRecord,
  SharedStateInitialSnapshot,
  SharedStateKey,
  SharedStatePhysicalBinding,
  SharedStateRecord,
  SharedStateSnapshot,
  SharedStateSubscription,
  SharedStateSubscriptionEvent,
  SharedStateTransaction,
} from "./model.js";
import {
  SHARED_STATE_LIMITS,
  compareSharedStateKeys,
  identityToken,
  prepareSharedStateDefinition,
  snapshotJsonValue,
  validateKeyList,
  validateNamespace,
  validateTransaction,
} from "./validation.js";
import { SharedStateSubscriptionDelivery } from "./subscription-delivery.js";

interface StoredRecord {
  readonly key: SharedStateKey;
  readonly initialValue: JsonValue;
  currentValue: JsonValue;
  version: number;
}

export interface SharedStateAuthorityFatalFact {
  readonly code: "SHARED_STATE_AUTHORITY_FATAL";
  readonly cause?: unknown;
}

export interface SharedStateAuthorityOptions {
  readonly onFatal?: (fact: SharedStateAuthorityFatalFact) => void;
}

interface AuthorityTestingSeed {
  readonly revision?: number;
  readonly versions?: ReadonlyMap<string, number>;
}

function frozenKey(key: SharedStateKey): SharedStateKey {
  return Object.freeze({ namespace: key.namespace, key: key.key });
}

function recordSnapshot(record: StoredRecord | undefined, key: SharedStateKey): SharedStateRecord {
  return Object.freeze({
    key: frozenKey(key),
    value: record?.currentValue ?? null,
    version: record?.version ?? 0,
  });
}

function initialSnapshot(record: StoredRecord | undefined, key: SharedStateKey): SharedStateInitialRecord {
  return Object.freeze({ key: frozenKey(key), value: record?.initialValue ?? null });
}

function indexSnapshot(record: StoredRecord): SharedStateIndexRecord {
  return Object.freeze({ key: frozenKey(record.key), version: record.version });
}

class AuthoritySubscription extends SharedStateSubscriptionDelivery {
  constructor(
    readonly tokens: ReadonlySet<string>,
    baseline: SharedStateSnapshot,
    listener: (event: SharedStateSubscriptionEvent) => void,
    onClose: () => void,
  ) {
    super(listener, onClose);
    this.enqueue(Object.freeze({ type: "baseline", snapshot: baseline }));
  }
}

export class SharedStateAuthority implements SharedStateClient {
  private readonly records = new Map<string, StoredRecord>();
  private readonly subscriptions = new Set<AuthoritySubscription>();
  private readonly onFatal?: (fact: SharedStateAuthorityFatalFact) => void;
  private revisionValue = 0;
  private terminalValue = false;
  private readyValue = false;
  private settleTerminated!: () => void;
  readonly terminated: Promise<void>;

  constructor(
    prepared: PreparedSharedStateDefinition,
    options: SharedStateAuthorityOptions = {},
    testingSeed: AuthorityTestingSeed = {},
  ) {
    this.terminated = new Promise<void>((resolve) => { this.settleTerminated = resolve; });
    if (options.onFatal !== undefined && typeof options.onFatal !== "function") {
      throw new TypeError("Invalid Shared State fatal sink");
    }
    const trusted = prepareSharedStateDefinition(
      prepared?.records?.map((record) => ({
        namespace: record?.key?.namespace,
        key: record?.key?.key,
        value: record?.value,
      })),
    );
    for (const initial of trusted.records) {
      const token = identityToken(initial.key);
      const seededVersion = testingSeed.versions?.get(token) ?? 0;
      if (!Number.isSafeInteger(seededVersion) || seededVersion < 0) {
        throw new TypeError("Invalid testing Record version seed");
      }
      this.records.set(token, {
        key: initial.key,
        initialValue: initial.value,
        currentValue: initial.value,
        version: seededVersion,
      });
    }
    const seededRevision = testingSeed.revision ?? 0;
    if (!Number.isSafeInteger(seededRevision) || seededRevision < 0) {
      throw new TypeError("Invalid testing revision seed");
    }
    this.revisionValue = seededRevision;
    this.onFatal = options.onFatal;
    this.readyValue = true;
  }

  get revision(): number {
    return this.revisionValue;
  }

  get ready(): boolean {
    return this.readyValue && !this.terminalValue;
  }

  get terminal(): boolean {
    return this.terminalValue;
  }

  async read(
    rawKeys: readonly SharedStateKey[],
    options?: { readonly signal?: AbortSignal },
  ): Promise<SharedStateSnapshot> {
    this.assertLive();
    this.assertSignal(options?.signal);
    const keys = validateKeyList(rawKeys, SHARED_STATE_LIMITS.readKeys);
    const records = keys
      .map((key) => recordSnapshot(this.records.get(identityToken(key)), key))
      .sort((left, right) => compareSharedStateKeys(left.key, right.key));
    return Object.freeze({ revision: this.revisionValue, records: Object.freeze(records) });
  }

  async readInitial(
    rawKeys: readonly SharedStateKey[],
    options?: { readonly signal?: AbortSignal },
  ): Promise<SharedStateInitialSnapshot> {
    this.assertLive();
    this.assertSignal(options?.signal);
    const keys = validateKeyList(rawKeys, SHARED_STATE_LIMITS.readKeys);
    const records = keys
      .map((key) => initialSnapshot(this.records.get(identityToken(key)), key))
      .sort((left, right) => compareSharedStateKeys(left.key, right.key));
    return Object.freeze({ records: Object.freeze(records) });
  }

  async list(options?: {
    readonly namespace?: string;
    readonly signal?: AbortSignal;
  }): Promise<SharedStateIndexSnapshot> {
    this.assertLive();
    this.assertSignal(options?.signal);
    const namespace = options?.namespace === undefined
      ? undefined
      : validateNamespace(options.namespace, ["namespace"]);
    const records = [...this.records.values()]
      .filter((record) => namespace === undefined || record.key.namespace === namespace)
      .sort((left, right) => compareSharedStateKeys(left.key, right.key))
      .map(indexSnapshot);
    return Object.freeze({ revision: this.revisionValue, records: Object.freeze(records) });
  }

  async scan(options?: {
    readonly namespace?: string;
    readonly signal?: AbortSignal;
  }): Promise<SharedStateSnapshot> {
    this.assertLive();
    this.assertSignal(options?.signal);
    const namespace = options?.namespace === undefined
      ? undefined
      : validateNamespace(options.namespace, ["namespace"]);
    const records = [...this.records.values()]
      .filter((record) => namespace === undefined || record.key.namespace === namespace)
      .sort((left, right) => compareSharedStateKeys(left.key, right.key))
      .map((record) => recordSnapshot(record, record.key));
    return Object.freeze({ revision: this.revisionValue, records: Object.freeze(records) });
  }

  async commit(raw: SharedStateTransaction): Promise<SharedStateCommit> {
    this.assertLive();
    const transaction = validateTransaction(raw);
    for (const condition of transaction.conditions) {
      const version = this.records.get(identityToken(condition.key))?.version ?? 0;
      if (version !== condition.version) {
        throw sharedStateError("CONFLICT", "Shared State condition is stale");
      }
    }
    if (this.revisionValue === Number.MAX_SAFE_INTEGER) {
      throw sharedStateError("LIMIT_EXCEEDED", "Shared State revision exhausted");
    }
    let newRecords = 0;
    for (const write of transaction.writes) {
      const existing = this.records.get(identityToken(write.key));
      if (existing === undefined) newRecords += 1;
      else if (existing.version === Number.MAX_SAFE_INTEGER) {
        throw sharedStateError("LIMIT_EXCEEDED", "Shared State Record version exhausted");
      }
    }
    if (this.records.size + newRecords > SHARED_STATE_LIMITS.materializedRecords) {
      throw sharedStateError("LIMIT_EXCEEDED", "Shared State materialized Record limit exceeded");
    }

    const revision = this.revisionValue + 1;
    const changed: SharedStateRecord[] = [];
    for (const write of transaction.writes) {
      const token = identityToken(write.key);
      let stored = this.records.get(token);
      if (stored === undefined) {
        stored = {
          key: write.key,
          initialValue: null,
          currentValue: write.value,
          version: 1,
        };
        this.records.set(token, stored);
      } else {
        stored.currentValue = write.value;
        stored.version += 1;
      }
      changed.push(recordSnapshot(stored, stored.key));
    }
    this.revisionValue = revision;
    changed.sort((left, right) => compareSharedStateKeys(left.key, right.key));
    const frozenChanged = Object.freeze(changed);
    for (const subscription of this.subscriptions) {
      const relevant = frozenChanged.filter((record) => subscription.tokens.has(identityToken(record.key)));
      if (relevant.length > 0) {
        subscription.enqueue(Object.freeze({
          type: "change",
          revision,
          records: Object.freeze(relevant),
        }));
      }
    }
    const records = frozenChanged.map(({ key, version }) => Object.freeze({ key, version }));
    return Object.freeze({ revision, records: Object.freeze(records) });
  }

  async subscribe(
    rawKeys: readonly SharedStateKey[],
    listener: (event: SharedStateSubscriptionEvent) => void,
  ): Promise<SharedStateSubscription> {
    this.assertLive();
    if (typeof listener !== "function") {
      throw sharedStateError("INVALID_REQUEST", "Subscription listener must be a function", ["listener"]);
    }
    const keys = validateKeyList(rawKeys, SHARED_STATE_LIMITS.subscribeKeys);
    const baselineRecords = keys
      .map((key) => recordSnapshot(this.records.get(identityToken(key)), key))
      .sort((left, right) => compareSharedStateKeys(left.key, right.key));
    const baseline = Object.freeze({
      revision: this.revisionValue,
      records: Object.freeze(baselineRecords),
    });
    let subscription!: AuthoritySubscription;
    subscription = new AuthoritySubscription(
      new Set(keys.map(identityToken)),
      baseline,
      listener,
      () => this.subscriptions.delete(subscription),
    );
    this.subscriptions.add(subscription);
    return subscription;
  }

  terminate(): void {
    this.selfTerminal(true);
  }

  reportFatal(cause?: unknown): void {
    if (!this.selfTerminal(true)) return;
    const fact = Object.freeze({
      code: "SHARED_STATE_AUTHORITY_FATAL" as const,
      ...(cause === undefined ? {} : { cause }),
    });
    try {
      this.onFatal?.(fact);
    } catch {
      // The authority is already inert; reporting sink failure cannot revive it.
    }
  }

  private selfTerminal(notifySubscriptions: boolean): boolean {
    if (this.terminalValue) return false;
    this.terminalValue = true;
    this.readyValue = false;
    this.settleTerminated();
    if (notifySubscriptions) {
      for (const subscription of [...this.subscriptions]) {
        subscription.enqueue(Object.freeze({ type: "terminal", reason: "authority-terminal" }));
      }
    } else {
      for (const subscription of [...this.subscriptions]) subscription.close();
    }
    return true;
  }

  private assertLive(): void {
    if (this.terminalValue || !this.readyValue) {
      throw sharedStateError("TERMINAL", "Shared State Authority is terminal");
    }
  }

  private assertSignal(signal: AbortSignal | undefined): void {
    if (signal?.aborted) throw signal.reason;
  }
}

export function createSharedStateAuthority(
  prepared: PreparedSharedStateDefinition,
  options: SharedStateAuthorityOptions = {},
): SharedStateAuthority {
  return new SharedStateAuthority(prepared, options);
}

export function createInMemorySharedStateBinding(
  authority: SharedStateAuthority,
): SharedStatePhysicalBinding {
  let closed = false;
  let settle!: () => void;
  const locallyTerminal = new Promise<void>((resolve) => { settle = resolve; });
  const assertOpen = () => {
    if (closed) throw sharedStateError("BINDING_UNAVAILABLE", "Shared State binding is closed");
  };
  const binding: SharedStatePhysicalBinding = {
    read(keys, options) { assertOpen(); return authority.read(keys, options); },
    readInitial(keys, options) { assertOpen(); return authority.readInitial(keys, options); },
    list(options) { assertOpen(); return authority.list(options); },
    scan(options) { assertOpen(); return authority.scan(options); },
    commit(transaction) {
      assertOpen();
      return Object.freeze({
        dispatched: Promise.resolve(),
        result: authority.commit(transaction),
      });
    },
    subscribe(keys, listener) { assertOpen(); return authority.subscribe(keys, listener); },
    terminal: locallyTerminal,
    close() {
      if (closed) return;
      closed = true;
      settle();
    },
  };
  return Object.freeze(binding);
}

export function createAuthorityForTesting(
  prepared: PreparedSharedStateDefinition,
  options: SharedStateAuthorityOptions,
  seed: AuthorityTestingSeed,
): SharedStateAuthority {
  return new SharedStateAuthority(prepared, options, seed);
}
