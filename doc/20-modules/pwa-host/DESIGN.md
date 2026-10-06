# PWA 产品组合设计

> 层级：产品组合 / 实施设计  
> 状态：Active Design / Implementation Planning；M16/M17 尚未完成  
> 最近复核：2026-10-07  
> 路线图：[M16 / M17 PWA](../../30-implementation/roadmap.md)  
> 正式契约：[PWA Launcher Profile v1](../../15-contracts/pwa-launcher-profile-v1.md)、[Content API v1](../../15-contracts/content-api-v1.md)、[正式契约目录](../../15-contracts/README.md)  
> 相关设计：[平台组合架构](../../10-architecture/platform-composition-system.md)、[存储与内容系统](../../10-architecture/storage-system.md)、[`@loomrealm/game-launcher-pwa` 设计](../../../packages/game-launcher-pwa/DESIGN.md)

本文定义 LoomRealm PWA 产品从当前 Desktop/Hostra 体系迁移到 Browser Window + Dedicated Worker + MessagePort + Service Worker 时的产品组合边界与实施顺序。它不建立第二套 Main、Subsystem、Content 或 Renderer 语义；PWA 改变的是物理 hosting、transport 与 storage realization。

核心原则：

> **PWA 不是重写一套 LoomRealm。Main / Subsystem / Realm State / Renderer / Content 的逻辑契约继续成立；Desktop 的 Process / loopback / filesystem realization 替换为 Browser Window / Dedicated Worker / MessagePort / Service Worker + browser persistent storage realization。**

特别地：

> **Subsystem 使用 Content 的方式必须保持不变。PWA MUST 继续通过现有 `ContentClient` 的 `record()` / `resource()` 逻辑能力读取素材；不得让业务 Runtime 直接获得 OPFS、physical path、filesystem handle 或任意 URL 能力。Content HTTP/Fetch contract 保持不变，变化只发生在请求背后的物理 Content Service。**

---

## 1. Scope

PWA 产品最终负责组装：

```text
Browser Window
├── product bootstrap
├── PwaPlatform
├── Main
├── RealmStateAuthority
├── Renderer
├── PWA Content installation/service
└── Web Presentation
        │
        ├── Dedicated Worker #1 → Subsystem Runtime
        ├── Dedicated Worker #2 → Subsystem Runtime
        └── ...
```

M16 先关闭最小 Runtime vertical：

```text
Game source
→ PWA PREPARE
→ PwaLaunchPlan + LogicalGameBootstrap + PreparedRealmStateDefinition
→ Main
→ PwaPlatform.runtimeHosting.launch(subsystemKey)
→ Dedicated Worker Runner
→ Runtime Control over MessagePort
→ Subsystem READY
→ initial Frame
```

M17 再关闭完整产品等价：

```text
Window Renderer
+ Data
+ Input
+ Viewport
+ Content
+ Web Presentation
+ failure/recovery
+ Desktop ↔ PWA business-observable equivalence
```

本文不把 Service Worker installation prompt、浏览器 UI、manifest icon、push notification 等普通 Web/PWA 产品能力提升为 LoomRealm application authority。

---

## 2. Authority 与平台映射

跨平台 authority 不变：

```text
Main
    Control Authority

Realm State
    Session shared mutable business-state authority

Subsystem
    Domain execution / local-state authority

Renderer
    read-only presentation replica

Content
    readonly installation definition/resource authority
```

PWA 只替换物理 owner：

| Desktop / Hostra | PWA |
| --- | --- |
| Hostra BrowserWindow | Browser Window |
| LoomRealm Desktop Node composition | session-scoped `PwaPlatform` composition |
| Runner subprocess | Dedicated Worker Runner |
| loopback WebSocket / process carrier | `MessagePort` carrier |
| filesystem / FSDB | browser persistent installation storage |
| localhost Content HTTP service | same-origin Service Worker Content service |
| Hostra launch plan | `PwaLaunchPlan` |

物理 colocate 不产生第二 authority。即使 Main、Renderer、RealmStateAuthority 和 PwaPlatform 同处一个 Window agent，它们仍必须按现有逻辑边界交互，不因“都在浏览器里”共享任意 mutable object 或绕过正式协议。

---

## 3. Product Composition Root

`apps/pwa` 是预期的 product composition root。它负责创建一次 session-scoped `PwaPlatform`，完成 PREPARE 后再把同一个 platform 的 narrow Main-facing view 交给 Main。

概念顺序：

