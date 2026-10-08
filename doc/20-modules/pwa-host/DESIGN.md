# PWA 产品组合设计

> 层级：产品组合 / 实施设计  
> 状态：Implementation Frozen / M16+M17 Implemented；same-HEAD qualification 由根命令判定  
> 最近复核：2026-10-07  
> 路线图：[M16 / M17 PWA](../../30-implementation/roadmap.md)；资格说明：[M16/M17 PWA 资格](../../30-implementation/pwa-m16-m17-qualification.md)  
> 正式契约：[PWA Launcher Profile v1](../../15-contracts/pwa-launcher-profile-v1.md)、[Content API v1](../../15-contracts/content-api-v1.md)、[正式契约目录](../../15-contracts/README.md)  
> 相关设计：[平台组合架构](../../10-architecture/platform-composition-system.md)、[存储与内容系统](../../10-architecture/storage-system.md)、[`@loomrealm/game-launcher-pwa` 设计](../../../packages/game-launcher-pwa/DESIGN.md)

本文冻结 LoomRealm PWA v1 的 product composition、browser physical realization、implementation ownership、bootstrap ABI、installation input、build/test closure。实现 agent 不应再自行发明第二套 application authority、通用 Transport/Storage framework、Runtime package manager 或页面常驻 Session daemon。

文档裁决顺序：

```text
正式 contract
    ↓ normative ABI / semantics
本 PWA product design
    ↓ concrete browser composition / implementation ownership
package DESIGN
    ↓ package-local responsibility
roadmap / qualification ledger
    ↓ implementation status / exact evidence only
```

Roadmap 不得覆盖 contract/design 语义；若 package design 与正式 contract 冲突，以正式 contract 为准。

---

## 1. Frozen Physical Topology

```text
Browser Window
├── product bootstrap
├── Renderer
├── Input source
├── Viewport source
├── Web Presentation / DOM
├── Service Worker registration/readiness
└── Window-side adapter
        │
        │ provisioning / lifecycle bridge
        │ dedicated Renderer Control/Data Ports
        ▼

Session Worker (Dedicated Worker)
├── Main                         Control Authority
├── RealmStateAuthority          Session business-state authority
├── session-scoped PwaPlatform core
├── frozen PwaLaunchPlan
├── RuntimeHosting
└── Data / Control provisioning
        │
        ├── Dedicated Worker #1 → Subsystem Runtime
        ├── Dedicated Worker #2 → Subsystem Runtime
        └── ...

Service Worker
├── /_lr/v1/games/...                 public readonly Content API
├── /_lr/internal/executables/...     private executable boundary
└── /_lr/internal/runtime-info        private generation probe
        ↓
Persistent browser installation storage
├── Installation Registry
├── Content Index
├── Executable Index
└── installation-local immutable OPFS objects
```

`Main` and `RealmStateAuthority` are physically co-located but logically separate。

Browser Window MUST NOT host Main or RealmStateAuthority in the v1 baseline。

Each Subsystem Runtime MUST live in its own Dedicated Worker。

Service Worker MUST NOT own Session/Runtime/Frame/Input/Renderer/Realm State authority。

---

## 2. Why Main Is In Session Worker

Window synchronous presentation work can block：

```text
DOM mutation
layout/style
Canvas/WebGL preparation
Web Component synchronous work
input handlers
```

PWA v1 requires：

```text
Window presentation stall
!= physical event-loop stall of Main
```

This requires a separate Worker execution context, not a guaranteed separate OS process。

Desktop/PWA mapping：

```text
Desktop Node                      PWA Session Worker
├── Main                          ├── Main
├── RealmStateAuthority           ├── RealmStateAuthority
└── RuntimeHosting                └── RuntimeHosting

BrowserWindow                     Browser Window
└── Renderer                      └── Renderer / DOM / Input

Runner subprocess                 Dedicated Worker
└── Subsystem                     └── Subsystem

localhost Content HTTP            same-origin Service Worker
└── FSDB/filesystem               └── IDB + OPFS
```

