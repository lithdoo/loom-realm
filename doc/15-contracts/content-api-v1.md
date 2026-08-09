# 只读 Content API v1

> 层级：正式契约  
> 状态：Active / Normative / Evolving  
> 主要定义：跨 Desktop/PWA 的逻辑只读内容访问、路由、缓存、错误、完整性与 request authorization semantics  
> 依赖：[存储与内容系统](../10-architecture/storage-system.md)、[Game Package v1](./game-package-v1.md)、[ADR 0016](../decisions/0016-protocol-boundary-cleanup.md)  
> 最近复核：2026-08-09

本文使用 `MUST`、`MUST NOT`、`SHOULD`、`MAY` 表达规范强度。

核心原则：

> **Content API 只标准化 Runtime/Renderer 与只读 Content Service 之间必须互操作的 HTTP/Fetch 语义。访问凭据如何由 Host 创建、注入、轮换是 Host implementation responsibility，不再建立 Content Access Bootstrap/Profile。**

---

## 1. Scope / Platform Binding

运行中的 Main、Subsystem Runtime 与 Web Renderer MAY 读取：

```text
manifest
record
group
resource
```

平台：

```text
Desktop
    localhost HTTP Content Service

PWA
    same-origin Fetch + Service Worker + OPFS / Cache Storage
```

两种实现 MUST 保持相同 logical identity、route、status/error、MIME、version、cache 与 integrity semantics。

Content API 不负责：

```text
Package install/write/delete
Launcher executable access
Frame / Call
Renderer Control
Render Update
User Input
OS sandbox
credential delivery wire
```

尤其不得把 Content credential 塞入：

```text
Frame params
Render State
resource URL query
ordinary business payload
```

---

## 2. Logical Identity

```ts
interface ContentIdentityV1 {
  readonly installationId: string;
  readonly kind: "manifest" | "record" | "group" | "resource";
  readonly namespace?: string;
  readonly key?: string;
  readonly contentVersion?: string;
}
```

`installationId` 标识已验证/登记安装实例，不等于 physical directory。

`namespace/key` 是 logical identity，MUST NOT 直接解释成 filesystem path。

Base route：

```text
/_lr/v1/games/{installationId}
```

