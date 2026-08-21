import type { MessageCarrier } from "@loomrealm/foundation";
import {
  JsonTextSyntaxError,
  type JsonRpcMessage,
  type JsonValue,
} from "@loomrealm/wire";
import { decode, encode, ProfileError } from "./codec.js";
import * as S from "./schema.js";
import type {
  RuntimeControlHandlerReply,
  RuntimeControlNotificationOutcome,
  RuntimeControlRequestMethod,
  RuntimeControlRequestOutcome,
  RuntimeControlScheduler,
  RuntimeControlTerminal,
} from "./model.js";

export class StateError extends Error {}

type Dispatch = {
  request(
    method: RuntimeControlRequestMethod,
    params: unknown,
  ): Promise<RuntimeControlHandlerReply<unknown, unknown>>;
  notification(method: "subsystem.status", params: unknown): Promise<void>;
};
type Pending = {
  method: RuntimeControlRequestMethod;
  settle(value: RuntimeControlRequestOutcome<unknown, unknown>): void;
  cancel(): void;
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
const freeze = <T extends object>(value: T): T => Object.freeze(value);
const known = new Set<RuntimeControlRequestMethod>([
  "subsystem.hello",
  "subsystem.shutdown",
  "frame.initialize",
  "frame.activate",
  "frame.suspend",
  "frame.resume",
  "frame.close",
  "frame.call",
  "frame.return",
]);
const mainInbound = new Set<RuntimeControlRequestMethod>([
  "subsystem.hello",
  "frame.call",
  "frame.return",
]);
const subsystemInbound = new Set<RuntimeControlRequestMethod>([
  "subsystem.shutdown",
  "frame.initialize",
  "frame.activate",
  "frame.suspend",
  "frame.resume",
  "frame.close",
]);

export function validateInfrastructure(
  carrier: MessageCarrier,
  scheduler: RuntimeControlScheduler,
): void {
  if (
    carrier === null ||
    typeof carrier !== "object" ||
    typeof carrier.send !== "function" ||
    typeof carrier.messages !== "function" ||
    typeof carrier.close !== "function" ||
    !(carrier.closed instanceof Promise)
  )
    throw new TypeError("Invalid carrier");
  if (
    scheduler === null ||
    typeof scheduler !== "object" ||
    typeof scheduler.schedule !== "function"
  )
    throw new TypeError("Invalid scheduler");
}
export function deadline(value: number, name: string, frame = false): number {
  if (
    !Number.isInteger(value) ||
    !Number.isFinite(value) ||
    value <= 0 ||
    (frame && (value < 1000 || value > 300000))
  )
    throw new TypeError(`Invalid ${name}`);
  return value;
}

export class Connection {
  readonly terminal: Promise<RuntimeControlTerminal>;
  private readonly terminalDeferred = deferred<RuntimeControlTerminal>();
  private terminalValue?: RuntimeControlTerminal;
  private nextId = 1;
  private remoteId = 0;
  private readonly pending = new Map<number, Pending>();
  private writer: Promise<void> = Promise.resolve();
  private dispatchLane: Promise<void> = Promise.resolve();

  constructor(
    private readonly carrier: MessageCarrier,
    private readonly scheduler: RuntimeControlScheduler,
    private readonly side: "main" | "subsystem",
    private readonly dispatch: Dispatch,
  ) {
    this.terminal = this.terminalDeferred.promise;
    void this.readLoop();
    void carrier.closed
      .then((closed) =>
        this.commit(
          closed.kind === "closed"
            ? { kind: "carrier-closed" }
            : {
                kind: "carrier-lost",
                ...(closed.cause === undefined ? {} : { cause: closed.cause }),
              },
        ),
      )
      .catch((cause) => this.commit({ kind: "carrier-lost", cause }));
  }
  get ended(): RuntimeControlTerminal | undefined {
    return this.terminalValue;
  }
  request(
    method: RuntimeControlRequestMethod,
    raw: unknown,
    delayMs: number,
  ): Promise<RuntimeControlRequestOutcome<unknown, unknown>> {
    if (this.terminalValue)
      return Promise.resolve(
        freeze({ kind: "terminal", terminal: this.terminalValue }),
      );
    let params: unknown, text: string;
    try {
      params = S.params(method, raw);
      encode({
        jsonrpc: "2.0",
        method,
        params,
        id: Number.MAX_SAFE_INTEGER,
      } as JsonValue);
    } catch (cause) {
      return Promise.resolve(this.failLocal(cause));
    }
    if (this.nextId > Number.MAX_SAFE_INTEGER)
      return Promise.resolve(
        this.failLocal(new Error("Request id space exhausted")),
      );
    const id = this.nextId++;
    text = encode({ jsonrpc: "2.0", method, params, id } as JsonValue);
    const done = deferred<RuntimeControlRequestOutcome<unknown, unknown>>();
    let settled = false;
    const settle = (value: RuntimeControlRequestOutcome<unknown, unknown>) => {
      if (settled) return;
      settled = true;
      done.resolve(freeze(value));
    };
    let cancel: () => void;
    try {
      cancel = this.scheduler.schedule(delayMs, () => {
        const p = this.pending.get(id);
        if (!p) return;
        this.pending.delete(id);
        p.cancel();
        p.settle({ kind: "timeout" });
        this.commit({ kind: "request-timeout", method, id });
      });
    } catch (cause) {
      return Promise.resolve(this.failLocal(cause));
    }
    const pending: Pending = {
      method,
      settle,
      cancel: () => {
        try {
          cancel();
        } catch {
          /* scheduler cancellation is specified not to throw */
        }
      },
    };
    this.pending.set(id, pending);
    void this.write(text).catch((cause) =>
      this.commit({ kind: "carrier-lost", cause }),
    );
    return done.promise;
  }
  notify(raw: unknown): Promise<RuntimeControlNotificationOutcome> {
    if (this.terminalValue)
      return Promise.resolve(
        freeze({ kind: "terminal", terminal: this.terminalValue }),
      );
    let params: unknown, text: string;
    try {
      params = S.status(raw);
      text = encode({
        jsonrpc: "2.0",
        method: "subsystem.status",
        params,
      } as JsonValue);
    } catch (cause) {
      return Promise.resolve(this.failLocal(cause));
    }
    return this.write(text).then(
      () => freeze({ kind: "sent" as const }),
      (cause) => {
        const terminal = this.commit({ kind: "carrier-lost", cause });
        return freeze({ kind: "terminal" as const, terminal });
      },
    );
  }
  failLocal(cause: unknown): {
    kind: "terminal";
    terminal: RuntimeControlTerminal;
  } {
    const terminal = this.commit({ kind: "local-fatal", cause });
    return freeze({ kind: "terminal", terminal });
  }
  async close(): Promise<void> {
    if (!this.terminalValue) {
      try {
        await this.carrier.close();
      } catch (cause) {
        this.commit({ kind: "carrier-lost", cause });
      }
    }
    await this.terminal;
  }
  private write(text: string): Promise<void> {
    if (this.terminalValue) return Promise.reject(this.terminalValue);
    const operation = this.writer.then(() => {
      if (this.terminalValue) throw this.terminalValue;
      return this.carrier.send(text);
    });
    this.writer = operation.catch(() => {});
    return operation;
  }
  private commit(
    value: RuntimeControlTerminal,
    closeCarrier = true,
  ): RuntimeControlTerminal {
    if (this.terminalValue) return this.terminalValue;
    const terminal = freeze(value);
    this.terminalValue = terminal;
    for (const pending of this.pending.values()) {
      pending.cancel();
      pending.settle({ kind: "terminal", terminal });
    }
    this.pending.clear();
    this.terminalDeferred.resolve(terminal);
    if (closeCarrier) void this.carrier.close().catch(() => {});
    return terminal;
  }
  private async readLoop(): Promise<void> {
    try {
      for await (const text of this.carrier.messages()) {
        if (this.terminalValue) break;
        let message: JsonRpcMessage;
        try {
          message = decode(text);
        } catch (cause) {
          this.protocolFatal(
            cause,
            null,
            cause instanceof JsonTextSyntaxError ? -32700 : -32600,
            cause instanceof JsonTextSyntaxError
              ? "Parse error"
              : "Invalid Request",
          );
          break;
        }
        if ("method" in message) {
          this.dispatchLane = this.dispatchLane
            .then(() => this.receiveCall(message))
            .catch((cause) => {
              this.commit({ kind: "local-fatal", cause });
            });
        } else this.receiveResponse(message);
      }
    } catch (cause) {
      this.commit({ kind: "carrier-lost", cause });
    }
  }
  private async receiveCall(
    message: Extract<JsonRpcMessage, { method: string }>,
  ): Promise<void> {
    if (this.terminalValue) return;
    const isRequest = "id" in message;
    const idValue = isRequest ? message.id : null;
    if (
      isRequest &&
      (!Number.isSafeInteger(idValue) ||
        typeof idValue !== "number" ||
        idValue <= this.remoteId ||
        idValue <= 0)
    ) {
      this.protocolFatal(
        new Error("Invalid remote request id"),
        null,
        -32600,
        "Invalid Request",
      );
      return;
    }
    if (isRequest) this.remoteId = idValue as number;
    const method = message.method;
    const params = message.params ?? {};
    if (!isRequest) {
      if (this.side !== "main" || method !== "subsystem.status") {
        this.protocolFatal(new Error("Invalid notification"));
        return;
      }
      try {
        await this.dispatch.notification("subsystem.status", params);
      } catch (cause) {
        if (cause instanceof StateError || cause instanceof ProfileError)
          this.protocolFatal(cause);
        else this.commit({ kind: "local-fatal", cause });
      }
      return;
    }
    const inbound = this.side === "main" ? mainInbound : subsystemInbound;
    if (
      !known.has(method as RuntimeControlRequestMethod) ||
      !inbound.has(method as RuntimeControlRequestMethod)
    ) {
      this.protocolFatal(
        new Error("Unknown or wrong-direction method"),
        idValue as number,
        -32601,
        "Method not found",
      );
      return;
    }
    const typed = method as RuntimeControlRequestMethod;
    let parsed: unknown;
    try {
      parsed = S.params(typed, params);
    } catch (cause) {
      this.protocolFatal(cause, idValue as number, -32602, "Invalid params");
      return;
    }
    try {
      const reply = await this.dispatch.request(typed, parsed);
      S.reply(reply);
      let body: JsonValue;
      if (reply.kind === "success") {
        const result = S.resultFor(typed, reply.result) as JsonValue;
        body = { jsonrpc: "2.0", id: idValue as number, result };
      } else {
        const checked = S.semantic(typed, reply.error);
        body = {
          jsonrpc: "2.0",
          id: idValue as number,
          error: {
            code: -32000,
            message: "Runtime Control semantic error",
            data: checked.error as JsonValue,
          },
        };
      }
      try {
        await this.write(encode(body));
      } catch (cause) {
        this.commit({ kind: "carrier-lost", cause });
        return;
      }
      if (reply.afterResponse) await reply.afterResponse();
    } catch (cause) {
      if (cause instanceof StateError)
        this.protocolFatal(
          cause,
          idValue as number,
          -32000,
          "Protocol state error",
          { code: "PROTOCOL_STATE_ERROR" },
        );
      else this.commit({ kind: "local-fatal", cause });
    }
  }
  private receiveResponse(
    message: Exclude<JsonRpcMessage, { method: string }>,
  ): void {
    if (this.terminalValue) return;
    const id = message.id;
    if (typeof id !== "number" || !Number.isSafeInteger(id) || id <= 0) {
      this.protocolFatal(new Error("Invalid response id"));
      return;
    }
    const pending = this.pending.get(id);
    if (!pending) {
      this.protocolFatal(new Error("Unsolicited response"));
      return;
    }
    this.pending.delete(id);
    pending.cancel();
    try {
      if ("result" in message) {
        const result = S.resultFor(pending.method, message.result);
        pending.settle({ kind: "success", result });
        return;
      }
      if (
        message.error.code !== -32000 ||
        message.error.data === undefined ||
        message.error.message.length > 4096
      )
        throw new ProfileError("Invalid Runtime Control error response");
      const semantic = S.semantic(pending.method, message.error.data);
      pending.settle({ kind: "semantic-error", ...semantic });
      if (semantic.classification === "fatal")
        this.commit({ kind: "protocol-fatal", cause: message.error.data });
    } catch (cause) {
      this.protocolFatal(cause);
    }
  }
  private protocolFatal(
    cause: unknown,
    id?: number | null,
    code?: number,
    message?: string,
    data?: JsonValue,
  ): void {
    if (this.terminalValue) return;
    if (code !== undefined) {
      const body: JsonValue = {
        jsonrpc: "2.0",
        id: id ?? null,
        error: {
          code,
          message: message!,
          ...(data === undefined ? {} : { data }),
        },
      };
      const text = encode(body);
      const diagnostic = this.writer.then(() => this.carrier.send(text));
      this.writer = diagnostic.catch(() => {});
      this.commit({ kind: "protocol-fatal", cause }, false);
      void Promise.resolve()
        .then(() => this.carrier.close())
        .catch(() => {});
      return;
    }
    this.commit({ kind: "protocol-fatal", cause });
  }
}
