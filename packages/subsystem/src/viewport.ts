export interface ViewportSize {
  readonly width: number;
  readonly height: number;
}

export type ViewportListener = (value: ViewportSize | null) => void | Promise<void>;

export interface Viewport {
  readonly current: ViewportSize | null;
  subscribe(listener: ViewportListener): () => void;
}
