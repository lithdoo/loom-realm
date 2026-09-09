import type { RenderNodeV1 } from "@loomrealm/data";
import {
  createPresentationResourceClient,
  type PresentationResourceClient,
} from "./presentation-resource-client.js";
import type { RendererResourceClient } from "./resource-client.js";
import type {
  PresentationDomainView,
  RendererPresentationEffect,
  RendererPresentationSource,
  RendererPresentationView,
} from "./presentation-seam.js";

export interface WebPresentationContext {
  readonly resources: PresentationResourceClient;
}

export interface WebProjectorOptions {
  readonly document: Document;
  readonly resourceClient: RendererResourceClient;
  readonly reportFailure?: (cause: unknown) => void;
}

interface DesiredNode {
  readonly identity: string;
  readonly sessionId: string;
  readonly subsystemKey: string;
  readonly generation: number;
  readonly domainId: string;
  readonly zIndex: number;
  readonly order: number;
  readonly node: RenderNodeV1;
  readonly parentIdentity: string | null;
  readonly childIdentities: readonly string[];
}

interface LiveElement {
  readonly identity: string;
  readonly sessionId: string;
  readonly subsystemKey: string;
  readonly generation: number;
  readonly domainId: string;
  zIndex: number;
  order: number;
  readonly tag: string;
  readonly element: HTMLElement;
  managedAttributes: Set<string>;
  deliveredData: unknown;
  dataAttempted: boolean;
}

const noData = Symbol("loomrealm.renderer.no-presentation-data");

function identity(sessionId: string, subsystemKey: string, generation: number, domainId: string, key: string): string {
  return JSON.stringify([sessionId, subsystemKey, generation, domainId, key]);
}

