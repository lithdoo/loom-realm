# `@loomrealm/subsystem` — package design

`@loomrealm/subsystem` is the platform-neutral host/author boundary for Subsystem business execution. System ownership is defined by [Subsystem Architecture](../../doc/10-architecture/subsystem-model.md) and [Rendering Architecture](../../doc/10-architecture/rendering-system.md); this file records package-local author surface, construction/lifecycle realization and invariants.

## Consumer boundary

```text
Game logical subsystem key
→ Platform-selected Definition Module
→ RuntimeHosting / Runner
→ @loomrealm/subsystem/host
→ @loomrealm/subsystem author root
→ Business Definition
```

Business Definition code imports the author-facing `@loomrealm/subsystem` surface, not Runtime Control/Data/Wire carriers, platform ports, launch manifests, Hostra/PWA details or framework internals.

## Author capabilities

The package projects frozen/shared runtime semantics into narrow business capabilities including:

- definition lifecycle / `Frame` / `FrameOutcome`;
- input listeners and input mutation gating;
- authoritative `RenderDomain` authoring, including complete replacement and existing-node update;
- readonly `ContentClient` access;
- session-scoped Realm State client access where composed by the host;
- readonly current viewport facts where the current Renderer Data profile provides them.

These capabilities do not create service locators, EventBus/Store frameworks, public RenderManager internals, retry/replay systems, generic Entity systems or second copies of Main/Realm State/Render authority.

## Construction / bootstrap realization

The host builds one coherent author scope around the current Runtime identity. The package-local sequence is conceptually:

```text
validate Definition Module ABI
→ construct role-local managers/adapters
   - Input manager
   - Render manager
   - Content client binding
   - Realm State client binding when available
   - Viewport/current Data projection
→ create one SubsystemScope backed by those managers
→ invoke the Definition factory
→ create/bind Frame runtime facts
→ acquire Runtime Control / Data according to host profile
→ initialize definition
→ report ready
```

Construction is late-bound only where required to break the real Frame/Definition ordering dependency. It must not introduce a dummy Frame, shadow authority registry or service locator.

A Definition module does not become Runtime-current merely because it was imported. Physical module path, Worker/process identity and logical Runtime identity remain distinct.

## Frame-local facts

The author `Frame` remains a narrow business context:

```text
id
params
signal
call(...)
```

Main owns public Frame/Activation authority. Inside the Subsystem process, the package's Frame runtime is the local projection used to decide whether a business mutation/input callback still belongs to the current Frame/Activation.

Input gating consults those current local facts rather than copying the Main Frame state machine. Frame close/cancellation invalidates late callbacks and ensures listener cleanup before retired work can mutate newer state.

RenderDomain lifetime is not redefined as “one Domain per Frame”. A Domain is an author capability created by the Subsystem and explicitly closed by its owner; package cleanup still guarantees that terminal Runtime shutdown cannot leave active author mutation paths behind.

## Input realization

Input arrives only through the current Renderer/Data/InputTarget/Activation/Interest chain. Author handlers see channel payloads, not protocol envelopes, frame/activation wire IDs or physical carrier identity.

Key invariants:

- a frozen production seam is not bypassed by a test-only direct callback path;
- stale Data/currentness callbacks cannot deliver mutations to a newer Runtime/Frame identity;
- state/event ordering and mutation-gate rules stay owned by the formal User Input contract;
- platform-specific input acquisition stays outside this package.

## RenderDomain realization

Subsystem owns authoritative Render Domains. Business mutation flows:

```text
business state change
→ RenderDomain author operation
→ package-local RenderManager validation/authoritative commit
→ existing Render Update protocol
→ Renderer current replica
```

The author-facing Domain supports the current narrow operations needed by game libraries: complete authoritative replacement, existing-node update, author event emission where defined, and close. It does not expose domain IDs, wire revisions, carrier/send results, Renderer Store state or publication acknowledgements as business APIs.

Durable rules:

- complete topology changes are expressed as a complete candidate/replace, not as hidden incremental node creation;
- existing-node `update` only mutates already current nodes and preserves Render Update v1 semantics;
- deterministic validation/capacity failure occurs before mutating the current Domain candidate;
- a failed authoritative mutation is not reported as success and cannot leave business code believing an uncommitted candidate is current;
- consumed/retired node identity follows the RenderManager's no-resurrection rules;
- Renderer/DOM presentation never becomes a second source of RenderDomain truth.

Package-private validation/serialization optimizations are permitted only when they remain behaviorally equivalent to the formal/bounded data model and keep failure atomicity/current snapshot immutability.

## Content / Realm State / Viewport

`ContentClient` is readonly logical installation access. It does not expose filesystem paths, installation mutators or platform credentials to business code.

Realm State is a separate session-shared mutable business authority. The Subsystem client consumes that authority; it must not silently mirror shared records into a competing local store or treat Render state as Realm State.

Viewport is a readonly current presentation/environment fact delivered through the current Data identity. It can influence business projection/layout where the game library chooses, but it does not create a second Input/Render/Data connection or become Main authority.

## Cancellation / terminal cleanup

Runtime cancellation/terminal state invalidates new author mutations and late asynchronous completions. Package-owned listeners/subscriptions/domains/connections are retired through the host's bounded cleanup path. Cleanup must be idempotent and must not reopen physical acquisition after the Runtime is terminal.

A package-local error cannot be hidden by inventing a retry/recovery framework that changes formal failure semantics. Where an operation is defined as fatal, the host maps it through the existing Runtime failure path.

## Dependency boundary

Author code sees only the public author root. Package implementation may depend on the existing shared runtime/data/wire/port packages needed to realize the role, but must not leak those protocol/carrier objects through the author root.

The package must not depend on concrete game examples, `apps/*`, Hostra/PWA physical implementations, filesystem storage or platform-specific executable resolution.

## Package invariants

- Subsystem owns domain execution, local business state and authoritative Render Domains;
- Main Session/Frame/InputTarget/DataAuthority are not duplicated here;
- Realm State shared records remain a sibling authority;
- protocol envelopes/carriers stay host/internal and do not leak into the author root;
- public author APIs express business intent, not physical transport mechanics;
- stale callbacks/completions cannot mutate a newer Runtime/Data/render identity;
- platform-specific composition remains outside this package.

Normative references: [Runtime Control](../../doc/15-contracts/runtime-control-profile-v1.md), [Frame / Call](../../doc/15-contracts/frame-call-protocol-v1.md), [Renderer Data Profile](../../doc/15-contracts/renderer-data-profile-v1.md), [User Input](../../doc/15-contracts/user-input-v1.md), [Render Update](../../doc/15-contracts/render-update-v1.md), [Content API](../../doc/15-contracts/content-api-v1.md), and [Realm State v1](../../doc/15-contracts/realm-state-v1.md).

Implementation/qualification history is recoverable from Git and legacy ledgers; this package document does not maintain milestone status.