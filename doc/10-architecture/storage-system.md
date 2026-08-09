# 存储与内容系统

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：只读游戏包、逻辑 Content API、Package Index、Repository、资源和路径安全  
> 依赖：[系统架构总览](./system-overview.md)、[运行时启动与连接建立系统](./runtime-bootstrap-system.md)  
> 正式契约：[Game Package v1](../15-contracts/game-package-v1.md)、[Desktop Node.js Launcher v1](../15-contracts/nodejs-launcher-profile-v1.md)、[Content API v1](../15-contracts/content-api-v1.md)  
> 最近复核：2026-08-09

## 1. 设计目标

为 Main、Subsystem、Renderer 提供安全、只读、按需的游戏包内容访问，同时隔离 logical identity 与 physical filesystem path。

> **Content API 是读取接口；Launcher 是执行能力；Host 负责把访问材料交给本地参与者。三者不能混为一层。**

## 2. 内容拓扑

```text
Game Package
├── Manifest / Game Entry / Descriptors
├── launcher entries
├── FSDB data
└── resources
        ↓ validate/install
Package Index
        ↓
Readonly Content API
        ↓
Subsystem Repository / Renderer Resource Client
```

Launcher entry 属于启动描述，不通过 Content API 执行。

## 3. Read vs Execute

```text
Launcher
    Main privileged capability
    resolves and executes declared Subsystem entry

Content API
    logical readonly GET/HEAD
    manifest / record / group / resource
```

禁止：

```text
Content API request arbitrary physical path
Content API execute script/start Runtime
Renderer receive executable launcher capability
Render State carry local path/content credential/resource bytes
```

Desktop Node.js Subsystem 是 trusted executable code；当前 Launcher 不提供 OS sandbox。

## 4. Package / Launcher Bootstrap

```text
read manifest/entry
→ validate Game Package v1
→ validate complete Descriptor set
→ install Descriptor Registry
→ resolve Launcher Targets
→ create Launch Attempts
→ spawn/supervise Runtime
```

`launcher.entry` 由 Game Package/Launcher contract负责 containment、module type、no shell、no traversal 等安全约束。

```text
allowed to read != allowed to execute
```

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
→ validated Package Index lookup
→ validated internal location
→ read/validate bytes
```

客户端永远不获得 `internalPath`/absolute path/file handle。

## 6. Platform Implementation

Desktop：

```text
Runtime / Renderer
→ localhost Readonly Content Service
→ Package Index
→ package content
```

PWA：

```text
Worker / Window
→ same-origin Fetch
→ Service Worker
→ Package Index
→ OPFS / Cache Storage
```

Desktop/PWA 必须共享 Content API logical route/cache/error/integrity semantics，但底层 storage/cache/credential plumbing可以不同。

## 7. Package Index

Index SHOULD保存：

```text
kind / namespace / key
validated internal content location
MIME
size
contentVersion/hash
schema/reference metadata when needed
```

Launcher executable validation 不伪装成普通 Resource validation。

## 8. Catalog / Repository

Repository负责：

```text
construct logical Content request
async fetch/parse/local schema validation
same-ID concurrent dedup
Runtime-local immutable cache
Content error → module error mapping
```

Repository 不负责 Launcher、Frame Stack、User Input、Render lifecycle。

## 9. Resource Model

业务/Render State只携 logical reference，例如：

```text
resourceKey + contentVersion
```

Renderer Resource Client 再通过 Content API获取 MIME/version/body。

资源读取/cache lifecycle 不从 Frame suspend/close推导。

## 10. Authorization Boundary

Desktop Content request 使用 Content API v1定义的 scoped opaque bearer semantics。

Host implementation负责：

```text
generate/store grant material
bind installation + permission scope + expiry
inject current credential into Runtime/Renderer client
rotate/revoke material when Host policy requires
avoid URL/log/business-payload leakage
```

**不建立独立 Content Access Bootstrap/Profile。** Host内部可使用 env、trusted bootstrap context、IPC、in-memory injection 等不同机制，只要最终 HTTP request authorization符合 Content API。

Launcher `bootstrapToken` 与 Content bearer MUST 独立，不能互相复用。

PWA 使用 same-origin Service Worker authority，不为了形式统一而复制 Desktop bearer distribution flow。

## 11. Range / Deployment Policy

Range 如果支持，直接使用标准 HTTP Range semantics；不建立 LoomRealm Range Profile。

以下是 bounded deployment configuration，不形成协议 Profile：

```text
max content body/resource size
JSONL record count
concurrency/rate bound
timeout/cancel policy
cache sizing
```

客户端只依赖标准 `413/429/timeout` 等可观察行为，不依赖所有部署共享相同数字。

## 12. Hot-path Boundary

Content API用于 session 初始化后的内容/资源读取和缓存恢复，不进入每 Tick hot path。

Runtime Core每 Tick只读取已准备内存状态与 immutable content。

## 13. Validation

`start` MUST验证当前启动需要的 Manifest/Entry/Descriptor/Launcher约束；`validate` SHOULD尽量遍历 required content/strong references。

PWA安装应完整校验后再登记 available。原始包和安装副本都视为不可信数据。

## 14. 架构不变量

1. Game Package运行期间只读；
2. Main只启动 Entry明确声明且平台支持的 Subsystem；
3. Launcher Entry与普通 Resource是不同能力；
4. Content API只接受 logical identity，不承担 Launcher职责；
5. Content API/Renderer不获得任意 physical path或执行能力；
6. Host credential distribution是实现职责，不形成 Content Access协议；
7. Desktop bearer与Launcher bootstrapToken相互独立；
8. PWA same-origin authority不要求复制 Desktop token机制；
9. Range使用标准 HTTP可选语义，不另建 Profile；
10. deployment容量/并发/timeout不协议化；
11. Service Worker/Content Service不拥有 Runtime/Frame/Render authority；
12. Render State不携资源 bytes/path/credential。

## 15. 相关文档

- [运行时启动与连接建立系统](./runtime-bootstrap-system.md)
- [Game Package v1](../15-contracts/game-package-v1.md)
- [Desktop Node.js Launcher v1](../15-contracts/nodejs-launcher-profile-v1.md)
- [Readonly Content API v1](../15-contracts/content-api-v1.md)
- [FSDB Content Service 模块](../20-modules/fsdb-content-service/README.md)
