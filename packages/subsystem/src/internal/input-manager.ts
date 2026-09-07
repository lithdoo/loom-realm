import type {
  DataInboundDisposition,
  InputEventV1,
  InputInterestV1,
  InputResetV1,
  InputStateV1,
  SubsystemDataPeer,
} from "@loomrealm/data";
import { FrameClosedError } from "../errors.js";
import type {
  CreateInputListenerOptions,
  InputChannel,
  InputHandler,
  InputListener,
  InputPayload,
  InputStateChannel,
  Unsubscribe,
} from "../input.js";
import type { Frame } from "../model.js";

type FrameView =
  | { readonly kind: "foreign" }
  | { readonly kind: "closed" }
  | {
      readonly kind: "live";
      readonly frameId: string;
      readonly activationId: string | null;
      readonly deliveryOpen: boolean;
    };

export interface InputRuntimeFacts {
  inspect(frame: Frame): FrameView;
  inspectById(frameId: string): Exclude<FrameView, { readonly kind: "foreign" }> | null;
}

interface Registration {
  readonly listener: ListenerRecord;
  readonly channel: InputChannel;
  readonly handler: (payload: never) => void | Promise<void>;
  active: boolean;
}

interface ListenerRecord {
  readonly frame: Frame;
  readonly frameId: string;
  channels: Set<InputChannel>;
  readonly registrations: Registration[];
  closed: boolean;
}

interface RetainedState {
  readonly activationId: string;
  readonly payload: InputStateV1["payload"];
}

const accepted: DataInboundDisposition = Object.freeze({ kind: "accepted" });
const standardChannels = new Set<string>([
  "keyboard.state",
  "keyboard.event",
  "pointer.state",
  "pointer.event",
  "gamepad.state",
  "gamepad.event",
]);
const customChannel = /^x\.[a-z][a-z0-9-]{0,31}(?:\.[a-z][a-z0-9-]{0,31})*\.(?:state|event)$/;

function validateChannel(value: unknown): asserts value is InputChannel {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 128 ||
    !/^[\x00-\x7f]+$/.test(value) ||
    (!standardChannels.has(value) && !customChannel.test(value))
  ) {
    throw new TypeError("Invalid Input channel");
  }
}

function validateContribution(channels: readonly InputChannel[]): Set<InputChannel> {
  if (!Array.isArray(channels)) throw new TypeError("Input channels must be an array");
  const result = new Set<InputChannel>();
  for (const channel of channels) {
    validateChannel(channel);
    if (result.has(channel)) throw new TypeError("Duplicate Input channel");
    result.add(channel);
  }
  return result;
}

function isStateChannel(channel: InputChannel): channel is InputStateChannel {
  return channel.endsWith(".state");
}

function detachedFrozen<T>(value: T, seen = new WeakMap<object, object>()): T {
  if (value === null || typeof value !== "object") return value;
  const existing = seen.get(value);
  if (existing !== undefined) return existing as T;
  const prototype = Object.getPrototypeOf(value);
  const output: object = Array.isArray(value)
    ? new Array(value.length)
    : Object.create(prototype);
  seen.set(value, output);
  for (const key of Reflect.ownKeys(value)) {
    if (Array.isArray(value) && key === "length") continue;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined) continue;
    if ("value" in descriptor) {
      descriptor.value = detachedFrozen(descriptor.value, seen);
    }
    Object.defineProperty(output, key, descriptor);
  }
  return Object.freeze(output) as T;
}

export class InputManager {
  private facts: InputRuntimeFacts | null = null;
  private readonly listeners = new Set<ListenerRecord>();
  private readonly registrations: Registration[] = [];
  private desired = new Map<string, Set<InputChannel>>();
  private readonly retained = new Map<string, Map<InputStateChannel, RetainedState>>();
  private peer: SubsystemDataPeer | null = null;
  private peerEpoch = 0;
  private interestInFlight = false;
  private interestPending = false;

  bindRuntime(facts: InputRuntimeFacts): void {
    if (this.facts !== null) throw new TypeError("InputManager Runtime already bound");
    this.facts = facts;
  }

