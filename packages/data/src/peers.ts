import type {
  DataInboundDisposition,
  DataSendOutcome,
  RendererDataHandlers,
  RendererDataMessageV1,
  RendererDataPeer,
  RendererDataPeerOptions,
  SubsystemDataHandlers,
  SubsystemDataPeer,
  SubsystemDataPeerOptions,
  ViewportStateV1,
} from "./model.js";
import { DataRuntime, validateBinding } from "./runtime.js";
import { validateViewportState } from "./viewport-codec.js";

const accepted = Object.freeze({ kind: "accepted" } as const);

function requireFunction(object: object, key: string): void {
  if (typeof (object as Record<string, unknown>)[key] !== "function") throw new TypeError(`Invalid handler ${key}`);
}
function validateSubsystemHandlers(handlers: SubsystemDataHandlers): void {
  if (handlers === null || typeof handlers !== "object") throw new TypeError("Invalid handlers");
  for (const key of ["onInputState", "onInputEvent", "onInputReset", "onViewportState"]) {
    requireFunction(handlers, key);
  }
}
function validateRendererHandlers(handlers: RendererDataHandlers): void {
  if (handlers === null || typeof handlers !== "object") throw new TypeError("Invalid handlers");
  for (const key of ["onInputInterest", "onRenderDomains", "onRenderSnapshot", "onRenderPatch", "onRenderEvent"]) {
    requireFunction(handlers, key);
  }
}

function sameSize(
  left: { readonly width: number; readonly height: number },
  right: { readonly width: number; readonly height: number },
): boolean {
  return left.width === right.width && left.height === right.height;
}

/** Classify before any merge/dedupe. Never throws; copies numeric size on success. */
function tryAdmitViewport(
  message: unknown,
): { ok: true; width: number; height: number } | { ok: false } {
  try {
    if (message === null || typeof message !== "object") return { ok: false };
    const keys = Reflect.ownKeys(message);
    if (keys.length !== 3 || !keys.includes("type") || !keys.includes("width") || !keys.includes("height")) {
      return { ok: false };
    }
    for (const key of ["type", "width", "height"] as const) {
      const descriptor = Object.getOwnPropertyDescriptor(message, key);
      if (descriptor === undefined || descriptor.get !== undefined || descriptor.set !== undefined) {
        return { ok: false };
      }
    }
    const validated = validateViewportState(message);
    return { ok: true, width: validated.width, height: validated.height };
  } catch {
    return { ok: false };
  }
}

class ViewportPublisher {
  private active = true;
  private lastSent: { width: number; height: number } | null = null;
  private inFlight: { width: number; height: number } | null = null;
  private pending: { width: number; height: number } | null = null;

  constructor(
    private readonly send: (message: ViewportStateV1) => Promise<DataSendOutcome>,
  ) {}

  publishState(message: ViewportStateV1): void {
    if (!this.active) return;
    const admitted = tryAdmitViewport(message);
    if (!admitted.ok) {
      void this.send(message).catch(() => undefined);
      return;
    }
    this.offer({ width: admitted.width, height: admitted.height });
  }

  retire(): void {
    this.active = false;
    this.inFlight = null;
    this.pending = null;
  }

  private offer(V: { width: number; height: number }): void {
    if (!this.active) return;
    if (this.inFlight === null) {
      if (this.lastSent !== null && sameSize(this.lastSent, V)) {
        this.pending = null;
        return;
      }
      this.pending = null;
      this.inFlight = V;
      void this.admit(V);
      return;
    }
    this.pending = sameSize(this.inFlight, V) ? null : V;
  }

  private async admit(V: { width: number; height: number }): Promise<void> {
    let outcome: DataSendOutcome;
    try {
      outcome = await this.send({
        type: "viewport.state",
        width: V.width,
        height: V.height,
      });
    } catch {
      if (!this.active) return;
      this.active = false;
      this.inFlight = null;
      this.pending = null;
      return;
    }
    if (!this.active) return;
    if (this.inFlight === null || !sameSize(this.inFlight, V)) return;
    if (outcome.kind === "terminal") {
      this.active = false;
      this.inFlight = null;
      this.pending = null;
      return;
    }
    this.lastSent = V;
    this.inFlight = null;
    const pending = this.pending;
    this.pending = null;
    if (pending !== null && !sameSize(pending, this.lastSent)) {
      this.inFlight = pending;
      void this.admit(pending);
    }
  }
}

export function createSubsystemDataPeer(options: SubsystemDataPeerOptions): SubsystemDataPeer {
  if (options === null || typeof options !== "object") throw new TypeError("Invalid options");
  const binding = validateBinding(options.binding);
  validateSubsystemHandlers(options.handlers);
  const runtime = new DataRuntime(options.binding.carrier, "subsystem", async (message: RendererDataMessageV1): Promise<DataInboundDisposition> => {
    if (message.type === "input.state") return options.handlers.onInputState(message);
    if (message.type === "input.event") return options.handlers.onInputEvent(message);
    if (message.type === "input.reset") return options.handlers.onInputReset(message);
    if (message.type === "viewport.state") return options.handlers.onViewportState(message);
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
  const publisher = new ViewportPublisher((message) => runtime.send(message));
  void runtime.terminal.then(() => publisher.retire());
  return Object.freeze({
    binding,
    input: Object.freeze({
      sendState: (message: import("./model.js").InputStateV1) => runtime.send(message),
      sendEvent: (message: import("./model.js").InputEventV1) => runtime.send(message),
      sendReset: (message: import("./model.js").InputResetV1) => runtime.send(message),
    }),
    viewport: Object.freeze({
      publishState: (message: ViewportStateV1) => publisher.publishState(message),
    }),
    terminal: runtime.terminal,
    close: () => runtime.close(),
  });
}
