import type { MessageCarrier } from "@loomrealm/foundation";
import type { JsonValue } from "@loomrealm/wire";
import type {
  RendererAuthoritySnapshotV1,
  RendererControlPeer,
  RendererControlTerminal,
  RendererPeerConnectOptions,
  RendererPeerConnectOutcome,
} from "./model.js";
import {
  decodeRendererControlMessage,
  encodeRendererControlMessage,
  RendererControlProfileError,
  validateRendererAuthoritySnapshotV1,
  validateRendererHelloParamsV1,
} from "./validation.js";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
const frozen = <T extends object>(value: T): T => Object.freeze(value);

class RendererPeer implements RendererControlPeer {
  readonly terminal: Promise<RendererControlTerminal>;
  private readonly terminalDeferred = deferred<RendererControlTerminal>();
  private terminalValue: RendererControlTerminal | undefined;
  private statesClaimed = false;

  constructor(
    private readonly carrier: MessageCarrier,
    private readonly iterator: AsyncIterator<string>,
    private readonly sessionId: string,
    private lastRevision: number,
  ) {
    this.terminal = this.terminalDeferred.promise;
    void carrier.closed.then((closed) => this.commit(
      closed.kind === "closed" ? { kind: "carrier-closed" } : { kind: "carrier-lost", ...(closed.cause === undefined ? {} : { cause: closed.cause }) },
      false,
    ), (cause) => this.commit({ kind: "carrier-lost", cause }, false));
  }

  states(): AsyncIterable<RendererAuthoritySnapshotV1> {
    if (this.statesClaimed) throw new TypeError("Renderer Control state stream already claimed");
    this.statesClaimed = true;
    return { [Symbol.asyncIterator]: () => this.stateIterator() };
  }

  async close(): Promise<void> {
    if (this.terminalValue === undefined) {
      try { await this.carrier.close(); } catch (cause) { this.commit({ kind: "carrier-lost", cause }); }
    }
    await this.terminal;
  }

  private async *stateIterator(): AsyncGenerator<RendererAuthoritySnapshotV1> {
    try {
      while (this.terminalValue === undefined) {
        const next = await this.iterator.next();
        if (next.done) {
          this.commit({ kind: "carrier-closed" }, false);
          return;
        }
        let message;
        try {
          message = decodeRendererControlMessage(next.value);
        } catch (cause) {
          throw new RendererControlProfileError("Invalid Renderer Control message", { cause });
        }
        if (!("method" in message) || "id" in message || message.method !== "renderer.state")
          throw new RendererControlProfileError("Expected renderer.state notification");
        const params = message.params;
        if (params === undefined || params === null || typeof params !== "object" || Array.isArray(params) || Object.keys(params).length !== 1 || !("snapshot" in params))
          throw new RendererControlProfileError("Invalid renderer.state params");
        const snapshot = validateRendererAuthoritySnapshotV1((params as { snapshot: unknown }).snapshot);
        if (snapshot.sessionId !== this.sessionId || snapshot.revision <= this.lastRevision)
          throw new RendererControlProfileError("Renderer Control revision/session regression");
        this.lastRevision = snapshot.revision;
        yield snapshot;
      }
    } catch (cause) {
      this.commit({ kind: cause instanceof RendererControlProfileError ? "protocol-fatal" : "carrier-lost", cause });
    }
  }

  private commit(raw: RendererControlTerminal, close = true): RendererControlTerminal {
    if (this.terminalValue !== undefined) return this.terminalValue;
    const terminal = frozen(raw);
    this.terminalValue = terminal;
    this.terminalDeferred.resolve(terminal);
    if (close) void this.carrier.close().catch(() => {});
    return terminal;
  }
}

export async function connectRendererControlPeer(options: RendererPeerConnectOptions): Promise<RendererPeerConnectOutcome> {
  if (options === null || typeof options !== "object" || options.carrier === null || typeof options.carrier !== "object")
    throw new TypeError("Invalid Renderer Control connect options");
  const versions = options.protocolVersions ?? [1];
  let params;
  try {
    params = validateRendererHelloParamsV1({ rendererControlToken: options.rendererControlToken, protocolVersions: versions });
  } catch (cause) {
    return frozen({ kind: "terminal", terminal: frozen({ kind: "local-fatal", cause }) });
  }
  const hello = { jsonrpc: "2.0", id: 1, method: "renderer.hello", params } as unknown as JsonValue;
  let text: string;
  try { text = encodeRendererControlMessage(hello); } catch (cause) {
    return frozen({ kind: "terminal", terminal: frozen({ kind: "local-fatal", cause }) });
  }
  try { await options.carrier.send(text); } catch (cause) {
    return frozen({ kind: "terminal", terminal: frozen({ kind: "carrier-lost", cause }) });
  }
  const iterator = options.carrier.messages()[Symbol.asyncIterator]();
  let next: IteratorResult<string>;
  try { next = await iterator.next(); } catch (cause) {
    return frozen({ kind: "terminal", terminal: frozen({ kind: "carrier-lost", cause }) });
  }
  if (next.done) return frozen({ kind: "terminal", terminal: frozen({ kind: "carrier-closed" }) });
  try {
    const message = decodeRendererControlMessage(next.value);
    if ("method" in message || message.id !== 1) throw new RendererControlProfileError("Invalid renderer.hello response");
    if ("error" in message) {
      const data = message.error.data;
      const code = data !== undefined && data !== null && typeof data === "object" && !Array.isArray(data) && "code" in data ? (data as { code: unknown }).code : undefined;
      if (message.error.code === -32000 && message.error.message.length <= 4096 && data !== undefined && data !== null && typeof data === "object" && !Array.isArray(data) && Object.keys(data).length === 1 && (code === "RENDERER_AUTHENTICATION_FAILED" || code === "RENDERER_CONTROL_PROTOCOL_UNSUPPORTED" || code === "PROTOCOL_STATE_ERROR")) {
        void options.carrier.close().catch(() => {});
        return frozen({ kind: "rejected", code });
      }
      throw new RendererControlProfileError("Invalid renderer.hello error");
    }
    const result = message.result;
    if (result === null || typeof result !== "object" || Array.isArray(result) || Object.keys(result).length !== 2 || (result as { protocolVersion?: unknown }).protocolVersion !== 1 || !("snapshot" in result))
      throw new RendererControlProfileError("Invalid renderer.hello result");
    const snapshot = validateRendererAuthoritySnapshotV1((result as { snapshot: unknown }).snapshot);
    const peer = new RendererPeer(options.carrier, iterator, snapshot.sessionId, snapshot.revision);
    return frozen({ kind: "connected", peer, snapshot });
  } catch (cause) {
    void options.carrier.close().catch(() => {});
    return frozen({ kind: "terminal", terminal: frozen({ kind: "protocol-fatal", cause }) });
  }
}
