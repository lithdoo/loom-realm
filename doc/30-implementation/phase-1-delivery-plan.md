# 第一阶段交付计划

> 层级：实施计划  
> 状态：Tracking  
> 稳定程度：Evolving overall / **M12 Implemented / Qualified / Closed**
> 主要定义：M0..M16 实现顺序、当前 closure、Desktop/PWA qualification 边界  
> 依赖：[平台组合系统](../10-architecture/platform-composition-system.md)、[独立分包与发布架构](./package-architecture.md)、[测试策略](./testing-strategy.md)、[正式契约目录](../15-contracts/README.md)、[ADR 0030](../decisions/0030-freeze-m12-content-preimplementation-closure.md)  
> 最近复核：2026-09-08

核心顺序：

```text
Foundation/Wire
→ Game document
→ Runtime Control
→ Subsystem Runtime/Frame
→ Main authority
→ Hostra Runtime
→ Renderer Control
→ Data role seam
→ Desktop Data Broker
→ Input
→ Render
→ Content
→ loom.map
→ Desktop full E2E
→ PWA Runtime
→ PWA full E2E/equivalence
```

规则：

```text
Package Scope
!= Current Implementable Slice
!= Milestone Closure
```

首次实现只维护一个 current model；不制造 fake v2 / deprecated alias / generic framework。

---

## M0：文档与契约基线

Current docs统一 Game/Launcher/Main、Runtime/Frame、Renderer Control、Data/Input/Render/Content contracts与 Platform composition boundary。

---

## M1–M9：基础与 Hostra/Data 主干 ✅

```text
M1 Foundation + Wire                ✅
M2 Game Package                     ✅
M3 Runtime Control                  ✅
M4 Subsystem Runtime/Frame          ✅
M5 Main Core                        ✅
M6 Hostra Runtime vertical          ✅
M7 Renderer Control                 ✅
M8 Renderer Data role/core          ✅
M9 Desktop Data Broker              ✅
```

这些 milestone 已建立：logical Game bootstrap、Main authority、Hostra Runner/Control、Renderer Control、Data role seam、Desktop paired Data Broker/late provisioning。

---

## M10：User Input — Implemented / Qualified / Closed ✅

Exact closure包括：

```text
SubsystemScope.createInputListener
Interest contribution vs handler registration
retained State / Event no replay
mutation-gate known-no-commit convergence
RendererInputSource construction/lifetime
Effective gate
bounded State/Event/Reset publication
Desktop/Hostra real Data vertical
```

Root gate：

```text
npm run test:m10
```

M14/M16 physical DOM/Gamepad source必须复用 frozen M10 source API，不得新开 Renderer→Data shortcut。

---

## M11：Render — Implemented / Qualified / Closed ✅

Exact author surface：

```text
RenderNode
RenderDomainState
RenderEvent
RenderDomain
SubsystemScope.createRenderDomain(initialState)
RenderDomain.replace / emit / close
```

Closure包括：

```text
business Render authority
bounded publication via existing Data peer
Renderer internal replica
same-generation reconnect baseline rebuild
Domain/Node identity invariants
Event no future-carrier replay
Desktop/Hostra real vertical
formal subsystem-sender + renderer-receiver qualification
```

Root gate：

```text
npm run test:m11
```

M11不实现 DOM/Canvas/WebGL presentation；transport-equivalence role留 M16。

---

## M12：Content — Implemented / Qualified / Closed

M12已按冻结设计完整实施，并于 2026-09-08 在 Node 20.20.2 / 24.20.0 通过同一个 `npm run test:m12` 根门禁；证据见 [M12 qualification](./m12-qualification.md)。

Root implementation plans：

```text
M12_01_CONTENT_SERVICE.md
M12_02_SUBSYSTEM_CONTENT_CLIENT.md
M12_03_RENDERER_RESOURCE_CLIENT.md
M12_04_VERTICAL_INTEGRATION.md
M12_05_QUALIFICATION_CLOSURE.md
```

决策 provenance：

```text
ADR 0030
packages/fsdb-http/M12_CORE_EXTRACTION.md
```

### Exact package/ownership slice

M12新增 exactly one Node FSDB domain package：

```text
@loomrealm/fsdb
```

它有两个真实 production consumers：

```text
@loomrealm/fsdb-http
apps/desktop Content Service
```

`@loomrealm/fsdb` 完整拥有 readonly FSDB validation/snapshot/index/descriptor/ordinary+metadata lookup/safe-open/read-lease；不拥有 LoomRealm Content version/HTTP/installation authority。

它是 public publishable Node>=20 ESM workspace package。`@loomrealm/fsdb-http` 只增加这一项 runtime workspace dependency，existing root API/HTTP conformance保持不变。

M12 **不新增**：

```text
@loomrealm/content
@loomrealm/content-service
Repository hierarchy
StorageProvider SPI
InstallationManager/global registry
AssetManager
Content RPC / credential profile
```

### Desktop prepared Content view

```text
Hostra PREPARE success
→ current immutable prepared installation view
→ @loomrealm/fsdb snapshot
→ normalized public GameEntry manifest
→ private immutable Content Index
→ prepare-time Content version hashing
→ Desktop localhost Content Service
```

不建立 global mutable Installation Registry。Content source在 service lifetime内属于 Host-trusted readonly installation；不为恶意 concurrent physical writer建立 transactional filesystem abstraction。

