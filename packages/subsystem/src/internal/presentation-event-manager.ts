import type {
  DataInboundDisposition,
  PresentationEventV1,
  PresentationInterestV1,
  SubsystemDataPeer,
} from "@loomrealm/data";
import { FrameClosedError } from "../errors.js";
import type { Frame } from "../model.js";
import type {
  PresentationEventClient,
  PresentationEventHandler,
  PresentationEventListener,
  PresentationFrameEvent,
} from "../presentation-events.js";

export type FrameDeliveryView =
  | { readonly kind: "foreign" }
  | { readonly kind: "closed" }
  | {
      readonly kind: "live";
      readonly frameId: string;
      readonly activationId: string | null;
      readonly deliveryOpen: boolean;
    };

export interface PresentationRuntimeFacts {
  inspect(frame: Frame): FrameDeliveryView;
  inspectById(frameId: string): Exclude<FrameDeliveryView, { readonly kind: "foreign" }> | null;
}

interface Registration {
  readonly listener: ListenerRecord;
  readonly channel: string;
  readonly handler: PresentationEventHandler;
  active: boolean;
}

interface ListenerRecord {
  readonly frame: Frame;
  readonly frameId: string;
  channels: Set<string>;
  readonly registrations: Registration[];
  closed: boolean;
}

const accepted: DataInboundDisposition = Object.freeze({ kind: "accepted" });

function scalarLexical(left: string, right: string): number {
  const leftScalars = left[Symbol.iterator]();
  const rightScalars = right[Symbol.iterator]();
  while (true) {
    const leftNext = leftScalars.next();
    const rightNext = rightScalars.next();
    if (leftNext.done || rightNext.done) {
      if (leftNext.done === rightNext.done) return 0;
      return leftNext.done ? -1 : 1;
    }
    const difference = leftNext.value.codePointAt(0)! - rightNext.value.codePointAt(0)!;
    if (difference !== 0) return difference;
  }
}

function validateChannel(value: unknown): asserts value is string {
  if (typeof value !== "string") throw new TypeError("Invalid Presentation channel");
  let valid = true;
  for (const character of value) {
    const code = character.codePointAt(0)!;
    if (code <= 0x1f || code === 0x7f || (code >= 0xd800 && code <= 0xdfff)) valid = false;
  }
  if (!valid || value.length === 0) {
    throw new TypeError("Invalid Presentation channel");
  }
}

function validateContribution(channels: readonly string[]): Set<string> {
  if (!Array.isArray(channels)) throw new TypeError("Presentation channels must be an array");
  const result = new Set<string>();
  for (const channel of channels) {
    validateChannel(channel);
    if (result.has(channel)) throw new TypeError("Duplicate Presentation channel");
    result.add(channel);
  }
  return result;
}

function detachedFrozen<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  const root: Record<string, unknown> | unknown[] = Array.isArray(value) ? new Array(value.length) : {};
  const completed = new WeakMap<object, object>([[value, root]]);
  const active = new WeakSet<object>([value]);
  const stack: Array<{
    readonly source: object;
    readonly target: Record<string, unknown> | unknown[];
    readonly entries: readonly { readonly key: string | number; readonly value: unknown }[];
    next: number;
  }> = [{
    source: value,
    target: root,
    entries: Array.isArray(value)
      ? value.map((item, index) => ({ key: index, value: item }))
      : Object.entries(value).map(([key, item]) => ({ key, value: item })),
    next: 0,
  }];
  while (stack.length > 0) {
    const frame = stack[stack.length - 1]!;
    if (frame.next >= frame.entries.length) {
      Object.freeze(frame.target);
      active.delete(frame.source);
      stack.pop();
      continue;
    }
    const entry = frame.entries[frame.next++]!;
    if (entry.value === null || typeof entry.value !== "object") {
      (frame.target as Record<string | number, unknown>)[entry.key] = entry.value;
      continue;
    }
    if (active.has(entry.value)) throw new TypeError("Cyclic Presentation Event data");
    const prior = completed.get(entry.value);
    if (prior !== undefined) {
      (frame.target as Record<string | number, unknown>)[entry.key] = prior;
      continue;
    }
    const target: Record<string, unknown> | unknown[] = Array.isArray(entry.value)
      ? new Array(entry.value.length)
      : {};
    completed.set(entry.value, target);
    active.add(entry.value);
    (frame.target as Record<string | number, unknown>)[entry.key] = target;
    stack.push({
      source: entry.value,
      target,
      entries: Array.isArray(entry.value)
        ? entry.value.map((item, index) => ({ key: index, value: item }))
        : Object.entries(entry.value).map(([key, item]) => ({ key, value: item })),
      next: 0,
    });
  }
  return root as T;
}