```text
apps/pwa
→ create PwaPlatform
→ PwaPlatform.prepareGame(source)
→ obtain PreparedPwaGame
→ construct fresh RealmStateAuthority from prepared state
→ install platform/session bindings
→ run Main(logicalBootstrap, platform)
→ attach Window Renderer / Presentation
```

`apps/pwa` / `PwaPlatform` MAY 负责 construct/bind/launch/dispose，但 MUST NOT 新建第二套：

```text
Session authority
Frame authority
Realm State authority
Renderer state authority
Content business state authority
```

不要为了 PWA 预造 `PwaGameEngine`、`PwaSessionManager`、`PwaRuntimeManager` 或 universal service locator。

---

## 4. PREPARE 与 `PwaLaunchPlan`

PWA Game acquisition 与 executable binding 由 `PwaPlatform.prepareGame()` 内部委托 [`@loomrealm/game-launcher-pwa`](../../../packages/game-launcher-pwa/DESIGN.md)。

PREPARE 必须在 first business Runtime side effect 前闭合：

```text
obtain Game Entry
→ validate Game Package
→ project PreparedRealmStateDefinition
→ validate launch.pwa.json
→ exact Game ↔ PWA subsystem key-set join
→ resolve / preflight every planned business module
→ validate installation/origin/Worker capability
→ freeze PwaLaunchPlan
→ freeze LogicalGameBootstrap
→ freeze prepared Content installation view when required
────────────────────────────────────────────────────────
PREPARE complete
→ first Worker side effect may begin
```

Main-facing `LogicalGameBootstrap` 继续只包含 logical topology 与 initial input。Main MUST NOT 看见：

```text
module URL
Worker constructor options
MessagePort
Service Worker route
OPFS path
Content storage identity
PwaLaunchPlan
```

Main 的 launch 仍然只表达：

```text
launch(subsystemKey, launch-attempt material)
```

---

## 5. Worker RuntimeHosting

PWA `RuntimeHosting` 的物理工作是把 Desktop 的“创建 Runner process”替换为“创建 Dedicated Worker Runner”。

```text
Main
→ PwaPlatform.runtimeHosting.launch(subsystemKey)
→ lookup frozen PwaLaunchPlan
→ create Dedicated Worker(generic runner entry)
→ provision bootstrap material + transferred Ports
→ Runner validates bootstrap
→ Runner imports exact planned business module
→ validate SubsystemDefinitionFactory
→ runSubsystem(...)
```

Business Definition Module 不是 Worker constructor entry。Generic Worker Runner 属于 Platform；它拥有 bootstrap validation、planned import、carrier provisioning、shutdown/supervision 等 platform mechanics。

禁止：

```text
new Worker(businessModuleUrl)
Game config chooses arbitrary Worker entry/options
Main receives module URL
Subsystem searches global bootstrap Port
```

Unexpected Worker termination 是 hosting/runtime failure；PWA 不自动重启 Runtime，不得绕过 Main 的统一 terminal/unwind ownership。

---

## 6. MessagePort Planes

PWA 中 `MessageChannel` / `MessagePort` 是主要跨 agent carrier，但不同 logical plane 仍保持隔离。

至少包括：

```text
Runtime Control Port
Realm State Port
Renderer Data Port
Runner provisioning/bootstrap transfer
```

它们不得因为都使用 MessagePort 而合并成一个 application mega-channel。

### 6.1 Runtime Control

M16 首先关闭：

```text
MainRuntimeControlPeer
↕ MessagePort carrier
SubsystemRuntimeControlPeer
```

并保留现有：

```text
created
→ connected
→ identified
→ initializing
→ ready
```

语义及 terminal/failure mapping。

### 6.2 Realm State

Realm State v1 已有 browser/Worker-compatible MessagePort realization。PWA Runtime 直接复用该 logical client/authority 模型：

```text
Window RealmStateAuthority
↕ MessagePort
Worker ReplaceableRealmStateClient
→ SubsystemScope.state
```

旧 binding/subscription 的 terminal、replacement、generation fencing、`OUTCOME_UNKNOWN` 等现有语义不因 PWA 改变。

### 6.3 Renderer Data

M17 中 PWA Data Broker 在 current Session/Renderer/subsystem/generation/profile 事实下创建 MessageChannel，并分别把两端 provision 给 Renderer 与目标 Worker。Broker 只负责物理 connection；不成为 DataAuthority，也不把 transfer failure解释成 Frame failure。

---

## 7. Content：保持现有 HTTP/Fetch 接口

### 7.1 不改变 Subsystem 使用方式

