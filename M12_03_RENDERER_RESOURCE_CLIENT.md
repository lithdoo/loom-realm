# M12 / 03 — Renderer Resource Client

> 状态：**Implemented / Qualified / Closed**
> 阶段：M12 Content  
> 落地顺序：03  
> 最近复核：2026-09-11  
> 前置：[M12 / 01](M12_01_CONTENT_SERVICE.md)  
> 正式契约：[Content API v1](doc/15-contracts/content-api-v1.md)  
> 架构：[渲染系统](doc/10-architecture/rendering-system.md)、[存储与内容系统](doc/10-architecture/storage-system.md)  
> 目标：给 Renderer 一个 version-checked readonly resource bytes capability；不在 M12 决定 RenderNode presentation/resource-reference schema。

> **M12/03 冻结的是 Content resource identity → bytes boundary。Render replica如何被某个 presentation tag解释成该 identity，属于 M14。**

---

## 1. Frozen Position

```text
Renderer-side logical Content resource identity
    namespace + resourceKey + expectedContentVersion
→ bound Renderer ResourceClient
→ Desktop Content API
→ bytes + MIME + actualContentVersion
```

其中：

```text
namespace = one Content logical segment
resourceKey = one-or-more validated logical segments joined by /
expectedContentVersion = sha256:<64 lowercase hex>
```

M12 不冻结：

```text
RenderNode.data → resource identity mapping
known tag/component schema
DOM/Canvas/WebGL consumption
```

因此不要求 M12 ResourceClient自行解析 Render Store。

---

## 2. Minimal Trusted Integration Responsibility

Renderer production code只需要一个 trusted integration responsibility，语义等价于：

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

这是正式发布的 `@loomrealm/renderer/resource-client` trusted integration subpath；Platform composition可以合法构造和使用它，但 `@loomrealm/renderer` root仍只承载 author/application role surface，不导出 ResourceClient、AssetManager、Store或 observer API。精确 implementation class/function名可调整。

Platform composition绑定 current prepared installation与 authorization material；调用方只给 logical namespace/key/version。

Local caller传入 malformed namespace/resourceKey/version 时必须在 HTTP前拒绝；精确 private error class不属于 public Renderer contract。不得把 malformed expected version静默当成 cache miss。

### Trusted browser binding

When this client runs in a browser Realm that will later execute business presentation code，the client MUST bind the native request primitive before that business code is loaded：

```text
trusted bootstrap
→ capture/bind native fetch + URL construction required by the client
→ create RendererResourceClient with private RendererContentAccess
→ only then load business JS
→ later resource() uses the captured request primitive
```

A later business assignment to `globalThis.fetch` MUST NOT receive the private `Authorization: Bearer ...` request。The implementation therefore MUST NOT dynamically look up a business-replaceable page-global `fetch` at `resource()` call time。

This is a concrete capability-hiding requirement already implied by the frozen rule that business presentation cannot obtain physical Content credentials；it does not add a new Content API field、public browser API or BrowserPrimitiveRegistry。

---

## 3. Version Check

`expectedContentVersion` 精确匹配 Content API v1：

```text
sha256:<64 lowercase hex>
```

它不创建新的 HTTP request-version protocol。

固定行为：

```text
GET current logical resource
→ validate response Content metadata
→ actual X-Loom-Content-Version
→ actual format valid
→ actual == expected → accept bytes
→ actual != expected → reject as content conflict
```

客户端不得通过私有 header/query发明第二套 version selector。

Cache identity：

```text
prepared installation identity
+ namespace
+ hierarchical resourceKey
+ contentVersion
```

因此不同 version永远不能共享错误 bytes。

---

## 4. Resource Key / Route Boundary

`key` MAY 是 hierarchical logical ResourceKey，例如：

```text
ui/icons/potion.png
```

Client必须逐 logical segment编码 Content API resource route：

```text
/resources/{namespace}/ui/icons/potion.png
```

不得把 whole resourceKey作为 filesystem path，也不得把 `/` percent-encode进单个 segment来绕过 route grammar。

---

## 5. Value / Cache Ownership

允许 private immutable success cache和 same-ID in-flight dedupe，但 cache storage不得直接交给 consumer。

```text
returned Uint8Array
→ caller-owned detached bytes
→ caller mutation cannot change cached bytes or later reads
```

失败不得永久缓存成成功事实。

不引入 LRU framework、prefetch planner、dependency graph或 mutable asset registry。

---

## 6. Failure Boundary

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

## 7. Lifetime Independence

```text
ResourceClient lifetime != RenderDomain lifetime
resource cache lifetime  != Frame lifetime
Data carrier reconnect   != Content cache invalidation
```

Renderer Control replacement/reload MAY创建 fresh local client composition；这不改变 Content identity semantics。

A fresh browser Window/Renderer lifetime MUST also create a fresh trusted browser binding；old captured primitives/private Content access cannot be reused across retired Window lifetime。

---

## 8. Deferred to M14

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

Render state仍不得携 Content bearer、filesystem path、absolute privileged URL或 resource bytes capability。

---

## 9. Abstraction Budget

允许：

```text
one trusted Renderer integration-subpath ResourceClient responsibility
small version-safe cache/dedupe
small Content response/error mapping
one lexical/bound native browser request primitive when running beside business JS
```

禁止：

```text
public AssetManager
ResourceStore subscription API
loader/plugin/decoder registry
generic repository hierarchy
BrowserPrimitiveRegistry / security service locator
Content URL in Render State
presentation lifecycle coupled to Content lifecycle
```

若 Subsystem 与 Renderer实现阶段确实产生相同 Content HTTP client mechanics，只有在两个 production consumers都真实存在时才抽取最小 shared client helper；不得为了 package symmetry预建 `content-core`。

---

## 10. Done

M12/03 complete when：

```text
logical namespace/hierarchical key/expectedVersion → real Content API works
expected/actual version exact sha256 format validated
response version mismatch cannot return bytes as success
same key + different version cannot reuse stale bytes
returned bytes cannot mutate internal cache/future reads
physical URL/path/token不进入 Renderer business/Render state
browser business code cannot intercept the Content bearer by replacing page-global fetch after trusted client creation
Content failure不改变 Render/Main/Subsystem authority
no RenderNode schema interpretation is pulled into M12
no presentation/asset/security framework is introduced
```

编码阶段只允许调整 private class/function/file布局与 cache mechanics；resource identity、version comparison、route grammar、credential hiding与 failure boundary不得重新选择。
