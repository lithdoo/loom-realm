# M12 / 02 — Subsystem Content Client

> 状态：**Implementation Frozen / Preimplementation Closed**  
> 阶段：M12 Content  
> 落地顺序：02  
> 最近复核：2026-09-08  
> 前置：[M12 / 01](M12_01_CONTENT_SERVICE.md)  
> 正式契约：[Content API v1](doc/15-contracts/content-api-v1.md)  
> 架构：[Subsystem 模型](doc/10-architecture/subsystem-model.md)、[存储与内容系统](doc/10-architecture/storage-system.md)  
> 目标：给 business Definition 提供最小只读 Content capability；隐藏 installation、HTTP、credential 与 physical location。

> **Author 只读取当前 game 的逻辑内容；transport/deployment identity 不进入 `@loomrealm/subsystem` author surface。**

---

## 1. Position

```text
Desktop Content Service
→ host-private bound Content access
→ Subsystem Runtime
→ SubsystemScope ContentClient
→ business Definition
```

ContentClient 是当前 Subsystem Runtime 的只读 capability，不是全局 repository。

---

## 2. Minimal Author Surface

M12 只增加一个 author-facing capability：

```ts
interface ContentClient {
  record(namespace: string, key: string, options?: ContentReadOptions): Promise<ContentRecord>;
  group(namespace: string, key: string, options?: ContentReadOptions): Promise<ContentGroup>;
  resource(namespace: string, key: string, options?: ContentReadOptions): Promise<ContentResource>;
}

interface ContentReadOptions {
  readonly contentVersion?: string;
  readonly signal?: AbortSignal;
}
```

返回值只暴露业务需要的值：

```text
record   → JSON value + contentVersion
group    → readonly JSON values + contentVersion
resource → bytes + MIME + contentVersion
```

`SubsystemScope` 提供当前 bound client，例如：

```text
scope.content
```

精确命名可在实现中做最小调整；不得扩大语义。

---

## 3. Intentionally Hidden

Author 不观察：

```text
installationId
HTTP URL / route
Authorization bearer
ETag / 304
filesystem path
Package Index internal location
Response / Headers
Runtime bootstrap material
```

M12 不为了 transport 对称性暴露 `HEAD`、raw `fetch()`、URL builder 或 generic request API。

---

## 4. Error Boundary

HTTP/status 由 bound client 转换为少量稳定的 Content read failure。

必须保留的业务差异只有：

```text
not found
version conflict
invalid/integrity failure
unavailable/cancelled
```

不得建立大型 Content error hierarchy。

普通 read rejection：

```text
!= Runtime failure
!= Frame failure
!= automatic Frame unwind
```

Business Definition 决定如何处理失败。

---

## 5. Lifetime

```text
ContentClient lifetime ~= Subsystem Runtime capability lifetime
Content request lifetime = one async operation
```

必须保持：

```text
Frame suspend/close does not invalidate ContentClient
Activation change does not replace ContentClient
Data carrier reconnect does not replace ContentClient
RenderDomain close does not affect ContentClient
```

Per-request `AbortSignal` 只取消该读取，不改变 Runtime authority。

---

## 6. No Storage Leakage

Business Definition 依赖保持：

```text
business Definition
→ @loomrealm/subsystem
```

禁止 business code 依赖：

```text
@loomrealm/fsdb-http
node:http
node:fs
platform-ports
game-package
concrete launcher
Content bearer / URL
```

M13 `@loomrealm/map` 必须能只通过 `@loomrealm/subsystem` 使用 Content。

---

## 7. Abstraction Budget

允许：

```text
one bound ContentClient per Subsystem Runtime
small response validation/error mapping
same-ID in-flight dedupe only if a real consumer benefits
```

禁止：

```text
global Content registry
generic Repository base class
observable Content store
prefetch scheduler
asset dependency graph
mutable cache API
Content service locator
business-visible transport adapter
```

Cache 是实现细节，不是 author authority。

---

## 8. Done

M12/02 complete when：

```text
business can read record/group/resource through @loomrealm/subsystem only
installation/HTTP/credential/path remain hidden
contentVersion is preserved
read failure stays local to caller
Frame/Activation/Data/Render lifecycle independence is proven
runtime terminal cancels/settles outstanding owned work
no generic repository/cache abstraction was added without need
```

M12/02 不实现 `loom.map`；M13 才用真实 map business logic 验证这条 author surface。