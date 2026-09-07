import type {
  RenderDomainsV1,
  RenderEventV1,
  RenderSnapshotV1,
  SubsystemDataPeer,
} from "@loomrealm/data";
import {
  assertJsonValue,
  jsonDepth,
  stringifyJson,
  utf8ByteLength,
  type JsonObject,
  type JsonValue,
} from "@loomrealm/wire";
import type {
  RenderDomain,
  RenderDomainState,
  RenderEvent,
} from "../render.js";

const MAX_DOMAINS = 256;
const MAX_NODES = 16_384;
const MAX_TREE_DEPTH = 30;
const MAX_ATTRS = 256;
const MAX_CONTAINER_MEMBERS = 16_384;
const MAX_DATA_BYTES = 262_144;
const MAX_DATA_DEPTH = 32;
const MAX_MESSAGE_BYTES = 1_048_576;
const MAX_PENDING_WORK = 1_024;

interface DomainRecord {
  wireId: string;
  state: RenderDomainState;
  readonly liveKeys: Set<string>;
  readonly consumedKeys: Set<string>;
  closed: boolean;
}

type Work =
  | { readonly kind: "registry"; message: RenderDomainsV1 }
  | { readonly kind: "snapshot"; readonly domain: DomainRecord; state: RenderDomainState }
  | { readonly kind: "event"; readonly domain: DomainRecord; readonly event: RenderEvent };

interface CarrierCursor {
  revision: number;
  baselined: boolean;
}

function ownDataObject(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be a plain object`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(`${label} must be a plain object`);
  }
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") throw new TypeError(`${label} cannot contain symbol keys`);
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) {
      throw new TypeError(`${label} members must be enumerable data properties`);
    }
  }
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], label: string): void {
  const keys = Object.keys(value).sort();
  const required = [...expected].sort();
  if (keys.length !== required.length || keys.some((key, index) => key !== required[index])) {
    throw new TypeError(`${label} has invalid members`);
  }
}

function scalarString(value: unknown, min: number, max: number, label: string): string {
  if (typeof value !== "string") throw new TypeError(`${label} must be a string`);
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next < 0xdc00 || next > 0xdfff) throw new TypeError(`${label} has invalid Unicode`);
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      throw new TypeError(`${label} has invalid Unicode`);
    }
  }
  const bytes = utf8ByteLength(value);
  if (bytes < min) throw new TypeError(`${label} cannot be empty`);
  if (bytes > max) throw new RangeError(`${label} byte limit exceeded`);
  return value;
}

function validateJsonData(value: unknown, label: string): asserts value is JsonObject {
  try {
    assertJsonValue(value);
  } catch {
    throw new TypeError(`${label} must be plain JSON`);
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be a JSON object`);
  }
  if (jsonDepth(value) > MAX_DATA_DEPTH) throw new RangeError(`${label} depth limit exceeded`);
  const stack: JsonValue[] = [value];
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined || current === null || typeof current !== "object") continue;
    if (Array.isArray(current)) {
      if (current.length > MAX_CONTAINER_MEMBERS) throw new RangeError(`${label} array limit exceeded`);
      for (const child of current) stack.push(child);
    } else {
      const keys = Object.keys(current);
      if (keys.length > MAX_CONTAINER_MEMBERS) throw new RangeError(`${label} member limit exceeded`);
      for (const key of keys) {
        scalarString(key, 0, 256, `${label} key`);
        stack.push((current as JsonObject)[key] as JsonValue);
      }
    }
  }
  if (utf8ByteLength(stringifyJson(value)) > MAX_DATA_BYTES) {
    throw new RangeError(`${label} byte limit exceeded`);
  }
}

function detachedFrozen<T>(value: T, seen = new WeakMap<object, object>()): T {
  if (value === null || typeof value !== "object") return value;
  const prior = seen.get(value);
  if (prior !== undefined) return prior as T;
  const output: object = Array.isArray(value) ? [] : Object.create(null);
  seen.set(value, output);
  if (Array.isArray(value)) {
    for (const child of value) (output as unknown[]).push(detachedFrozen(child, seen));
  } else {
    for (const key of Object.keys(value)) {
      Object.defineProperty(output, key, {
        value: detachedFrozen((value as Record<string, unknown>)[key], seen),
        enumerable: true,
        configurable: false,
        writable: false,
      });
    }
  }
  return Object.freeze(output) as T;
}

