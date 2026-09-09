import type {
  DataInboundDisposition,
  RenderDomainsV1,
  RenderEventV1,
  RenderNodeV1,
  RenderPatchOpV1,
  RenderPatchV1,
  RenderSnapshotV1,
} from "@loomrealm/data";

type JsonValue = null | boolean | number | string | readonly JsonValue[] | JsonObject;
interface JsonObject { readonly [key: string]: JsonValue; }

const accepted: DataInboundDisposition = Object.freeze({ kind: "accepted" });
const MAX_NODES = 16_384;
const MAX_TREE_DEPTH = 30;
const MAX_ATTRS = 256;
const MAX_CONTAINER_MEMBERS = 16_384;
const MAX_DATA_BYTES = 262_144;
const MAX_DATA_DEPTH = 32;
const MAX_EVENTS = 1_024;

interface MutableNode {
  key: string;
  tag: string;
  attrs: Record<string, string>;
  data: Record<string, JsonValue>;
  children: MutableNode[];
}

interface DomainReplica {
  readonly domainId: string;
  baselined: boolean;
  revision: number | null;
  zIndex: number;
  roots: MutableNode[];
}

interface DomainIdentity {
  readonly liveTags: Map<string, string>;
  readonly consumedKeys: Set<string>;
}

function fatal(message: string): DataInboundDisposition {
  return Object.freeze({ kind: "protocol-fatal", cause: new Error(message) });
}

function cloneJson<T extends JsonValue>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((child) => cloneJson(child)) as unknown as T;
  const output = Object.create(null) as Record<string, JsonValue>;
  for (const key of Object.keys(value)) output[key] = cloneJson((value as JsonObject)[key] as JsonValue);
  return output as T;
}

function jsonDepth(value: JsonValue): number {
  let maximum = 0;
  const stack: Array<{ readonly value: JsonValue; readonly depth: number }> = [{ value, depth: 0 }];
  while (stack.length > 0) {
    const entry = stack.pop();
    if (entry === undefined || entry.value === null || typeof entry.value !== "object") continue;
    const depth = entry.depth + 1;
    maximum = Math.max(maximum, depth);
    for (const child of Object.values(entry.value)) stack.push({ value: child as JsonValue, depth });
  }
  return maximum;
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function cloneNode(node: RenderNodeV1 | MutableNode): MutableNode {
  const attrs = Object.create(null) as Record<string, string>;
  for (const key of Object.keys(node.attrs)) attrs[key] = node.attrs[key] as string;
  return {
    key: node.key,
    tag: node.tag,
    attrs,
    data: cloneJson(node.data) as Record<string, JsonValue>,
    children: node.children.map(cloneNode),
  };
}

function freezeJson<T extends JsonValue>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) freezeJson(child as JsonValue);
    Object.freeze(value);
  }
  return value;
}

function freezeNode(node: MutableNode): RenderNodeV1 {
  for (const child of node.children) freezeNode(child);
  Object.freeze(node.attrs);
  freezeJson(node.data);
  Object.freeze(node.children);
  return Object.freeze(node);
}

function validateData(value: JsonObject): void {
  if (jsonDepth(value) > MAX_DATA_DEPTH) throw new Error("Render data depth limit exceeded");
  const stack: JsonValue[] = [value];
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined || current === null || typeof current !== "object") continue;
    if (Array.isArray(current)) {
      if (current.length > MAX_CONTAINER_MEMBERS) throw new Error("Render data array limit exceeded");
      stack.push(...current);
    } else {
      const keys = Object.keys(current);
      if (keys.length > MAX_CONTAINER_MEMBERS) throw new Error("Render data member limit exceeded");
      for (const key of keys) {
        if (byteLength(key) > 256) throw new Error("Render data key limit exceeded");
        stack.push((current as JsonObject)[key] as JsonValue);
      }
    }
  }
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > MAX_DATA_BYTES) {
    throw new Error("Render data byte limit exceeded");
  }
}

