# 存储与内容系统

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：只读 Game Package、Platform executable installation、逻辑 Content API、Package Index、Repository、资源和路径安全  
> 依赖：[系统架构总览](./system-overview.md)、[运行时启动与连接建立系统](./runtime-bootstrap-system.md)  
> 正式契约：[Game Package v1](../15-contracts/game-package-v1.md)、[Hostra Launcher Profile v1](../15-contracts/nodejs-launcher-profile-v1.md)、[PWA Launcher Profile v1](../15-contracts/pwa-launcher-profile-v1.md)、[Content API v1](../15-contracts/content-api-v1.md)  
> 最近复核：2026-09-08

## 1. 设计目标

为 Main、Subsystem、Renderer提供安全、只读、按需内容访问，同时严格隔离：

```text
Game logical topology
Platform executable binding/capability
Readonly Content capability
physical storage path / URL
```

> **Game Package声明 logical Subsystem identity；Platform Launch Manifest选择当前平台 executable implementation；trusted Runner拥有执行能力；Content API只拥有逻辑读取能力。**

---

## 2. Installation Topology

长期概念：

```text
Validated Installation
├── game.json
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

## 3. Game Entry / Platform Launch / Content

```text
Game Entry
    logical topology + initial business input

Platform Launch Manifest
    current-platform key → executable business artifact binding

Platform executable resolver
    validates binding and creates host-private executable target

Content API
    logical readonly GET/HEAD
    manifest / record / group / resource
```

禁止：

```text
Game Entry grant arbitrary executable capability
Content API request arbitrary executable path
Content API start Runtime
Renderer execute Platform-selected Definition Module
Render State carry physical module/content path
business payload carry content/bootstrap credential
```

---

## 4. Package / Runtime Bootstrap

```text
read/validate game.json
→ read/validate current Platform Launch Manifest
→ exact Game↔Platform key-set join
→ resolve every required current-platform Definition Module
→ validate installation containment/security + hosting capability
→ freeze immutable PlatformLaunchPlan
→ freeze current prepared Content view when Content is required
────────────────────────────────────────────────────────────
first business Runtime side effect may begin
→ Main creates logical Launch Attempt
→ RuntimeHosting launches by subsystemKey
→ Host-owned Runner imports planned module
```

Preflight config/join/resolution/capability failure必须发生在任何 business Runtime side effect前。

Definition Module actual ESM import/default-export ABI validation MAY在 Runner中执行；失败属于 required Runtime bootstrap failure，并触发统一 cleanup。

M12 required Content capability若在 business initialization前无法构造，同样属于 Runtime bootstrap failure；Runtime建立后的 ordinary Content read rejection不是自动 Runtime/Frame failure。

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

---

## 6. Read vs Execute Capability

必须区分：

```text
Platform Executable Module Resolver
    may resolve/import only plan-declared trusted business executable artifact

Readonly Content API
    reads logical content only
```

可以复用底层 Installation Registry、安全路径、hash/integrity primitive，但不得因为某文件可作为 executable module就扩大普通 Content client权限。

```text
validated executable target
!= ordinary content resource
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

`@loomrealm/fsdb-http` 与 Desktop Content Service是 `@loomrealm/fsdb` 的两个真实 production consumers；这只证明一个 FSDB-specific core，不证明 generic storage-provider framework。

### PWA

```text
Executable module
    launch.pwa.json binding
    installation-relative logical .mjs
    validated registry / same-origin resolver
    PwaLaunchPlan
    Host-owned Worker Runner import

Content
    same-origin Fetch
    Service Worker
    OPFS / Cache Storage
```

PWA不依赖 Node-only `@loomrealm/fsdb`；它必须实现同一 Content logical identity、representation/version/cache/error semantics。

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

Platform manifest本身也不授予任意 filesystem/URL访问；resolver仍必须执行 current installation containment/security policy。

---

## 10. Catalog / Repository

Catalog/Repository是长期产品内容实现模式，不是 M12必须新增的 framework/package。

当真实 consumer需要时，概念责任可包括：

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
```

M12 Hostra Content material不得复用 M9 Data provisioning IPC。

PWA使用 same-origin/Service Worker authority，不为了形式统一复制 Hostra bearer flow。

Credential不进入 Frame params、Render State或 ordinary business state。

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

同理，Platform Launch Manifest/Plan只参与 bootstrap/launch，不成为 business hot-path configuration API。

---

## 15. Session / Installation Validation

在 first business Runtime side effect前 MUST确保：

```text
Game Entry valid
current Platform Launch Manifest valid
exact key-set join
all required platform module bindings syntactically valid
all required executable targets resolve safely
all executable targets belong to selected installation/security boundary
current required hosting capabilities available
current required Content view/index can be formed
```

Content完整性校验按 current installation policy执行；PWA installation SHOULD在登记 available前完成足够的完整校验。

Definition Module runtime import/ABI failure属于 launch-time Runtime bootstrap failure，不把 raw module location泄露给 Main/business。

---

## 16. Core Invariants

1. Game Package运行期间只读，并且只声明 logical topology/business input；
2. `subsystemKey` 是唯一 Subsystem application identity；
3. executable `module` identity属于对应 Platform Launch Manifest，不属于 Game common Descriptor；
4. PlatformLaunchPlan在 first Runtime side effect前完成 exact join、resolution与 capability preflight；
5. Platform Runner拥有 module execution capability；
6. Content API只接受 logical readonly Content identity；
7. record/group key是 single segment，ResourceKey可由多个 validated logical segments组成；
8. Content version精确使用 Content API v1 SHA-256 representation；
9. executable module不能伪装成 ordinary Resource；
10. physical filesystem path/module URL不进入 business/application protocol；
11. Hostra/PWA可为同一 key选择不同 executable artifact；
12. executable resolver与 Content resolver可复用底层安全 primitive，但 capability surface分离；
13. Hostra M12 `@loomrealm/fsdb`只拥有 Node FSDB readonly core，不拥有 Content/HTTP/application authority；
14. Content credential与 Runtime/Runner/Data credential分离；
15. Service Worker/Content Service不拥有 Runtime/Frame/Render authority；
16. Range/cache/resource policy不创造新的 application authority；
17. safe module resolution不等于 executable sandbox。
