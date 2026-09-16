import type { DataSendOutcome, ViewportStateV1 } from "./model.js";
import { validateViewportState } from "./viewport-codec.js";

function sizeKey(message: ViewportStateV1): string {
  return `${message.width}x${message.height}`;
}

export class ViewportLatestSender {
  private inFlight: Promise<DataSendOutcome> | null = null;
  private pending: ViewportStateV1 | null = null;
  private lastAdmittedKey: string | null = null;
  private readonly waiters: Array<(outcome: DataSendOutcome) => void> = [];

  constructor(private readonly send: (message: ViewportStateV1) => Promise<DataSendOutcome>) {}

  sendState(message: ViewportStateV1): Promise<DataSendOutcome> {
    let validated: ViewportStateV1;
    try {
      validated = validateViewportState(message);
    } catch {
      return this.send(message);
    }
    const key = sizeKey(validated);
    if (this.inFlight !== null) {
      if (this.pending === null && this.lastAdmittedKey === key) return this.inFlight;
      this.pending = validated;
      return new Promise((resolve) => {
        this.waiters.push(resolve);
      });
    }
    if (this.lastAdmittedKey === key) {
      return Promise.resolve(Object.freeze({ kind: "sent" as const }));
    }
    return this.admit(validated);
  }

  private admit(message: ViewportStateV1): Promise<DataSendOutcome> {
    this.lastAdmittedKey = sizeKey(message);
    const operation = this.send(message).then((outcome) => {
      if (this.inFlight === operation) this.inFlight = null;
      const pending = this.pending;
      this.pending = null;
      const waiters = this.waiters.splice(0);
      if (outcome.kind === "terminal") {
        this.lastAdmittedKey = null;
        for (const waiter of waiters) waiter(outcome);
        return outcome;
      }
      if (pending !== null && sizeKey(pending) !== this.lastAdmittedKey) {
        const next = this.admit(pending);
        for (const waiter of waiters) void next.then(waiter);
        return outcome;
      }
      for (const waiter of waiters) waiter(outcome);
      return outcome;
    });
    this.inFlight = operation;
    return operation;
  }
}
