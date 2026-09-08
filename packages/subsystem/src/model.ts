import type { JsonValue } from "@loomrealm/wire";
import type { CreateInputListenerOptions, InputListener } from "./input.js";
import type { RenderDomain, RenderDomainState } from "./render.js";
import type { ContentClient } from "./content.js";

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
  readonly content: ContentClient;
  createInputListener(options: CreateInputListenerOptions): InputListener;
  createRenderDomain(initialState: RenderDomainState): RenderDomain;
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
