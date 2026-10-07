import type { MessageCarrier } from "@loomrealm/foundation";
import type { RendererDataBinding } from "@loomrealm/platform-ports";
import { createRendererControlHolder } from "@loomrealm/renderer";
import type { RendererResourceClient } from "@loomrealm/renderer/resource-client";
import {
  attachRendererPresentation,
  bootstrapWebPresentation,
  prepareWebPresentationV1,
  WebProjector,
  type PreparedBootstrapResource,
  type ResolvedBootstrapResource,
  type WebPresentationResourceRefV1,
} from "@loomrealm/renderer/web-presentation";
import {
  createBrowserRendererInputSource,
  createBrowserRendererViewportSource,
} from "@loomrealm/renderer/browser-window";
import { createMessagePortCarrier } from "./message-port-carrier.js";

// Bootstrap scripts/styles are document capabilities, not Session
// capabilities. Keep their verified blob URLs and evaluation facts across a
// BFCache-restored fresh Session so a script cannot be evaluated twice in the
// same Window (custom-element registration is intentionally one-shot).
const bootstrapResourceCache = new Map<string, ResolvedBootstrapResource>();
const loadedBootstrapResources = new Set<string>();
let documentBootstrapFailure: unknown | null = null;

function bootstrapCacheKey(installationId: string, ref: WebPresentationResourceRefV1): string {
  return JSON.stringify([installationId, ref.namespace, ref.key]);
}

function preparedBootstrapKey(installationId: string, kind: "script" | "style", resource: PreparedBootstrapResource): string {
  return JSON.stringify([installationId, kind, resource.namespace, resource.key, resource.contentVersion]);
}

function observeCarrierClose(carrier: MessageCarrier): void {
  void carrier.close().catch((cause) => console.error("PWA Renderer Data carrier close failed", cause));
}

interface DataTuple { readonly subsystemKey: string; readonly generation: number; readonly dataProfile: string }
interface DataSlot { current: { readonly tuple: DataTuple; readonly connectionId: string; readonly carrier: MessageCarrier; delivered: boolean } | null; waiter: { readonly tuple: DataTuple; readonly signal: AbortSignal; resolve(carrier: MessageCarrier): void; reject(cause: unknown): void } | null }

function same(left: DataTuple, right: DataTuple): boolean {
  return left.subsystemKey === right.subsystemKey && left.generation === right.generation && left.dataProfile === right.dataProfile;
}

export class PwaRendererDataBinding {
  readonly binding: RendererDataBinding;
  private readonly slots = new Map<string, DataSlot>();
  private closed = false;

  constructor() {
    this.binding = Object.freeze({ acquire: (subsystemKey: string, generation: number, dataProfile: string, signal: AbortSignal) => this.acquire({ subsystemKey, generation, dataProfile }, signal) });
  }

  private slot(key: string): DataSlot {
    let value = this.slots.get(key);
    if (value === undefined) { value = { current: null, waiter: null }; this.slots.set(key, value); }
    return value;
  }

  private acquire(tuple: DataTuple, signal: AbortSignal): Promise<MessageCarrier> {
    if (this.closed || signal.aborted) return Promise.reject(signal.reason ?? new Error("Renderer Data closed"));
    const slot = this.slot(tuple.subsystemKey);
    if (slot.current !== null && !slot.current.delivered && same(slot.current.tuple, tuple)) { slot.current.delivered = true; return Promise.resolve(slot.current.carrier); }
    if (slot.waiter !== null) return Promise.reject(new Error("Renderer Data acquire already pending"));
    return new Promise((resolve, reject) => {
      const waiter = { tuple, signal, resolve, reject };
      slot.waiter = waiter;
      signal.addEventListener("abort", () => { if (slot.waiter === waiter) { slot.waiter = null; reject(signal.reason); } }, { once: true });
    });
  }

  install(tuple: DataTuple, connectionId: string, port: MessagePort): void {
    if (this.closed) throw new Error("Renderer Data closed");
    if (typeof connectionId !== "string" || connectionId.length === 0) throw new TypeError("Invalid Renderer Data connection identity");
    const slot = this.slot(tuple.subsystemKey);
    if (slot.current !== null) throw new Error("Renderer Data must be revoked before replacement");
    const current = { tuple, connectionId, carrier: createMessagePortCarrier(port), delivered: false };
    slot.current = current;
    const waiter = slot.waiter;
    if (waiter !== null && same(waiter.tuple, tuple) && !waiter.signal.aborted) { slot.waiter = null; current.delivered = true; waiter.resolve(current.carrier); }
  }

  revoke(tuple: DataTuple, connectionId: string): void {
    if (this.closed) return;
    const slot = this.slots.get(tuple.subsystemKey);
    const current = slot?.current;
    if (current === null || current === undefined || !same(current.tuple, tuple) || current.connectionId !== connectionId) return;
    slot!.current = null;
    observeCarrierClose(current.carrier);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    for (const slot of this.slots.values()) { if (slot.current !== null) observeCarrierClose(slot.current.carrier); slot.waiter?.reject(new Error("Renderer Data closed")); }
    this.slots.clear();
  }
}

export interface PwaRendererHost {
  readonly data: PwaRendererDataBinding;
  installControl(token: string, port: MessagePort): void;
  close(): void;
}