Cross-platform equivalence is logical authority/protocol/result equivalence, not identical physical primitives。

---

## 3. Browser Deployment Baseline

PWA v1 owns the origin-root LoomRealm runtime namespace：

```text
Service Worker scope: /
reserved route prefix: /_lr/
```

Canonical build emits `service-worker.js` so it can control `/` without depending on a product-specific subpath。

A deployment that cannot provide root scope or reserve `/_lr/` is outside the v1 qualification baseline unless it explicitly supplies equivalent Service-Worker scope policy without changing the logical routes。

The Service Worker and all Session/Subsystem workers are same-origin trusted Host assets。

---

## 4. Service Worker READY / Generation

Window startup：

```text
register/find LoomRealm Service Worker
→ wait active/ready
→ require current Window controller
→ controller version handshake
→ accept { protocolVersion, buildId, generation }
→ Content/Executable service READY
```

Canonical logical generation fact：

```ts
interface PwaServiceWorkerGenerationV1 {
  readonly protocolVersion: 1;
  readonly buildId: string;
  readonly generation: string;
}
```

Only after READY may Window create the Session Worker。

First installation MAY require one normal reload if the current document is not yet controlled。v1 does not start a Session on an uncontrolled document just to avoid that reload。

An already-controlled document captures and handshakes
`navigator.serviceWorker.controller` immediately. `registration.installing`
and `registration.waiting` are update facts, not controller candidates, and
are never awaited by that Session. Only the first uncontrolled installation
may wait for install eligibility and take one normal reload.

The emitted generation is derived from deterministic Window, Session Worker,
Runner, and Service Worker artifacts (including transitive workspace
dependencies), then injected in a second build phase. A source-only PWA
directory hash is not the product identity.

### 4.1 Worker-side probe

Private endpoint：

```http
GET /_lr/internal/runtime-info
```

Response：

```ts
interface PwaRuntimeInfoV1 {
  readonly protocolVersion: 1;
  readonly buildId: string;
  readonly generation: string;
}
```

Use：

```text
Window accepts G1
→ Session Worker fetch(runtime-info), require G1
→ PREPARE may continue

RuntimeHosting creates Subsystem Runner
→ Runner fetch(runtime-info), require G1
→ business import may continue
```

Probe response MUST be product-private、JSON、`Cache-Control: no-store` and contain no Game/business data。

Mismatch/failure MUST fail closed before first business Runtime side effect。

### 4.2 Update policy

```text
Session A accepted G1
→ G2 may install/wait
→ Session A remains on G1 assumptions
→ next fresh document/Session may accept G2
```

v1 does not use forced `skipWaiting()` / hot controller takeover as normal Session semantics。

---

## 5. Canonical Installation Source

PWA v1 freezes **one semantic installer input**：`PwaInstallationBundleV1`。

It is a product-private in-memory/capability model, not a public serialized archive format。

```ts
interface PwaInstallationBundleV1 {
  readonly formatVersion: 1;
  readonly gameEntryText: string;
  readonly launchManifestText: string;
  readonly content: readonly PwaBundleContentEntryV1[];
  readonly executables: readonly PwaBundleExecutableEntryV1[];
}

interface PwaBundleContentEntryV1 {
  readonly kind: "record" | "group" | "resource";
  readonly namespace: string;
  readonly key: string;
  readonly mime: string;
  readonly body: Blob;
}

interface PwaBundleExecutableEntryV1 {
  readonly logicalModule: string;
  readonly mime: "text/javascript" | "application/javascript";
  readonly body: Blob;
}
```

Canonical installer API direction：

```ts
interface PwaInstalledGameV1 {
  readonly installationId: string;
}

async function installPwaBundle(
  bundle: PwaInstallationBundleV1,
  signal?: AbortSignal,
): Promise<PwaInstalledGameV1>;
```

`installationId` is Host-generated by the installer using `crypto.randomUUID()`；bundle content MUST NOT choose it。

Future acquisition adapters MAY produce this bundle from：

