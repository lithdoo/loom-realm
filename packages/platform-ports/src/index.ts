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
 * Supplies fresh ASCII opaque material (1..128 bytes, at least 128 bits of
 * unpredictability for security-sensitive use). The generator owns no
 * identity or credential authority and must not interpret the result.
 */
export interface OpaqueMaterialGenerator {
  generate(): string;
}

/** Arms one slot for the next physical Renderer Control candidate. */
export interface RendererControlBinding {
  acquire(
    rendererControlToken: string,
    signal: AbortSignal,
  ): Promise<MessageCarrier>;
}

/** Supplies the Renderer endpoint of one Platform-prepared current Data pair. */
export interface RendererDataBinding {
  acquire(
    subsystemKey: string,
    generation: number,
    dataProfile: string,
    signal: AbortSignal,
  ): Promise<MessageCarrier>;
}

/** Exact authority tuple accompanying the Subsystem endpoint of a Data pair. */
export interface SubsystemDataBindingResult {
  readonly carrier: MessageCarrier;
  readonly generation: number;
  readonly dataProfile: string;
}

/** Runtime-scoped capability for acquiring a Platform-prepared current Data pair. */
export interface SubsystemDataBinding {
  acquire(signal: AbortSignal): Promise<SubsystemDataBindingResult>;
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

/** One Main-committed Data installation authority fact for a physical Runtime. */
export interface DataConnectionAuthorityEntry {
  readonly subsystemKey: string;
  readonly generation: number;
  readonly dataProfile: string;
  readonly runtime: HostedRuntime;
}

/** Complete current Renderer Data installation authority snapshot. */
export interface DataConnectionAuthorityView {
  readonly rendererControlToken: string;
  readonly entries: readonly DataConnectionAuthorityEntry[];
}

/** Synchronous full-replacement feed from Main into one concrete Platform. */
export interface DataConnectionAuthoritySink {
  replace(view: DataConnectionAuthorityView | null): void;
}

/** Physical Runtime creation capability exposed by a prepared Platform. */
export interface RuntimeHosting {
  launch(
    request: RuntimeLaunchRequest,
    signal: AbortSignal,
  ): Promise<HostedRuntime>;
}
