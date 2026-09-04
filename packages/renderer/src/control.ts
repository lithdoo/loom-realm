import {
  createRendererDataPeer,
  RENDERER_DATA_PROFILE_V1,
  type DataInboundDisposition,
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
  if (value === null || typeof value !== "object") return;
  const close = (value as { close?: unknown }).close;
  if (typeof close !== "function") return;
  try {
    void Promise.resolve(close.call(value)).catch(() => {});
  } catch {
    // Trusted integration cleanup is secondary to local currentness.
  }
}

class ControlHolder implements RendererControlHolder {
  private currentValue: RendererControlCurrent | null = null;
  private connecting = false;
  private readonly dataSlots = new Map<string, RendererDataSlot>();

  constructor(private readonly data?: RendererDataBinding) {}

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
    const installed = Object.freeze({ peer, snapshot: outcome.snapshot });
    this.currentValue = installed;
    this.reconcileData(peer, outcome.snapshot);
    void this.consume(peer);
    void peer.terminal.then(() => {
      if (this.currentValue?.peer !== peer) return;
      this.currentValue = null;
      this.clearAllData();
    });
    return Object.freeze({ kind: "installed", current: installed });
  }

  private async consume(peer: RendererControlPeer): Promise<void> {
    for await (const snapshot of peer.states()) {
      if (this.currentValue?.peer !== peer) continue;
      this.currentValue = Object.freeze({ peer, snapshot });
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
        if (current !== null) void current.peer.close().catch(() => {});
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
      const accept = (): DataInboundDisposition => acceptedDataMessage;
      peer = createRendererDataPeer({
        binding: {
          carrier,
          subsystemKey: attempt.identity.subsystemKey,
          generation: attempt.identity.generation,
          dataProfile: attempt.identity.dataProfile,
        },
        handlers: {
          onInputInterest: accept,
          onRenderDomains: accept,
          onRenderSnapshot: accept,
          onRenderPatch: accept,
          onRenderEvent: accept,
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
    void peer.terminal.then(() => {
      if (slot.current?.peer !== peer) return;
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
      if (current !== null) void current.peer.close().catch(() => {});
      slot.failed = null;
    }
    this.dataSlots.clear();
  }
}

export function createRendererControlHolder(
  data?: RendererDataBinding,
): RendererControlHolder {
  return new ControlHolder(data);
}