```text
user File
ZIP/archive
network download
development fixture
```

but those adapters are outside v1 Runtime/Launcher contracts。Launcher never consumes raw File/ZIP/network sources。

---

## 6. Persistent Installation Model

Canonical persistent facts：

```ts
interface PwaInstallationRecordV1 {
  readonly installationId: string;
  readonly generation: string;
  readonly state: "staging" | "complete" | "invalid";
  readonly gameEntryText: string;
  readonly launchManifestText: string;
}
```

`generation` is installer-generated immutable currentness material for that installation publish, separate from Service Worker generation。

Recommended storage：

```text
IndexedDB
├── Installation Registry
├── Content Index
└── Executable Index

OPFS
└── /installations/{installationId}/objects/{sha256hex}

Cache Storage
└── optional derived HTTP response cache only
```

Service Worker volatile memory and Cache Storage are never installation authority。

---

## 7. Installation Transaction / Storage Policy

Cross-IDB/OPFS atomicity is not assumed。Atomicity means visibility/publish atomicity：

```text
mint installationId/generation
→ create staging registry record
→ validate Game Entry / launch manifest / content identities
→ hash/write immutable OPFS bodies
→ validate complete executable graph
→ build complete Content Index + Executable Index
→ one IndexedDB transaction publishes state=complete
```

Only `complete` is visible to PREPARE/Content/executable serving。

Crash before publish：

```text
staging/orphan bytes
→ never runnable
→ maintenance may delete namespace later
```

Before heavy write Window installer SHOULD：

```text
navigator.storage.estimate()
→ reject clearly insufficient capacity
→ navigator.storage.persist() when product policy permits
```

Persistence denial MAY continue as best-effort storage, but no code may interpret successful install as “browser can never evict bytes”。

Missing/corrupt required indexed body：

```text
fail current request/import
→ mark installation invalid or make it unavailable to new PREPARE
→ require repair/reinstall
```

No network/cache fallback may silently resurrect a half-broken installation。

Uninstall：

```text
remove/make registry visibility unavailable first
→ delete indexes
→ delete installation-local OPFS namespace
→ clear derived cache
```

Uninstall first atomically retires a complete record to `invalid`, so it is no
longer visible to PREPARE or Content. Physical objects are then deleted before
the tombstone is removed. If cleanup fails, the non-publishable tombstone keeps
the OPFS root identity available for a later maintenance retry; cleanup does
not create anonymous, uncollectable bytes.

A running Session is not an installation reference-count owner. It may finish
work already loaded in memory, but Content/executable reads begun after retire
fail closed. A normal product uninstall flow therefore stops the selected
Session before retiring its installation; the qualification mutation surface
may deliberately exercise the fail-closed behavior in place.

v1 intentionally has no cross-installation global dedup/refcount GC。

---

Implementation closure:

- Game/launch/content validation and real ECMAScript module graph enumeration
  occur before staging.
- Once staging exists, every abort or write/publish failure removes its OPFS
  namespace before removing the registry record. If physical deletion fails,
  the staging record remains as a durable maintenance retry pointer.
- Startup maintenance removes abandoned `staging` records and published
  `invalid` records, again deleting objects before their retry pointer.
- A complete installation that later fails integrity is first marked invalid
  (the first request is 422 and later access is unavailable/409), then
  maintenance deletes its registry record and OPFS namespace.
- The concrete v1 deployment bounds one object at 64 MiB, one installation at
  256 MiB, Content entries at 4,096, executable modules at 1,024, and active
  Content requests at 32. Installer validation also establishes record/group
  MIME, UTF-8, JSON, and JSON-Lines schema facts before staging.

## 8. Launcher PREPARE

Session Worker uses exactly：

```ts
PwaPlatform.prepareGame({ installationId })
```

Launcher flow：

