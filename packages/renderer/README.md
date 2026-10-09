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

Render Store state is not exported as business authority and is never reverse-synchronized from DOM. Same-generation physical Data replacement preserves logical Renderer identity while requiring fresh current baseline where the relevant contract requires it; stale carrier callbacks are ignored.

`@loomrealm/renderer/resource-client` provides trusted logical Content resource access with expected-version checking. Physical bearer/path/endpoints stay hidden from business components.

`@loomrealm/renderer/browser-window` owns shared Browser Window realizations of `RendererInputSource` and `RendererViewportSource` used by Desktop/PWA products. Platform observation enters through narrow options and does not fork Input/Data semantics.

## Boundary rules

- Renderer owns readonly/current presentation replica, not Main control or Subsystem/Realm State business truth;
- DOM/custom elements own only private presentation state;
- Viewport observation does not become a new projection/business authority;
- package-private presentation helpers do not expand the root public API accidentally;
- product-specific host/browser concerns stay in concrete app/platform composition.

Qualification/currentness is subject-based; historical M8/M10/M11/M12/M13 labels are retained only in Git/legacy evidence, not as package status.