function validateTree(roots: readonly MutableNode[]): Map<string, MutableNode> {
  const index = new Map<string, MutableNode>();
  const stack = roots.map((node) => ({ node, depth: 1 }));
  while (stack.length > 0) {
    const entry = stack.pop();
    if (entry === undefined) continue;
    if (entry.depth > MAX_TREE_DEPTH) throw new Error("Render tree depth limit exceeded");
    if (index.has(entry.node.key)) throw new Error("Duplicate Render node key");
    index.set(entry.node.key, entry.node);
    if (index.size > MAX_NODES) throw new Error("Render node count limit exceeded");
    if (Object.keys(entry.node.attrs).length > MAX_ATTRS) throw new Error("Render attrs limit exceeded");
    for (const [key, value] of Object.entries(entry.node.attrs)) {
      const keyBytes = byteLength(key);
      const valueBytes = byteLength(value);
      if (keyBytes < 1 || keyBytes > 128 || valueBytes > 4096) {
        throw new Error("Render attrs string limit exceeded");
      }
    }
    validateData(entry.node.data);
    for (const child of entry.node.children) stack.push({ node: child, depth: entry.depth + 1 });
  }
  return index;
}

function findContainer(
  roots: MutableNode[],
  key: string,
): { readonly container: MutableNode[]; readonly index: number } | null {
  const stack: MutableNode[][] = [roots];
  while (stack.length > 0) {
    const container = stack.pop();
    if (container === undefined) continue;
    for (let index = 0; index < container.length; index += 1) {
      const node = container[index];
      if (node === undefined) continue;
      if (node.key === key) return { container, index };
      stack.push(node.children);
    }
  }
  return null;
}

function collectKeys(node: MutableNode): string[] {
  const result: string[] = [];
  const stack = [node];
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined) continue;
    result.push(current.key);
    stack.push(...current.children);
  }
  return result;
}

function destination(
  roots: MutableNode[],
  parentKey: string | null,
  beforeKey: string | null,
): { readonly container: MutableNode[]; readonly index: number } {
  const tree = validateTree(roots);
  const container = parentKey === null ? roots : tree.get(parentKey)?.children;
  if (container === undefined) throw new Error("Missing Patch destination parent");
  if (beforeKey === null) return { container, index: container.length };
  const index = container.findIndex((node) => node.key === beforeKey);
  if (index < 0) throw new Error("beforeKey is not a destination sibling");
  return { container, index };
}

function applyDelta<T extends string | JsonValue>(
  target: Record<string, T>,
  delta: { readonly set?: Readonly<Record<string, T>>; readonly remove?: readonly string[] },
): void {
  if (delta.set !== undefined) {
    for (const key of Object.keys(delta.set)) target[key] = cloneJson(delta.set[key] as JsonValue) as T;
  }
  if (delta.remove !== undefined) {
    for (const key of delta.remove) {
      if (!Object.prototype.hasOwnProperty.call(target, key)) throw new Error("Delta removes missing member");
      delete target[key];
    }
  }
}

export interface RenderStoreSnapshot {
  readonly generation: number;
  readonly currentCarrier: boolean;
  readonly registrySeen: boolean;
  readonly stalePresentationCache: boolean;
  readonly events: readonly RenderEventV1[];
  readonly logicalOrder: readonly string[];
  readonly domains: readonly {
    readonly domainId: string;
    readonly baselined: boolean;
    readonly revision: number | null;
    readonly zIndex: number;
    readonly roots: readonly RenderNodeV1[];
  }[];
}

export interface RenderPresentationFacts {
  readonly generation: number;
  readonly currentCarrier: boolean;
  readonly registrySeen: boolean;
  readonly domains: readonly {
    readonly domainId: string;
    readonly baselined: boolean;
    readonly zIndex: number;
    readonly roots: readonly RenderNodeV1[];
  }[];
}

function utf8Less(left: string, right: string): boolean {
  const a = left[Symbol.iterator]();
  const b = right[Symbol.iterator]();
  for (;;) {
    const av = a.next();
    const bv = b.next();
    if (av.done && bv.done) return false;
    if (av.done) return true;
    if (bv.done) return false;
    const ac = av.value.codePointAt(0) ?? 0;
    const bc = bv.value.codePointAt(0) ?? 0;
    if (ac !== bc) return ac < bc;
  }
}

export class RendererRenderStore {
  private currentCarrier = false;
  private registrySeen = false;
  private stalePresentationCache = false;
  private domains = new Map<string, DomainReplica>();
  private liveDomainIds = new Set<string>();
  private readonly retiredDomainIds = new Set<string>();
  private readonly identities = new Map<string, DomainIdentity>();
  private events: RenderEventV1[] = [];

  constructor(private readonly generation: number) {}

  beginCarrier(): void {
    this.currentCarrier = true;
    this.registrySeen = false;
    this.stalePresentationCache = false;
    this.events = [];
    const next = new Map<string, DomainReplica>();
    for (const domainId of this.liveDomainIds) {
      const old = this.domains.get(domainId);
      next.set(domainId, {
        domainId,
        baselined: false,
        revision: null,
        zIndex: old?.zIndex ?? 0,
        roots: old?.roots.map(cloneNode) ?? [],
      });
    }
    this.domains = next;
  }