  createListener(options: CreateInputListenerOptions): InputListener {
    if (options === null || typeof options !== "object") {
      throw new TypeError("Invalid Input listener options");
    }
    const view = this.requireFrame(options.frame);
    const channels = validateContribution(options.channels);
    this.assertRegistryWithinLimits(options.frame.id, channels, null);

    const record: ListenerRecord = {
      frame: options.frame,
      frameId: view.frameId,
      channels,
      registrations: [],
      closed: false,
    };
    this.listeners.add(record);
    this.rebuildDesired();

    const listener: InputListener = Object.freeze({
      on: <C extends InputChannel>(channel: C, handler: InputHandler<C>): Unsubscribe =>
        this.register(record, channel, handler),
      setChannels: (next: readonly InputChannel[]) => this.setChannels(record, next),
      close: () => this.closeListener(record),
    });
    return listener;
  }

  setDataPeer(peer: SubsystemDataPeer | null): void {
    this.peerEpoch += 1;
    this.peer = peer;
    this.interestInFlight = false;
    this.interestPending = false;
    this.retained.clear();
    if (peer !== null) this.publishInterest();
  }

  onState(message: InputStateV1): DataInboundDisposition {
    const view = this.facts?.inspectById(message.frameId) ?? null;
    const desired = this.desired.get(message.frameId);
    if (
      view?.kind !== "live" ||
      view.activationId !== message.activationId ||
      !desired?.has(message.channel)
    ) {
      return accepted;
    }

    const payload = detachedFrozen(message.payload);
    let frameState = this.retained.get(message.frameId);
    if (frameState === undefined) {
      frameState = new Map();
      this.retained.set(message.frameId, frameState);
    }
    frameState.set(message.channel, {
      activationId: message.activationId,
      payload,
    });
    if (view.deliveryOpen) this.deliver(message.frameId, message.channel, payload);
    return accepted;
  }

  onEvent(message: InputEventV1): DataInboundDisposition {
    const view = this.facts?.inspectById(message.frameId) ?? null;
    if (
      view?.kind !== "live" ||
      !view.deliveryOpen ||
      view.activationId !== message.activationId ||
      !this.desired.get(message.frameId)?.has(message.channel)
    ) {
      return accepted;
    }
    this.deliver(message.frameId, message.channel, detachedFrozen(message.payload));
    return accepted;
  }

  onReset(message: InputResetV1): DataInboundDisposition {
    const view = this.facts?.inspectById(message.frameId) ?? null;
    if (view?.kind === "live" && view.activationId === message.activationId) {
      this.retained.delete(message.frameId);
    }
    return accepted;
  }

  activationChanged(frameId: string): void {
    this.retained.delete(frameId);
  }

  mutationReopened(frameId: string, activationId: string): void {
    const view = this.facts?.inspectById(frameId) ?? null;
    if (
      view?.kind !== "live" ||
      !view.deliveryOpen ||
      view.activationId !== activationId
    ) return;
    const frameState = this.retained.get(frameId);
    if (frameState === undefined) return;
    for (const channel of [...frameState.keys()].sort()) {
      const retained = frameState.get(channel);
      if (
        retained?.activationId === activationId &&
        this.desired.get(frameId)?.has(channel)
      ) {
        this.deliver(frameId, channel, retained.payload);
      }
    }
  }

  closeFrame(frameId: string): void {
    let changed = false;
    for (const listener of this.listeners) {
      if (listener.frameId !== frameId || listener.closed) continue;
      listener.closed = true;
      for (const registration of listener.registrations) registration.active = false;
      this.removeListenerRegistrations(listener);
      this.listeners.delete(listener);
      changed = true;
    }
    this.retained.delete(frameId);
    if (changed) this.rebuildDesired();
  }

  closeAll(): void {
    for (const listener of this.listeners) {
      listener.closed = true;
      for (const registration of listener.registrations) registration.active = false;
    }
    this.listeners.clear();
    this.registrations.length = 0;
    this.desired.clear();
    this.retained.clear();
    this.peerEpoch += 1;
    this.peer = null;
    this.interestInFlight = false;
    this.interestPending = false;
  }

