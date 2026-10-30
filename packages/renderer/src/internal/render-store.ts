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

interface MutableNode {
  key: string;
  tag: string;
  attrs: Record<string, string>;
  data: Record<string, JsonValue>;
  children: MutableNode[];
}

interface NodeLocation {
  readonly parentKey: string | null;
  readonly index: number;
}

interface TreeIndex {
  readonly nodes: Map<string, MutableNode>;
  readonly locations: Map<string, NodeLocation>;
}

interface DomainReplica {
  readonly domainId: string;
  baselined: boolean;
  revision: number | null;
  zIndex: number;
  roots: MutableNode[];
  nodes: Map<string, MutableNode>;
  locations: Map<string, NodeLocation>;
}

interface DomainIdentity {
  readonly liveTags: Map<string, string>;
  readonly consumedKeys: Set<string>;
}

function fatal(message: string): DataInboundDisposition {
  return Object.freeze({ kind: "protocol-fatal", cause: new Error(message) });
}

/** Detach and freeze one JSON subtree without recursion or a second validation pass. */
function cloneJson<T extends JsonValue>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  const active = new WeakSet<object>();
  const completed = new WeakMap<object, Record<string, JsonValue> | JsonValue[]>();
  const make = (source: object): {
    target: Record<string, JsonValue> | JsonValue[];
    entries: Array<{ key: string | number; value: unknown }>;
  } => {
    if (Array.isArray(source)) {
      const target = new Array<JsonValue>(source.length);
      const entries: Array<{ key: string | number; value: unknown }> = [];
      const keys = Reflect.ownKeys(source);
      if (keys.length !== source.length + 1 || !keys.includes("length")) {
        throw new TypeError("Invalid JSON array shape");
      }
      for (let index = 0; index < source.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(source, String(index));
        if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) {
          throw new TypeError("Invalid JSON array element");
        }
        entries.push({ key: index, value: descriptor.value });
      }
      return { target, entries };
    }
    const prototype = Object.getPrototypeOf(source);
    if (prototype !== Object.prototype && prototype !== null) throw new TypeError("Invalid JSON object");
    const target = Object.create(null) as Record<string, JsonValue>;
    const entries: Array<{ key: string | number; value: unknown }> = [];
    for (const key of Reflect.ownKeys(source)) {
      if (typeof key !== "string") throw new TypeError("JSON object cannot contain symbol keys");
      const descriptor = Object.getOwnPropertyDescriptor(source, key);
      if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) {
        throw new TypeError("Invalid JSON object member");
      }
      entries.push({ key, value: descriptor.value });
    }
    return { target, entries };
  };

  const root = make(value as object);
  active.add(value as object);
  completed.set(value as object, root.target);
  const stack: Array<{
    source: object;
    target: Record<string, JsonValue> | JsonValue[];
    entries: Array<{ key: string | number; value: unknown }>;
    next: number;
  }> = [{ source: value as object, target: root.target, entries: root.entries, next: 0 }];
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
    const child = entry.value;
    if (child === null || typeof child === "string" || typeof child === "boolean") {
      assign(frame.target, entry.key, child);
      continue;
    }
    if (typeof child === "number") {
      if (!Number.isFinite(child)) throw new TypeError("JSON number must be finite");
      assign(frame.target, entry.key, child);
      continue;
    }
    if (typeof child !== "object") throw new TypeError("Invalid JSON value");
    if (active.has(child)) throw new TypeError("Cyclic JSON value");
    const prior = completed.get(child);
    if (prior !== undefined) {
      assign(frame.target, entry.key, prior as JsonValue);
      continue;
    }
    const nested = make(child);
    active.add(child);
    completed.set(child, nested.target);
    assign(frame.target, entry.key, nested.target as JsonValue);
    stack.push({ source: child, target: nested.target, entries: nested.entries, next: 0 });
  }
  return root.target as T;
}