function lexical(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

export function structurallyEqualJson(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (left === null || right === null || typeof left !== "object" || typeof right !== "object") return false;
  const leftArray = Array.isArray(left);
  if (leftArray !== Array.isArray(right)) return false;
  if (leftArray) {
    const a = left as readonly unknown[];
    const b = right as readonly unknown[];
    return a.length === b.length && a.every((value, index) => structurallyEqualJson(value, b[index]));
  }
  const a = left as Readonly<Record<string, unknown>>;
  const b = right as Readonly<Record<string, unknown>>;
  const aKeys = Object.keys(a).sort();
  const bKeys = Object.keys(b).sort();
  return aKeys.length === bKeys.length &&
    aKeys.every((key, index) => key === bKeys[index] && structurallyEqualJson(a[key], b[key]));
}

function collectDomain(
  output: Map<string, DesiredNode>,
  sessionId: string,
  subsystemKey: string,
  generation: number,
  domain: PresentationDomainView,
): void {
  let order = 0;
  const visit = (node: RenderNodeV1, parentIdentity: string | null): string => {
    const ownIdentity = identity(sessionId, subsystemKey, generation, domain.domainId, node.key);
    const ownOrder = order++;
    const childIdentities = node.children.map((child) => visit(child, ownIdentity));
    output.set(ownIdentity, {
      identity: ownIdentity,
      sessionId,
      subsystemKey,
      generation,
      domainId: domain.domainId,
      zIndex: domain.zIndex,
      order: ownOrder,
      node,
      parentIdentity,
      childIdentities,
    });
    return ownIdentity;
  };
  for (const root of domain.roots) visit(root, null);
}

function authorityKey(sessionId: string, subsystemKey: string, generation: number): string {
  return JSON.stringify([sessionId, subsystemKey, generation]);
}

export class WebProjector implements RendererPresentationEffect {
  private readonly live = new Map<string, LiveElement>();
  private readonly context: WebPresentationContext;
  private failed = false;
  private ended = false;
  private readonly lifetime = new AbortController();

  constructor(private readonly options: WebProjectorOptions) {
    if (options.document === null || typeof options.document !== "object") throw new TypeError("Invalid Projector document");
    this.context = Object.freeze({
      resources: createPresentationResourceClient(options.resourceClient, this.lifetime.signal),
    });
  }

  reevaluate(source: RendererPresentationSource): void {
    if (this.failed || this.ended) return;
    const view = source.read();
    if (view === null) return;
    try {
      this.reconcile(view);
    } catch (cause) {
      this.options.reportFailure?.(cause);
    }
  }

  teardown(): void {
    if (this.ended) return;
    this.ended = true;
    this.lifetime.abort();
  }

  structuralFailed(): boolean {
    return this.failed;
  }

  private reconcile(view: RendererPresentationView): void {
    const desired = new Map<string, DesiredNode>();
    const authorities = new Set<string>();
    const eligible = new Set<string>();
    for (const subsystem of view.subsystems) {
      const key = authorityKey(view.sessionId, subsystem.subsystemKey, subsystem.generation);
      authorities.add(key);
      if (!subsystem.eligible) continue;
      eligible.add(key);
      for (const domain of subsystem.domains) {
        collectDomain(desired, view.sessionId, subsystem.subsystemKey, subsystem.generation, domain);
      }
    }

    const retained = new Set<string>();
    for (const record of this.live.values()) {
      const key = authorityKey(record.sessionId, record.subsystemKey, record.generation);
      if (authorities.has(key) && !eligible.has(key)) retained.add(record.identity);
    }

    for (const candidate of desired.values()) {
      const existing = this.live.get(candidate.identity);
      if (existing !== undefined && existing.tag !== candidate.node.tag) {
        return this.fail(new Error("Live Render node tag changed during projection"));
      }
      if (existing === undefined && this.options.document.defaultView?.customElements.get(candidate.node.tag) === undefined) {
        return this.fail(new Error(`Unregistered Custom Element: ${candidate.node.tag}`));
      }
    }

    const created = new Map<string, LiveElement>();
    for (const candidate of desired.values()) {
      if (this.live.has(candidate.identity)) continue;
      const element = this.options.document.createElement(candidate.node.tag);
      const record: LiveElement = {
        identity: candidate.identity,
        sessionId: candidate.sessionId,
        subsystemKey: candidate.subsystemKey,
        generation: candidate.generation,
        domainId: candidate.domainId,
        zIndex: candidate.zIndex,
        order: candidate.order,
        tag: candidate.node.tag,
        element,
        managedAttributes: new Set(),
        deliveredData: noData,
        dataAttempted: false,
      };
      created.set(candidate.identity, record);
      try {
        const receiver = element as HTMLElement & { receiveRenderContext?: (context: WebPresentationContext) => void };
        receiver.receiveRenderContext?.(this.context);
      } catch (cause) {
        this.options.reportFailure?.(cause);
      }
    }

    for (const [key, record] of this.live) {
      if (!desired.has(key) && !retained.has(key)) {
        record.element.remove();
        this.live.delete(key);
      }
    }
    for (const [key, record] of created) this.live.set(key, record);
    for (const candidate of desired.values()) {
      const record = this.live.get(candidate.identity) as LiveElement;
      record.zIndex = candidate.zIndex;
      record.order = candidate.order;
    }

    const roots = [...this.live.values()].filter((record) => {
      const candidate = desired.get(record.identity);
      return candidate?.parentIdentity === null || (retained.has(record.identity) && record.element.parentNode === this.options.document.body);
    }).sort((left, right) => lexical(left.subsystemKey, right.subsystemKey) || left.zIndex - right.zIndex ||
      lexical(left.domainId, right.domainId) || left.order - right.order);
    let before: ChildNode | null = null;
    for (let index = roots.length - 1; index >= 0; index -= 1) {
      const root = roots[index] as LiveElement;
      if (retained.has(root.identity)) {
        before = root.element;
        continue;
      }
      if (root.element.nextSibling !== before || root.element.parentNode !== this.options.document.body) {
        this.options.document.body.insertBefore(root.element, before);
      }
      before = root.element;
    }

    // Position roots first so a descendant-to-root reparent breaks its old ancestry
    // before another still-live element is moved beneath it.
    for (const candidate of desired.values()) {
      const container = this.live.get(candidate.identity)?.element;
      if (container === undefined) throw new Error("Missing projected container");
      let childBefore: ChildNode | null = null;
      for (let index = candidate.childIdentities.length - 1; index >= 0; index -= 1) {
        const child = this.live.get(candidate.childIdentities[index] as string)?.element;
        if (child === undefined) throw new Error("Missing projected child");
        if (child.nextSibling !== childBefore || child.parentNode !== container) container.insertBefore(child, childBefore);
        childBefore = child;
      }
    }

    for (const candidate of desired.values()) {
      const record = this.live.get(candidate.identity) as LiveElement;
      const nextNames = new Set(Object.keys(candidate.node.attrs));
      for (const name of record.managedAttributes) if (!nextNames.has(name)) record.element.removeAttribute(name);
      for (const [name, value] of Object.entries(candidate.node.attrs)) record.element.setAttribute(name, value);
      record.managedAttributes = nextNames;
      if (!record.dataAttempted || !structurallyEqualJson(record.deliveredData, candidate.node.data)) {
        record.dataAttempted = true;
        record.deliveredData = candidate.node.data;
        try {
          const receiver = record.element as HTMLElement & { receiveRenderData?: (data: Readonly<Record<string, unknown>>) => void };
          receiver.receiveRenderData?.(candidate.node.data);
        } catch (cause) {
          this.options.reportFailure?.(cause);
        }
      }
    }
  }

  private fail(cause: unknown): void {
    this.failed = true;
    this.options.reportFailure?.(cause);
  }
}
