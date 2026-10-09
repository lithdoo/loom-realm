# `@loomrealm/main` — package design

`@loomrealm/main` is the platform-neutral **Control Authority** implementation for one LoomRealm Session lifetime. System semantics are defined by [Architecture](../../doc/10-architecture/system-overview.md) and the formal Runtime/Frame/Renderer/Data contracts; this package document records only package-local realization and dependency boundaries.

## Public direction

`runMain()` consumes a narrow `MainPlatform` capability set for scheduling, opaque material, RuntimeHosting, optional Renderer Control binding, and optional DataConnection authority projection. Main does not consume Game Entry files, platform launch manifests, Hostra/PWA configuration, DOM, Node/Worker/WebSocket implementations, Realm State record values, or Content storage mechanics.

## Authority owned here

Main serializes and commits:

```text
Session lifecycle
Runtime lifecycle/currentness
Frame / stack / activation
InputTarget
Renderer logical currentness
DataAuthority / authority revision
failure unwind / terminal convergence
```

Realm State is a sibling authority. Subsystem business state/RenderDomain, Renderer replica, Content definitions, and platform physical hosting are not Main state.

## Dependency boundary

Allowed package-level dependencies are the platform-neutral runtime/control/renderer-control/wire/port seams required by implementation. Main must not depend on concrete game libraries/examples, `apps/*`, Hostra/PWA physical implementations, browser DOM, filesystem Content realization, or platform-specific executable resolution.

A physical platform MAY construct Main together with RealmStateAuthority and other capabilities, but composition does not become a third application authority.

## Invariants

- physical carrier acquisition does not itself establish logical Renderer/Data currentness;
- Data carrier loss does not create a new Session or reset unrelated authority;
- platform code cannot independently retry/rollback Main-owned control mutations;
- terminal/failure transitions converge through Main's existing unwind model;
- new observable semantics belong in formal contracts/ADR first, not only in this package file.

Current normative references: [Runtime Control v1](../../doc/15-contracts/runtime-control-profile-v1.md), [Frame / Call v1](../../doc/15-contracts/frame-call-protocol-v1.md), [Main ⇄ Renderer Control v1](../../doc/15-contracts/main-renderer-control-v1.md), [Renderer ⇄ Subsystem Data Connection v1](../../doc/15-contracts/renderer-subsystem-data-connection-v1.md), and [Realm State architecture](../../doc/10-architecture/realm-state-system.md).

Qualification/currentness follows [subject and staleness rules](../../doc/30-development/qualification.md); historical milestone labels are provenance only and are intentionally not maintained here.
