import type { MessageCarrier } from "@loomrealm/foundation";
import type { JsonValue } from "@loomrealm/wire";
import type {
  MainRendererControlPeer,
  MainRendererControlPeerOptions,
  RendererAuthoritySnapshotV1,
  RendererControlPublishOutcome,
  RendererControlTerminal,
} from "./model.js";
import {
  decodeRendererControlMessage,
  encodeRendererControlMessage,
  prepareRendererStateV1,
  validateRendererHelloParamsV1,
} from "./validation.js";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

const frozen = <T extends object>(value: T): T => Object.freeze(value);

class MainPeer implements MainRendererControlPeer {
  readonly terminal: Promise<RendererControlTerminal>;
  private readonly terminalDeferred = deferred<RendererControlTerminal>();
  private terminalValue: RendererControlTerminal | undefined;
  private helloState: "pending" | "sending" | "current" = "pending";
  private inFlight = false;
  private pendingLatest: RendererAuthoritySnapshotV1 | undefined;

  constructor(
    private readonly carrier: MessageCarrier,
    private readonly acceptHello: MainRendererControlPeerOptions["acceptHello"],
  ) {
    this.terminal = this.terminalDeferred.promise;
    void this.readLoop();
    void carrier.closed.then((closed) => this.commit(
      closed.kind === "closed"
        ? { kind: "carrier-closed" }
        : { kind: "carrier-lost", ...(closed.cause === undefined ? {} : { cause: closed.cause }) },
      false,
    ), (cause) => this.commit({ kind: "carrier-lost", cause }, false));
  }

  publish(snapshot: RendererAuthoritySnapshotV1): RendererControlPublishOutcome {
    if (this.terminalValue !== undefined)
      return frozen({ kind: "terminal", terminal: this.terminalValue });
    if (this.helloState !== "current" || this.inFlight) {
      this.pendingLatest = snapshot;
      return frozen({ kind: "accepted" });
    }
    this.startStateSend(snapshot);
    return frozen({ kind: "accepted" });
  }

  retire(): RendererControlTerminal {
    return this.commit({ kind: "retired" });
  }

  private commit(raw: RendererControlTerminal, close = true): RendererControlTerminal {
    if (this.terminalValue !== undefined) return this.terminalValue;
    const terminal = frozen(raw);
    this.terminalValue = terminal;
    this.pendingLatest = undefined;
    this.terminalDeferred.resolve(terminal);
    if (close) void this.carrier.close().catch(() => {});
    return terminal;
  }

  private async readLoop(): Promise<void> {
    try {
      let seen = false;
      for await (const text of this.carrier.messages()) {
        if (this.terminalValue !== undefined) return;
        if (seen) {
          this.protocolFatal(new Error("renderer.hello is one-shot"));
          return;
        }
        seen = true;
        let message;
        try {
          message = decodeRendererControlMessage(text);
        } catch (cause) {
          this.protocolFatal(cause);
          return;
        }
        if (!("method" in message) || !("id" in message) || message.method !== "renderer.hello" || message.id !== 1) {
          this.protocolFatal(new Error("First message must be renderer.hello id=1"), "invalid-request");
          return;
        }
        let params;
        try {
          params = validateRendererHelloParamsV1(message.params ?? {});
        } catch (cause) {
          this.protocolFatal(cause, "invalid-params");
          return;
        }
        if (!params.protocolVersions.includes(1)) {
          await this.sendSemanticError("RENDERER_CONTROL_PROTOCOL_UNSUPPORTED");
          this.commit({ kind: "protocol-fatal", cause: new Error("Unsupported Renderer Control version") });
          return;
        }
        let accepted;
        try {
          accepted = await this.acceptHello(this, params, 1);
        } catch (cause) {
          this.commit({ kind: "local-fatal", cause });
          return;
        }
        if (this.terminalValue !== undefined) return;
        if (accepted.kind === "rejected") {
          await this.sendSemanticError(accepted.code);
          this.commit({ kind: "protocol-fatal", cause: accepted });
          return;
        }
        this.helloState = "sending";
        try {
          await this.carrier.send(accepted.preparedHelloText);
        } catch (cause) {
          this.commit({ kind: "carrier-lost", cause });
          return;
        }
        if (this.terminalValue !== undefined) return;
        this.helloState = "current";
        const pending = this.pendingLatest;
        this.pendingLatest = undefined;
        if (pending !== undefined) this.startStateSend(pending);
      }
      if (this.terminalValue === undefined) this.commit({ kind: "carrier-closed" }, false);
    } catch (cause) {
      this.commit({ kind: "carrier-lost", cause });
    }
  }

  private startStateSend(snapshot: RendererAuthoritySnapshotV1): void {
    if (this.terminalValue !== undefined || this.helloState !== "current") return;
    let text: string;
    try {
      text = prepareRendererStateV1(snapshot);
    } catch (cause) {
      this.commit({ kind: "local-fatal", cause });
      return;
    }
    this.inFlight = true;
    void this.carrier.send(text).then(() => {
      this.inFlight = false;
      if (this.terminalValue !== undefined) return;
      const pending = this.pendingLatest;
      this.pendingLatest = undefined;
      if (pending !== undefined) this.startStateSend(pending);
    }, (cause) => {
      this.inFlight = false;
      this.commit({ kind: "carrier-lost", cause });
    });
  }

  private async sendSemanticError(code: string): Promise<void> {
    const body = { jsonrpc: "2.0", id: 1, error: { code: -32000, message: "Renderer Control semantic error", data: { code } } } as JsonValue;
    try { await this.carrier.send(encodeRendererControlMessage(body)); } catch { /* terminal below owns classification */ }
  }

  private protocolFatal(cause: unknown, diagnostic?: "invalid-request" | "invalid-params"): void {
    if (this.terminalValue !== undefined) return;
    if (diagnostic !== undefined) {
      const code = diagnostic === "invalid-params" ? -32602 : -32600;
      const message = diagnostic === "invalid-params" ? "Invalid params" : "Invalid Request";
      const body = { jsonrpc: "2.0", id: null, error: { code, message } } as JsonValue;
      void this.carrier.send(encodeRendererControlMessage(body)).catch(() => {});
    }
    this.commit({ kind: "protocol-fatal", cause });
  }
}

export function createMainRendererControlPeer(options: MainRendererControlPeerOptions): MainRendererControlPeer {
  if (options === null || typeof options !== "object" || options.carrier === null || typeof options.carrier !== "object" || typeof options.carrier.send !== "function" || typeof options.carrier.messages !== "function" || typeof options.carrier.close !== "function" || !(options.carrier.closed instanceof Promise) || typeof options.acceptHello !== "function")
    throw new TypeError("Invalid Main Renderer Control options");
  return new MainPeer(options.carrier, options.acceptHello);
}
