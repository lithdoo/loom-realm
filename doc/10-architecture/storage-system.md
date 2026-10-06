# 存储与内容系统

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：只读 Game Package/Content、Platform executable installation、Realm State document/bootstrap boundary、逻辑 Content API、Package Index、Repository、资源和路径安全  
> 依赖：[系统架构总览](./system-overview.md)、[运行时启动与连接建立系统](./runtime-bootstrap-system.md)、[Realm State](./realm-state-system.md)  
> 正式契约：[Game Package v1](../15-contracts/game-package-v1.md)、[Realm State v1](../15-contracts/realm-state-v1.md)、[Hostra Launcher Profile v1](../15-contracts/nodejs-launcher-profile-v1.md)、[PWA Launcher Profile v1](../15-contracts/pwa-launcher-profile-v1.md)、[Content API v1](../15-contracts/content-api-v1.md)  
> 最近复核：2026-10-05

## 1. 设计目标

为 Main、Subsystem、Renderer提供安全、只读、按需 Content 访问，同时严格隔离：

```text
Game logical topology / initial document facts
Prepared Realm State business baseline
Platform executable binding/capability
Readonly Content capability
physical storage path / URL
business persistence workflow/data
```

> **Game Package声明 logical Subsystem identity、initial Frame input 与 optional Realm State initial document；Platform Launcher把 validated Game facts投影成 Main/Realm State prepared inputs并选择当前平台 executable implementation；trusted Runner拥有执行能力；Content API只拥有逻辑只读能力。Save/Load 若存在，是 business workflow，不成为 Realm State bootstrap 或 Content authority。**

Game Package、Content、Realm State 与 business persistence 职责不同：

```text
Game Package
    installation/document contract

Content
    readonly installation definitions/resources

Realm State
    Session shared mutable business facts

Save/Load business
    game/product-defined persistence read/write/migration workflow
```

同一个 `(namespace,key)` 风格命名不能成为把它们合并成 generic repository/store 的理由。

---

## 2. Installation Topology

长期概念：

```text
Validated Installation
├── game.json
│     └── optional Realm State initial document definition
├── launch.hostra.json          optional when Hostra-supported
├── launch.pwa.json             optional when PWA-supported
├── executable Definition artifacts
├── FSDB data
└── resources
        ↓ validate/install
Installation Registry / Package Index
        ├── Hostra executable resolver → HostraLaunchPlan → Node Runner
        ├── PWA executable resolver    → PwaLaunchPlan    → Worker Runner
        └── readonly content resolver  → Content API
```

并非每个 installation必须支持所有平台；当前要在某平台启动时，对应 Platform Launch Manifest必须存在并完整覆盖 Game logical key set。

Executable module与普通 Content Resource必须保持 capability 隔离。

Game Entry 中的 Realm State `state.records` 是 declarative initial business document data；它不是 Content Resource、不是 executable material、不是 live RealmStateAuthority，也不是 Save/Load document。

### M12 Desktop implementable slice

M12不要求先实现全局 mutable Installation Registry。当前 Desktop slice冻结为：

```text
successful Hostra prepare
→ one current immutable prepared installation view
→ opaque installationId
→ normalized public manifest
→ immutable Content Index
→ Desktop Content Service
```

未来 persistent/multi-install registry可以成为该 view 的来源，但不是 M12 application authority，也不得为 M12预建 generic registry/service locator。

---

## 3. Game Entry / Realm State / Platform Launch / Content

```text
Game Entry document
    logical topology
    initial Frame input
    optional Realm State initial document definition

Launcher prepared projections
    LogicalGameBootstrap
    PreparedRealmStateDefinition

RealmStateAuthority
    consumes PreparedRealmStateDefinition
    owns Session mutable business Records

Platform Launch Manifest
    current-platform key → executable business artifact binding

Platform executable resolver
    validates binding and creates host-private executable target

Content API
    logical readonly GET/HEAD
    manifest / record / group / resource
```

必须保持：

```text
GameEntryV1.state
    != PreparedRealmStateDefinition
    != live RealmStateAuthority
    != readonly Content resource
    != Save/Load data

PreparedRealmStateDefinition
    != LogicalGameBootstrap
    != PlatformLaunchPlan
    != persistence restore seed
```

禁止：

```text
Game Entry grant arbitrary executable capability
Game Package document object become Runtime State authority
RealmStateAuthority parse game.json / formatVersion / Platform manifest
Content API request arbitrary executable path
Content API mutate Realm State
Content API start Runtime
Renderer execute Platform-selected Definition Module
Render State carry physical module/content path
business payload carry content/bootstrap credential
Save/Load data become privileged Realm State bootstrap input
```

