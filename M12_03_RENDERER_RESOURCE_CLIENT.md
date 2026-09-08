# M12 / 03 — Renderer Resource Client

> 状态：**Implementation Frozen / Preimplementation Closed**  
> 阶段：M12 Content  
> 落地顺序：03  
> 最近复核：2026-09-08  
> 前置：[M12 / 01](M12_01_CONTENT_SERVICE.md)  
> 正式契约：[Content API v1](doc/15-contracts/content-api-v1.md)  
> 架构：[渲染系统](doc/10-architecture/rendering-system.md)、[存储与内容系统](doc/10-architecture/storage-system.md)  
> 目标：让 Renderer 根据 Render State 中的 logical resource reference 读取当前 installation 的资源；不提前实现 presentation 或 asset framework。

> **M12/03 只把 logical resource reference 解析为 version-safe readonly bytes；DOM、ImageBitmap、Audio、Canvas、WebGL 属于后续 presentation。**

---

## 1. Position

```text
Subsystem Render authority
→ Render Update
→ Renderer internal replica
→ logical resource reference
→ Renderer ResourceClient
→ Desktop Content API
→ bytes + MIME + contentVersion
```

Renderer 不获得 filesystem path、Content bearer 或 executable capability。

---

## 2. Resource Reference Boundary

Render/business data 只携 logical reference：

```text
resourceKey
contentVersion
```

若当前 Render schema 需要 namespace，则 namespace 作为 logical identity 的一部分处理；不得用 absolute URL 或 physical path 代替。

ResourceClient 由 Platform composition 绑定当前 installation 与授权上下文。

---

## 3. Minimal Renderer Surface

M12 不要求新增 public Renderer subscription/store API。

Renderer 内部只需要一个最小读取能力，例如：

```ts
interface RendererResourceClient {
  resource(
    namespace: string,
    key: string,
    contentVersion: string,
    signal?: AbortSignal,
  ): Promise<{
    readonly bytes: Uint8Array;
    readonly mime: string;
    readonly contentVersion: string;
  }>;
}
```

精确命名可私有调整；语义必须保持只读、version-bound。

---

## 4. Cache Semantics

缓存 identity 至少包含：

```text
installation
namespace
key
contentVersion
```

必须保证：

```text
same key + different contentVersion
→ never share stale bytes
```

允许：

```text
immutable successful-result cache
same-ID concurrent request dedupe
ETag/304 reuse behind the client
```

失败不得永久缓存成成功事实。

不引入 LRU framework、prefetch planner、resource dependency graph 或 mutable asset registry。

---

## 5. Lifetime Independence

```text
ResourceClient lifetime != RenderDomain lifetime
resource cache lifetime != Frame lifetime
Data carrier reconnect != content cache invalidation
Renderer Control replacement/reload MAY create a fresh client composition
```

Content fetch failure只影响当前资源读取；不得修改 Main/Subsystem authority。

---

## 6. No Presentation in M12

明确 deferred：

```text
PNG/JPEG decode
ImageBitmap / HTMLImageElement
AudioBuffer
DOM
Canvas
WebGL texture upload
resource eviction policy tuned for presentation
```

M14 Desktop full E2E 再证明 physical presentation。

---

## 7. Abstraction Budget

允许：

```text
one Renderer-private ResourceClient responsibility
small version-safe immutable cache
small Content response/error mapping
```

禁止：

```text
public AssetManager
ResourceStore subscription API
loader plugin system
generic decoder registry
presentation lifecycle coupled to Content lifecycle
Content URL in Render State
```

---

## 8. Done

M12/03 complete when：

```text
Renderer resolves logical resource reference through Content API
version mismatch cannot return stale bytes
MIME/contentVersion survive the boundary
physical URL/path/token never enters Render replica
Data reconnect does not invent Content lifecycle
no DOM/Canvas/WebGL dependency is added
no public asset framework is introduced
```

M12/03 为 M14 presentation 提供 bytes boundary，但不替 M14 做 presentation。