export {
  prepareWebPresentationV1,
  validateWebPresentationConfigV1,
  type PreparedBootstrapResource,
  type PreparedWebPresentationV1,
  type ResolvedBootstrapResource,
  type WebPresentationConfigV1,
  type WebPresentationResourceRefV1,
} from "./internal/web-presentation-config.js";
export { bootstrapWebPresentation } from "./internal/web-presentation-bootstrap.js";
export {
  attachRendererPresentation,
  type DeepReadonly,
  type RendererPresentationEffect,
  type RendererPresentationNodeEvent,
  type RendererPresentationRenderEvent,
  type RendererPresentationSource,
  type RendererPresentationView,
} from "./internal/presentation-seam.js";
export {
  WebProjector,
  type RenderContextReceiver,
  type RenderDataReceiver,
  type RenderEventReceiver,
  type WebPresentationRenderEvent,
  type WebPresentationContext,
  type WebProjectorOptions,
} from "./internal/web-projector.js";
