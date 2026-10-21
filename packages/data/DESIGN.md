# `@loomrealm/data`

`@loomrealm/data` implements the transport-independent mechanics for [Renderer Data Profile v2](../../doc/15-contracts/renderer-data-profile-v2.md), identity `loomrealm.renderer-data/2`.

The closed profile contains:

```text
Subsystem → Renderer: render.domains, render.snapshot, render.patch, render.event
Renderer → Subsystem: viewport.state
```

Each peer validates its trusted binding before claiming a reader, owns one ordered reader and one serialized writer, enforces Wire limits and exact direction, and terminates first-wins. Fresh peers inherit no reader, writer, Render, or Viewport cursor.

User Input is not a Data child in v2. This package exports no input codec, input peer, Keyboard/Pointer/Gamepad payload, Input Interest, or reset capability. Those device protocols belong to [Game Common Controls Input v1](../../doc/15-contracts/game-common-controls-input-v1.md).