```text
open complete/current installation
→ parse/validate Game Entry
→ project PreparedRealmStateDefinition
→ parse/validate launch.pwa.json
→ exact Game ↔ PWA subsystem key-set join
→ validate selected executable logical paths
→ preflight Executable Index + graph
→ validate accepted SW generation / Worker capability
→ freeze PwaLaunchPlan
→ freeze LogicalGameBootstrap
→ return PreparedPwaGame
```

Before PREPARE completion：

```text
zero business Subsystem Worker
zero business Definition Module import
zero Runtime Control application connection
```

Main receives no module URL、installationId、Worker option、Service Worker route、Port or PwaLaunchPlan。

---

## 9. Executable Capability

Executable is separate from ordinary Content even if physical object bytes share OPFS primitives。

Private route：

```text
/_lr/internal/executables/{installationId}/{logicalModule...}
```

Handler：

```text
require complete/current installation
→ lookup Executable Index
→ require logical module inside current installation
→ read exact immutable object
→ verify hash/currentness
→ return JavaScript MIME
```

`ContentClient` MUST NOT expose executable route builders or executable bytes as import capability。

### 9.1 ESM graph

Installed executable graph MUST be install-time enumerable and use only relative static ESM imports that resolve inside the same installation executable namespace。

Allowed：

```js
import "./runtime.mjs";
import "../shared/math.mjs";
```

Rejected for v1：

```text
@scope/pkg
package-name
/app/module.mjs
https://...
blob:...
data:...
non-enumerable import(expr)
runtime import-map/npm resolver dependency
```

Dependencies must be materialized/bundled before install。

This keeps the Runtime free of a second package manager。

---

## 10. Session Bootstrap ABI

Formal schema is owned by the PWA Profile：

```ts
interface PwaSessionBootstrapV1 {
  readonly formatVersion: 1;
  readonly sessionEpoch: string;
  readonly installationId: string;
  readonly expectedServiceWorker: PwaServiceWorkerGenerationV1;
  readonly windowBridgePort: MessagePort;
}
```

Window bootstrap：

```text
SW READY
→ select complete installationId
→ mint sessionEpoch
→ create Window bridge MessageChannel
→ new Worker(session-worker.js, { type: "module" })
→ post PwaSessionBootstrapV1 + transfer bridge Port
```

Session bootstrap is closed-schema and single-use。

Session Worker：

```text
validate bootstrap
→ runtime-info generation match
→ create PwaPlatform
→ PREPARE
→ construct RealmStateAuthority
→ Realm State READY
→ run Main
```

`sessionEpoch` is Host currentness/fencing material, not business identity。

---

## 11. Window Bridge / Renderer Binding

`windowBridgePort` is platform-private provisioning/lifecycle only；it never carries Renderer Control/Data application protocol messages。

Canonical messages are those frozen in the formal PWA Profile：

```text
renderer-control/install + transferred MessagePort
renderer-data/install + transferred MessagePort
install/result acknowledgement
```

For Renderer Control：

```text
Main calls RendererControlBinding.acquire(rendererControlToken)
→ Session PwaPlatform creates MessageChannel
→ transfer Window endpoint over windowBridgePort
→ Window validates sessionEpoch/token/install request
→ Window attaches Renderer Control endpoint
→ Window ACK
→ acquire resolves with Session endpoint MessageCarrier
```

For Renderer Data：

```text
PWA Data Broker gets current S/G/P from Main authority view
→ create MessageChannel
→ transfer Window endpoint via bridge
→ transfer Subsystem endpoint via Runner provisioning
→ both endpoints fenced by current session/S/G/P
```

Window never mints generation/profile and never becomes Session terminal authority。

---

Renderer Data provisioning is one transaction keyed by
`requestId + subsystemKey + generation + dataProfile + runtime identity +
connectionId`. Runner and Window acknowledge the same connection identity;
the broker then rechecks the authority revision before commit. Reject, timeout,
bridge loss, Runtime termination, authority replacement, or stale completion
enters rollback and revokes both endpoints. A newer channel cannot commit until
the prior connection is closed on both sides.

## 12. RuntimeHosting / Runner Bootstrap

RuntimeHosting is inside Session Worker PwaPlatform。

