import type {
  PwaInstallRendererControlV1,
  PwaInstallRendererDataV1,
  PwaWindowBridgeResultV1,
} from "./bootstrap-protocol.js";
import { parseWindowBridgeResult } from "./bootstrap-protocol.js";

interface Pending {
  readonly requestId: string;
  resolve(value: PwaWindowBridgeResultV1): void;
  reject(cause: unknown): void;
  readonly timer: number;
}

export class SessionWindowBridge {
  private readonly pending = new Map<string, Pending>();
  private closed = false;

  constructor(private readonly port: MessagePort, private readonly sessionEpoch: string) {
    port.addEventListener("message", this.onMessage);
    port.addEventListener("messageerror", this.onError);
    port.start();
  }

  request(message: PwaInstallRendererControlV1 | PwaInstallRendererDataV1, transfer: Transferable[]): Promise<void> {
    if (this.closed || message.sessionEpoch !== this.sessionEpoch || this.pending.has(message.requestId)) return Promise.reject(new Error("Invalid Window bridge request"));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(message.requestId);
        reject(new Error("Window bridge request timed out"));
      }, 10_000) as unknown as number;
      this.pending.set(message.requestId, {
        requestId: message.requestId,
        timer,
        resolve: (result) => result.ok ? resolve() : reject(new Error("Window rejected bridge installation")),
        reject,
      });
      try { this.port.postMessage(message, transfer); }
      catch (cause) { clearTimeout(timer); this.pending.delete(message.requestId); reject(cause); }
    });
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.port.removeEventListener("message", this.onMessage);
    this.port.removeEventListener("messageerror", this.onError);
    this.port.close();
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(new Error("Window bridge closed")); }
    this.pending.clear();
  }

  private readonly onMessage = (event: MessageEvent<unknown>) => {
    const candidate = event.data as { requestId?: unknown } | null;
    if (candidate === null || typeof candidate !== "object" || typeof candidate.requestId !== "string") { this.close(); return; }
    const pending = this.pending.get(candidate.requestId);
    if (pending === undefined) { this.close(); return; }
    let result: PwaWindowBridgeResultV1;
    try { result = parseWindowBridgeResult(event.data, this.sessionEpoch, pending.requestId); }
    catch { this.close(); return; }
    this.pending.delete(pending.requestId);
    clearTimeout(pending.timer);
    pending.resolve(result);
  };

  private readonly onError = () => this.close();
}