### Content API semantics

```text
GET / HEAD
manifest / record / group / resource
record/group key = one logical segment
resource key = hierarchical logical ResourceKey
contentVersion = sha256:<64 lowercase hex>
ETag = quoted exact contentVersion
Desktop scoped bearer
Content capability != executable resolver
```

### Subsystem consumer

M12 exact author root：

```text
scope.content.record(namespace,key,{signal?})
scope.content.resource(namespace,resourceKey,{signal?})
```

以及最小 `ContentReadError` vocabulary、同步 local argument validation、detached return ownership。Author不观察 installationId、URL、bearer、HTTP status/headers、filesystem path。

`manifest()` / `group()` / raw fetch不因 HTTP surface symmetry而 root-export；若 M13出现第一个真实 group consumer，再最小显式 reopen。

### Renderer consumer

M12只冻结：

```text
logical namespace + hierarchical resourceKey + expectedContentVersion
→ Renderer-private ResourceClient
→ bytes + MIME + actualVersion
```

RenderNode.data→resource identity、decode/presentation、DOM/Canvas/WebGL/Audio留 M14。

### Real verticals

M12 closure必须有两个 production consumers：

```text
A. Hostra child → Runner → runSubsystem({content}) → business record/resource
B. Renderer ResourceClient → real Desktop Content HTTP → version-checked bytes
```

同时 qualification FSDB core extraction、existing fsdb-http regression、bearer auth、GET/HEAD/ETag/304/version/error/path confidentiality、caller cache-mutation isolation。

### Root closure target

实现后唯一 M12 gate：

```text
npm run test:m12
= npm run test:m11
+ @loomrealm/fsdb build/test/pack
+ fsdb-http regression/pack
+ Content API qualification
+ Subsystem ContentClient tests
+ Renderer ResourceClient tests
+ dependency/boundary tests
+ real M12 verticals
```

Node 20 + Node 24运行同一 gate。

该 gate与 qualification record现已关闭；M12后续变更继续遵循 M12/05 correctness-contradiction reopen门槛。

---

## M13：`loom.map` Business Definition — pending

```text
@loomrealm/map → @loomrealm/subsystem
```

M13作为第一个综合业务 consumer，必须真实使用：

```text
Frame / FrameOutcome / frame.call
M10 InputListener
M11 RenderDomain replace/emit/close
M12 ContentClient record/resource
```

不允许 Game/Launcher/Runtime Control/Platform/FSDB imports。

当前 module doc已同步 frozen M10–M12 API。若真实地图需求证明 `ContentClient.group()`必要，按 demand-driven rule最小 reopen author projection；不得 raw fetch旁路。

---

## M14：Desktop Full E2E — pending

```text
HostraPlatform.prepareGame
→ Main / Node Runner / Runtime Control
→ BrowserWindow + physical Renderer Control WS
→ M9 Data Broker
→ M10 real DOM/Gamepad RendererInputSource
→ M11 Render replica → presentation
→ M12 ResourceClient → Content bytes
→ M13 loom.map business flow
→ reconnect/reload/shutdown
```

M14不重新设计 Input/Render/Content logical semantics；只完成真实 Desktop physical composition/presentation。

---

## M15：PWA Runtime — pending

只关闭：

```text
PWA PREPARE
Worker Runner
RuntimeHosting
Runtime Control MessagePort
real Main↔Worker↔Subsystem trace
termination/failure
```

不提前 claim PWA Renderer/Data/Content full equivalence。

---

## M16：PWA Full E2E / Equivalence — pending

完成：

```text
Window Renderer Control
PWA DataConnectionBroker / MessageChannel provisioning
Input/Render full trace
PWA Content via same-origin Fetch + Service Worker + OPFS/Cache as needed
Renderer reload/replacement
Session shutdown
Hostra/PWA logical trace equivalence
```

比较：

```text
Game topology/bootstrap
Runtime/Frame/Activation/outcome
Renderer authority/Data currentness
Input delivery
Render replica
Content logical response
business-observable state
```

不比较：

```text
module path/bytes
PID vs Worker
WebSocket vs MessagePort
Desktop FSDB/HTTP vs PWA OPFS/Service Worker
```

Node-only `@loomrealm/fsdb` 不成为 PWA storage abstraction。

---

## Current Status

```text
M1  Foundation + Wire                  ✅
M2  Game Package                       ✅
M3  Runtime Control                    ✅
M4  Subsystem Runtime/Frame            ✅
M5  Main Core                          ✅
M6  Hostra Runtime                     ✅
M7  Renderer Control                   ✅
M8  Renderer Data                      ✅
M9  Desktop Data Broker                ✅
M10 User Input                         ✅ Implemented / Qualified / Closed
M11 Render                             ✅ Implemented / Qualified / Closed
M12 Content                            ✅ Qualified / Closed 2026-09-08
M13 loom.map                           pending
M14 Desktop full E2E                   pending
M15 PWA Runtime                        pending
M16 PWA full E2E/equivalence           pending
```

当前已关闭 executable root gate为 `npm run test:m12`。下一步进入 M13 `loom.map`，直接消费冻结的 `scope.content.record/resource`；若出现首个真实 `group()` consumer，按 demand-driven rule最小 reopen。