Subsystem 继续只拿到：

```ts
interface ContentClient {
  record(namespace: string, key: string, options?: ContentReadOptions): Promise<ContentRecord>;
  resource(namespace: string, key: string, options?: ContentReadOptions): Promise<ContentResource>;
}
```

业务代码在 Desktop 与 PWA 必须保持同形：

```ts
const map = await scope.content.record("Map", "21");
const image = await scope.content.resource("Graphics", "Characters/player.png");
```

PWA MUST NOT 要求 game-lib / Subsystem 改成：

```text
navigator.storage.getDirectory()
OPFS path lookup
filesystem handle
arbitrary fetch URL
postMessage({ type: "read-file", path })
```

如果支持 PWA 需要修改业务侧 Content 使用方式，说明 platform Content boundary 已被破坏。

### 7.2 HTTP contract 保持不变

PWA 继续实现 [Content API v1](../../15-contracts/content-api-v1.md) 的相同 route/method/status/header/body 语义：

```http
GET  /_lr/v1/games/{installationId}/manifest
HEAD /_lr/v1/games/{installationId}/manifest

GET  /_lr/v1/games/{installationId}/records/{namespace}/{key}
HEAD /_lr/v1/games/{installationId}/records/{namespace}/{key}

GET  /_lr/v1/games/{installationId}/groups/{namespace}/{key}
HEAD /_lr/v1/games/{installationId}/groups/{namespace}/{key}

GET  /_lr/v1/games/{installationId}/resources/{namespace}/{key...}
HEAD /_lr/v1/games/{installationId}/resources/{namespace}/{key...}
```

成功与失败继续使用同一：

```text
status/error mapping
Content-Type
ETag
X-Loom-Content-Version
Cache-Control
If-None-Match / 304
problem+json
integrity semantics
```

PWA 不需要真的启动一个 localhost listening HTTP server。保持的是 **HTTP/Fetch contract**，不是 Desktop 的 physical server topology。

### 7.3 Desktop 与 PWA 的 physical realization

Desktop：

```text
Subsystem / Renderer
→ ContentClient / ResourceClient
→ fetch(http://127.0.0.1:.../_lr/v1/...)
→ Desktop Content Service
→ trusted Content Index
→ @loomrealm/fsdb
→ filesystem
```

PWA：

```text
Subsystem Worker / Renderer
→ ContentClient / ResourceClient
→ fetch(same-origin /_lr/v1/...)
→ Service Worker fetch handler
→ persistent Installation Registry / Content Index
→ browser local object storage
```

`@loomrealm/fsdb` 保持 Node-only，不为 PWA 增加 filesystem-provider abstraction。PWA 实现相同 Content logical semantics，而不是把 FSDB scanner/safe-open 逻辑移植到浏览器。

### 7.4 Service Worker 是 PWA Content Service

Service Worker 对 `/_lr/v1/games/...` route 执行：

```text
parse + validate logical identity
→ verify installation exists and is complete
→ lookup trusted persistent Content Index
→ locate immutable body object
→ read bytes
→ verify currentness/integrity when required
→ construct standard Response
```

Service Worker MAY 随时被浏览器终止，因此它的内存 cache、open handle、temporary map 都不是 authority。每次重建后必须能从 persistent installation facts 恢复正确响应。

Service Worker 不承担：

```text
Runtime Tick
Frame Stack
Renderer Control
Realm State authority
User Input
business execution
```

### 7.5 Persistent installation layout

第一版建议把职责分为：

```text
Installation Registry
    installationId / state / metadata

Content Index
    logical identity → MIME / size / contentVersion / object identity

Object Store
    immutable response body bytes
```

Browser physical primitive 可采用：

```text
IndexedDB
    structured Installation Registry + Content Index

OPFS
    immutable body objects

Cache Storage
    optional derived HTTP response cache
```

这些是 implementation choices，不成为 Subsystem/Renderer observable API。

`Cache Storage` 若引入，只能是可丢弃的 derived cache；Installation Registry + Content Index + object bodies 才能恢复 Content Service。删除/失效 installation 后，残留 Cache response 不得继续成为 authority。

### 7.6 Content-addressed body 是推荐布局，不是新 logical contract

Content API v1 已冻结：

```text
contentVersion = sha256:<64 lowercase hex>
```

并由 exact successful full-body representation bytes 计算。因此 PWA object store MAY 直接使用 hash/object identity 保存 immutable bytes，例如：

```text
Content logical identity
→ Content Index
→ sha256 object identity
→ immutable bytes
```

