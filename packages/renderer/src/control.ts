import {
  createRendererDataPeer,
  RENDERER_DATA_PROFILE_V2,
  type RendererDataPeer,
  type RenderEventV1,
} from "@loomrealm/data";
import type { RendererDataBinding } from "@loomrealm/platform-ports";
import {
  connectRendererControlPeer,
  type RendererAuthoritySnapshotV2,
  type RendererControlPeer,
  type RendererPeerConnectOptions,
  type RendererPeerConnectOutcome,
} from "@loomrealm/renderer-control";
import { utf8ByteLength, type JsonValue } from "@loomrealm/wire";
import { RendererRenderStore } from "./internal/render-store.js";
import { renderQualification } from "./internal/render-qualification.js";
import {
  presentationAttachment,
  type RendererPresentationRenderEvent,
  type RendererPresentationEffect,
  type RendererPresentationNodeEvent,
  type RendererPresentationSource,
  type RendererPresentationView,
} from "./internal/presentation-seam.js";
import type { RendererViewportLogicalSample, RendererViewportSource } from "./viewport.js";
import { RendererViewportPublisher } from "./internal/viewport-publisher.js";
import {
  WEB_PRESENTATION_EVENT_CHANNEL_V2,
  type PresentationEventPublication,
  type RendererPresentationEventBinding,
} from "./presentation-event.js";

export interface RendererControlCurrent {
  readonly peer: RendererControlPeer;
  readonly snapshot: RendererAuthoritySnapshotV2;
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

type JsonObject = Readonly<Record<string, JsonValue>>;

type AcceptedPresentationEvent =
  { readonly kind: "publication"; readonly publication: PresentationEventPublication };

interface QueuedPresentationEvent {
  readonly epoch: number;
  readonly event: AcceptedPresentationEvent;
}

const acceptedDataMessage = Object.freeze({ kind: "accepted" } as const);
const MAX_STAGED_PRESENTATION_EVENTS = 256;
const MAX_PRESENTATION_PUBLICATIONS = 256;

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

function validatePresentationEventName(value: unknown): string {
  return validatePresentationText(value, 128, "name");
}

function validatePresentationChannel(value: unknown): string {
  return validatePresentationText(value, 256, "channel");
}

function validatePresentationText(value: unknown, limit: number, label: string): string {
  if (typeof value !== "string") throw new TypeError(`Invalid Web Presentation custom event ${label}`);
  let bytes = 0;
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit <= 0x1f || codeUnit === 0x7f) {
      throw new TypeError(`Invalid Web Presentation custom event ${label}`);
    }
    if (codeUnit <= 0x7f) {
      bytes += 1;
    } else if (codeUnit <= 0x7ff) {
      bytes += 2;
    } else if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) {
        throw new TypeError(`Invalid Web Presentation custom event ${label}`);
      }
      bytes += 4;
      index += 1;
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      throw new TypeError(`Invalid Web Presentation custom event ${label}`);
    } else {
      bytes += 3;
    }
  }
  if (bytes < 1 || bytes > limit) throw new TypeError(`Invalid Web Presentation custom event ${label}`);
  return value;
}

