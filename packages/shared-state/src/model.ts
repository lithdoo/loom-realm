import type { JsonValue } from "@loomrealm/wire";

export interface SharedStateKey {
  readonly namespace: string;
  readonly key: string;
}

export interface SharedStateRecord {
  readonly key: SharedStateKey;
  readonly value: JsonValue;
  readonly version: number;
}

export interface SharedStateSnapshot {
  readonly revision: number;
  readonly records: readonly SharedStateRecord[];
}

export interface SharedStateInitialRecord {
  readonly key: SharedStateKey;
  readonly value: JsonValue;
}

export interface SharedStateInitialSnapshot {
  readonly records: readonly SharedStateInitialRecord[];
}

export interface SharedStateIndexRecord {
  readonly key: SharedStateKey;
  readonly version: number;
}

export interface SharedStateIndexSnapshot {
  readonly revision: number;
  readonly records: readonly SharedStateIndexRecord[];
}

export interface PreparedSharedStateInitialRecord {
  readonly key: SharedStateKey;
  readonly value: JsonValue;
}

export interface PreparedSharedStateDefinition {
  readonly records: readonly PreparedSharedStateInitialRecord[];
}

export interface SharedStateCondition {
  readonly key: SharedStateKey;
  readonly version: number;
}

export interface SharedStatePut {
  readonly type: "put";
  readonly key: SharedStateKey;
  readonly value: JsonValue;
}

export interface SharedStateTransaction {
  readonly conditions: readonly SharedStateCondition[];
  readonly writes: readonly SharedStatePut[];
}

export interface SharedStateCommit {
  readonly revision: number;
  readonly records: readonly SharedStateIndexRecord[];
}

export type SharedStateSubscriptionEvent =
  | { readonly type: "baseline"; readonly snapshot: SharedStateSnapshot }
  | {
      readonly type: "change";
      readonly revision: number;
      readonly records: readonly SharedStateRecord[];
    }
  | {
      readonly type: "terminal";
      readonly reason: "binding-terminal" | "overflow" | "authority-terminal";
    };

export interface SharedStateSubscription {
  close(): void;
}

export interface SharedStateClient {
  read(
    keys: readonly SharedStateKey[],
    options?: { readonly signal?: AbortSignal },
  ): Promise<SharedStateSnapshot>;
  readInitial(
    keys: readonly SharedStateKey[],
    options?: { readonly signal?: AbortSignal },
  ): Promise<SharedStateInitialSnapshot>;
  list(options?: {
    readonly namespace?: string;
    readonly signal?: AbortSignal;
  }): Promise<SharedStateIndexSnapshot>;
  scan(options?: {
    readonly namespace?: string;
    readonly signal?: AbortSignal;
  }): Promise<SharedStateSnapshot>;
  commit(transaction: SharedStateTransaction): Promise<SharedStateCommit>;
  subscribe(
    keys: readonly SharedStateKey[],
    listener: (event: SharedStateSubscriptionEvent) => void,
  ): Promise<SharedStateSubscription>;
}

export interface SharedStateBindingCommitDispatch {
  /** Resolves only after the carrier has locally accepted the mutation request. */
  readonly dispatched: Promise<void>;
  readonly result: Promise<SharedStateCommit>;
}

/** Platform integration seam. Returning from commit() means mutation dispatch occurred. */
export interface SharedStatePhysicalBinding extends Omit<SharedStateClient, "commit"> {
  commit(transaction: SharedStateTransaction): SharedStateBindingCommitDispatch;
  readonly terminal: Promise<void>;
  close(): void | Promise<void>;
}