function validateStateShape(value: unknown): {
  readonly state: RenderDomainState;
  readonly keys: Set<string>;
  readonly tags: Map<string, string>;
} {
  try {
    assertJsonValue(value);
  } catch {
    throw new TypeError("RenderDomainState must be plain JSON");
  }
  ownDataObject(value, "RenderDomainState");
  exactKeys(value, ["zIndex", "roots"], "RenderDomainState");
  if (!Number.isInteger(value.zIndex)) throw new TypeError("zIndex must be an integer");
  if ((value.zIndex as number) < -2_147_483_648 || (value.zIndex as number) > 2_147_483_647) {
    throw new RangeError("zIndex limit exceeded");
  }
  if (!Array.isArray(value.roots)) throw new TypeError("roots must be an array");
  const keys = new Set<string>();
  const tags = new Map<string, string>();
  let count = 0;
  const visit = (raw: unknown, depth: number): void => {
    if (depth > MAX_TREE_DEPTH) throw new RangeError("Render tree depth limit exceeded");
    ownDataObject(raw, "RenderNode");
    exactKeys(raw, ["key", "tag", "attrs", "data", "children"], "RenderNode");
    const key = scalarString(raw.key, 1, 128, "RenderNode key");
    if (keys.has(key)) throw new TypeError("Duplicate RenderNode key");
    keys.add(key);
    const tag = scalarString(raw.tag, 1, 256, "RenderNode tag");
    tags.set(key, tag);
    ownDataObject(raw.attrs, "RenderNode attrs");
    const attrKeys = Object.keys(raw.attrs);
    if (attrKeys.length > MAX_ATTRS) throw new RangeError("RenderNode attrs limit exceeded");
    for (const attrKey of attrKeys) {
      scalarString(attrKey, 1, 128, "RenderNode attr key");
      scalarString(raw.attrs[attrKey], 0, 4096, "RenderNode attr value");
    }
    validateJsonData(raw.data, "RenderNode data");
    if (!Array.isArray(raw.children)) throw new TypeError("RenderNode children must be an array");
    count += 1;
    if (count > MAX_NODES) throw new RangeError("RenderNode count limit exceeded");
    for (const child of raw.children) visit(child, depth + 1);
  };
  for (const root of value.roots) visit(root, 1);
  const detached = detachedFrozen(value as unknown as RenderDomainState);
  const probe = {
    type: "render.snapshot",
    domainId: "d".repeat(128),
    revision: Number.MAX_SAFE_INTEGER,
    zIndex: detached.zIndex,
    roots: detached.roots,
  } as const;
  try {
    assertJsonValue(probe);
  } catch {
    throw new TypeError("Render state must be plain JSON");
  }
  if (jsonDepth(probe) > 64 || utf8ByteLength(stringifyJson(probe)) > MAX_MESSAGE_BYTES) {
    throw new RangeError("Render Snapshot message limit exceeded");
  }
  return { state: detached, keys, tags };
}

function validateEventShape(value: unknown): RenderEvent {
  ownDataObject(value, "RenderEvent");
  exactKeys(value, ["targetKey", "name", "data"], "RenderEvent");
  scalarString(value.targetKey, 1, 128, "RenderEvent targetKey");
  scalarString(value.name, 1, 128, "RenderEvent name");
  validateJsonData(value.data, "RenderEvent data");
  const detached = detachedFrozen(value as unknown as RenderEvent);
  const probe = { type: "render.event", domainId: "d".repeat(128), ...detached } as const;
  if (jsonDepth(probe) > 64 || utf8ByteLength(stringifyJson(probe)) > MAX_MESSAGE_BYTES) {
    throw new RangeError("Render Event message limit exceeded");
  }
  return detached;
}

export interface RenderManagerSnapshot {
  readonly generation: number | null;
  readonly domains: readonly {
    readonly domainId: string;
    readonly closed: boolean;
    readonly state: RenderDomainState;
  }[];
  readonly pendingWork: number;
}

export class RenderManager {
  private readonly domains = new Set<DomainRecord>();
  private nextSerial = 1n;
  private peer: SubsystemDataPeer | null = null;
  private peerEpoch = 0;
  private generation: number | null = null;
  private readonly cursors = new Map<DomainRecord, CarrierCursor>();
  private work: Work[] = [];
  private sending = false;
  private closed = false;

