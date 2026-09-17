import type { RendererViewportSource } from "@loomrealm/renderer";

/**
 * Desktop/PWA product physical composition for Viewport State v1: the
 * designated stable logical presentation surface is the document layout
 * viewport, observed through `Window.innerWidth/innerHeight` in CSS logical
 * pixels. This is a product choice, not a Core protocol requirement.
 *
 * - initial sample is emitted on start;
 * - `resize` re-samples; DPR-only changes keep identical CSS logical sizes
 *   and are suppressed downstream as equal observations;
 * - `visibilitychange` returning to `visible` performs a recovery resample
 *   (hidden->visible geometry may have changed while listeners were inert);
 * - stop removes both listeners exactly once.
 */
export function createDesktopRendererViewportSource(target: Window): RendererViewportSource {
  if (target === null || typeof target !== "object") throw new TypeError("Invalid Desktop viewport Window");
  const document = target.document;
  const addWindow = target.addEventListener.bind(target);
  const removeWindow = target.removeEventListener.bind(target);
  const addDocument = document.addEventListener.bind(document);
  const removeDocument = document.removeEventListener.bind(document);
  let subscribed = false;

  return Object.freeze({
    start(emit: (sample: { readonly width: number; readonly height: number }) => void): () => void {
      if (typeof emit !== "function") throw new TypeError("Invalid Desktop viewport sink");
      if (subscribed) throw new TypeError("Desktop viewport source already started");
      subscribed = true;
      let active = true;

      const sample = (): void => {
        if (active) emit({ width: target.innerWidth, height: target.innerHeight });
      };
      const onVisibility = (): void => {
        if (document.visibilityState === "visible") sample();
      };

      addWindow("resize", sample);
      addDocument("visibilitychange", onVisibility);
      sample();

      return () => {
        if (!active) return;
        active = false;
        subscribed = false;
        removeWindow("resize", sample);
        removeDocument("visibilitychange", onVisibility);
      };
    },
  });
}
