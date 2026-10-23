import type {
  DataInboundDisposition,
  RendererDataHandlers,
  RendererDataMessageV3,
  RendererDataPeer,
  RendererDataPeerOptions,
  SubsystemDataHandlers,
  SubsystemDataPeer,
  SubsystemDataPeerOptions,
  ViewportStateV1,
} from "./model.js";
import { DataRuntime, validateBinding } from "./runtime.js";
import { ViewportLatestSender } from "./viewport-sender.js";

const accepted = Object.freeze({ kind: "accepted" } as const);

function requireFunction(object: object, key: string): void {
  if (typeof (object as Record<string, unknown>)[key] !== "function") throw new TypeError(`Invalid handler ${key}`);
}
function validateSubsystemHandlers(handlers: SubsystemDataHandlers): void {
  if (handlers === null || typeof handlers !== "object") throw new TypeError("Invalid handlers");
  requireFunction(handlers, "onViewportState");
  if (handlers.onPresentationEvent !== undefined) requireFunction(handlers, "onPresentationEvent");
}
function validateRendererHandlers(handlers: RendererDataHandlers): void {
  if (handlers === null || typeof handlers !== "object") throw new TypeError("Invalid handlers");
  for (const key of ["onRenderDomains","onRenderSnapshot","onRenderPatch","onRenderEvent"]) requireFunction(handlers, key);
  if (handlers.onPresentationInterest !== undefined) requireFunction(handlers, "onPresentationInterest");
}

export function createSubsystemDataPeer(options: SubsystemDataPeerOptions): SubsystemDataPeer {
  if (options === null || typeof options !== "object") throw new TypeError("Invalid options");
  const binding = validateBinding(options.binding);
  validateSubsystemHandlers(options.handlers);
  const runtime = new DataRuntime(options.binding.carrier, "subsystem", async (message: RendererDataMessageV3): Promise<DataInboundDisposition> => {
    if (message.type === "viewport.state") return options.handlers.onViewportState(message);
    if (message.type === "presentation.event") return options.handlers.onPresentationEvent?.(message) ?? accepted;
    return accepted;
  });
  return Object.freeze({
    binding,
    render: Object.freeze({
      sendDomains: (message: import("./model.js").RenderDomainsV1) => runtime.send(message),
      sendSnapshot: (message: import("./model.js").RenderSnapshotV1) => runtime.send(message),
      sendPatch: (message: import("./model.js").RenderPatchV1) => runtime.send(message),
      sendEvent: (message: import("./model.js").RenderEventV1) => runtime.send(message),
    }),
    presentation: Object.freeze({
      sendInterest: (message: import("./model.js").PresentationInterestV1) => runtime.send(message),
    }),
    terminal: runtime.terminal,
    close: () => runtime.close(),
  });
}

export function createRendererDataPeer(options: RendererDataPeerOptions): RendererDataPeer {
  if (options === null || typeof options !== "object") throw new TypeError("Invalid options");
  const binding = validateBinding(options.binding);
  validateRendererHandlers(options.handlers);
  const runtime = new DataRuntime(options.binding.carrier, "renderer", async (message: RendererDataMessageV3): Promise<DataInboundDisposition> => {
    if (message.type === "render.domains") return options.handlers.onRenderDomains(message);
    if (message.type === "render.snapshot") return options.handlers.onRenderSnapshot(message);
    if (message.type === "render.patch") return options.handlers.onRenderPatch(message);
    if (message.type === "render.event") return options.handlers.onRenderEvent(message);
    if (message.type === "presentation.interest") return options.handlers.onPresentationInterest?.(message) ?? accepted;
    return accepted;
  });
  const viewport = new ViewportLatestSender(
    (message: ViewportStateV1) => runtime.send(message),
    () => runtime.peekTerminal(),
  );
  void runtime.terminal.then((terminal) => viewport.noteTerminal(terminal));
  return Object.freeze({
    binding,
    viewport: Object.freeze({
      sendState: (message: ViewportStateV1) => viewport.sendState(message),
    }),
    presentation: Object.freeze({
      sendEvent: (message: import("./model.js").PresentationEventV1) => runtime.send(message),
    }),
    terminal: runtime.terminal,
    close: () => runtime.close(),
  });
}