  private requireFrame(frame: Frame): Extract<FrameView, { readonly kind: "live" }> {
    if (frame === null || typeof frame !== "object") throw new TypeError("Invalid Frame");
    const view = this.facts?.inspect(frame) ?? { kind: "foreign" as const };
    if (view.kind === "foreign") throw new TypeError("Foreign Frame");
    if (view.kind === "closed") throw new FrameClosedError();
    return view;
  }

  private register<C extends InputChannel>(
    listener: ListenerRecord,
    channel: C,
    handler: InputHandler<C>,
  ): Unsubscribe {
    this.requireOpen(listener);
    validateChannel(channel);
    if (!listener.channels.has(channel)) {
      throw new TypeError("Input channel is not in this listener contribution");
    }
    if (typeof handler !== "function") throw new TypeError("Input handler must be a function");
    const registration: Registration = {
      listener,
      channel,
      handler: handler as Registration["handler"],
      active: true,
    };
    listener.registrations.push(registration);
    this.registrations.push(registration);
    this.deliverBaseline(listener, registration);
    let subscribed = true;
    return () => {
      if (!subscribed) return;
      subscribed = false;
      registration.active = false;
      this.removeRegistration(registration);
    };
  }

  private setChannels(listener: ListenerRecord, channels: readonly InputChannel[]): void {
    this.requireOpen(listener);
    const next = validateContribution(channels);
    this.assertRegistryWithinLimits(listener.frameId, next, listener);
    const reactivated = [...next].filter((channel) => !listener.channels.has(channel)).sort();
    listener.channels = next;
    this.rebuildDesired();
    const baselines: Array<{
      readonly registration: Registration;
      readonly payload: InputStateV1["payload"];
    }> = [];
    for (const channel of reactivated) {
      for (const registration of this.registrations) {
        if (
          registration.listener === listener &&
          registration.active &&
          registration.channel === channel
        ) {
          const payload = this.baselinePayload(listener, registration);
          if (payload !== null) baselines.push({ registration, payload });
        }
      }
    }
    for (const { registration, payload } of baselines) this.invoke(registration, payload);
  }

  private closeListener(listener: ListenerRecord): void {
    if (listener.closed) return;
    listener.closed = true;
    for (const registration of listener.registrations) registration.active = false;
    this.removeListenerRegistrations(listener);
    this.listeners.delete(listener);
    this.rebuildDesired();
  }

  private requireOpen(listener: ListenerRecord): void {
    if (listener.closed) throw new TypeError("Input listener is closed");
  }

  private removeRegistration(registration: Registration): void {
    const localIndex = registration.listener.registrations.indexOf(registration);
    if (localIndex >= 0) registration.listener.registrations.splice(localIndex, 1);
    const globalIndex = this.registrations.indexOf(registration);
    if (globalIndex >= 0) this.registrations.splice(globalIndex, 1);
  }

  private removeListenerRegistrations(listener: ListenerRecord): void {
    for (let index = this.registrations.length - 1; index >= 0; index -= 1) {
      if (this.registrations[index].listener === listener) this.registrations.splice(index, 1);
    }
    listener.registrations.length = 0;
  }

  private assertRegistryWithinLimits(
    frameId: string,
    channels: Set<InputChannel>,
    replaced: ListenerRecord | null,
  ): void {
    const prospective = new Map<string, Set<InputChannel>>();
    for (const listener of this.listeners) {
      if (listener.closed || listener === replaced) continue;
      const union = prospective.get(listener.frameId) ?? new Set<InputChannel>();
      for (const channel of listener.channels) union.add(channel);
      prospective.set(listener.frameId, union);
    }
    const union = prospective.get(frameId) ?? new Set<InputChannel>();
    for (const channel of channels) union.add(channel);
    if (union.size > 0) prospective.set(frameId, union);
    if (union.size > 64) throw new RangeError("Input channels per Frame limit exceeded");
    let pairs = 0;
    let frames = 0;
    for (const value of prospective.values()) {
      if (value.size === 0) continue;
      frames += 1;
      pairs += value.size;
    }
    if (frames > 128 || pairs > 4096) {
      throw new RangeError("Input Interest registry limit exceeded");
    }
  }

