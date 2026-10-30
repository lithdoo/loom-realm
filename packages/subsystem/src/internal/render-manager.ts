import type {
  RenderDomainsV1,
  RenderEventV1,
  RenderNodeUpdateV1,
  RenderPatchV1,
  RenderSnapshotV1,
  SubsystemDataPeer,
} from "@loomrealm/data";
import type { JsonObject, JsonValue } from "@loomrealm/wire";
import type {
  RenderDomain,
  RenderDomainState,
  RenderDomainUpdate,
  RenderEvent,
  RenderNode,
} from "../render.js";

interface NodeLocation {
  readonly parentKey: string | null;
  readonly index: number;
}

interface DomainRecord {
  wireId: string;
  state: RenderDomainState;
  readonly liveKeys: Set<string>;
  readonly consumedKeys: Set<string>;
  tags: Map<string, string>;
  nodes: Map<string, RenderNode>;
  locations: Map<string, NodeLocation>;
  closed: boolean;
}

type StateWork =
  | { readonly kind: "snapshot"; readonly domain: DomainRecord; state: RenderDomainState }
  | {
      readonly kind: "update";
      readonly domain: DomainRecord;
      state: RenderDomainState;
      readonly ops: readonly RenderNodeUpdateV1[];
      readonly zIndex?: number;
    };

type Work =
  | { readonly kind: "registry"; message: RenderDomainsV1 }
  | StateWork
  | { readonly kind: "event"; readonly domain: DomainRecord; readonly event: RenderEvent };

type PublicationMessage = RenderDomainsV1 | RenderSnapshotV1 | RenderPatchV1 | RenderEventV1;

interface InFlightPublication {
  readonly epoch: number;
  readonly peer: SubsystemDataPeer;
  readonly work: Work;
  readonly message: PublicationMessage;
}

interface CarrierCursor {
  revision: number;
  baselined: boolean;
}

interface StringDelta {
  readonly set?: Readonly<Record<string, string>>;
  readonly remove?: readonly string[];
}

interface DataDelta {
  readonly set?: Readonly<Record<string, JsonValue>>;
  readonly remove?: readonly string[];
}

interface ValidatedNodeUpdate {
  readonly key: string;
  readonly attrs?: StringDelta;
  readonly data?: DataDelta;
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

function hasOwn(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function optionalMember<T>(value: Record<string, unknown>, key: string, label: string): T | undefined {
  if (!hasOwn(value, key)) return undefined;
  const member = value[key];
  if (member === undefined) throw new TypeError(`${label} cannot be undefined`);
  return member as T;
}

function scalarString(value: unknown, allowEmpty: boolean, label: string): string {
  if (typeof value !== "string") throw new TypeError(`${label} must be a string`);
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) throw new TypeError(`${label} has invalid Unicode`);
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      throw new TypeError(`${label} has invalid Unicode`);
    }
  }
  if (!allowEmpty && value.length === 0) throw new TypeError(`${label} cannot be empty`);
  return value;
}

interface CloneFrame {
  readonly source: object;
  readonly target: Record<string, JsonValue> | JsonValue[];
  readonly entries: readonly { readonly key: string | number; readonly value: unknown }[];
  next: number;
}

