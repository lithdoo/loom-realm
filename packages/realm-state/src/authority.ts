import type { JsonValue } from "@loomrealm/wire";
import { realmStateError } from "./failure.js";
import type {
  PreparedRealmStateDefinition,
  RealmStateClient,
  RealmStateCommit,
  RealmStateIndexRecord,
  RealmStateIndexSnapshot,
  RealmStateInitialRecord,
  RealmStateInitialSnapshot,
  RealmStateKey,
  RealmStatePhysicalBinding,
  RealmStateRecord,
  RealmStateSnapshot,
  RealmStateSubscription,
  RealmStateSubscriptionEvent,
  RealmStateTransaction,
} from "./model.js";
import {
  REALM_STATE_LIMITS,
  compareRealmStateKeys,
  identityToken,
  prepareRealmStateDefinition,
  snapshotJsonValue,
  subscriptionRecordPayloadBytes,
  validateKeyList,
  validateNamespace,
  validateTransaction,
} from "./validation.js";

interface StoredRecord {
  readonly key: RealmStateKey;
  readonly initialValue: JsonValue;
  currentValue: JsonValue;
  version: number;
}

export interface RealmStateAuthorityFatalFact {
  readonly code: "REALM_STATE_AUTHORITY_FATAL";
  readonly cause?: unknown;
}

export interface RealmStateAuthorityOptions {
  readonly onFatal?: (fact: RealmStateAuthorityFatalFact) => void;
}

interface AuthorityTestingSeed {
  readonly revision?: number;
  readonly versions?: ReadonlyMap<string, number>;
}

function frozenKey(key: RealmStateKey): RealmStateKey {
  return Object.freeze({ namespace: key.namespace, key: key.key });
}

function recordSnapshot(record: StoredRecord | undefined, key: RealmStateKey): RealmStateRecord {
  return Object.freeze({
    key: frozenKey(key),
    value: record?.currentValue ?? null,
    version: record?.version ?? 0,
  });
}

function initialSnapshot(record: StoredRecord | undefined, key: RealmStateKey): RealmStateInitialRecord {
  return Object.freeze({ key: frozenKey(key), value: record?.initialValue ?? null });
}

function indexSnapshot(record: StoredRecord): RealmStateIndexRecord {
  return Object.freeze({ key: frozenKey(record.key), version: record.version });
}

class AuthoritySubscription implements RealmStateSubscription {
  private readonly queue: RealmStateSubscriptionEvent[] = [];
  private pendingChanges = 0;
  private pendingBytes = 0;
  private active = true;
  private delivering = false;
  private deliveryScheduled = false;
  private terminalQueued = false;

  constructor(
    readonly tokens: ReadonlySet<string>,
    baseline: RealmStateSnapshot,
    private readonly listener: (event: RealmStateSubscriptionEvent) => void,
    private readonly onClose: () => void,
  ) {
    this.queue.push(Object.freeze({ type: "baseline", snapshot: baseline }));
  }

  start(): void {
    if (!this.active || this.deliveryScheduled || this.delivering) return;
    this.deliveryScheduled = true;
    setTimeout(() => {
      this.deliveryScheduled = false;
      void this.drain();
    }, 0);
  }

  enqueueChange(revision: number, records: readonly RealmStateRecord[]): void {
    if (!this.active || this.terminalQueued || records.length === 0) return;
    const bytes = records.reduce(
      (total, record) => total + subscriptionRecordPayloadBytes(record),
      0,
    );
    if (
      this.pendingChanges + 1 > REALM_STATE_LIMITS.subscriptionPendingEvents ||
      this.pendingBytes + bytes > REALM_STATE_LIMITS.subscriptionPendingPayloadBytes
    ) {
      const firstChange = this.queue.findIndex((event) => event.type === "change");
      if (firstChange >= 0) this.queue.splice(firstChange, this.queue.length);
      this.pendingChanges = 0;
      this.pendingBytes = 0;
      this.terminalQueued = true;
      this.queue.push(Object.freeze({ type: "terminal", reason: "overflow" }));
      this.start();
      return;
    }
    this.pendingChanges += 1;
    this.pendingBytes += bytes;
    this.queue.push(Object.freeze({ type: "change", revision, records }));
    this.start();
  }

