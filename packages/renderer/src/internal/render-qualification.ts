import type { RenderStoreSnapshot } from "./render-store.js";

export const renderQualification = Symbol("loomrealm.renderer.render-qualification");

interface RenderQualificationTarget {
  [renderQualification](subsystemKey: string): RenderStoreSnapshot | null;
}

export function inspectRendererRenderForQualification(
  holder: object,
  subsystemKey: string,
): RenderStoreSnapshot | null {
  const inspect = (holder as Partial<RenderQualificationTarget>)[renderQualification];
  if (typeof inspect !== "function") throw new TypeError("Holder has no Render qualification seam");
  return inspect.call(holder, subsystemKey);
}