function cloneJsonValue(value: unknown, label: string): JsonValue {
  const primitive = (candidate: unknown): JsonValue | undefined => {
    if (candidate === null || typeof candidate === "boolean") {
      return candidate;
    }
    if (typeof candidate === "string") return scalarString(candidate, true, `${label} string`);
    if (typeof candidate === "number") {
      if (!Number.isFinite(candidate)) throw new TypeError(`${label} must be plain JSON with finite numbers`);
      return candidate;
    }
    return undefined;
  };
  const direct = primitive(value);
  if (direct !== undefined || value === null) return direct as JsonValue;
  if (typeof value !== "object") throw new TypeError(`${label} must be plain JSON`);

  const active = new WeakSet<object>();
  const completed = new WeakMap<object, Record<string, JsonValue> | JsonValue[]>();
  const inspect = (source: object): Omit<CloneFrame, "source" | "next"> => {
    if (Array.isArray(source)) {
      const keys = Reflect.ownKeys(source);
      if (keys.length !== source.length + 1 || !keys.includes("length")) {
        throw new TypeError(`${label} arrays must be dense and unaugmented`);
      }
      const target = new Array<JsonValue>(source.length);
      const entries: Array<{ key: number; value: unknown }> = [];
      for (let index = 0; index < source.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(source, String(index));
        if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) {
          throw new TypeError(`${label} arrays must contain enumerable data properties`);
        }
        entries.push({ key: index, value: descriptor.value });
      }
      return { target, entries };
    }
    const prototype = Object.getPrototypeOf(source);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError(`${label} must contain plain JSON objects`);
    }
    const target = Object.create(null) as Record<string, JsonValue>;
    const entries: Array<{ key: string; value: unknown }> = [];
    for (const key of Reflect.ownKeys(source)) {
      if (typeof key !== "string") throw new TypeError(`${label} must be plain JSON without symbol keys`);
      scalarString(key, true, `${label} key`);
      const descriptor = Object.getOwnPropertyDescriptor(source, key);
      if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) {
        throw new TypeError(`${label} members must be enumerable data properties`);
      }
      entries.push({ key, value: descriptor.value });
    }
    return { target, entries };
  };
  const root = inspect(value);
  active.add(value);
  completed.set(value, root.target);
  const stack: CloneFrame[] = [{ source: value, target: root.target, entries: root.entries, next: 0 }];
  const assign = (
    target: Record<string, JsonValue> | JsonValue[],
    key: string | number,
    child: JsonValue,
  ): void => {
    if (Array.isArray(target)) target[key as number] = child;
    else target[key as string] = child;
  };

  while (stack.length > 0) {
    const frame = stack[stack.length - 1]!;
    if (frame.next >= frame.entries.length) {
      Object.freeze(frame.target);
      active.delete(frame.source);
      stack.pop();
      continue;
    }
    const entry = frame.entries[frame.next++]!;
    const childPrimitive = primitive(entry.value);
    if (childPrimitive !== undefined || entry.value === null) {
      assign(frame.target, entry.key, childPrimitive as JsonValue);
      continue;
    }
    if (typeof entry.value !== "object") throw new TypeError(`${label} must be plain JSON`);
    if (active.has(entry.value)) throw new TypeError(`${label} cannot contain a cycle`);
    const prior = completed.get(entry.value);
    if (prior !== undefined) {
      assign(frame.target, entry.key, prior as JsonValue);
      continue;
    }
    const nested = inspect(entry.value);
    active.add(entry.value);
    completed.set(entry.value, nested.target);
    assign(frame.target, entry.key, nested.target as JsonValue);
    stack.push({ source: entry.value, target: nested.target, entries: nested.entries, next: 0 });
  }
  return root.target as JsonValue;
}

function cloneJsonObject(value: unknown, label: string): JsonObject {
  const cloned = cloneJsonValue(value, label);
  if (cloned === null || typeof cloned !== "object" || Array.isArray(cloned)) {
    throw new TypeError(`${label} must be a JSON object`);
  }
  return cloned as JsonObject;
}

function detachedFrozen<T>(value: T): T {
  return cloneJsonValue(value, "qualification snapshot") as T;
}

