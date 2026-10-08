import type { KeyboardCodeV1 } from "@loomrealm/data";
import type { RendererInputSource } from "@loomrealm/renderer";
import { createBrowserRendererInputSource } from "@loomrealm/renderer/browser-window";

export function createDesktopRendererInputSource(target: Window): RendererInputSource {
  return createBrowserRendererInputSource(target, {
    onKeyboardCapture(code: KeyboardCodeV1, at: number) {
      if (code !== "ArrowUp" && code !== "ArrowDown" && code !== "ArrowLeft" && code !== "ArrowRight") return;
      const hook = (target as Window & { __loomrealmMovementQualification?: unknown }).__loomrealmMovementQualification;
      if (typeof hook === "function") hook({ name: "input-captured", at, detail: { code } });
    },
  });
}
