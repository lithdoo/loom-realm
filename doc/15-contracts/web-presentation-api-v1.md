# Web Presentation API v1

> 状态：Active / Normative / Stabilizing  
> Milestone：M13 Web Presentation Projection  
> 层级：Renderer Window-local business presentation ABI  
> 依赖：[Render Update v1](./render-update-v1.md)、[Content API v1](./content-api-v1.md)、[Web Presentation Config v1](./web-presentation-config-v1.md)、[ADR 0032](../decisions/0032-freeze-m13-web-presentation-api-v1.md)  
> 最近复核：2026-09-08

本契约冻结 **Renderer Window 内 LoomRealm Web Projector 与 business-owned Custom Element 之间的本地 ABI**。

它不是 network/wire protocol，不修改 Render Update v1，也不向业务暴露 Renderer Store、Content credential、filesystem path、physical URL 或 Platform resolver。

---

## 1. Scope

Web Presentation API v1 统一治理两个彼此独立的 optional receiver：

```text
receiveRenderContext(...)
    → Window-lifetime presentation capability injection
    → normally exactly once per HTMLElement instance

receiveRenderData(...)
    → retained RenderNode.data delivery
    → initial + subsequent committed data changes
```

两个接口属于同一个 Web Presentation API v1，但职责与调用频率独立；实现一个不要求实现另一个。

V1 不定义：

```text
RenderEvent → WC callback
WC → Render mutation
DOM → Store reverse sync
component registry
AssetManager
loader/decoder plugin framework
layout/stacking framework
```

---

## 2. Type Surface

概念 TypeScript surface：

```ts
interface RenderContextReceiver {
  receiveRenderContext(context: WebPresentationContext): void;
}

interface RenderDataReceiver {
  receiveRenderData(data: DeepReadonly<JsonObject>): void;
}

interface WebPresentationContext {
  readonly resources: PresentationResourceClient;
}

interface PresentationResourceClient {
  resource(
    namespace: string,
    key: string,
    expectedContentVersion: string,
    options?: PresentationResourceReadOptions,
  ): Promise<PresentationResource>;
}

interface PresentationResourceReadOptions {
  readonly signal?: AbortSignal;
}

interface PresentationResource {
  readonly bytes: Uint8Array;
  readonly mime: string;
  readonly contentVersion: string;
}

type PresentationResourceErrorCode =
  | "CONTENT_NOT_FOUND"
  | "CONTENT_CONFLICT"
  | "CONTENT_INVALID"
  | "CONTENT_UNAVAILABLE"
  | "CONTENT_CANCELLED";

class PresentationResourceError extends Error {
  readonly code: PresentationResourceErrorCode;
}
```

`WebPresentationContext` V1 是 closed capability shape：

```text
exactly resources
```

不得借 `context` 变成 generic service locator。

---

## 3. Receiver Independence

业务 element MAY 实现：

```text
neither receiver
RenderContextReceiver only
RenderDataReceiver only
both receivers
```

缺少任一 optional method都不是 presentation failure。

两个 receiver 的语义不得合并成一个“每次 data 更新同时重新注入 context”的 callback。

原因：

```text
context = capability/environment
         Window lifetime
         stable across Render commits

data    = authoritative retained presentation state
         Render commit lifetime
         changes repeatedly
```

---

## 4. Context Injection

对于一个新创建的 projected HTMLElement：

```text
document.createElement(tag)
↓
if receiveRenderContext exists:
    receiveRenderContext(current WebPresentationContext)
↓
structural insertion / managed children
↓
attrs
↓
receiveRenderData(current full data), if implemented
```

因此 `receiveRenderContext(...)` MUST 在该新 element 第一次进入 LoomRealm-managed DOM、从而可能触发 `connectedCallback` 之前完成。

同一 HTMLElement instance：

```text
receiveRenderContext
→ at most once
```

Render move、attrs/data update、Domain reorder、same-generation reconciliation 不得重复注入 context。

若 same live key 保持同一 HTMLElement，则 context injection history 也随该 instance 保持。

---

## 5. Context Lifetime / Ownership

Presentation context 的 logical lifetime：

```text
Renderer Window lifetime
=
current Web presentation environment lifetime
```

