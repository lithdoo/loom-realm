import type { JsonValue } from "@loomrealm/wire";

export interface FrameFailure {
  readonly code: string;
  readonly message?: string;
  readonly data?: JsonValue;
}

export type FrameOutcome<T extends JsonValue = JsonValue> =
  | { readonly type: "completed"; readonly value: T }
  | { readonly type: "cancelled" }
  | { readonly type: "failed"; readonly error: FrameFailure };

export interface RuntimeFailure {
  readonly code: string;
  readonly message?: string;
}

export interface Frame<TParams extends JsonValue = JsonValue> {
  readonly id: string;
  readonly params: TParams;
  readonly signal: AbortSignal;

  call<TResult extends JsonValue = JsonValue>(
    subsystem: string,
    params: JsonValue,
  ): Promise<FrameOutcome<TResult>>;
}

export interface SubsystemScope {
  readonly signal: AbortSignal;
}

export interface SubsystemDefinition {
  initialize?(): void | Promise<void>;
  frame(frame: Frame): FrameOutcome | Promise<FrameOutcome>;
  shutdown?(): void | Promise<void>;
  failed?(error: RuntimeFailure): void | Promise<void>;
}

export type SubsystemDefinitionFactory = (
  scope: SubsystemScope,
) => SubsystemDefinition;

export function defineSubsystem(
  factory: SubsystemDefinitionFactory,
): SubsystemDefinitionFactory {
  if (typeof factory !== "function") {
    throw new TypeError("Subsystem definition factory must be a function");
  }
  return factory;
}
