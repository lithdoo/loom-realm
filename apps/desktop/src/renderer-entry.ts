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
import { createMessagePortCarrier } from "./message-port-carrier.js";
import { createDesktopRendererInputSource } from "./renderer-input-source.js";
import { createWindowRendererDataBinding } from "./window-data-binding.js";

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
    content !== null && typeof content === "object" && typeof content.origin === "string" &&
    typeof content.installationId === "string" && typeof content.token === "string";
}

function bootstrap(): Promise<{ envelope: DesktopRendererBootstrapEnvelope; control: MessagePort; data: MessagePort }> {
  return new Promise((resolve) => {
    const receive = (event: MessageEvent<unknown>) => {
      if (event.source !== window || event.origin !== window.location.origin || event.ports.length !== 2 ||
        event.data === null || typeof event.data !== "object") return;
      const data = event.data as Record<string, unknown>;
      if (data.channel !== DESKTOP_BOOTSTRAP_CHANNEL || !validEnvelope(data.envelope)) return;
      window.removeEventListener("message", receive);
      resolve({ envelope: data.envelope, control: event.ports[0]!, data: event.ports[1]! });
    };
    window.addEventListener("message", receive);
  });
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
  const { envelope, control, data } = await bootstrap();
  const objectUrls: string[] = [];
  const resourceClient = createRendererResourceClient(envelope.content, lifetime.signal);
  const dataBinding = createWindowRendererDataBinding(data, NativeWebSocket);
  const inputSource = createDesktopRendererInputSource(window);
  const holder = createRendererControlHolder(dataBinding, inputSource);
  const prepared = await prepareWebPresentationV1(
    envelope.presentation,
    (ref) => resolveBootstrapResource(envelope, ref, objectUrls),
  );
  const connected = holder.connect({
    carrier: createMessagePortCarrier(control),
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
  document.documentElement.dataset.loomrealmPresentation ??= "ready";
  lifetime.signal.addEventListener("abort", () => {
    for (const source of objectUrls) NativeURL.revokeObjectURL(source);
  }, { once: true });
})().catch(() => {
  document.documentElement.dataset.loomrealmRenderer = "failed";
  lifetime.abort();
});

window.addEventListener("pagehide", () => lifetime.abort(), { once: true });
