import type {
  RealmStateSubscription,
  RealmStateSubscriptionEvent,
} from "./model.js";
import {
  REALM_STATE_LIMITS,
  subscriptionRecordPayloadBytes,
} from "./validation.js";

export type SubscriptionDeactivation =
  | "closed"
  | "binding-terminal"
  | "overflow"
  | "authority-terminal";

/**
 * One ordered callback lane. Change accounting includes the callback currently
 * being awaited, so a slow listener cannot disappear from the frozen pending
 * event/byte limits merely because delivery has started.
 */
export class RealmStateSubscriptionDelivery implements RealmStateSubscription {
  private readonly queue: RealmStateSubscriptionEvent[] = [];
  private pendingChanges = 0;
  private pendingBytes = 0;
  private active = true;
  private delivering = false;
  private deliveryScheduled = false;
  private terminalQueued = false;

  constructor(
    private readonly listener: (event: RealmStateSubscriptionEvent) => unknown,
    private readonly onDeactivate: (reason: SubscriptionDeactivation) => void,
  ) {}

  enqueue(event: RealmStateSubscriptionEvent): void {
    if (!this.active || this.terminalQueued) return;
    if (event.type === "change") {
      const bytes = changeBytes(event);
      if (
        this.pendingChanges + 1 > REALM_STATE_LIMITS.subscriptionPendingEvents ||
        this.pendingBytes + bytes > REALM_STATE_LIMITS.subscriptionPendingPayloadBytes
      ) {
        this.discardQueuedChanges();
        this.terminalQueued = true;
        this.queue.push(Object.freeze({ type: "terminal", reason: "overflow" }));
        this.start();
        return;
      }
      this.pendingChanges += 1;
      this.pendingBytes += bytes;
    } else if (event.type === "terminal") {
      this.terminalQueued = true;
    }
    this.queue.push(event);
    this.start();
  }

  close(): void {
    this.deactivate("closed");
  }

  private start(): void {
    if (!this.active || this.deliveryScheduled || this.delivering) return;
    this.deliveryScheduled = true;
    setTimeout(() => {
      this.deliveryScheduled = false;
      void this.drain();
    }, 0);
  }

  private async drain(): Promise<void> {
    if (this.delivering || !this.active) return;
    this.delivering = true;
    try {
      while (this.active) {
        const event = this.queue.shift();
        if (event === undefined) break;
        try {
          const returned = this.listener(event);
          if (
            returned !== null &&
            (typeof returned === "object" || typeof returned === "function") &&
            typeof (returned as { then?: unknown }).then === "function"
          ) {
            await Promise.resolve(returned).catch(() => undefined);
          }
        } catch {
          // A callback failure is local and never changes Authority state.
        }
        if (!this.active) break;
        if (event.type === "change") {
          this.pendingChanges -= 1;
          this.pendingBytes -= changeBytes(event);
        }
        if (event.type === "terminal") {
          this.deactivate(event.reason);
          break;
        }
      }
    } finally {
      this.delivering = false;
      if (this.active && this.queue.length > 0) this.start();
    }
  }

  private discardQueuedChanges(): void {
    for (let index = this.queue.length - 1; index >= 0; index -= 1) {
      const event = this.queue[index];
      if (event?.type !== "change") continue;
      this.pendingChanges -= 1;
      this.pendingBytes -= changeBytes(event);
      this.queue.splice(index, 1);
    }
  }

  private deactivate(reason: SubscriptionDeactivation): void {
    if (!this.active) return;
    this.active = false;
    this.queue.length = 0;
    this.pendingChanges = 0;
    this.pendingBytes = 0;
    this.onDeactivate(reason);
  }
}

function changeBytes(
  event: Extract<RealmStateSubscriptionEvent, { readonly type: "change" }>,
): number {
  return event.records.reduce(
    (total, record) => total + subscriptionRecordPayloadBytes(record),
    0,
  );
}