---

## 4. Package / Runtime Bootstrap

```text
read/validate game.json
→ validate optional Realm State initial document definition
→ read/validate current Platform Launch Manifest
→ exact Game↔Platform Subsystem key-set join
→ resolve every required current-platform Definition Module
→ validate installation containment/security + hosting capability
→ freeze immutable PlatformLaunchPlan
→ project/freeze LogicalGameBootstrap
→ project/freeze PreparedRealmStateDefinition
→ freeze current prepared Content view when Content is required
────────────────────────────────────────────────────────────
PREPARE complete
→ construct fresh RealmStateAuthority from PreparedRealmStateDefinition
→ install immutable prepared Game baseline
→ derive initial materialized membership
→ revision/version = 0
→ Realm State READY
────────────────────────────────────────────────────────────
first business Runtime side effect may begin
→ Main creates logical Launch Attempt
→ RuntimeHosting launches by subsystemKey
→ Host-owned Runner imports planned module
```

Realm State bootstrap MUST NOT apply Save/Load current seed or sparse persistence override。If a game restores persistence data, that happens after business Runtime starts and is expressed through ordinary RealmStateClient operations。

Preflight config/join/resolution/capability failure必须发生在任何 business Runtime side effect前。Realm State READY 同样是 first business Runtime side effect 的前置条件。

Definition Module actual ESM import/default-export ABI validation MAY在 Runner中执行；失败属于 required Runtime bootstrap failure，并触发统一 cleanup。

M12 required Content capability若在 business initialization前无法构造，同样属于 Runtime bootstrap failure；Runtime建立后的 ordinary Content read rejection不是自动 Runtime/Frame failure。

Realm State ordinary conflict/binding-local failure也不是 Content/storage failure，不能由 Content Service/Repository 层解释或恢复。

---

## 5. Executable Identity Boundary

Executable module path/URL不是 Subsystem application identity。

```text
subsystemKey
    application identity

Platform manifest module
    installation-local executable binding

resolved filesystem path / module URL
    host-private executable material
```

Hostra与PWA可以为同一 `subsystemKey` 解析不同 artifact。

跨平台不变量是：

```text
same logical key
same SubsystemDefinitionFactory ABI
same formal protocol semantics
same business-observable result for same logical scenario
```

不要求 same path/bytes/build artifact。

RealmStateKey 是另一套 business Record identity；它不能替代 subsystemKey/executable identity，也不能被 module path/Content identity替代。

---

## 6. Read vs Execute vs Mutable State vs Persistence Capability

必须区分：

```text
Platform Executable Module Resolver
    may resolve/import only plan-declared trusted business executable artifact

Readonly Content API
    reads logical installation content only

RealmStateClient
    reads/commits/subscribes Session shared mutable business Records

Business persistence capability
    game/product-selected storage access for Save/Load workflow
```

可以复用底层 Installation Registry、安全路径、hash/integrity primitive，但不得因为某文件可作为 executable module就扩大普通 Content client权限。

Realm State runtime capability也不得通过 Content API、filesystem handle、FSDB record 或 Resource URL旁路实现。

Save/Load persistence capability likewise MUST NOT become RealmStateAuthority or Content authority merely because its backing storage is filesystem/FSDB/OPFS/etc。

```text
validated executable target
!= ordinary content resource
!= Realm State Record
!= Save/Load document
!= executable sandbox
```

---

## 7. Logical Content Identity

Content API使用 logical identity：

```text
installationId
kind
namespace
key
contentVersion
```

Identity shape：

```text
record/group key = one logical segment
resource key     = one-or-more logical segments joined by /
```

Hierarchical ResourceKey中的 `/` 是 logical separator，不是 filesystem path capability。

Content Service：

```text
logical identity
→ trusted Content Index
→ validated internal content identity
→ bytes
```

客户端不获得 arbitrary internal path、file handle或 executable URL。

Content version精确遵循 Content API v1：

```text
sha256:<64 lowercase hex>
```

并基于 exact successful full-body representation bytes，而不是 process-local snapshot/fingerprint。

Content `contentVersion` 与 Realm State Record `version` / global `revision` 完全独立；不得建立跨 plane version equivalence。

---

## 8. Platform Implementation

### Hostra Desktop

```text
Executable module
    launch.hostra.json binding
    installation-relative .mjs
    filesystem containment / symlink-reparse-safe resolver
    HostraLaunchPlan
    Host-owned Node Runner import

Realm State preparation
    game.json optional state validated by Game Package
    Hostra Launcher projects PreparedRealmStateDefinition
    Session composition later constructs RealmStateAuthority

FSDB readonly core
    @loomrealm/fsdb
    Node stdlib only
    validation + immutable index + safe read lease

Standalone FSDB HTTP adapter
    @loomrealm/fsdb-http
    depends on @loomrealm/fsdb

Content
    current prepared installation Content view
    localhost HTTP Content Service
    depends on @loomrealm/fsdb for FSDB-backed bodies
```

