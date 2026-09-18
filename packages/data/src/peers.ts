import type {
  DataInboundDisposition,
  DataSendOutcome,
  RendererDataHandlers,
  RendererDataMessageV1,
  RendererDataPeer,
  RendererDataPeerOptions,
  RendererViewportDataPeer,
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
  for (const key of ["onInputState","onInputEvent","onInputReset","onViewportState"]) requireFunction(handlers, key);
}
function validateRendererHandlers(handlers: RendererDataHandlers): void {
  if (handlers === null || typeof handlers !== "object") throw new TypeError("Invalid handlers");
  for (const key of ["onInputInterest","onRenderDomains","onRenderSnapshot","onRenderPatch","onRenderEvent"]) requireFunction(handlers, key);
}

interface ViewportCursor {
  readonly message: ViewportStateV1;
  readonly width: number | null;
  readonly height: number | null;
}

function viewportCursor(message: ViewportStateV1): ViewportCursor {
  try {
    const valid = validateViewportState(message);
    return { message, width: valid.width, height: valid.height };
  } catch {
    return { message, width: null, height: null };
  }
}

function sameViewportSize(left: ViewportCursor, right: ViewportCursor): boolean {
  return left.width === right.width && left.height === right.height;
}

/**
 * Per-peer bounded viewport publisher: at most one admitted/unsettled
 * `inFlight` plus one overridable unadmitted `pending`. Bursts are coalesced
 * before shared-writer admission; `publishState()` is never an ACK.
 */
class RendererViewportPublisher implements RendererViewportDataPeer {
  private active = true;
  private lastSent: ViewportCursor | null = null;
  private inFlight: ViewportCursor | null = null;
  private pending: ViewportCursor | null = null;

  constructor(private readonly runtime: DataRuntime) {}

  publishState(message: ViewportStateV1): void {
    if (!this.active) return;
    const next = viewportCursor(message);
    if (this.inFlight === null) {
      if (this.lastSent !== null && sameViewportSize(next, this.lastSent)) {
        this.pending = null;
        return;
      }
      this.pending = null;
      this.admit(next);
      return;
    }
    this.pending = sameViewportSize(next, this.inFlight) ? null : next;
  }

  retire(): void {
    this.active = false;
    this.lastSent = null;
    this.inFlight = null;
    this.pending = null;
  }

  private admit(cursor: ViewportCursor): void {
    // The admitted slot must be occupied before the shared writer sees the send.
    this.inFlight = cursor;
    void this.runtime.send(cursor.message).then(
      (outcome) => this.settle(cursor, outcome),
      () => this.retire(),
    );
  }

  private settle(cursor: ViewportCursor, outcome: DataSendOutcome): void {
    if (!this.active || this.inFlight !== cursor) return;
    if (outcome.kind === "terminal") {
      this.retire();
      return;
    }
    this.lastSent = cursor;
    this.inFlight = null;
    const pending = this.pending;
    this.pending = null;
    if (pending !== null && !sameViewportSize(pending, cursor)) this.admit(pending);
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
  const viewport = new RendererViewportPublisher(runtime);
  void runtime.terminal.then(() => viewport.retire());
  return Object.freeze({
    binding,
    input: Object.freeze({
      sendState: (message: import("./model.js").InputStateV1) => runtime.send(message),
      sendEvent: (message: import("./model.js").InputEventV1) => runtime.send(message),
      sendReset: (message: import("./model.js").InputResetV1) => runtime.send(message),
    }),
    viewport: Object.freeze({
      publishState: (message: ViewportStateV1) => viewport.publishState(message),
    }),
    terminal: runtime.terminal,
    close: () => runtime.close(),
  });
}
