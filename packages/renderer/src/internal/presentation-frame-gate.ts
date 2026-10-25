import type {
  PresentationEventV1,
  PresentationInterestV1,
  RendererDataPeer,
} from "@loomrealm/data";
import type { RendererAuthoritySnapshotV2 } from "@loomrealm/renderer-control";
import type { JsonValue } from "@loomrealm/wire";

type JsonObject = Readonly<Record<string, JsonValue>>;

export interface AcceptedTopFramePresentationEvent {
  readonly sourceSessionId: string;
  readonly sourceSubsystemKey: string;
  readonly sourceGeneration: number;
  readonly sourcePeer: RendererDataPeer;
  readonly targetSubsystemKey: string;
  readonly targetPeer: RendererDataPeer;
  readonly frameId: string;
  readonly activationId: string;
  readonly channel: string;
  readonly name: string;
  readonly domainId: string;
  readonly targetKey: string;
  readonly data: JsonObject;
}

interface Slot {
  readonly peer: RendererDataPeer;
  interest: Map<string, Set<string>>;
  readonly queue: AcceptedTopFramePresentationEvent[];
  sending: boolean;
  retired: boolean;
}

const MAX_PENDING_EVENTS = 256;

export class PresentationFrameGate {
  private snapshot: RendererAuthoritySnapshotV2 | null = null;
  private readonly slots = new Map<string, Slot>();

  constructor(
    private readonly sourceCurrent: (event: AcceptedTopFramePresentationEvent) => boolean,
  ) {}

  setControl(snapshot: RendererAuthoritySnapshotV2 | null): void {
    this.snapshot = snapshot;
    for (const [subsystemKey, slot] of this.slots) {
      this.pruneIneffective(subsystemKey, slot);
    }
  }

  currentTopLease(): {
    readonly subsystemKey: string;
    readonly frameId: string;
    readonly activationId: string;
  } | null {
    const top = this.snapshot?.stack.at(-1);
    if (top === undefined || top.lifecycle !== "active" || top.activationId === undefined) return null;
    return Object.freeze({
      subsystemKey: top.subsystemKey,
      frameId: top.frameId,
      activationId: top.activationId,
    });
  }

  currentPeer(subsystemKey: string): RendererDataPeer | null {
    const slot = this.slots.get(subsystemKey);
    return slot === undefined || slot.retired ? null : slot.peer;
  }

  installData(subsystemKey: string, peer: RendererDataPeer): void {
    const previous = this.slots.get(subsystemKey);
    if (previous !== undefined) {
      this.pruneSource(previous.peer);
      this.retireSlot(previous);
    }
    this.slots.set(subsystemKey, {
      peer,
      interest: new Map(),
      queue: [],
      sending: false,
      retired: false,
    });
  }

  retireData(subsystemKey: string, peer: RendererDataPeer): void {
    const slot = this.slots.get(subsystemKey);
    if (slot?.peer !== peer) return;
    this.pruneSource(peer);
    this.retireSlot(slot);
    this.slots.delete(subsystemKey);
  }

  replaceInterest(subsystemKey: string, peer: RendererDataPeer, message: PresentationInterestV1): void {
    const slot = this.slots.get(subsystemKey);
    if (slot?.peer !== peer) return;
    const next = new Map(message.frames.map((frame) => [frame.frameId, new Set(frame.channels)]));
    slot.interest = next;
    this.pruneIneffective(subsystemKey, slot);
  }

  offer(event: AcceptedTopFramePresentationEvent): void {
    const slot = this.slots.get(event.targetSubsystemKey);
    if (slot === undefined || slot.peer !== event.targetPeer || slot.retired) return;
    if (!this.effective(event.targetSubsystemKey, slot, event)) return;
    this.pruneIneffective(event.targetSubsystemKey, slot);
    if (slot.queue.length >= MAX_PENDING_EVENTS) return;
    slot.queue.push(event);
    this.pump(event.targetSubsystemKey, slot);
  }

  private pump(subsystemKey: string, slot: Slot): void {
    if (slot.retired || slot.sending) return;
    for (;;) {
      const event = slot.queue.shift();
      if (event === undefined) return;
      if (!this.effective(subsystemKey, slot, event)) continue;
      const message: PresentationEventV1 = Object.freeze({
        type: "presentation.event",
        sourceSubsystemKey: event.sourceSubsystemKey,
        domainId: event.domainId,
        targetKey: event.targetKey,
        frameId: event.frameId,
        activationId: event.activationId,
        channel: event.channel,
        name: event.name,
        data: event.data,
      });
      slot.sending = true;
      void slot.peer.presentation.sendEvent(message).then(
        (outcome) => this.sent(subsystemKey, slot, outcome.kind === "terminal"),
        () => this.sent(subsystemKey, slot, true),
      );
      return;
    }
  }

  private sent(subsystemKey: string, slot: Slot, terminal: boolean): void {
    if (slot.retired) return;
    slot.sending = false;
    if (terminal) {
      this.retireSlot(slot);
      return;
    }
    this.pump(subsystemKey, slot);
  }

  private effective(subsystemKey: string, slot: Slot, event: AcceptedTopFramePresentationEvent): boolean {
    if (slot.retired || slot.peer !== event.targetPeer || subsystemKey !== event.targetSubsystemKey) return false;
    if (!this.sourceCurrent(event)) return false;
    const top = this.snapshot?.stack.at(-1);
    return top !== undefined &&
      top.subsystemKey === event.targetSubsystemKey &&
      top.frameId === event.frameId &&
      top.lifecycle === "active" &&
      top.activationId === event.activationId &&
      slot.interest.get(event.frameId)?.has(event.channel) === true;
  }

  private retireSlot(slot: Slot): void {
    slot.retired = true;
    slot.queue.length = 0;
    slot.interest.clear();
  }

  private pruneIneffective(subsystemKey: string, slot: Slot): void {
    for (let index = slot.queue.length - 1; index >= 0; index -= 1) {
      const event = slot.queue[index]!;
      if (!this.effective(subsystemKey, slot, event)) slot.queue.splice(index, 1);
    }
  }

  private pruneSource(peer: RendererDataPeer): void {
    for (const slot of this.slots.values()) {
      for (let index = slot.queue.length - 1; index >= 0; index -= 1) {
        if (slot.queue[index]?.sourcePeer === peer) slot.queue.splice(index, 1);
      }
    }
  }
}
