# PWA Game Launcher / Worker Subsystem Runner Profile v1

> 层级：正式契约 / PWA Platform Profile  
> 状态：Active / Normative / Implementation Frozen；M16/M17 implemented，same-HEAD qualification 由仓库根命令判定  
> Profile Version：1  
> 最近复核：2026-10-07  
> 依赖：[Game Package v1](./game-package-v1.md)、[Realm State v1](./realm-state-v1.md)、[Subsystem Control v1](./subsystem-control-protocol-v1.md)、[Runtime Control Profile v1](./runtime-control-profile-v1.md)、[Renderer Data Profile v1](./renderer-data-profile-v1.md)、[Content API v1](./content-api-v1.md)、[ADR 0020](../decisions/0020-game-entry-consumer-boundary.md)、[ADR 0026](../decisions/0026-session-scoped-platform-instance.md)

本文使用 `MUST`、`MUST NOT`、`SHOULD`、`MAY` 表达规范强度。

本 Profile 已冻结 PWA v1 的 runtime-product physical profile。当前实现入口与自动资格范围见路线图及 PWA 资格说明；任何 PASS 仍只对实际执行根命令的 exact HEAD 成立。

核心原则：

> **Browser Window 只拥有 presentation/browser-only adapter；Main 与 RealmStateAuthority 共置独立 Session Worker；每个 Subsystem Runtime 位于独立 Dedicated Worker；Service Worker 只实现 Content/executable/runtime-info 的 browser physical boundary，不成为 application authority。**

---

## 1. Normative Physical Profile

PWA v1 MUST 使用：

```text
Browser Window
├── Renderer
├── Input source
├── Viewport source
├── Web Presentation / DOM
├── Service Worker readiness
└── Window-side platform adapter

Session Worker (Dedicated Worker)
├── Main
├── RealmStateAuthority
├── session-scoped PwaPlatform core
├── frozen PwaLaunchPlan
├── RuntimeHosting
└── Data / Control provisioning

Dedicated Subsystem Worker × N
└── Host-owned Worker Runner → selected Subsystem Definition

Service Worker
├── /_lr/v1/games/...                 Content API
├── /_lr/internal/executables/...     private executable route
└── /_lr/internal/runtime-info        private generation probe
```

`Main` 与 `RealmStateAuthority` 只物理共置；logical authority MUST 保持分离。

PWA v1 MUST NOT 将 Main 或 RealmStateAuthority 放入 Browser Window event loop 作为正式 realization。

PWA v1 不要求浏览器为 Worker 提供独立 OS process；要求的是独立 Worker execution context / event loop。

---

## 2. Product / Launcher Ownership

标准调用链：

```text
Window product bootstrap
→ select complete installationId
→ create Session Worker
→ Session Worker creates session-scoped PwaPlatform
→ PwaPlatform.prepareGame({ installationId })
→ @loomrealm/game-launcher-pwa
→ @loomrealm/game-package
→ immutable PreparedPwaGame
→ construct RealmStateAuthority
→ Main
```

PWA Launcher MUST own：

```text
Game Entry acquisition from the selected published installation
launch.pwa.json parsing/validation
exact Game ↔ PWA subsystem key-set join
Executable Index resolution/preflight
immutable PwaLaunchPlan
LogicalGameBootstrap projection
PreparedRealmStateDefinition projection
Worker Runner plan-consumer integration
```

PWA Launcher MUST NOT own：

```text
Browser Window lifecycle
installation import/write/delete
Service Worker registration/update
Main Frame/Runtime authority
Realm State business authority
Renderer authority
DataAuthority generation/profile
Content semantics
```

Product application MUST NOT manually call `@loomrealm/game-package` before PWA Launcher。

---

## 3. Canonical Prepared Input

Runtime PREPARE consumes a **published installation**, not an external file/ZIP/network source。

Canonical product-facing request：

```ts
interface PwaPrepareGameRequestV1 {
  readonly installationId: string;
}
```

`installationId` MUST identify one persistent installation whose registry state is `complete` and current。

Launcher obtains from that installation：

```text
Game Entry
launch.pwa.json
Executable Index
required installation generation/currentness facts
```

Installer/acquisition is defined by the PWA product design and is upstream of this Profile。

---

## 4. Launch Manifest

Installation convention：

```text
launch.pwa.json
```

Normative model：

```ts
interface PwaLaunchManifestV1 {
  readonly formatVersion: 1;
  readonly subsystems: readonly PwaSubsystemBindingV1[];
}

interface PwaSubsystemBindingV1 {
  readonly key: string;
  readonly module: string;
}
```

`module` selects one executable logical module in the selected installation。

