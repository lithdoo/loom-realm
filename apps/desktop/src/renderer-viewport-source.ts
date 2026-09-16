import type { RendererViewportLogicalSample, RendererViewportSource } from "@loomrealm/renderer";

export function createDesktopRendererViewportSource(target: Window): RendererViewportSource {
  if (target === null || typeof target !== "object") throw new TypeError("Invalid Desktop viewport Window");
  const document = target.document;
  const addWindow = target.addEventListener.bind(target);
  const removeWindow = target.removeEventListener.bind(target);
  const addDocument = document.addEventListener.bind(document);
  const removeDocument = document.removeEventListener.bind(document);
  const requestFrame = target.requestAnimationFrame.bind(target);
  const cancelFrame = target.cancelAnimationFrame.bind(target);
      let subscribed = false;

  return Object.freeze({
    start(emit: (sample: RendererViewportLogicalSample) => void): () => void {
      if (typeof emit !== "function") throw new TypeError("Invalid Desktop viewport sink");
      if (subscribed) throw new TypeError("Desktop viewport source already started");
      subscribed = true;
      let active = true;
      let animationFrame: number | null = null;
      let lastWidth: number | null = null;
      let lastHeight: number | null = null;

      const sample = (force: boolean): void => {
        if (!active) return;
        const width = target.innerWidth;
        const height = target.innerHeight;
        if (!force && lastWidth === width && lastHeight === height) return;
        lastWidth = width;
        lastHeight = height;
        emit(Object.freeze({ width, height }));
      };

      const schedule = (): void => {
        if (!active || animationFrame !== null) return;
        animationFrame = requestFrame(() => {
          animationFrame = null;
          sample(false);
        });
      };

      const onVisibility = (): void => {
        if (!active) return;
        if (document.visibilityState === "visible") sample(true);
      };

      sample(true);
      addWindow("resize", schedule);
      addDocument("visibilitychange", onVisibility);

      return () => {
        if (!active) return;
        active = false;
        subscribed = false;
        if (animationFrame !== null) {
          cancelFrame(animationFrame);
          animationFrame = null;
        }
        removeWindow("resize", schedule);
        removeDocument("visibilitychange", onVisibility);
      };
    },
  });
}