路径段使用 UTF-8 percent-encoding。解码后不得包含 `/`、`\`、`.`/`..` path semantics、NUL/control chars、Drive/UNC/URL semantics。

请求必须先做 logical identity validation，再查询 trusted Package Index；禁止 URL→filesystem direct mapping。

---

## 3. Routes

### Manifest

```http
GET  /_lr/v1/games/{installationId}/manifest
HEAD /_lr/v1/games/{installationId}/manifest
```

返回 normalized public manifest，不返回 Installation Root/launcher physical path。

### Record

```http
GET  /_lr/v1/games/{installationId}/records/{namespace}/{key}
HEAD /_lr/v1/games/{installationId}/records/{namespace}/{key}
```

默认：

```text
Content-Type: application/json; charset=utf-8
```

### Group

```http
GET  /_lr/v1/games/{installationId}/groups/{namespace}/{key}
HEAD /_lr/v1/games/{installationId}/groups/{namespace}/{key}
```

v1 默认 JSON Lines：

```text
Content-Type: application/x-ndjson; charset=utf-8
```

每行是独立 JSON value。

### Resource

```http
GET  /_lr/v1/games/{installationId}/resources/{namespace}/{key}
HEAD /_lr/v1/games/{installationId}/resources/{namespace}/{key}
```

返回 Package Index 声明的 MIME + binary body；普通资源不得 Base64 包入 JSON。

---

## 4. Package Index Boundary

Content Service 使用 trusted/validated Package Index：

```ts
interface ContentIndexEntryV1 {
  readonly kind: "record" | "group" | "resource";
  readonly namespace: string;
  readonly key: string;
  readonly internalPath: string;
  readonly contentVersion: string;
  readonly size: number;
  readonly mime: string;
}
```

`internalPath` 只存在可信 Content Service 内部，MUST NOT 返回客户端。

```text
logical identity
→ Package Index lookup
→ validated internal location
→ read/validate content
```

---

## 5. Success / Cache Metadata

成功响应至少提供：

```text
Content-Type
ETag
X-Loom-Content-Version
Cache-Control
Content-Length when determinable
```

推荐：

```text
ETag: "<contentVersion>"
X-Loom-Content-Version: <contentVersion>
```

不可变 hash-addressed content MAY 使用长期 immutable cache；Manifest/registration-like content使用更保守 cache policy。

实现 MUST 支持：

```text
If-None-Match
```

匹配：

```text
304 Not Modified
no body
```

client cache identity 至少包含：

```text
installationId + kind + namespace + key + contentVersion
```

不同 `contentVersion` 不得共享错误 bytes。

---

## 6. HEAD

`HEAD` MUST 执行与 GET 相同的 authorization、route、existence、version 检查，但不返回 body。

可确定 headers SHOULD 与对应 GET 一致。

---

## 7. Optional HTTP Range

Range 不是 mandatory capability，也不再定义 LoomRealm `Range Profile`。

实现若支持 byte range，直接遵守标准 HTTP Range semantics，至少正确处理：

```http
Range: bytes=<start>-<end>
```

并返回适用的：

```text
206 Partial Content
Content-Range
Accept-Ranges: bytes
416 Range Not Satisfiable
```

客户端不得假设所有部署都支持 Range；可依据标准 HTTP response/header 判断。

---

## 8. Authorization Semantics

### 8.1 Desktop

Desktop Content Service只监听 Host认可的 loopback endpoint。

受保护请求使用：

```text
Authorization: Bearer <token>
```

概念 grant：

```ts
interface DesktopContentGrantV1 {
  readonly installationId: string;
  readonly token: string;
  readonly permissions: readonly (
    | "manifest"
    | "records"
    | "groups"
    | "resources"
  )[];
  readonly expiresAtUnixMs: number;
}
```

`expiresAtUnixMs` 是 positive safe integer Unix epoch milliseconds。

Token MUST：

```text
high entropy
opaque
bound to installation + permission scope
not in URL
not echoed in logs/errors
```

**Host 如何生成、保存、注入、刷新或轮换该 grant 不属于 Content API wire，也不需要独立 Content Access Profile。**

Host 只需保证接收方获得其当前需要的访问材料，并满足上述安全边界。不同 Desktop Host implementation MAY 使用不同内部 IPC/env/context/in-memory injection 方式。

### 8.2 PWA

PWA 使用 same-origin Service Worker boundary。

Service Worker MUST验证：

```text
installation registered for current origin
installation complete
route/method valid
Package Index entry valid
stored content version matches
```

Service Worker process memory不是 authority；必须可从 persistent installation registry/Index/OPFS恢复。

PWA 不要求为了与 Desktop bearer 对齐而制造额外 token distribution protocol。

---

## 9. Methods

Runtime Content API只允许：

```text
GET
HEAD
```

其他方法：

```text
405 Method Not Allowed
Allow: GET, HEAD
```

安装、导入、写入、删除属于 Package Storage/Installer。

---

## 10. Deterministic Status / Error Mapping

```text
200 OK
    full success

206 Partial Content
    supported Range success

304 Not Modified
    ETag match

400 Bad Request
    malformed URL/header/encoding/parameter

401 Unauthorized
    Desktop bearer missing/invalid/expired

403 Forbidden
    authenticated but insufficient scope / forbidden origin

404 Not Found
    installation / namespace / key / indexed body not found

405 Method Not Allowed
    method other than GET/HEAD

409 Conflict
    installation/version/index state conflict

413 Content Too Large
    deployment hard limit exceeded

416 Range Not Satisfiable
    invalid/unsatisfiable supported Range request

422 Unprocessable Content
    selected body exists but schema/integrity invalid

429 Too Many Requests
    deployment concurrency/rate policy exceeded

500 Internal Server Error
    unexpected service failure
