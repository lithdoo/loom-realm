# PWA 产品组合设计

> 层级：产品组合 / 实施设计  
> 状态：Active Design / Implementation Planning；M16/M17 尚未完成  
> 最近复核：2026-10-07  
> 路线图：[M16 / M17 PWA](../../30-implementation/roadmap.md)  
> 正式契约：[PWA Launcher Profile v1](../../15-contracts/pwa-launcher-profile-v1.md)、[Content API v1](../../15-contracts/content-api-v1.md)、[正式契约目录](../../15-contracts/README.md)  
> 相关设计：[平台组合架构](../../10-architecture/platform-composition-system.md)、[存储与内容系统](../../10-architecture/storage-system.md)、[`@loomrealm/game-launcher-pwa` 设计](../../../packages/game-launcher-pwa/DESIGN.md)

本文定义 LoomRealm PWA 产品的 physical composition 与实施顺序。PWA 不建立第二套 Main、Subsystem、Realm State、Renderer 或 Content 语义；它只把 Desktop 的 process / loopback / filesystem realization 替换成 Browser Window / Dedicated Worker / MessagePort / Service Worker + browser persistent storage。

核心原则：

> **Browser Window 只承载展示与用户交互；Main 与 RealmStateAuthority 从 M16 起共置于独立 Session Worker，不与 Window Renderer 共享 event loop；每个 Subsystem Runtime 继续运行在独立 Dedicated Worker。**

这样 Desktop 与 PWA 都保持相同的物理隔离方向：Control Authority 不与 Presentation 主线程共阻塞，Renderer 卡顿不能直接冻结 Main 的 Runtime/Frame/lifecycle 控制。

Content 继续遵守另一条硬约束：

> **Subsystem 在 Desktop/PWA 都只通过 `ContentClient.record()` / `resource()` 使用 Content。PWA 保持现有 HTTP/Fetch contract，由 same-origin Service Worker + persistent browser storage 实现，不向业务 Runtime 暴露 OPFS/path/handle。**

PWA v1 同时冻结 browser-specific closure：

1. executable 通过 **private same-origin executable route + Executable Index** 被 Worker Runner import；不用 `blob:` URL 作为安装 executable identity；
2. Session 创建前必须通过 **Service Worker READY + version handshake**，Session/Subsystem Worker 再通过 private `runtime-info` probe 验证自己实际命中的 SW generation；SW 更新只在下一 Session 生效；
3. installation 使用 **staging → publish complete**、quota/persistence preflight、`complete/invalid` fail-closed 与 installation-local GC；
4. installed executable graph v1 必须是 **安装时可枚举、只使用 installation 内相对 ESM import 的完整 artifact graph**；不引入 import map/npm/runtime package resolver；
5. top-level reload/navigation/BFCache restore 都不得复活旧 Session；恢复 document 必须重新 SW gate 并创建 fresh Session。

---

## 1. Frozen Physical Topology

PWA baseline：

```text
Browser Window
├── product bootstrap
├── Renderer
├── Input source
├── Viewport source
├── Web Presentation / DOM
├── Service Worker registration/readiness
└── Window-side platform adapter
        │
        │ Renderer Control / Renderer Data / lifecycle MessagePorts
        ▼

Session Worker (Dedicated Worker)
├── Main                         Control Authority
├── RealmStateAuthority          Session business-state authority
├── session-scoped PwaPlatform core
├── PwaLaunchPlan
├── RuntimeHosting
└── Data/Control provisioning
        │
        ├── Dedicated Worker #1 → Subsystem Runtime
        ├── Dedicated Worker #2 → Subsystem Runtime
        └── ...

Service Worker
├── public readonly Content Service
│       /_lr/v1/games/...
├── private executable serving boundary
│       /_lr/internal/executables/...
└── private runtime-generation probe
        /_lr/internal/runtime-info
        ↓
Persistent Installation Registry
├── Content Index
├── Executable Index
└── installation-local immutable object storage
```

`Main` 与 `RealmStateAuthority` **物理共置、逻辑分离**：

```text
Main
    owns Session/Runtime/Frame/Activation/InputTarget control

RealmStateAuthority
    owns shared mutable business facts / revision / OCC / subscriptions
```

共置不允许 Main 直接解释 Realm State business values，也不允许 RealmStateAuthority 取得 Runtime/Frame/Session terminal authority。

`Renderer` MUST remain in Window because DOM/Canvas/Web Components/Input/Viewport belong to browser presentation context。