  createDomain(initialState: RenderDomainState): RenderDomain {
    if (this.closed) throw new TypeError("RenderManager is closed");
    if (this.domains.size >= MAX_DOMAINS) throw new RangeError("Render Domain limit exceeded");
    const validated = validateStateShape(initialState);
    const serial = this.nextSerial;
    this.nextSerial += 1n;
    const record: DomainRecord = {
      wireId: `d${serial.toString(36)}`,
      state: validated.state,
      liveKeys: validated.keys,
      consumedKeys: new Set(),
      closed: false,
    };
    this.domains.add(record);
    this.enqueueRegistry();
    this.enqueueSnapshot(record, record.state);
    const handle: RenderDomain = Object.freeze({
      replace: (state: RenderDomainState) => this.replace(record, state),
      emit: (event: RenderEvent) => this.emit(record, event),
      close: () => this.closeDomain(record),
    });
    return handle;
  }

  setDataPeer(peer: SubsystemDataPeer | null): void {
    this.peerEpoch += 1;
    this.peer = peer;
    this.sending = false;
    this.work = [];
    this.cursors.clear();
    if (peer === null || this.closed) return;
    if (this.generation !== peer.binding.generation) this.generation = peer.binding.generation;
    this.enqueueRegistry();
    for (const domain of this.domains) this.enqueueSnapshot(domain, domain.state);
    this.pump();
  }

  closeAll(): void {
    if (this.closed) return;
    this.closed = true;
    for (const domain of this.domains) domain.closed = true;
    this.domains.clear();
    this.peerEpoch += 1;
    this.peer = null;
    this.work = [];
    this.cursors.clear();
    this.sending = false;
  }

  snapshotForQualification(): RenderManagerSnapshot {
    return detachedFrozen({
      generation: this.generation,
      domains: [...this.domains].map((domain) => ({
        domainId: domain.wireId,
        closed: domain.closed,
        state: domain.state,
      })),
      pendingWork: this.work.length,
    });
  }

  setRevisionForQualification(domainId: string, revision: number): void {
    const domain = [...this.domains].find((candidate) => candidate.wireId === domainId);
    if (domain === undefined || !Number.isSafeInteger(revision) || revision <= 0) {
      throw new TypeError("Invalid qualification cursor");
    }
    this.cursors.set(domain, { baselined: true, revision });
  }

  private replace(domain: DomainRecord, state: RenderDomainState): void {
    this.requireLive(domain);
    const validated = validateStateShape(state);
    const oldTags = new Map<string, string>();
    const stack = [...domain.state.roots];
    while (stack.length > 0) {
      const node = stack.pop();
      if (node === undefined) continue;
      oldTags.set(node.key, node.tag);
      stack.push(...node.children);
    }
    for (const key of validated.keys) {
      const oldTag = oldTags.get(key) ?? null;
      const nextTag = validated.tags.get(key);
      if (oldTag !== null && oldTag !== nextTag) throw new TypeError("Live RenderNode tag cannot change");
      if (!domain.liveKeys.has(key) && domain.consumedKeys.has(key)) {
        throw new TypeError("Removed RenderNode key cannot be reused");
      }
    }
    for (const key of domain.liveKeys) {
      if (!validated.keys.has(key)) domain.consumedKeys.add(key);
    }
    domain.liveKeys.clear();
    for (const key of validated.keys) domain.liveKeys.add(key);
    domain.state = validated.state;
    this.enqueueSnapshot(domain, domain.state);
  }

  private emit(domain: DomainRecord, raw: RenderEvent): void {
    this.requireLive(domain);
    const event = validateEventShape(raw);
    if (!domain.liveKeys.has(event.targetKey)) throw new TypeError("Stale Render Event target");
    if (this.peer === null) return;
    if (this.work.length >= MAX_PENDING_WORK && !this.dropOldestEvent()) return;
    this.work.push({ kind: "event", domain, event });
    this.pump();
  }

  private closeDomain(domain: DomainRecord): void {
    if (domain.closed) return;
    domain.closed = true;
    this.domains.delete(domain);
    this.work = this.work.filter((item) => item.kind === "registry" || item.domain !== domain);
    this.cursors.delete(domain);
    this.enqueueRegistry();
  }

  private requireLive(domain: DomainRecord): void {
    if (domain.closed || !this.domains.has(domain) || this.closed) {
      throw new TypeError("Render Domain is closed");
    }
  }

  private registryMessage(): RenderDomainsV1 {
    return {
      type: "render.domains",
      domains: [...this.domains].map((domain) => domain.wireId),
    };
  }

  private enqueueRegistry(): void {
    if (this.peer === null) return;
    const message = this.registryMessage();
    let updated = false;
    for (const item of this.work) {
      if (item.kind !== "registry") continue;
      item.message = message;
      updated = true;
    }
    if (updated) this.pump();
    else this.makeRoomForAuthoritative() && this.work.push({ kind: "registry", message });
    this.pump();
  }

