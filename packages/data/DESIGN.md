# `@loomrealm/data`

`@loomrealm/data` implements the transport-independent mechanics for [Renderer Data Profile v3](../../doc/15-contracts/renderer-data-profile-v3.md), identity `loomrealm.renderer-data/3`.

The closed profile contains:

```text
Subsystem → Renderer: render.domains, render.snapshot, render.patch, render.event, presentation.interest
Renderer → Subsystem: viewport.state, presentation.event
```

Each peer validates its trusted binding before claiming a reader, owns one ordered reader and one serialized writer, enforces Wire limits and exact direction, and terminates first-wins. Fresh peers inherit no reader, writer, Render, or Viewport cursor.

Presentation Event is Frame-targeted transient delivery, not restored Framework User Input. This package exports no Keyboard/Pointer/Gamepad payload, Input Interest, retained State, or reset capability. Device protocols remain business-owned.
