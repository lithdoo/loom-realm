import type {
  OpaqueMaterialGenerator,
  RendererControlBinding,
  DeadlineScheduler,
  RuntimeHosting,
} from "@loomrealm/platform-ports";
import type { JsonValue } from "@loomrealm/wire";

export interface LogicalGameBootstrap {
  readonly subsystemKeys: readonly string[];
  readonly initial: {
    readonly subsystemKey: string;
    readonly input: JsonValue;
  };
}

/** Narrow capability view consumed by Main from one prepared concrete Platform. */
export interface MainPlatform {
  readonly scheduler: DeadlineScheduler;
  readonly opaqueMaterial: OpaqueMaterialGenerator;
  readonly runtimeHosting: RuntimeHosting;
  readonly rendererControl?: RendererControlBinding;
}

export interface MainPolicy {
  readonly runtimeBootstrapDeadlineMs: number;
  readonly frameDeadlineMs: number;
  readonly shutdownDeadlineMs: number;
  readonly terminationDeadlineMs: number;
}

export interface MainFrameFailure {
  readonly code: string;
  readonly message?: string;
  readonly data?: JsonValue;
}

export type MainFrameOutcome =
  | { readonly type: "completed"; readonly value: JsonValue }
  | { readonly type: "cancelled" }
  | { readonly type: "failed"; readonly error: MainFrameFailure };

export type MainSessionResult =
  | { readonly kind: "root-outcome"; readonly outcome: MainFrameOutcome }
  | { readonly kind: "shutdown" };

export interface MainRuntimeFailure {
  readonly code: string;
  readonly message?: string;
  readonly subsystemKey?: string;
}

export interface RunMainOptions {
  readonly bootstrap: LogicalGameBootstrap;
  readonly platform: MainPlatform;
  readonly policy: MainPolicy;
  readonly signal?: AbortSignal;
}
