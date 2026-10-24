import { defineSubsystem } from "@loomrealm/subsystem";

export default defineSubsystem((scope) => ({
  async frame(frame) {
    const inputHost = scope.createRenderDomain({
      zIndex: 0,
      roots: [{
        key: "game-controls-input",
        tag: "game-controls-input",
        attrs: {},
        data: {},
        children: [],
      }],
    });
    try {
      return await frame.call("map", frame.params);
    } finally {
      inputHost.close();
    }
  },
}));