function validateStateShape(value: unknown): {
  readonly state: RenderDomainState;
  readonly keys: Set<string>;
  readonly tags: Map<string, string>;
  readonly nodes: Map<string, RenderNode>;
  readonly locations: Map<string, NodeLocation>;
} {
  ownDataObject(value, "RenderDomainState");
  exactKeys(value, ["zIndex", "roots"], "RenderDomainState");
  if (!Number.isSafeInteger(value.zIndex)) throw new TypeError("zIndex must be a signed safe integer");
  const rawRoots = denseArray(value.roots, "roots");
  const keys = new Set<string>();
  const tags = new Map<string, string>();
  const nodes = new Map<string, RenderNode>();
  const locations = new Map<string, NodeLocation>();
  const roots = new Array<RenderNode>(rawRoots.length);
  const built: Array<{ readonly node: RenderNode; readonly children: RenderNode[] }> = [];
  const stack: Array<{
    readonly raw: unknown;
    readonly parentChildren: RenderNode[];
    readonly index: number;
    readonly parentKey: string | null;
  }> = [];
  for (let index = rawRoots.length - 1; index >= 0; index -= 1) {
    stack.push({ raw: rawRoots[index], parentChildren: roots, index, parentKey: null });
  }
  while (stack.length > 0) {
    const frame = stack.pop()!;
    ownDataObject(frame.raw, "RenderNode");
    exactKeys(frame.raw, ["key", "tag", "attrs", "data", "children"], "RenderNode");
    const key = scalarString(frame.raw.key, false, "RenderNode key");
    if (keys.has(key)) throw new TypeError("Duplicate RenderNode key");
    keys.add(key);
    const tag = scalarString(frame.raw.tag, false, "RenderNode tag");
    tags.set(key, tag);
    ownDataObject(frame.raw.attrs, "RenderNode attrs");
    const attrs = Object.create(null) as Record<string, string>;
    for (const attrKey of Object.keys(frame.raw.attrs)) {
      scalarString(attrKey, false, "RenderNode attr key");
      attrs[attrKey] = scalarString(frame.raw.attrs[attrKey], true, "RenderNode attr value");
    }
    Object.freeze(attrs);
    const data = cloneJsonObject(frame.raw.data, "RenderNode data");
    const rawChildren = denseArray(frame.raw.children, "RenderNode children");
    const children = new Array<RenderNode>(rawChildren.length);
    const node = { key, tag, attrs, data, children } as RenderNode;
    frame.parentChildren[frame.index] = node;
    nodes.set(key, node);
    locations.set(key, { parentKey: frame.parentKey, index: frame.index });
    built.push({ node, children });
    for (let index = rawChildren.length - 1; index >= 0; index -= 1) {
      stack.push({ raw: rawChildren[index], parentChildren: children, index, parentKey: key });
    }
  }
  for (const { node, children } of built) {
    Object.freeze(children);
    Object.freeze(node);
  }
  Object.freeze(roots);
  return {
    state: Object.freeze({ zIndex: value.zIndex as number, roots }),
    keys,
    tags,
    nodes,
    locations,
  };
}

function validateEventShape(value: unknown): RenderEvent {
  ownDataObject(value, "RenderEvent");
  exactKeys(value, ["targetKey", "name", "data"], "RenderEvent");
  const targetKey = scalarString(value.targetKey, false, "RenderEvent targetKey");
  const name = scalarString(value.name, false, "RenderEvent name");
  const data = cloneJsonObject(value.data, "RenderEvent data");
  return Object.freeze({ targetKey, name, data });
}