Subsystem MUST remain outside Window in Dedicated Worker Runtime。

---

## 2. Why Main Is Not In Window

禁止采用以下长期 baseline：

```text
Window
├── Main
├── RealmStateAuthority
├── Renderer
└── DOM
```

因为 Window event loop 上的同步 presentation workload：

```text
DOM mutation
layout / style work
Canvas/WebGL preparation
business Web Component synchronous work
input handler stall
```

会同时阻塞 Main 的 control/lifecycle/deadline processing，形成 Desktop/PWA 可观察差异。

目标是：

```text
Window Renderer stall
    MUST NOT by physical colocation directly stall
Session Worker Main event loop
```

这里要求的是独立 Worker execution context，而不是规定浏览器必须提供独立 OS process；OS process placement 属于浏览器实现细节。

---

## 3. Cross-platform Mapping

```text
Desktop / Hostra                    PWA
────────────────────────────────────────────────────────
Desktop Node                        Session Worker
├── Main                            ├── Main
├── RealmStateAuthority             ├── RealmStateAuthority
└── RuntimeHosting                  └── RuntimeHosting

BrowserWindow                       Browser Window
└── Renderer                        └── Renderer / DOM / Input

Runner subprocess                   Dedicated Worker
└── Subsystem                       └── Subsystem

localhost Content HTTP              same-origin Content Fetch
└── FSDB / filesystem               └── SW / persistent browser store
```

必须保持的是 logical authority / protocol / failure semantics，不要求 WebSocket bytes 与 MessagePort bytes、filesystem 与 OPFS、Node process 与 Worker 在物理上相同。

---

## 4. Product Bootstrap / Service Worker Readiness

`apps/pwa` 的 Window bootstrap 只负责 browser-only startup：

```text
register/find LoomRealm Service Worker
→ wait registration.active / navigator.serviceWorker.ready
→ require current Window has a controller
→ perform LoomRealm SW version handshake
→ Content/Executable Service READY
→ acquire/select validated installation source
→ create Session Worker at Host-owned entry
→ create Window↔Session bootstrap/control channels
→ transfer bootstrap material/Ports
→ install Window Renderer/Input/Viewport/Presentation adapters
```

### 4.1 READY means controlled + compatible

仅有“注册成功”或“存在 active worker”不足以创建 Session。PWA v1 的 READY 至少要求：

```text
Service Worker registration exists
∧ active worker exists
∧ navigator.serviceWorker.controller != null
∧ controller handshake returns supported protocolVersion
∧ controller build/generation is accepted by current product bootstrap
```

概念 handshake：

```ts
interface LoomRealmServiceWorkerHello {
  readonly protocolVersion: 1;
  readonly buildId: string;
  readonly generation: string;
}
```

具体 message schema 可保持 product-private；它不是新的 game/business protocol。

如果首次安装后 SW 已 active 但当前 document 尚未被 controller 控制，v1 可以要求一次正常 reload 后再创建 Session。禁止为了消除这一次 reload 而让 Session 在未受控制 document 上启动。

### 4.2 Upgrade policy: next Session only

一个已运行 Session 绑定其启动时通过 handshake 的 SW generation。v1 MUST NOT 依赖中途 controller replacement 改变该 Session 的 Content/executable physical realization。

```text
Session A starts with SW generation G1
→ G2 installs/waits in background
→ Session A continues on G1 assumptions
→ Session A ends / next top-level document
→ G2 becomes accepted controller
→ Session B starts on G2
```

因此 product update 不应使用“强制 `skipWaiting()` + `clients.claim()` 抢占当前运行 Session”作为默认升级语义。若未来引入 hot takeover，必须单独设计 generation/currentness 与 in-flight Content/executable safety；不属于 v1。

### 4.3 Worker-side generation verification

Window 接受某个 SW generation 后，不能只假设 Session Worker / Subsystem Worker 必然命中同一 generation，也不依赖 `WorkerNavigator.serviceWorker` 是否暴露 controller 信息。v1 使用 product-private 只读 probe：

```text
GET /_lr/internal/runtime-info
```

由当前实际拦截该 request 的 LoomRealm Service Worker 返回至少：

```ts
interface LoomRealmRuntimeInfoV1 {
  readonly protocolVersion: 1;
  readonly buildId: string;
  readonly generation: string;
}
```

流程：