export async function createPwaRendererHost(installationId: string, presentation: unknown, signal: AbortSignal): Promise<PwaRendererHost> {
  if (documentBootstrapFailure !== null) {
    throw new Error("PWA presentation bootstrap previously failed in this document", { cause: documentBootstrapFailure });
  }
  if (!customElements.get("lr-demo-panel")) {
    customElements.define("lr-demo-panel", class extends HTMLElement {
      receiveRenderData(data: Readonly<Record<string, unknown>>): void {
        this.textContent = typeof data.title === "string" ? data.title : "";
      }
    });
  }
  const data = new PwaRendererDataBinding();
  const holder = createRendererControlHolder(
    data.binding,
    createBrowserRendererInputSource(window),
    createBrowserRendererViewportSource(window),
  );
  const createdBootstrapResources = new Set<string>();
  let bootstrapBegan = false;
  const resolveBootstrapResource = async (ref: WebPresentationResourceRefV1): Promise<ResolvedBootstrapResource> => {
    const cacheKey = bootstrapCacheKey(installationId, ref);
    const cached = bootstrapResourceCache.get(cacheKey);
    if (cached !== undefined) return cached;
    const path = ref.key.split("/").map(encodeURIComponent).join("/");
    const response = await fetch(`/_lr/v1/games/${encodeURIComponent(installationId)}/resources/${encodeURIComponent(`resource.${ref.namespace}`)}/${path}`, { signal });
    if (!response.ok) throw new Error("PWA presentation bootstrap resource unavailable");
    const contentVersion = response.headers.get("x-loom-content-version");
    const mime = response.headers.get("content-type");
    if (contentVersion === null || mime === null) throw new Error("PWA presentation bootstrap metadata unavailable");
    const browserSource = URL.createObjectURL(new Blob([await response.arrayBuffer()], { type: mime }));
    const resolved = Object.freeze({ contentVersion, mime, browserSource });
    bootstrapResourceCache.set(cacheKey, resolved);
    createdBootstrapResources.add(cacheKey);
    return resolved;
  };
  try {
    const prepared = await prepareWebPresentationV1(presentation, resolveBootstrapResource);
    const styles = Object.freeze(prepared.styles.filter((resource) => !loadedBootstrapResources.has(preparedBootstrapKey(installationId, "style", resource))));
    const scripts = Object.freeze(prepared.scripts.filter((resource) => !loadedBootstrapResources.has(preparedBootstrapKey(installationId, "script", resource))));
    const previousHeadChildren = new Set(document.head.children);
    try {
      bootstrapBegan = true;
      await bootstrapWebPresentation(window, Object.freeze({ styles, scripts }), () => {});
    } catch (cause) {
      for (const child of [...document.head.children]) if (!previousHeadChildren.has(child)) child.remove();
      throw cause;
    }
    for (const resource of styles) loadedBootstrapResources.add(preparedBootstrapKey(installationId, "style", resource));
    for (const resource of scripts) loadedBootstrapResources.add(preparedBootstrapKey(installationId, "script", resource));
    // The browser has loaded/evaluated these document capabilities. Their
    // blob bytes need not stay addressable for the lifetime of later Sessions.
    for (const cacheKey of createdBootstrapResources) {
      const resource = bootstrapResourceCache.get(cacheKey);
      if (resource !== undefined) URL.revokeObjectURL(resource.browserSource);
    }
  } catch (cause) {
    if (bootstrapBegan) documentBootstrapFailure = cause;
    data.close();
    for (const cacheKey of createdBootstrapResources) {
      const resource = bootstrapResourceCache.get(cacheKey);
      if (resource !== undefined) URL.revokeObjectURL(resource.browserSource);
      bootstrapResourceCache.delete(cacheKey);
    }
    throw cause;
  }
  const resourceClient: RendererResourceClient = Object.freeze({
    async resource(namespace: string, key: string, expectedContentVersion: string, localSignal?: AbortSignal) {
      const path = key.split("/").map(encodeURIComponent).join("/");
      const fetchSignal = localSignal === undefined ? signal : AbortSignal.any([signal, localSignal]);
      const response = await fetch(`/_lr/v1/games/${encodeURIComponent(installationId)}/resources/${encodeURIComponent(namespace)}/${path}`, { signal: fetchSignal });
      if (!response.ok) throw new Error("PWA presentation resource unavailable");
      const contentVersion = response.headers.get("x-loom-content-version");
      const mime = response.headers.get("content-type");
      if (contentVersion !== expectedContentVersion || mime === null) throw new Error("PWA presentation resource mismatch");
      return Object.freeze({ bytes: new Uint8Array(await response.arrayBuffer()), mime, contentVersion });
    },
  });
  const projector = new WebProjector({ document, resourceClient, reportFailure: (cause) => { console.error("LoomRealm presentation failed", cause); document.documentElement.dataset.loomrealmPresentation = "failed"; document.documentElement.dataset.loomrealmPresentationError = cause instanceof Error ? cause.message : String(cause); } });
  const detach = attachRendererPresentation(holder, projector);
  document.documentElement.dataset.loomrealmPresentation = "ready";
  let installed = false;
  let closed = false;
  return Object.freeze({
    data,
    installControl(token: string, port: MessagePort) {
      if (installed || signal.aborted) throw new Error("Renderer Control already installed");
      installed = true;
      const connected = holder.connect({ carrier: createMessagePortCarrier(port), rendererControlToken: token });
      void connected.then(
        (outcome) => { document.documentElement.dataset.loomrealmRenderer = outcome.kind; },
        (cause) => { console.error("PWA Renderer Control failed", cause); document.documentElement.dataset.loomrealmRenderer = "failed"; },
      );
    },
    close() {
      if (closed) return;
      closed = true;
      data.close(); detach(); projector.teardown();
    },
  });
}
