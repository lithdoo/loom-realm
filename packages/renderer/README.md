# `@loomrealm/renderer`

Renderer owns the current Control/Data composition, Render replica, Viewport publication, trusted Presentation Event publication, resource access, and Web Presentation projection.

The `@loomrealm/renderer/resource-client` platform-integration subpath keeps version-checked resource access off the package root.

Current contracts are [Renderer Control v2](../../doc/15-contracts/main-renderer-control-v2.md), [Renderer Data Profile v3](../../doc/15-contracts/renderer-data-profile-v3.md), [Render Update v1](../../doc/15-contracts/render-update-v1.md), [Viewport State v1](../../doc/15-contracts/viewport-state-v1.md), and [Web Presentation API v3](../../doc/15-contracts/web-presentation-api-v3.md).

The package does not own physical Keyboard/Pointer/Gamepad collection, InputTarget, InputGate, or an `input.*` Data family. `@loomrealm/renderer/browser-window` exports only the shared Browser Window Viewport source. Device input components live in `@loomrealm-game/common-controls` and publish through the generic Presentation Event binding.

Render Store state remains readonly presentation authority. DOM/private component state is never reverse-synchronized into Main or Subsystem authority. Same-generation physical Data replacement preserves logical Renderer identity while each current child protocol establishes its required fresh baseline.