`@loomrealm/fsdb-http` 与 Desktop Content Service是 `@loomrealm/fsdb` 的两个真实 production consumers；这只证明一个 FSDB-specific core，不证明 generic storage-provider framework，也不证明 Realm State 或 Save/Load business 应建立在 FSDB repository abstraction 上。

### PWA

```text
Executable module
    launch.pwa.json binding
    installation-relative logical .mjs
    validated registry / same-origin resolver
    PwaLaunchPlan
    Host-owned Worker Runner import

Realm State preparation
    same Game Package document validation
    PWA Launcher projects equivalent PreparedRealmStateDefinition
    later physical Authority/binding may differ from Desktop

Content
    same-origin Fetch
    Service Worker
    OPFS / Cache Storage
```

PWA不依赖 Node-only `@loomrealm/fsdb`；它必须实现同一 Content logical identity、representation/version/cache/error semantics。Realm State physical realization也不要求与 Hostra 使用相同 storage/transport primitive，只要求 logical contract等价。

具体游戏的 Save/Load business 若使用 OPFS、filesystem、cloud storage 等，是其 persistence workflow选择，不进入 Realm State logical bootstrap contract。

---

## 9. Package Index / Installation Registry

普通 Content Index SHOULD保存：

```text
kind / namespace / key
validated internal content identity
MIME
size
contentVersion / hash
```

M12 Desktop Content Index是 current prepared installation 的 immutable view；它不需要先 materialize全局 mutable Installation Registry。

Platform executable resolver MAY使用同一可信 Installation Registry的底层 location/integrity primitive，但必须保持独立 capability surface。

```text
module binding identity != content resource identity
allowed to read content != allowed to execute module
```

Realm State materialized Record index也不是 Installation/Content Index：

```text
Content Index
    installation readonly facts

Realm State list()
    Session materialized mutable-business Record discovery
```

二者不得合并成 generic Repository/Index authority。

Platform manifest本身也不授予任意 filesystem/URL访问；resolver仍必须执行 current installation containment/security policy。

---

## 10. Catalog / Repository

Catalog/Repository是长期产品内容实现模式，不是 M12必须新增的 framework/package，也不是 Realm State abstraction。

当真实 Content consumer需要时，概念责任可包括：

```text
logical ID → validated content identity
async readonly fetch
parse / local schema validation
same-ID concurrent dedup
immutable cache
close / cancel
error mapping
```

它不负责：

```text
RuntimeHosting
PlatformLaunchPlan
Realm State OCC / commit revision
Realm State subscription
Save/Load business policy
module execution
Frame Stack
Input/Render lifecycle
```

M12只 materialize `@loomrealm/fsdb`、Desktop Content Service、Subsystem ContentClient和 Renderer ResourceClient所需的最小职责；不得为了匹配本节概念图提前创建 generic Repository hierarchy。

---

## 11. Resource Model

业务/Render State只携 logical resource reference：

```text
resourceKey + contentVersion
```

`resourceKey` MAY是 hierarchical logical key；它不是 path。

Renderer Resource Client通过 Content API读取资源，并比较 expected/actual `contentVersion`。

资源 lifecycle不由 Frame suspend/close、Data reconnect或 Runtime Control transaction推导。

Physical module/content path、filesystem handle、blob URL或 Content bearer不得进入 Render/business payload。

M12只冻结 Renderer logical resource identity → bytes capability；RenderNode/tag如何投影为 resource identity属于 M14 presentation。

Realm State 可以存业务需要的 logical resource reference value，但这不会把资源 bytes/Content cache/contentVersion authority 转移给 Realm State。

---

## 12. Authorization Boundary

Hostra Content request可使用 scoped opaque bearer；Host负责 grant generation/injection/rotation。

必须相互独立：

```text
Runtime Control bootstrapToken
Platform Runner bootstrap material
Platform executable resolution capability
Content bearer
Data ticket / transferred Port authority
Realm State private binding material
business persistence credential/capability
```

M12 Hostra Content material不得复用 M9 Data provisioning IPC。Realm State binding也不得借用 Content bearer 或 Data ticket 形成隐藏复用 authority。

PWA使用 same-origin/Service Worker authority，不为了形式统一复制 Hostra bearer flow。

Credential不进入 Frame params、Render State、Realm State business values或 ordinary business state。

---