function denseArray(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`);
  const keys = Reflect.ownKeys(value);
  if (keys.length !== value.length + 1 || !keys.includes("length")) {
    throw new TypeError(`${label} must be a dense array`);
  }
  for (let index = 0; index < value.length; index += 1) {
    const key = String(index);
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) {
      throw new TypeError(`${label} must be a dense array`);
    }
  }
  return value;
}

function validateDelta(
  raw: unknown,
  kind: "attrs" | "data",
  label: string,
): StringDelta | DataDelta {
  ownDataObject(raw, label);
  const allowed = new Set(["set", "remove"]);
  for (const key of Object.keys(raw)) {
    if (!allowed.has(key)) throw new TypeError(`${label} has invalid members`);
  }
  const setRaw = optionalMember<unknown>(raw, "set", `${label}.set`);
  const removeRaw = optionalMember<unknown>(raw, "remove", `${label}.remove`);
  if (setRaw === undefined && removeRaw === undefined) throw new TypeError(`${label} is empty`);
  let set: Record<string, string> | Record<string, JsonValue> | undefined;
  if (setRaw !== undefined) {
    ownDataObject(setRaw, `${label}.set`);
    const copied = Object.create(null) as Record<string, string | JsonValue>;
    for (const key of Object.keys(setRaw)) {
      if (kind === "attrs") {
        scalarString(key, false, `${label}.set key`);
        copied[key] = scalarString(setRaw[key], true, `${label}.set value`);
      } else {
        scalarString(key, true, `${label}.set key`);
        copied[key] = cloneJsonValue(setRaw[key], `${label}.set value`);
      }
    }
    if (Object.keys(copied).length === 0 && removeRaw === undefined) throw new TypeError(`${label} is empty`);
    set = copied;
  }
  let remove: string[] | undefined;
  if (removeRaw !== undefined) {
    const items = denseArray(removeRaw, `${label}.remove`);
    if (items.length === 0 && setRaw === undefined) throw new TypeError(`${label} is empty`);
    remove = items.map((item, index) => scalarString(item, kind === "data", `${label}.remove[${index}]`));
  }
  if ((set === undefined || Object.keys(set).length === 0) && (remove === undefined || remove.length === 0)) {
    throw new TypeError(`${label} is empty`);
  }
  const removed = new Set(remove ?? []);
  if (set !== undefined) {
    for (const key of Object.keys(set)) {
      if (removed.has(key)) throw new TypeError(`${label} set/remove overlap`);
    }
  }
  return {
    ...(set === undefined ? {} : { set: Object.freeze(set) }),
    ...(remove === undefined ? {} : { remove: Object.freeze(remove) }),
  } as StringDelta | DataDelta;
}

function applyStringDelta(
  current: Readonly<Record<string, string>>,
  delta: StringDelta,
): Readonly<Record<string, string>> {
  const next = Object.create(null) as Record<string, string>;
  for (const key of Object.keys(current)) {
    if (delta.remove?.includes(key)) continue;
    next[key] = current[key] as string;
  }
  if (delta.remove) {
    for (const key of delta.remove) {
      if (!hasOwn(current, key)) throw new TypeError("Delta removes missing member");
    }
  }
  if (delta.set) {
    for (const key of Object.keys(delta.set)) next[key] = delta.set[key] as string;
  }
  return Object.freeze(next);
}

function applyDataDelta(
  current: JsonObject,
  delta: DataDelta,
): JsonObject {
  const next = Object.create(null) as Record<string, JsonValue>;
  for (const key of Object.keys(current)) {
    if (delta.remove?.includes(key)) continue;
    next[key] = current[key] as JsonValue;
  }
  if (delta.remove) {
    for (const key of delta.remove) {
      if (!hasOwn(current, key)) throw new TypeError("Delta removes missing member");
    }
  }
  if (delta.set) {
    for (const key of Object.keys(delta.set)) next[key] = delta.set[key] as JsonValue;
  }
  return Object.freeze(next) as JsonObject;
}

interface MutableNode {
  readonly key: string;
  readonly tag: string;
  attrs: Readonly<Record<string, string>>;
  data: JsonObject;
  children: RenderNode[];
}

function applyCow(
  state: RenderDomainState,
  zIndex: number,
  updates: readonly ValidatedNodeUpdate[],
  nodes: ReadonlyMap<string, RenderNode>,
  locations: ReadonlyMap<string, NodeLocation>,
): { readonly state: RenderDomainState; readonly clones: ReadonlyMap<string, RenderNode> } {
  const clones = new Map<string, MutableNode>();
  const copiedChildren = new Set<string>();
  let roots = state.roots as RenderNode[];
  let rootsCopied = false;

  const ensurePath = (targetKey: string): MutableNode => {
    const path: string[] = [];
    let current: string | null = targetKey;
    while (current !== null) {
      path.push(current);
      const location = locations.get(current);
      if (location === undefined) throw new TypeError("Updated Render node is missing");
      current = location.parentKey;
    }
    for (let index = path.length - 1; index >= 0; index -= 1) {
      const key = path[index]!;
      if (clones.has(key)) continue;
      const original = nodes.get(key);
      const location = locations.get(key);
      if (original === undefined || location === undefined) throw new TypeError("Updated Render node is missing");
      const clone: MutableNode = {
        key: original.key,
        tag: original.tag,
        attrs: original.attrs,
        data: original.data,
        children: original.children as RenderNode[],
      };
      clones.set(key, clone);
      if (location.parentKey === null) {
        if (!rootsCopied) {
          roots = roots.slice();
          rootsCopied = true;
        }
        roots[location.index] = clone as RenderNode;
      } else {
        const parent = clones.get(location.parentKey);
        if (parent === undefined) throw new TypeError("Render parent path is missing");
        if (!copiedChildren.has(location.parentKey)) {
          parent.children = parent.children.slice();
          copiedChildren.add(location.parentKey);
        }
        parent.children[location.index] = clone as RenderNode;
      }
    }
    const result = clones.get(targetKey);
    if (result === undefined) throw new TypeError("Updated Render node is missing");
    return result;
  };

  for (const update of updates) {
    const node = ensurePath(update.key);
    if (update.attrs !== undefined) node.attrs = applyStringDelta(node.attrs, update.attrs);
    if (update.data !== undefined) node.data = applyDataDelta(node.data, update.data);
  }
  for (const [key, node] of clones) {
    if (copiedChildren.has(key)) Object.freeze(node.children);
    Object.freeze(node);
  }
  const nextRoots = rootsCopied ? Object.freeze(roots) : state.roots;
  return {
    state: Object.freeze({ zIndex, roots: nextRoots }),
    clones: new Map([...clones].map(([key, node]) => [key, node as RenderNode])),
  };
}

function toWireOps(nodes: readonly ValidatedNodeUpdate[]): readonly RenderNodeUpdateV1[] {
  return Object.freeze(nodes.map((node) => {
    const op: RenderNodeUpdateV1 = {
      op: "update",
      key: node.key,
      ...(node.attrs === undefined ? {} : { attrs: node.attrs }),
      ...(node.data === undefined ? {} : { data: node.data }),
    };
    return op;
  }));
}

function isStateWork(work: Work): work is StateWork {
  return work.kind === "snapshot" || work.kind === "update";
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
  private work: Array<Work | undefined> = [];
  private workHead = 0;
  private queuedCount = 0;
  private pendingRegistry: Extract<Work, { readonly kind: "registry" }> | null = null;
  private readonly coalescibleSnapshots = new Map<DomainRecord, Extract<StateWork, { readonly kind: "snapshot" }>>();
  private inFlight: InFlightPublication | null = null;
  private closed = false;

  createDomain(initialState: RenderDomainState): RenderDomain {
    if (this.closed) throw new TypeError("RenderManager is closed");
    const validated = validateStateShape(initialState);
    const serial = this.nextSerial;
    this.nextSerial += 1n;
    const record: DomainRecord = {
      wireId: `d${serial.toString(36)}`,
      state: validated.state,
      liveKeys: validated.keys,
      consumedKeys: new Set(),
      tags: validated.tags,
      nodes: validated.nodes,
      locations: validated.locations,
      closed: false,
    };
    this.domains.add(record);
    this.enqueueRegistry();
    this.enqueueSnapshot(record, record.state);
    return Object.freeze({
      replace: (state: RenderDomainState) => this.replace(record, state),
      update: (update: RenderDomainUpdate) => this.update(record, update),
      emit: (event: RenderEvent) => this.emit(record, event),
      close: () => this.closeDomain(record),
    });
  }

  setDataPeer(peer: SubsystemDataPeer | null): void {
    this.peerEpoch += 1;
    this.peer = peer;
    this.inFlight = null;
    this.resetQueue();
    this.cursors.clear();
    if (peer === null || this.closed) return;
    if (this.generation !== peer.binding.generation) {
      this.generation = peer.binding.generation;
      this.nextSerial = 1n;
      for (const domain of this.domains) {
        domain.wireId = `d${this.nextSerial.toString(36)}`;
        this.nextSerial += 1n;
        domain.consumedKeys.clear();
      }
    }
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
    this.inFlight = null;
    this.resetQueue();
    this.cursors.clear();
  }

  snapshotForQualification(): RenderManagerSnapshot {
    return detachedFrozen({
      generation: this.generation,
      domains: [...this.domains].map((domain) => ({
        domainId: domain.wireId,
        closed: domain.closed,
        state: domain.state,
      })),
      pendingWork: this.queuedCount,
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
    for (const key of validated.keys) {
      const oldTag = domain.tags.get(key) ?? null;
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
    domain.tags = validated.tags;
    domain.nodes = validated.nodes;
    domain.locations = validated.locations;
    this.enqueueState(domain, "snapshot");
  }

  private update(domain: DomainRecord, raw: RenderDomainUpdate): void {
    this.requireLive(domain);
    ownDataObject(raw, "RenderDomainUpdate");
    for (const key of Object.keys(raw)) {
      if (key !== "zIndex" && key !== "nodes") throw new TypeError("RenderDomainUpdate has invalid members");
    }
    const zIndexRaw = optionalMember<unknown>(raw as unknown as Record<string, unknown>, "zIndex", "zIndex");
    const nodesRaw = optionalMember<unknown>(raw as unknown as Record<string, unknown>, "nodes", "nodes");
    if (zIndexRaw === undefined && (nodesRaw === undefined || (Array.isArray(nodesRaw) && nodesRaw.length === 0))) {
      throw new TypeError("RenderDomainUpdate is empty");
    }
    let zIndex: number | undefined;
    if (zIndexRaw !== undefined) {
      if (!Number.isSafeInteger(zIndexRaw)) throw new TypeError("zIndex must be a signed safe integer");
      zIndex = zIndexRaw as number;
    }
    const nodes: ValidatedNodeUpdate[] = [];
    if (nodesRaw !== undefined) {
      const list = denseArray(nodesRaw, "nodes");
      const seen = new Set<string>();
      for (const item of list) {
        ownDataObject(item, "RenderNodeUpdate");
        for (const key of Object.keys(item)) {
          if (key !== "key" && key !== "attrs" && key !== "data") {
            throw new TypeError("RenderNodeUpdate has invalid members");
          }
        }
        const key = scalarString(optionalMember(item, "key", "RenderNodeUpdate.key"), false, "RenderNodeUpdate key");
        if (seen.has(key)) throw new TypeError("Duplicate RenderNodeUpdate key");
        seen.add(key);
        if (!domain.liveKeys.has(key)) throw new TypeError("Updated Render node is missing");
        const attrsRaw = optionalMember<unknown>(item, "attrs", "RenderNodeUpdate.attrs");
        const dataRaw = optionalMember<unknown>(item, "data", "RenderNodeUpdate.data");
        if (attrsRaw === undefined && dataRaw === undefined) throw new TypeError("RenderNodeUpdate is empty");
        const attrs = attrsRaw === undefined ? undefined : validateDelta(attrsRaw, "attrs", "attrs") as StringDelta;
        const data = dataRaw === undefined ? undefined : validateDelta(dataRaw, "data", "data") as DataDelta;
        nodes.push({
          key,
          ...(attrs === undefined ? {} : { attrs }),
          ...(data === undefined ? {} : { data }),
        });
      }
    }
    const next = applyCow(
      domain.state,
      zIndex ?? domain.state.zIndex,
      nodes,
      domain.nodes,
      domain.locations,
    );
    const ops = toWireOps(nodes);
    domain.state = next.state;
    for (const [key, node] of next.clones) domain.nodes.set(key, node);
    this.enqueueState(domain, "update", ops, zIndex);
  }

  private emit(domain: DomainRecord, raw: RenderEvent): void {
    this.requireLive(domain);
    const event = validateEventShape(raw);
    if (!domain.liveKeys.has(event.targetKey)) throw new TypeError("Stale Render Event target");
    if (this.peer === null) return;
    this.coalescibleSnapshots.delete(domain);
    this.enqueue({ kind: "event", domain, event });
    this.pump();
  }

  private closeDomain(domain: DomainRecord): void {
    if (domain.closed) return;
    domain.closed = true;
    this.domains.delete(domain);
    this.coalescibleSnapshots.delete(domain);
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
    if (this.pendingRegistry !== null) {
      this.pendingRegistry.message = message;
      this.pump();
      return;
    }
    const work: Extract<Work, { readonly kind: "registry" }> = { kind: "registry", message };
    this.pendingRegistry = work;
    this.enqueue(work);
    this.pump();
  }

  private enqueueSnapshot(domain: DomainRecord, state: RenderDomainState): void {
    this.enqueueState(domain, "snapshot", undefined, undefined, state);
  }

  private enqueueState(
    domain: DomainRecord,
    kind: "snapshot" | "update",
    ops?: readonly RenderNodeUpdateV1[],
    zIndex?: number,
    state = domain.state,
  ): void {
    if (this.peer === null || domain.closed) return;
    const cursor = this.cursors.get(domain);
    const baselined = cursor?.baselined === true;
    const pendingSnapshot = this.coalescibleSnapshots.get(domain);
    if (pendingSnapshot !== undefined) {
      pendingSnapshot.state = state;
      this.pump();
      return;
    }
    const work: StateWork = !baselined || kind === "snapshot" || ops === undefined
      ? { kind: "snapshot", domain, state }
      : { kind: "update", domain, state, ops, ...(zIndex === undefined ? {} : { zIndex }) };
    if (work.kind === "snapshot") this.coalescibleSnapshots.set(domain, work);
    this.enqueue(work);
    this.pump();
  }

  private enqueue(work: Work): void {
    this.work.push(work);
    this.queuedCount += 1;
  }

  private dequeue(): Work | undefined {
    while (this.workHead < this.work.length) {
      const index = this.workHead;
      this.workHead += 1;
      const work = this.work[index];
      this.work[index] = undefined;
      if (work === undefined) continue;
      this.queuedCount -= 1;
      if (work === this.pendingRegistry) this.pendingRegistry = null;
      if (work.kind === "snapshot" && this.coalescibleSnapshots.get(work.domain) === work) {
        this.coalescibleSnapshots.delete(work.domain);
      }
      if (this.workHead > 1024 && this.workHead * 2 > this.work.length) {
        this.work = this.work.slice(this.workHead);
        this.workHead = 0;
      }
      return work;
    }
    this.work = [];
    this.workHead = 0;
    return undefined;
  }

  private resetQueue(): void {
    for (let index = this.workHead; index < this.work.length; index += 1) this.work[index] = undefined;
    this.work = [];
    this.workHead = 0;
    this.queuedCount = 0;
    this.pendingRegistry = null;
    this.coalescibleSnapshots.clear();
  }

  private discardDomainWork(domain: DomainRecord): void {
    for (let index = this.workHead; index < this.work.length; index += 1) {
      const work = this.work[index];
      if (work !== undefined && work.kind !== "registry" && work.domain === domain) {
        this.work[index] = undefined;
        this.queuedCount -= 1;
      }
    }
    this.coalescibleSnapshots.delete(domain);
  }

  private invalidateOldPeer(closePeer: boolean): void {
    const oldPeer = this.peer;
    this.peer = null;
    this.peerEpoch += 1;
    this.inFlight = null;
    this.resetQueue();
    this.cursors.clear();
    if (closePeer && oldPeer !== null) void oldPeer.close();
  }

  private pump(): void {
    const peer = this.peer;
    if (peer === null || this.inFlight !== null) return;
    while (this.queuedCount > 0) {
      const work = this.dequeue();
      if (work === undefined) return;
      if (work.kind !== "registry" && (work.domain.closed || !this.domains.has(work.domain))) continue;
      if (isStateWork(work)) {
        const cursor = this.cursors.get(work.domain);
        if (cursor?.revision === Number.MAX_SAFE_INTEGER) {
          const oldId = work.domain.wireId;
          work.domain.wireId = `d${this.nextSerial.toString(36)}`;
          this.nextSerial += 1n;
          work.domain.consumedKeys.clear();
          this.cursors.delete(work.domain);
          this.discardDomainWork(work.domain);
          this.enqueueRegistry();
          this.enqueueSnapshot(work.domain, work.domain.state);
          if (oldId === work.domain.wireId) throw new Error("Render wire identity rollover failed");
          continue;
        }
      }
      const message = this.materialize(work);
      if (message === null) continue;
      const inFlight: InFlightPublication = {
        epoch: this.peerEpoch,
        peer,
        work,
        message,
      };
      this.inFlight = inFlight;
      const operation = message.type === "render.domains"
        ? peer.render.sendDomains(message)
        : message.type === "render.snapshot"
        ? peer.render.sendSnapshot(message)
        : message.type === "render.patch"
        ? peer.render.sendPatch(message)
        : peer.render.sendEvent(message);
      void operation.then(
        (outcome) => this.finishSend(inFlight, outcome.kind === "sent"),
        () => this.finishSend(inFlight, false),
      );
      return;
    }
  }

  private materialize(work: Work): PublicationMessage | null {
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
    if (work.kind === "update" && cursor?.baselined === true) {
      return {
        type: "render.patch",
        domainId: work.domain.wireId,
        baseRevision: cursor.revision,
        revision: cursor.revision + 1,
        ...(work.zIndex === undefined ? {} : { zIndex: work.zIndex }),
        ops: work.ops,
      };
    }
    const revision = cursor === undefined || !cursor.baselined ? 1 : cursor.revision + 1;
    return {
      type: "render.snapshot",
      domainId: work.domain.wireId,
      revision,
      zIndex: work.state.zIndex,
      roots: work.state.roots,
    };
  }

  private finishSend(inFlight: InFlightPublication, sent: boolean): void {
    if (this.inFlight !== inFlight || inFlight.epoch !== this.peerEpoch || inFlight.peer !== this.peer) return;
    this.inFlight = null;
    if (!sent) {
      this.invalidateOldPeer(false);
      return;
    }
    const { work, message } = inFlight;
    if (
      (message.type === "render.snapshot" || message.type === "render.patch")
      && work.kind !== "registry"
      && !work.domain.closed
    ) {
      this.cursors.set(work.domain, { baselined: true, revision: message.revision });
    }
    this.pump();
  }
}
