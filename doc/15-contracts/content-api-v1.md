# 只读 Content API v1

> 层级：正式契约  
> 状态：Active / Normative  
> 稳定程度：Evolving  
> 主要定义：跨 Desktop/PWA 的逻辑只读内容访问、路由、缓存、错误、完整性与 request authorization semantics  
> 依赖：[存储与内容系统](../10-architecture/storage-system.md)、[Game Package v1](./game-package-v1.md)、[ADR 0016](../decisions/0016-protocol-boundary-cleanup.md)  
> 最近复核：2026-08-09

本文使用 `MUST`、`MUST NOT`、`SHOULD`、`MAY` 表达规范强度。

核心原则：

> **Content API 定义“已经拥有访问能力的客户端如何读取逻辑只读内容”；Content capability 如何被签发、分发、轮换属于独立 Content Access Bootstrap/Profile。**

## 1. 适用范围

运行中的 Main、Subsystem Runtime 与 Web Renderer 可以通过统一逻辑 Content API 读取：

```text
manifest
record
group
resource
```

平台 binding：

```text
Desktop
    localhost HTTP Content Service

PWA
    same-origin Fetch + Service Worker + OPFS / Cache Storage
```

两种实现 MUST 保持相同逻辑 identity、route、status/error code、MIME、version 与 cache semantics。

## 2. 不负责的内容

Content API v1 不负责：

```text
Content Grant如何交给Runtime/Renderer
Renderer Control authority
Frame / Call
Render Update
User Input
Package安装/写入/删除
Launcher executable access
OS sandbox
```

特别：

```text
Content API semantics
!=
Content Access Bootstrap
```

任何实现不得把 Content credential 塞入 Frame params、Render State、resource URL query 或普通业务 payload。

## 3. 核心身份

```ts
interface ContentIdentityV1 {
  readonly installationId: string;
  readonly kind: "manifest" | "record" | "group" | "resource";
  readonly namespace?: string;
  readonly key?: string;
  readonly contentVersion?: string;
}
```

`installationId` 标识经过验证/登记的安装实例，不等于本机目录。

`namespace/key` 是逻辑 identity，MUST NOT 直接解释成 filesystem path。

## 4. Base Route

```text
/_lr/v1/games/{installationId}
```

路径段使用 UTF-8 percent-encoding。解码后不得包含：

```text
/ or \
. / .. path semantics
NUL
control characters
Drive/UNC/URL semantics
```

URL参数 MUST 先按逻辑 identity校验，再查询 Package Index；不得直接拼接 filesystem path。

## 5. Routes

### Manifest

```http
GET  /_lr/v1/games/{installationId}/manifest
HEAD /_lr/v1/games/{installationId}/manifest
```

返回 normalized public manifest，不返回 Installation Root 或 launcher physical path。

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

v1默认 JSON Lines：

```text
Content-Type: application/x-ndjson; charset=utf-8
```

每行必须是独立 JSON value，并受单行/记录数/总大小限制。

### Resource

```http
GET  /_lr/v1/games/{installationId}/resources/{namespace}/{key}
HEAD /_lr/v1/games/{installationId}/resources/{namespace}/{key}
```

返回 Package Index 声明的真实 MIME 与 binary body；不得把普通资源 Base64 包入 JSON。

## 6. Package Index Boundary

Content Service使用已经验证的 Package Index：

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

`internalPath` 只存在于可信 Content Service 内部，MUST NOT 返回客户端。

请求：

```text
logical identity
→ Package Index lookup
→ validated internal location
→ read/validate content
```

禁止 URL→filesystem direct mapping。

## 7. Success Metadata

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

不可变 hash-addressed content MAY：

```text
Cache-Control: public, max-age=31536000, immutable
```

Manifest/registration-like content应采用更保守 cache policy。

## 8. Conditional Request

实现 MUST 支持：

```text
If-None-Match
```

匹配时：

```text
304 Not Modified
no body
```

客户端 cache identity至少包含：

```text
installationId + kind + namespace + key + contentVersion
```

不同 `contentVersion` 不得共享错误 bytes。

## 9. HEAD

`HEAD` MUST执行与 GET相同的 authorization、route、existence、version检查，但不返回 body。

可确定的 headers SHOULD与对应 GET一致。

## 10. Range Profile

Range 不属于 v1 Core mandatory capability。

实现显式声明 Range Profile时，至少支持合法：

```text
Range: bytes=<start>-<end>
```

并返回：

```text
206 Partial Content
Content-Range
Accept-Ranges: bytes
```

Desktop/PWA 的 Range Profile必须通过同一业务 fixture。

## 11. Authorization Semantics

### Desktop request authorization

Desktop Content Service只监听 Host认可的 loopback endpoint。

授权请求使用：

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

`expiresAtUnixMs` MUST 是 Unix epoch milliseconds 的 positive safe integer。

Token要求：

```text
high entropy
opaque
bound to installation + permission scope
not in URL
not echoed in error/log
```

