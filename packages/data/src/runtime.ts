import type { MessageCarrier } from "@loomrealm/foundation";
import type {
  DataBindingViewV1,
  DataCurrentBindingV1,
  DataInboundDisposition,
  DataSendOutcome,
  DataTerminal,
  RendererDataMessageV1,
} from "./model.js";
import { DataProtocolError, decodeForRole, encodeForRole, type DataRole } from "./validation.js";

const MAX_PENDING_SENDS = 1024;
type Handler = (message: RendererDataMessageV1) => DataInboundDisposition | Promise<DataInboundDisposition>;

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
      if (this.terminalValue) return freeze({ kind: "terminal", terminal: this.terminalValue });
      return freeze({ kind: "sent" });
    } catch (cause) {
      this.pendingSends -= 1;
      const terminal = this.isTerminal(cause) ? cause : this.commit({ kind: "carrier-lost", cause });
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

  private isTerminal(value: unknown): value is DataTerminal {
    return value !== null && typeof value === "object" && "kind" in value;
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
              protocol: type.startsWith("input.") ? "input" : "render",
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
    this.terminalDeferred.resolve(terminal);
    if (closeCarrier) void this.carrier.close().catch(() => undefined);
    return terminal;
  }
}