它不绑定：

```text
Frame
Activation
RenderDomain
RenderNode
Data carrier
Subsystem runtime
```

Projector MAY 给多个 elements 共享同一个 frozen context/client object；object identity 本身没有业务语义。

Element 从 DOM 移除不要求单独 revoke 已交付的 capability。Phase 1 presentation JS 是同 Renderer Window Realm 中按配置加载的 trusted executable business material；本 contract 是 authority/capability boundary，不是 hostile-code sandbox。

Renderer Window teardown MUST 终止该 presentation resource capability 的 lifetime，并取消其仍在进行的 resource reads。

---

## 6. Presentation Resource Capability

`PresentationResourceClient` 是 M12 Renderer-private ResourceClient 上的业务可见只读 façade：

```text
Business WC
→ PresentationResourceClient
→ Renderer trusted/private ResourceClient
→ M12 Content API
```

业务调用只提供：

```text
namespace
hierarchical resource key
expectedContentVersion
optional AbortSignal
```

业务可观察成功结果只有：

```text
caller-owned bytes
MIME
actual contentVersion
```

业务 MUST NOT 获得：

```text
RendererContentAccess
origin
installationId
token / bearer
filesystem path
FSDB handle
privileged localhost URL
raw fetch Response
arbitrary Content endpoint
Platform resolver / executable capability
```

Presentation façade不得把 Renderer trusted/private `RendererResourceClient` object本体暴露给业务。

---

## 7. Resource Identity / Version

V1 resource read继续复用 M12 identity：

```text
namespace
+
hierarchical ResourceKey
+
expectedContentVersion
```

`expectedContentVersion` MUST 是：

```text
sha256:<64 lowercase hex>
```

成功条件：

```text
requested logical identity
→ current Content read
→ validate actual Content metadata
→ actual contentVersion == expectedContentVersion
→ return bytes
```

version mismatch MUST reject as `CONTENT_CONFLICT`；不得返回“当前最新 bytes”作为成功。

这保证 Render data 中业务选择的 logical resource/version 与 WC 最终消费 bytes之间没有 silent drift。

Web Presentation API v1 **不** 冻结统一 RenderNode.data resource-reference schema。具体业务 element如何把自己的 data解释成 namespace/key/version属于 business contract。

---

## 8. Resource Value Ownership

成功返回的 `bytes` 必须是 caller-owned value：

```text
caller mutation
↛ internal cache
↛ future reads
↛ other consumers
```

允许 underlying Renderer ResourceClient继续使用 M12 已冻结的 private cache/in-flight mechanics；Presentation API不新增第二份 asset cache authority。

V1 不定义：

```text
ImageBitmap decoding
HTMLImageElement creation
AudioBuffer decoding
Blob URL lifetime
texture cache
prefetch planner
asset dependency graph
```

这些属于 business presentation private state/policy。

---

## 9. Resource Errors

Presentation-facing resource rejection使用稳定 code vocabulary：

```text
CONTENT_NOT_FOUND
CONTENT_CONFLICT
CONTENT_INVALID
CONTENT_UNAVAILABLE
CONTENT_CANCELLED
```

底层 Renderer-private error type/name不得泄漏为业务 contract；实现负责映射到 `PresentationResourceError`。

Resource read failure是 presentation-local failure：

```text
resource Promise rejects
→ business WC chooses placeholder/drop/report/private recovery
```

它不得：

```text
rollback Renderer Store
mutate Main authority
mutate Subsystem Render authority
fail Runtime/Frame
```

---

## 10. Render Data Delivery

`receiveRenderData(...)` 保持 M13 retained-data ABI：

```ts
interface RenderDataReceiver {
  receiveRenderData(data: DeepReadonly<JsonObject>): void;
}
```

语义：

```text
optional method
initial materialization delivers current full data
subsequent committed data change delivers current full data
wire partial patch is never exposed
object identity has no semantic meaning
```

交付值必须不能成为 Store reverse-write capability。detached value + runtime deep-freeze是允许的 implementation mechanics。

---

## 11. Observable Projector Ordering

对新 element，observable order：