```

固定分类：

```text
state/version/index conflict → 409
body schema/integrity failure → 422
```

同一失败事实不得自由选择 409/422。

---

## 11. Error Body

```text
Content-Type: application/problem+json
```

```ts
interface ContentProblemV1 {
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly code: string;
  readonly detail?: string;
  readonly installationId?: string;
  readonly namespace?: string;
  readonly key?: string;
}
```

Stable codes 至少：

```text
INSTALLATION_NOT_FOUND              404
INSTALLATION_INCOMPLETE             409
CONTENT_NOT_FOUND                   404
CONTENT_VERSION_MISMATCH            409
CONTENT_TOO_LARGE                   413
CONTENT_SCHEMA_INVALID              422
CONTENT_INTEGRITY_FAILED            422
CONTENT_PERMISSION_DENIED           403
RANGE_INVALID                       416
```

错误不得泄露 physical path、token、user home、internal stack、unauthorized index content。

---

## 12. Deployment Limits / Backpressure

不再建立 Content deployment Profile。

以下属于 deployment/implementation configuration：

```text
max JSON/JSONL/resource body size
max record count
concurrent request bound
rate bound
timeout/cancel policy
internal read dedupe/cache sizing
```

实现 MUST bounded，并通过现有 HTTP semantics暴露失败：

```text
413
429
timeout/cancel
```

客户端不得依赖一个跨所有部署固定的资源容量或并发数字。

如果某个未来 limit 被证明是解析安全/跨实现互操作所必需，直接加入 Content API v1/vNext 的 hard wire rule，而不是另建 deployment Profile。

---

## 13. Integrity

Package Index存在 content hash 时，安装阶段 MUST验证。

运行时已知 hash mismatch：

```text
MUST NOT return 200
→ 422 CONTENT_INTEGRITY_FAILED
```

安装/Index version conflict/incomplete：

```text
→ 409 CONTENT_VERSION_MISMATCH / INSTALLATION_INCOMPLETE
```

两类不得混用。

---

## 14. Resource Reference Boundary

业务/Render data只携 logical resource reference，例如：

```ts
interface ResourceReferenceV1 {
  readonly resourceKey: string;
  readonly contentVersion: string;
}
```

具体 Renderer Resource Client再根据 installation context 解析 Content API。

不得在 Render/Frame/business payload中携带：

```text
Content token
absolute Content URL
local filesystem path
resource bytes
```

Resource identity 不绑定 Frame/Activation。

---

## 15. Service Worker Lifecycle

Service Worker MAY随时被浏览器终止。

请求正确性不得依赖 volatile：

```text
Package Index cache
installation registry cache
open OPFS handle
authorization cache
```

缓存 MAY存在，但 authority 必须能从 persistent storage恢复。

Service Worker 不承担 Runtime Tick、Frame Stack、Renderer Control、User Input。

---

## 16. Conformance Minimum

至少：

```text
manifest/record/group/resource success
GET/HEAD semantic equivalence
ETag/304
contentVersion cache isolation
unknown installation/namespace/key
logical path traversal rejection
MIME correctness
Desktop bearer missing/invalid/expired/scope-denied
PWA same-origin registration validation
409 state/version conflict
422 schema/integrity failure
no physical path/token leak
optional Range standards-compliant when enabled
413/429 deployment-limit behavior
```

Conformance 不检查 Host 使用何种内部机制把 Desktop grant交给 Runtime/Renderer，也不要求 PWA复制 Desktop bearer flow。

---

## 17. Final Invariants

1. Content API 是 logical readonly GET/HEAD API；
2. logical identity 不直接映射 filesystem path；
3. Desktop/PWA共享 route/cache/error/integrity semantics；
4. Desktop request authorization使用 scoped opaque bearer；PWA使用 same-origin Service Worker authority；
5. Host credential issuance/distribution/rotation 是 implementation responsibility，不存在独立 Content Access Profile；
6. credential 不进入 Frame、Render、URL query或 ordinary business payload；
7. Range 是可选标准 HTTP能力，不存在 LoomRealm Range Profile；
8. deployment size/concurrency/rate/timeouts 是 bounded implementation configuration，不形成协议 Profile；
9. 409 与 422 failure category固定；
10. Content API 不拥有 Runtime/Frame/Renderer/Input authority。