function cloneTree(roots: readonly RenderNodeV1[] | readonly MutableNode[]): {
  readonly roots: MutableNode[];
  readonly index: TreeIndex;
} {
  const copiedRoots = new Array<MutableNode>(roots.length);
  const nodes = new Map<string, MutableNode>();
  const locations = new Map<string, NodeLocation>();
  const stack: Array<{
    raw: RenderNodeV1 | MutableNode;
    parentChildren: MutableNode[];
    index: number;
    parentKey: string | null;
  }> = [];
  for (let index = roots.length - 1; index >= 0; index -= 1) {
    stack.push({ raw: roots[index]!, parentChildren: copiedRoots, index, parentKey: null });
  }
  while (stack.length > 0) {
    const frame = stack.pop()!;
    const raw = frame.raw;
    if (typeof raw.key !== "string" || raw.key.length === 0) throw new TypeError("Invalid Render node key");
    if (nodes.has(raw.key)) throw new TypeError("Duplicate Render node key");
    const attrs = Object.create(null) as Record<string, string>;
    for (const key of Object.keys(raw.attrs)) attrs[key] = raw.attrs[key] as string;
    const data = cloneJson(raw.data) as Record<string, JsonValue>;
    const children = new Array<MutableNode>(raw.children.length);
    const node: MutableNode = { key: raw.key, tag: raw.tag, attrs, data, children };
    frame.parentChildren[frame.index] = node;
    nodes.set(node.key, node);
    locations.set(node.key, { parentKey: frame.parentKey, index: frame.index });
    for (let index = raw.children.length - 1; index >= 0; index -= 1) {
      stack.push({ raw: raw.children[index]!, parentChildren: children, index, parentKey: node.key });
    }
  }
  return { roots: copiedRoots, index: { nodes, locations } };
}

function indexTree(roots: readonly MutableNode[]): TreeIndex {
  const nodes = new Map<string, MutableNode>();
  const locations = new Map<string, NodeLocation>();
  const stack = roots.map((node, index) => ({ node, parentKey: null as string | null, index }));
  while (stack.length > 0) {
    const entry = stack.pop()!;
    if (nodes.has(entry.node.key)) throw new Error("Duplicate Render node key");
    nodes.set(entry.node.key, entry.node);
    locations.set(entry.node.key, { parentKey: entry.parentKey, index: entry.index });
    for (let index = entry.node.children.length - 1; index >= 0; index -= 1) {
      stack.push({ node: entry.node.children[index]!, parentKey: entry.node.key, index });
    }
  }
  return { nodes, locations };
}

function freezeTree(roots: readonly MutableNode[]): void {
  const stack: Array<{ node: MutableNode; visited: boolean }> = [];
  for (let index = roots.length - 1; index >= 0; index -= 1) {
    stack.push({ node: roots[index]!, visited: false });
  }
  while (stack.length > 0) {
    const entry = stack.pop()!;
    if (entry.visited) {
      Object.freeze(entry.node.attrs);
      Object.freeze(entry.node.children);
      Object.freeze(entry.node);
      continue;
    }
    stack.push({ node: entry.node, visited: true });
    for (let index = entry.node.children.length - 1; index >= 0; index -= 1) {
      stack.push({ node: entry.node.children[index]!, visited: false });
    }
  }
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
    const current = stack.pop()!;
    result.push(current.key);
    for (const child of current.children) stack.push(child);
  }
  return result;
}

function destination(
  roots: MutableNode[],
  parentKey: string | null,
  beforeKey: string | null,
): { readonly container: MutableNode[]; readonly index: number } {
  const container = parentKey === null
    ? roots
    : (() => {
      const parent = findContainer(roots, parentKey);
      return parent?.container[parent.index]?.children;
    })();
  if (container === undefined) throw new Error("Missing Patch destination parent");
  if (beforeKey === null) return { container, index: container.length };
  const before = findContainer(roots, beforeKey);
  if (before === null || before.container !== container) throw new Error("beforeKey is not a destination sibling");
  return { container, index: before.index };
}

