import {
  createRendererDataPeer,
  RENDERER_DATA_PROFILE_V1,
  type RendererDataPeer,
} from "@loomrealm/data";
import type { RendererDataBinding } from "@loomrealm/platform-ports";
import {
  connectRendererControlPeer,
  type RendererAuthoritySnapshotV1,
  type RendererControlPeer,
  type RendererPeerConnectOptions,
  type RendererPeerConnectOutcome,
} from "@loomrealm/renderer-control";
import { RendererInputGate } from "./internal/input-gate.js";
import type { RendererInputSource, RendererInputSourceChange } from "./input.js";

export interface RendererControlCurrent {
  readonly peer: RendererControlPeer;
  readonly snapshot: RendererAuthoritySnapshotV1;
}

export type RendererControlHolderConnectOutcome =
  | { readonly kind: "installed"; readonly current: RendererControlCurrent }
  | { readonly kind: "rejected"; readonly code: "RENDERER_AUTHENTICATION_FAILED" | "RENDERER_CONTROL_PROTOCOL_UNSUPPORTED" | "PROTOCOL_STATE_ERROR" }
  | { readonly kind: "terminal" };

export interface RendererControlHolder {
  current(): RendererControlCurrent | null;
  connect(options: RendererPeerConnectOptions): Promise<RendererControlHolderConnectOutcome>;
}

interface DesiredDataIdentity {
  readonly controlPeer: RendererControlPeer;
  readonly subsystemKey: string;
  readonly generation: number;
  readonly dataProfile: string;
}

interface PendingDataAcquire {
  readonly identity: DesiredDataIdentity;
  readonly controller: AbortController;
}

interface CurrentDataPeer {
  readonly identity: DesiredDataIdentity;
  readonly peer: RendererDataPeer;
}

interface RendererDataSlot {
  current: CurrentDataPeer | null;
  pending: PendingDataAcquire | null;
  failed: DesiredDataIdentity | null;
}

const acceptedDataMessage = Object.freeze({ kind: "accepted" } as const);

function sameIdentity(
  left: DesiredDataIdentity | null,
  right: DesiredDataIdentity,
): boolean {
  return left !== null &&
    left.controlPeer === right.controlPeer &&
    left.subsystemKey === right.subsystemKey &&
    left.generation === right.generation &&
    left.dataProfile === right.dataProfile;
}

function bestEffortCloseCarrier(value: unknown): void {
  try {
    if (value === null || typeof value !== "object") return;
    const close = (value as { close?: unknown }).close;
    if (typeof close !== "function") return;
    void Promise.resolve(close.call(value)).catch(() => {});
  } catch {
    // Trusted integration cleanup is secondary to local currentness.
  }
}

function validateRendererDataBinding(
  data: RendererDataBinding | undefined,
): void {
  if (data === undefined) return;
  let valid = false;
  try {
    valid = data !== null && typeof data === "object" &&
      typeof data.acquire === "function";
  } catch {
    // Accessor-backed integration objects are not valid capability bindings.
  }
  if (!valid) throw new TypeError("Invalid RendererDataBinding");
}

function validateRendererInputSource(
  input: RendererInputSource | undefined,
): void {
  if (input === undefined) return;
  let valid = false;
  try {
    valid = input !== null && typeof input === "object" &&
      typeof input.start === "function";
  } catch {
    // Accessor-backed integration objects are not valid source capabilities.
  }
  if (!valid) throw new TypeError("Invalid RendererInputSource");
}

interface SourceSubscription {
  readonly peer: RendererControlPeer;
  phase: "starting" | "current" | "invalid";
  readonly staged: RendererInputSourceChange[];
  stop: (() => void) | null;
}

class ControlHolder implements RendererControlHolder {
  private currentValue: RendererControlCurrent | null = null;
  private connecting = false;
  private readonly dataSlots = new Map<string, RendererDataSlot>();
  private readonly inputGate = new RendererInputGate();
  private sourceSubscription: SourceSubscription | null = null;

  constructor(
    private readonly data?: RendererDataBinding,
    private readonly input?: RendererInputSource,
  ) {}

  current(): RendererControlCurrent | null {
    return this.currentValue;
  }

  async connect(options: RendererPeerConnectOptions): Promise<RendererControlHolderConnectOutcome> {
    if (this.connecting)
      throw new TypeError("Renderer Control connect already in progress");
    this.connecting = true;
    let outcome: RendererPeerConnectOutcome;
    try {
      outcome = await connectRendererControlPeer(options);
    } finally {
      this.connecting = false;
    }
    if (outcome.kind === "rejected")
      return Object.freeze({ kind: "rejected", code: outcome.code });
    if (outcome.kind === "terminal") return Object.freeze({ kind: "terminal" });

    const peer = outcome.peer;
    if (this.currentValue !== null) {
      this.stopInputSource();
      this.currentValue = null;
      this.inputGate.setControl(null);
      this.clearAllData();
    }
    const installed = Object.freeze({ peer, snapshot: outcome.snapshot });
    this.currentValue = installed;
    this.inputGate.setControl(outcome.snapshot);
    this.startInputSource(peer);
    this.reconcileData(peer, outcome.snapshot);
    void this.consume(peer);
    void peer.terminal.then(() => {
      if (this.currentValue?.peer !== peer) return;
      this.stopInputSource();
      this.currentValue = null;
      this.inputGate.setControl(null);
      this.clearAllData();
    });
    return Object.freeze({ kind: "installed", current: installed });
  }