export class PresentationEventManager implements PresentationEventClient {
  private facts: PresentationRuntimeFacts | null = null;
  private readonly listeners = new Set<ListenerRecord>();
  private readonly registrations: Registration[] = [];
  private desired = new Map<string, Set<string>>();
  private peer: SubsystemDataPeer | null = null;
  private peerEpoch = 0;
  private interestInFlight = false;
  private interestPending = false;
  private closed = false;

  bindRuntime(facts: PresentationRuntimeFacts): void {
    if (this.facts !== null) throw new TypeError("PresentationEventManager Runtime already bound");
    this.facts = facts;
  }

  createListener(options: { readonly frame: Frame; readonly channels: readonly string[] }): PresentationEventListener {
    if (this.closed) throw new TypeError("PresentationEventManager is closed");
    if (options === null || typeof options !== "object") throw new TypeError("Invalid Presentation listener options");
    const view = this.requireFrame(options.frame);
    const channels = validateContribution(options.channels);
    const record: ListenerRecord = {
      frame: options.frame,
      frameId: view.frameId,
      channels,
      registrations: [],
      closed: false,
    };
    this.listeners.add(record);
    this.rebuildDesired();
    return Object.freeze({
      on: (channel: string, handler: PresentationEventHandler) => this.register(record, channel, handler),
      setChannels: (next: readonly string[]) => this.setChannels(record, next),
      close: () => this.closeListener(record),
    });
  }

  setDataPeer(peer: SubsystemDataPeer | null): void {
    if (this.closed && peer !== null) return;
    this.peerEpoch += 1;
    this.peer = peer;
    this.interestInFlight = false;
    this.interestPending = false;
    if (peer !== null) this.publishInterest();
  }

  onEvent(message: PresentationEventV1): DataInboundDisposition {
    const view = this.facts?.inspectById(message.frameId) ?? null;
    if (
      view?.kind !== "live" ||
      !view.deliveryOpen ||
      view.activationId !== message.activationId ||
      !this.desired.get(message.frameId)?.has(message.channel)
    ) return accepted;

    const event: PresentationFrameEvent = Object.freeze({
      channel: message.channel,
      name: message.name,
      data: detachedFrozen(message.data),
      source: Object.freeze({
        subsystemKey: message.sourceSubsystemKey,
        domainId: message.domainId,
        targetKey: message.targetKey,
      }),
    });
    const candidates = this.registrations.filter((registration) =>
      registration.active &&
      !registration.listener.closed &&
      registration.listener.frameId === message.frameId &&
      registration.channel === message.channel &&
      registration.listener.channels.has(message.channel)
    );
    for (const registration of candidates) {
      const current = this.facts?.inspect(registration.listener.frame) ?? null;
      if (
        !registration.active ||
        registration.listener.closed ||
        current?.kind !== "live" ||
        !current.deliveryOpen ||
        current.activationId !== message.activationId ||
        !registration.listener.channels.has(message.channel) ||
        !this.desired.get(message.frameId)?.has(message.channel)
      ) continue;
      try {
        const result = registration.handler(event);
        if (result !== undefined) void Promise.resolve(result).catch(() => {});
      } catch {
        // Business handler failures stay local to the registration.
      }
    }
    return accepted;
  }

