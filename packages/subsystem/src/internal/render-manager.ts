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

interface DomainRecord {
  wireId: string;
  state: RenderDomainState;
  readonly liveKeys: Set<string>;
  readonly consumedKeys: Set<string>;
  tags: Map<string, string>;
  nodes: Map<string, RenderNode>;
  parents: Map<string, string | null>;
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
  if (typeof value !== "string") throw new TypeError(label + " must be a string");
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) throw new TypeError(label + " has invalid Unicode");
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      throw new TypeError(label + " has invalid Unicode");
    }
  }
  if (!allowEmpty && value.length === 0) throw new TypeError(label + " cannot be empty");
  return value;
}

interface NodeLocation {
  readonly parentKey: string | null;
  readonly index: number;
}

interface JsonCloneEntry {
  readonly key: string | number;
  readonly value: unknown;
}

interface JsonCloneContainer {
  readonly target: Record<string, JsonValue> | JsonValue[];
  readonly entries: readonly JsonCloneEntry[];
}

function cloneContainer(value: object, label: string): JsonCloneContainer {
  let isArray: boolean;
  let descriptors: PropertyDescriptorMap;
  let prototype: object | null;
  try {
    isArray = Array.isArray(value);
    prototype = Object.getPrototypeOf(value) as object | null;
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch {
    throw new TypeError(label + " must be plain JSON");
  }

  if (isArray) {
    const length = (value as unknown[]).length;
    const entries: JsonCloneEntry[] = [];
    for (const key of Reflect.ownKeys(descriptors)) {
      if (typeof key === "symbol") throw new TypeError(label + " array cannot contain symbol properties");
      if (key === "length") continue;
      const index = Number(key);
      if (!Number.isInteger(index) || index < 0 || index >= length || String(index) !== key) {
        throw new TypeError(label + " array cannot contain extra properties");
      }
      const descriptor = descriptors[key];
      if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) {
        throw new TypeError(label + " array elements must be enumerable data properties");
      }
      entries.push({ key: index, value: descriptor.value });
    }
    if (entries.length !== length) throw new TypeError(label + " array must be dense");
    entries.sort((left, right) => (left.key as number) - (right.key as number));
    return { target: new Array<JsonValue>(length), entries };
  }

  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(label + " must be a plain object");
  }
  const entries: JsonCloneEntry[] = [];
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key === "symbol") throw new TypeError(label + " object cannot contain symbol properties");
    scalarString(key, true, label + " key");
    const descriptor = descriptors[key];
    if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) {
      throw new TypeError(label + " object members must be enumerable data properties");
    }
    entries.push({ key, value: descriptor.value });
  }
  return { target: Object.create(null) as Record<string, JsonValue>, entries };
}

/** Validate and detach a JSON subtree in one iterative pass. */
function cloneJsonValue(value: unknown, label: string): JsonValue {
  const primitive = (current: unknown): JsonValue | undefined => {
    if (current === null || typeof current === "boolean") return current;
    if (typeof current === "string") return scalarString(current, true, label + " string");
    if (typeof current === "number") {
      if (!Number.isFinite(current)) throw new TypeError(label + " number must be finite");
      return current;
    }
    return undefined;
  };

  const first = primitive(value);
  if (first !== undefined || value === null) return first as JsonValue;
  if (typeof value !== "object") throw new TypeError(label + " must be plain JSON");

  const root = cloneContainer(value, label);
  const active = new WeakSet<object>();
  const completed = new WeakMap<object, Record<string, JsonValue> | JsonValue[]>();
  active.add(value);
  completed.set(value, root.target);
  const stack: Array<{
    readonly source: object;
    readonly target: Record<string, JsonValue> | JsonValue[];
    readonly entries: readonly JsonCloneEntry[];
    next: number;
  }> = [{ source: value, target: root.target, entries: root.entries, next: 0 }];

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
    if (typeof entry.value !== "object") throw new TypeError(label + " must be plain JSON");
    if (active.has(entry.value)) throw new TypeError(label + " cannot contain cycles");
    const prior = completed.get(entry.value);
    if (prior !== undefined) {
      assign(frame.target, entry.key, prior as JsonValue);
      continue;
    }
    const nested = cloneContainer(entry.value, label);
    completed.set(entry.value, nested.target);
    active.add(entry.value);
    assign(frame.target, entry.key, nested.target as JsonValue);
    stack.push({
      source: entry.value,
      target: nested.target,
      entries: nested.entries,
      next: 0,
    });
  }
  return root.target as JsonValue;
}