```text
0. construct element
1. receiveRenderContext(...), if implemented
2. structure / managed children
3. attrs
4. receiveRenderData(...), if implemented
```

对已有 element 的 committed state update：

```text
1. structure / managed children / Domain-root reorder
2. attrs
3. receiveRenderData(...), only when current data delivery is required
```

已有 element 不重复执行 step 0/1。

`connectedCallback` / `attributeChangedCallback` 等 browser-native lifecycle不是 LoomRealm atomic-commit ABI；只有本 contract 明确的 receiver调用具有 LoomRealm-defined语义。

---

## 12. Callback Failure

如果：

```text
receiveRenderContext throws
receiveRenderData throws
```

则：

```text
report presentation-local error
no Renderer Store rollback
no Main/Subsystem authority mutation
no automatic callback retry loop
continue best-effort projection where possible
```

`receiveRenderContext` 一旦被调用即计为该 HTMLElement 的 injection attempt；throw 后不得因后续 Render commit反复重新注入。

---

## 13. No Global Capability Channel

M13 V1 不把 PresentationResourceClient 公开为：

```text
window.loomRealm.resources
globalThis service locator
DOM attribute
DOM CustomEvent payload
global Symbol registry
mandatory LoomRealm base CustomElement class
```

Capability 只通过 `receiveRenderContext(...)` 从 trusted Projector注入目标 projected element。

这避免把 narrow WC capability扩大为整个 Window的隐式全局 application service。

---

## 14. Relation to Web Presentation Config v1

两份 contract解决不同问题：

```text
Web Presentation Config v1
→ Renderer Window启动前加载哪些 business JS/CSS

Web Presentation API v1
→ Window运行后 Projector与 business WC如何交互
```

Bootstrap JS/CSS 仍通过 Config v1 的 prepared Content resolution和 trusted `<link>/<script>` binding加载。

Runtime ordinary resources 则通过本 API 的 `PresentationResourceClient`读取。

Bootstrap physical binding不得因为 runtime API存在而暴露 URL/token/path；runtime API也不得变成 dynamic script/component loader。

---

## 15. Authority Summary

```text
Subsystem
    authoritative Render state

Renderer Store
    current authoritative replica

Web Projector
    physical projection mutator
    Presentation Context injector

PresentationResourceClient
    narrow readonly business resource façade

Business WC
    Render projection reader
    presentation resource bytes consumer
    owner of private Shadow DOM / Canvas / WebGL / decoded asset state
```

Business WC仍没有：

```text
Render writer
Store observer/writer
Content credential
filesystem capability
protocol carrier
Main/Runtime authority
```

---

## 16. Qualification

M13真实 Chromium qualification至少增加：

```text
receiveRenderContext is optional
context is delivered before first managed DOM insertion / connectedCallback
same HTMLElement receives context at most once
move / Domain reorder preserves element and does not re-inject context
context.resources can read real M12 resource bytes
expectedContentVersion mismatch rejects
returned bytes mutation cannot alter future reads
business cannot observe origin/token/path/privileged URL through API
resource cancellation maps to CONTENT_CANCELLED
resource failure does not mutate Store/Main/Subsystem authority
receiveRenderContext throw is presentation-local and is not retried on later commit
receiveRenderData remains independent from context receiver
```

Node/unit tests可覆盖 facade validation/error mapping；browser lifecycle/injection ordering必须由真实 Chromium gate覆盖。

---

## 17. Final Invariants

1. `receiveRenderContext` 与 `receiveRenderData` 属于同一个 Web Presentation API v1，但是独立 optional receiver；
2. Context表示 Window-lifetime presentation capability，不是 Render state；
3. Data表示 current retained Render state，不携 capability；
4. 新 HTMLElement在第一次 managed DOM insertion前完成 context injection；
5. 同一 HTMLElement最多注入一次 context；
6. Presentation resource capability只读且 version-checked；
7. business永远看不到 Content bearer/path/physical URL/FSDB/Renderer private client；
8. resource failure与 receiver callback failure都不回滚 application authority；
9. RenderNode.data resource-reference schema仍由业务拥有；
10. M13不因此建立 AssetManager、dynamic loader、service locator或第二份 Render authority。
