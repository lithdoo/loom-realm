import type { MessageCarrier } from "@loomrealm/foundation";
import type {
  DataBindingViewV1,
  DataCurrentBindingV1,
  DataInboundDisposition,
  DataSendOutcome,
  DataTerminal,
  RendererDataMessageV1,
  ViewportStateV1,
} from "./model.js";
import { DataProtocolError } from "./validation-common.js";
import { decodeForRole, encodeForRole, type DataRole } from "./profile-codec.js";

const MAX_PENDING_SENDS = 1024;
type Handler = (message: RendererDataMessageV1) => DataInboundDisposition | Promise<DataInboundDisposition>;

function sameViewportSize(left: ViewportStateV1, right: ViewportStateV1): boolean {
  return left.width === right.width && left.height === right.height;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}
function freeze<T extends object>(value: T): T { return Object.freeze(value); }
function validateCarrier(carrier: MessageCarrier): void {
  if (
    carrier === null || typeof carrier !== "object" ||
    typeof carrier.send !== "function" || typeof carrier.messages !== "function" ||
    typeof carrier.close !== "function" || !(carrier.closed instanceof Promise)
  ) throw new TypeError("Invalid carrier");
}

export function validateBinding(binding: DataCurrentBindingV1): Readonly<DataBindingViewV1> {
  if (binding === null || typeof binding !== "object") throw new TypeError("Invalid binding");
  validateCarrier(binding.carrier);
  if (typeof binding.subsystemKey !== "string" || binding.subsystemKey.length === 0) throw new TypeError("Invalid subsystemKey");
  if (!Number.isSafeInteger(binding.generation) || binding.generation <= 0) throw new TypeError("Invalid generation");
  if (binding.dataProfile !== "loomrealm.renderer-data/1") throw new TypeError("Invalid dataProfile");
  return freeze({ subsystemKey: binding.subsystemKey, generation: binding.generation, dataProfile: binding.dataProfile });
}

export class DataRuntime {
  readonly terminal: Promise<DataTerminal>;
  private readonly terminalDeferred = deferred<DataTerminal>();
  private terminalValue?: DataTerminal;
  private writer: Promise<void> = Promise.resolve();
  private pendingSends = 0;
  // Viewport State v1 bounded publisher cursor (Viewport State v1 §4): at most one
  // admitted/unsettled in-flight state and one latest unadmitted pending state.
  // `inFlight` is set before the send call; every async continuation re-validates
  // the settling message identity so late resolutions of a retired cursor stay inert.
  private viewportActive = true;
  private viewportLastSent: ViewportStateV1 | null = null;
  private viewportInFlight: ViewportStateV1 | null = null;
  private viewportPending: ViewportStateV1 | null = null;

  constructor(
    private readonly carrier: MessageCarrier,
    private readonly role: DataRole,
    private readonly dispatch: Handler,
  ) {
    this.terminal = this.terminalDeferred.promise;
    void this.readLoop();
    void carrier.closed.then((closed) => {
      this.commit(
        closed.kind === "closed"
          ? { kind: "carrier-closed" }
          : { kind: "carrier-lost", ...(closed.cause === undefined ? {} : { cause: closed.cause }) },
        false,
      );
    }, (cause) => this.commit({ kind: "carrier-lost", cause }, false));
  }

  async send(message: RendererDataMessageV1): Promise<DataSendOutcome> {
    if (this.terminalValue) return freeze({ kind: "terminal", terminal: this.terminalValue });
    let text: string;
    try { text = encodeForRole(message, this.role); }
    catch (cause) {
      const terminal = this.commit({ kind: "local-fatal", cause });
      return freeze({ kind: "terminal", terminal });
    }
    if (this.pendingSends >= MAX_PENDING_SENDS) {
      const terminal = this.commit({ kind: "local-fatal", cause: new Error("Data writer queue capacity exceeded") });
      return freeze({ kind: "terminal", terminal });
    }
    this.pendingSends += 1;
    const operation = this.writer.then(async () => {
      if (this.terminalValue) throw this.terminalValue;
      await this.carrier.send(text);
    });
    this.writer = operation.catch(() => undefined);
    try {
      await operation;
      this.pendingSends -= 1;
      return freeze({ kind: "sent" });
    } catch (cause) {
      this.pendingSends -= 1;
      const terminal =
        cause === this.terminalValue && this.terminalValue !== undefined
          ? this.terminalValue
          : this.commit({ kind: "carrier-lost", cause });
      return freeze({ kind: "terminal", terminal });
    }
  }