  private async consume(peer: RendererControlPeer): Promise<void> {
    for await (const snapshot of peer.states()) {
      if (this.currentValue?.peer !== peer) continue;
      this.currentValue = Object.freeze({ peer, snapshot });
      this.inputGate.setControl(snapshot);
      this.reconcileData(peer, snapshot);
    }
  }

  private reconcileData(
    controlPeer: RendererControlPeer,
    snapshot: RendererAuthoritySnapshotV1,
  ): void {
    if (this.data === undefined) return;
    const desired = new Map(snapshot.dataAuthorities.map((authority) => [
      authority.subsystemKey,
      Object.freeze({ controlPeer, ...authority }) as DesiredDataIdentity,
    ]));
    const keys = new Set([...this.dataSlots.keys(), ...desired.keys()]);

    for (const subsystemKey of keys) {
      const identity = desired.get(subsystemKey);
      const slot = this.dataSlots.get(subsystemKey) ?? {
        current: null,
        pending: null,
        failed: null,
      };
      this.dataSlots.set(subsystemKey, slot);

      if (identity === undefined || !sameIdentity(slot.current?.identity ?? null, identity)) {
        const current = slot.current;
        slot.current = null;
        if (current !== null) {
          this.inputGate.retireData(subsystemKey, current.peer);
          void current.peer.close().catch(() => {});
        }
      }
      if (identity === undefined || !sameIdentity(slot.pending?.identity ?? null, identity)) {
        const pending = slot.pending;
        slot.pending = null;
        pending?.controller.abort();
      }
      if (identity === undefined || !sameIdentity(slot.failed, identity)) {
        slot.failed = null;
      }

      if (identity === undefined) {
        this.dataSlots.delete(subsystemKey);
      } else if (slot.current === null && slot.pending === null && slot.failed === null) {
        this.startDataAcquire(slot, identity);
      }
    }
  }

  private startDataAcquire(
    slot: RendererDataSlot,
    identity: DesiredDataIdentity,
  ): void {
    const binding = this.data;
    if (binding === undefined) return;
    const attempt: PendingDataAcquire = {
      identity,
      controller: new AbortController(),
    };
    slot.pending = attempt;
    void Promise.resolve()
      .then(() => binding.acquire(
        identity.subsystemKey,
        identity.generation,
        identity.dataProfile,
        attempt.controller.signal,
      ))
      .then(
        (carrier) => this.installDataAcquire(slot, attempt, carrier),
        () => this.rejectDataAcquire(slot, attempt),
      );
  }

  private installDataAcquire(
    slot: RendererDataSlot,
    attempt: PendingDataAcquire,
    carrier: Awaited<ReturnType<RendererDataBinding["acquire"]>>,
  ): void {
    if (!this.isCurrentAttempt(slot, attempt)) {
      bestEffortCloseCarrier(carrier);
      return;
    }

    let peer: RendererDataPeer;
    try {
      if (attempt.identity.dataProfile !== RENDERER_DATA_PROFILE_V1) {
        throw new TypeError("Unsupported Renderer Data profile");
      }
      peer = createRendererDataPeer({
        binding: {
          carrier,
          subsystemKey: attempt.identity.subsystemKey,
          generation: attempt.identity.generation,
          dataProfile: attempt.identity.dataProfile,
        },
        handlers: {
          onInputInterest: (message) => {
            if (slot.current?.peer === peer) {
              this.inputGate.replaceInterest(
                attempt.identity.subsystemKey,
                peer,
                message,
              );
            }
            return acceptedDataMessage;
          },
          onRenderDomains: () => acceptedDataMessage,
          onRenderSnapshot: () => acceptedDataMessage,
          onRenderPatch: () => acceptedDataMessage,
          onRenderEvent: () => acceptedDataMessage,
        },
      });
    } catch {
      bestEffortCloseCarrier(carrier);
      if (slot.pending === attempt) {
        slot.pending = null;
        if (this.isDesired(attempt.identity)) slot.failed = attempt.identity;
      }
      return;
    }

    if (!this.isCurrentAttempt(slot, attempt)) {
      void peer.close().catch(() => {});
      return;
    }
    slot.pending = null;
    slot.current = { identity: attempt.identity, peer };
    this.inputGate.installData(attempt.identity.subsystemKey, peer);
    void peer.terminal.then(() => {
      if (slot.current?.peer !== peer) return;
      this.inputGate.retireData(attempt.identity.subsystemKey, peer);
      slot.current = null;
      if (
        this.isDesired(attempt.identity) &&
        slot.pending === null &&
        slot.failed === null
      ) {
        this.startDataAcquire(slot, attempt.identity);
      }
    });
  }

