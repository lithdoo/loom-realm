export interface RendererViewportLogicalSample {
  readonly width: number;
  readonly height: number;
}

export interface RendererViewportSource {
  start(emit: (sample: RendererViewportLogicalSample) => void): () => void;
}