```text
Window READY handshake accepts G1
→ Session Worker bootstrap carries expected G1
→ Session Worker fetch(runtime-info)
→ require returned generation == G1
→ only then PREPARE may continue

RuntimeHosting creates Subsystem Worker
→ Runner receives expected G1 as host-private bootstrap fact
→ Runner fetch(runtime-info)
→ require returned generation == G1
→ only then private executable import may begin
```

任何 probe failure、unsupported protocol/build 或 generation mismatch：

```text
MUST fail closed
MUST occur before first business Runtime side effect
MUST NOT silently switch Session to another SW generation
```

`runtime-info` 是 PWA product-private health/currentness endpoint，不属于 Content API v1，不携带 Game/Realm State/business data，也不向业务代码暴露。

Session Worker 内部：

```text
receive/validate host bootstrap
→ verify runtime-info generation
→ create session-scoped PwaPlatform core
→ PwaPlatform.prepareGame(source)
→ obtain PreparedPwaGame
→ construct fresh RealmStateAuthority from PreparedRealmStateDefinition
→ Realm State READY
→ run Main(LogicalGameBootstrap, Main-facing platform view)
```

第一项 business Runtime side effect 必须满足：

```text
Service Worker READY
∧ Session Worker runtime-info generation == accepted Window generation
∧ accepted SW generation stable for this Session
∧ PWA PREPARE complete
∧ Realm State READY
∧ Session Worker bootstrap valid
```

Window bootstrap 不是第二个 Session owner；Session/Runtime/Frame terminal 仍由 Main 决定。

---

## 5. PREPARE / PwaLaunchPlan

`PwaPlatform.prepareGame()` 内部委托 `@loomrealm/game-launcher-pwa`：

```text
obtain Game Entry
→ validate Game Package
→ project PreparedRealmStateDefinition
→ validate launch.pwa.json
→ exact Game ↔ PWA subsystem key-set join
→ resolve/preflight every executable module through Executable Index
→ validate installation complete/current
→ validate accepted SW generation / same-origin Worker capability
→ freeze PwaLaunchPlan
→ freeze LogicalGameBootstrap
→ freeze prepared Content installation view when required
──────────────────────────────────────────────────────
PREPARE complete
```

Main 只获得：

```text
LogicalGameBootstrap
subsystemKey
launch-attempt material
```

Main MUST NOT 获得：

```text
module URL
Worker constructor options
Service Worker route
OPFS path
Content storage identity
PwaLaunchPlan
```

---

## 6. RuntimeHosting / Nested Subsystem Workers

`RuntimeHosting` 位于 Session Worker physical composition，负责把 Main 的 logical launch 投影成 Dedicated Worker Runtime：

```text
Main
→ RuntimeHosting.launch(subsystemKey)
→ lookup frozen PwaLaunchPlan
→ create Dedicated Worker(generic Worker Runner)
→ provision Runtime Control / Realm State / Data material
→ Runner validates bootstrap
→ Runner verifies runtime-info generation
→ obtain exact private executable URL from frozen plan
→ import exact planned business Definition Module
→ validate SubsystemDefinitionFactory
→ runSubsystem(...)
```

Browser Worker environment允许 Dedicated Worker 创建 same-origin nested workers；实现仍需 qualification 覆盖目标浏览器。Product 不依赖 Window 代 Main 创建每一个 Subsystem Worker，避免额外的 Window-host RPC authority。

Generic Worker Runner 是 Host-owned constructor entry；business Definition Module 不是 Worker entry。

禁止：

```text
new Worker(businessModuleUrl)
Game config chooses arbitrary Worker entry/options
Main receives module URL
Subsystem discovers bootstrap through ambient globals
```

Unexpected Subsystem Worker termination → Runtime failure → Main-owned unwind；v1 不自动 restart。

---

## 7. MessagePort Planes

不同 logical plane 即使都使用 `MessagePort` 也必须隔离：

```text
Window ↔ Session Worker
    Renderer Control
    Renderer Data provisioning / Window endpoint transfer
    browser lifecycle / host bootstrap

Session Worker ↔ Subsystem Worker
    Runtime Control
    Realm State binding
    Renderer Data
    Runner provisioning/bootstrap
```

禁止建立 single mega-channel 来混合 Control、State、Data 与 platform provisioning。

### 7.1 Renderer Control

Main 与 Renderer 物理跨 Worker，因此 Renderer Control 明确采用 existing protocol + MessagePort carrier：

