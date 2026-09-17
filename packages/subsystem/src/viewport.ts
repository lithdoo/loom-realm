/**
 * Author-facing Viewport capability (Viewport State v1 §6).
 *
 * Runtime-scoped readonly retained observation of the current Renderer
 * logical presentation surface. `current` starts `null`, reflects the last
 * successfully accepted legal observation (getter updates before listener
 * callbacks), and never proves paintability of the current Renderer.
 * Snapshots are detached/immutable. `subscribe` synchronously delivers the
 * current value (including `null`) exactly once while the Runtime is alive;
 * after Runtime terminal it returns an inert idempotent unsubscribe without
 * invoking the listener.
 */
export interface ViewportSize {
  readonly width: number;
  readonly height: number;
}

export interface Viewport {
  readonly current: ViewportSize | null;
  subscribe(listener: (value: ViewportSize | null) => void): () => void;
}