function validatePresentationOptions(value: unknown): { readonly broadcast: boolean; readonly channel: string } {
  if (value === undefined) {
    return Object.freeze({ broadcast: false, channel: WEB_PRESENTATION_EVENT_CHANNEL_V2 });
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Invalid Web Presentation custom event options");
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError("Invalid Web Presentation custom event options");
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  if (keys.some((key) => typeof key !== "string" || (key !== "broadcast" && key !== "channel"))) {
    throw new TypeError("Invalid Web Presentation custom event options");
  }
  for (const key of keys as string[]) {
    const descriptor = descriptors[key];
    if (descriptor === undefined || !("value" in descriptor) || !descriptor.enumerable) {
      throw new TypeError("Invalid Web Presentation custom event options");
    }
  }
  const broadcastValue = descriptors.broadcast?.value;
  const channelValue = descriptors.channel?.value;
  const broadcast = broadcastValue === undefined ? false : broadcastValue;
  if (typeof broadcast !== "boolean") {
    throw new TypeError("Invalid Web Presentation custom event broadcast option");
  }
  const channel = channelValue === undefined
    ? WEB_PRESENTATION_EVENT_CHANNEL_V2
    : validatePresentationChannel(channelValue);
  return Object.freeze({ broadcast, channel });
}

function validatePresentationData(value: unknown): JsonObject {
  let members = 0;
  const visit = (candidate: unknown, depth: number): JsonValue => {
    if (depth > 64) throw new TypeError("Invalid Web Presentation custom event data");
    if (candidate === null || typeof candidate === "boolean" || typeof candidate === "string") return candidate;
    if (typeof candidate === "number") {
      if (!Number.isFinite(candidate)) throw new TypeError("Invalid Web Presentation custom event data");
      return candidate;
    }
    if (typeof candidate !== "object") throw new TypeError("Invalid Web Presentation custom event data");
    if (Array.isArray(candidate)) {
      members += candidate.length;
      if (members > 16_384) throw new TypeError("Invalid Web Presentation custom event data");
      return Object.freeze(candidate.map((child) => visit(child, depth + 1)));
    }
    const prototype = Object.getPrototypeOf(candidate);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError("Invalid Web Presentation custom event data");
    }
    const keys = Reflect.ownKeys(candidate);
    if (keys.some((key) => typeof key !== "string")) {
      throw new TypeError("Invalid Web Presentation custom event data");
    }
    members += keys.length;
    if (members > 16_384) throw new TypeError("Invalid Web Presentation custom event data");
    const output: Record<string, JsonValue> = {};
    for (const key of keys as string[]) {
      const descriptor = Object.getOwnPropertyDescriptor(candidate, key);
      if (descriptor === undefined || !("value" in descriptor) || !descriptor.enumerable) {
        throw new TypeError("Invalid Web Presentation custom event data");
      }
      output[key] = visit(descriptor.value, depth + 1);
    }
    return Object.freeze(output);
  };
  const snapshot = visit(value, 1);
  if (snapshot === null || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    throw new TypeError("Invalid Web Presentation custom event data");
  }
  const encoded = JSON.stringify(snapshot);
  if (utf8ByteLength(encoded) > 262_144) {
    throw new TypeError("Invalid Web Presentation custom event data");
  }
  return snapshot as JsonObject;
}

function detachedFrozenJson<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return Object.freeze(value.map((child) => detachedFrozenJson(child))) as T;
  }
  const output: Record<string, unknown> = {};
  for (const key of Object.keys(value)) {
    Object.defineProperty(output, key, {
      configurable: true,
      enumerable: true,
      value: detachedFrozenJson((value as Record<string, unknown>)[key]),
      writable: true,
    });
  }
  return Object.freeze(output) as T;
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

function validateRendererViewportSource(
  viewport: RendererViewportSource | undefined,
): void {
  if (viewport === undefined) return;
  let valid = false;
  try {
    valid = viewport !== null && typeof viewport === "object" &&
      typeof viewport.start === "function";
  } catch {
    // Accessor-backed integration objects are not valid source capabilities.
  }
  if (!valid) throw new TypeError("Invalid RendererViewportSource");
}

function validateRendererPresentationEventBinding(
  binding: RendererPresentationEventBinding | undefined,
): void {
  if (binding === undefined) return;
  let valid = false;
  try {
    valid = binding !== null && typeof binding === "object" &&
      typeof binding.publish === "function";
  } catch {
    // Accessor-backed integration objects are not valid capability bindings.
  }
  if (!valid) throw new TypeError("Invalid RendererPresentationEventBinding");
}

interface ViewportSourceSubscription {
  readonly peer: RendererControlPeer;
  phase: "starting" | "current" | "invalid";
  stop: (() => void) | null;
}

