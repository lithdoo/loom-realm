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
└── readonly Content Service
        ↓
Persistent Installation Registry / Content Index / object storage
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

## 4. Product Bootstrap / Composition Root

`apps/pwa` 的 Window bootstrap 只负责 browser-only startup：

```text
ensure Service Worker registration/readiness
→ acquire/select validated installation source
→ create Session Worker at Host-owned entry
→ create Window↔Session bootstrap/control channels
→ transfer bootstrap material/Ports
→ install Window Renderer/Input/Viewport/Presentation adapters
```

Session Worker 内部：

```text
receive/validate host bootstrap
→ create session-scoped PwaPlatform core
→ PwaPlatform.prepareGame(source)
→ obtain PreparedPwaGame
→ construct fresh RealmStateAuthority from PreparedRealmStateDefinition
→ Realm State READY
→ run Main(LogicalGameBootstrap, Main-facing platform view)
```

第一项 business Runtime side effect 必须满足：

```text
PWA PREPARE complete
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
→ resolve/preflight every executable module
→ validate installation/origin/Worker capability
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
    Installation Registry + Content Index

OPFS
    immutable body objects

Cache Storage
    optional derived cache only
```

`@loomrealm/fsdb` 保持 Node-only；不创建 generic filesystem provider 只为了复用 Desktop 实现。

Service Worker volatile memory不是 authority。SW 重启后必须能从 persistent facts 恢复 Content Service。

---

## 9. Installation Publish Atomicity

浏览器无法把 OPFS 与 IndexedDB 当作一个跨存储事务，因此“atomic install”定义为 **visibility/publish atomicity**：

```text
state = staging
→ write immutable objects
→ validate bodies / versions / executable bindings
→ build complete Content/Executable indexes
→ one persistent publish commit marks installation = complete
```

只有 `complete` installation 对 PREPARE / Content Service 可见。

如果浏览器中途退出：

```text
partial OPFS objects
+ no complete publish marker
= orphan/staging material
```

不得成为可运行 installation；后续 cleanup/GC 可回收。

若 persistent index仍存在但 required body 缺失/损坏，必须进入 installation integrity/currentness failure，不允许半坏游戏继续读取混合版本内容。

---

## 10. Executable Capability

Executable 与 ordinary Content 始终是两条 capability：

```text
PwaLaunchPlan
→ trusted executable resolver
→ same-origin/trusted module identity
→ Worker Runner import
```

与：

```text
ContentClient
→ /_lr/v1/games/...
→ Service Worker readonly Content Service
```

不得把普通 Content resource 转成任意 executable import capability，也不得把 module URL 泄漏给 Main/Renderer/business state。

Executable bytes → trusted module URL 的具体 physical resolver 必须在 PWA executable vertical 中冻结并 qualification；它可以复用 installation/object storage primitive，但不能复用普通 Content capability authority。

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

## 12. Session Lifecycle / Reload

v1 明确：

```text
PWA top-level Window reload/navigation
= current PWA Session terminal
+ old Session Worker / Subsystem Workers no longer current
+ next document creates a fresh Session
```

v1 **不承诺**像 Desktop BrowserWindow document reload 一样保持 Main/Runtime/Realm State Session 存活；不要为此提前引入 SharedWorker 或跨页面 Session daemon。

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

---

## 13. M16 Definition of Done

M16 从一开始使用独立 Session Worker baseline：

```text
Window bootstrap
→ Session Worker
→ PwaPlatform.prepareGame
→ complete PREPARE
→ Realm State READY
→ Main running in Session Worker
→ RuntimeHosting creates Subsystem Worker
→ planned business module
→ Runtime Control MessagePort
→ Subsystem initializing/ready
→ initial Frame
→ deterministic business result
```

至少覆盖：

