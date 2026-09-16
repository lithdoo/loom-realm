import type { RenderEventV1, RenderNodeV1 } from "@loomrealm/data";
import type { JsonValue } from "@loomrealm/wire";

export type RenderNode = RenderNodeV1;

export interface RenderDomainState {
  readonly zIndex: number;
  readonly roots: readonly RenderNode[];
}

export interface RenderEvent {
  readonly targetKey: string;
  readonly name: string;
  readonly data: RenderEventV1["data"];
}

interface RenderStringDelta {
  readonly set?: Readonly<Record<string, string>>;
  readonly remove?: readonly string[];
}

interface RenderDataDelta {
  readonly set?: Readonly<Record<string, JsonValue>>;
  readonly remove?: readonly string[];
}

interface RenderNodeUpdate {
  readonly key: string;
  readonly attrs?: RenderStringDelta;
  readonly data?: RenderDataDelta;
}

export interface RenderDomainUpdate {
  readonly zIndex?: number;
  readonly nodes?: readonly RenderNodeUpdate[];
}

export interface RenderDomain {
  replace(state: RenderDomainState): void;
  update(update: RenderDomainUpdate): void;
  emit(event: RenderEvent): void;
  close(): void;
}