class ControlHolder implements RendererControlHolder {
  private currentValue: RendererControlCurrent | null = null;
  private connecting = false;
  private readonly dataSlots = new Map<string, RendererDataSlot>();
  private renderSessionId: string | null = null;
  private readonly renderHistories = new Map<string, RendererRenderStore>();
  private viewportSubscription: ViewportSourceSubscription | null = null;
  private readonly viewportPublisher = new RendererViewportPublisher();
  private presentationEffect: RendererPresentationEffect | null = null;
  private presentationAttachmentToken: object | null = null;
  private presentationEmitNodeEvent: ((event: RendererPresentationNodeEvent) => void) | null = null;
  private presentationForwardDepth = 0;
  private readonly stagedPresentationEvents: AcceptedPresentationEvent[] = [];
  private readonly presentationPublications: QueuedPresentationEvent[] = [];
  private presentationPublicationEpoch = 1;
  private presentationPublicationPumping = false;
  private readonly presentationSource: RendererPresentationSource = Object.freeze({
    read: () => this.readPresentation(),
  });

  constructor(
    private readonly data?: RendererDataBinding,
    private readonly viewport?: RendererViewportSource,
    private readonly presentationEvents?: RendererPresentationEventBinding,
  ) {}

  current(): RendererControlCurrent | null {
    return this.currentValue;
  }

  [renderQualification](subsystemKey: string) {
    return this.dataSlots.get(subsystemKey)?.render.snapshotForQualification() ?? null;
  }

  [presentationAttachment](effect: RendererPresentationEffect): () => void {
    if (this.presentationEffect !== null) throw new TypeError("Renderer presentation already attached");
    const token = Object.freeze({});
    const emitNodeEvent = (event: RendererPresentationNodeEvent): void => {
      if (this.presentationAttachmentToken !== token || this.presentationEffect !== effect) return;
      this.emitPresentationNodeEvent(event);
    };
    this.presentationEffect = effect;
    this.presentationAttachmentToken = token;
    this.presentationEmitNodeEvent = emitNodeEvent;
    if (this.currentValue !== null) this.notifyPresentation();
    return () => {
      if (this.presentationAttachmentToken !== token) return;
      this.presentationEffect = null;
      this.presentationAttachmentToken = null;
      this.presentationEmitNodeEvent = null;
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
      this.stopViewportSource();
      this.retirePresentationPublications();
    }
    this.prepareRenderSession(outcome.snapshot.sessionId);
    const installed = Object.freeze({ peer, snapshot: outcome.snapshot });
    this.currentValue = installed;
    this.startViewportSource(peer);
    this.reconcileData(peer, outcome.snapshot);
    this.notifyPresentation();
    void this.consume(peer);
    void peer.terminal.then(() => {
      if (this.currentValue?.peer !== peer) return;
      this.currentValue = null;
      this.clearAllData();
      this.stopViewportSource();
      this.retirePresentationPublications();
    });
    return Object.freeze({ kind: "installed", current: installed });
  }

  private async consume(peer: RendererControlPeer): Promise<void> {
    for await (const snapshot of peer.states()) {
      if (this.currentValue?.peer !== peer) continue;
      this.retireMismatchedData(peer, snapshot);
      this.prepareRenderSession(snapshot.sessionId);
      this.currentValue = Object.freeze({ peer, snapshot });
      this.reconcileData(peer, snapshot);
      this.notifyPresentation();
    }
  }

