import WebSocket, { type RawData } from "ws";

export interface HostraEvent {
  readonly sessionId: string;
  readonly seq: number;
  readonly type: string;
  readonly data: Readonly<Record<string, unknown>>;
}

export interface HostraRpc {
  openWindow(options: Readonly<{ id: string; title?: string; width?: number; height?: number; loadUrl: string }>): Promise<string>;
  closeWindow(windowId: string): Promise<boolean>;
  call(method: "getHostState" | "getAllWindows", params?: Readonly<Record<string, unknown>>): Promise<unknown>;
  onEvent(listener: (event: HostraEvent) => void): () => void;
  readonly closed: Promise<unknown>;
  close(): Promise<void>;
}

interface PendingCall {
  readonly resolve: (value: unknown) => void;
  readonly reject: (cause: unknown) => void;
}

function requiredEnvironment(name: "HOSTRA_RPC_PORT" | "HOSTRA_RPC_TOKEN"): string {
  const value = process.env[name];
  if (typeof value !== "string" || value.length === 0) throw new Error(`Missing ${name}`);
  return value;
}

function validatePort(raw: string): number {
  if (!/^\d+$/u.test(raw)) throw new TypeError("HOSTRA_RPC_PORT must be an integer");
  const port = Number(raw);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) throw new TypeError("HOSTRA_RPC_PORT must be between 1 and 65535");
  return port;
}

export async function connectHostraRpc(): Promise<HostraRpc> {
  const port = validatePort(requiredEnvironment("HOSTRA_RPC_PORT"));
  const token = requiredEnvironment("HOSTRA_RPC_TOKEN");
  const endpoint = new URL(`ws://127.0.0.1:${port}/`);
  endpoint.searchParams.set("token", token);
  const socket = new WebSocket(endpoint);
  await new Promise<void>((resolve, reject) => {
    const opened = () => { socket.off("error", failed); resolve(); };
    const failed = (cause: unknown) => { socket.off("open", opened); reject(cause); };
    socket.once("open", opened);
    socket.once("error", failed);
  });

  let requestId = 0;
  let terminal: unknown = null;
  let closeResolve!: (cause: unknown) => void;
  const closed = new Promise<unknown>((resolve) => { closeResolve = resolve; });
  const pending = new Map<number, PendingCall>();
  const listeners = new Set<(event: HostraEvent) => void>();
  const finish = (cause: unknown) => {
    if (terminal !== null) return;
    terminal = cause ?? new Error("Hostra RPC closed");
    for (const waiter of pending.values()) waiter.reject(terminal);
    pending.clear();
    closeResolve(terminal);
  };
  socket.on("message", (raw: RawData, isBinary: boolean) => {
    if (isBinary) { socket.close(1003); return; }
    let value: unknown;
    try { value = JSON.parse(raw.toString("utf8")); } catch { return; }
    if (value === null || typeof value !== "object") return;
    const message = value as Record<string, unknown>;
    if (message.method === "hostra.event" && message.params !== null && typeof message.params === "object") {
      const event = message.params as unknown as HostraEvent;
      if (typeof event.type === "string") for (const listener of listeners) { try { listener(event); } catch {} }
      return;
    }
    if (!Number.isSafeInteger(message.id)) return;
    const waiter = pending.get(message.id as number);
    if (waiter === undefined) return;
    pending.delete(message.id as number);
    if (message.error !== null && typeof message.error === "object") {
      const error = message.error as Record<string, unknown>;
      waiter.reject(new Error(typeof error.message === "string" ? error.message : "Hostra RPC request failed"));
    } else waiter.resolve(message.result);
  });
  socket.once("close", (code, reason) => finish(new Error(`Hostra RPC closed (${code}${reason.length > 0 ? `: ${reason.toString()}` : ""})`)));
  socket.once("error", (cause) => finish(cause));

  const call = (method: string, params: Readonly<Record<string, unknown>> = {}): Promise<unknown> => {
    if (terminal !== null || socket.readyState !== WebSocket.OPEN) return Promise.reject(terminal ?? new Error("Hostra RPC unavailable"));
    const id = ++requestId;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ jsonrpc: "2.0", id, method, params }), (error) => {
        if (error == null) return;
        pending.delete(id);
        reject(error);
      });
    });
  };
  const rpc: HostraRpc = {
    openWindow: async (options: Readonly<{ id: string; title?: string; width?: number; height?: number; loadUrl: string }>) => {
      const result = await call("openWindow", options);
      if (typeof result !== "string") throw new TypeError("Invalid Hostra openWindow response");
      return result;
    },
    closeWindow: async (windowId: string) => (await call("closeWindow", { windowId })) === true,
    call: (method: "getHostState" | "getAllWindows", params: Readonly<Record<string, unknown>> = {}) => call(method, params),
    onEvent(listener: (event: HostraEvent) => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    closed,
    close: async () => {
      if (socket.readyState === WebSocket.CLOSED) return;
      await new Promise<void>((resolve) => { socket.once("close", () => resolve()); socket.close(1000); });
    },
  };
  return Object.freeze(rpc);
}
