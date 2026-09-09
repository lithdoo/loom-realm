import type { RenderNodeV1 } from "@loomrealm/data";

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

export interface RendererPresentationEffect {
  reevaluate(source: RendererPresentationSource): void;
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
