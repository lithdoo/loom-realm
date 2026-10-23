export const gameEntryText = JSON.stringify({
  formatVersion: 1,
  initial: { subsystem: "game", input: null },
  subsystems: [{ key: "game" }],
});

export const launchManifestText = JSON.stringify({
  formatVersion: 1,
  subsystems: [{ key: "game", module: "subsystems/game.mjs" }],
});

export const presentation = Object.freeze({
  formatVersion: 1,
  scripts: Object.freeze([{ namespace: "Presentation", key: "frame-event-probe.browser.js" }]),
  styles: Object.freeze([]),
});

export const executable = `
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
          key: "probe",
          attrs: { set: { "data-delivered": JSON.stringify(event) } }
        }]
      });
    });
    domain = scope.createRenderDomain({
      zIndex: 0,
      roots: [{
        key: "probe",
        tag: "lr-frame-event-probe",
        attrs: { id: "frame-event-probe" },
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
class FrameEventProbe extends HTMLElement {
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
customElements.define("lr-frame-event-probe", FrameEventProbe);
`.trim();

export const expectedPresentationEvent = Object.freeze({
  channel: "controls.event",
  name: "input.event",
  data: Object.freeze({ action: "down", button: "south", repeat: false }),
});
