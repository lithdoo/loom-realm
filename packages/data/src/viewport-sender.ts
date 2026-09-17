import type { DataSendOutcome, ViewportStateV1 } from "./model.js";
import type { DataRuntime } from "./runtime.js";
import { encodeForRole } from "./profile-codec.js";

type OutcomeWaiter = (outcome: DataSendOutcome) => void;

interface PendingLatest {
  message: ViewportStateV1;
  waiters: OutcomeWaiter[];
}

/**
 * Per-carrier bounded latest-state viewport publisher (Viewport State v1 §3).
 *
 * Invariants for the current carrier:
 * - at most ONE viewport unit is writer-admitted/in-flight on the shared FIFO
 *   writer at any time;
 * - at most ONE not-yet-admitted pending slot holds the LATEST legal size —
 *   every further observation overwrites it, so arbitrary resize bursts can
 *   never grow a queue, overflow the shared writer or starve Input/Render;
 * - already admitted units are never withdrawn or reordered (they enter the
 *   shared writer FIFO like any other child unit);
 * - after an admission settles, a pending size differing from the last
 *   admitted size is admitted next; an equal pending size is suppressed and
 *   its callers settle with `{kind:"sent"}` (their value is the last committed
 *   size); superseded callers settle with the outcome of the admission that
 *   replaced their value (bounded latest-wins convergence, Viewport v1 §3);
 * - local validation happens synchronously per call: an invalid message
 *   produces the shared `local-fatal` terminal through `runtime.send` and no
 *   bytes are emitted;
 * - terminal settles every outstanding caller exactly once with the terminal
 *   outcome (Promise resolve is idempotent).
 *
 * This class is internal to the Data package renderer role seam; the trusted
 * physical source (sampling/floor/rAF policy) stays in the Renderer product
 * composition. A fresh carrier gets a fresh sender: nothing migrates.
 */
export class ViewportSender {
  private readonly runtime: DataRuntime;
  private inFlight = false;
  private pending: PendingLatest | null = null;
  private lastAdmittedWidth = 0;
  private lastAdmittedHeight = 0;
  private settled = false;

  constructor(runtime: DataRuntime) {
    this.runtime = runtime;
    void runtime.terminal.then((terminal) => {
      this.settled = true;
      const outcome = Object.freeze({ kind: "terminal", terminal }) as DataSendOutcome;
      this.drainPending(outcome);
    });
  }

  sendState(message: ViewportStateV1): Promise<DataSendOutcome> {
    // Synchronous local validation: invalid trusted local input must produce
    // the local-fatal terminal deterministically without entering the merge.
    try {
      encodeForRole(message, "renderer");
    } catch {
      return this.runtime.send(message);
    }
    if (this.settled) return this.runtime.send(message);
    return new Promise<DataSendOutcome>((resolve) => {
      if (!this.inFlight) {
        // Nothing in flight: admit immediately, merging any microtask-gap
        // pending waiters so the newest observation still wins.
        const waiters: OutcomeWaiter[] = [];
        if (this.pending !== null) {
          waiters.push(...this.pending.waiters);
          this.pending = null;
        }
        waiters.push(resolve);
        this.pump(message, waiters);
        return;
      }
      if (this.pending === null) {
        this.pending = { message, waiters: [resolve] };
        return;
      }
      // Latest wins: overwrite the pending message, keep every waiter.
      this.pending.message = message;
      this.pending.waiters.push(resolve);
    });
  }

  private pump(message: ViewportStateV1, waiters: OutcomeWaiter[]): void {
    this.inFlight = true;
    this.lastAdmittedWidth = message.width;
    this.lastAdmittedHeight = message.height;
    void this.runtime.send(message).then((outcome) => {
      this.inFlight = false;
      for (const waiter of waiters) waiter(outcome);
      if (outcome.kind === "terminal") {
        this.settled = true;
        this.drainPending(outcome);
        return;
      }
      this.drain();
    });
  }

  private drain(): void {
    if (this.settled || this.inFlight || this.pending === null) return;
    const pending = this.pending;
    this.pending = null;
    if (
      pending.message.width === this.lastAdmittedWidth &&
      pending.message.height === this.lastAdmittedHeight
    ) {
      // Equal normalized size: suppress a duplicate wire unit; the latest
      // committed size already equals every waiting caller's value.
      for (const waiter of pending.waiters) waiter(Object.freeze({ kind: "sent" }));
      return;
    }
    this.pump(pending.message, pending.waiters);
  }

  private drainPending(outcome: DataSendOutcome): void {
    const pending = this.pending;
    this.pending = null;
    if (pending === null) return;
    for (const waiter of pending.waiters) waiter(outcome);
  }
}
