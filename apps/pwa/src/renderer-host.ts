import type { MessageCarrier } from "@loomrealm/foundation";
import type { RendererDataBinding } from "@loomrealm/platform-ports";
import { createRendererControlHolder } from "@loomrealm/renderer";
import type { RendererResourceClient } from "@loomrealm/renderer/resource-client";
import {
  attachRendererPresentation,
  bootstrapWebPresentation,
  prepareWebPresentationV1,
  WebProjector,
} from "@loomrealm/renderer/web-presentation";
import { createMessagePortCarrier } from "./message-port-carrier.js";
import { createPwaInputSource } from "./input-source.js";
import { createPwaViewportSource } from "./viewport-source.js";

interface DataTuple { readonly subsystemKey: string; readonly generation: number; readonly dataProfile: string }
interface DataSlot { current: { readonly tuple: DataTuple; readonly carrier: MessageCarrier; delivered: boolean } | null; waiter: { readonly tuple: DataTuple; readonly signal: AbortSignal; resolve(carrier: MessageCarrier): void; reject(cause: unknown): void } | null }

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

  install(tuple: DataTuple, port: MessagePort): void {
    if (this.closed) throw new Error("Renderer Data closed");
    const slot = this.slot(tuple.subsystemKey);
    if (slot.current !== null && same(slot.current.tuple, tuple)) throw new Error("Duplicate Renderer Data install");
    if (slot.current !== null) void slot.current.carrier.close();
    const current = { tuple, carrier: createMessagePortCarrier(port), delivered: false };
    slot.current = current;
    const waiter = slot.waiter;
    if (waiter !== null && same(waiter.tuple, tuple) && !waiter.signal.aborted) { slot.waiter = null; current.delivered = true; waiter.resolve(current.carrier); }
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    for (const slot of this.slots.values()) { if (slot.current !== null) void slot.current.carrier.close(); slot.waiter?.reject(new Error("Renderer Data closed")); }
    this.slots.clear();
  }
}

export interface PwaRendererHost {
  readonly data: PwaRendererDataBinding;
  installControl(token: string, port: MessagePort): void;
  close(): void;
}

export async function createPwaRendererHost(installationId: string, presentation: unknown, signal: AbortSignal): Promise<PwaRendererHost> {
  if (!customElements.get("lr-demo-panel")) {
    customElements.define("lr-demo-panel", class extends HTMLElement {
      receiveRenderData(data: Readonly<Record<string, unknown>>): void {
        this.textContent = typeof data.title === "string" ? data.title : "";
      }
    });
  }
  const data = new PwaRendererDataBinding();
  const holder = createRendererControlHolder(data.binding, createPwaInputSource(window), createPwaViewportSource(window));
  const prepared = await prepareWebPresentationV1(presentation, async () => { throw new Error("Demo presentation has no bootstrap resources"); });
  await bootstrapWebPresentation(window, prepared, () => {});
  const resourceClient: RendererResourceClient = Object.freeze({
    async resource(namespace: string, key: string, expectedContentVersion: string, localSignal?: AbortSignal) {
      const path = key.split("/").map(encodeURIComponent).join("/");
      const response = await fetch(`/_lr/v1/games/${encodeURIComponent(installationId)}/resources/${encodeURIComponent(namespace)}/${path}`, { signal: localSignal ?? signal });
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
  return Object.freeze({
    data,
    installControl(token: string, port: MessagePort) {
      if (installed || signal.aborted) throw new Error("Renderer Control already installed");
      installed = true;
      const connected = holder.connect({ carrier: createMessagePortCarrier(port), rendererControlToken: token });
      void connected.then((outcome) => { document.documentElement.dataset.loomrealmRenderer = outcome.kind; });
    },
    close() {
      data.close(); detach(); projector.teardown();
    },
  });
}