  terminal(reason: "binding-terminal" | "authority-terminal"): void {
    if (!this.active || this.terminalQueued) return;
    this.terminalQueued = true;
    this.queue.push(Object.freeze({ type: "terminal", reason }));
    this.start();
  }

  close(): void {
    if (!this.active) return;
    this.active = false;
    this.queue.length = 0;
    this.onClose();
  }

  private async drain(): Promise<void> {
    if (this.delivering || !this.active) return;
    this.delivering = true;
    try {
      while (this.active) {
        const event = this.queue.shift();
        if (event === undefined) break;
        if (event.type === "change") {
          this.pendingChanges -= 1;
          this.pendingBytes -= event.records.reduce(
            (total, record) => total + subscriptionRecordPayloadBytes(record),
            0,
          );
        }
        try {
          const returned = this.listener(event) as unknown;
          if (
            returned !== null &&
            (typeof returned === "object" || typeof returned === "function") &&
            typeof (returned as { then?: unknown }).then === "function"
          ) {
            await Promise.resolve(returned).catch(() => undefined);
          }
        } catch {
          // Listener failures are local and never affect the authority.
        }
        if (event.type === "terminal") {
          this.close();
          break;
        }
      }
    } finally {
      this.delivering = false;
      if (this.active && this.queue.length > 0) this.start();
    }
  }
}

export class RealmStateAuthority implements RealmStateClient {
  private readonly records = new Map<string, StoredRecord>();
  private readonly subscriptions = new Set<AuthoritySubscription>();
  private readonly onFatal?: (fact: RealmStateAuthorityFatalFact) => void;
  private revisionValue = 0;
  private terminalValue = false;
  private readyValue = false;
  private settleTerminated!: () => void;
  readonly terminated: Promise<void>;