## 13. Range / Deployment Policy

Range若支持，直接遵守标准 HTTP semantics；不发明 LoomRealm-specific byte-range protocol。

以下属于 bounded deployment policy，而非新的 interoperable Profile：

```text
capacity
concurrency
rate limits
timeouts
cache sizing
prefetch policy
```

Hostra/PWA可有不同具体值，但 logical Content API semantics保持一致。

Realm State 自己的 capacity/queue hard limits由 Realm State contract/profile拥有，不应复用 Content deployment policy。

`scan()` 是 Realm State 的 exceptional full-snapshot operation；Content/Storage layer不因此拥有或规定 Realm State aggregate State limit/pagination policy。

---

## 14. Hot-path Boundary

Content API用于：

```text
initialization
on-demand load
cache recovery
resource fetch
```

不进入每 Tick hot path。Runtime tick读取已经准备好的 business state / immutable content view。

Realm State 是 business coordination capability；它也不能成为“把所有 local tick/cache state塞进中心 store”的理由。高频纯局部/派生状态应留在 Subsystem/Render等原 owner。

`scan()` 尤其是 potentially expensive 非常规 snapshot operation，不应被设计成 business hot path query。

同理，Platform Launch Manifest/Plan只参与 bootstrap/launch，不成为 business hot-path configuration API。

---

## 15. Session / Installation Validation

在 first business Runtime side effect前 MUST确保：

```text
Game Entry valid including optional Realm State initial document
current Platform Launch Manifest valid
exact Subsystem key-set join
all required platform module bindings syntactically valid
all required executable targets resolve safely
all executable targets belong to selected installation/security boundary
current required hosting capabilities available
PreparedRealmStateDefinition projected and immutable
fresh RealmStateAuthority created from prepared Game baseline and READY
current required Content view/index can be formed
```

不存在 Save/Load current seed 的 bootstrap validation gate；persistence restore若存在属于后续 business workflow。

Content完整性校验按 current installation policy执行；PWA installation SHOULD在登记 available前完成足够的完整校验。

Definition Module runtime import/ABI failure属于 launch-time Runtime bootstrap failure，不把 raw module location泄露给 Main/business。

RealmStateAuthority fatal属于 Session-fatal fact并上报 Main；**Main 唯一提交 Session terminal / Runtime/Frame unwind**。Storage/Content/Installation/Platform layer不得直接执行 Runtime/Frame unwind。

---

## 16. Core Invariants

1. Game Package安装/document layer只读，并声明 logical topology、initial input与 optional Realm State initial document；
2. Game Package State document不是 live RealmStateAuthority，也不是 Authority bootstrap ABI；Launcher投影 `PreparedRealmStateDefinition`；
3. Realm State bootstrap只消费 prepared Game baseline，不消费 Save/Load seed；
4. Save/Load 是 business persistence workflow，通过普通 RealmStateClient read/commit 实现；
5. `subsystemKey` 是唯一 Subsystem application identity；RealmStateKey是独立 business Record identity；
6. executable `module` identity属于对应 Platform Launch Manifest，不属于 Game common Descriptor；
7. PlatformLaunchPlan与 Main/Realm State prepared projections在 first Runtime side effect前完成 join、resolution与 capability preflight；
8. Realm State READY在 first business Runtime side effect前成立；
9. Platform Runner拥有 module execution capability，但不拥有 RealmStateAuthority；
10. Content API只接受 logical readonly Content identity，不拥有 Realm State mutation；
11. record/group key是 single segment，ResourceKey可由多个 validated logical segments组成；
12. Content version精确使用 Content API v1 SHA-256 representation，并与 Realm State version/revision独立；
13. executable module不能伪装成 ordinary Resource；Content/FSDB不能伪装成 Realm State mutation channel；
14. physical filesystem path/module URL不进入 business/application protocol或 Realm State value authority；
15. Hostra/PWA可为同一 key选择不同 executable artifact，也可使用不同 Realm State physical binding；
16. executable resolver与 Content resolver可复用底层安全 primitive，但 capability surface分离；Realm State不因此加入 generic Repository；
17. Hostra M12 `@loomrealm/fsdb`只拥有 Node FSDB readonly core，不拥有 Content/HTTP/Realm State/application authority；
18. Content credential、Runtime/Runner/Data credential、Realm State binding material与 business persistence capability分离；
19. Service Worker/Content Service不拥有 Runtime/Frame/Render/Realm State authority；
20. RealmStateAuthority fatal只上报 Main；Storage/Content/Platform不拥有 terminal/unwind；
21. Range/cache/resource policy不创造新的 application authority；
22. safe module resolution不等于 executable sandbox。
