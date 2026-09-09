import type { PreparedWebPresentationV1 } from "./web-presentation-config.js";

function loadElement<T extends HTMLElement>(parent: HTMLElement, element: T): Promise<void> {
  return new Promise((resolve, reject) => {
    element.addEventListener("load", () => resolve(), { once: true });
    element.addEventListener("error", () => reject(new Error("Web presentation bootstrap resource failed")), { once: true });
    parent.append(element);
  });
}

function loaded(window: Window): Promise<void> {
  if (window.document.readyState === "complete") return Promise.resolve();
  return new Promise((resolve) => window.addEventListener("load", () => resolve(), { once: true }));
}

export async function bootstrapWebPresentation(
  window: Window,
  prepared: PreparedWebPresentationV1,
  startPresentation: () => void,
): Promise<void> {
  if (typeof startPresentation !== "function") throw new TypeError("Invalid presentation start callback");
  const { document } = window;
  const head = document.head;
  let evaluationFailure: unknown;
  const onWindowError = (event: ErrorEvent) => { evaluationFailure ??= event.error ?? new Error(event.message); };
  window.addEventListener("error", onWindowError);
  try {
    for (const resource of prepared.styles) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = resource.browserSource;
      await loadElement(head, link);
    }
    for (const resource of prepared.scripts) {
      const script = document.createElement("script");
      script.async = false;
      script.src = resource.browserSource;
      await loadElement(head, script);
      if (evaluationFailure !== undefined) throw evaluationFailure;
    }
    await loaded(window);
    if (evaluationFailure !== undefined) throw evaluationFailure;
    startPresentation();
  } finally {
    window.removeEventListener("error", onWindowError);
  }
}