Manifest MUST NOT declare：

```text
Worker Runner URL/options
arbitrary absolute/external executable URL
MessagePort/bootstrap credential
Runtime Control/Data/Realm State port
Service Worker/CSP policy
storage path/OPFS handle
```

---

## 5. Exact Key-set Join

Before any business Worker creation：

```text
keys(GameEntry.subsystems)
=
keys(PwaLaunchManifest.subsystems)
```

Missing、extra、duplicate binding MUST fail PREPARE。

Runtime identity remains Game `subsystemKey`; Worker id、module URL、logical module path MUST NOT become a second Runtime identity。

---

## 6. Executable Logical Module Syntax

Manifest `module` MUST：

1. be non-empty ASCII；
2. use `/` separators；
3. not start/end with `/`；
4. contain no empty、`.`、`..` segment；
5. contain no `\\`、`:`、NUL/control character；
6. have UTF-8 length ≤ 512 bytes；
7. end in `.mjs`；
8. use segments matching `^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$`。

Reject examples：

```text
../subsystem.mjs
/subsystem.mjs
https://example/subsystem.mjs
blob:https://...
data:text/javascript,...
file:///...
foo\\subsystem.mjs
foo/subsystem.js
```

---

## 7. Frozen Executable Graph Rule

PWA v1 installed business executable MUST form an install-time enumerable ESM graph。

Allowed static specifier form：

```text
./x.mjs
../shared/x.mjs
```

After URL resolution, every dependency MUST remain inside the current installation executable namespace and MUST exist in the Executable Index。

PWA v1 MUST reject installed executable graphs containing：

```text
bare package specifier       @scope/pkg / package-name
absolute app path            /modules/x.mjs
external URL                 https://...
blob:/data: URL
non-enumerable dynamic import expression
runtime npm/package resolution dependency
runtime import-map dependency required for business graph correctness
```

Build/install tooling MUST materialize/bundle/resolve such dependencies before installation instead of creating a PWA runtime package resolver。

Executable edge discovery is a security boundary and MUST use a real ECMAScript
module lexer/parser. Text regular expressions are not conforming. The install
pipeline MUST separately:

```text
parse module source
→ enumerate static imports, export-from edges, and literal dynamic imports
→ reject non-literal dynamic imports and forbidden specifier classes
→ resolve relative logical modules
→ require graph closure inside the installation namespace
→ freeze the Executable Index
```

---

## 8. Executable Resolution

Resolver MUST：

```text
validate logical module
→ lookup current complete installation
→ lookup Executable Index entry
→ require entry belongs to selected installation
→ require expected MIME/integrity/currentness
→ derive private same-origin hierarchical identity
```

Canonical route family：

```text
/_lr/internal/executables/{installationId}/{logicalModule...}
```

Conceptual host-private plan entry：

```ts
interface ResolvedPwaSubsystemModuleV1 {
  readonly installationId: string;
  readonly subsystemKey: string;
  readonly logicalModule: string;
  readonly moduleUrl: string;
}
```

`moduleUrl` MUST NOT enter Game Entry、LogicalGameBootstrap、Main、Realm State values、Renderer、Frame、Render、Data or business payload。

`blob:` MUST NOT be the installed executable identity。

---

## 9. Immutable PREPARE

PREPARE MUST complete all of：

```text
installation complete/current
Game Entry valid
launch.pwa.json valid
exact key-set join valid
all selected modules syntactically valid
all selected modules present in Executable Index
required executable graph preflight valid
Host-owned Worker Runner entry available
required Worker/MessageChannel capabilities available
accepted Service Worker generation valid
LogicalGameBootstrap projected/frozen
PreparedRealmStateDefinition projected/frozen
PwaLaunchPlan frozen
```

Before PREPARE completes：

```text
MUST NOT create business Subsystem Worker
MUST NOT import business Definition Module
MUST NOT establish Runtime Control
```

Prepared result：

```ts
interface PreparedPwaGame {
  readonly logicalBootstrap: LogicalGameBootstrap;
  readonly state: PreparedRealmStateDefinition;
  readonly launchPlan: PwaLaunchPlan;
}
```

Main receives only the logical bootstrap and Main-facing platform capabilities；Main MUST NOT receive `PwaLaunchPlan`。

---

## 10. Service Worker Generation Fact

Window accepts a Service Worker generation before creating a Session。

Normative fact：

```ts
interface PwaServiceWorkerGenerationV1 {
  readonly protocolVersion: 1;
  readonly buildId: string;
  readonly generation: string;
}
```

`generation` is an opaque product-owned currentness value, not a Game/Session/Runtime identity。

