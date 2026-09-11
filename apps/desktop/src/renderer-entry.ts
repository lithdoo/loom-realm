import { createRendererControlHolder } from "@loomrealm/renderer";
import { createRendererResourceClient } from "@loomrealm/renderer/resource-client";
import {
  attachRendererPresentation,
  bootstrapWebPresentation,
  prepareWebPresentationV1,
  WebProjector,
  type ResolvedBootstrapResource,
  type WebPresentationResourceRefV1,
} from "@loomrealm/renderer/web-presentation";
import { DESKTOP_BOOTSTRAP_CHANNEL, type DesktopRendererBootstrapEnvelope } from "./desktop-bootstrap.js";
import { connectBrowserControlCarrier } from "./browser-control-carrier.js";
import { createDesktopRendererInputSource } from "./renderer-input-source.js";
import { connectLoopbackRendererDataBinding } from "./window-data-binding.js";

const NativeURL = URL;
const trustedFetch = globalThis.fetch.bind(globalThis);
const NativeWebSocket = globalThis.WebSocket;
const lifetime = new AbortController();

function validEnvelope(value: unknown): value is DesktopRendererBootstrapEnvelope {
  if (value === null || typeof value !== "object") return false;
  const envelope = value as Record<string, unknown>;
  const content = envelope.content as Record<string, unknown> | null;
  return envelope.channel === DESKTOP_BOOTSTRAP_CHANNEL &&
    typeof envelope.rendererControlToken === "string" && envelope.rendererControlToken.length > 0 &&
    typeof envelope.rendererIdentity === "string" && envelope.rendererIdentity.length > 0 &&
    typeof envelope.controlEndpoint === "string" && envelope.controlEndpoint.startsWith("ws://127.0.0.1:") &&
    typeof envelope.dataSettlementEndpoint === "string" && envelope.dataSettlementEndpoint.startsWith("ws://127.0.0.1:") &&
    content !== null && typeof content === "object" && typeof content.origin === "string" &&
    typeof content.installationId === "string" && typeof content.token === "string";
}

function bootstrap(): DesktopRendererBootstrapEnvelope {
  const element = document.getElementById("__loomrealm_bootstrap");
  const source = element?.textContent ?? "";
  element?.remove();
  let value: unknown;
  try { value = JSON.parse(source); } catch { throw new Error("Invalid Desktop bootstrap JSON"); }
  if (!validEnvelope(value)) throw new Error("Invalid Desktop bootstrap envelope");
  return value;
}

async function resolveBootstrapResource(
  envelope: DesktopRendererBootstrapEnvelope,
  ref: WebPresentationResourceRefV1,
  objectUrls: string[],
): Promise<ResolvedBootstrapResource> {
  const parts = ref.key.split("/").map(encodeURIComponent).join("/");
  const base = new NativeURL(`_lr/v1/games/${encodeURIComponent(envelope.content.installationId)}/resources/`, envelope.content.origin);
  const response = await trustedFetch(new NativeURL(`${encodeURIComponent(`resource.${ref.namespace}`)}/${parts}`, base), {
    headers: { Authorization: `Bearer ${envelope.content.token}` },
    signal: lifetime.signal,
  });
  if (!response.ok) throw new Error("Presentation resource unavailable");
  const contentVersion = response.headers.get("x-loom-content-version");
  const mime = response.headers.get("content-type");
  if (!contentVersion || !mime) throw new Error("Presentation resource metadata unavailable");
  const source = NativeURL.createObjectURL(new Blob([await response.arrayBuffer()], { type: mime }));
  objectUrls.push(source);
  return Object.freeze({ contentVersion, mime, browserSource: source });
}

void (async () => {
  const envelope = bootstrap();
  const objectUrls: string[] = [];
  const resourceClient = createRendererResourceClient(envelope.content, lifetime.signal);
  const [controlCarrier, dataBinding] = await Promise.all([
    connectBrowserControlCarrier(envelope.controlEndpoint, lifetime.signal, NativeWebSocket),
    connectLoopbackRendererDataBinding(envelope.dataSettlementEndpoint, NativeWebSocket),
  ]);
  const inputSource = createDesktopRendererInputSource(window);
  const holder = createRendererControlHolder(dataBinding, inputSource);
  const prepared = await prepareWebPresentationV1(
    envelope.presentation,
    (ref) => resolveBootstrapResource(envelope, ref, objectUrls),
  );
  const connected = holder.connect({
    carrier: controlCarrier,
    rendererControlToken: envelope.rendererControlToken,
  });
  await bootstrapWebPresentation(window, prepared, () => {
    const projector = new WebProjector({
      document,
      resourceClient,
      reportFailure: () => { document.documentElement.dataset.loomrealmPresentation = "failed"; },
    });
    const detach = attachRendererPresentation(holder, projector);
    lifetime.signal.addEventListener("abort", () => { detach(); projector.teardown(); }, { once: true });
  });
  const outcome = await connected;
  document.documentElement.dataset.loomrealmRenderer = outcome.kind;
  document.documentElement.dataset.loomrealmRendererIdentity = envelope.rendererIdentity;
  document.documentElement.dataset.loomrealmPresentation ??= "ready";
  lifetime.signal.addEventListener("abort", () => {
    for (const source of objectUrls) NativeURL.revokeObjectURL(source);
  }, { once: true });
})().catch(() => {
  document.documentElement.dataset.loomrealmRenderer = "failed";
  lifetime.abort();
});

window.addEventListener("pagehide", () => lifetime.abort(), { once: true });
