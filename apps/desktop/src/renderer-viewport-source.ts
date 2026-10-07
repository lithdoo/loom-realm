import type { RendererViewportSource } from "@loomrealm/renderer";
import { createBrowserRendererViewportSource } from "@loomrealm/renderer/browser-window";

export function createDesktopRendererViewportSource(target: Window): RendererViewportSource {
  return createBrowserRendererViewportSource(target);
}
