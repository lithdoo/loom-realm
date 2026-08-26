import type {
  DataInboundDisposition,
  RendererDataHandlers,
  RendererDataMessageV1,
  RendererDataPeer,
  RendererDataPeerOptions,
  SubsystemDataHandlers,
  SubsystemDataPeer,
  SubsystemDataPeerOptions,
} from "./model.js";
import { DataRuntime, validateBinding } from "./runtime.js";

const accepted = Object.freeze({ kind: "accepted" } as const);

function requireFunction(object: object, key: string): void {
  if (typeof (object as Record<string, unknown>)[key] !== "function") throw new TypeError(`Invalid handler ${key}`);
}
function validateSubsystemHandlers(handlers: SubsystemDataHandlers): void {
  if (handlers === null || typeof handlers !== "object") throw new TypeError("Invalid handlers");
  for (const key of ["onInputState","onInputEvent","onInputReset"]) requireFunction(handlers, key);
}
function validateRendererHandlers(handlers: RendererDataHandlers): void {
  if (handlers === null || typeof handlers !== "object") throw new TypeError("Invalid handlers");
  for (const key of ["onInputInterest","onRenderDomains","onRenderSnapshot","onRenderPatch","onRenderEvent"]) requireFunction(handlers, key);
}

export function createSubsystemDataPeer(options: SubsystemDataPeerOptions): SubsystemDataPeer {
  if (options === null || typeof options !== "object") throw new TypeError("Invalid options");
  const binding = validateBinding(options.binding);
  validateSubsystemHandlers(options.handlers);
  const runtime = new DataRuntime(options.binding.carrier, "subsystem", async (message: RendererDataMessageV1): Promise<DataInboundDisposition> => {
    if (message.type === "input.state") return options.handlers.onInputState(message);
    if (message.type === "input.event") return options.handlers.onInputEvent(message);
    if (message.type === "input.reset") return options.handlers.onInputReset(message);
    return accepted;
  });
  return Object.freeze({
    binding,
    input: Object.freeze({ sendInterest: (message: import("./model.js").InputInterestV1) => runtime.send(message) }),
    render: Object.freeze({
      sendDomains: (message: import("./model.js").RenderDomainsV1) => runtime.send(message),
      sendSnapshot: (message: import("./model.js").RenderSnapshotV1) => runtime.send(message),
      sendPatch: (message: import("./model.js").RenderPatchV1) => runtime.send(message),
      sendEvent: (message: import("./model.js").RenderEventV1) => runtime.send(message),
    }),
    terminal: runtime.terminal,
    close: () => runtime.close(),
  });
}

export function createRendererDataPeer(options: RendererDataPeerOptions): RendererDataPeer {
  if (options === null || typeof options !== "object") throw new TypeError("Invalid options");
  const binding = validateBinding(options.binding);
  validateRendererHandlers(options.handlers);
  const runtime = new DataRuntime(options.binding.carrier, "renderer", async (message: RendererDataMessageV1): Promise<DataInboundDisposition> => {
    if (message.type === "input.interest") return options.handlers.onInputInterest(message);
    if (message.type === "render.domains") return options.handlers.onRenderDomains(message);
    if (message.type === "render.snapshot") return options.handlers.onRenderSnapshot(message);
    if (message.type === "render.patch") return options.handlers.onRenderPatch(message);
    if (message.type === "render.event") return options.handlers.onRenderEvent(message);
    return accepted;
  });
  return Object.freeze({
    binding,
    input: Object.freeze({
      sendState: (message: import("./model.js").InputStateV1) => runtime.send(message),
      sendEvent: (message: import("./model.js").InputEventV1) => runtime.send(message),
      sendReset: (message: import("./model.js").InputResetV1) => runtime.send(message),
    }),
    terminal: runtime.terminal,
    close: () => runtime.close(),
  });
}
