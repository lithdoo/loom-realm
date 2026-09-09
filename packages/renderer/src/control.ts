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
import { RendererRenderStore } from "./internal/render-store.js";
import { renderQualification } from "./internal/render-qualification.js";
import {
  presentationAttachment,
  type RendererPresentationEffect,
  type RendererPresentationSource,
  type RendererPresentationView,
} from "./internal/presentation-seam.js";
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
  renderHistoryKey: string;
  render: RendererRenderStore;
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
  private renderSessionId: string | null = null;
  private readonly renderHistories = new Map<string, RendererRenderStore>();
  private readonly inputGate = new RendererInputGate();
  private sourceSubscription: SourceSubscription | null = null;
  private presentationEffect: RendererPresentationEffect | null = null;
  private readonly presentationSource: RendererPresentationSource = Object.freeze({
    read: () => this.readPresentation(),
  });

  constructor(
    private readonly data?: RendererDataBinding,
    private readonly input?: RendererInputSource,
  ) {}

  current(): RendererControlCurrent | null {
    return this.currentValue;
  }

  [renderQualification](subsystemKey: string) {
    return this.dataSlots.get(subsystemKey)?.render.snapshotForQualification() ?? null;
  }

  [presentationAttachment](effect: RendererPresentationEffect): () => void {
    if (this.presentationEffect !== null) throw new TypeError("Renderer presentation already attached");
    this.presentationEffect = effect;
    if (this.currentValue !== null) this.notifyPresentation();
    return () => {
      if (this.presentationEffect === effect) this.presentationEffect = null;
    };
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
      this.currentValue = null;
      this.clearAllData();
      this.stopInputSource();
      this.inputGate.setControl(null);
    }
    this.prepareRenderSession(outcome.snapshot.sessionId);
    const installed = Object.freeze({ peer, snapshot: outcome.snapshot });
    this.currentValue = installed;
    this.inputGate.setControl(outcome.snapshot);
    this.startInputSource(peer);
    this.reconcileData(peer, outcome.snapshot);
    this.notifyPresentation();
    void this.consume(peer);
    void peer.terminal.then(() => {
      if (this.currentValue?.peer !== peer) return;
      this.currentValue = null;
      this.clearAllData();
      this.stopInputSource();
      this.inputGate.setControl(null);
    });
    return Object.freeze({ kind: "installed", current: installed });
  }

  private async consume(peer: RendererControlPeer): Promise<void> {
    for await (const snapshot of peer.states()) {
      if (this.currentValue?.peer !== peer) continue;
      this.retireMismatchedData(peer, snapshot);
      this.prepareRenderSession(snapshot.sessionId);
      this.currentValue = Object.freeze({ peer, snapshot });
      this.inputGate.setControl(snapshot);
      this.reconcileData(peer, snapshot);
      this.notifyPresentation();
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
      const existingSlot = this.dataSlots.get(subsystemKey);
      const historyKey = identity === undefined
        ? ""
        : this.renderHistoryKey(snapshot.sessionId, identity);
      const slot = existingSlot ?? {
        current: null,
        pending: null,
        failed: null,
        renderHistoryKey: historyKey,
        render: identity === undefined
          ? new RendererRenderStore(1)
          : this.renderHistory(historyKey, identity.generation),
      };
      this.dataSlots.set(subsystemKey, slot);

      if (identity === undefined || !sameIdentity(slot.current?.identity ?? null, identity)) {
        const current = slot.current;
        slot.current = null;
        if (current !== null) {
          this.inputGate.retireData(subsystemKey, current.peer);
          slot.render.retireCarrier();
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

      if (identity !== undefined && slot.renderHistoryKey !== historyKey) {
        slot.render.retireCarrier();
        slot.renderHistoryKey = historyKey;
        slot.render = this.renderHistory(historyKey, identity.generation);
      }

      if (identity === undefined) {
        this.dataSlots.delete(subsystemKey);
      } else if (slot.current === null && slot.pending === null && slot.failed === null) {
        this.startDataAcquire(slot, identity);
      }
    }
  }

  private retireMismatchedData(
    controlPeer: RendererControlPeer,
    snapshot: RendererAuthoritySnapshotV1,
  ): void {
    const desired = new Map(snapshot.dataAuthorities.map((authority) => [
      authority.subsystemKey,
      Object.freeze({ controlPeer, ...authority }) as DesiredDataIdentity,
    ]));
    for (const [subsystemKey, slot] of this.dataSlots) {
      const identity = desired.get(subsystemKey);
      if (identity === undefined || !sameIdentity(slot.current?.identity ?? null, identity)) {
        const current = slot.current;
        slot.current = null;
        if (current !== null) {
          this.inputGate.retireData(subsystemKey, current.peer);
          slot.render.retireCarrier();
          void current.peer.close().catch(() => {});
        }
      }
      if (identity === undefined || !sameIdentity(slot.pending?.identity ?? null, identity)) {
        const pending = slot.pending;
        slot.pending = null;
        pending?.controller.abort();
      }
      if (identity === undefined || !sameIdentity(slot.failed, identity)) slot.failed = null;
      if (identity === undefined) this.dataSlots.delete(subsystemKey);
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
      slot.render.beginCarrier();
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
          onRenderDomains: (message) => this.commitRenderMessage(slot, peer, () => slot.render.onDomains(message)),
          onRenderSnapshot: (message) => this.commitRenderMessage(slot, peer, () => slot.render.onSnapshot(message)),
          onRenderPatch: (message) => this.commitRenderMessage(slot, peer, () => slot.render.onPatch(message)),
          onRenderEvent: (message) =>
            slot.current?.peer === peer
              ? slot.render.onEvent(message)
              : acceptedDataMessage,
        },
      });
    } catch {
      slot.render.retireCarrier();
      bestEffortCloseCarrier(carrier);
      if (slot.pending === attempt) {
        slot.pending = null;
        if (this.isDesired(attempt.identity)) slot.failed = attempt.identity;
      }
      return;
    }

    if (!this.isCurrentAttempt(slot, attempt)) {
      slot.render.retireCarrier();
      void peer.close().catch(() => {});
      return;
    }
    slot.pending = null;
    slot.current = { identity: attempt.identity, peer };
    this.inputGate.installData(attempt.identity.subsystemKey, peer);
    void peer.terminal.then(() => {
      if (slot.current?.peer !== peer) return;
      this.inputGate.retireData(attempt.identity.subsystemKey, peer);
      slot.render.retireCarrier();
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

  private commitRenderMessage(
    slot: RendererDataSlot,
    peer: RendererDataPeer,
    commit: () => ReturnType<RendererRenderStore["onDomains"]>,
  ): ReturnType<RendererRenderStore["onDomains"]> {
    if (slot.current?.peer !== peer) return acceptedDataMessage;
    const outcome = commit();
    if (outcome.kind === "accepted") this.notifyPresentation();
    return outcome;
  }

  private notifyPresentation(): void {
    try {
      this.presentationEffect?.reevaluate(this.presentationSource);
    } catch {
      // Presentation failure cannot roll back committed authority or Store state.
    }
  }

  private readPresentation(): RendererPresentationView | null {
    const current = this.currentValue;
    if (current === null) return null;
    const subsystems = current.snapshot.dataAuthorities.map((authority) => {
      const slot = this.dataSlots.get(authority.subsystemKey);
      const matching = slot?.current?.identity.controlPeer === current.peer &&
        slot.current.identity.generation === authority.generation &&
        slot.current.identity.dataProfile === authority.dataProfile;
      const store = matching ? slot.render.readPresentationFacts() : null;
      const eligible = store !== null && store.currentCarrier && store.registrySeen &&
        store.domains.every((domain) => domain.baselined);
      return Object.freeze({
        subsystemKey: authority.subsystemKey,
        generation: authority.generation,
        eligible,
        domains: Object.freeze(eligible
          ? store.domains.map(({ domainId, zIndex, roots }) => Object.freeze({ domainId, zIndex, roots }))
          : []),
      });
    });
    return Object.freeze({ sessionId: current.snapshot.sessionId, subsystems: Object.freeze(subsystems) });
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
        slot.render.retireCarrier();
        void current.peer.close().catch(() => {});
      }
      slot.failed = null;
    }
    this.dataSlots.clear();
  }

  private prepareRenderSession(sessionId: string): void {
    if (this.renderSessionId === sessionId) return;
    this.renderSessionId = sessionId;
    this.renderHistories.clear();
  }

  private renderHistoryKey(
    sessionId: string,
    identity: DesiredDataIdentity,
  ): string {
    return JSON.stringify([
      sessionId,
      identity.subsystemKey,
      identity.generation,
      identity.dataProfile,
    ]);
  }

  private renderHistory(key: string, generation: number): RendererRenderStore {
    let store = this.renderHistories.get(key);
    if (store === undefined) {
      store = new RendererRenderStore(generation);
      this.renderHistories.set(key, store);
    }
    return store;
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
