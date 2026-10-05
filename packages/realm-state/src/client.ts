import { isRealmStateFailure, realmStateError } from "./failure.js";
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

interface AttachedBinding {
  readonly generation: number;
  readonly binding: RealmStatePhysicalBinding;
}

interface ClientSubscription extends RealmStateSubscription {
  bindingLost(): void;
}

function unavailable(): Error {
  return realmStateError("BINDING_UNAVAILABLE", "No usable Realm State binding");
}

function terminal(): Error {
  return realmStateError("TERMINAL", "Realm State client is terminal");
}

export class ReplaceableRealmStateClient implements RealmStateClient {
  private current: AttachedBinding | null = null;
  private generation = 0;
  private terminalValue = false;
  private readonly subscriptions = new Map<ClientSubscription, number>();

  get isTerminal(): boolean {
    return this.terminalValue;
  }

  get isBound(): boolean {
    return this.current !== null;
  }

  attach(binding: RealmStatePhysicalBinding): void {
    if (this.terminalValue) throw terminal();
    if (
      binding === null ||
      typeof binding !== "object" ||
      typeof binding.read !== "function" ||
      typeof binding.readInitial !== "function" ||
      typeof binding.list !== "function" ||
      typeof binding.scan !== "function" ||
      typeof binding.commit !== "function" ||
      typeof binding.subscribe !== "function" ||
      binding.terminal === null ||
      (typeof binding.terminal !== "object" && typeof binding.terminal !== "function") ||
      typeof (binding.terminal as { then?: unknown }).then !== "function" ||
      typeof binding.close !== "function"
    ) {
      throw new TypeError("Invalid Realm State physical binding");
    }
    this.detach();
    const attached = Object.freeze({ generation: ++this.generation, binding });
    this.current = attached;
    void binding.terminal.then(
      () => this.bindingTerminated(attached),
      () => this.bindingTerminated(attached),
    );
  }

  detach(): void {
    const attached = this.current;
    if (attached === null) return;
    this.current = null;
    this.generation += 1;
    for (const [subscription, generation] of [...this.subscriptions]) {
      if (generation === attached.generation) subscription.bindingLost();
    }
    try {
      void Promise.resolve(attached.binding.close()).catch(() => undefined);
    } catch {
      // Binding cleanup is best effort after logical fencing is installed.
    }
  }

  terminate(): void {
    if (this.terminalValue) return;
    this.terminalValue = true;
    const subscriptions = [...this.subscriptions.keys()];
    this.subscriptions.clear();
    for (const subscription of subscriptions) subscription.close();
    this.detach();
  }

  read(
    keys: readonly RealmStateKey[],
    options?: { readonly signal?: AbortSignal },
  ): Promise<RealmStateSnapshot> {
    return this.readOperation((binding) => binding.read(keys, options));
  }

  readInitial(
    keys: readonly RealmStateKey[],
    options?: { readonly signal?: AbortSignal },
  ): Promise<RealmStateInitialSnapshot> {
    return this.readOperation((binding) => binding.readInitial(keys, options));
  }

  list(options?: {
    readonly namespace?: string;
    readonly signal?: AbortSignal;
  }): Promise<RealmStateIndexSnapshot> {
    return this.readOperation((binding) => binding.list(options));
  }

  scan(options?: {
    readonly namespace?: string;
    readonly signal?: AbortSignal;
  }): Promise<RealmStateSnapshot> {
    return this.readOperation((binding) => binding.scan(options));
  }

  async commit(transaction: RealmStateTransaction): Promise<RealmStateCommit> {
    const attached = this.admit();
    let dispatched: Promise<void>;
    let result: Promise<RealmStateCommit>;
    try {
      const attempt = attached.binding.commit(transaction);
      dispatched = attempt.dispatched;
      result = attempt.result;
    } catch (error) {
      if (this.same(attached) && isRealmStateFailure(error)) throw error;
      throw unavailable();
    }
    try {
      await dispatched;
    } catch (error) {
      void result.catch(() => undefined);
      if (!this.same(attached)) throw unavailable();
      if (isRealmStateFailure(error)) throw error;
      throw unavailable();
    }
    try {
      const commit = await result;
      if (!this.same(attached)) {
        throw realmStateError("OUTCOME_UNKNOWN", "Realm State commit outcome is unknown");
      }
      return commit;
    } catch (error) {
      if (!this.same(attached)) {
        throw realmStateError("OUTCOME_UNKNOWN", "Realm State commit outcome is unknown");
      }
      if (isRealmStateFailure(error)) throw error;
      throw realmStateError("OUTCOME_UNKNOWN", "Realm State commit outcome is unknown");
    }
  }

  async subscribe(
    keys: readonly RealmStateKey[],
    listener: (event: RealmStateSubscriptionEvent) => void,
  ): Promise<RealmStateSubscription> {
    const attached = this.admit();
    let active = true;
    let bindingSubscription: RealmStateSubscription | null = null;
    const wrapper: ClientSubscription = Object.freeze({
      close: () => {
        if (!active) return;
        active = false;
        this.subscriptions.delete(wrapper);
        bindingSubscription?.close();
      },
      bindingLost: () => {
        if (!active) return;
        active = false;
        this.subscriptions.delete(wrapper);
        bindingSubscription?.close();
        queueMicrotask(() => {
          try { listener(Object.freeze({ type: "terminal", reason: "binding-terminal" })); } catch {}
        });
      },
    });
    try {
      bindingSubscription = await attached.binding.subscribe(keys, (event) => {
        if (!active || !this.same(attached)) return;
        try {
          const returned = listener(event) as unknown;
          if (event.type === "terminal") wrapper.close();
          return returned as void;
        } catch {}
      });
    } catch (error) {
      active = false;
      if (!this.same(attached)) throw unavailable();
      if (isRealmStateFailure(error)) throw error;
      throw unavailable();
    }
    if (!this.same(attached)) {
      active = false;
      bindingSubscription.close();
      throw unavailable();
    }
    this.subscriptions.set(wrapper, attached.generation);
    return wrapper;
  }

  private admit(): AttachedBinding {
    if (this.terminalValue) throw terminal();
    if (this.current === null) throw unavailable();
    return this.current;
  }

  private same(attached: AttachedBinding): boolean {
    return !this.terminalValue && this.current === attached;
  }

  private async readOperation<T>(
    operation: (binding: RealmStatePhysicalBinding) => Promise<T>,
  ): Promise<T> {
    const attached = this.admit();
    try {
      const result = await operation(attached.binding);
      if (!this.same(attached)) throw unavailable();
      return result;
    } catch (error) {
      if (!this.same(attached)) throw unavailable();
      if (isRealmStateFailure(error)) throw error;
      throw unavailable();
    }
  }

  private bindingTerminated(attached: AttachedBinding): void {
    if (this.current !== attached || this.terminalValue) return;
    this.detach();
  }
}

export function createRealmStateClient(
  binding?: RealmStatePhysicalBinding,
): ReplaceableRealmStateClient {
  const client = new ReplaceableRealmStateClient();
  if (binding !== undefined) client.attach(binding);
  return client;
}
