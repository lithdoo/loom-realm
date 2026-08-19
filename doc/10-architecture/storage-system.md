# 存储与内容系统

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：只读游戏包、Subsystem Definition Module、逻辑 Content API、Package Index、Repository、资源和路径安全  
> 依赖：[系统架构总览](./system-overview.md)、[运行时启动与连接建立系统](./runtime-bootstrap-system.md)  
> 正式契约：[Game Package v1](../15-contracts/game-package-v1.md)、[Desktop Node.js Launcher / Runner v1](../15-contracts/nodejs-launcher-profile-v1.md)、[Content API v1](../15-contracts/content-api-v1.md)  
> 最近复核：2026-08-19

## 1. 设计目标

为 Main、Subsystem、Renderer提供安全、只读、按需内容访问，同时严格隔离：

```text
Subsystem executable module capability
Readonly Content capability
physical storage path
```

> **Game Package声明 executable Definition Module identity；Platform Runner拥有执行能力；Content API只拥有逻辑读取能力。**

---

## 2. Package Topology

```text
Game Package
├── Manifest / Game Entry
├── Subsystem Definition Modules (.mjs)
├── FSDB data
└── resources
        ↓ validate/install
Installation Registry / Package Index
        ├── executable-module resolver → Platform Runner
        └── readonly content resolver   → Content API
```

Executable module与普通 Content Resource必须保持能力隔离。

---

## 3. Read vs Execute

```text
Subsystem Definition Module
    declared by descriptor.module
    executable capability
    loaded only by Platform Subsystem Runner

Content API
    logical readonly GET/HEAD
    manifest / record / group / resource
```

禁止：

```text
Content API request arbitrary executable path
Content API start Runtime
Renderer execute descriptor.module
Render State carry physical module/content path
business payload carry content/bootstrap credential
```

---

## 4. Package / Runtime Bootstrap

```text
read Manifest/Entry
→ validate Game Package v1 Descriptor {key,module}
→ validate complete Descriptor set
→ install Descriptor Registry
→ resolve required Definition Modules
→ Platform Runtime Hosting starts Subsystem Runners
→ Runner imports declared module
```

`module` 是 logical identity；Desktop/PWA 各自映射到 host-private executable target。

---

## 5. Logical Content Identity

Content API 使用：

```text
installationId
kind
namespace
key
contentVersion
```

Content Service：

```text
logical identity
→ trusted Package Index
→ validated internal location
→ bytes
```

客户端不获得 arbitrary internal path/file handle。

---

## 6. Platform Implementation

Desktop：

```text
Executable module
    installation-relative .mjs
    filesystem-safe resolver
    Host-owned Node Runner import

Content
    localhost HTTP Content Service
    filesystem-backed Package Index
```

PWA：

```text
Executable module
    same descriptor.module identity
    same-origin/installation module resolver
    Worker Runner import

Content
    same-origin Fetch
    Service Worker
    OPFS / Cache Storage
```

两平台共享 logical Game Package/Content semantics；physical target/cache/credential plumbing可不同。

---

## 7. Package Index / Installation Registry

Index SHOULD保存普通 Content所需：

```text
kind / namespace / key
validated internal content location
MIME
size
contentVersion/hash
```

Executable Module Resolver MAY使用同一可信 Installation Registry的底层 path/index primitive，但必须保持独立 capability surface。

```text
module identity != content resource identity
```

---

## 8. Catalog / Repository

Repository负责 logical Content request、async fetch/parse、schema validation、same-ID dedup、immutable cache、error mapping。

Repository不负责 Runtime hosting、module execution、Frame Stack、Input或Render lifecycle。

---

## 9. Resource Model

业务/Render State只携 logical resource reference：

```text
resourceKey + contentVersion
```

Renderer Resource Client再通过 Content API读取资源。

资源 lifecycle不由 Frame suspend/close推导。

---

## 10. Authorization Boundary

Desktop Content request使用 scoped opaque bearer；Host负责 grant generation/injection/rotation。

Runtime Control `bootstrapToken`、Platform Runner bootstrap material、Content bearer必须相互独立。

PWA使用 same-origin Service Worker authority，不为了形式统一复制 Desktop bearer flow。

---

## 11. Range / Deployment Policy

Range若支持直接遵守标准 HTTP semantics。

capacity/concurrency/rate/timeout/cache sizing属于 bounded deployment configuration，不形成额外 Profile。

---

## 12. Hot-path Boundary

Content API用于初始化、按需加载与缓存恢复，不进入每 Tick hot path。Runtime tick读取已准备的 business state / immutable content。

---

## 13. Validation

Session start MUST确保：

```text
Manifest/Entry/Descriptor valid
all required descriptor.module resolve safely
all required platform executable targets belong to installation
required Content references satisfy current validation policy
```

PWA安装应在登记 available前完成完整校验。

---

## 14. Core Invariants

1. Game Package运行期间只读；
2. `descriptor.module` 是 logical executable module identity；
3. Platform Runner拥有 module execution capability；
4. Content API只接受 logical readonly Content identity；
5. executable module不能伪装成 ordinary Resource；
6. physical path/URL不进入 business protocol；
7. same module identity可由 Desktop/PWA不同 resolver实现；
8. Content credential与 Runtime/Runner bootstrap credential分离；
9. Service Worker/Content Service不拥有 Runtime/Frame/Render authority；
10. safe module resolution不等于 executable sandbox。