```text
Main RuntimeHosting.launch({ subsystemKey, bootstrapToken })
→ lookup frozen PwaLaunchPlan
→ create Runtime Control MessageChannel
→ create Realm State MessageChannel
→ create Runner provisioning MessageChannel
→ new nested Worker(worker-runner.js, { type: "module" })
→ transfer PwaRunnerBootstrapV1
```

Formal Runner bootstrap：

```ts
interface PwaRunnerBootstrapV1 {
  readonly formatVersion: 1;
  readonly sessionEpoch: string;
  readonly installationId: string;
  readonly expectedServiceWorker: PwaServiceWorkerGenerationV1;
  readonly subsystemKey: string;
  readonly bootstrapToken: string;
  readonly logicalModule: string;
  readonly runtimeControlPort: MessagePort;
  readonly realmStatePort: MessagePort;
  readonly provisioningPort: MessagePort;
}
```

Runner：

```text
validate closed bootstrap
→ runtime-info generation match
→ create RuntimeControlBinding
→ create Runtime-scoped RealmStateClient
→ create SubsystemDataBinding
→ create same-origin PWA ContentClient
→ import exact planned module through private executable route
→ validate SubsystemDefinitionFactory
→ runSubsystem(...)
```

Business Definition Module is never the Worker constructor entry。

Unexpected Worker termination → Runtime failure → Main-owned unwind；v1 no automatic restart。

---

## 13. Realm State

Physical v1：

```text
Session Worker
RealmStateAuthority
        ↕ dedicated private MessagePort
Subsystem Worker
Runtime-scoped ReplaceableRealmStateClient
        ↓
SubsystemScope.state
```

Main + State co-location does not merge authority。

State binding loss alone：

```text
old client/subscriptions terminal
!= Runtime failure
!= Frame unwind
!= Session terminal
```

Existing Realm State replacement fencing、OCC、`OUTCOME_UNKNOWN` semantics stay unchanged。

---

## 14. ContentClient Implementation Freeze

Business API remains unchanged：

```text
scope.content.record(namespace, key)
scope.content.resource(namespace, key)
```

Current Desktop Host implementation has mandatory Bearer authorization。PWA MUST NOT weaken that invariant by changing the existing token to optional。

Implementation split is frozen as：

```text
                 shared Content fetch core
      route / validation / error mapping / decode
                     /                    \
                    /                      \
createBoundContentClient            createSameOriginContentClient
Desktop                              PWA
origin + installationId + token      installationId only
Bearer Authorization                 no LoomRealm bearer header
```

Rules：

1. existing `createBoundContentClient(...)` keeps its current Desktop contract；
2. add `createSameOriginContentClient({ installationId }, lifetimeSignal)` in `@loomrealm/subsystem/host`；
3. both reuse one private implementation for segment validation、route construction、status mapping、ETag/contentVersion、JSON/resource decoding、Abort semantics；
4. PWA same-origin client derives origin from its executing global and sends no LoomRealm `Authorization: Bearer` header；
5. Content API wire semantics remain exactly [Content API v1](../../15-contracts/content-api-v1.md)。

Do NOT implement this as `token?: string` on the existing Desktop binding。

---

## 15. Window Renderer / Input / Viewport / Presentation

Window owns：

```text
Renderer Store
Web Projector
business Custom Elements / Canvas / WebGL
DOM/Pointer/Keyboard/Gamepad input source
Viewport/DPR/resize source
```

Render：

```text
Subsystem RenderDomain
→ Renderer Data protocol
→ Window Renderer Store
→ Web Projector
→ presentation
```

Input：

```text
DOM input
→ Renderer Input protocol/gate
→ Main current InputTarget semantics
→ current Subsystem InputListener
```

Never shortcut to：

```text
window keydown → subsystemWorker.postMessage(business event)
```

---

Desktop and PWA use the same browser Window Input/Viewport realization from
`@loomrealm/renderer/browser-window`. Product-specific qualification
observation is a narrow option; it does not fork Input v1 semantics. All
keyboard, pointer, and gamepad changes pass the Data/Input v1 codecs.

