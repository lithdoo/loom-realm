# `@loomrealm/renderer`

Renderer-side Control/Data integration, current presentation replica, input/viewport source integration, trusted resource access, and Web Presentation projection.

System authority and lifecycle are described by [Rendering Architecture](../../doc/10-architecture/rendering-system.md); exact protocol legality is defined by the formal [Renderer Data](../../doc/15-contracts/renderer-data-profile-v1.md), [User Input](../../doc/15-contracts/user-input-v1.md), [Render Update](../../doc/15-contracts/render-update-v1.md), [Viewport State](../../doc/15-contracts/viewport-state-v1.md), and [Web Presentation](../../doc/15-contracts/web-presentation-api-v1.md) contracts.

## Local realization

The package maintains one atomic current Control record and private per-subsystem Data slots. Each current slot can host role-local input gating, Render replica state, Viewport publication, and presentation reevaluation without becoming a second Main/Subsystem authority.

```text
current Control + Data identity
→ input/viewport role-local gates
→ Render registry/snapshot/patch commits
→ current replica
→ thin Web Projector
→ business-owned Web Components
```

Eligible `render.event` 不进入 retained replica。它在 current carrier handler 中经过 Store applicability 与完整 Web Presentation currentness gate 后，通过 optional `RendererPresentationEffect.deliverRenderEvent(...)` 同步投递到 exact live element 的 `receiveRenderEvent({ name, data })`。Event value 与 wire object 分离并 deep-frozen；receiver/effect throw 只属于 presentation-local failure。

若 receiver 内调用 `context.emitCustomEvent(...)`，合法 reverse input 会先在当前 forward callback scope 内 FIFO staging；callback return/throw 后才进入既有 bounded InputGate，避免同步 Subsystem business reentry。Store 不保留 Event history，也不 replay、retry 或建立 ACK/Result。

Render Store state is not exported as business authority and is never reverse-synchronized from DOM. Same-generation physical Data replacement preserves logical Renderer identity while requiring fresh current baseline where the relevant contract requires it; stale carrier callbacks are ignored.

`@loomrealm/renderer/resource-client` provides trusted logical Content resource access with expected-version checking. It stays off the package root and remains available only through the **platform-integration subpath**; physical bearer/path/endpoints stay hidden from business components.

`@loomrealm/renderer/browser-window` owns shared Browser Window realizations of `RendererInputSource` and `RendererViewportSource` used by Desktop/PWA products. Platform observation enters through narrow options and does not fork Input/Data semantics.

## Boundary rules

- Renderer owns readonly/current presentation replica, not Main control or Subsystem/Realm State business truth;
- DOM/custom elements own only private presentation state;
- Viewport observation does not become a new projection/business authority;
- package-private presentation helpers do not expand the root public API accidentally;
- product-specific host/browser concerns stay in concrete app/platform composition.

Qualification/currentness is subject-based; historical M8/M10/M11/M12/M13 labels are retained only in Git/legacy evidence, not as package status.
