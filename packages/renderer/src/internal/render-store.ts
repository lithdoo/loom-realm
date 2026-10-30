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

class ProtocolViolation extends Error {}

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

function violation(message: string): never {
  throw new ProtocolViolation(message);
}

function cloneJson<T extends JsonValue>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  const root: Record<string, JsonValue> | JsonValue[] = Array.isArray(value)
    ? new Array<JsonValue>(value.length)
    : Object.create(null) as Record<string, JsonValue>;
  const frames: Array<{
    readonly source: readonly JsonValue[] | JsonObject;
    readonly target: Record<string, JsonValue> | JsonValue[];
    readonly keys: readonly (string | number)[];
    next: number;
  }> = [{
    source: value as readonly JsonValue[] | JsonObject,
    target: root,
    keys: Array.isArray(value) ? value.map((_, index) => index) : Object.keys(value),
    next: 0,
  }];
  while (frames.length > 0) {
    const frame = frames[frames.length - 1]!;
    if (frame.next >= frame.keys.length) {
      Object.freeze(frame.target);
      frames.pop();
      continue;
    }
    const key = frame.keys[frame.next++]!;
    const child = frame.source[key as never] as JsonValue;
    if (child === null || typeof child !== "object") {
      (frame.target as Record<string | number, JsonValue>)[key] = child;
      continue;
    }
    const target: Record<string, JsonValue> | JsonValue[] = Array.isArray(child)
      ? new Array<JsonValue>(child.length)
      : Object.create(null) as Record<string, JsonValue>;
    (frame.target as Record<string | number, JsonValue>)[key] = target as JsonValue;
    frames.push({
      source: child,
      target,
      keys: Array.isArray(child) ? child.map((_, index) => index) : Object.keys(child),
      next: 0,
    });
  }
  return root as T;
}