  async close(): Promise<void> {
    if (!this.terminalValue) {
      try { await this.carrier.close(); }
      catch (cause) { this.commit({ kind: "carrier-lost", cause }, false); }
    }
    await this.terminal;
  }

  /**
   * Offer one Viewport State to this peer's bounded publisher. Returns void: a
   * coalesced sample has no per-sample fulfillment and no remote ACK. Trusted
   * local callers with invalid messages follow the existing local-fatal send
   * rule inside `send()`; remote outcomes never surface as rejections here.
   */
  publishViewportState(message: ViewportStateV1): void {
    if (!this.viewportActive) return;
    const inFlight = this.viewportInFlight;
    if (inFlight === null) {
      if (this.viewportLastSent !== null && sameViewportSize(this.viewportLastSent, message)) {
        this.viewportPending = null;
        return;
      }
      this.viewportPending = null;
      this.viewportInFlight = message;
      this.viewportAdmit(message);
      return;
    }
    // Last observation replaces any prior pending; A→B→A cancels B.
    this.viewportPending = sameViewportSize(inFlight, message) ? null : message;
  }

  private viewportAdmit(message: ViewportStateV1): void {
    void this.send(message).then(
      (outcome) => this.viewportSettled(message, outcome),
      () => this.viewportSettled(message, {
        kind: "terminal",
        terminal: freeze({ kind: "carrier-lost", cause: new Error("viewport send rejected") }),
      }),
    );
  }

  private viewportSettled(message: ViewportStateV1, outcome: DataSendOutcome): void {
    if (!this.viewportActive || this.viewportInFlight !== message) return;
    if (outcome.kind === "terminal") {
      this.viewportRetire();
      return;
    }
    this.viewportLastSent = message;
    this.viewportInFlight = null;
    const pending = this.viewportPending;
    this.viewportPending = null;
    if (pending !== null && !sameViewportSize(pending, this.viewportLastSent)) {
      this.viewportInFlight = pending;
      this.viewportAdmit(pending);
    }
  }

  private viewportRetire(): void {
    this.viewportActive = false;
    this.viewportInFlight = null;
    this.viewportPending = null;
  }

  private async readLoop(): Promise<void> {
    try {
      for await (const raw of this.carrier.messages()) {
        if (this.terminalValue) break;
        let message: RendererDataMessageV1;
        try { message = decodeForRole(raw, this.role); }
        catch (cause) {
          if (cause instanceof DataProtocolError) this.commit({ kind: "protocol-fatal", protocol: cause.protocol, cause });
          else this.commit({ kind: "protocol-fatal", protocol: "profile", cause });
          break;
        }
        try {
          const disposition = await this.dispatch(message);
          if (disposition.kind === "protocol-fatal") {
            const type = (message as { type: string }).type;
            this.commit({
              kind: "protocol-fatal",
              protocol: type.startsWith("input.") ? "input" : type.startsWith("render.") ? "render" : "viewport",
              ...(disposition.cause === undefined ? {} : { cause: disposition.cause }),
            });
            break;
          }
        } catch (cause) {
          this.commit({ kind: "local-fatal", cause });
          break;
        }
      }
    } catch (cause) {
      if (!this.terminalValue) this.commit({ kind: "carrier-lost", cause }, false);
    }
  }

  private commit(value: DataTerminal, closeCarrier = true): DataTerminal {
    if (this.terminalValue) return this.terminalValue;
    const terminal = freeze(value);
    this.terminalValue = terminal;
    this.viewportRetire();
    this.terminalDeferred.resolve(terminal);
    if (closeCarrier) void this.carrier.close().catch(() => undefined);
    return terminal;
  }
}
