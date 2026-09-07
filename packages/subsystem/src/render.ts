import type { RenderEventV1, RenderNodeV1 } from "@loomrealm/data";

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

export interface RenderDomain {
  replace(state: RenderDomainState): void;
  emit(event: RenderEvent): void;
  close(): void;
}