  constructor(
    prepared: PreparedRealmStateDefinition,
    options: RealmStateAuthorityOptions = {},
    testingSeed: AuthorityTestingSeed = {},
  ) {
    this.terminated = new Promise<void>((resolve) => { this.settleTerminated = resolve; });
    if (options.onFatal !== undefined && typeof options.onFatal !== "function") {
      throw new TypeError("Invalid Realm State fatal sink");
    }
    const trusted = prepareRealmStateDefinition(
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
    rawKeys: readonly RealmStateKey[],
    options?: { readonly signal?: AbortSignal },
  ): Promise<RealmStateSnapshot> {
    this.assertLive();
    this.assertSignal(options?.signal);
    const keys = validateKeyList(rawKeys, REALM_STATE_LIMITS.readKeys);
    const records = keys
      .map((key) => recordSnapshot(this.records.get(identityToken(key)), key))
      .sort((left, right) => compareRealmStateKeys(left.key, right.key));
    return Object.freeze({ revision: this.revisionValue, records: Object.freeze(records) });
  }

  async readInitial(
    rawKeys: readonly RealmStateKey[],
    options?: { readonly signal?: AbortSignal },
  ): Promise<RealmStateInitialSnapshot> {
    this.assertLive();
    this.assertSignal(options?.signal);
    const keys = validateKeyList(rawKeys, REALM_STATE_LIMITS.readKeys);
    const records = keys
      .map((key) => initialSnapshot(this.records.get(identityToken(key)), key))
      .sort((left, right) => compareRealmStateKeys(left.key, right.key));
    return Object.freeze({ records: Object.freeze(records) });
  }

  async list(options?: {
    readonly namespace?: string;
    readonly signal?: AbortSignal;
  }): Promise<RealmStateIndexSnapshot> {
    this.assertLive();
    this.assertSignal(options?.signal);
    const namespace = options?.namespace === undefined
      ? undefined
      : validateNamespace(options.namespace, ["namespace"]);
    const records = [...this.records.values()]
      .filter((record) => namespace === undefined || record.key.namespace === namespace)
      .sort((left, right) => compareRealmStateKeys(left.key, right.key))
      .map(indexSnapshot);
    return Object.freeze({ revision: this.revisionValue, records: Object.freeze(records) });
  }

  async scan(options?: {
    readonly namespace?: string;
    readonly signal?: AbortSignal;
  }): Promise<RealmStateSnapshot> {
    this.assertLive();
    this.assertSignal(options?.signal);
    const namespace = options?.namespace === undefined
      ? undefined
      : validateNamespace(options.namespace, ["namespace"]);
    const records = [...this.records.values()]
      .filter((record) => namespace === undefined || record.key.namespace === namespace)
      .sort((left, right) => compareRealmStateKeys(left.key, right.key))
      .map((record) => recordSnapshot(record, record.key));
    return Object.freeze({ revision: this.revisionValue, records: Object.freeze(records) });
  }

  async commit(raw: RealmStateTransaction): Promise<RealmStateCommit> {
    this.assertLive();
    const transaction = validateTransaction(raw);
    for (const condition of transaction.conditions) {
      const version = this.records.get(identityToken(condition.key))?.version ?? 0;
      if (version !== condition.version) {
        throw realmStateError("CONFLICT", "Realm State condition is stale");
      }
    }
    if (this.revisionValue === Number.MAX_SAFE_INTEGER) {
      throw realmStateError("LIMIT_EXCEEDED", "Realm State revision exhausted");
    }
    let newRecords = 0;
    for (const write of transaction.writes) {
      const existing = this.records.get(identityToken(write.key));
      if (existing === undefined) newRecords += 1;
      else if (existing.version === Number.MAX_SAFE_INTEGER) {
        throw realmStateError("LIMIT_EXCEEDED", "Realm State Record version exhausted");
      }
    }
    if (this.records.size + newRecords > REALM_STATE_LIMITS.materializedRecords) {
      throw realmStateError("LIMIT_EXCEEDED", "Realm State materialized Record limit exceeded");
    }

    const revision = this.revisionValue + 1;
    const changed: RealmStateRecord[] = [];
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
    changed.sort((left, right) => compareRealmStateKeys(left.key, right.key));
    const frozenChanged = Object.freeze(changed);
    for (const subscription of this.subscriptions) {
      const relevant = frozenChanged.filter((record) => subscription.tokens.has(identityToken(record.key)));
      if (relevant.length > 0) subscription.enqueueChange(revision, Object.freeze(relevant));
    }
    const records = frozenChanged.map(({ key, version }) => Object.freeze({ key, version }));
    return Object.freeze({ revision, records: Object.freeze(records) });
  }

  async subscribe(
    rawKeys: readonly RealmStateKey[],
    listener: (event: RealmStateSubscriptionEvent) => void,
  ): Promise<RealmStateSubscription> {
    this.assertLive();
    if (typeof listener !== "function") {
      throw realmStateError("INVALID_REQUEST", "Subscription listener must be a function", ["listener"]);
    }
    const keys = validateKeyList(rawKeys, REALM_STATE_LIMITS.subscribeKeys);
    const baselineRecords = keys
      .map((key) => recordSnapshot(this.records.get(identityToken(key)), key))
      .sort((left, right) => compareRealmStateKeys(left.key, right.key));
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
    subscription.start();
    return subscription;
  }

  terminate(): void {
    this.selfTerminal(true);
  }

  reportFatal(cause?: unknown): void {
    if (!this.selfTerminal(true)) return;
    const fact = Object.freeze({
      code: "REALM_STATE_AUTHORITY_FATAL" as const,
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
        subscription.terminal("authority-terminal");
      }
    } else {
      for (const subscription of [...this.subscriptions]) subscription.close();
    }
    return true;
  }

  private assertLive(): void {
    if (this.terminalValue || !this.readyValue) {
      throw realmStateError("TERMINAL", "Realm State Authority is terminal");
    }
  }

  private assertSignal(signal: AbortSignal | undefined): void {
    if (signal?.aborted) throw signal.reason;
  }
}

export function createRealmStateAuthority(
  prepared: PreparedRealmStateDefinition,
  options: RealmStateAuthorityOptions = {},
): RealmStateAuthority {
  return new RealmStateAuthority(prepared, options);
}

export function createInMemoryRealmStateBinding(
  authority: RealmStateAuthority,
): RealmStatePhysicalBinding {
  let closed = false;
  let settle!: () => void;
  const locallyTerminal = new Promise<void>((resolve) => { settle = resolve; });
  const assertOpen = () => {
    if (closed) throw realmStateError("BINDING_UNAVAILABLE", "Realm State binding is closed");
  };
  const binding: RealmStatePhysicalBinding = {
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
  prepared: PreparedRealmStateDefinition,
  options: RealmStateAuthorityOptions,
  seed: AuthorityTestingSeed,
): RealmStateAuthority {
  return new RealmStateAuthority(prepared, options, seed);
}