It MUST identify the emitted PWA product behavior, including every transitive
source that can affect Window, Session Worker, Runner, or Service Worker
artifacts. Hashing only `apps/pwa/src`, or using a mutable deployment label, is
insufficient. A deterministic placeholder build followed by artifact hashing
and final generation injection is one conforming realization.

Private endpoint：

```http
GET /_lr/internal/runtime-info
```

Response logical model：

```ts
interface PwaRuntimeInfoV1 {
  readonly protocolVersion: 1;
  readonly buildId: string;
  readonly generation: string;
}
```

Session Worker and every Subsystem Runner MUST fetch this endpoint and match the Window-accepted generation before PREPARE/business executable import respectively。

Mismatch/probe failure MUST fail closed before first business Runtime side effect。

---

## 11. Session Bootstrap ABI v1

Window → Session Worker bootstrap is product-private Structured Clone, but its v1 schema is frozen：

```ts
interface PwaSessionBootstrapV1 {
  readonly formatVersion: 1;
  readonly sessionEpoch: string;
  readonly installationId: string;
  readonly expectedServiceWorker: PwaServiceWorkerGenerationV1;
  readonly windowBridgePort: MessagePort;
}
```

Rules：

```text
closed object schema
unknown field → reject
formatVersion != 1 → reject
empty/malformed sessionEpoch or installationId → reject
missing/non-MessagePort windowBridgePort → reject
bootstrap is single-use
```

`sessionEpoch` is Host-generated opaque currentness material for one top-level document Session。It MUST NOT become Main Runtime identity or business data。

Session Worker sequence：

```text
validate bootstrap
→ probe runtime-info and match expectedServiceWorker
→ open selected published installation
→ create PwaPlatform
→ PREPARE
→ construct RealmStateAuthority
→ Realm State READY
→ run Main
```

---

## 12. Window Bridge ABI v1

`windowBridgePort` is **provisioning/lifecycle only**。It MUST NOT carry Renderer Control/Data application messages。

Session Worker → Window messages：

```ts
interface PwaInstallRendererControlV1 {
  readonly formatVersion: 1;
  readonly type: "renderer-control/install";
  readonly requestId: string;
  readonly sessionEpoch: string;
  readonly rendererControlToken: string;
  readonly port: MessagePort;
}

interface PwaInstallRendererDataV1 {
  readonly formatVersion: 1;
  readonly type: "renderer-data/install";
  readonly requestId: string;
  readonly sessionEpoch: string;
  readonly subsystemKey: string;
  readonly generation: number;
  readonly dataProfile: string;
  readonly connectionId: string;
  readonly port: MessagePort;
}

interface PwaRevokeRendererDataV1 {
  readonly formatVersion: 1;
  readonly type: "renderer-data/revoke";
  readonly requestId: string;
  readonly sessionEpoch: string;
  readonly subsystemKey: string;
  readonly generation: number;
  readonly dataProfile: string;
  readonly connectionId: string;
}
```

Window → Session Worker acknowledgement：

```ts
interface PwaWindowBridgeResultV1 {
  readonly formatVersion: 1;
  readonly type: "install/result";
  readonly requestId: string;
  readonly sessionEpoch: string;
  readonly ok: boolean;
  readonly errorCode?: "WINDOW_NOT_CURRENT" | "INSTALL_REJECTED";
}
```

`requestId` MUST be unique inside one `sessionEpoch`。Unknown/stale epoch、duplicate result、wrong request type MUST be ignored/rejected and MUST NOT install current authority。

`RendererControlBinding.acquire()` and Renderer Data provisioning MAY resolve only after matching Window acknowledgement。

---

## 13. RuntimeHosting Boundary

Main-facing request remains platform-neutral：

```text
RuntimeHosting.launch({ subsystemKey, bootstrapToken }, signal)
```

PWA RuntimeHosting MUST：

```text
lookup subsystemKey in frozen PwaLaunchPlan
→ create Worker supervision record
→ create dedicated Runtime Control MessageChannel
→ create dedicated Realm State MessageChannel
→ create dedicated Runner provisioning MessageChannel
→ create Host-owned generic Worker Runner
→ transfer one endpoint of each private plane in PwaRunnerBootstrapV1
→ expose Main side as HostedRuntime
```

Main MUST NOT pass module URL、Worker options、MessagePort、installationId or Service Worker material。

---

## 14. Runner Bootstrap ABI v1

Session Worker → Subsystem Worker bootstrap：

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

Rules：

```text
closed schema
single-use
subsystemKey/logicalModule must exactly match frozen PwaLaunchPlan
bootstrapToken must match current Launch Attempt
all transferred Ports are dedicated to this Runtime
invalid bootstrap → terminate Worker before business import
```