  closeFrame(frameId: string): void {
    let changed = false;
    for (const listener of [...this.listeners]) {
      if (listener.frameId !== frameId) continue;
      this.closeListenerRecord(listener);
      changed = true;
    }
    if (changed) this.rebuildDesired();
  }

  closeAll(): void {
    this.closed = true;
    for (const listener of this.listeners) {
      listener.closed = true;
      for (const registration of listener.registrations) registration.active = false;
    }
    this.listeners.clear();
    this.registrations.length = 0;
    this.desired.clear();
    this.peerEpoch += 1;
    this.peer = null;
    this.interestInFlight = false;
    this.interestPending = false;
  }

  private requireFrame(frame: Frame): Extract<FrameDeliveryView, { readonly kind: "live" }> {
    if (frame === null || typeof frame !== "object") throw new TypeError("Invalid Frame");
    const view = this.facts?.inspect(frame) ?? { kind: "foreign" as const };
    if (view.kind === "foreign") throw new TypeError("Foreign Frame");
    if (view.kind === "closed") throw new FrameClosedError();
    return view;
  }

  private register(listener: ListenerRecord, channel: string, handler: PresentationEventHandler): () => void {
    this.requireOpen(listener);
    validateChannel(channel);
    if (!listener.channels.has(channel)) throw new TypeError("Presentation channel is not contributed");
    if (typeof handler !== "function") throw new TypeError("Presentation handler must be a function");
    const registration: Registration = { listener, channel, handler, active: true };
    listener.registrations.push(registration);
    this.registrations.push(registration);
    let subscribed = true;
    return () => {
      if (!subscribed) return;
      subscribed = false;
      registration.active = false;
      this.removeRegistration(registration);
    };
  }

  private setChannels(listener: ListenerRecord, channels: readonly string[]): void {
    this.requireOpen(listener);
    const next = validateContribution(channels);
    listener.channels = next;
    this.rebuildDesired();
  }

  private closeListener(listener: ListenerRecord): void {
    if (listener.closed) return;
    this.closeListenerRecord(listener);
    this.rebuildDesired();
  }

  private closeListenerRecord(listener: ListenerRecord): void {
    listener.closed = true;
    for (const registration of listener.registrations) registration.active = false;
    for (let index = this.registrations.length - 1; index >= 0; index -= 1) {
      if (this.registrations[index]?.listener === listener) this.registrations.splice(index, 1);
    }
    listener.registrations.length = 0;
    this.listeners.delete(listener);
  }

  private removeRegistration(registration: Registration): void {
    const local = registration.listener.registrations.indexOf(registration);
    if (local >= 0) registration.listener.registrations.splice(local, 1);
    const global = this.registrations.indexOf(registration);
    if (global >= 0) this.registrations.splice(global, 1);
  }

  private requireOpen(listener: ListenerRecord): void {
    if (listener.closed) throw new TypeError("Presentation listener is closed");
  }

  private rebuildDesired(): void {
    const next = new Map<string, Set<string>>();
    for (const listener of this.listeners) {
      if (listener.closed) continue;
      const union = next.get(listener.frameId) ?? new Set<string>();
      for (const channel of listener.channels) union.add(channel);
      if (union.size > 0) next.set(listener.frameId, union);
    }
    const changed = !this.sameRegistry(this.desired, next);
    this.desired = next;
    if (changed) this.publishInterest();
  }

  private sameRegistry(left: Map<string, Set<string>>, right: Map<string, Set<string>>): boolean {
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
    const message: PresentationInterestV1 = {
      type: "presentation.interest",
      frames: [...this.desired.entries()]
        .sort(([left], [right]) => scalarLexical(left, right))
        .map(([frameId, channels]) => ({ frameId, channels: [...channels].sort(scalarLexical) })),
    };
    this.interestInFlight = true;
    void peer.presentation.sendInterest(message).then(
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
}
