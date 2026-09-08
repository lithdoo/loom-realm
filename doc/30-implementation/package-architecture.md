# 独立分包与发布架构

> 层级：实施计划 / Package Boundary  
> 状态：Active Design / Tracking  
> 稳定程度：Evolving by milestone / **M12 preimplementation boundary frozen**  
> 主要定义：primitive、protocol capability、role、FSDB core、platform ports、launcher/integration、composition root 与 business package 的 ownership/dependency boundary  
> 依赖：[平台组合系统](../10-architecture/platform-composition-system.md)、[正式契约目录](../15-contracts/README.md)、[ADR 0021](../decisions/0021-runtime-control-preimplementation-closure.md)、[ADR 0026](../decisions/0026-session-scoped-platform-instance.md)、[ADR 0027](../decisions/0027-freeze-renderer-control-v1-preimplementation.md)、[ADR 0028](../decisions/0028-freeze-m9-desktop-data-broker-preimplementation.md)、[ADR 0029](../decisions/0029-user-input-v1-mutation-gate-state-convergence.md)、[ADR 0030](../decisions/0030-freeze-m12-content-preimplementation-closure.md)  
> 最近复核：2026-09-08

```text
Protocol boundary
!= npm package boundary
!= process boundary
!= Platform boundary
!= milestone boundary
```

Milestone只描述 implementation slice；package只有在真实 ownership/consumer要求出现时 materialize。

---

## 1. Current Dependency Shape

```text
foundation ─────→ platform-ports ─────→ main / subsystem-host / renderer
 │
 ├─────────────────────┐
 │                     ↓
wire ─────────────→ runtime-control ──→ main / subsystem-host
 │
 ├──────────────→ renderer-control ───→ main / renderer
 │
 ├──────────────→ data ───────────────→ subsystem / renderer
 │
 └──────────────→ game-package
                         ↓
              game-launcher-hostra/pwa
                         ↓
                       apps/*

Node stdlib
    ↓
@loomrealm/fsdb
    ├────────→ @loomrealm/fsdb-http
    └────────→ apps/desktop Content composition
```

Business Definition只依赖最近的 author SDK：

```text
business Definition → @loomrealm/subsystem
@loomrealm/map       → @loomrealm/subsystem
```

M12 **不**建立 `@loomrealm/content` 或 `@loomrealm/content-service` package。Subsystem ContentClient属于 `@loomrealm/subsystem` author surface；Renderer ResourceClient属于 `@loomrealm/renderer` private realization；Desktop Content Service属于 `apps/desktop` composition。

---

## 2. Primitive / Protocol Packages

`@loomrealm/foundation` owns MessageCarrier / CarrierClosed / deterministic MemoryCarrier；no JSON/domain/platform semantics。

`@loomrealm/wire` owns plain JSON/JSON-RPC representation、exact keys、safe integer、UTF-8/depth primitives；no carrier/lifecycle/domain authority。

Protocol capability packages：

```text
@loomrealm/runtime-control   → Foundation + Wire
@loomrealm/renderer-control  → Foundation + Wire
@loomrealm/data              → Foundation + Wire
```

它们拥有 wire/profile mechanics，不拥有 Main/Subsystem/Renderer/Platform authority。

---

## 3. `@loomrealm/platform-ports`

Runtime dependency保持 exactly `@loomrealm/foundation`。

Frozen root surfaces through M12仍只有已经出现真实 Core↔Platform consumer 的能力：

```text
M4  DeadlineScheduler / RuntimeControlBinding
M5  RuntimeLaunchRequest / MainRuntimeControlBinding / HostedRuntime / RuntimeHosting
M7  OpaqueMaterialGenerator / RendererControlBinding
M8  RendererDataBinding / SubsystemDataBinding / SubsystemDataBindingResult
M9  DataConnectionAuthorityEntry / DataConnectionAuthorityView / DataConnectionAuthoritySink
```

M10 Input、M11 Render、M12 Content均 **不新增 Platform Port**：

```text
RendererInputSource      → Renderer role integration surface
RenderManager/Store      → owning role internals
ContentClient            → Subsystem author SDK
Renderer ResourceClient  → Renderer private role implementation
Desktop Content service  → app composition
```

No universal Platform/service locator/future port inventory。

---

## 4. Platform-neutral Role Packages

### Main

依赖：

