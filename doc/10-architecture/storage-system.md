# 存储与内容系统

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：只读 Game Package、Platform executable installation、逻辑 Content API、Package Index、Repository、资源和路径安全  
> 依赖：[系统架构总览](./system-overview.md)、[运行时启动与连接建立系统](./runtime-bootstrap-system.md)  
> 正式契约：[Game Package v1](../15-contracts/game-package-v1.md)、[Hostra Launcher Profile v1](../15-contracts/nodejs-launcher-profile-v1.md)、[PWA Launcher Profile v1](../15-contracts/pwa-launcher-profile-v1.md)、[Content API v1](../15-contracts/content-api-v1.md)  
> 最近复核：2026-08-20

## 1. 设计目标

严格隔离：

```text
Game logical topology
Platform executable binding/capability
Readonly Content capability
physical storage path/URL
```

> **Game Package声明 logical Subsystem identity；Platform Launch Manifest选择当前平台 executable implementation；trusted Runner拥有执行能力；Content API只拥有逻辑读取能力。**

---

## 2. Installation Topology

概念：

```text
Validated Installation
├── game.json
├── launch.hostra.json          optional when Hostra-supported
├── launch.pwa.json             optional when PWA-supported
├── executable Definition artifacts
├── FSDB data
└── resources
        ↓
Installation Registry / Package Index
        ├── platform executable resolver → LaunchPlan/Runner
        └── readonly content resolver    → Content API
```

并非每个 installation必须支持所有平台；当前要在某平台启动时，对应 platform manifest必须存在并完整覆盖 Game keys。

---

## 3. Read vs Execute

```text
Game Entry
    logical data only

Platform Launch Manifest
    declares installation-local executable binding

Platform executable resolver
    validates/creates host-private executable target

Content API
    logical readonly GET/HEAD
```

禁止 Content API请求 arbitrary executable path、启动 Runtime，或让 Renderer执行 platform module。

---

## 4. Package / Runtime Bootstrap

```text
read/validate game.json
→ read/validate current platform launch manifest
→ exact key-set join
→ resolve all current-platform modules
→ freeze LaunchPlan
→ Platform RuntimeHosting starts Runners by key
→ Runner imports planned module
```

Preflight resolution failure发生在任何 business Runtime side effect前。

---

## 5. Executable Identity Boundary

Executable module path是 **platform launch binding material**，不是 Subsystem application identity。

```text
subsystemKey = application identity
module       = platform installation binding
resolved path/URL = host-private executable material
```

Hostra和PWA可以为同一 key解析不同 artifact。

---

## 6. Logical Content Identity

Content API继续使用 logical installation/kind/namespace/key/contentVersion等 identity。Content Service把 logical identity映射到受信任 Package Index中的 bytes；客户端不获得 arbitrary internal path/file handle。

---

## 7. Platform Implementation

Hostra：installation-relative `.mjs` → filesystem containment/symlink-safe resolver → HostraLaunchPlan → Node Runner import。

PWA：installation-relative `.mjs` → validated registry/same-origin resolution → PwaLaunchPlan → Worker Runner import。

不要求两个平台使用相同 module path/bytes。

---

## 8. Package Index / Repository

普通 Content index可保存 kind/namespace/key/location/MIME/size/version/hash。

Executable resolver MAY复用 Installation Registry的底层安全 primitive，但必须保持独立 capability surface：

```text
allowed to read content != allowed to execute module
```

Repository负责 Content request/fetch/parse/cache，不负责 Runtime hosting或 executable launch planning。

---

## 9. Authorization Boundary

Runtime bootstrap token、Platform executable capability、Content bearer、Data ticket必须相互独立。

PWA使用 same-origin/SW authority；Hostra可使用 scoped bearer。不要为了形式统一复制 credential model。

---

## 10. Session Validation

在 first Runtime side effect前 MUST确保：

```text
Game Entry valid
current Platform Launch Manifest valid
exact key-set join
all required platform modules resolve safely
all executable targets belong to selected installation
current required hosting capabilities available
```

Definition Module actual import/ABI validation可在 Runner中发生，并按 required Runtime bootstrap failure收敛。

---

## 11. Core Invariants

1. Game Package运行期间只读且不授予 executable capability；
2. Subsystem key是 application identity；
3. module identity属于 Platform Launch Manifest；
4. Platform Runner拥有 module execution capability；
5. Content API只接受 logical readonly Content identity；
6. executable module不能伪装成 ordinary Resource；
7. physical path/URL不进入 business protocol；
8. Hostra/PWA可为同一 key选择不同 artifact；
9. Content credential与 Runtime/Runner/Data credential分离；
10. safe module resolution不等于 executable sandbox。
