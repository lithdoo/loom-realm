import type { DataSendOutcome, DataTerminal, ViewportStateV1 } from "./model.js";
import { validateViewportState } from "./viewport-codec.js";

function sizeKey(message: ViewportStateV1): string {
  return `${message.width}x${message.height}`;
}

const sent = Object.freeze({ kind: "sent" as const });

export class ViewportLatestSender {
  private inFlight: Promise<DataSendOutcome> | null = null;
  private pending: ViewportStateV1 | null = null;
  private lastAdmittedKey: string | null = null;
  private readonly waiters: Array<(outcome: DataSendOutcome) => void> = [];
  private closedOutcome: DataSendOutcome | null = null;

  constructor(
    private readonly send: (message: ViewportStateV1) => Promise<DataSendOutcome>,
    private readonly peekTerminal: () => DataTerminal | undefined = () => undefined,
  ) {}

  noteTerminal(terminal: DataTerminal): void {
    if (this.closedOutcome) return;
    this.closedOutcome = Object.freeze({ kind: "terminal" as const, terminal });
    this.lastAdmittedKey = null;
    this.pending = null;
    const waiters = this.waiters.splice(0);
    for (const waiter of waiters) waiter(this.closedOutcome);
  }

  sendState(message: ViewportStateV1): Promise<DataSendOutcome> {
    const closed = this.closedTerminal();
    if (closed) return this.settleClosed(closed);
    let validated: ViewportStateV1;
    try {
      validated = validateViewportState(message);
    } catch {
      return this.send(message);
    }
    const key = sizeKey(validated);
    if (this.inFlight !== null) {
      if (this.pending === null && this.lastAdmittedKey === key && this.closedTerminal() === null) {
        return this.inFlight;
      }
      this.pending = validated;
      return new Promise((resolve) => {
        this.waiters.push(resolve);
      });
    }
    if (this.lastAdmittedKey === key && this.closedTerminal() === null) {
      return Promise.resolve(sent);
    }
    return this.admit(validated);
  }

  private closedTerminal(): DataSendOutcome | null {
    if (this.closedOutcome) return this.closedOutcome;
    const terminal = this.peekTerminal();
    if (!terminal) return null;
    this.closedOutcome = Object.freeze({ kind: "terminal" as const, terminal });
    return this.closedOutcome;
  }

  private settleClosed(outcome: DataSendOutcome): Promise<DataSendOutcome> {
    this.lastAdmittedKey = null;
    this.pending = null;
    const waiters = this.waiters.splice(0);
    for (const waiter of waiters) waiter(outcome);
    return Promise.resolve(outcome);
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
        this.closedOutcome = outcome;
        for (const waiter of waiters) waiter(outcome);
        return outcome;
      }
      const closed = this.closedTerminal();
      if (closed) {
        this.lastAdmittedKey = null;
        for (const waiter of waiters) waiter(closed);
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