  retireCarrier(): void {
    if (!this.currentCarrier) return;
    this.currentCarrier = false;
    this.registrySeen = false;
    this.stalePresentationCache = true;
    this.events = [];
  }

  onDomains(message: RenderDomainsV1): DataInboundDisposition {
    if (!this.currentCarrier) return accepted;
    try {
      const nextIds = new Set(message.domains);
      for (const domainId of nextIds) {
        if (!this.liveDomainIds.has(domainId) && this.retiredDomainIds.has(domainId)) {
          throw new Error("Retired Render Domain cannot reappear");
        }
      }
      const next = new Map<string, DomainReplica>();
      for (const domainId of nextIds) {
        const current = this.domains.get(domainId);
        if (this.registrySeen && current !== undefined) {
          next.set(domainId, current);
        } else {
          next.set(domainId, {
            domainId,
            baselined: false,
            revision: null,
            zIndex: current?.zIndex ?? 0,
            roots: current?.roots.map(cloneNode) ?? [],
          });
        }
        if (!this.identities.has(domainId)) {
          this.identities.set(domainId, { liveTags: new Map(), consumedKeys: new Set() });
        }
      }
      for (const domainId of this.liveDomainIds) {
        if (!nextIds.has(domainId)) this.retiredDomainIds.add(domainId);
      }
      this.domains = next;
      this.liveDomainIds = nextIds;
      this.registrySeen = true;
      return accepted;
    } catch (cause) {
      return fatal(String(cause));
    }
  }

  onSnapshot(message: RenderSnapshotV1): DataInboundDisposition {
    if (!this.currentCarrier) return accepted;
    const current = this.domains.get(message.domainId);
    if (!this.registrySeen || current === undefined) return fatal("Snapshot Domain is not current");
    try {
      if (current.baselined && message.revision !== (current.revision as number) + 1) {
        throw new Error("Snapshot revision continuity failure");
      }
      const roots = message.roots.map(cloneNode);
      const index = validateTree(roots);
      const identity = this.identities.get(message.domainId);
      if (identity === undefined) throw new Error("Missing Domain identity state");
      const nextTags = new Map<string, string>();
      for (const [key, node] of index) {
        if (identity.consumedKeys.has(key)) throw new Error("Consumed Render node key reintroduced");
        const priorTag = identity.liveTags.get(key);
        if (priorTag !== undefined && priorTag !== node.tag) throw new Error("Live Render node tag changed");
        nextTags.set(key, node.tag);
      }
      const consumed = new Set(identity.consumedKeys);
      for (const key of identity.liveTags.keys()) if (!nextTags.has(key)) consumed.add(key);
      const committed: DomainReplica = {
        domainId: message.domainId,
        baselined: true,
        revision: message.revision,
        zIndex: message.zIndex,
        roots,
      };
      for (const root of committed.roots) freezeNode(root);
      this.identities.set(message.domainId, { liveTags: nextTags, consumedKeys: consumed });
      this.domains.set(message.domainId, committed);
      return accepted;
    } catch (cause) {
      return fatal(String(cause));
    }
  }

  onPatch(message: RenderPatchV1): DataInboundDisposition {
    if (!this.currentCarrier) return accepted;
    const current = this.domains.get(message.domainId);
    if (!this.registrySeen || current === undefined || !current.baselined) {
      return fatal("Patch before current baseline");
    }
    if (message.baseRevision !== current.revision || message.revision !== message.baseRevision + 1) {
      return fatal("Patch revision continuity failure");
    }
    try {
      const roots = current.roots.map(cloneNode);
      const sourceIdentity = this.identities.get(message.domainId);
      if (sourceIdentity === undefined) throw new Error("Missing Domain identity state");
      const liveTags = new Map(sourceIdentity.liveTags);
      const consumedKeys = new Set(sourceIdentity.consumedKeys);
      for (const op of message.ops) this.applyOperation(roots, liveTags, consumedKeys, op);
      validateTree(roots);
      const committed: DomainReplica = {
        domainId: current.domainId,
        baselined: true,
        revision: message.revision,
        zIndex: message.zIndex ?? current.zIndex,
        roots,
      };
      for (const root of roots) freezeNode(root);
      this.identities.set(message.domainId, { liveTags, consumedKeys });
      this.domains.set(message.domainId, committed);
      return accepted;
    } catch (cause) {
      return fatal(String(cause));
    }
  }

