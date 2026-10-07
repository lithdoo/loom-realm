export interface PwaBundleContentEntryV1 {
  readonly kind: "record" | "group" | "resource";
  readonly namespace: string;
  readonly key: string;
  readonly mime: string;
  readonly body: Blob;
}

export interface PwaBundleExecutableEntryV1 {
  readonly logicalModule: string;
  readonly mime: "text/javascript" | "application/javascript";
  readonly body: Blob;
}

export interface PwaInstallationBundleV1 {
  readonly formatVersion: 1;
  readonly gameEntryText: string;
  readonly launchManifestText: string;
  readonly content: readonly PwaBundleContentEntryV1[];
  readonly executables: readonly PwaBundleExecutableEntryV1[];
}

export const DEMO_EXECUTABLE = `
export default (scope) => ({
  async frame(frame) {
    const content = await scope.content.record("struct.demo", "config");
    const key = { namespace: "demo", key: "visits" };
    const snapshot = await scope.state.read([key]);
    const current = snapshot.records[0];
    const visits = typeof current.value === "number" ? current.value + 1 : 1;
    await scope.state.commit({
      conditions: [{ key, version: current.version }],
      writes: [{ type: "put", key, value: visits }]
    });
    const domain = scope.createRenderDomain({
      zIndex: 0,
      roots: [{
        key: "demo-root",
        tag: "lr-demo-panel",
        attrs: {
          id: "loomrealm-demo",
          "data-content": content.value.message,
          "data-visits": String(visits),
          "data-viewport": "pending",
          "aria-label": "LoomRealm PWA demo"
        },
        data: { title: "LoomRealm PWA" },
        children: []
      }]
    });
    const stopViewport = scope.viewport.subscribe((viewport) => {
      if (viewport) domain.update({ nodes: [{ key: "demo-root", attrs: { set: { "data-viewport": viewport.width + "x" + viewport.height } } }] });
    });
    const input = scope.createInputListener({ frame, channels: ["keyboard.event"] });
    return await new Promise((resolve) => {
      const finish = (outcome) => {
        stopViewport();
        input.close();
        resolve(outcome);
      };
      input.on("keyboard.event", (event) => {
        if (event.action === "down" && event.code === "Enter") {
          finish({ type: "completed", value: { result: "demo-complete", visits, content: content.value.message } });
        }
      });
      frame.signal.addEventListener("abort", () => finish({ type: "cancelled" }), { once: true });
    });
  }
});
`.trim();

export const DEMO_PRESENTATION = Object.freeze({ formatVersion: 1, scripts: Object.freeze([]), styles: Object.freeze([]) });

export function createDemoInstallationBundle(): PwaInstallationBundleV1 {
  return Object.freeze({
    formatVersion: 1,
    gameEntryText: JSON.stringify({
      formatVersion: 1,
      state: { records: [{ namespace: "demo", key: "visits", value: 0 }] },
      initial: { subsystem: "demo", input: { source: "pwa" } },
      subsystems: [{ key: "demo" }],
    }),
    launchManifestText: JSON.stringify({
      formatVersion: 1,
      subsystems: [{ key: "demo", module: "subsystems/demo.mjs" }],
    }),
    content: Object.freeze([
      Object.freeze({ kind: "record", namespace: "struct.demo", key: "config", mime: "application/json; charset=utf-8", body: new Blob([JSON.stringify({ message: "ready" })], { type: "application/json; charset=utf-8" }) }),
      Object.freeze({ kind: "resource", namespace: "resource.demo", key: "hello.txt", mime: "text/plain; charset=utf-8", body: new Blob(["LoomRealm PWA"], { type: "text/plain; charset=utf-8" }) }),
    ]),
    executables: Object.freeze([
      Object.freeze({ logicalModule: "subsystems/demo.mjs", mime: "text/javascript", body: new Blob([DEMO_EXECUTABLE], { type: "text/javascript" }) }),
    ]),
  });
}
