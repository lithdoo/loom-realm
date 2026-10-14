import type { JsonValue } from "@loomrealm/wire";
import { isSessionEventFailure, sessionEventError } from "./failure.js";
import type {
  SessionEvent,
  SessionEventClient,
  SessionEventListener,
  SessionEventPhysicalBinding,
  SessionEventSubscription,
  SessionEventSubscriptionClose,
  SessionEventSubscriptionCloseReason,
} from "./model.js";
import {
  SESSION_EVENT_LIMITS,
  validateChannels,
  validatePublish,
} from "./validation.js";

interface AttachedBinding {
  readonly generation: number;
  readonly binding: SessionEventPhysicalBinding;
}

class ClientSubscription implements SessionEventSubscription {
  private active = true;
  private inner: SessionEventSubscription | null = null;
  private settleClosed!: (value: SessionEventSubscriptionClose) => void;
  readonly closed: Promise<SessionEventSubscriptionClose>;

  get isActive(): boolean { return this.active; }

  constructor(private readonly release: () => void) {
    this.closed = new Promise((resolve) => { this.settleClosed = resolve; });
  }

  attach(inner: SessionEventSubscription): void {
    if (!this.active) {
      inner.close();
      return;
    }
    this.inner = inner;
    void inner.closed.then(({ reason }) => this.terminal(reason));
  }

  close(): void {
    if (!this.active) return;
    this.terminal("closed");
    this.inner?.close();
  }

  terminal(reason: SessionEventSubscriptionCloseReason): void {
    if (!this.active) return;
    this.active = false;
    this.release();
    this.settleClosed(Object.freeze({ reason }));
    if (reason !== "closed") this.inner?.close();
  }
}

function unavailable(): Error {
  return sessionEventError("BINDING_UNAVAILABLE", "No usable Session Event binding");
}

function terminal(): Error {
  return sessionEventError("TERMINAL", "Session Event client is terminal");
}

export class ReplaceableSessionEventClient implements SessionEventClient {
  private current: AttachedBinding | null = null;
  private generation = 0;
  private terminalValue = false;
  private hubTerminalValue = false;
  private subscriptionSlots = 0;
  private readonly subscriptions = new Map<ClientSubscription, number>();

  get isTerminal(): boolean { return this.terminalValue || this.hubTerminalValue; }
  get isBound(): boolean { return this.current !== null; }

  attach(binding: SessionEventPhysicalBinding): void {
    if (this.isTerminal) throw terminal();
    validateBinding(binding);
    this.detach();
    const attached = Object.freeze({ generation: ++this.generation, binding });
    this.current = attached;
    void binding.terminal.then(
      (reason) => this.bindingTerminated(attached, reason),
      () => this.bindingTerminated(attached, "binding-terminal"),
    );
  }

  detach(): void {
    const attached = this.current;
    if (attached === null) return;
    this.current = null;
    this.generation += 1;
    for (const [subscription, generation] of [...this.subscriptions]) {
      if (generation === attached.generation) subscription.terminal("binding-terminal");
    }
    try { void Promise.resolve(attached.binding.close()).catch(() => undefined); } catch {}
  }

  terminate(): void {
    if (this.terminalValue) return;
    this.terminalValue = true;
    for (const subscription of [...this.subscriptions.keys()]) {
      subscription.terminal("client-terminal");
    }
    const attached = this.current;
    this.current = null;
    this.generation += 1;
    try { void Promise.resolve(attached?.binding.close()).catch(() => undefined); } catch {}
  }

  async publish(channel: string, type: string, payload: JsonValue): Promise<void> {
    const validated = validatePublish(channel, type, payload);
    const attached = this.admit();
    let dispatched: Promise<void>;
    let result: Promise<void>;
    try {
      const operation = attached.binding.publish(
        validated.channel,
        validated.type,
        validated.payload,
      );
      dispatched = operation.dispatched;
      result = operation.result;
    } catch (error) {
      if (this.same(attached) && isSessionEventFailure(error)) throw error;
      throw unavailable();
    }
    try {
      await dispatched;
    } catch (error) {
      void result.catch(() => undefined);
      if (!this.same(attached)) throw unavailable();
      if (isSessionEventFailure(error)) throw toLocalFailure(error);
      throw unavailable();
    }
    try {
      await Promise.race([
        result,
        attached.binding.terminal.then(() => {
          throw sessionEventError("OUTCOME_UNKNOWN", "Session Event publish outcome is unknown");
        }),
      ]);
      if (!this.same(attached)) {
        throw sessionEventError("OUTCOME_UNKNOWN", "Session Event publish outcome is unknown");
      }
    } catch (error) {
      if (!this.same(attached)) {
        throw sessionEventError("OUTCOME_UNKNOWN", "Session Event publish outcome is unknown");
      }
      if (isSessionEventFailure(error)) throw toLocalFailure(error);
      throw sessionEventError("OUTCOME_UNKNOWN", "Session Event publish outcome is unknown");
    }
  }

