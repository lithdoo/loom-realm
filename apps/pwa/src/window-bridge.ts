import type {
  PwaInstallRendererControlV1,
  PwaInstallRendererDataV1,
  PwaRevokeRendererDataV1,
  PwaWindowBridgeResultV1,
} from "./bootstrap-protocol.js";
import { parseWindowBridgeResult } from "./bootstrap-protocol.js";

interface Pending {
  readonly requestId: string;
  resolve(value: PwaWindowBridgeResultV1): void;
  reject(cause: unknown): void;
  readonly timer: ReturnType<typeof setTimeout>;
  cleanup(): void;
}

export class SessionWindowBridge {
  private readonly pending = new Map<string, Pending>();
  private closed = false;

  constructor(
    private readonly port: MessagePort,
    private readonly sessionEpoch: string,
    private readonly requestTimeoutMs = 10_000,
  ) {
    port.addEventListener("message", this.onMessage);
    port.addEventListener("messageerror", this.onError);
    port.start();
  }

  request(message: PwaInstallRendererControlV1 | PwaInstallRendererDataV1 | PwaRevokeRendererDataV1, transfer: Transferable[] = [], signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) return Promise.reject(signal.reason);
    if (this.closed || message.sessionEpoch !== this.sessionEpoch || this.pending.has(message.requestId)) return Promise.reject(new Error("Invalid Window bridge request"));
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
      };
      const onAbort = () => {
        if (!this.pending.delete(message.requestId)) return;
        cleanup();
        reject(signal!.reason);
      };
      const timer = setTimeout(() => {
        this.pending.delete(message.requestId);
        signal?.removeEventListener("abort", onAbort);
        reject(new Error("Window bridge request timed out"));
      }, this.requestTimeoutMs);
      this.pending.set(message.requestId, {
        requestId: message.requestId,
        timer,
        resolve: (result) => result.ok ? resolve() : reject(new Error("Window rejected bridge installation")),
        reject,
        cleanup,
      });
      signal?.addEventListener("abort", onAbort, { once: true });
      try { this.port.postMessage(message, transfer); }
      catch (cause) { cleanup(); this.pending.delete(message.requestId); reject(cause); }
    });
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.port.removeEventListener("message", this.onMessage);
    this.port.removeEventListener("messageerror", this.onError);
    this.port.close();
    for (const pending of this.pending.values()) { pending.cleanup(); pending.reject(new Error("Window bridge closed")); }
    this.pending.clear();
  }

  private readonly onMessage = (event: MessageEvent<unknown>) => {
    const candidate = event.data as { requestId?: unknown } | null;
    if (candidate === null || typeof candidate !== "object" || typeof candidate.requestId !== "string") { this.close(); return; }
    const pending = this.pending.get(candidate.requestId);
    // A timed-out or rolled-back request may still produce a late result. It
    // cannot commit anything and must not poison later requests on the bridge.
    if (pending === undefined) return;
    let result: PwaWindowBridgeResultV1;
    try { result = parseWindowBridgeResult(event.data, this.sessionEpoch, pending.requestId); }
    catch { this.close(); return; }
    this.pending.delete(pending.requestId);
    pending.cleanup();
    pending.resolve(result);
  };

  private readonly onError = () => this.close();
}
