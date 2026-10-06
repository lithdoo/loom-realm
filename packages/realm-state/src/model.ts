import type { JsonValue } from "@loomrealm/wire";

export interface RealmStateKey {
  readonly namespace: string;
  readonly key: string;
}

export interface RealmStateRecord {
  readonly key: RealmStateKey;
  readonly value: JsonValue;
  readonly version: number;
}

export interface RealmStateSnapshot {
  readonly revision: number;
  readonly records: readonly RealmStateRecord[];
}

export interface RealmStateInitialRecord {
  readonly key: RealmStateKey;
  readonly value: JsonValue;
}

export interface RealmStateInitialSnapshot {
  readonly records: readonly RealmStateInitialRecord[];
}

export interface RealmStateIndexRecord {
  readonly key: RealmStateKey;
  readonly version: number;
}

export interface RealmStateIndexSnapshot {
  readonly revision: number;
  readonly records: readonly RealmStateIndexRecord[];
}

export interface PreparedRealmStateInitialRecord {
  readonly key: RealmStateKey;
  readonly value: JsonValue;
}

export interface PreparedRealmStateDefinition {
  readonly records: readonly PreparedRealmStateInitialRecord[];
}

export interface RealmStateCondition {
  readonly key: RealmStateKey;
  readonly version: number;
}

export interface RealmStatePut {
  readonly type: "put";
  readonly key: RealmStateKey;
  readonly value: JsonValue;
}

export interface RealmStateTransaction {
  readonly conditions: readonly RealmStateCondition[];
  readonly writes: readonly RealmStatePut[];
}

export interface RealmStateCommit {
  readonly revision: number;
  readonly records: readonly RealmStateIndexRecord[];
}

export type RealmStateSubscriptionEvent =
  | { readonly type: "baseline"; readonly snapshot: RealmStateSnapshot }
  | {
      readonly type: "change";
      readonly revision: number;
      readonly records: readonly RealmStateRecord[];
    }
  | {
      readonly type: "terminal";
      readonly reason: "binding-terminal" | "overflow" | "authority-terminal";
    };

export interface RealmStateSubscription {
  close(): void;
}

export interface RealmStateClient {
  read(
    keys: readonly RealmStateKey[],
    options?: { readonly signal?: AbortSignal },
  ): Promise<RealmStateSnapshot>;
  readInitial(
    keys: readonly RealmStateKey[],
    options?: { readonly signal?: AbortSignal },
  ): Promise<RealmStateInitialSnapshot>;
  list(options?: {
    readonly namespace?: string;
    readonly signal?: AbortSignal;
  }): Promise<RealmStateIndexSnapshot>;
  scan(options?: {
    readonly namespace?: string;
    readonly signal?: AbortSignal;
  }): Promise<RealmStateSnapshot>;
  commit(transaction: RealmStateTransaction): Promise<RealmStateCommit>;
  subscribe(
    keys: readonly RealmStateKey[],
    listener: (event: RealmStateSubscriptionEvent) => void,
  ): Promise<RealmStateSubscription>;
}

export interface RealmStateBindingCommitDispatch {
  /** Resolves only after the carrier has locally accepted the mutation request. */
  readonly dispatched: Promise<void>;
  readonly result: Promise<RealmStateCommit>;
}

/** Platform integration seam. Returning from commit() means mutation dispatch occurred. */
export interface RealmStatePhysicalBinding extends Omit<RealmStateClient, "commit"> {
  commit(transaction: RealmStateTransaction): RealmStateBindingCommitDispatch;
  readonly terminal: Promise<void>;
  close(): void | Promise<void>;
}
