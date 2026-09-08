# M12 / 02 — Subsystem Content Client

> 状态：**Implementation Frozen / Preimplementation Closed**  
> 阶段：M12 Content  
> 落地顺序：02  
> 最近复核：2026-09-08  
> 前置：[M12 / 01](M12_01_CONTENT_SERVICE.md)  
> 正式契约：[Content API v1](doc/15-contracts/content-api-v1.md)  
> 架构：[Subsystem 模型](doc/10-architecture/subsystem-model.md)、[运行承载系统](doc/10-architecture/runtime-hosting-system.md)  
> 目标：给 business Definition 一个 exact、最小、只读 Content capability；installation、HTTP、credential 与 physical storage全部留在 Host。

> **Author 只读取当前 prepared game 的逻辑内容。M12 不把完整 Content HTTP surface机械投影成 SDK。**

---

## 1. Frozen Position

```text
Desktop Content Service
→ Hostra child-private access material
→ Runner constructs bound ContentClient
→ runSubsystem({content,...})
→ SubsystemScope.content
→ business Definition
```

ContentClient 是一个 Runtime-scoped readonly capability，不是 repository/service locator。

---

## 2. Exact Author Surface

M12 root新增 exactly：

```ts
import type { JsonValue } from "@loomrealm/wire";

export interface ContentReadOptions {
  readonly signal?: AbortSignal;
}

export interface ContentRecord {
  readonly value: JsonValue;
  readonly contentVersion: string;
}

export interface ContentResource {
  readonly bytes: Uint8Array;
  readonly mime: string;
  readonly contentVersion: string;
}

export type ContentReadErrorCode =
  | "CONTENT_NOT_FOUND"
  | "CONTENT_CONFLICT"
  | "CONTENT_INVALID"
  | "CONTENT_UNAVAILABLE"
  | "CONTENT_CANCELLED";

export class ContentReadError extends Error {
  readonly code: ContentReadErrorCode;
}

export interface ContentClient {
  record(
    namespace: string,
    key: string,
    options?: ContentReadOptions,
  ): Promise<ContentRecord>;

  resource(
    namespace: string,
    key: string,
    options?: ContentReadOptions,
  ): Promise<ContentResource>;
}
```

`SubsystemScope` exact新增：

```ts
readonly content: ContentClient;
```

M12 **不** root-export `manifest()`、`group()`、`head()`、raw `fetch()` 或 URL builder。Formal Content API仍完整支持 manifest/group；只有出现真实 business consumer时才允许后续 milestone reopen author projection。

Author API 不接受 `installationId` 或 `contentVersion` request selector。当前 Runtime已经绑定 current prepared installation；response `contentVersion` 是观察到的内容版本，而不是 author transport precondition。

---

## 3. Value Ownership

成功读取必须隔离内部 cache ownership：

```text
ContentRecord.value
    → detached from internal mutable/cache ownership

ContentResource.bytes
    → caller-owned bytes; internal cache storage is never exposed directly
```

因此：

```text
caller mutates returned JSON/Uint8Array
→ future read result unchanged
→ internal cache unchanged
```

JSON 可用 detached deep-immutable representation或每次 detached copy；bytes 可复制。具体策略是 private mechanics，但 observable isolation 不可变。

---

## 4. Error Mapping

Bound client把 HTTP/transport failure收敛成一个 `ContentReadError`：

```text
404                              → CONTENT_NOT_FOUND
409                              → CONTENT_CONFLICT
422                              → CONTENT_INVALID
abort                            → CONTENT_CANCELLED
401/403/413/429/5xx/network/etc → CONTENT_UNAVAILABLE
```

Author 不观察 HTTP status、problem body、bearer 或 URL。

普通 read rejection：

```text
!= Runtime failure
!= Frame failure
!= automatic Frame unwind
```

Business Definition 自己决定 fallback / failed outcome / retry policy。

---

## 5. Host Injection / Bootstrap Boundary

`runSubsystem` host surface增加 required bound capability：

```ts
interface RunSubsystemOptions {
  // existing fields...
  readonly content: ContentClient;
}
```

Hostra Runner必须在调用 `runSubsystem()`、因而在 `definition.initialize` 前完成 ContentClient 构造。

```text
Content service/grant/client cannot be constructed
before business initialization
→ Runtime bootstrap failure
```

Runtime 已建立后的 ordinary read failure仍只是 caller-local Content failure。

Content grant/material不得：

```text
进入 SubsystemLaunchContext
进入 Frame params
复用 Runtime Control bootstrapToken
复用 M9 Data provisioning IPC
```

---

## 6. Lifetime

```text
ContentClient lifetime = Subsystem Runtime capability lifetime
one read lifetime      = one async operation
```

必须保持：

```text
Frame suspend/close != ContentClient close
Activation change   != ContentClient replacement
Data reconnect       != ContentClient replacement
RenderDomain close   != ContentClient close
```

Runtime terminal aborts/settles host-owned outstanding reads。Per-request signal只影响该 request。

---

## 7. Dependency / Storage Boundary

Business Definition保持：

```text
business Definition
→ @loomrealm/subsystem
```

禁止依赖：

```text
@loomrealm/fsdb-http
shared FSDB implementation seam
node:http / node:fs
platform-ports
game-package
concrete launcher
Content URL / bearer
```

FSDB-backed namespace（如 `struct.角色`）是 logical Content namespace value，不授予 FSDB path/handle capability。

---

## 8. Abstraction Budget

允许：

```text
one bound ContentClient per Runtime
one small ContentReadError class + closed code union
small response validation/mapping
private cache/dedupe only when useful
```

禁止：

```text
generic Repository base class
observable Content store
prefetch scheduler
asset dependency graph
mutable cache API
service locator
business-visible transport adapter
```

---

## 9. Done

M12/02 complete when：

```text
exact root surface compiles
scope.content is always present for a running M12 Subsystem Runtime
record/resource read through @loomrealm/subsystem only
no author installationId/contentVersion request selector
returned values cannot mutate internal cache/future reads
stable minimal error discriminant works
Hostra constructs capability before business initialize
ordinary read failure stays caller-local
Frame/Activation/Data/Render lifetime independence is proven
```

M13 consumes this exact surface；如果真实 map consumer证明需要 `group()`，按 reopen rule增加，不为表面对称提前发布。