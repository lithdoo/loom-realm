# `@loomrealm/subsystem` — package design

`@loomrealm/subsystem` is the platform-neutral host/author boundary for Subsystem business execution. System ownership is defined by [Subsystem Architecture](../../doc/10-architecture/subsystem-model.md) and [Rendering Architecture](../../doc/10-architecture/rendering-system.md); this file records package-local author surface and implementation invariants.

## Consumer boundary

```text
Game logical subsystem key
→ Platform-selected Definition Module
→ RuntimeHosting / Runner
→ @loomrealm/subsystem/host
→ @loomrealm/subsystem author root
→ Business Definition
```

Business Definition code imports the author-facing `@loomrealm/subsystem` surface, not Runtime Control/Data/Wire carriers, platform ports, launch manifests, Hostra/PWA details, or framework internals.

## Author capabilities

The package projects frozen/shared runtime semantics into narrow business capabilities including:

- definition lifecycle / frame outcome;
- input listener/manager semantics;
- authoritative `RenderDomain` authoring, including existing-node update;
- readonly `ContentClient` access;
- session-scoped Realm State client access where composed by the host.

These capabilities do not create service locators, EventBus/Store frameworks, public RenderManager internals, retry/replay systems, or second copies of Main/Realm State/Render authority.

## Authority boundary

Subsystem owns domain execution, domain-local mutable state, input interest, and authoritative Render Domains. It does not own Session/Frame/InputTarget/DataAuthority, platform executable/host policy, Renderer replica, DOM presentation, or installation Content truth.

Render flow remains:

```text
business mutation
→ RenderDomain author operation
→ existing Render Update contract
→ Renderer current replica
```

Input flows through current Data/InputTarget/Activation/Interest/producer gates. Content remains readonly. Realm State remains a separate shared-business authority rather than hidden Subsystem local state.

## Package invariants

- protocol envelopes/carriers stay host/internal and do not leak into the author root;
- public author APIs express business intent, not physical transport mechanics;
- render authoring cannot bypass the authoritative Render Update stream;
- stale callbacks/completions cannot mutate a newer Runtime/Data/render identity;
- platform-specific composition remains outside this package.

Normative references: [Runtime Control](../../doc/15-contracts/runtime-control-profile-v1.md), [Frame / Call](../../doc/15-contracts/frame-call-protocol-v1.md), [Renderer Data Profile](../../doc/15-contracts/renderer-data-profile-v1.md), [User Input](../../doc/15-contracts/user-input-v1.md), [Render Update](../../doc/15-contracts/render-update-v1.md), [Content API](../../doc/15-contracts/content-api-v1.md), and [Realm State v1](../../doc/15-contracts/realm-state-v1.md).

Implementation/qualification history is recoverable from Git and legacy ledgers; this package document does not maintain milestone status.