Runner sequence：

```text
validate bootstrap
→ fetch runtime-info
→ require expected SW generation
→ create RuntimeControlBinding
→ create Runtime-scoped RealmStateClient from realmStatePort
→ create SubsystemDataBinding backed by provisioningPort
→ create same-origin PWA ContentClient for installationId
→ import exact private executable URL derived from logicalModule
→ validate default SubsystemDefinitionFactory
→ runSubsystem(...)
```

Business Definition Module is never the Worker constructor entry。

---

## 15. Runner Provisioning ABI v1

`provisioningPort` is Platform-private and MUST NOT carry Runtime Control、Renderer Data application payload、Realm State RPC or business RPC。

Session Worker → Runner：

```ts
interface PwaInstallSubsystemDataV1 {
  readonly formatVersion: 1;
  readonly type: "data/install";
  readonly requestId: string;
  readonly subsystemKey: string;
  readonly generation: number;
  readonly dataProfile: string;
  readonly connectionId: string;
  readonly port: MessagePort;
}

interface PwaRevokeSubsystemDataV1 {
  readonly formatVersion: 1;
  readonly type: "data/revoke";
  readonly requestId: string;
  readonly subsystemKey: string;
  readonly generation: number;
  readonly dataProfile: string;
  readonly connectionId: string;
}

interface PwaRunnerDataResultV1 {
  readonly formatVersion: 1;
  readonly type: "data/result";
  readonly requestId: string;
  readonly subsystemKey: string;
  readonly connectionId: string;
  readonly ok: boolean;
}
```

Runner MUST fence stale S/G/P and MUST NOT mint generation/profile。

The broker MUST treat provisioning as one transaction. Only matching
acknowledgements for the same request/connection identity may commit current.
Reject, timeout, bridge loss, Runtime termination, authority replacement, or a
stale completion MUST revoke both endpoints before a newer channel may commit.

Transfer/install failure：

```text
!= Runtime failure by itself
!= Frame unwind
!= DataAuthority mutation
!= Realm State reset
```

---

## 16. MessagePort Planes

PWA v1 MUST keep distinct：

```text
Window ↔ Session Worker
    Window bridge / provisioning
    Renderer Control application carrier
    Renderer Data application carrier(s)

Session Worker ↔ Subsystem Worker
    Runtime Control application carrier
    Realm State private binding
    Runner provisioning
    Renderer Data application carrier(s)
```

A single mega-channel multiplexing these planes is forbidden。

Application protocol carriers continue to expose `MessageCarrier` and preserve their existing wire contracts。

---

## 17. Realm State Physical Profile

PWA v1 physical placement is frozen：

```text
Session Worker
├── Main
└── RealmStateAuthority

Subsystem Worker
└── Runtime-scoped RealmStateClient
        ↕ dedicated private MessagePort
Session Worker RealmStateAuthority
```

This is physical co-location only；Main and Realm State authority semantics remain separate。

Realm State binding loss alone MUST NOT imply Runtime/Frame/Session failure。

RealmStateAuthority fatal is Session-fatal only through the existing Main/Session lifecycle owner chain。

---

## 18. Content Binding in Runner

Subsystem author surface remains：

```text
scope.content.record(...)
scope.content.resource(...)
```

PWA Runner MUST use same-origin Content Fetch：

```text
/_lr/v1/games/{installationId}/...
```

PWA Runner MUST NOT require Desktop bearer token distribution。

Response/status/version/MIME/integrity semantics remain entirely governed by Content API v1。

Content route builder、physical URL、installation storage handle MUST NOT enter business scope beyond the existing `ContentClient` capability。

---

## 19. Definition Module ABI

Selected module MUST be `.mjs` ESM and default-export a value accepted as `SubsystemDefinitionFactory` by `@loomrealm/subsystem/host`。

Definition Module MUST NOT：

```text
read launch.pwa.json
read Game Entry directly
find bootstrap Ports through ambient globals
construct RealmStateAuthority
construct a second Runtime
import PWA Platform internals
```

---

## 20. Worker Supervision

Supervisor observes：

```text
Worker creation failure
bootstrap validation failure
module load/ABI failure
Worker error/unexpected termination
Main-requested termination
actual termination observation
```

Unexpected Subsystem Worker termination → Runtime failure through Main owner chain。

v1 MUST NOT automatically restart a Runtime。A new Runtime means a fresh Launch Attempt + Worker + Control lifetime + Realm State client binding。

---

## 21. Service Worker / Reload Currentness

One Session is pinned to the Service Worker generation accepted at bootstrap。

