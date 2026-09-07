import type {
  InputChannelV1,
  InputEventChannelV1,
  InputEventV1,
  InputInterestV1,
  InputResetV1,
  InputStateChannelV1,
  InputStateV1,
  RendererDataPeer,
} from "@loomrealm/data";
import type { RendererAuthoritySnapshotV1 } from "@loomrealm/renderer-control";

interface Lease {
  readonly frameId: string;
  readonly activationId: string;
}

type PendingInput = InputStateV1 | InputEventV1 | InputResetV1;

const MAX_PENDING_EVENTS = 256;
const MAX_PENDING_RESETS = 256;

function sameLease(left: Lease | null, right: Lease | null): boolean {
  return left === right || (
    left !== null && right !== null &&
    left.frameId === right.frameId &&
    left.activationId === right.activationId
  );
}

function detachedFrozen<T>(value: T): T {
  if (Array.isArray(value)) {
    return Object.freeze(value.map((item) => detachedFrozen(item))) as T;
  }
  if (value !== null && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) output[key] = detachedFrozen(child);
    return Object.freeze(output) as T;
  }
  return value;
}

class BoundedInputPublisher {
  private queue: PendingInput[] = [];
  private sending = false;
  private retired = false;
  private pendingEvents = 0;
  private pendingResets = 0;

  constructor(private readonly peer: RendererDataPeer) {}

  offerState(lease: Lease, channel: InputStateChannelV1, payload: InputStateV1["payload"]): void {
    if (this.retired) return;
    const message: InputStateV1 = {
      type: "input.state",
      frameId: lease.frameId,
      activationId: lease.activationId,
      channel,
      payload: detachedFrozen(payload),
    };
    for (let index = this.queue.length - 1; index >= 0; index -= 1) {
      const pending = this.queue[index];
      if (pending.type !== "input.state") break;
      if (
        pending.frameId === lease.frameId &&
        pending.activationId === lease.activationId &&
        pending.channel === channel
      ) {
        this.queue[index] = message;
        this.pump();
        return;
      }
    }
    this.queue.push(message);
    this.pump();
  }

  offerEvent(lease: Lease, channel: InputEventChannelV1, payload: InputEventV1["payload"]): void {
    if (this.retired || this.pendingEvents >= MAX_PENDING_EVENTS) return;
    this.pendingEvents += 1;
    this.queue.push({
      type: "input.event",
      frameId: lease.frameId,
      activationId: lease.activationId,
      channel,
      payload: detachedFrozen(payload),
    });
    this.pump();
  }

  reset(lease: Lease): void {
    if (this.retired) return;
    this.discardLease(lease);
    if (this.pendingResets >= MAX_PENDING_RESETS) {
      const oldest = this.queue.findIndex((message) => message.type === "input.reset");
      if (oldest >= 0) {
        this.queue.splice(oldest, 1);
        this.pendingResets -= 1;
        this.normalizeStateRuns();
      }
    }
    this.pendingResets += 1;
    this.queue.push({
      type: "input.reset",
      frameId: lease.frameId,
      activationId: lease.activationId,
    });
    this.pump();
  }

  discardChannel(lease: Lease, channel: InputChannelV1): void {
    this.filterQueue((message) => !(
      message.type !== "input.reset" &&
      message.frameId === lease.frameId &&
      message.activationId === lease.activationId &&
      message.channel === channel
    ));
  }

  discardLease(lease: Lease): void {
    this.filterQueue((message) => !(
      message.type !== "input.reset" &&
      message.frameId === lease.frameId &&
      message.activationId === lease.activationId
    ));
  }

  retire(): void {
    this.retired = true;
    this.queue = [];
    this.pendingEvents = 0;
    this.pendingResets = 0;
  }

  private filterQueue(keep: (message: PendingInput) => boolean): void {
    const retained: PendingInput[] = [];
    let events = 0;
    let resets = 0;
    for (const message of this.queue) {
      if (!keep(message)) continue;
      retained.push(message);
      if (message.type === "input.event") events += 1;
      if (message.type === "input.reset") resets += 1;
    }
    this.queue = retained;
    this.pendingEvents = events;
    this.pendingResets = resets;
    this.normalizeStateRuns();
  }

  private normalizeStateRuns(): void {
    const normalized: PendingInput[] = [];
    let stateIndexes = new Map<string, number>();
    for (const message of this.queue) {
      if (message.type !== "input.state") {
        normalized.push(message);
        stateIndexes = new Map();
        continue;
      }
      const key = `${message.frameId}\u0000${message.activationId}\u0000${message.channel}`;
      const existing = stateIndexes.get(key);
      if (existing === undefined) {
        stateIndexes.set(key, normalized.length);
        normalized.push(message);
      } else {
        normalized[existing] = message;
      }
    }
    this.queue = normalized;
  }

  private pump(): void {
    if (this.retired || this.sending) return;
    const message = this.queue.shift();
    if (message === undefined) return;
    if (message.type === "input.event") this.pendingEvents -= 1;
    if (message.type === "input.reset") this.pendingResets -= 1;
    this.sending = true;
    let send: Promise<unknown>;
    if (message.type === "input.state") send = this.peer.input.sendState(message);
    else if (message.type === "input.event") send = this.peer.input.sendEvent(message);
    else send = this.peer.input.sendReset(message);
    void send.then(
      () => this.sent(),
      () => this.sent(),
    );
  }

  private sent(): void {
    if (this.retired) return;
    this.sending = false;
    this.pump();
  }
}