```text
@loomrealm/platform-ports
@loomrealm/runtime-control
@loomrealm/renderer-control
@loomrealm/wire
```

Main owns Session、Runtime、Frame、Stack、Activation、InputTarget、Renderer currentness、DataAuthority、failure/unwind。M10–M12不增加 Main Content/Input/Render authority。

### Renderer

依赖保持：

```text
@loomrealm/renderer-control
@loomrealm/platform-ports
@loomrealm/data
```

M10 root surface只有 frozen `RendererInputSource` integration；M11 Render Store internal-only；M12 ResourceClient继续 internal-only。M12不得为了共享 HTTP mechanics预建 public AssetManager/Repository/ContentClient root API。

若 Subsystem 与 Renderer真正出现相同、可独立复用的 transport client mechanics，只能在两个 production consumers都存在后抽取最小 helper；不得建立 `content-core` 以追求 package symmetry。

### Subsystem

Author root owns：

```text
Frame / FrameOutcome
InputListener
RenderDomain
ContentClient            // M12 frozen
AbortSignal
```

trusted `/host` owns Runtime/Data/Content physical integration。Business Definition仍只 import `@loomrealm/subsystem`；不得直接 import Wire、protocol、Platform、FSDB、HTTP 或 launcher packages。

M12 Content root只 materialize真实 author consumer需要的：

```text
ContentClient.record
ContentClient.resource
ContentReadOptions
ContentRecord
ContentResource
ContentReadError / ContentReadErrorCode
SubsystemScope.content
```

不为 HTTP surface symmetry发布 manifest/group/head/raw fetch/URL builder。

---

## 5. `@loomrealm/fsdb` — Frozen M12 Domain Core

M12新增 exactly one Node-specific FSDB package：

```text
@loomrealm/fsdb
```

理由不是分层对称，而是已有两个 production consumers：

```text
@loomrealm/fsdb-http
apps/desktop Content Service
```

它只拥有：

```text
FSDB Well-formed validation
immutable logical snapshot/index
deterministic database descriptor
ordinary entry + metadata logical identity
safe-open / same-handle currentness
OPEN / STALE / CLOSED state
read admission / lease / close drain
source-local validator facts
```

它不拥有：

```text
HTTP
LoomRealm Content API
contentVersion SHA-256 policy
installation registry
Game/Launcher/Main/Subsystem/Renderer
Repository / StorageProvider SPI
watch/hot reload
filesystem transaction layer
```

`@loomrealm/fsdb` 是正常可发布 workspace dependency：

```text
name          = @loomrealm/fsdb
version       = current workspace version
module        = ESM
engines       = Node >=20
publishConfig = public
exports       = root only
runtime deps  = 0 workspace deps / Node stdlib only
```