  onEvent(message: RenderEventV1): DataInboundDisposition {
    if (!this.currentCarrier) return accepted;
    const domain = this.domains.get(message.domainId);
    if (!this.registrySeen || domain === undefined || !domain.baselined) return accepted;
    if (!this.identities.get(message.domainId)?.liveTags.has(message.targetKey)) return accepted;
    if (this.events.length >= MAX_EVENTS) this.events.shift();
    this.events.push(Object.freeze({ ...message, data: freezeJson(cloneJson(message.data)) }));
    return accepted;
  }

  snapshotForQualification(): RenderStoreSnapshot {
    const domains = [...this.domains.values()].map((domain) => ({
      domainId: domain.domainId,
      baselined: domain.baselined,
      revision: domain.revision,
      zIndex: domain.zIndex,
      roots: domain.roots as readonly RenderNodeV1[],
    }));
    const logicalOrder = domains.filter((domain) => domain.baselined).sort((left, right) =>
      left.zIndex !== right.zIndex
        ? left.zIndex - right.zIndex
        : left.domainId === right.domainId
        ? 0
        : utf8Less(left.domainId, right.domainId) ? -1 : 1)
      .map(({ domainId }) => domainId);
    return Object.freeze({
      generation: this.generation,
      currentCarrier: this.currentCarrier,
      registrySeen: this.registrySeen,
      stalePresentationCache: this.stalePresentationCache,
      events: Object.freeze([...this.events]),
      logicalOrder: Object.freeze(logicalOrder),
      domains: Object.freeze(domains),
    });
  }

  readPresentationFacts(): RenderPresentationFacts {
    return Object.freeze({
      generation: this.generation,
      currentCarrier: this.currentCarrier,
      registrySeen: this.registrySeen,
      domains: Object.freeze([...this.domains.values()].map((domain) => Object.freeze({
        domainId: domain.domainId,
        baselined: domain.baselined,
        zIndex: domain.zIndex,
        roots: domain.roots as readonly RenderNodeV1[],
      }))),
    });
  }

  private applyOperation(
    roots: MutableNode[],
    liveTags: Map<string, string>,
    consumedKeys: Set<string>,
    op: RenderPatchOpV1,
  ): void {
    if (op.op === "insert") {
      const node = cloneNode(op.node);
      const inserted = validateTree([node]);
      for (const [key] of inserted) {
        if (liveTags.has(key) || consumedKeys.has(key)) throw new Error("Inserted Render node key was already used");
      }
      const target = destination(roots, op.parentKey, op.beforeKey);
      target.container.splice(target.index, 0, node);
      validateTree(roots);
      for (const [key, insertedNode] of inserted) liveTags.set(key, insertedNode.tag);
      return;
    }
    if (op.op === "remove") {
      const found = findContainer(roots, op.key);
      if (found === null) throw new Error("Removed Render node is missing");
      const removed = found.container[found.index];
      if (removed === undefined) throw new Error("Removed Render node is missing");
      found.container.splice(found.index, 1);
      for (const key of collectKeys(removed)) {
        liveTags.delete(key);
        consumedKeys.add(key);
      }
      validateTree(roots);
      return;
    }
    if (op.op === "move") {
      if (op.beforeKey === op.key || op.parentKey === op.key) throw new Error("Render node cannot move relative to itself");
      const found = findContainer(roots, op.key);
      if (found === null) throw new Error("Moved Render node is missing");
      const node = found.container[found.index];
      if (node === undefined) throw new Error("Moved Render node is missing");
      const subtree = new Set(collectKeys(node));
      if (op.parentKey !== null && subtree.has(op.parentKey)) throw new Error("Render node cannot move under descendant");
      if (op.beforeKey !== null && subtree.has(op.beforeKey)) throw new Error("Render node cannot move before its own subtree");
      found.container.splice(found.index, 1);
      const target = destination(roots, op.parentKey, op.beforeKey);
      target.container.splice(target.index, 0, node);
      validateTree(roots);
      return;
    }
    const tree = validateTree(roots);
    const node = tree.get(op.key);
    if (node === undefined) throw new Error("Updated Render node is missing");
    if (op.attrs !== undefined) applyDelta(node.attrs, op.attrs);
    if (op.data !== undefined) applyDelta(node.data, op.data);
    validateTree(roots);
  }
}