```text
Session Worker / Main
        ↕ Renderer Control MessagePort
Window / Renderer
```

Renderer Control loss/reconnect 继续服从现有 Renderer currentness/identity 规则；Window 不因 carrier loss自行取得 Session terminal authority。

### 7.2 Runtime Control

```text
Session Worker / MainRuntimeControlPeer
        ↕ MessagePort
Subsystem Worker / SubsystemRuntimeControlPeer
```

保持：

```text
created → connected → identified → initializing → ready
```

以及现有 timeout/terminal/failure mapping。

### 7.3 Realm State

RealmStateAuthority 与 Main 共置 Session Worker，但 Subsystem 仍只获得 Runtime-scoped RealmStateClient：

```text
Session Worker
RealmStateAuthority
        ↕ dedicated/private MessagePort binding
Subsystem Worker
Replaceable RealmStateClient
        ↓
SubsystemScope.state
```

State binding loss MUST NOT 自动成为 Runtime/Session failure；old subscription terminal、replacement fencing、`OUTCOME_UNKNOWN` 等 Realm State v1 语义不变。

### 7.4 Renderer Data

PWA Data Broker依据 Main current authority view创建 fresh MessageChannel：

```text
                    PWA Data Broker
                         │
                  MessageChannel
                    /          \
                   /            \
Window Renderer port      Subsystem Worker port
```

Broker 只负责 physical connection，不 mint generation/profile，不成为 DataAuthority，不把 transfer failure解释成 Frame failure。

---

## 8. Content: Keep Existing HTTP/Fetch Contract

### 8.1 Business API unchanged

Subsystem 继续：

```ts
const map = await scope.content.record("Map", "21");
const image = await scope.content.resource("Graphics", "Characters/player.png");
```

MUST NOT 改成：

```text
navigator.storage.getDirectory()
OPFS path lookup
FileSystemHandle
arbitrary physical URL
postMessage({ type: "read-file", path })
```

### 8.2 Physical realization

Desktop：

```text
ContentClient / ResourceClient
→ localhost Fetch
→ Desktop Content Service
→ trusted index / FSDB / filesystem
```

PWA：

```text
Subsystem Worker / Window Renderer
→ same-origin Fetch /_lr/v1/games/...
→ Service Worker Content Service
→ persistent Installation Registry / Content Index
→ immutable body storage
```

PWA 保持 Content API v1：

```text
GET / HEAD routes
status/error mapping
Content-Type
ETag
X-Loom-Content-Version
Cache-Control
If-None-Match / 304
problem+json
integrity semantics
```

Desktop bearer 与 PWA same-origin/SW authority可以不同；不要为了表面对称给 PWA 发明 bearer distribution。

### 8.3 Persistent browser storage

首版推荐：

```text
IndexedDB
    Installation Registry
    Content Index
    Executable Index

OPFS
    installation-local immutable object bodies

Cache Storage
    optional derived cache only
```

`@loomrealm/fsdb` 保持 Node-only；不创建 generic filesystem provider 只为了复用 Desktop 实现。

Service Worker volatile memory不是 authority。SW 重启后必须能从 persistent facts 恢复 Content Service 与 private executable serving boundary。

---

## 9. Installation Publish Atomicity / Quota / Eviction

### 9.1 Publish atomicity

浏览器无法把 OPFS 与 IndexedDB 当作一个跨存储事务，因此“atomic install”定义为 **visibility/publish atomicity**：

```text
state = staging
→ write installation-local immutable objects
→ validate bodies / versions / executable bindings
→ build complete Content Index + Executable Index
→ one persistent publish commit marks installation = complete
```

只有 `complete` installation 对 PREPARE、Content Service 与 executable resolver 可见。

如果浏览器中途退出：

```text
partial OPFS objects
+ no complete publish marker
= orphan/staging material
```

不得成为可运行 installation。

### 9.2 Quota / persistence preflight

安装器在大体积写入前 SHOULD 使用 browser storage estimate 能力检查当前 origin 的 usage/quota，并在产品策略允许时由 Window 侧请求 persistent storage。

概念流程：

```text
estimate storage
→ reject clearly insufficient capacity before heavy write
→ request persistent storage when appropriate
→ begin staging install
```

`persist()` 被拒绝不是新的 LoomRealm protocol error；产品 MAY 允许继续以 best-effort storage 安装，但必须明确这是可被浏览器回收的物理状态，不能把“安装成功”解释为“物理 bytes 永不丢失”。

