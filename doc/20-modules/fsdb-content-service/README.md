# FSDB Content Service 模块设计

> 层级：模块设计  
> 状态：Active Design  
> 稳定程度：Experimental  
> 主要定义：Desktop HTTP 与 PWA Service Worker 的统一只读内容服务实现  
> 依赖：[存储与内容系统](../../10-architecture/storage-system.md)、[Content API v1](../../15-contracts/content-api-v1.md)  
> 最近复核：2026-08-09

## 1. 目标

FSDB Content Service 把平台存储映射成统一 logical readonly Content API：

```text
DesktopHttpContentService
    registered readonly package content

ServiceWorkerContentService
    OPFS / Cache Storage
```

两者共享 route、index、MIME、version、cache、error、integrity semantics；内部 storage/credential plumbing可以不同。

## 2. 建议模块

```text
FSDB Content Service
├── Request Router
├── Installation Registry
├── Package Index Loader
├── Logical Content Resolver
├── Storage Adapter
├── MIME Resolver
├── Version / ETag Policy
├── Authorization Policy
├── Response Builder
├── Size / Rate Limiter
└── Diagnostics
```

模块结构不是协议要求。

## 3. Request Router

只接受 Content API v1 的 `GET/HEAD` logical routes：

```text
manifest
records/{namespace}/{key}
groups/{namespace}/{key}
resources/{namespace}/{key}
```

Router 严格解析 URL、校验 path segment、拒绝 traversal/control chars，不把 URL 直接拼成 physical path。

## 4. Installation Registry / Package Index

Installation Registry 保存经过验证的安装：

```ts
interface InstallationRecord {
  readonly installationId: string;
  readonly gameId: string;
  readonly status: "installing" | "complete" | "corrupt";
  readonly packageIndexLocation: string;
  readonly installedAt: number;
}
```

只有 `complete` 可服务 Runtime request。

Package Index 至少验证：kind/namespace/key、内部路径 containment、MIME、size、contentVersion/hash、duplicate identity 与 index limits。

缓存可丢弃重建；persistent registry/index 才是 authority。

## 5. Logical Content Resolver

```text
ContentIdentity
→ Installation Record
→ Package Index Entry
→ Safe Internal Location
```

Resolver 不把 physical location 返回客户端，也不接收任意用户 filesystem path。

## 6. Storage Adapter

```ts
interface ReadonlyContentStorage {
  stat(location: SafeContentLocation): Promise<{
    readonly size: number;
    readonly modifiedAt?: number;
  }>;

  read(location: SafeContentLocation): Promise<Uint8Array>;

  readRange?(
    location: SafeContentLocation,
    start: number,
    endInclusive: number,
  ): Promise<Uint8Array>;
}
```

实现 MAY 为 Node directory、OPFS、Cache Storage 等；接口只接收 Resolver产生的 safe location。

## 7. MIME / Version / ETag

优先使用 Package Index 已验证 MIME/contentVersion。

Response Builder 产生：

```text
Content-Type
ETag
X-Loom-Content-Version
Cache-Control
Content-Length when known
```

`If-None-Match` 命中返回 304。

不可变资源可长期缓存；Manifest/安装状态使用更保守 policy。

## 8. Authorization Policy

### Desktop

验证 Content API v1 scoped bearer：

```text
installationId binding
permission scope
expiry
opaque high-entropy token
loopback / expected Origin policy
```

Host 如何生成、保存、注入、轮换 token 是 Host implementation，不属于 Content Service application protocol，也不存在 Content Access Profile。

Content Service 不要求 token内部编码 Session；是否附加 Host-private session binding属于实现安全策略，不能改变 Content API wire schema。

### PWA

验证：

```text
same origin
installationId registered
installation complete
Service Worker route/scope valid
Package Index state valid
```

PWA 不需要复制 Desktop bearer distribution flow。

Authorization Policy 不查询 Frame Stack/InputTarget/DOM focus。

## 9. Response / Error

统一构造：

