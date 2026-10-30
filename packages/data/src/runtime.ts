import type { MessageCarrier } from "@loomrealm/foundation";
import type {
  DataBindingViewV3,
  DataCurrentBindingV3,
  DataInboundDisposition,
  DataSendOutcome,
  DataTerminal,
  RendererDataMessageV3,
} from "./model.js";
import { DataProtocolError } from "./validation-common.js";
import { decodeForRole, encodeForRole, protocolFamilyOfType, type DataRole } from "./profile-codec.js";

type Handler = (message: RendererDataMessageV3) => DataInboundDisposition | Promise<DataInboundDisposition>;

interface SendRecord {
  text: string | null;
  resolve: (outcome: DataSendOutcome) => void;
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

export function validateBinding(binding: DataCurrentBindingV3): Readonly<DataBindingViewV3> {
  if (binding === null || typeof binding !== "object") throw new TypeError("Invalid binding");
  validateCarrier(binding.carrier);
  if (typeof binding.subsystemKey !== "string" || binding.subsystemKey.length === 0) throw new TypeError("Invalid subsystemKey");
  if (!Number.isSafeInteger(binding.generation) || binding.generation <= 0) throw new TypeError("Invalid generation");
  if (binding.dataProfile !== "loomrealm.renderer-data/3") throw new TypeError("Invalid dataProfile");
  return freeze({ subsystemKey: binding.subsystemKey, generation: binding.generation, dataProfile: binding.dataProfile });
}

export class DataRuntime {
  readonly terminal: Promise<DataTerminal>;
  private readonly terminalDeferred = deferred<DataTerminal>();
  private terminalValue?: DataTerminal;
  private sendQueue: Array<SendRecord | undefined> = [];
  private sendHead = 0;
  private sending = false;

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

  isTerminated(): boolean {
    return this.terminalValue !== undefined;
  }

  peekTerminal(): DataTerminal | undefined {
    return this.terminalValue;
  }

  send(message: RendererDataMessageV3): Promise<DataSendOutcome> {
    if (this.terminalValue) return Promise.resolve(freeze({ kind: "terminal", terminal: this.terminalValue }));
    // Encoding belongs to this caller operation. Representation/getter/Proxy
    // failure rejects only this call and does not retire a healthy Data peer.
    const text = encodeForRole(message, this.role);
    return new Promise<DataSendOutcome>((resolve) => {
      this.sendQueue.push({ text, resolve });
      this.drainSends();
    });
  }

  async close(): Promise<void> {
    if (!this.terminalValue) {
      try { await this.carrier.close(); }
      catch (cause) { this.commit({ kind: "carrier-lost", cause }, false); }
    }
    await this.terminal;
  }

  private async readLoop(): Promise<void> {
    try {
      for await (const raw of this.carrier.messages()) {
        if (this.terminalValue) break;
        let message: RendererDataMessageV3;
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
              protocol: protocolFamilyOfType(type),
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

  private dequeueSend(): SendRecord | undefined {
    while (this.sendHead < this.sendQueue.length) {
      const index = this.sendHead;
      this.sendHead += 1;
      const record = this.sendQueue[index];
      this.sendQueue[index] = undefined;
      if (record === undefined) continue;
      if (this.sendHead > 1024 && this.sendHead * 2 > this.sendQueue.length) {
        this.sendQueue = this.sendQueue.slice(this.sendHead);
        this.sendHead = 0;
      }
      return record;
    }
    this.sendQueue = [];
    this.sendHead = 0;
    return undefined;
  }

  private drainSends(): void {
    if (this.sending || this.terminalValue !== undefined) return;
    const record = this.dequeueSend();
    if (record === undefined) return;
    const text = record.text;
    record.text = null;
    if (text === null) throw new Error("Data writer record lost its application unit");
    this.sending = true;
    void this.carrier.send(text).then(
      () => {
        this.sending = false;
        // A physical send that was already admitted keeps the existing race
        // result: carrier success settles sent even if terminal won meanwhile.
        record.resolve(freeze({ kind: "sent" }));
        this.drainSends();
      },
      (cause) => {
        this.sending = false;
        const terminal = this.terminalValue ?? this.commit({ kind: "carrier-lost", cause });
        record.resolve(freeze({ kind: "terminal", terminal }));
      },
    );
  }

  private settleQueued(terminal: DataTerminal): void {
    for (;;) {
      const record = this.dequeueSend();
      if (record === undefined) return;
      record.text = null;
      record.resolve(freeze({ kind: "terminal", terminal }));
    }
  }

  private commit(value: DataTerminal, closeCarrier = true): DataTerminal {
    if (this.terminalValue) return this.terminalValue;
    const terminal = freeze(value);
    this.terminalValue = terminal;
    this.terminalDeferred.resolve(terminal);
    this.settleQueued(terminal);
    if (closeCarrier) void this.carrier.close().catch(() => undefined);
    return terminal;
  }
}