  private rejectDataAcquire(
    slot: RendererDataSlot,
    attempt: PendingDataAcquire,
  ): void {
    if (slot.pending !== attempt) return;
    slot.pending = null;
    if (attempt.controller.signal.aborted || !this.isDesired(attempt.identity)) return;
    slot.failed = attempt.identity;
  }

  private isCurrentAttempt(
    slot: RendererDataSlot,
    attempt: PendingDataAcquire,
  ): boolean {
    return slot.pending === attempt &&
      !attempt.controller.signal.aborted &&
      this.isDesired(attempt.identity);
  }

  private isDesired(identity: DesiredDataIdentity): boolean {
    const current = this.currentValue;
    if (current?.peer !== identity.controlPeer) return false;
    const authority = current.snapshot.dataAuthorities.find(
      ({ subsystemKey }) => subsystemKey === identity.subsystemKey,
    );
    return authority !== undefined &&
      authority.generation === identity.generation &&
      authority.dataProfile === identity.dataProfile;
  }

  private clearAllData(): void {
    for (const slot of this.dataSlots.values()) {
      const pending = slot.pending;
      slot.pending = null;
      pending?.controller.abort();
      const current = slot.current;
      slot.current = null;
      if (current !== null) {
        this.inputGate.retireData(current.identity.subsystemKey, current.peer);
        void current.peer.close().catch(() => {});
      }
      slot.failed = null;
    }
    this.dataSlots.clear();
  }

  private startInputSource(peer: RendererControlPeer): void {
    const source = this.input;
    this.inputGate.resetProducerFacts();
    if (source === undefined) return;
    const subscription: SourceSubscription = {
      peer,
      phase: "starting",
      staged: [],
      stop: null,
    };
    this.sourceSubscription = subscription;
    const emit = (change: RendererInputSourceChange): void => {
      if (this.sourceSubscription !== subscription || subscription.phase === "invalid") return;
      if (subscription.phase === "starting") {
        this.validateSourceChange(change);
        if (change.kind !== "event") subscription.staged.push(change);
        return;
      }
      this.applySourceChange(change);
    };

    try {
      const stop = source.start(emit);
      if (typeof stop !== "function") throw new TypeError("Input source start must return stop function");
      subscription.stop = stop;
      for (const change of subscription.staged) this.applySourceChange(change);
      subscription.staged.length = 0;
      subscription.phase = "current";
    } catch {
      subscription.phase = "invalid";
      if (this.sourceSubscription === subscription) this.sourceSubscription = null;
      this.inputGate.resetProducerFacts();
      try {
        subscription.stop?.();
      } catch {
        // Failed source bootstrap cleanup is locally contained.
      }
    }
  }

  private stopInputSource(): void {
    const subscription = this.sourceSubscription;
    if (subscription === null) return;
    this.sourceSubscription = null;
    subscription.phase = "invalid";
    subscription.staged.length = 0;
    this.inputGate.resetProducerFacts();
    try {
      subscription.stop?.();
    } catch {
      // Local stop failure cannot restore retired producer facts.
    }
  }

  private validateSourceChange(change: RendererInputSourceChange): void {
    if (change === null || typeof change !== "object") {
      throw new TypeError("Invalid Renderer input source change");
    }
    if (change.kind === "availability") {
      if (typeof change.channel !== "string" || typeof change.available !== "boolean") {
        throw new TypeError("Invalid Renderer input availability change");
      }
      return;
    }
    if (change.kind === "state" || change.kind === "event") {
      if (
        typeof change.channel !== "string" ||
        change.payload === null ||
        typeof change.payload !== "object" ||
        Array.isArray(change.payload)
      ) throw new TypeError("Invalid Renderer input payload change");
      return;
    }
    throw new TypeError("Invalid Renderer input source change kind");
  }

  private applySourceChange(change: RendererInputSourceChange): void {
    this.validateSourceChange(change);
    if (change.kind === "availability") {
      this.inputGate.setAvailability(change.channel, change.available);
    } else if (change.kind === "state") {
      this.inputGate.updateState(change.channel, change.payload);
    } else {
      this.inputGate.emitEvent(change.channel, change.payload);
    }
  }
}

export function createRendererControlHolder(
  data?: RendererDataBinding,
  input?: RendererInputSource,
): RendererControlHolder {
  validateRendererDataBinding(data);
  validateRendererInputSource(input);
  return new ControlHolder(data, input);
}