The accepted worker is `navigator.serviceWorker.controller` captured for the
current document. An installing or waiting worker is not a controller
candidate, MUST NOT block the current Session, and MUST NOT replace its pinned
generation. First installation may take exactly one normal reload path to
obtain a controller.

PWA v1 MUST NOT use product update hot takeover as normal semantics。

```text
G2 may install/wait while Session on G1 runs
→ current Session remains G1
→ next fresh Session may accept G2
```

Top-level reload/navigation/BFCache restoration MUST NOT revive old Session material。

`pagehide` makes the current `sessionEpoch` non-reusable；`pageshow(persisted)` requires a new epoch、new Session Worker and new bindings。

---

## 22. Failure Categories

Implementations MUST preserve at least these distinguishable platform failures：

```text
PLATFORM_LAUNCH_MANIFEST_INVALID
PLATFORM_BINDING_MISSING
PLATFORM_BINDING_UNDECLARED
INSTALLATION_NOT_COMPLETE
INSTALLATION_INVALID
SERVICE_WORKER_NOT_READY
SERVICE_WORKER_INCOMPATIBLE
SERVICE_WORKER_GENERATION_MISMATCH
SESSION_BOOTSTRAP_INVALID
WINDOW_BRIDGE_REJECTED
SUBSYSTEM_MODULE_INVALID
SUBSYSTEM_MODULE_NOT_FOUND
SUBSYSTEM_MODULE_OUTSIDE_INSTALLATION
SUBSYSTEM_MODULE_GRAPH_INVALID
SUBSYSTEM_MODULE_LOAD_FAILED
SUBSYSTEM_MODULE_ABI_INVALID
PLATFORM_RUNTIME_UNSUPPORTED
WORKER_CREATE_FAILED
WORKER_BOOTSTRAP_INVALID
WORKER_EXITED_DURING_BOOTSTRAP
WORKER_EXITED_UNEXPECTEDLY
PLATFORM_PROVISIONING_FAILED
```

Exact public TypeScript error class layout MAY remain package-internal unless another formal contract consumes it, but tests MUST distinguish the failure facts above。

---

## 23. Qualification Minimum

M16 qualification MUST exercise real browser Worker boundaries for：

```text
SW READY/controller/version gate
Session bootstrap closed-schema validation
Session Worker runtime-info generation match/mismatch
complete PREPARE before Worker side effect
exact key-set join
Executable Index lookup
relative ESM graph resolution
forbidden bare/external/dynamic graph rejection
nested Dedicated Worker Runner creation
Runner bootstrap closed-schema validation
Runner runtime-info generation match/mismatch
Runtime Control created/connected/identified/ready distinctions
real Realm State MessagePort client
unexpected Worker termination / no auto restart
Renderer Control Window↔Session Worker establishment
Window main-thread stall does not execute Main on Window event loop
```

M17 adds：

```text
Renderer Data provisioning/currentness
Input / Viewport
same-origin ContentClient
Content/integrity/storage failure paths
Web Presentation
reload/navigation/BFCache fresh Session
existing real game-lib artifact through install/PREPARE/Runner/presentation
Desktop ↔ PWA business-observable equivalence
```

Mandatory v1 browser qualification target is the repository-pinned Playwright **Chromium** environment。Firefox/WebKit support MAY be added later but is not an M16/M17 closure blocker unless the product baseline is explicitly revised。

---

## 24. Final Invariants

1. Browser Window is presentation/browser adapter only；
2. Main + RealmStateAuthority are in one Session Worker but remain separate authorities；
3. each Subsystem Runtime is a separate Dedicated Worker；
4. Launcher consumes one published complete `installationId`；
5. Game/PWA subsystem key sets join exactly before any business Worker side effect；
6. executable graph is install-time enumerable relative ESM inside one installation；
7. installed executable identity is private same-origin hierarchical URL, never `blob:`；
8. Main receives no executable/Worker/Port/storage material；
9. Session bootstrap and Runner bootstrap use the frozen closed v1 schemas；
10. Window bridge is provisioning-only and does not collapse application planes；
11. Session/Runner both verify the accepted Service Worker generation with `runtime-info`；
12. Runtime Control、Realm State、Renderer Data and provisioning remain distinct planes；
13. PWA Content uses same-origin Fetch without Desktop bearer distribution；
14. Realm State binding loss alone is not Runtime/Session failure；
15. unexpected Worker termination enters Main-owned Runtime failure；
16. v1 has no automatic Runtime restart；
17. reload/navigation/BFCache restore cannot revive an old sessionEpoch；
18. M16/M17 qualification is Chromium-mandatory until the baseline is explicitly expanded。
