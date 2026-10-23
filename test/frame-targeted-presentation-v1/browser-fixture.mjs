export const gameEntryText = JSON.stringify({
  formatVersion: 1,
  initial: { subsystem: "world", input: null },
  subsystems: [{ key: "world" }, { key: "battle" }],
});

export const launchManifestText = JSON.stringify({
  formatVersion: 1,
  subsystems: [
    { key: "world", module: "subsystems/world.mjs" },
    { key: "battle", module: "subsystems/battle.mjs" },
  ],
});

export const presentation = Object.freeze({
  formatVersion: 1,
  scripts: Object.freeze([{ namespace: "Presentation", key: "frame-event-probe.browser.js" }]),
  styles: Object.freeze([]),
});

export const worldExecutable = `
export default (scope) => ({
  async frame(frame) {
    let domain;
    const listener = scope.presentationEvents.createListener({
      frame,
      channels: ["controls.event"]
    });
    listener.on("controls.event", (event) => {
      domain.update({
        nodes: [{
          key: "source",
          attrs: { set: { "data-world-delivered": JSON.stringify(event) } }
        }]
      });
    });
    domain = scope.createRenderDomain({
      zIndex: 0,
      roots: [{
        key: "source",
        tag: "lr-frame-event-source",
        attrs: { id: "frame-event-source" },
        data: {},
        children: []
      }]
    });
    await frame.call("battle", {});
    listener.close();
    domain.close();
    return { type: "cancelled" };
  }
});
`.trim();

export const battleExecutable = `
export default (scope) => ({
  async frame(frame) {
    let domain;
    const listener = scope.presentationEvents.createListener({
      frame,
      channels: ["controls.event"]
    });
    listener.on("controls.event", (event) => {
      domain.update({
        nodes: [{
          key: "target",
          attrs: { set: { "data-delivered": JSON.stringify(event) } }
        }]
      });
    });
    domain = scope.createRenderDomain({
      zIndex: 1,
      roots: [{
        key: "target",
        tag: "lr-frame-event-target",
        attrs: { id: "frame-event-target" },
        data: {},
        children: []
      }]
    });
    await new Promise((resolve) => frame.signal.addEventListener("abort", resolve, { once: true }));
    listener.close();
    domain.close();
    return { type: "cancelled" };
  }
});
`.trim();

export const presentationSource = `
class FrameEventSource extends HTMLElement {
  receiveRenderContext(context) {
    this.renderContext = context;
    this.dataset.contextReady = "true";
  }

  sendTopFrameEvent() {
    this.renderContext.emitCustomEvent(
      "input.event",
      { action: "down", button: "south", repeat: false },
      { broadcast: "top-frame", channel: "controls.event" }
    );
  }
}
customElements.define("lr-frame-event-source", FrameEventSource);
customElements.define("lr-frame-event-target", class extends HTMLElement {});
`.trim();

export const expectedPresentationEvent = Object.freeze({
  channel: "controls.event",
  name: "input.event",
  data: Object.freeze({ action: "down", button: "south", repeat: false }),
});
