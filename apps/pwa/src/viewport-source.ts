import type { RendererViewportLogicalSample, RendererViewportSource } from "@loomrealm/renderer";

export function createPwaViewportSource(target: Window): RendererViewportSource {
  let started = false;
  return Object.freeze({
    start(emit: (sample: RendererViewportLogicalSample) => void): () => void {
      if (started || typeof emit !== "function") throw new TypeError("Invalid PWA viewport source start");
      started = true;
      let active = true;
      let frame: number | null = null;
      let prior = "";
      const sample = () => {
        if (!active) return;
        const width = Math.max(1, Math.round(target.innerWidth));
        const height = Math.max(1, Math.round(target.innerHeight));
        const identity = `${width}x${height}`;
        if (identity === prior) return;
        prior = identity;
        emit(Object.freeze({ width, height }));
      };
      const schedule = () => {
        if (frame !== null) return;
        frame = target.requestAnimationFrame(() => { frame = null; sample(); });
      };
      sample();
      target.addEventListener("resize", schedule);
      target.document.addEventListener("visibilitychange", sample);
      return () => {
        if (!active) return;
        active = false; started = false;
        if (frame !== null) target.cancelAnimationFrame(frame);
        target.removeEventListener("resize", schedule);
        target.document.removeEventListener("visibilitychange", sample);
      };
    },
  });
}