这只是物理 storage layout；业务仍只看 `resourceKey/contentVersion`，不获得 object path/hash file handle。

### 7.7 Authorization

Desktop 保持 loopback + scoped bearer。PWA 使用 same-origin + Service Worker installation authority。

PWA MUST NOT 仅为了与 Desktop request header 长得一样而制造额外 bearer distribution protocol。

因此可以共享 ContentClient 的 route/response validation/JSON parse/error mapping 核心，但 platform binding MAY 不同：

```text
Desktop binding
    origin + installationId + bearer

PWA binding
    same-origin + installationId
```

外部暴露的仍是相同 `ContentClient`。不要把 Desktop bearer 改成模糊的全平台 optional token 规则来削弱 Desktop invariant。

### 7.8 Executable 与 ordinary Content 继续隔离

浏览器中 executable module 与 resource 最终都可能具有 URL-like physical identity，但 capability MUST 分开：

```text
PwaLaunchPlan
→ trusted executable resolver
→ Worker Runner import
```

与：

```text
ContentClient
→ /_lr/v1/games/...
→ Service Worker readonly Content Service
```

不得：

```text
Content resource → blob URL → arbitrary import
Render State carry executable URL
ContentClient expose installation internal module location
```

### 7.9 Renderer ResourceClient

Render/business data 继续只携 logical resource reference：

```text
resourceKey + contentVersion
```

Renderer 再通过 Content API 读取 bytes。PWA Render state 不得携带 `blob:` URL、OPFS path、FileSystemHandle 或 Service Worker internal key。

---

## 8. Installation Atomicity

PWA installation/import 是 Content/Platform PREPARE 之前的物理产品 workflow；它不得暴露半安装的 current installation。

建议 installation state 至少区分：

```text
installing
complete
failed / removable
```

典型安装流程：

```text
acquire package/source
→ validate Game Entry
→ validate PWA launch manifest
→ import/validate Content bodies
→ calculate exact contentVersion / integrity facts
→ write immutable objects
→ build persistent Content Index
→ preflight executable bindings
→ atomically publish installation as complete
```

只有 `complete` installation 才能被 PWA PREPARE / Content Service 选为 current validated installation。

浏览器/页面/Service Worker 中途终止后，未完成 installation 不能因部分 object 已存在而变成可运行游戏；应恢复为 incomplete/cleanup state，并按 Content API 映射为相应 installation conflict，而不是返回混合版本内容。

---

## 9. Renderer / Input / Presentation

M17 Window side继续复用当前逻辑：

```text
Subsystem RenderDomain
→ Renderer Data protocol
→ Window Renderer current Store
→ Web Presentation projector
→ business Custom Elements / Canvas / WebGL
```

输入反向：

```text
DOM / Pointer / Keyboard / Gamepad
→ RendererInputSource
→ existing Input protocol/gate
→ Main current InputTarget
→ current Frame / Subsystem InputListener
```

不得缩短为：

```text
window keydown → worker.postMessage(business event)
```

否则会绕过现有 Activation/InputTarget/Interest/currentness 语义。

---

## 10. M16 Definition of Done

M16 只签署 PWA Runtime vertical，不冒充完整 PWA product：

```text
Game source
→ PwaPlatform.prepareGame
→ complete PREPARE
→ PreparedPwaGame
→ Realm State READY
→ Main
→ Pwa RuntimeHosting
→ Dedicated Worker Runner
→ planned business module
→ Runtime Control MessagePort
→ Subsystem initializing/ready
→ initial Frame
→ deterministic business result
```

至少覆盖：

```text
PREPARE failure → zero Worker side effect
manifest/key-set/module preflight failure
Worker constructor/bootstrap failure
planned module load/ABI failure
Runtime Control hello/ready path
Runtime Control loss
unexpected Worker terminate
Main shutdown → Worker cleanup
Realm State MessagePort client works in real Worker
old/replaced Port cannot mutate current Runtime
no automatic Worker restart
```

M16 MAY 使用不依赖完整 Renderer/Content 的最小 fixture；这不代表 M17 Content 产品能力已交付。

---

## 11. PWA Content Vertical

在 M17 完整 UI 前，可独立关闭一条 Content qualification vertical：

```text
fixture installation
→ persistent Registry/Index/object bytes
→ Service Worker /_lr/v1 handler
→ same-origin fetch
→ PWA-bound ContentClient
→ real browser / Worker consumer
```

至少复用/镜像 Content API conformance：

