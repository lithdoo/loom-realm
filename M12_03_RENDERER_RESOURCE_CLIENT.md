# M12 / 03 — Renderer Resource Client

> 状态：**Implementation Frozen / Preimplementation Closed**  
> 阶段：M12 Content  
> 落地顺序：03  
> 最近复核：2026-09-08  
> 前置：[M12 / 01](M12_01_CONTENT_SERVICE.md)  
> 正式契约：[Content API v1](doc/15-contracts/content-api-v1.md)  
> 架构：[渲染系统](doc/10-architecture/rendering-system.md)、[存储与内容系统](doc/10-architecture/storage-system.md)  
> 目标：给 Renderer 一个 version-checked readonly resource bytes capability；不在 M12 决定 RenderNode presentation/resource-reference schema。

> **M12/03 冻结的是 Content resource identity → bytes boundary。Render replica 如何被某个 presentation tag解释成该 identity，属于 M14。**

---

## 1. Frozen Position

```text
Renderer-side logical Content resource identity
    namespace + key + expectedContentVersion
→ bound Renderer ResourceClient
→ Desktop Content API
→ bytes + MIME + actualContentVersion
```

M12 不冻结：

```text
RenderNode.data → resource identity mapping
known tag/component schema
DOM/Canvas/WebGL consumption
```

因此不再要求 M12 ResourceClient自行解析 Render Store。

---

## 2. Minimal Private Responsibility

Renderer production code只需要一个内部 responsibility，语义等价于：

```ts
interface RendererResourceClient {
  resource(
    namespace: string,
    key: string,
    expectedContentVersion: string,
    signal?: AbortSignal,
  ): Promise<{
    readonly bytes: Uint8Array;
    readonly mime: string;
    readonly contentVersion: string;
  }>;
}
```

这是 Renderer implementation seam，不要求 root-export新的 AssetManager/Store/observer surface。精确 private class/function 名可调整。

Platform composition绑定 current prepared installation 与 authorization material；调用方只给 logical namespace/key/version。

---

## 3. Version Check

`expectedContentVersion` 不创建新的 HTTP request-version protocol。

固定行为：

```text
GET current logical resource
→ validate response Content metadata
→ actual X-Loom-Content-Version
→ actual == expected → accept bytes
→ actual != expected → reject as content conflict
```

客户端不得通过私有 header/query发明第二套 version selector。

Cache identity：

```text
prepared installation identity
+ namespace
+ key
+ contentVersion
```

因此不同 version 永远不能共享错误 bytes。

---

## 4. Value / Cache Ownership

允许 private immutable success cache 和 same-ID in-flight dedupe，但 cache storage不得直接交给 consumer。

```text
returned Uint8Array
→ caller-owned detached bytes
→ caller mutation cannot change cached bytes or later reads
```

失败不得永久缓存成成功事实。

不引入 LRU framework、prefetch planner、dependency graph 或 mutable asset registry。

---

## 5. Failure Boundary

Renderer Content failure只影响当前 resource read/presentation-local policy：

```text
not found / conflict / invalid / unavailable / cancelled
→ local read rejection
```

它不得：

```text
mutate Renderer authoritative Render Store
mutate Main authority
mutate Subsystem Render authority
fail Runtime/Frame
```

Presentation将来可选择 placeholder/drop/report；M12不冻结该产品策略。

---

## 6. Lifetime Independence

```text
ResourceClient lifetime != RenderDomain lifetime
resource cache lifetime  != Frame lifetime
Data carrier reconnect   != Content cache invalidation
```

Renderer Control replacement/reload MAY创建 fresh local client composition；这不改变 Content identity semantics。

---

## 7. Deferred to M14

明确 deferred：

```text
Render tag/data resource-reference schema
PNG/JPEG decode
ImageBitmap / HTMLImageElement
AudioBuffer
DOM / Canvas / WebGL
texture/object lifetime
presentation-specific eviction/prefetch
```

Render state仍不得携 Content bearer、filesystem path、absolute privileged URL 或 resource bytes capability。

---

## 8. Abstraction Budget

允许：

```text
one Renderer-private ResourceClient responsibility
small version-safe cache/dedupe
small Content response/error mapping
```

禁止：

```text
public AssetManager
ResourceStore subscription API
loader/plugin/decoder registry
generic repository hierarchy
Content URL in Render State
presentation lifecycle coupled to Content lifecycle
```

若 Subsystem 与 Renderer实现阶段确实产生相同 Content HTTP client mechanics，只有在两个 production consumers都真实存在时才抽取最小 shared client helper；不得为了 package symmetry预建 `content-core`。

---

## 9. Done

M12/03 complete when：

```text
logical namespace/key/expectedVersion → real Content API works
response version mismatch cannot return bytes as success
same key + different version cannot reuse stale bytes
returned bytes cannot mutate internal cache/future reads
physical URL/path/token不进入 Renderer business/Render state
Content failure不改变 Render/Main/Subsystem authority
no RenderNode schema interpretation is pulled into M12
no presentation/asset framework is introduced
```

M14 只需把真实 presentation resource reference投影到这条已冻结的 bytes capability。