function cloneJsonObject(value: unknown, label: string): JsonObject {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(label + " must be a JSON object");
  }
  return cloneJsonValue(value, label) as JsonObject;
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

function denseArray(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new TypeError(label + " must be an array");
  const keys = Reflect.ownKeys(value);
  if (keys.length !== value.length + 1 || !keys.includes("length")) {
    throw new TypeError(label + " must be a dense array");
  }
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) {
      throw new TypeError(label + " must be a dense array");
    }
  }
  return value;
}

function validateStateShape(value: unknown): {
  readonly state: RenderDomainState;
  readonly keys: Set<string>;
  readonly tags: Map<string, string>;
  readonly nodes: Map<string, RenderNode>;
  readonly parents: Map<string, string | null>;
  readonly locations: Map<string, NodeLocation>;
} {
  ownDataObject(value, "RenderDomainState");
  exactKeys(value, ["zIndex", "roots"], "RenderDomainState");
  if (!Number.isSafeInteger(value.zIndex)) throw new TypeError("zIndex must be a signed safe integer");
  const rawRoots = denseArray(value.roots, "Render roots");
  const roots = new Array<RenderNode>(rawRoots.length);
  const keys = new Set<string>();
  const tags = new Map<string, string>();
  const nodes = new Map<string, RenderNode>();
  const parents = new Map<string, string | null>();
  const locations = new Map<string, NodeLocation>();
  const built: Array<{
    readonly key: string;
    readonly tag: string;
    readonly attrs: Readonly<Record<string, string>>;
    readonly data: JsonObject;
    readonly children: RenderNode[];
  }> = [];
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
    const node = { key, tag, attrs, data, children };
    frame.parentChildren[frame.index] = node as RenderNode;
    built.push(node);
    nodes.set(key, node as RenderNode);
    parents.set(key, frame.parentKey);
    locations.set(key, { parentKey: frame.parentKey, index: frame.index });

    for (let index = rawChildren.length - 1; index >= 0; index -= 1) {
      stack.push({ raw: rawChildren[index], parentChildren: children, index, parentKey: key });
    }
  }

  for (const node of built) {
    Object.freeze(node.children);
    Object.freeze(node);
  }
  Object.freeze(roots);
  return {
    state: Object.freeze({ zIndex: value.zIndex as number, roots }),
    keys,
    tags,
    nodes,
    parents,
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

function validateDelta(
  raw: unknown,
  kind: "attrs" | "data",
  label: string,
): StringDelta | DataDelta {
  ownDataObject(raw, label);
  const allowed = new Set(["set", "remove"]);
  for (const key of Object.keys(raw)) {
    if (!allowed.has(key)) throw new TypeError(label + " has invalid members");
  }
  const setRaw = optionalMember<unknown>(raw, "set", label + ".set");
  const removeRaw = optionalMember<unknown>(raw, "remove", label + ".remove");
  if (setRaw === undefined && removeRaw === undefined) throw new TypeError(label + " is empty");

  let set: Record<string, string> | Record<string, JsonValue> | undefined;
  if (setRaw !== undefined) {
    ownDataObject(setRaw, label + ".set");
    const copied = Object.create(null) as Record<string, string | JsonValue>;
    for (const key of Object.keys(setRaw)) {
      if (kind === "attrs") {
        scalarString(key, false, label + ".set key");
        copied[key] = scalarString(setRaw[key], true, label + ".set value");
      } else {
        scalarString(key, true, label + ".set key");
        copied[key] = cloneJsonValue(setRaw[key], label + ".set value");
      }
    }
    if (Object.keys(copied).length === 0 && removeRaw === undefined) throw new TypeError(label + " is empty");
    set = copied;
  }

  let remove: string[] | undefined;
  if (removeRaw !== undefined) {
    const items = denseArray(removeRaw, label + ".remove");
    if (items.length === 0 && setRaw === undefined) throw new TypeError(label + " is empty");
    remove = items.map((item, index) => scalarString(item, kind === "data", label + ".remove[" + index + "]"));
  }
  if ((set === undefined || Object.keys(set).length === 0) && (remove === undefined || remove.length === 0)) {
    throw new TypeError(label + " is empty");
  }
  const removed = new Set(remove ?? []);
  if (set !== undefined) {
    for (const key of Object.keys(set)) {
      if (removed.has(key)) throw new TypeError(label + " set/remove overlap");
    }
  }
  return {
    ...(set === undefined ? {} : { set: Object.freeze(set) }),
    ...(remove === undefined ? {} : { remove: Object.freeze(remove) }),
  } as StringDelta | DataDelta;
}

function validateAttrs(attrs: Readonly<Record<string, string>>): void {
  for (const key of Object.keys(attrs)) {
    scalarString(key, false, "RenderNode attr key");
    scalarString(attrs[key], true, "RenderNode attr value");
  }
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
): {
  readonly state: RenderDomainState;
  readonly clones: ReadonlyMap<string, RenderNode>;
} {
  const clones = new Map<string, MutableNode>();
  const clonedChildren = new Set<string>();
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
      if (original === undefined || location === undefined) {
        throw new TypeError("Updated Render node is missing");
      }
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
        if (!clonedChildren.has(location.parentKey)) {
          parent.children = parent.children.slice();
          clonedChildren.add(location.parentKey);
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
    if (clonedChildren.has(key)) Object.freeze(node.children);
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
  private work: Work[] = [];
  private inFlight: InFlightPublication | null = null;
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
    this.inFlight = null;
    this.work = [];
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
      if (!Number.isInteger(zIndexRaw)) throw new TypeError("zIndex must be an integer");
      if ((zIndexRaw as number) < -2_147_483_648 || (zIndexRaw as number) > 2_147_483_647) {
        throw new RangeError("zIndex limit exceeded");
      }
      zIndex = zIndexRaw as number;
    }
    const nodes: ValidatedNodeUpdate[] = [];
    if (nodesRaw !== undefined) {
      const list = denseArray(nodesRaw, MAX_NODE_OPS, "nodes");
      const seen = new Set<string>();
      for (const item of list) {
        ownDataObject(item, "RenderNodeUpdate");
        for (const key of Object.keys(item)) {
          if (key !== "key" && key !== "attrs" && key !== "data") {
            throw new TypeError("RenderNodeUpdate has invalid members");
          }
        }
        const key = scalarString(optionalMember(item, "key", "RenderNodeUpdate.key"), 1, 128, "RenderNodeUpdate key");
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
    const nextState = applyCow(domain.state, zIndex ?? domain.state.zIndex, nodes);
    probeLimit({
      type: "render.snapshot",
      domainId: PROBE_DOMAIN_ID,
      revision: Number.MAX_SAFE_INTEGER,
      zIndex: nextState.zIndex,
      roots: nextState.roots,
    }, "Render Snapshot");
    const ops = toWireOps(nodes);
    const patch: Record<string, unknown> = {
      type: "render.patch",
      domainId: PROBE_DOMAIN_ID,
      baseRevision: Number.MAX_SAFE_INTEGER - 1,
      revision: Number.MAX_SAFE_INTEGER,
      ops,
    };
    if (zIndex !== undefined) patch.zIndex = zIndex;
    probeLimit(patch, "Render Patch");
    domain.state = nextState;
    this.enqueueState(domain, "update", ops, zIndex);
  }

  private emit(domain: DomainRecord, raw: RenderEvent): void {
    this.requireLive(domain);
    const event = validateEventShape(raw);
    if (!domain.liveKeys.has(event.targetKey)) throw new TypeError("Stale Render Event target");
    if (this.peer === null) return;
    if (this.work.length >= MAX_PENDING_WORK) {
      if (!this.dropOldestEvent()) return;
    }
    const cursor = this.cursors.get(domain);
    const baselined = cursor?.baselined === true;
    if (!baselined) {
      let insertAt = this.work.length;
      for (let index = this.work.length - 1; index >= 0; index -= 1) {
        const item = this.work[index];
        if (item !== undefined && isStateWork(item) && item.domain === domain) {
          insertAt = index + 1;
          break;
        }
      }
      this.work.splice(insertAt, 0, { kind: "event", domain, event });
    } else {
      this.work.push({ kind: "event", domain, event });
    }
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
    if (updated) {
      this.pump();
      return;
    }
    if (this.makeRoomForAuthoritative()) this.work.push({ kind: "registry", message });
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
    const lastBarrier = this.lastBarrierIndex(domain);
    for (let index = this.work.length - 1; index > lastBarrier; index -= 1) {
      const item = this.work[index];
      if (item?.kind === "snapshot" && item.domain === domain) {
        item.state = state;
        this.pump();
        return;
      }
    }
    const work: Work = !baselined || kind === "snapshot" || ops === undefined
      ? { kind: "snapshot", domain, state }
      : { kind: "update", domain, state, ops, ...(zIndex === undefined ? {} : { zIndex }) };
    if (this.makeRoomForAuthoritative()) this.work.push(work);
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
      if (this.dropOldestEvent()) continue;
      let candidate = -1;
      for (let index = 0; index < this.work.length; index += 1) {
        const item = this.work[index];
        if (item === undefined || !isStateWork(item)) continue;
        const later = this.work.slice(index + 1).some((entry) => isStateWork(entry) && entry.domain === item.domain);
        if (later) {
          candidate = index;
          break;
        }
      }
      if (candidate < 0) {
        this.invalidateOldPeer(true);
        return false;
      }
      const domain = (this.work[candidate] as StateWork).domain;
      const indices: number[] = [];
      for (let index = 0; index < this.work.length; index += 1) {
        const item = this.work[index];
        if (item !== undefined && isStateWork(item) && item.domain === domain) indices.push(index);
      }
      const lastIndex = indices[indices.length - 1];
      if (lastIndex === undefined) {
        this.invalidateOldPeer(true);
        return false;
      }
      const last = this.work[lastIndex] as StateWork;
      this.work[lastIndex] = { kind: "snapshot", domain, state: last.state };
      for (let index = indices.length - 2; index >= 0; index -= 1) {
        const removeAt = indices[index];
        if (removeAt !== undefined) this.work.splice(removeAt, 1);
      }
    }
    return this.peer !== null;
  }

  private dropOldestEvent(): boolean {
    const index = this.work.findIndex((item) => item.kind === "event");
    if (index < 0) return false;
    this.work.splice(index, 1);
    return true;
  }

  private invalidateOldPeer(closePeer: boolean): void {
    const oldPeer = this.peer;
    this.peer = null;
    this.peerEpoch += 1;
    this.inFlight = null;
    this.work = [];
    this.cursors.clear();
    if (closePeer && oldPeer !== null) void oldPeer.close();
  }

  private pump(): void {
    const peer = this.peer;
    if (peer === null || this.inFlight !== null || this.work.length === 0) return;
    const work = this.work.shift();
    if (work === undefined) return;
    if (work.kind !== "registry" && (work.domain.closed || !this.domains.has(work.domain))) {
      this.pump();
      return;
    }
    if (isStateWork(work)) {
      const cursor = this.cursors.get(work.domain);
      if (cursor?.revision === Number.MAX_SAFE_INTEGER) {
        const oldId = work.domain.wireId;
        work.domain.wireId = `d${this.nextSerial.toString(36)}`;
        this.nextSerial += 1n;
        this.cursors.delete(work.domain);
        this.work = this.work.filter((item) => item.kind === "registry" || item.domain !== work.domain);
        this.work.unshift({ kind: "snapshot", domain: work.domain, state: work.domain.state });
        this.work.unshift({ kind: "registry", message: this.registryMessage() });
        if (oldId === work.domain.wireId) throw new Error("Render wire identity rollover failed");
        this.pump();
        return;
      }
    }
    const message = this.materialize(work);
    if (message === null) {
      this.pump();
      return;
    }
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
