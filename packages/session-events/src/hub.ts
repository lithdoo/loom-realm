import { utf8ByteLength, type JsonValue } from "@loomrealm/wire";
import { sessionEventError } from "./failure.js";
import type {
  SessionEvent,
  SessionEventBindingPublishDispatch,
  SessionEventBindingTerminalReason,
  SessionEventListener,
  SessionEventDelegatedPublisher,
  SessionEventPhysicalBinding,
  SessionEventSubscription,
  SessionEventSubscriptionCloseReason,
} from "./model.js";
import { SessionEventDelivery } from "./subscription.js";
import {
  SESSION_EVENT_LIMITS,
  snapshotJsonValue,
  validateChannels,
  validatePublish,
  type ValidatedSessionEventInput,
} from "./validation.js";

export interface SessionEventHubFatalFact {
  readonly code: "SESSION_EVENT_HUB_FATAL";
  readonly cause?: unknown;
}

export interface SessionEventHubOptions {
  readonly onFatal?: (fact: SessionEventHubFatalFact) => void;
}

interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve(value: T): void;
}

function deferred<T>(): Deferred<T> {
  let settled = false;
  let resolvePromise!: (value: T) => void;
  const promise = new Promise<T>((resolve) => { resolvePromise = resolve; });
  return {
    promise,
    resolve(value) {
      if (settled) return;
      settled = true;
      resolvePromise(value);
    },
  };
}

function validateSubsystemKey(value: unknown): string {
  if (typeof value !== "string" || value.length === 0 || utf8ByteLength(value) > 1024) {
    throw new TypeError("Invalid Session Event Runtime identity");
  }
  return value;
}

class HubSubscription extends SessionEventDelivery {
  constructor(
    readonly owner: HubRuntimeBinding,
    readonly channels: ReadonlySet<string>,
    listener: SessionEventListener,
    onTerminal: (subscription: HubSubscription) => void,
  ) {
    super(listener, () => onTerminal(this));
  }
}

class HubRuntimeBinding implements SessionEventPhysicalBinding {
  private readonly terminalDeferred = deferred<SessionEventBindingTerminalReason>();
  private closed = false;
  private hubTerminal = false;
  readonly subscriptions = new Set<HubSubscription>();
  readonly terminal = this.terminalDeferred.promise;

  constructor(
    readonly hub: SessionEventHub,
    readonly subsystemKey: string,
  ) {}

  publish(
    channel: string,
    type: string,
    payload: JsonValue,
  ): SessionEventBindingPublishDispatch {
    if (this.closed) {
      const error = this.hubTerminal
        ? sessionEventError("TERMINAL", "Session Event Hub is terminal")
        : sessionEventError("BINDING_UNAVAILABLE", "Session Event binding is closed");
      const dispatched = Promise.reject(error);
      const result = Promise.reject<void>(error);
      void dispatched.catch(() => undefined);
      void result.catch(() => undefined);
      return Object.freeze({ dispatched, result });
    }
    let accepted: ValidatedSessionEventInput;
    try {
      accepted = validatePublish(channel, type, payload);
    } catch (error) {
      const dispatched = Promise.reject(error);
      const result = Promise.reject<void>(error);
      void dispatched.catch(() => undefined);
      void result.catch(() => undefined);
      return Object.freeze({ dispatched, result });
    }
    return Object.freeze({
      dispatched: Promise.resolve(),
      result: this.hub.accept(this, accepted),
    });
  }

  subscribe(
    channels: readonly string[],
    listener: SessionEventListener,
  ): Promise<SessionEventSubscription> {
    if (this.closed) {
      return Promise.reject(this.hubTerminal
        ? sessionEventError("TERMINAL", "Session Event Hub is terminal")
        : sessionEventError("BINDING_UNAVAILABLE", "Session Event binding is closed"));
    }
    return this.hub.subscribe(this, channels, listener);
  }

  close(): void {
    this.terminalize("binding-terminal");
  }

  terminalize(reason: SessionEventBindingTerminalReason): void {
    if (this.closed) return;
    this.closed = true;
    this.hubTerminal = reason === "hub-terminal";
    for (const subscription of [...this.subscriptions]) {
      subscription.terminate(reason);
    }
    this.terminalDeferred.resolve(reason);
    this.hub.removeBinding(this);
  }
}

export class SessionEventHub {
  private readonly bindings = new Set<HubRuntimeBinding>();
  private readonly channelIndex = new Map<string, Set<HubSubscription>>();
  private readonly onFatal?: (fact: SessionEventHubFatalFact) => void;
  private terminalValue = false;
  private readyValue = true;
  private settleTerminated!: () => void;
  readonly terminated: Promise<void>;

  constructor(options: SessionEventHubOptions = {}) {
    if (options.onFatal !== undefined && typeof options.onFatal !== "function") {
      throw new TypeError("Invalid Session Event fatal sink");
    }
    this.onFatal = options.onFatal;
    this.terminated = new Promise((resolve) => { this.settleTerminated = resolve; });
  }

  get ready(): boolean {
    return this.readyValue && !this.terminalValue;
  }

  get terminal(): boolean {
    return this.terminalValue;
  }

  createBinding(subsystemKey: string): SessionEventPhysicalBinding {
    if (this.terminalValue) throw sessionEventError("TERMINAL", "Session Event Hub is terminal");
    const binding = new HubRuntimeBinding(this, validateSubsystemKey(subsystemKey));
    this.bindings.add(binding);
    return binding;
  }