## 16. Reload / Navigation / BFCache

v1 policy：

```text
top-level reload
navigation
pagehide leading to BFCache
```

all make the current `sessionEpoch` permanently non-reusable。

Window on `pagehide` MUST synchronously fence the epoch from future current use and terminate/close current Session Worker bindings as far as the browser lifecycle permits。

`pageshow` with `event.persisted === true` MUST：

```text
not reuse old Worker/Port/currentness material
→ rerun SW READY gate
→ mint fresh sessionEpoch
→ create fresh Session Worker
→ re-establish Renderer bindings
```

Late old-epoch messages MUST be ignored/rejected as stale。

v1 does not introduce SharedWorker/session daemon merely to emulate Desktop document reload survival。

---

## 17. Normal Session Shutdown

Normal Main-owned terminal cleanup：

```text
Main commits terminal
→ stop new Runtime/Data admission
→ revoke Data/Control/State bindings
→ request/observe Subsystem Worker termination
→ dispose RealmStateAuthority
→ close Session-side bridge/material
→ terminate Session Worker
→ Window disposes Renderer/Input/Viewport/Presentation adapters
```

Service Worker and installed games are origin/product-scoped and are not deleted with one Session。

Browser navigation may physically preempt graceful cleanup；currentness fencing still prevents old material from becoming current again。

---

## 18. Canonical `apps/pwa` Ownership Layout

Implementation MUST create one PWA composition root：

```text
apps/pwa/
├── package.json
├── tsconfig.json
├── scripts/
│   ├── build.mjs
│   └── run-e2e.mjs
├── src/
│   ├── window-entry.ts
│   ├── qualification-window-entry.ts
│   ├── window-product.ts
│   ├── session-worker-entry.ts
│   ├── worker-runner-entry.ts
│   ├── service-worker.ts
│   ├── service-worker-gate.ts
│   ├── bootstrap-protocol.ts
│   ├── window-bridge.ts
│   ├── pwa-platform.ts
│   ├── runtime-hosting.ts
│   ├── data-broker.ts
│   ├── installation-bundle.ts
│   ├── installation-store.ts
│   ├── installer.ts
│   ├── service-worker-content.ts
│   ├── service-worker-executable.ts
│   └── renderer-host.ts
└── test/
    ├── m16-runtime.e2e.test.mjs
    ├── installation-content.e2e.test.mjs
    ├── lifecycle.e2e.test.mjs
    └── m17-product.e2e.test.mjs
```

The four exact browser entry ownership points are frozen：

```text
window-entry.ts
session-worker-entry.ts
worker-runner-entry.ts
service-worker.ts
```

Internal files MAY be mechanically split/renamed during implementation only if ownership/protocol boundaries above do not change；agent MUST NOT move PWA product composition into `game-launcher-pwa` or another mega-package。

The shared browser Window adapters are owned by
`@loomrealm/renderer/browser-window`; both Desktop and PWA consume that one
Input/Viewport realization instead of keeping product-local copies.

---

Production and qualification compositions have separate Window entries.
`window-entry.ts` exposes observation state only.
`qualification-window-entry.ts` adds install/uninstall/fault-injection
capabilities solely to qualification artifacts; those names and capabilities
are absent from the production `window.js`.

Verified presentation bootstrap scripts/styles are document-scoped. A fresh
Session in the same BFCache-restored Window reuses their content-versioned
bootstrap facts instead of evaluating one-shot browser modules twice; Session
Renderer/Data/Input/Viewport bindings are still recreated.

## 19. Build Output

PWA v1 uses repository TypeScript + esbuild-style explicit entry bundling rather than introducing a second application framework solely for this milestone。

Canonical output：

```text
apps/pwa/dist/
├── index.html
├── window.js
├── session-worker.js
├── worker-runner.js
└── service-worker.js
```

All worker scripts are module workers where applicable。