Session Worker / Subsystem Worker 不申请 storage persistence；这是 Window/installer 的 browser-product policy。

### 9.3 Fail closed on eviction/corruption

installation 的 logical state 至少为：

```text
staging
complete
invalid
```

`complete` 只说明 installation 曾成功 publish，不代表浏览器以后绝不会驱逐/损坏 physical storage。

启动/PREPARE 至少验证：

```text
registry/index structural validity
selected executable entries and required executable bodies resolvable
accepted installation generation/currentness
```

Content body MAY 按需校验；但任何 indexed required object 在读取时发现 missing/hash mismatch/corruption，都必须：

```text
fail current request according to existing Content/integrity semantics
→ mark installation invalid (or otherwise make it unavailable to new PREPARE)
→ prohibit mixed/partial-version continuation as a healthy installation
→ require repair/reinstall before future Session startup
```

绝不允许：

```text
index says complete
+ some objects disappeared
→ silently fall back to network/unrelated cache
→ continue as if installation healthy
```

### 9.4 GC / uninstall

v1 优先使用 **installation-local object namespace**，不先实现跨 installation 全局 dedup/refcount：

```text
/installations/{installationId}/objects/...
```

这样 cleanup 可保持简单：

```text
staging/orphan installation
→ not visible
→ installer/startup maintenance may delete its namespace

uninstall
→ first make installation unavailable/non-current
→ delete registry/index facts
→ delete installation-local objects
→ clear derived Cache Storage entries if any
```

如果未来真实容量数据证明全局 content-addressed dedup 有价值，再单独引入 object ownership/refcount；v1 不为理论复用增加全局 GC 复杂度。

Cache Storage 仍只允许是 derived cache；删除 Cache 不影响 authority，残留 Cache 也不得让 invalid/uninstalled installation 继续可读。

---

## 10. Executable Capability / Private Resolver

Executable 与 ordinary Content 始终是两条 capability。

### 10.1 Frozen executable path

安装阶段：

```text
validated .mjs/module graph
→ immutable installation-local object bytes
→ Executable Index
      logical module path
      mime
      object identity/hash
      installation generation
```

Runtime PREPARE：

```text
launch.pwa.json logical module
→ validate exact installation binding
→ lookup Executable Index
→ produce host-private same-origin executable identity
→ freeze into PwaLaunchPlan private material
```

Runner：

```text
PwaLaunchPlan private executable identity
→ /_lr/internal/executables/{installationId}/{logicalModule...}
→ Service Worker private executable handler
→ verify installation complete/current
→ verify Executable Index entry
→ read exact immutable bytes
→ verify integrity/currentness
→ Response(Content-Type: text/javascript)
→ Dedicated Worker Runner import(url)
```

具体 route prefix 是 PWA product-private ABI；v1 baseline 使用 `/_lr/internal/executables/...` 表达边界。它 **不是 Content API v1**，不得由 `ContentClient` 暴露。

### 10.2 Frozen ESM graph rules

v1 installed executable 必须是安装时可验证、运行时不需要第二套 package resolver 的完整 browser artifact graph。

允许的 business executable import specifier：

```text
./foo.mjs
../shared/foo.mjs
```

前提是按浏览器 URL semantics 解析后仍落在**同一 installation 的 private executable namespace**，且目标 module 已存在于 Executable Index。

v1 禁止 business executable 依赖：

```text
bare specifier                 @loomrealm/foo / some-package
absolute application path     /scripts/foo.mjs
external URL                  https://... / http://...
opaque executable URL         blob:... / data:...
arbitrary runtime-computed import target
```

安装/构建阶段必须把 npm/workspace/external package dependency bundle 或 materialize 成 installation 内可索引的 `.mjs` graph。PWA runtime 不引入 import map、npm resolver、package registry 或 fallback network module loader。

Static import graph MUST 可枚举。若使用 dynamic `import()`，v1 只接受安装器可静态识别的 relative literal target，并必须把目标及其依赖纳入 Executable Index；无法在安装时枚举的 dynamic import 必须拒绝。

因此 executable currentness 可以保持简单：

```text
one published installation generation
+ one complete Executable Index
= exact allowed executable graph
```

相对 URL 解析不能变成 arbitrary same-origin script capability，也不能越出 installation executable namespace。

### 10.3 Capability isolation

必须保持：

```text
ContentClient
→ /_lr/v1/games/...
→ readonly ordinary Content
```