`@loomrealm/fsdb-http` 从 M12 起唯一新增 runtime workspace dependency就是 `@loomrealm/fsdb`；existing root API 与 HTTP conformance保持不变。精确修订见 [`M12_CORE_EXTRACTION.md`](https://github.com/lithdoo/loom-realm/blob/main/packages/fsdb-http/M12_CORE_EXTRACTION.md)。

---

## 6. Content Placement — Frozen M12

```text
Hostra PREPARE
→ current immutable prepared installation view
→ @loomrealm/fsdb snapshot
→ private immutable Content Index + manifest/version facts
→ apps/desktop readonly Content HTTP service
```

Desktop Content Service是 app-private composition responsibility，不单独建立 `@loomrealm/content-service` package。

Content version属于 Content contract：

```text
sha256:<64 lowercase hex>
```

由 prepare-time Content projection对 exact served bytes计算；不是 FSDB domain fact。

Hostra child Content credential injection属于 concrete Host/Runner integration，不进入 Runtime Control、M9 Data provisioning IPC、Frame/Render/business payload，也不要求新的 platform-port 或 credential protocol。

---

## 7. Launcher / Composition Ownership

`@loomrealm/game-launcher-hostra/pwa` own Game Entry consumption、own Platform manifest、key join、executable security resolution、PlatformLaunchPlan、LogicalGameBootstrap 与 RuntimeHosting/Runner integration。

它们不得吸收 Renderer/DataBroker/Input/Render/Content policy成为 mega-package。

```text
one-platform child mechanics
→ concrete launcher/integration package

one-app physical composition/policy
→ apps/* private implementation
```

M9 child-scoped Data provisioner继续属于 Hostra launcher integration；M12 child-private Content material注入只做最小独立 Host seam，不复用 Data provisioning protocol。

---

## 8. Physical Milestone Placement

```text
M10  deterministic RendererInputSource role behavior
M11  Render authority/publication/internal Renderer replica
M12  Desktop Content + Subsystem/Renderer consumers
M13  @loomrealm/map ordinary author SDK consumer
M14  BrowserWindow + physical Renderer Control/Input/Render presentation/Content
M15  PWA Runtime/Worker vertical
M16  PWA Renderer/Data/Input/Render/Content + cross-platform equivalence
```

M14 browser input必须复用 M10 source seam；presentation消费 M11 internal current replica；资源获取消费 M12 Renderer ResourceClient，不得新开 DOM→filesystem/URL shortcut。

PWA M16实现相同 logical Content API，但 **不依赖 Node-only `@loomrealm/fsdb`**；其 physical storage可以是 OPFS/Cache/Service Worker。

---

## 9. Target Workspace — Demand Driven

Current/next真实 workspace：

```text
packages/
├── foundation/
├── platform-ports/
├── wire/
├── game-package/
├── game-launcher-hostra/
├── game-launcher-pwa/
├── runtime-control/
├── renderer-control/
├── data/
├── fsdb/                 // M12
├── fsdb-http/
├── main/
├── subsystem/
├── renderer/
└── map/                  // M13

apps/
├── desktop/
└── pwa/                  // M15+
```

不存在 current requirement 的：

```text
packages/content/
packages/content-service/
packages/repository/
packages/asset-manager/
```

不得为了未来可能用途预建。

---

## 10. Conformance / Qualification Ownership

```text
@loomrealm/fsdb
    FSDB domain/core extraction tests

@loomrealm/fsdb-http
    existing FSDB HTTP conformance regression

apps/desktop M12
    Content API/auth/version/prepare/index/service vertical

@loomrealm/subsystem
    exact ContentClient author behavior/lifecycle

@loomrealm/renderer
    private ResourceClient version/cache/ownership behavior

M13
    business SDK usage, not protocol duplication

M14/M16
    complete physical E2E/equivalence
```

No giant E2E replaces package/role/contract evidence。

---

## 11. No Universal Frameworks

Forbidden unless a later real consumer reopens the boundary：

```text
GenericRpcPeer / GenericSchemaCodec
ConnectionRegistry / RuntimeDirectory
UniversalRendererServices / RendererPlatform
PlatformLaunchOptions / options:any
AuthorityEventBus / ObserverHub
Generic Input/Render manager framework
Generic Repository hierarchy
StorageProvider / StorageBackend SPI
InstallationManager / global mutable registry
AssetManager / loader/decoder plugin registry
Content RPC / credential protocol
GenericTransaction / 2PC
CurrentnessLease / Heartbeat / retry framework
```

---

## 12. Semver / Compatibility

`npm semver != protocol/profile version`。

Current first implementation只维护一个 current model；没有真实 compatibility obligation时不制造 fake v2/deprecated alias/dual parser。

`@loomrealm/fsdb` 与 `@loomrealm/fsdb-http` 都是正常 publishable workspace packages；后者的 M12 core extraction只改变 internal package ownership/dependency，不改变既有 v1 HTTP observable contract。

---

## 13. Core Rules Through M12

1. Foundation/Wire remain orthogonal primitives；  
2. protocol packages own mechanics, not role/Platform authority；  
3. Main remains single Session/Runtime/Frame/Renderer/Data authority owner；  
4. Input/Render/Content不复制 M8/M9 currentness/Broker authority；  
5. M10–M12均不因对称性新增 Platform Port；  
6. Business Definition只依赖 `@loomrealm/subsystem`；  
7. `@loomrealm/fsdb` 只因两个真实 consumers materialize，并完整拥有 readonly FSDB domain；  
8. `@loomrealm/fsdb-http` 仍只是 FSDB HTTP projection；  
9. Desktop Content Service留在 `apps/desktop`，不建立无必要 content-service package；  
10. Content version属于 Content projection，不属于 FSDB core；  
11. Renderer M12 ResourceClient保持 private，presentation仍是 M14；  
12. PWA M16共享 logical Content semantics，不共享 Node storage mechanics；  
13. no generic storage/content/repository/asset/credential framework without a demonstrated second consumer。