`window.js` is the only document entry；business game modules are never emitted as direct Worker constructor entries。

Build tooling MUST preserve the private executable route as runtime-loaded installation content, not bundle installed business modules into the Host Worker Runner asset。

---

## 20. Root Build / Test Commands

Implementation MUST add root scripts with these names and closure meanings：

```text
npm run build:m16
npm run test:m16
npm run build:m17
npm run test:m17
npm run test:pwa
```

Required semantics：

```text
build:m16
    build core PWA Runtime stack + apps/pwa browser assets

test:m16
    build:m16
    + launcher/platform/package unit tests
    + real Playwright Chromium M16 Worker vertical

build:m17
    build:m16
    + Renderer/Input/Viewport/Presentation + current real game dependencies

test:m17
    test:m16
    + installation/content/executable vertical
    + Renderer/Data/Input/Viewport/Presentation E2E
    + reload/navigation/BFCache lifecycle
    + Desktop ↔ PWA business equivalence

test:pwa
    alias/aggregate of the current complete PWA qualification path (v1 = test:m17)
```

An implementation agent MUST NOT claim M16/M17 complete until：

```text
npm run test:m16
npm run test:m17
npm run test:regression
```

all pass on the same HEAD, subject to environment-specific skips explicitly permitted by qualification docs。

---

The dedicated `.github/workflows/pwa.yml` gate runs `npm run test:pwa` on
Node 24 with the repository-pinned Playwright Chromium for relevant PWA and
transitive dependency paths on pull requests and `main`.

## 21. Browser Qualification Baseline

Mandatory v1 browser target：

```text
repository-pinned Playwright Chromium
```

M16/M17 MUST use real Service Worker + Dedicated Worker + nested Worker + MessagePort + IndexedDB/OPFS in Chromium E2E；mock-only browser qualification is insufficient。

Firefox/WebKit MAY be tested and supported later, but they do not block v1 M16/M17 closure unless this baseline is explicitly revised in the contract/design。

This is a qualification scope decision, not permission to write Chromium-specific business protocols。

---

## 22. M16 Definition of Done

M16 path：

```text
Window bootstrap
→ SW READY/version
→ Session Worker bootstrap
→ runtime-info generation match
→ PwaPlatform.prepareGame({ installationId })
→ complete PREPARE
→ Realm State READY
→ Main running outside Window event loop
→ RuntimeHosting nested Worker
→ Runner generation match
→ private executable import
→ Runtime Control
→ Subsystem ready
→ initial Frame
→ deterministic business result
```

M16 must cover failure paths：

```text
no/incompatible SW controller
Session bootstrap invalid
runtime-info mismatch
installation incomplete/invalid
PREPARE failure before business Worker
manifest/key-set/module/graph failure
nested Worker creation/bootstrap failure
module load/ABI failure
Runtime Control hello/ready/loss
real Realm State client + stale binding fencing
unexpected Worker termination / no auto restart
Renderer Control Window↔Session establishment
Window main-thread stall without Main physical colocation
```

---

## 23. Installation / Content / Executable Qualification

Must exercise：

```text
PwaInstallationBundleV1 install
storage estimate path
persist granted/denied
staging never visible
crash/orphan cleanup
complete publish
SW restart reconstructs indexes
Content GET/HEAD/version/ETag/MIME/errors
offline read
private executable route
relative ESM graph
forbidden graph rejection
body loss/hash mismatch → invalid/fail closed
uninstall visibility before object cleanup
cache residue cannot resurrect invalid installation
```

Goal is not “OPFS can read files”; goal is a trusted installation that produces the same logical Content contract and a separate controlled executable capability。

---

## 24. M17 Definition of Done

M17 closes：

```text
Renderer Control Window↔Session Worker
Renderer Data Window↔Subsystem Worker
Input
Viewport
same-origin ContentClient
Web Presentation
real game-lib / concrete game
reload/navigation/BFCache fresh Session
Desktop ↔ PWA business-observable equivalence
```

Equivalence：

