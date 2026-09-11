import { MessageChannelMain, type MessagePortMain } from "electron";
import type { MessageCarrier } from "@loomrealm/foundation";
import type { RendererControlBinding } from "@loomrealm/platform-ports";
import { createMessagePortCarrier } from "./message-port-carrier.js";

interface CandidateWaiter {
  readonly token: string;
  readonly signal: AbortSignal;
  readonly resolve: (carrier: MessageCarrier) => void;
  readonly reject: (cause: unknown) => void;
  readonly detach: () => void;
}

export interface ElectronRendererCandidate {
  readonly rendererControlToken: string;
  readonly port: MessagePortMain;
}

export class ElectronRendererControlBinding {
  readonly binding: RendererControlBinding;
  private pending: CandidateWaiter | null = null;
  private closed = false;

  constructor() {
    this.binding = Object.freeze({
      acquire: (token: string, signal: AbortSignal) => this.acquire(token, signal),
    });
  }

  private acquire(token: string, signal: AbortSignal): Promise<MessageCarrier> {
    if (typeof token !== "string" || token.length === 0) return Promise.reject(new TypeError("Invalid Renderer Control token"));
    if (signal.aborted) return Promise.reject(signal.reason);
    if (this.closed) return Promise.reject(new Error("Renderer Control binding closed"));
    if (this.pending !== null) return Promise.reject(new Error("Renderer Control candidate already pending"));
    return new Promise((resolve, reject) => {
      const onAbort = () => {
        if (this.pending?.resolve !== resolve) return;
        this.pending = null;
        reject(signal.reason);
      };
      signal.addEventListener("abort", onAbort, { once: true });
      this.pending = { token, signal, resolve, reject, detach: () => signal.removeEventListener("abort", onAbort) };
    });
  }

  fulfillNextDocument(): ElectronRendererCandidate | null {
    const pending = this.pending;
    if (pending === null || pending.signal.aborted || this.closed) return null;
    this.pending = null;
    pending.detach();
    const channel = new MessageChannelMain();
    pending.resolve(createMessagePortCarrier(channel.port1 as never));
    return Object.freeze({ rendererControlToken: pending.token, port: channel.port2 });
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    const pending = this.pending;
    this.pending = null;
    pending?.detach();
    pending?.reject(new Error("Renderer Control binding closed"));
  }
}
