import type { MessageCarrier } from "@loomrealm/foundation";

/** Narrow deadline scheduling capability; it is not a general-purpose clock. */
export interface DeadlineScheduler {
  schedule(delayMs: number, callback: () => void): () => void;
}

/** Single-use Runtime Control establishment capability for one Launch Attempt. */
export interface RuntimeControlBinding {
  acquire(signal: AbortSignal): Promise<MessageCarrier>;
}