```text
manifest / record / group / resource success
GET / HEAD equivalence
multi-segment ResourceKey
segment traversal / malformed rejection
exact sha256 contentVersion
ETag exact mapping
If-None-Match → 304
MIME
unknown installation/content
incomplete installation → conflict
schema/integrity failure
Service Worker restart/reconstruction
offline read from complete local installation
abort/cancel behavior
```

目标不是证明“OPFS 能读文件”，而是证明 PWA 与 Desktop 提供同一个 LoomRealm Content Service contract。

---

## 12. M17 Definition of Done

M17 在 M16 基础上关闭真实 product composition：

```text
Window Renderer
+ Data Broker
+ Input
+ Viewport
+ Content
+ Web Presentation
+ current game-lib / concrete game
```

最终需要对同一 logical fixture / game scenario 做 Desktop ↔ PWA equivalence：

```text
same logical input sequence
→ same Frame/Call observable semantics
→ same Realm State business facts
→ same game result
→ equivalent logical Render state
→ equivalent failure classification / cleanup guarantees
```

不要求：

```text
WebSocket bytes == MessagePort bytes
Node process == Worker
filesystem path == OPFS layout
DOM timing bit-for-bit equal
```

要证明的是 logical contract 与 business-observable result 等价，而不是 physical topology 相同。

---

## 13. 推荐实施切片

为降低一次性变更面，建议按真实 vertical 分批：

```text
PWA-1 PREPARE
    finish PwaLaunchManifest / join / resolver / PreparedPwaGame

PWA-2 Worker Runtime
    PwaPlatform + RuntimeHosting + generic Worker Runner + Runtime Control MessagePort

PWA-3 State / lifecycle
    real Worker Realm State binding + shutdown/replacement/failure closure

PWA-4 Content vertical
    persistent installation view + Service Worker Content API + PWA ContentClient binding

PWA-5 Renderer/Data
    Window Renderer + Data Broker + MessageChannel provisioning

PWA-6 Input/Viewport/Presentation
    real browser interaction and M13 projector

PWA-7 Product equivalence
    current real game/fixture Desktop ↔ PWA E2E
```

该切片是实施建议，不建立第二份 milestone 状态；当前完成状态仍唯一由[路线图](../../30-implementation/roadmap.md)与相应 qualification evidence 判定。

---

## 14. Package / Ownership Guard

不要因为 PWA 工作创建：

```text
generic filesystem provider 只为复用 Node FSDB
universal all-platform launcher
TransportRegistry
single mega MessagePort protocol
PWA Renderer/Main/Content mega-package
Service Worker application authority
OPFS-backed generic business repository
automatic Runtime restart manager
```

允许复用的是已有 logical contracts、carrier codec、validation primitive 与经过真实第二 consumer 证明可共享的纯机制；不应为了 Desktop/PWA 表面“代码对称”提前抽象 physical backend。

---

## 15. Final Invariants

1. PWA 改变 physical hosting，不建立第二套 application authority；
2. Product caller 面向 session-scoped `PwaPlatform`，Main 不直接消费 PWA launcher/Game Package；
3. Main 只按 `subsystemKey` launch，module/Worker/Port/storage material 不泄漏给 Main；
4. Generic Worker Runner 是 constructor entry，business module 由 frozen plan 精确选择；
5. Runtime Control、Realm State、Data 即使都使用 MessagePort，也保持独立 logical plane；
6. Subsystem 在 Desktop/PWA 都只通过 `scope.content.record()` / `resource()` 使用 Content；
7. PWA 保持 Content API v1 的 HTTP/Fetch route、status、header、version、cache、integrity semantics；
8. PWA Service Worker 是 Content Service 的 physical realization，不是 Runtime/Main/State authority；
9. `@loomrealm/fsdb` 保持 Node-only；PWA 不为复用它而发明 generic filesystem provider；
10. Persistent Installation Registry/Content Index/object bodies 可恢复 Service Worker 正确性；volatile worker memory/cache 不成为 authority；
11. Cache Storage 若使用只作为 derived cache，不可绕过 installation currentness；
12. executable capability 与 ordinary Content capability 始终隔离；
13. Renderer/Render State 只携 logical resource reference，不携 physical URL/path/handle；
14. M16 证明 Worker Runtime vertical；M17 证明 Window 产品组合及 Desktop↔PWA business equivalence；
15. 如果 PWA 需要修改 game-lib/Subsystem 的 Content 调用方式，优先视为 platform boundary 设计错误，而不是业务适配需求。