与：

```text
PwaLaunchPlan / Worker Runner
→ /_lr/internal/executables/...
→ executable module graph
```

不得：

```text
Content resource → blob URL → arbitrary import
ContentClient expose executable route builder
Renderer/business state carry module URL
Game config provide arbitrary absolute executable URL
Main receive module URL
```

v1 不以 `blob:` URL 作为 installed executable identity；same-origin hierarchical route 更直接保留 ESM relative import、CSP/origin 与 trusted installation resolver 边界。

Executable route handler和 Content handler MAY 复用 persistent object-store primitives，但 MUST NOT 合并 logical capability authority。

---

## 11. Window Renderer / Input / Viewport / Presentation

Window 负责：

```text
Renderer Store
Web Projector
business Custom Elements / Canvas / WebGL
DOM / Pointer / Keyboard / Gamepad input source
Viewport / DPR / resize source
```

Render flow：

```text
Subsystem RenderDomain
→ Renderer Data protocol
→ Window Renderer Store
→ Web Projector
→ business presentation
```

Input flow：

```text
DOM/Input source
→ Renderer Input protocol/gate
→ current InputTarget semantics
→ current Subsystem InputListener
```

不得缩短成：

```text
window keydown → subsystemWorker.postMessage(business event)
```

否则会绕过 Activation/InputTarget/Interest/currentness。

---

## 12. Session Lifecycle / Reload / BFCache

v1 明确：

```text
PWA top-level Window reload/navigation
= current PWA Session terminal
+ old Session Worker / Subsystem Workers no longer current
+ next document重新完成 SW READY handshake
+ next document creates a fresh Session
```

v1 **不承诺**像 Desktop BrowserWindow document reload 一样保持 Main/Runtime/Realm State Session 存活；不要为此提前引入 SharedWorker 或跨页面 Session daemon。

### 12.1 BFCache never revives a Session

Browser MAY 把 document 放入 back-forward cache 并在后续 back/forward 时恢复同一个 JS document。LoomRealm v1 不把这种 document restore 解释成旧 Session 可继续运行。

Window lifecycle policy：

```text
pagehide / top-level departure
→ mark current document Session epoch non-reusable
→ close/revoke Window-owned Renderer Control/Data/lifecycle Ports
→ request old Session Worker termination when possible

pageshow with persisted == true
→ MUST NOT reuse old Session Worker
→ MUST NOT reuse old Renderer identity / Control/Data Ports
→ ensure any surviving old Session material is fenced/terminated
→ rerun SW READY + generation handshake
→ create fresh Session Worker
→ create fresh Renderer/session bindings
```

不能依赖 `pagehide` 时所有异步 cleanup 一定完成；正确性来自 **fresh Session identity + old material fencing**。任何旧 Session Worker/Port 即使物理上短暂存活，也不得重新成为 current。

普通 reload/navigation 与 BFCache restore 因此共享一个简单规则：

> **离开 current document Session 后，返回/恢复只能创建 fresh Session，不能复活旧 Main/RealmStateAuthority/Subsystem Runtime。**

这不影响 logical business equivalence：跨平台要求相同 LoomRealm contract/result，而不是要求 host reload 的物理生命周期完全一致。

Session termination physical cleanup：

```text
Main commits terminal
→ stop new Runtime/Data admission
→ revoke/close Data/Control/State bindings
→ request/observe Subsystem Worker termination
→ dispose RealmStateAuthority
→ terminate Session Worker
→ Window disposes Renderer/Input/Presentation adapters
```

Service Worker 与 installed game storage 是 origin/product-scoped resource，不属于单个 Session，不随 Session dispose 删除。

SW update MAY 在 Session 存活期间进入 waiting/installing 状态，但不得改变当前 Session 已接受的 controller generation；新 generation 由下一 fresh Session 的 READY handshake 接受。

---

## 13. M16 Definition of Done

M16 从一开始使用独立 Session Worker baseline：

```text
Window bootstrap
→ SW READY + version handshake
→ Session Worker runtime-info generation verification
→ Session Worker
→ PwaPlatform.prepareGame
→ executable preflight through Executable Index/private resolver
→ complete PREPARE
→ Realm State READY
→ Main running in Session Worker
→ RuntimeHosting creates Subsystem Worker
→ Runner runtime-info generation verification
→ private same-origin module import
→ Runtime Control MessagePort
→ Subsystem initializing/ready
→ initial Frame
→ deterministic business result
```