  private enqueueSnapshot(domain: DomainRecord, state: RenderDomainState): void {
    if (this.peer === null || domain.closed) return;
    const lastBarrier = this.lastBarrierIndex(domain);
    for (let index = this.work.length - 1; index > lastBarrier; index -= 1) {
      const item = this.work[index];
      if (item?.kind === "snapshot" && item.domain === domain) {
        item.state = state;
        this.pump();
        return;
      }
    }
    if (this.makeRoomForAuthoritative()) this.work.push({ kind: "snapshot", domain, state });
    this.pump();
  }

  private lastBarrierIndex(domain: DomainRecord): number {
    for (let index = this.work.length - 1; index >= 0; index -= 1) {
      const item = this.work[index];
      if (item?.kind === "event" && item.domain === domain) return index;
    }
    return -1;
  }

  private makeRoomForAuthoritative(): boolean {
    while (this.work.length >= MAX_PENDING_WORK) {
      if (!this.dropOldestEvent()) {
        const redundant = this.work.findIndex((item, index) =>
          item.kind === "snapshot" && this.work.slice(index + 1).some((later) =>
            later.kind === "snapshot" && later.domain === item.domain));
        if (redundant < 0) return false;
        this.work.splice(redundant, 1);
      }
    }
    return true;
  }

  private dropOldestEvent(): boolean {
    const index = this.work.findIndex((item) => item.kind === "event");
    if (index < 0) return false;
    this.work.splice(index, 1);
    return true;
  }

  private pump(): void {
    const peer = this.peer;
    if (peer === null || this.sending || this.work.length === 0) return;
    const work = this.work.shift();
    if (work === undefined) return;
    if (work.kind !== "registry" && (work.domain.closed || !this.domains.has(work.domain))) {
      this.pump();
      return;
    }
    if (work.kind === "snapshot") {
      const cursor = this.cursors.get(work.domain);
      if (cursor?.revision === Number.MAX_SAFE_INTEGER) {
        const oldId = work.domain.wireId;
        work.domain.wireId = `d${this.nextSerial.toString(36)}`;
        this.nextSerial += 1n;
        this.cursors.delete(work.domain);
        this.work = this.work.filter((item) =>
          item.kind !== "registry" && item.domain !== work.domain);
        this.work.unshift({ kind: "snapshot", domain: work.domain, state: work.state });
        this.work.unshift({ kind: "registry", message: this.registryMessage() });
        if (oldId === work.domain.wireId) throw new Error("Render wire identity rollover failed");
        this.pump();
        return;
      }
    }
    const epoch = this.peerEpoch;
    const message = this.materialize(work);
    if (message === null) {
      this.pump();
      return;
    }
    this.sending = true;
    const operation = message.type === "render.domains"
      ? peer.render.sendDomains(message)
      : message.type === "render.snapshot"
      ? peer.render.sendSnapshot(message)
      : peer.render.sendEvent(message);
    void operation.then(
      (outcome) => this.finishSend(epoch, peer, work, message, outcome.kind === "sent"),
      () => this.finishSend(epoch, peer, work, message, false),
    );
  }

  private materialize(work: Work): RenderDomainsV1 | RenderSnapshotV1 | RenderEventV1 | null {
    if (work.kind === "registry") return work.message;
    if (work.domain.closed) return null;
    if (work.kind === "event") {
      const cursor = this.cursors.get(work.domain);
      if (!cursor?.baselined) return null;
      return {
        type: "render.event",
        domainId: work.domain.wireId,
        targetKey: work.event.targetKey,
        name: work.event.name,
        data: work.event.data,
      };
    }
    const cursor = this.cursors.get(work.domain);
    const revision = cursor === undefined ? 1 : cursor.revision + 1;
    return {
      type: "render.snapshot",
      domainId: work.domain.wireId,
      revision,
      zIndex: work.state.zIndex,
      roots: work.state.roots,
    };
  }

  private finishSend(
    epoch: number,
    peer: SubsystemDataPeer,
    work: Work,
    message: RenderDomainsV1 | RenderSnapshotV1 | RenderEventV1,
    sent: boolean,
  ): void {
    if (epoch !== this.peerEpoch || peer !== this.peer) return;
    this.sending = false;
    if (!sent) {
      this.work = [];
      return;
    }
    if (work.kind === "snapshot" && message.type === "render.snapshot" && !work.domain.closed) {
      this.cursors.set(work.domain, { baselined: true, revision: message.revision });
    }
    this.pump();
  }
}