  private reconcileData(
    controlPeer: RendererControlPeer,
    snapshot: RendererAuthoritySnapshotV2,
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
          this.viewportPublisher.detach(current.peer);
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
    snapshot: RendererAuthoritySnapshotV2,
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
          this.viewportPublisher.detach(current.peer);
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
      if (attempt.identity.dataProfile !== RENDERER_DATA_PROFILE_V2) {
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
          onRenderDomains: (message) => this.commitRenderMessage(slot, peer, () => slot.render.onDomains(message)),
          onRenderSnapshot: (message) => this.commitRenderMessage(slot, peer, () => slot.render.onSnapshot(message)),
          onRenderPatch: (message) => this.commitRenderMessage(slot, peer, () => slot.render.onPatch(message)),
          onRenderEvent: (message) => this.onRenderEvent(slot, peer, message),
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
    this.viewportPublisher.attach(peer);
    void peer.terminal.then(() => {
      if (slot.current?.peer !== peer) return;
      this.viewportPublisher.detach(peer);
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

  private onRenderEvent(
    slot: RendererDataSlot,
    peer: RendererDataPeer,
    message: RenderEventV1,
  ): ReturnType<RendererRenderStore["onEvent"]> {
    if (slot.current?.peer !== peer) return acceptedDataMessage;
    return slot.render.onEvent(message, (applicable) => {
      this.deliverRenderEvent(slot, peer, applicable);
    });
  }

  private deliverRenderEvent(
    slot: RendererDataSlot,
    peer: RendererDataPeer,
    message: RenderEventV1,
  ): void {
    const current = this.currentValue;
    const effect = this.presentationEffect;
    const attachmentToken = this.presentationAttachmentToken;
    if (current === null || effect === null || attachmentToken === null) return;
    let deliver: NonNullable<RendererPresentationEffect["deliverRenderEvent"]>;
    try {
      if (typeof effect.deliverRenderEvent !== "function") return;
      deliver = effect.deliverRenderEvent;
    } catch {
      return;
    }
    const authority = current.snapshot.dataAuthorities.find(
      ({ subsystemKey }) => subsystemKey === slot.current?.identity.subsystemKey,
    );
    const carrier = slot.current;
    if (
      authority === undefined ||
      carrier === null ||
      carrier.peer !== peer ||
      carrier.identity.controlPeer !== current.peer ||
      carrier.identity.generation !== authority.generation ||
      carrier.identity.dataProfile !== authority.dataProfile ||
      !slot.render.isPresentationTargetCurrent(message.domainId, message.targetKey)
    ) return;

    const event: RendererPresentationRenderEvent = Object.freeze({
      sessionId: current.snapshot.sessionId,
      subsystemKey: authority.subsystemKey,
      generation: authority.generation,
      domainId: message.domainId,
      targetKey: message.targetKey,
      name: message.name,
      data: detachedFrozenJson(message.data),
    });
    this.presentationForwardDepth += 1;
    try {
      if (this.presentationAttachmentToken !== attachmentToken || this.presentationEffect !== effect) return;
      deliver.call(effect, event);
    } catch {
      // Render Event receivers/effects are an ordinary presentation-local boundary.
    } finally {
      this.presentationForwardDepth -= 1;
      if (this.presentationForwardDepth === 0) this.flushStagedPresentationInputs();
    }
  }

  private notifyPresentation(): void {
    const effect = this.presentationEffect;
    const emitNodeEvent = this.presentationEmitNodeEvent;
    if (effect === null || emitNodeEvent === null) return;
    try {
      effect.reevaluate(this.presentationSource, emitNodeEvent);
    } catch {
      // Presentation failure cannot roll back committed authority or Store state.
    }
  }

  private emitPresentationNodeEvent(event: RendererPresentationNodeEvent): void {
    const current = this.currentValue;
    if (current === null || event.sessionId !== current.snapshot.sessionId) return;
    const authority = current.snapshot.dataAuthorities.find(
      ({ subsystemKey }) => subsystemKey === event.subsystemKey,
    );
    if (authority === undefined || authority.generation !== event.generation) return;
    const slot = this.dataSlots.get(event.subsystemKey);
    if (slot === undefined) return;
    const carrier = slot.current;
    if (
      carrier === null ||
      carrier.identity.controlPeer !== current.peer ||
      carrier.identity.subsystemKey !== event.subsystemKey ||
      carrier.identity.generation !== authority.generation ||
      carrier.identity.dataProfile !== authority.dataProfile ||
      !slot.render.isPresentationTargetCurrent(event.domainId, event.targetKey)
    ) return;

    let options: ReturnType<typeof validatePresentationOptions>;
    let name: string;
    try {
      options = validatePresentationOptions(event.options);
      name = validatePresentationEventName(event.name);
    } catch {
      throw new TypeError("Invalid Web Presentation custom event arguments");
    }
    let data: JsonObject;
    try {
      data = validatePresentationData(event.data);
    } catch {
      throw new TypeError("Invalid Web Presentation custom event payload");
    }
    const accepted: AcceptedPresentationEvent = Object.freeze({
      kind: "publication" as const,
      publication: Object.freeze({
        sessionId: event.sessionId,
        ownerSubsystemKey: event.subsystemKey,
        generation: event.generation,
        domainId: event.domainId,
        targetKey: event.targetKey,
        channel: options.channel,
        type: name,
        broadcast: options.broadcast,
        payload: Object.freeze({
          domainId: event.domainId,
          targetKey: event.targetKey,
          data,
        }),
      }),
    });
    if (this.presentationForwardDepth > 0) {
      if (this.stagedPresentationEvents.length >= MAX_STAGED_PRESENTATION_EVENTS) return;
      this.stagedPresentationEvents.push(accepted);
      return;
    }
    this.enqueuePresentationEvent(accepted);
  }

  private flushStagedPresentationInputs(): void {
    while (this.stagedPresentationEvents.length > 0) {
      const staged = this.stagedPresentationEvents.shift();
      if (staged !== undefined) this.enqueuePresentationEvent(staged);
    }
  }

  private enqueuePresentationEvent(event: AcceptedPresentationEvent): void {
    if (this.presentationPublications.length >= MAX_PRESENTATION_PUBLICATIONS) return;
    this.presentationPublications.push(Object.freeze({
      epoch: this.presentationPublicationEpoch,
      event,
    }));
    void this.pumpPresentationEvents();
  }

  private async pumpPresentationEvents(): Promise<void> {
    if (this.presentationPublicationPumping) return;
    this.presentationPublicationPumping = true;
    try {
      while (this.presentationPublications.length > 0) {
        const queued = this.presentationPublications.shift();
        if (queued === undefined || queued.epoch !== this.presentationPublicationEpoch) continue;
        try {
          await this.presentationEvents?.publish(queued.event.publication);
        } catch {
          // Publication failure is presentation-local and does not alter authority.
        }
      }
    } finally {
      this.presentationPublicationPumping = false;
      if (this.presentationPublications.length > 0) void this.pumpPresentationEvents();
    }
  }

  private retirePresentationPublications(): void {
    this.presentationPublicationEpoch += 1;
    this.presentationPublications.length = 0;
    this.stagedPresentationEvents.length = 0;
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
        this.viewportPublisher.detach(current.peer);
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

  private startViewportSource(peer: RendererControlPeer): void {
    const source = this.viewport;
    this.viewportPublisher.clear();
    if (source === undefined) return;
    const subscription: ViewportSourceSubscription = {
      peer,
      phase: "starting",
      stop: null,
    };
    this.viewportSubscription = subscription;
    const emit = (sample: RendererViewportLogicalSample): void => {
      if (this.viewportSubscription !== subscription || subscription.phase === "invalid") return;
      this.viewportPublisher.observe(sample);
    };
    try {
      const stop = source.start(emit);
      if (typeof stop !== "function") throw new TypeError("Viewport source start must return stop function");
      subscription.stop = stop;
      subscription.phase = "current";
    } catch {
      subscription.phase = "invalid";
      if (this.viewportSubscription === subscription) this.viewportSubscription = null;
      this.viewportPublisher.clear();
      try {
        subscription.stop?.();
      } catch {
        // Failed source bootstrap cleanup is locally contained.
      }
    }
  }

  private stopViewportSource(): void {
    const subscription = this.viewportSubscription;
    if (subscription === null) return;
    this.viewportSubscription = null;
    subscription.phase = "invalid";
    this.viewportPublisher.clear();
    try {
      subscription.stop?.();
    } catch {
      // Local stop failure cannot restore retired viewport observations.
    }
  }

}

export function createRendererControlHolder(
  data?: RendererDataBinding,
  viewport?: RendererViewportSource,
  presentationEvents?: RendererPresentationEventBinding,
): RendererControlHolder {
  validateRendererDataBinding(data);
  validateRendererViewportSource(viewport);
  validateRendererPresentationEventBinding(presentationEvents);
  return new ControlHolder(data, viewport, presentationEvents);
}