至少覆盖：

```text
no SW controller / incompatible SW generation → zero Session business side effect
Session Worker runtime-info mismatch → zero business Runtime side effect
Subsystem Runner runtime-info mismatch → no business module import
Session Worker bootstrap failure
PREPARE failure → zero Subsystem Worker side effect
manifest/key-set/module preflight failure
executable outside index / missing body / bad MIME / bad integrity rejection
relative executable module dependency resolution
bare/absolute/external/opaque module specifier rejection
non-enumerable dynamic import rejection
Subsystem Worker constructor/bootstrap failure
planned module load/ABI failure
Runtime Control hello/ready/loss
unexpected Subsystem Worker termination
Main shutdown → Worker cleanup
real Worker Realm State client
old/replaced State Port cannot mutate current Runtime
Renderer Control carrier can be established Window↔Session Worker
Window presentation stall test does not execute Main on Window event loop
no automatic Runtime restart
```

M16 MAY 使用最小 Renderer/ordinary Content fixture；这不代表完整 M17 product 已交付。

---

## 14. PWA Installation / Content / Executable Vertical

可在完整 M17 UI 前独立资格：

```text
fixture installation
→ storage estimate / persistence policy
→ staging Registry/Content Index/Executable Index/object bytes
→ validate enumerable relative ESM graph
→ publish complete
→ SW READY/version handshake
→ Window/Session/Runner runtime-info generation checks
→ public Content route + private executable route
→ real Window / Session Worker / Subsystem Worker consumer
```

Content 至少覆盖：

```text
manifest / record / group / resource
GET / HEAD
multi-segment ResourceKey
traversal/malformed rejection
exact sha256 contentVersion
ETag / If-None-Match 304
MIME
unknown/incomplete/invalid installation
schema/integrity failure
Service Worker restart/reconstruction
offline read from complete installation
abort/cancel
staging installation never visible
missing/corrupt persistent body fails closed
```

Executable 至少覆盖：

```text
logical module → indexed private URL
same-origin module import
Content-Type JavaScript
relative module graph imports
bare/absolute/external/blob/data specifier rejection
non-enumerable dynamic import rejection
module missing/outside installation rejection
invalid/incomplete installation rejection
body hash/currentness mismatch rejection
ordinary Content cannot be promoted to executable
SW restart still reconstructs executable serving from persistent facts
runtime-info generation matches accepted Session generation
```

Storage 至少覆盖：

```text
insufficient quota detected before heavy install when estimate is available
persist granted / persist denied paths
crash during staging → never visible
orphan staging cleanup
complete installation body loss → invalid/fail closed
uninstall makes installation unavailable before object cleanup
Cache Storage residue cannot resurrect invalid/uninstalled installation
```

目标不是证明“OPFS 能读文件”，而是证明 **PWA installation 能可靠地产生同一个 Content contract和受控 executable capability，并且浏览器生命周期/存储失效不会形成半健康游戏。**

---

## 15. M17 Definition of Done

M17 在 M16 Session Worker baseline 上关闭：

```text
Renderer Control Window↔Session Worker
+ Renderer Data Window↔Subsystem Worker
+ Input
+ Viewport
+ full Content vertical
+ Web Presentation
+ reload/navigation/BFCache fresh-Session lifecycle
+ real game-lib / concrete game
```

Desktop ↔ PWA equivalence：

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
Desktop document reload == PWA top-level reload
```

M17 lifecycle qualification至少证明：

```text
normal reload → fresh Session
navigation away/back → old Session not revived
BFCache pageshow(persisted) → fresh Session Worker + fresh Renderer/session bindings
old Session Worker/Port late message cannot become current
```

---

## 16. Implementation Slices

```text
PWA-1 Browser bootstrap / SW gate / Session Worker
    SW registration + READY/version handshake + runtime-info probe + Host-owned Session Worker + Window↔Session bootstrap

PWA-2 Installation / executable resolver
    staging/publish + Content/Executable Index + private same-origin executable route + enumerable relative ESM graph qualification

PWA-3 PREPARE / Session authorities
    PwaLaunchPlan + RealmStateAuthority + Main in Session Worker

PWA-4 Worker Runtime
    RuntimeHosting + generic nested Worker Runner + runtime-info verification + Runtime Control

PWA-5 State / lifecycle
    real Realm State Worker binding + shutdown/replacement/failure + reload/BFCache fresh-Session closure

