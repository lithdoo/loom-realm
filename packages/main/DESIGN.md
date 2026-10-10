# `@loomrealm/main` — package design

`@loomrealm/main` is the platform-neutral **Control Authority** implementation for one LoomRealm Session lifetime. System semantics are defined by [Architecture](../../doc/10-architecture/system-overview.md) and the formal Runtime/Frame/Renderer/Data contracts; this package document records package-local realization, currentness mechanics and dependency boundaries.

## Public direction

`runMain()` consumes a narrow `MainPlatform` capability set for scheduling/opaque material, Runtime hosting, optional Renderer Control binding and optional physical Data authority projection. Concrete Hostra/PWA composition supplies those capabilities outside this package.

Main does **not** consume Game Entry files, platform launch manifests, Hostra/PWA configuration, DOM APIs, filesystem Content realization or concrete Node/Worker/WebSocket/MessagePort implementations. Platform PREPARE resolves those physical concerns before/during composition and presents Main only with the capabilities required by the formal logical contracts.

Realm State is a sibling authority composed for the same Session; Main does not own Realm State record values or versions.

## Authority owned here

One Main Session runtime serializes and commits:

```text
Session lifecycle / terminal state
Runtime lifecycle and currentness
Frame / stack / activation
InputTarget
Renderer logical candidate/current participant
Renderer revision / control projection
DataAuthority derived from committed current facts
failure unwind / terminal convergence
```

Subsystem business state/RenderDomain, Realm State records, Renderer replica/DOM state, Content definitions and platform physical hosting are not Main state.

## Runtime bootstrap realization

The package consumes an already validated logical bootstrap and establishes one required Runtime record per logical subsystem. The package-local sequence is conceptually:

```text
logical subsystem entry
→ allocate fresh runtime bootstrap material
→ RuntimeHosting.launch(...)
→ retain HostedRuntime as a physical fact/capability
→ acquire/authenticate Runtime Control
→ identify / initialize / ready
→ expose only committed ready-derived facts to later Main projections
```

`HostedRuntime` is not a public application identity and does not become game-visible state. Main does not add a second executable resolver or platform-specific launch registry.

## Frame / activation realization

Frame and Activation facts remain part of the single Main mutation order. Public Frame/Call semantics follow the formal contract: ACK/publication order, post-commit behavior, ambiguous mutation failure and suffix unwind are not reimplemented by platform adapters.

Input delivery is derived from the currently committed InputTarget/Activation facts. A physical input source or Data connection cannot invent a new target outside Main's authority.

Renderer/Data physical failures do not retroactively rewrite an already accepted Frame outcome. Where failure affects Main-owned currentness, the transition goes through the same Main mutation/failure model rather than through an independent platform recovery state machine.

## Renderer logical currentness

Main distinguishes candidate credentials/physical carriers from the accepted logical Renderer participant.

```text
candidate/control acquisition
→ credential/currentness checks
→ accepted current Renderer
→ committed Renderer projection/revision
```

A candidate token/material is consumed as authentication material and cannot be reused to create a second logical participant. Any retained correlation value exists only as private package state required to project the current physical Data authority; it is not a second Renderer registry and is dropped when the participant/session is retired.

Reload semantics and physical binding are product concerns, but Main's rule is stable: a genuinely new logical Renderer participant replaces the previous participant through the normal currentness transition. A same-generation Data-only physical replacement does not by itself create a new logical Renderer.

## DataAuthority / physical projection

Logical DataAuthority is derived from committed Main facts (current Renderer + ready Runtime/subsystem generation/profile facts). Platform Data binding receives a projection of that authority together with the minimum physical correlation material needed to provision the carrier.

Important invariants:

- physical carrier acquisition does not itself establish logical Renderer/Data currentness;
- physical Data loss/replacement does not create a new Session or reset unrelated Runtime/Frame state;
- platform Data brokers do not own candidate/current application truth;
- physical bookkeeping alone does not bump Renderer-visible revision;
- stale platform callbacks cannot reinstall retired authority.

The exact physical listener/socket/MessagePort topology remains platform-owned and is intentionally absent from this package design.

## Terminal / failure convergence

Session terminal state is singular. Runtime fatal conditions, Main fatal conditions, cancellation and platform-triggered shutdown converge through the existing Main unwind/terminal path. Platform code may initiate/observe termination through its capability boundary, but it cannot independently retry or roll back Main-owned control mutations.

Cleanup is designed to be idempotent with respect to repeated physical shutdown signals/callbacks. Once the Session is terminal, late Runtime/Renderer/Data callbacks have no authority to recreate current state.

## Dependency boundary

Allowed package-level dependencies are the platform-neutral runtime/control/renderer-control/wire/port seams required by implementation. Main must not depend on:

```text
concrete game libraries or examples
apps/* / Hostra / PWA implementations
browser DOM
filesystem Content realization
platform-specific executable resolution
Realm State record implementation details
```

A concrete platform MAY construct Main together with RealmStateAuthority, RuntimeHosting and other capabilities, but composition does not become a third application authority.

## Package invariants

- one Session lifetime has one Main Control Authority;
- logical currentness is established by Main mutations, not by physical connection existence;
- Runtime/Frame/InputTarget/Renderer/DataAuthority facts are not duplicated into platform registries;
- stale callbacks/completions cannot mutate a newer Session/Runtime/Renderer identity;
- terminal/failure transitions converge through Main's existing unwind model;
- new observable semantics belong in formal contracts/ADR first, not only in this package file.

Current normative references: [Runtime Control v1](../../doc/15-contracts/runtime-control-profile-v1.md), [Frame / Call v1](../../doc/15-contracts/frame-call-protocol-v1.md), [Main ⇄ Renderer Control v1](../../doc/15-contracts/main-renderer-control-v1.md), [Renderer ⇄ Subsystem Data Connection v1](../../doc/15-contracts/renderer-subsystem-data-connection-v1.md), and [Realm State architecture](../../doc/10-architecture/realm-state-system.md).

Qualification/currentness follows [subject and staleness rules](../../doc/30-development/qualification.md); historical milestone labels are provenance only and are intentionally not maintained here.