  private rebuildDesired(): void {
    const previous = this.desired;
    const next = new Map<string, Set<InputChannel>>();
    for (const listener of this.listeners) {
      if (listener.closed) continue;
      const union = next.get(listener.frameId) ?? new Set<InputChannel>();
      for (const channel of listener.channels) union.add(channel);
      if (union.size > 0) next.set(listener.frameId, union);
    }
    for (const [frameId, channels] of previous) {
      const nextChannels = next.get(frameId);
      const frameState = this.retained.get(frameId);
      if (frameState === undefined) continue;
      for (const channel of channels) {
        if (isStateChannel(channel) && !nextChannels?.has(channel)) frameState.delete(channel);
      }
      if (frameState.size === 0) this.retained.delete(frameId);
    }
    const changed = !this.sameRegistry(previous, next);
    this.desired = next;
    if (changed) this.publishInterest();
  }

  private sameRegistry(
    left: Map<string, Set<InputChannel>>,
    right: Map<string, Set<InputChannel>>,
  ): boolean {
    if (left.size !== right.size) return false;
    for (const [frameId, channels] of left) {
      const other = right.get(frameId);
      if (other?.size !== channels.size) return false;
      for (const channel of channels) if (!other.has(channel)) return false;
    }
    return true;
  }

  private publishInterest(): void {
    if (this.peer === null) return;
    if (this.interestInFlight) {
      this.interestPending = true;
      return;
    }
    const peer = this.peer;
    const epoch = this.peerEpoch;
    const message: InputInterestV1 = {
      type: "input.interest",
      frames: [...this.desired.entries()]
        .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
        .map(([frameId, channels]) => ({
          frameId,
          channels: [...channels].sort(),
        })),
    };
    this.interestInFlight = true;
    void peer.input.sendInterest(message).then(
      () => this.finishInterest(epoch, peer),
      () => this.finishInterest(epoch, peer),
    );
  }

  private finishInterest(epoch: number, peer: SubsystemDataPeer): void {
    if (epoch !== this.peerEpoch || peer !== this.peer) return;
    this.interestInFlight = false;
    if (!this.interestPending) return;
    this.interestPending = false;
    this.publishInterest();
  }

  private deliverBaseline(listener: ListenerRecord, registration: Registration): void {
    const payload = this.baselinePayload(listener, registration);
    if (payload !== null) this.invoke(registration, payload);
  }

  private baselinePayload(
    listener: ListenerRecord,
    registration: Registration,
  ): InputStateV1["payload"] | null {
    if (!isStateChannel(registration.channel) || !listener.channels.has(registration.channel)) return null;
    const view = this.facts?.inspect(listener.frame) ?? null;
    if (view?.kind !== "live" || !view.deliveryOpen || view.activationId === null) return null;
    const retained = this.retained.get(listener.frameId)?.get(registration.channel);
    if (retained?.activationId !== view.activationId) return null;
    return retained.payload;
  }

  private deliver(
    frameId: string,
    channel: InputChannel,
    payload: InputStateV1["payload"] | InputEventV1["payload"],
  ): void {
    const snapshot: Registration[] = [];
    for (const registration of this.registrations) {
      const listener = registration.listener;
      if (
        !registration.active ||
        registration.channel !== channel ||
        listener.closed ||
        listener.frameId !== frameId ||
        !listener.channels.has(channel)
      ) continue;
      snapshot.push(registration);
    }
    for (const registration of snapshot) this.invoke(registration, payload);
  }

  private invoke(registration: Registration, payload: InputStateV1["payload"]): void {
    try {
      const result = registration.handler(payload as never);
      if (result !== undefined) void Promise.resolve(result).catch(() => {});
    } catch {
      // Business handlers are isolated from Data dispatch and sibling handlers.
    }
  }
}