  async subscribe(
    channels: readonly string[],
    listener: SessionEventListener,
  ): Promise<SessionEventSubscription> {
    if (typeof listener !== "function") {
      throw sessionEventError("INVALID_REQUEST", "Subscription listener must be a function", ["listener"]);
    }
    const validated = validateChannels(channels);
    const attached = this.admit();
    if (this.subscriptionSlots >= SESSION_EVENT_LIMITS.subscriptionsPerClient) {
      throw sessionEventError("LIMIT_EXCEEDED", "Live subscription limit exceeded");
    }
    this.subscriptionSlots += 1;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      this.subscriptionSlots -= 1;
      this.subscriptions.delete(wrapper);
    };
    const wrapper = new ClientSubscription(release);
    let exposed = false;
    let unblock!: () => void;
    const exposure = new Promise<void>((resolve) => { unblock = resolve; });
    try {
      const inner = await attached.binding.subscribe(validated, async (event: SessionEvent) => {
        await exposure;
        if (!exposed || !wrapper.isActive || !this.same(attached)) return;
        return listener(event);
      });
      if (!this.same(attached)) {
        wrapper.terminal("binding-terminal");
        inner.close();
        throw unavailable();
      }
      wrapper.attach(inner);
      this.subscriptions.set(wrapper, attached.generation);
      const early = await Promise.race([
        inner.closed.then((value) => value.reason),
        Promise.resolve(null),
      ]);
      if (early !== null) {
        wrapper.terminal(early);
        throw establishmentFailure(early);
      }
      exposed = true;
      unblock();
      return wrapper;
    } catch (error) {
      exposed = false;
      unblock();
      wrapper.terminal("closed");
      if (this.isTerminal) throw terminal();
      if (!this.same(attached)) throw unavailable();
      if (isSessionEventFailure(error)) throw toLocalFailure(error);
      throw unavailable();
    }
  }

  private admit(): AttachedBinding {
    if (this.isTerminal) throw terminal();
    if (this.current === null) throw unavailable();
    return this.current;
  }

  private same(attached: AttachedBinding): boolean {
    return !this.isTerminal && this.current === attached;
  }

  private bindingTerminated(
    attached: AttachedBinding,
    reason: "binding-terminal" | "hub-terminal",
  ): void {
    if (this.current !== attached) return;
    this.current = null;
    this.generation += 1;
    if (reason === "hub-terminal") this.hubTerminalValue = true;
    for (const [subscription, generation] of [...this.subscriptions]) {
      if (generation === attached.generation) subscription.terminal(reason);
    }
  }
}

function validateBinding(binding: SessionEventPhysicalBinding): void {
  if (
    binding === null || typeof binding !== "object" ||
    typeof binding.publish !== "function" ||
    typeof binding.subscribe !== "function" ||
    binding.terminal === null ||
    (typeof binding.terminal !== "object" && typeof binding.terminal !== "function") ||
    typeof (binding.terminal as { then?: unknown }).then !== "function" ||
    typeof binding.close !== "function"
  ) throw new TypeError("Invalid Session Event physical binding");
}

function toLocalFailure(failure: {
  readonly code: "INVALID_REQUEST" | "LIMIT_EXCEEDED" | "TERMINAL" | "BINDING_UNAVAILABLE" | "OUTCOME_UNKNOWN";
  readonly message: string;
  readonly path?: readonly (string | number)[];
}): Error {
  return sessionEventError(failure.code, failure.message, failure.path);
}

function establishmentFailure(reason: SessionEventSubscriptionCloseReason): Error {
  if (reason === "overflow") {
    return sessionEventError("LIMIT_EXCEEDED", "Subscription overflowed before establishment");
  }
  if (reason === "binding-terminal") return unavailable();
  return terminal();
}

export function createSessionEventClient(
  initialBinding?: SessionEventPhysicalBinding,
): ReplaceableSessionEventClient {
  const client = new ReplaceableSessionEventClient();
  if (initialBinding !== undefined) client.attach(initialBinding);
  return client;
}