```text
same logical input sequence
→ same Frame/Call observable semantics
→ same Realm State business facts
→ same game result
→ equivalent logical Render state
→ equivalent logical failure classification / cleanup guarantee
```

Not required：

```text
WebSocket bytes == MessagePort bytes
Node process == Worker
filesystem == OPFS layout
DOM timing bit-for-bit equal
Desktop document reload == PWA top-level reload
```

---

The real-game vertical bundles the existing
`examples/essentials-v21.1/subsystems/map.mjs` and
`@loomrealm-game/map` dependency graph into an installable browser ESM
artifact. Qualification observes real map presentation and movement behavior;
it does not substitute another demo framework.

Navigation fresh-Session evidence is mandatory. BFCache is reported as PASS
only when both `pagehide.persisted` and `pageshow.persisted` are true; when
the pinned browser does not retain the page, the run records that environment
limitation and does not label the navigation as a BFCache PASS.

## 25. Implementation Slices

Agent may implement incrementally but MUST converge on one final topology：

```text
PWA-1 apps/pwa build + root-scope SW + Session Worker bootstrap
PWA-2 installation bundle/store/staging/publish
PWA-3 Launcher PREPARE + executable graph/index
PWA-4 RuntimeHosting + nested Runner + Runtime Control
PWA-5 Realm State + lifecycle/failure
PWA-6 same-origin ContentClient + SW Content
PWA-7 Window Renderer Control/Data
PWA-8 Input/Viewport/Presentation
PWA-9 lifecycle/BFCache + Desktop/PWA equivalence
PWA-10 root test commands + qualification evidence
```

These are implementation slices, not separate application authorities or alternate architectures。

---

## 26. Package / Abstraction Guard

Do NOT create solely for PWA：

```text
PwaMain
PwaSubsystem
universal all-platform launcher
generic filesystem provider to port FSDB
TransportRegistry
single mega MessagePort protocol
PWA application mega-package outside apps/pwa
Service Worker application authority
runtime npm/package resolver
runtime ImportMap manager
cross-installation global object GC/refcount
SharedWorker Session daemon only for reload survival
automatic Runtime restart manager
```

Reuse existing narrow ports：

```text
DeadlineScheduler
OpaqueMaterialGenerator
RuntimeHosting
HostedRuntime
RendererControlBinding
RendererDataBinding
SubsystemDataBinding
DataConnectionAuthoritySink
```

Browser adapters should implement these ports, not replace them with a new generic platform framework。

---

## 27. Final Invariants

1. Window owns presentation/browser adapters only；
2. Main + RealmStateAuthority live in Session Worker and remain separate logical authorities；
3. every Subsystem Runtime is a dedicated Worker；
4. Service Worker owns only physical Content/executable/runtime-info serving；
5. PWA runtime host owns `/` SW scope and reserves `/_lr/` in the v1 deployment baseline；
6. installer accepts one canonical `PwaInstallationBundleV1` semantic input；
7. installer, not bundle, mints `installationId`；
8. Launcher consumes only published `installationId`；
9. staging → one visibility publish; half-installations never run；
10. eviction/corruption invalidates future healthy use；
11. executable capability is separate from ordinary Content；
12. executable graph is install-time enumerable relative ESM inside one installation；
13. Session/Runner bootstrap schemas are frozen by the formal Profile；
14. Window bridge is provisioning-only；
15. Renderer Control、Runtime Control、Realm State、Renderer Data remain distinct planes；
16. PWA ContentClient uses same-origin Fetch and does not make Desktop bearer optional；
17. Main receives no module/Worker/Port/storage facts；
18. Worker Runner is Host-owned constructor entry；
19. no automatic Runtime restart；
20. one Session is pinned to accepted SW generation；
21. reload/navigation/BFCache cannot revive old sessionEpoch；
22. exact browser entry ownership points live in `apps/pwa`；
23. v1 mandatory qualification target is repository-pinned Playwright Chromium；
24. M16/M17 closure requires the frozen root test commands plus regression on the same HEAD。