function applyDelta<T extends string | JsonValue>(
  target: Record<string, T>,
  delta: { readonly set?: Readonly<Record<string, T>>; readonly remove?: readonly string[] },
): void {
  if (delta.set !== undefined) {
    for (const key of Object.keys(delta.set)) {
      target[key] = cloneJson(delta.set[key] as JsonValue) as T;
    }
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

  constructor(private readonly generation: number) {}

  beginCarrier(): void {
    this.currentCarrier = true;
    this.registrySeen = false;
    this.stalePresentationCache = false;
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
      if (message.ops.every((op) => op.op === "update")) {
        this.commitUpdateOnlyPatch(current, message);
        return accepted;
      }
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

  onEvent(
    message: RenderEventV1,
    onApplicable?: (message: RenderEventV1) => void,
  ): DataInboundDisposition {
    if (!this.currentCarrier) return accepted;
    const domain = this.domains.get(message.domainId);
    if (!this.registrySeen || domain === undefined || !domain.baselined) return accepted;
    if (!this.identities.get(message.domainId)?.liveTags.has(message.targetKey)) return accepted;
    onApplicable?.(message);
    return accepted;
  }

  isPresentationTargetCurrent(domainId: string, targetKey: string): boolean {
    if (!this.currentCarrier || !this.registrySeen) return false;
    if ([...this.domains.values()].some((domain) => !domain.baselined)) return false;
    const domain = this.domains.get(domainId);
    return domain !== undefined &&
      domain.baselined &&
      this.identities.get(domainId)?.liveTags.has(targetKey) === true;
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

  private commitUpdateOnlyPatch(current: DomainReplica, message: RenderPatchV1): void {
    if (message.ops.length === 0) {
      if (message.zIndex === undefined) throw new Error("empty");
      this.domains.set(current.domainId, {
        domainId: current.domainId,
        baselined: true,
        revision: message.revision,
        zIndex: message.zIndex,
        roots: current.roots,
      });
      return;
    }
    const created = new Set<object>();
    const builderByKey = new Map<string, MutableNode>();
    const cloneNodeShallow = (node: MutableNode): MutableNode => {
      const known = builderByKey.get(node.key);
      if (known !== undefined) return known;
      const clone: MutableNode = {
        key: node.key,
        tag: node.tag,
        attrs: node.attrs,
        data: node.data,
        children: node.children,
      };
      builderByKey.set(node.key, clone);
      created.add(clone);
      return clone;
    };
    const clonePathTo = (node: MutableNode, key: string): MutableNode | null => {
      if (node.key === key) return cloneNodeShallow(node);
      for (let index = 0; index < node.children.length; index += 1) {
        const child = node.children[index];
        if (child === undefined) continue;
        const found = clonePathTo(child, key);
        if (found === null) continue;
        const parent = cloneNodeShallow(node);
        if (!created.has(parent.children)) {
          parent.children = parent.children.slice();
          created.add(parent.children);
        }
        parent.children[index] = cloneNodeShallow(child);
        return found;
      }
      return null;
    };
    const touch = <T extends Record<string, string> | Record<string, JsonValue>>(container: T): T => {
      if (created.has(container)) return container;
      const copy = Object.create(null) as T;
      for (const key of Object.keys(container)) (copy as Record<string, string | JsonValue>)[key] = container[key] as string | JsonValue;
      created.add(copy);
      return copy;
    };
    let roots = current.roots;
    for (const op of message.ops) {
      if (op.op !== "update") throw new Error("Update-only Patch expected");
      let node = builderByKey.get(op.key);
      if (node === undefined) {
        let found: MutableNode | null = null;
        let rootIndex = -1;
        for (let index = 0; index < roots.length; index += 1) {
          const root = roots[index];
          if (root === undefined) continue;
          found = clonePathTo(root, op.key);
          if (found === null) continue;
          rootIndex = index;
          break;
        }
        if (found === null || rootIndex < 0) throw new Error("Updated Render node is missing");
        if (!created.has(roots)) {
          roots = roots.slice();
          created.add(roots);
        }
        roots[rootIndex] = cloneNodeShallow(roots[rootIndex] as MutableNode);
        node = found;
      }
      if (op.attrs !== undefined) {
        node.attrs = touch(node.attrs);
        applyDelta(node.attrs, op.attrs);
        if (Object.keys(node.attrs).length > MAX_ATTRS) throw new Error("Render attrs limit exceeded");
        for (const [key, value] of Object.entries(node.attrs)) {
          const keyBytes = byteLength(key);
          const valueBytes = byteLength(value);
          if (keyBytes < 1 || keyBytes > 128 || valueBytes > 4096) throw new Error("Render attrs string limit exceeded");
        }
      }
      if (op.data !== undefined) {
        node.data = touch(node.data);
        applyDelta(node.data, op.data);
        validateData(node.data);
      }
    }
    const freezeCreated = (value: object): void => {
      if (!created.has(value) || Object.isFrozen(value)) return;
      if (Array.isArray(value)) {
        for (const child of value) if (child !== null && typeof child === "object") freezeCreated(child);
      } else {
        for (const child of Object.values(value)) if (child !== null && typeof child === "object") freezeCreated(child as object);
      }
      Object.freeze(value);
    };
    freezeCreated(roots);
    this.domains.set(current.domainId, {
      domainId: current.domainId,
      baselined: true,
      revision: message.revision,
      zIndex: message.zIndex ?? current.zIndex,
      roots,
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