**本文不冻结该 Grant 如何从 Main/Host 被交给 Renderer 或 Subsystem。** 该分发路径由未来 Content Access Bootstrap/Profile冻结。

因此当前 Desktop Content API 可以声明 request/response conformance，但在 Content Access Profile完成前不能宣称跨角色 capability-distribution 已完整冻结。

### PWA request authorization

PWA 使用 same-origin Service Worker boundary。

Service Worker MUST验证：

```text
installation registered for current origin
installation complete
route/method valid
Package Index entry valid
stored content version matches
```

Service Worker process memory不是 authority；必须可从持久安装登记/Index/OPFS恢复。

未来如果 PWA需要更细角色 scope，应由 Content Access Profile增加，而不是修改 resource route identity。

## 12. Methods

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

安装、导入、写入、删除属于 Package Storage/Installer，不属于本契约。

## 13. Deterministic Status / Error Mapping

v1固定：

```text
200 OK
    full success

206 Partial Content
    Range Profile success

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
    logical installation/version/index state conflict
    e.g. INSTALLATION_INCOMPLETE / CONTENT_VERSION_MISMATCH

413 Content Too Large
    current Profile size limit exceeded

416 Range Not Satisfiable
    invalid/unsatisfiable Range

422 Unprocessable Content
    selected body exists but fails content validation/integrity
    e.g. CONTENT_SCHEMA_INVALID / CONTENT_INTEGRITY_FAILED

429 Too Many Requests
    explicit concurrency/rate policy exceeded

500 Internal Server Error
    unexpected service failure
```

**同一个失败事实不得由实现自由选择 409 或 422。**

规则：

```text
state/version/index conflict → 409
body schema/integrity failure → 422
```

## 14. Error Body

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

Stable codes：

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

错误不得泄露：

```text
physical path
token
user home
internal stack
unauthorized index content
```

## 15. Limits / Backpressure

具体 deployment Profile MUST给出：

```text
max URL/path segment
max JSON body
max JSONL line/body/record count
max Resource size
concurrent request bound
rate bound if enabled
timeout/cancel policy
```

Content Repository MAY对相同 logical content的并发 read去重，但不得改变独立 request的 authorization/error semantics。

失败结果默认不得永久缓存。

## 16. Integrity

Package Index存在 content hash 时，安装阶段 MUST验证。

运行时检测到已知 hash mismatch：

```text
MUST NOT return 200
→ 422 CONTENT_INTEGRITY_FAILED
```

若安装/Index本身处于 version conflict/incomplete state：

```text
→ 409 CONTENT_VERSION_MISMATCH / INSTALLATION_INCOMPLETE
```

这两个类别不得混用。

## 17. Render State Resource Reference

Render State/等价 presentation contract只携带逻辑引用，例如：

```ts
interface ResourceReferenceV1 {
  readonly resourceKey: string;
  readonly contentVersion: string;
}
```

Renderer Resource Client再根据安装上下文解析到 Content API。

Render State MUST NOT携带：

```text
Content token
absolute Content URL
local filesystem path
resource bytes
```

Resource identity不要求绑定 Frame/Activation。

## 18. Service Worker Lifecycle

Service Worker MAY随时被浏览器终止。

请求正确性不得依赖以下 volatile memory：

```text
Package Index cache
installation registry cache
open OPFS handle
authorization cache
```

实现可以缓存，但必须可从 persistent authority恢复。

Service Worker不承担 Runtime Tick、Frame Stack、Renderer Control或User Input处理。

## 19. Conformance Minimum

至少：

```text
manifest/record/group/resource success
GET/HEAD semantic equivalence
ETag/304
contentVersion cache isolation
unknown installation/namespace/key
invalid encoding/traversal-like logical segment
Desktop bearer missing/invalid/expired
Desktop permission insufficient
PWA incomplete installation
JSONL streaming
MIME correctness
content too large
index/version conflict → deterministic 409
schema failure → deterministic 422
integrity failure → deterministic 422
optional Range Profile
Desktop/PWA same business status + code for same abstract fault
no physical path/token leak
```

## 20. Open Boundary Before Freeze

Content API v1 尚未 Frozen，主要剩余边界：

```text
Content Access Bootstrap/Profile
exact deployment size/concurrency profiles
optional Range Profile details
MIME allow/deny policy if required
```

这些不得重新把 Content capability塞入 Frame、Renderer Control authority Snapshot或Render State。

## 21. Core Invariants

1. Content API只读；
2. logical identity不暴露physical path；
3. request先Index lookup后内部读取；
4. GET/HEAD semantics稳定；
5. Desktop/PWA逻辑route/status/code一致；
6. Content capability distribution与Content resource protocol分离；
7. state/version conflict固定409；body validation/integrity固定422；
8. Resource bytes不进入Control/User Input/Render State；
9. Render引用使用logical key + contentVersion；
10. Content Service不拥有Runtime/Frame/Render authority。