```text
Session Worker bootstrap failure
PREPARE failure → zero Subsystem Worker side effect
manifest/key-set/module preflight failure
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

M16 MAY 使用最小 Renderer/Content fixture；这不代表完整 M17 product 已交付。

---

## 14. PWA Content Vertical

可在完整 M17 UI 前独立资格：

```text
fixture installation
→ persistent Registry/Index/object bytes
→ Service Worker /_lr/v1 handler
→ same-origin fetch
→ PWA-bound ContentClient
→ real Window / Dedicated Worker consumer
```

至少覆盖：

```text
manifest / record / group / resource
GET / HEAD
multi-segment ResourceKey
traversal/malformed rejection
exact sha256 contentVersion
ETag / If-None-Match 304
MIME
unknown/incomplete installation
schema/integrity failure
Service Worker restart/reconstruction
offline read from complete installation
abort/cancel
staging installation never visible
missing/corrupt persistent body fails closed
```

目标是证明 PWA 与 Desktop 提供同一个 Content contract，而不是只证明 OPFS 能读文件。

---

## 15. M17 Definition of Done

M17 在 M16 Session Worker baseline 上关闭：

```text
Renderer Control Window↔Session Worker
+ Renderer Data Window↔Subsystem Worker
+ Input
+ Viewport
+ Content
+ Web Presentation
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

---

## 16. Implementation Slices

```text
PWA-1 Browser bootstrap / Session Worker
    SW readiness + Host-owned Session Worker + Window↔Session bootstrap

PWA-2 PREPARE / Session authorities
    PwaLaunchPlan + RealmStateAuthority + Main in Session Worker

PWA-3 Worker Runtime
    RuntimeHosting + generic nested Worker Runner + Runtime Control

PWA-4 State / lifecycle
    real Realm State Worker binding + shutdown/replacement/failure closure

PWA-5 Content vertical
    persistent installation + SW Content API + ContentClient binding

PWA-6 Renderer Control / Data
    Window Renderer + Control Port + Data Broker/MessageChannel provisioning

PWA-7 Input / Viewport / Presentation
    real browser interaction + M13 projector

PWA-8 Product equivalence
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
```

`PwaPlatform` 是 logical product composition boundary，不要求所有代码位于同一 JS global：

```text
Window-side adapters
+
Session Worker platform core
+
Subsystem Worker hosting
+
Service Worker Content realization
```

它们共同组成一个 PWA Platform realization，而不是多个 application authorities。

---

## 18. Final Invariants

1. Browser Window 只承载 Renderer/Input/Viewport/Presentation 与 browser-only bootstrap；
2. Main + RealmStateAuthority 从 M16 起位于独立 Session Worker，不与 Renderer 共 event loop；
3. Main 与 RealmStateAuthority 只物理共置，logical authority 严格分离；
4. 每个 Subsystem Runtime 位于独立 Dedicated Worker；
5. Main 只按 `subsystemKey` launch，module/Worker/Port/storage material 不泄漏；
6. Worker Runner 是 Host-owned constructor entry，business module由 frozen plan精确选择；
7. Renderer Control、Runtime Control、Realm State、Renderer Data、provisioning 保持独立 plane；
8. Renderer Control 明确跨 Session Worker ↔ Window MessagePort；
9. Subsystem 在 Desktop/PWA 都只通过 `scope.content.record()` / `resource()` 使用 Content；
10. PWA 保持 Content API v1 的 HTTP/Fetch semantics，SW 只是 physical Content Service；
11. `@loomrealm/fsdb` 保持 Node-only；PWA 不为复用它发明 filesystem abstraction；
12. Installation 使用 staging → atomic visibility publish；半安装不可运行；
13. Service Worker volatile memory/cache 不成为 installation authority；
14. executable capability 与 ordinary Content capability 始终隔离；
15. PWA top-level reload 在 v1 产生 fresh Session，不为模拟 Desktop reload 引入 SharedWorker；
16. Window presentation stall 不得因 Main physical colocation直接冻结 Main control event loop；
17. M16 证明 Session Worker + Subsystem Worker Runtime vertical；M17 证明完整 Window product 与 Desktop business equivalence。
