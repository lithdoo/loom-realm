import type {
  SessionEvent,
  SessionEventListener,
  SessionEventSubscription,
  SessionEventSubscriptionClose,
  SessionEventSubscriptionCloseReason,
} from "./model.js";
import { SESSION_EVENT_LIMITS, eventLogicalBytes } from "./validation.js";

interface QueuedEvent {
  readonly event: SessionEvent;
  readonly bytes: number;
}

export class SessionEventDelivery implements SessionEventSubscription {
  private readonly queue: QueuedEvent[] = [];
  private pendingBytes = 0;
  private visible = false;
  private active = true;
  private running = false;
  private scheduled = false;
  private reason: SessionEventSubscriptionCloseReason | null = null;
  private settleClosed!: (value: SessionEventSubscriptionClose) => void;
  readonly closed: Promise<SessionEventSubscriptionClose>;

  constructor(
    private readonly listener: SessionEventListener,
    private readonly onTerminal: (reason: SessionEventSubscriptionCloseReason) => void,
  ) {
    this.closed = new Promise((resolve) => { this.settleClosed = resolve; });
  }

  get terminalReason(): SessionEventSubscriptionCloseReason | null {
    return this.reason;
  }

  enqueue(event: SessionEvent): void {
    if (!this.active) return;
    const bytes = eventLogicalBytes(event);
    if (
      this.queue.length + 1 > SESSION_EVENT_LIMITS.pendingEventsPerSubscription ||
      this.pendingBytes + bytes > SESSION_EVENT_LIMITS.pendingBytesPerSubscription
    ) {
      this.terminate("overflow");
      return;
    }
    this.queue.push(Object.freeze({ event, bytes }));
    this.pendingBytes += bytes;
    this.schedule();
  }

  reveal(): boolean {
    if (!this.active) return false;
    this.visible = true;
    this.schedule();
    return true;
  }

  close(): void {
    this.terminate("closed");
  }

  terminate(reason: SessionEventSubscriptionCloseReason): void {
    if (!this.active) return;
    this.active = false;
    this.reason = reason;
    this.queue.length = 0;
    this.pendingBytes = 0;
    this.settleClosed(Object.freeze({ reason }));
    this.onTerminal(reason);
  }

  private schedule(): void {
    if (!this.active || !this.visible || this.running || this.scheduled || this.queue.length === 0) return;
    this.scheduled = true;
    setTimeout(() => {
      this.scheduled = false;
      void this.drain();
    }, 0);
  }

  private async drain(): Promise<void> {
    if (!this.active || !this.visible || this.running) return;
    this.running = true;
    try {
      while (this.active && this.visible) {
        const queued = this.queue.shift();
        if (queued === undefined) break;
        this.pendingBytes -= queued.bytes;
        try {
          await Promise.resolve(this.listener(queued.event));
        } catch {
          // Listener failure is subscription-local and delivery continues.
        }
      }
    } finally {
      this.running = false;
      this.schedule();
    }
  }
}