```text
200 / 206 / 304
400 / 401 / 403 / 404 / 405
409 / 413 / 416 / 422 / 429 / 500
application/problem+json
```

错误不泄露 physical path、token、user home、internal stack。

409 = installation/version/index state conflict；422 = selected body schema/integrity failure。

## 10. JSON / JSONL

Content Service 返回已安装 bytes，不在服务层执行 Subsystem business schema。

Installer/Validator负责 package-level integrity；Runtime Repository负责 business-local schema。

Group JSONL MAY stream；实现对总字节/单行/记录数设置 bounded deployment limits。

## 11. Optional HTTP Range

不建立 Range Profile。

若 Storage Adapter/HTTP implementation支持 byte ranges，则直接遵守标准 HTTP Range semantics：

```text
valid range → 206 + Content-Range
unsatisfiable → 416
Accept-Ranges when appropriate
```

第一阶段不要求 multi-range，也不要求所有 deployment支持 Range。

Desktop/PWA 若都宣称支持 Range，SHOULD 使用相同 logical test vectors验证标准行为。

## 12. Cache Layers

```text
physical storage / OPFS
    installed content

Content Service cache
    Index / bytes / Response cache

Subsystem Repository cache
    parsed immutable business objects

Renderer Resource cache
    Blob/ImageBitmap/Audio/GPU resources
```

任何 cache 都不拥有 Runtime/Frame/Render authority。

## 13. Concurrency / Backpressure

以下是 bounded implementation/deployment policy，不形成 Profile：

```text
max body/resource size
max JSONL records
concurrent request bound
rate bound
timeout/cancel policy
read dedupe
cache size
```

Content API只要求用可观察 HTTP结果收敛，例如 `413/429/timeout`。

大资源 MAY stream；client cancel SHOULD向底层读取传播（平台支持时）。Content load 不得阻塞 Runtime Control/Frame carrier。

## 14. Desktop HTTP Implementation

典型：

```text
127.0.0.1:<random-port>
```

要求：

```text
loopback only
Host-selected endpoint
scoped bearer
no directory listing
no file:// redirect
close on session/service teardown
final safe-location checks
```

endpoint/token由 Host内部交付，不进入 Frame、Render State或 Subsystem `ready`。

## 15. PWA Service Worker

```text
fetch event
→ Route Parser
→ Installation Registry
→ Package Index
→ OPFS / Cache Storage
→ Response
```

Service Worker MAY随时重启，因此：

```text
no volatile-memory-only authority
Index/cache/handles rebuildable
installation registry persistent
avoid half-upgraded installation state
```

## 16. Install vs Runtime

写操作只属于 Installer：

```text
import
write temp files
generate index
validate
mark complete
delete installation
```

Content Service Runtime API始终只读，即使底层 OPFS可写。

## 17. Failure

```text
installation incomplete       → 409
content/index version conflict → 409
body integrity/schema invalid → 422
content not found             → 404
limit exceeded                → 413/429 as applicable
Service Worker restart        → reload persistent Registry/Index
Desktop service restart       → Host re-establishes service/access material
```

已加载 Runtime business state 不因 Content Service重启自动回滚。

## 18. Core Invariants

- API只读；
- URL只携 logical identity；
- physical path不离开 Content Service；
- Desktop/PWA保持 Content API业务语义；
- Host拥有 credential delivery，不存在 Content Access Profile；
- Range只是可选标准 HTTP能力；
- concrete size/concurrency/rate/timeout是 deployment policy；
- Service Worker不拥有游戏 Runtime state；
- Repository负责 business schema；
- resource bytes不进入 Frame/Render control data；
- Content Fetch不进入每 Tick hot path。

## 19. 测试入口

```text
four route success/failure
path encoding/traversal rejection
installation incomplete/corrupt
index duplicate/path escape
GET/HEAD + ETag/304
MIME/contentVersion
Desktop bearer/Origin/scope
PWA cold start/same-origin
optional standard Range
bounded 413/429/cancel behavior
Desktop/PWA semantic equivalence
no credential/path leak
```
