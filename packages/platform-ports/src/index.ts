import type { MessageCarrier } from "@loomrealm/foundation";

/** Narrow deadline scheduling capability; it is not a general-purpose clock. */
export interface DeadlineScheduler {
  schedule(delayMs: number, callback: () => void): () => void;
}

/**
 * Subsystem-side, single-use Runtime Control establishment capability for one
 * Launch Attempt.
 */
export interface RuntimeControlBinding {
  acquire(signal: AbortSignal): Promise<MessageCarrier>;
}

/**
 * Supplies fresh high-entropy opaque bootstrap token material when Main asks
 * to create a Launch Attempt credential. The generator owns no token
 * authority: it must not register, bind, consume, or interpret the result.
 */
export interface BootstrapTokenGenerator {
  generate(): string;
}

/**
 * Narrow projection of one Main-owned Launch Attempt into physical Runtime
 * hosting. It intentionally contains no executable or platform-specific data.
 */
export interface RuntimeLaunchRequest {
  readonly subsystemKey: string;
  readonly bootstrapToken: string;
}

/**
 * Main-side, single-use Runtime Control establishment capability for exactly
 * one HostedRuntime lifetime.
 */
export interface MainRuntimeControlBinding {
  acquire(signal: AbortSignal): Promise<MessageCarrier>;
}

/**
 * Capabilities and facts that belong to one already-created physical Runtime.
 */
export interface HostedRuntime {
  readonly runtimeControl: MainRuntimeControlBinding;

  /** Resolves only after the physical Runtime has actually terminated. */
  readonly terminated: Promise<void>;

  /** Requests physical termination; resolution does not itself mean stopped. */
  requestTermination(signal: AbortSignal): Promise<void>;
}

/** Physical Runtime creation capability exposed by a prepared Platform. */
export interface RuntimeHosting {
  launch(
    request: RuntimeLaunchRequest,
    signal: AbortSignal,
  ): Promise<HostedRuntime>;
}
