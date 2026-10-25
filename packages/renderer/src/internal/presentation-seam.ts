import type { RenderEventV1, RenderNodeV1 } from "@loomrealm/data";

type JsonObject = RenderEventV1["data"];

export type DeepReadonly<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly (infer U)[]
    ? readonly DeepReadonly<U>[]
    : T extends object
      ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
      : T;

export interface PresentationDomainView {
  readonly domainId: string;
  readonly zIndex: number;
  readonly roots: readonly RenderNodeV1[];
}

export interface PresentationSubsystemView {
  readonly subsystemKey: string;
  readonly generation: number;
  readonly eligible: boolean;
  readonly domains: readonly PresentationDomainView[];
}

export interface RendererPresentationView {
  readonly sessionId: string;
  readonly subsystems: readonly PresentationSubsystemView[];
}

export interface RendererPresentationSource {
  read(): RendererPresentationView | null;
}

export interface RendererPresentationNodeEvent {
  readonly sessionId: string;
  readonly subsystemKey: string;
  readonly generation: number;
  readonly domainId: string;
  readonly targetKey: string;
  readonly name: unknown;
  readonly data: unknown;
  readonly options: unknown;
}

export interface RendererPresentationRenderEvent {
  readonly sessionId: string;
  readonly subsystemKey: string;
  readonly generation: number;
  readonly domainId: string;
  readonly targetKey: string;
  readonly name: string;
  readonly data: DeepReadonly<JsonObject>;
}

export interface RendererPresentationEffect {
  reevaluate(
    source: RendererPresentationSource,
    emitNodeEvent: (event: RendererPresentationNodeEvent) => void,
  ): void;
  deliverRenderEvent?(
    event: DeepReadonly<RendererPresentationRenderEvent>,
  ): void;
}

export const presentationAttachment = Symbol("loomrealm.renderer.presentation-attachment");

interface PresentationAttachable {
  [presentationAttachment](effect: RendererPresentationEffect): () => void;
}

export function attachRendererPresentation(holder: object, effect: RendererPresentationEffect): () => void {
  const attach = (holder as Partial<PresentationAttachable>)[presentationAttachment];
  if (typeof attach !== "function" || effect === null || typeof effect !== "object" || typeof effect.reevaluate !== "function") {
    throw new TypeError("Invalid Renderer presentation attachment");
  }
  return attach.call(holder, effect);
}
