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
  type RendererPresentationEffect,
  type RendererPresentationSource,
  type RendererPresentationView,
} from "./internal/presentation-seam.js";
export { WebProjector, type WebProjectorOptions } from "./internal/web-projector.js";