function cloneTree(roots: readonly RenderNodeV1[] | readonly MutableNode[]): {
  readonly roots: MutableNode[];
  readonly index: TreeIndex;
} {
  const copiedRoots = new Array<MutableNode>(roots.length);
  const nodes = new Map<string, MutableNode>();
  const locations = new Map<string, NodeLocation>();
  const stack: Array<{
    readonly raw: RenderNodeV1 | MutableNode;
    readonly parentChildren: MutableNode[];
    readonly index: number;
    readonly parentKey: string | null;
  }> = [];
  for (let index = roots.length - 1; index >= 0; index -= 1) {
    stack.push({ raw: roots[index]!, parentChildren: copiedRoots, index, parentKey: null });
  }
  while (stack.length > 0) {
    const frame = stack.pop()!;
    if (nodes.has(frame.raw.key)) violation("Duplicate Render node key");
    const attrs = Object.create(null) as Record<string, string>;
    for (const key of Object.keys(frame.raw.attrs)) attrs[key] = frame.raw.attrs[key] as string;
    const clonedData = cloneJson(frame.raw.data) as Record<string, JsonValue>;
    const data = Object.create(null) as Record<string, JsonValue>;
    for (const key of Object.keys(clonedData)) data[key] = clonedData[key]!;
    const children = new Array<MutableNode>(frame.raw.children.length);
    const node: MutableNode = {
      key: frame.raw.key,
      tag: frame.raw.tag,
      attrs,
      data,
      children,
    };
    frame.parentChildren[frame.index] = node;
    nodes.set(node.key, node);
    locations.set(node.key, { parentKey: frame.parentKey, index: frame.index });
    for (let index = frame.raw.children.length - 1; index >= 0; index -= 1) {
      stack.push({ raw: frame.raw.children[index]!, parentChildren: children, index, parentKey: node.key });
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
    if (nodes.has(entry.node.key)) violation("Duplicate Render node key or cyclic tree");
    nodes.set(entry.node.key, entry.node);
    locations.set(entry.node.key, { parentKey: entry.parentKey, index: entry.index });
    for (let index = entry.node.children.length - 1; index >= 0; index -= 1) {
      stack.push({ node: entry.node.children[index]!, parentKey: entry.node.key, index });
    }
  }
  return { nodes, locations };
}

function freezeTree(roots: readonly MutableNode[]): void {
  const stack: Array<{ readonly node: MutableNode; readonly visited: boolean }> = [];
  for (let index = roots.length - 1; index >= 0; index -= 1) {
    stack.push({ node: roots[index]!, visited: false });
  }
  while (stack.length > 0) {
    const entry = stack.pop()!;
    if (entry.visited) {
      Object.freeze(entry.node.attrs);
      Object.freeze(entry.node.data);
      Object.freeze(entry.node.children);
      Object.freeze(entry.node);
      continue;
    }
    stack.push({ node: entry.node, visited: true });
    for (let index = entry.node.children.length - 1; index >= 0; index -= 1) {
      stack.push({ node: entry.node.children[index]!, visited: false });
    }
  }
  Object.freeze(roots);
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

function containerFor(
  roots: MutableNode[],
  nodes: ReadonlyMap<string, MutableNode>,
  parentKey: string | null,
): MutableNode[] {
  if (parentKey === null) return roots;
  const parent = nodes.get(parentKey);
  if (parent === undefined) violation("Missing Patch destination parent");
  return parent.children;
}

function destination(
  roots: MutableNode[],
  index: TreeIndex,
  parentKey: string | null,
  beforeKey: string | null,
): { readonly container: MutableNode[]; readonly index: number } {
  const container = containerFor(roots, index.nodes, parentKey);
  if (beforeKey === null) return { container, index: container.length };
  const before = index.locations.get(beforeKey);
  if (before === undefined || before.parentKey !== parentKey) violation("beforeKey is not a destination sibling");
  return { container, index: before.index };
}

function reindexContainer(
  index: TreeIndex,
  container: readonly MutableNode[],
  parentKey: string | null,
  start = 0,
): void {
  for (let position = start; position < container.length; position += 1) {
    index.locations.set(container[position]!.key, { parentKey, index: position });
  }
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
      if (!Object.prototype.hasOwnProperty.call(target, key)) violation("Delta removes missing member");
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
        roots: old?.roots ?? [],
        nodes: old?.nodes ?? new Map(),
        locations: old?.locations ?? new Map(),
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
          violation("Retired Render Domain cannot reappear");
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
            roots: current?.roots ?? [],
            nodes: current?.nodes ?? new Map(),
            locations: current?.locations ?? new Map(),
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
      if (cause instanceof ProtocolViolation) return fatal(cause.message);
      throw cause;
    }
  }

  onSnapshot(message: RenderSnapshotV1): DataInboundDisposition {
    if (!this.currentCarrier) return accepted;
    const current = this.domains.get(message.domainId);
    if (!this.registrySeen || current === undefined) return fatal("Snapshot Domain is not current");
    try {
      if (current.baselined && message.revision !== (current.revision as number) + 1) {
        violation("Snapshot revision continuity failure");
      }
      const cloned = cloneTree(message.roots);
      const roots = cloned.roots;
      const index = cloned.index;
      const identity = this.identities.get(message.domainId);
      if (identity === undefined) violation("Missing Domain identity state");
      const nextTags = new Map<string, string>();
      for (const [key, node] of index.nodes) {
        if (identity.consumedKeys.has(key)) violation("Consumed Render node key reintroduced");
        const priorTag = identity.liveTags.get(key);
        if (priorTag !== undefined && priorTag !== node.tag) violation("Live Render node tag changed");
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
        nodes: index.nodes,
        locations: index.locations,
      };
      freezeTree(roots);
      this.identities.set(message.domainId, { liveTags: nextTags, consumedKeys: consumed });
      this.domains.set(message.domainId, committed);
      return accepted;
    } catch (cause) {
      if (cause instanceof ProtocolViolation) return fatal(cause.message);
      throw cause;
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
      const cloned = cloneTree(current.roots);
      const roots = cloned.roots;
      const candidateIndex = cloned.index;
      const sourceIdentity = this.identities.get(message.domainId);
      if (sourceIdentity === undefined) violation("Missing Domain identity state");
      const liveTags = new Map(sourceIdentity.liveTags);
      const consumedKeys = new Set(sourceIdentity.consumedKeys);
      for (const op of message.ops) this.applyOperation(roots, candidateIndex, liveTags, consumedKeys, op);
      const finalIndex = indexTree(roots);
      const committed: DomainReplica = {
        domainId: current.domainId,
        baselined: true,
        revision: message.revision,
        zIndex: message.zIndex ?? current.zIndex,
        roots,
        nodes: finalIndex.nodes,
        locations: finalIndex.locations,
      };
      freezeTree(roots);
      this.identities.set(message.domainId, { liveTags, consumedKeys });
      this.domains.set(message.domainId, committed);
      return accepted;
    } catch (cause) {
      if (cause instanceof ProtocolViolation) return fatal(cause.message);
      throw cause;
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
      if (message.zIndex === undefined) violation("empty Patch");
      this.domains.set(current.domainId, {
        domainId: current.domainId,
        baselined: true,
        revision: message.revision,
        zIndex: message.zIndex,
        roots: current.roots,
        nodes: current.nodes,
        locations: current.locations,
      });
      return;
    }
    const clones = new Map<string, MutableNode>();
    const copiedChildren = new Set<string>();
    const copiedAttrs = new Set<string>();
    const copiedData = new Set<string>();
    let roots = current.roots;
    let rootsCopied = false;

    const ensurePath = (targetKey: string): MutableNode => {
      const path: string[] = [];
      let cursor: string | null = targetKey;
      while (cursor !== null) {
        path.push(cursor);
        const location = current.locations.get(cursor);
        if (location === undefined) violation("Updated Render node is missing");
        cursor = location.parentKey;
      }
      for (let index = path.length - 1; index >= 0; index -= 1) {
        const key = path[index]!;
        if (clones.has(key)) continue;
        const original = current.nodes.get(key);
        const location = current.locations.get(key);
        if (original === undefined || location === undefined) violation("Updated Render node is missing");
        const clone: MutableNode = {
          key: original.key,
          tag: original.tag,
          attrs: original.attrs,
          data: original.data,
          children: original.children,
        };
        clones.set(key, clone);
        if (location.parentKey === null) {
          if (!rootsCopied) {
            roots = roots.slice();
            rootsCopied = true;
          }
          roots[location.index] = clone;
        } else {
          const parent = clones.get(location.parentKey);
          if (parent === undefined) throw new Error("Render parent path index is inconsistent");
          if (!copiedChildren.has(location.parentKey)) {
            parent.children = parent.children.slice();
            copiedChildren.add(location.parentKey);
          }
          parent.children[location.index] = clone;
        }
      }
      const node = clones.get(targetKey);
      if (node === undefined) violation("Updated Render node is missing");
      return node;
    };
    const copyContainer = <T extends Record<string, string> | Record<string, JsonValue>>(container: T): T => {
      const copy = Object.create(null) as T;
      for (const key of Object.keys(container)) (copy as Record<string, string | JsonValue>)[key] = container[key] as string | JsonValue;
      return copy;
    };
    for (const op of message.ops) {
      if (op.op !== "update") violation("Update-only Patch expected");
      const node = ensurePath(op.key);
      if (op.attrs !== undefined) {
        if (!copiedAttrs.has(node.key)) {
          node.attrs = copyContainer(node.attrs);
          copiedAttrs.add(node.key);
        }
        applyDelta(node.attrs, op.attrs);
      }
      if (op.data !== undefined) {
        if (!copiedData.has(node.key)) {
          node.data = copyContainer(node.data);
          copiedData.add(node.key);
        }
        applyDelta(node.data, op.data);
      }
    }
    for (const [key, node] of clones) {
      if (copiedAttrs.has(key)) Object.freeze(node.attrs);
      if (copiedData.has(key)) Object.freeze(node.data);
      if (copiedChildren.has(key)) Object.freeze(node.children);
      Object.freeze(node);
    }
    if (rootsCopied) Object.freeze(roots);
    for (const [key, node] of clones) current.nodes.set(key, node);
    this.domains.set(current.domainId, {
      domainId: current.domainId,
      baselined: true,
      revision: message.revision,
      zIndex: message.zIndex ?? current.zIndex,
      roots,
      nodes: current.nodes,
      locations: current.locations,
    });
  }

  private applyOperation(
    roots: MutableNode[],
    index: TreeIndex,
    liveTags: Map<string, string>,
    consumedKeys: Set<string>,
    op: RenderPatchOpV1,
  ): void {
    if (op.op === "insert") {
      const inserted = cloneTree([op.node]);
      const node = inserted.roots[0]!;
      for (const [key] of inserted.index.nodes) {
        if (liveTags.has(key) || consumedKeys.has(key)) violation("Inserted Render node key was already used");
      }
      const target = destination(roots, index, op.parentKey, op.beforeKey);
      target.container.splice(target.index, 0, node);
      for (const [key, insertedNode] of inserted.index.nodes) {
        index.nodes.set(key, insertedNode);
        const location = inserted.index.locations.get(key)!;
        index.locations.set(key, key === node.key
          ? { parentKey: op.parentKey, index: target.index }
          : location);
        liveTags.set(key, insertedNode.tag);
      }
      reindexContainer(index, target.container, op.parentKey, target.index);
      return;
    }
    if (op.op === "remove") {
      const location = index.locations.get(op.key);
      if (location === undefined) violation("Removed Render node is missing");
      const container = containerFor(roots, index.nodes, location.parentKey);
      const removed = container[location.index];
      if (removed === undefined || removed.key !== op.key) throw new Error("Render location index is inconsistent");
      container.splice(location.index, 1);
      for (const key of collectKeys(removed)) {
        liveTags.delete(key);
        consumedKeys.add(key);
        index.nodes.delete(key);
        index.locations.delete(key);
      }
      reindexContainer(index, container, location.parentKey, location.index);
      return;
    }
    if (op.op === "move") {
      if (op.beforeKey === op.key || op.parentKey === op.key) violation("Render node cannot move relative to itself");
      const location = index.locations.get(op.key);
      if (location === undefined) violation("Moved Render node is missing");
      const source = containerFor(roots, index.nodes, location.parentKey);
      const node = source[location.index];
      if (node === undefined || node.key !== op.key) throw new Error("Render location index is inconsistent");
      const subtree = new Set(collectKeys(node));
      if (op.parentKey !== null && subtree.has(op.parentKey)) violation("Render node cannot move under descendant");
      if (op.beforeKey !== null && subtree.has(op.beforeKey)) violation("Render node cannot move before its own subtree");
      source.splice(location.index, 1);
      reindexContainer(index, source, location.parentKey, location.index);
      const target = destination(roots, index, op.parentKey, op.beforeKey);
      target.container.splice(target.index, 0, node);
      reindexContainer(index, target.container, op.parentKey, target.index);
      return;
    }
    const node = index.nodes.get(op.key);
    if (node === undefined) violation("Updated Render node is missing");
    if (op.attrs !== undefined) applyDelta(node.attrs, op.attrs);
    if (op.data !== undefined) applyDelta(node.data, op.data);
  }
}
