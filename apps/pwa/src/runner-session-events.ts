import type { MessageCarrier } from "@loomrealm/foundation";
import {
  createSessionEventCarrierBinding,
  createSessionEventClient,
  createSessionEventMessagePortCarrier,
  type ReplaceableSessionEventClient,
  type SessionEventPhysicalBinding,
} from "@loomrealm/session-events";
import {
  parseInstallSessionEvents,
  type PwaSessionEventsResultV1,
} from "./bootstrap-protocol.js";

interface CurrentEventBinding {
  readonly bindingId: string;
  readonly binding: SessionEventPhysicalBinding;
  readonly carrier: MessageCarrier;
}

export class RunnerSessionEventsBinding {
  readonly client: ReplaceableSessionEventClient = createSessionEventClient();
  readonly initial: Promise<void>;
  private resolveInitial!: () => void;
  private current: CurrentEventBinding | null = null;
  private readonly seenRequests = new Set<string>();
  private readonly seenBindings = new Set<string>();
  private closed = false;

  constructor(private readonly port: MessagePort, private readonly subsystemKey: string) {
    this.initial = new Promise((resolve) => { this.resolveInitial = resolve; });
    port.addEventListener("message", this.onMessage);
    port.start();
  }

  private readonly onMessage = (event: MessageEvent<unknown>) => {
    const value = event.data;
    if (value === null || typeof value !== "object" || Array.isArray(value)) return;
    const item = value as Record<string, unknown>;
    if (item.type !== "session-events/install") return;
    let request;
    try { request = parseInstallSessionEvents(value, this.subsystemKey); }
    catch {
      try { if (item.port instanceof MessagePort) item.port.close(); } catch {}
      this.reply(item.requestId, item.bindingId, false);
      return;
    }
    if (
      this.closed || this.current !== null ||
      this.seenRequests.has(request.requestId) ||
      this.seenBindings.has(request.bindingId)
    ) {
      request.port.close();
      this.reply(request.requestId, request.bindingId, false);
      return;
    }
    this.seenRequests.add(request.requestId);
    this.seenBindings.add(request.bindingId);
    try {
      const carrier = createSessionEventMessagePortCarrier(request.port);
      const binding = createSessionEventCarrierBinding(carrier);
      const current = Object.freeze({ bindingId: request.bindingId, binding, carrier });
      this.current = current;
      this.client.attach(binding);
      void binding.terminal.then(() => {
        if (this.current === current) this.current = null;
      });
      this.reply(request.requestId, request.bindingId, true);
      this.resolveInitial();
    } catch {
      request.port.close();
      this.current = null;
      this.reply(request.requestId, request.bindingId, false);
    }
  };

  private reply(requestId: unknown, bindingId: unknown, ok: boolean): void {
    if (typeof requestId !== "string" || typeof bindingId !== "string") return;
    const result: PwaSessionEventsResultV1 = Object.freeze({
      formatVersion: 1,
      type: "session-events/result",
      requestId,
      subsystemKey: this.subsystemKey,
      bindingId,
      ok,
    });
    this.port.postMessage(result);
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.port.removeEventListener("message", this.onMessage);
    this.client.terminate();
    const current = this.current;
    this.current = null;
    if (current !== null) await current.carrier.close();
  }
}