PWA-6 Content / storage vertical
    SW Content API + ContentClient + quota/persistence + invalidation/GC qualification

PWA-7 Renderer Control / Data
    Window Renderer + Control Port + Data Broker/MessageChannel provisioning

PWA-8 Input / Viewport / Presentation
    real browser interaction + M13 projector

PWA-9 Product equivalence
    current real game Desktop ↔ PWA E2E
```

当前完成状态仍唯一由 roadmap 与 qualification evidence 判定。

---

## 17. Package / Ownership Guard

不要因为 PWA 创建：

```text
PwaMain
PwaSubsystem
generic filesystem provider only for Node FSDB reuse
universal all-platform launcher
TransportRegistry
single mega MessagePort protocol
PWA application mega-package
Service Worker application authority
OPFS-backed generic business repository
automatic Runtime restart manager
SharedWorker Session daemon only to mimic Desktop reload
cross-installation global object GC/refcount before real need
runtime npm/package resolver or import-map system for installed business artifacts
```

`PwaPlatform` 是 logical product composition boundary，不要求所有代码位于同一 JS global：

```text
Window-side adapters
+
Session Worker platform core
+
Subsystem Worker hosting
+
Service Worker Content/executable physical realization
```

它们共同组成一个 PWA Platform realization，而不是多个 application authorities。

Service Worker 同时物理提供 Content route、private executable route 与 runtime-info probe，不意味着 capability authority 合并；Content 受 Content API v1 约束，executable 只由 trusted installation / PwaLaunchPlan / Worker Runner 消费，runtime-info 只暴露 product build/generation currentness fact。

---

## 18. Final Invariants

1. Browser Window 只承载 Renderer/Input/Viewport/Presentation 与 browser-only bootstrap；
2. Main + RealmStateAuthority 从 M16 起位于独立 Session Worker，不与 Renderer 共 event loop；
3. Main 与 RealmStateAuthority 只物理共置，logical authority 严格分离；
4. 每个 Subsystem Runtime 位于独立 Dedicated Worker；
5. Session 创建前必须完成 SW READY/controller/version handshake；未受控或版本不兼容时 fail closed；
6. Window、Session Worker 与 Subsystem Runner 必须通过 accepted generation + private runtime-info probe 收敛到同一 SW generation，mismatch 在 business side effect 前 fail closed；
7. 一个 Session 绑定启动时接受的 SW generation；默认升级只在下一 fresh Session 生效；
8. Main 只按 `subsystemKey` launch，module/Worker/Port/storage material 不泄漏；
9. Worker Runner 是 Host-owned constructor entry，business module由 frozen plan精确选择；
10. installed executable 通过 Executable Index + private same-origin hierarchical route解析；v1 不用 blob URL 作为 executable identity；
11. v1 executable graph 必须安装时可枚举，仅允许仍落在 current installation executable namespace 的 relative ESM specifier；不建立 runtime package/import-map resolver；
12. executable route 与 Content API route capability 隔离，即使底层复用 object store；
13. Renderer Control、Runtime Control、Realm State、Renderer Data、provisioning 保持独立 plane；
14. Renderer Control 明确跨 Session Worker ↔ Window MessagePort；
15. Subsystem 在 Desktop/PWA 都只通过 `scope.content.record()` / `resource()` 使用 ordinary Content；
16. PWA 保持 Content API v1 的 HTTP/Fetch semantics，SW 只是 physical Content Service；
17. `@loomrealm/fsdb` 保持 Node-only；PWA 不为复用它发明 filesystem abstraction；
18. Installation 使用 staging → atomic visibility publish；半安装不可运行；
19. installation storage persistence 是 best-effort physical policy，不改变 logical correctness；body eviction/corruption 必须使 installation fail closed/invalid；
20. v1 优先 installation-local object namespace 与简单 GC，不预造全局 dedup/refcount；
21. Service Worker volatile memory/derived Cache Storage 不成为 installation authority；
22. PWA top-level reload/navigation/BFCache restore 在 v1 都产生 fresh Session；旧 Session material 永远不能因 document restore 重新成为 current；
23. Window presentation stall 不得因 Main physical colocation直接冻结 Main control event loop；
24. M16 证明 SW gate/runtime-info + Session Worker + executable resolver/graph + Subsystem Worker Runtime vertical；M17 证明完整 Window product、fresh-Session lifecycle 与 Desktop business equivalence。