  createDelegatedPublisher(subsystemKey: string): SessionEventDelegatedPublisher {
    const sourceSubsystemKey = validateSubsystemKey(subsystemKey);
    return Object.freeze({
      publish: (
        channel: string,
        type: string,
        payload: JsonValue,
        targetSubsystemKey?: string,
      ) => {
        if (this.terminalValue) {
          return Promise.reject(sessionEventError("TERMINAL", "Session Event Hub is terminal"));
        }
        let accepted: ValidatedSessionEventInput;
        try {
          accepted = validatePublish(channel, type, payload);
          if (targetSubsystemKey !== undefined) validateSubsystemKey(targetSubsystemKey);
        } catch (error) {
          return Promise.reject(error);
        }
        return this.route(sourceSubsystemKey, accepted, targetSubsystemKey);
      },
    });
  }

  terminate(): void {
    this.selfTerminal();
  }

  reportFatal(cause?: unknown): void {
    if (!this.selfTerminal()) return;
    const fact = Object.freeze({
      code: "SESSION_EVENT_HUB_FATAL" as const,
      ...(cause === undefined ? {} : { cause }),
    });
    try { this.onFatal?.(fact); } catch {}
  }

  async accept(
    binding: HubRuntimeBinding,
    input: ValidatedSessionEventInput,
  ): Promise<void> {
    this.assertCurrent(binding);
    await this.route(binding.subsystemKey, input);
  }

  private async route(
    sourceSubsystemKey: string,
    input: ValidatedSessionEventInput,
    targetSubsystemKey?: string,
  ): Promise<void> {
    if (this.terminalValue) throw sessionEventError("TERMINAL", "Session Event Hub is terminal");
    const source = Object.freeze({ subsystemKey: sourceSubsystemKey });
    const recipients = [...(this.channelIndex.get(input.channel) ?? [])];
    for (const subscription of recipients) {
      if (subscription.owner.hub !== this) continue;
      if (targetSubsystemKey !== undefined && subscription.owner.subsystemKey !== targetSubsystemKey) continue;
      const event: SessionEvent = Object.freeze({
        channel: input.channel,
        type: input.type,
        payload: snapshotJsonValue(input.payload),
        source,
      });
      subscription.enqueue(event);
    }
  }

  async subscribe(
    binding: HubRuntimeBinding,
    rawChannels: readonly string[],
    listener: SessionEventListener,
  ): Promise<SessionEventSubscription> {
    this.assertCurrent(binding);
    if (typeof listener !== "function") {
      throw sessionEventError("INVALID_REQUEST", "Subscription listener must be a function", ["listener"]);
    }
    const channels = validateChannels(rawChannels);
    if (binding.subscriptions.size >= SESSION_EVENT_LIMITS.subscriptionsPerClient) {
      throw sessionEventError("LIMIT_EXCEEDED", "Live subscription limit exceeded");
    }
    const subscription = new HubSubscription(
      binding,
      new Set(channels),
      listener,
      (closed) => this.removeSubscription(closed),
    );
    binding.subscriptions.add(subscription);
    for (const channel of channels) {
      let subscriptions = this.channelIndex.get(channel);
      if (subscriptions === undefined) {
        subscriptions = new Set();
        this.channelIndex.set(channel, subscriptions);
      }
      subscriptions.add(subscription);
    }

    // The candidate is installed before this checkpoint. A publish or terminal
    // in the same turn can therefore exercise the required pre-visible race.
    await Promise.resolve();
    const reason = subscription.terminalReason;
    if (reason !== null) {
      throw establishmentFailure(reason);
    }
    if (!subscription.reveal()) {
      throw establishmentFailure(subscription.terminalReason ?? "binding-terminal");
    }
    return subscription;
  }

  removeBinding(binding: HubRuntimeBinding): void {
    this.bindings.delete(binding);
  }

  private removeSubscription(subscription: HubSubscription): void {
    subscription.owner.subscriptions.delete(subscription);
    for (const channel of subscription.channels) {
      const subscriptions = this.channelIndex.get(channel);
      subscriptions?.delete(subscription);
      if (subscriptions?.size === 0) this.channelIndex.delete(channel);
    }
  }

  private assertCurrent(binding: HubRuntimeBinding): void {
    if (this.terminalValue) throw sessionEventError("TERMINAL", "Session Event Hub is terminal");
    if (!this.bindings.has(binding)) {
      throw sessionEventError("BINDING_UNAVAILABLE", "Session Event binding is unavailable");
    }
  }

  private selfTerminal(): boolean {
    if (this.terminalValue) return false;
    this.terminalValue = true;
    this.readyValue = false;
    this.settleTerminated();
    for (const binding of [...this.bindings]) binding.terminalize("hub-terminal");
    return true;
  }
}

function establishmentFailure(reason: SessionEventSubscriptionCloseReason): Error {
  switch (reason) {
    case "overflow":
      return sessionEventError("LIMIT_EXCEEDED", "Subscription overflowed before establishment");
    case "binding-terminal":
      return sessionEventError("BINDING_UNAVAILABLE", "Binding terminated before establishment");
    case "client-terminal":
    case "hub-terminal":
    case "closed":
      return sessionEventError("TERMINAL", "Subscription terminated before establishment");
  }
}

export function createSessionEventHub(
  options: SessionEventHubOptions = {},
): SessionEventHub {
  return new SessionEventHub(options);
}

export function createInMemorySessionEventBinding(
  hub: SessionEventHub,
  subsystemKey: string,
): SessionEventPhysicalBinding {
  return hub.createBinding(subsystemKey);
}