interface InputSlot {
  readonly peer: RendererDataPeer;
  readonly publisher: BoundedInputPublisher;
  interest: Map<string, Set<InputChannelV1>>;
  lease: Lease | null;
  effective: Set<InputChannelV1>;
}

export class RendererInputGate {
  private snapshot: RendererAuthoritySnapshotV1 | null = null;
  private readonly slots = new Map<string, InputSlot>();
  private readonly availability = new Map<InputChannelV1, boolean>();
  private readonly stateSamples = new Map<InputStateChannelV1, InputStateV1["payload"]>();

  setControl(snapshot: RendererAuthoritySnapshotV1 | null): void {
    this.snapshot = snapshot;
    for (const [subsystemKey, slot] of this.slots) this.recompute(subsystemKey, slot);
  }

  installData(subsystemKey: string, peer: RendererDataPeer): void {
    const previous = this.slots.get(subsystemKey);
    previous?.publisher.retire();
    const slot: InputSlot = {
      peer,
      publisher: new BoundedInputPublisher(peer),
      interest: new Map(),
      lease: null,
      effective: new Set(),
    };
    this.slots.set(subsystemKey, slot);
    this.recompute(subsystemKey, slot);
  }

  retireData(subsystemKey: string, peer: RendererDataPeer): void {
    const slot = this.slots.get(subsystemKey);
    if (slot?.peer !== peer) return;
    slot.publisher.retire();
    this.slots.delete(subsystemKey);
  }

  replaceInterest(
    subsystemKey: string,
    peer: RendererDataPeer,
    message: InputInterestV1,
  ): void {
    const slot = this.slots.get(subsystemKey);
    if (slot?.peer !== peer) return;
    slot.interest = new Map(message.frames.map((frame) => [
      frame.frameId,
      new Set(frame.channels),
    ]));
    this.recompute(subsystemKey, slot);
  }

  setAvailability(channel: InputChannelV1, available: boolean): void {
    const wasAvailable = this.producerAvailable(channel);
    this.availability.set(channel, available);
    if (!available && channel.endsWith(".state")) {
      this.stateSamples.delete(channel as InputStateChannelV1);
    }
    const isAvailable = this.producerAvailable(channel);
    for (const [subsystemKey, slot] of this.slots) {
      const lostEffectiveState = wasAvailable && !isAvailable &&
        channel.endsWith(".state") && slot.effective.has(channel);
      if (lostEffectiveState && slot.lease !== null) {
        slot.publisher.reset(slot.lease);
        slot.effective.delete(channel);
        this.recompute(subsystemKey, slot, true);
      } else {
        this.recompute(subsystemKey, slot);
      }
    }
  }

  updateState(channel: InputStateChannelV1, payload: InputStateV1["payload"]): void {
    const sample = detachedFrozen(payload);
    this.stateSamples.set(channel, sample);
    for (const slot of this.slots.values()) {
      if (slot.lease !== null && slot.effective.has(channel)) {
        slot.publisher.offerState(slot.lease, channel, sample);
      }
    }
  }

  emitEvent(channel: InputEventChannelV1, payload: InputEventV1["payload"]): void {
    for (const slot of this.slots.values()) {
      if (slot.lease !== null && slot.effective.has(channel)) {
        slot.publisher.offerEvent(slot.lease, channel, payload);
      }
    }
  }

  resetProducerFacts(): void {
    this.availability.clear();
    this.stateSamples.clear();
    for (const [subsystemKey, slot] of this.slots) this.recompute(subsystemKey, slot);
  }

  private producerAvailable(channel: InputChannelV1): boolean {
    if (this.availability.get(channel) !== true) return false;
    return !channel.endsWith(".state") || this.stateSamples.has(channel as InputStateChannelV1);
  }

  private currentLease(subsystemKey: string): Lease | null {
    const target = this.snapshot?.inputTarget;
    if (target === null || target === undefined || target.subsystemKey !== subsystemKey) return null;
    const active = this.snapshot?.stack.find((frame) =>
      frame.subsystemKey === subsystemKey &&
      frame.frameId === target.frameId &&
      frame.lifecycle === "active" &&
      frame.activationId === target.activationId
    );
    return active === undefined
      ? null
      : { frameId: target.frameId, activationId: target.activationId };
  }

  private recompute(subsystemKey: string, slot: InputSlot, forceRebaseline = false): void {
    const lease = this.currentLease(subsystemKey);
    const leaseChanged = !sameLease(slot.lease, lease);
    if (leaseChanged && slot.lease !== null) slot.publisher.reset(slot.lease);

    const previous = leaseChanged ? new Set<InputChannelV1>() : slot.effective;
    const next = new Set<InputChannelV1>();
    if (lease !== null) {
      const interested = slot.interest.get(lease.frameId);
      if (interested !== undefined) {
        for (const channel of interested) {
          if (this.producerAvailable(channel)) next.add(channel);
        }
      }
    }

    if (!leaseChanged && slot.lease !== null) {
      for (const channel of previous) {
        if (!next.has(channel)) slot.publisher.discardChannel(slot.lease, channel);
      }
    }

    slot.lease = lease;
    slot.effective = next;
    if (lease === null) return;
    for (const channel of [...next].sort()) {
      if (!channel.endsWith(".state")) continue;
      if (!forceRebaseline && previous.has(channel)) continue;
      const sample = this.stateSamples.get(channel as InputStateChannelV1);
      if (sample !== undefined) {
        slot.publisher.offerState(lease, channel as InputStateChannelV1, sample);
      }
    }
  }
}
