# ADR 0032：冻结 M13 Web Presentation API v1 与 presentation resource capability

> 状态：Accepted / Current Design  
> 日期：2026-09-08  
> 层级：架构决策记录  
> 更新：[ADR 0031](./0031-business-owned-web-component-projection.md) 中关于 M13 WC ABI / runtime Content capability 的未闭合部分  
> 正式化：[Web Presentation API v1](../15-contracts/web-presentation-api-v1.md)  

---

## 1. Context

ADR 0031 已经关闭：

```text
Renderer Store
→ thin Web Projector
→ business-owned Custom Elements
```

并冻结 `receiveRenderData(...)` 作为 retained Render data 的 business-facing WC ABI。

同时，M12 已经实现并 qualification Renderer trusted/private ResourceClient：

```text
namespace + hierarchical resource key + expectedContentVersion
→ version-checked readonly bytes + MIME + actual contentVersion
```

该 client 内部绑定 current prepared installation、Content origin与 credential；这些 physical/security facts不得进入 business Render state或业务 WC。

ADR 0031 只留下原则：Business WC runtime resource usage不得绕过 M12 boundary，但没有定义业务实际如何获得一个合法的 runtime resource capability。

M13 如果不关闭这个 seam，后续实现容易出现两种坏结果：

```text
1. 直接把 Renderer private ResourceClient暴露给业务；或
2. 通过 window/global/privileged URL/token建立旁路。
```

两者都会破坏 M12 已关闭的 credential/physical-location boundary。

---

## 2. Decision

M13 现在正式关闭 runtime business presentation resource seam。

新增统一 formal contract：

```text
Web Presentation API v1
```

它包含两个**彼此独立**的 optional receiver：

```text
receiveRenderContext(...)
receiveRenderData(...)
```

二者放在同一 contract/version下治理，但不合并为同一个 callback/interface requirement。

原因：

```text
Render Context
= Window-lifetime capability/environment
= normally one injection per HTMLElement instance

Render Data
= retained authoritative presentation state
= initial + repeated committed updates
```

把它们放在同一 API contract可以统一 Web Projector ABI、版本、qualification 与 failure semantics；保持接口独立则避免 capability lifetime与 Render commit lifetime耦合。

---

## 3. Context Receiver

M13 冻结：

```ts
interface RenderContextReceiver {
  receiveRenderContext(context: WebPresentationContext): void;
}
```

`WebPresentationContext` V1 exact capability shape：

```ts
interface WebPresentationContext {
  readonly resources: PresentationResourceClient;
}
```

V1 不把 context 设计成 generic service bag。

新 projected element 的顺序：

```text
construct HTMLElement
→ receiveRenderContext(...), if implemented
→ first managed DOM insertion / connectedCallback may happen
→ managed structure/children
→ attrs
→ receiveRenderData(...), if implemented
```

同一 HTMLElement instance最多注入一次 context。

Render move、Domain reorder、attrs/data update、same-live-key reconciliation都不得重新注入。

---

## 4. Presentation Resource Client

M13 冻结 narrow business-facing façade：

```ts
interface PresentationResourceClient {
  resource(
    namespace: string,
    key: string,
    expectedContentVersion: string,
    options?: { readonly signal?: AbortSignal },
  ): Promise<{
    readonly bytes: Uint8Array;
    readonly mime: string;
    readonly contentVersion: string;
  }>;
}
```

它的 realization：

```text
Business WC
→ PresentationResourceClient
→ Renderer trusted/private ResourceClient
→ M12 Content API
```

不重新实现：

```text
HTTP
Content credential
Content route grammar
version validation
private resource cache
prepared installation binding
```

M13 façade只冻结 business-observable narrow semantics与错误映射。

---

## 5. Why Expected Version Is Required

M13 不提供：

```ts
resource(namespace, key)
```

而要求：

```ts
resource(namespace, key, expectedContentVersion)
```

这样业务 Render data可以表达自己选择的 logical resource/version，并保证 physical presentation消费 exact expected bytes：

```text
Subsystem business state
→ Render data contains business-defined resource ref/version
→ M11 replication
→ Renderer Store
→ receiveRenderData(...)
→ WC interprets its own data
→ PresentationResourceClient(... expectedVersion)
→ M12 actual version exact check
→ bytes
```

如果 actual version不同，必须返回 conflict，而不是 silent latest-version drift。

LoomRealm仍不规定统一 RenderNode.data resource-reference schema。

---

## 6. Security / Capability Boundary

业务 WC永远不得通过本 API获得：

```text
Content bearer/token
Content origin
installationId
filesystem path
FSDB handle
privileged localhost URL
raw Response
Platform executable/content resolver
RendererResourceClient object identity
```

因此不能用：

```text
window.loomRealm.resources
globalThis service locator
DOM attribute/Event payload
mandatory LoomRealm base element
```

来公开 capability。

Capability只由 trusted Projector通过 `receiveRenderContext(...)` 注入具体 projected element。

本设计是 authority/capability minimization，不声称在同一 JS Realm 内提供 hostile-code sandbox。Presentation scripts仍是 trusted product-selected executable material。

---

## 7. Context Lifetime

Context与resource capability lifetime对齐 Renderer Window：

```text
Renderer Window
=
Web presentation environment
=
Presentation context capability lifetime
```

不与以下 lifetime绑定：

```text
Frame
Activation
RenderDomain
RenderNode
Data carrier
```

Window teardown取消仍在进行的 presentation resource reads。

Element removal不创建独立 revoke protocol；业务脚本可能已经保留该 object reference，同 Realm trusted-code模型下不建立伪安全语义。

---

## 8. `receiveRenderData` Remains Independent

ADR 0031 的 retained-data semantics保持：

```ts
interface RenderDataReceiver {
  receiveRenderData(data: DeepReadonly<JsonObject>): void;
}
```

继续是：

```text
optional
initial full current data
subsequent committed full current data
no partial patch ABI
no reverse write capability
```

实现 `receiveRenderContext` 不要求实现 `receiveRenderData`；反之亦然。

M13 不创建：

```text
interface MandatoryLoomRealmElement
```

也不要求业务组件继承 LoomRealm base class。

---

## 9. Projector Ordering Amendment

ADR 0031 的 projection order从：

```text
structure
→ attrs
→ receiveRenderData
```

对“已有 element 的 committed update”仍保持不变。

对“新 element materialization”补充 creation-time step：

```text
construct
→ receiveRenderContext, if implemented
→ structure / managed insertion + children
→ attrs
→ receiveRenderData, if implemented
```

Context injection MUST 在第一次 managed DOM insertion / possible `connectedCallback` 之前。

这样业务组件在进入 connected lifecycle前已经拥有其合法 presentation capability。

---

## 10. Failure Boundary

Resource read rejection：

```text
CONTENT_NOT_FOUND
CONTENT_CONFLICT
CONTENT_INVALID
CONTENT_UNAVAILABLE
CONTENT_CANCELLED
```

只形成 presentation-local failure。

`receiveRenderContext(...)` 或 `receiveRenderData(...)` throw：

```text
report presentation-local error
no Store rollback
no Main/Subsystem authority mutation
continue best-effort where possible
```

Context injection一旦调用即算 attempt；throw后不得在未来 Render commit中自动重试形成 callback loop。

---

## 11. What This Does Not Introduce

M13仍不建立：

```text
AssetManager
ResourceStore
Repository abstraction
dynamic module loader
component/plugin registry
decoder registry
prefetch graph
Blob/module graph
layout engine
CSS stacking manager
RenderEvent → WC ABI
```

`PresentationResourceClient` 只是一层 narrow readonly façade，不是 asset framework。

Bootstrap JS/CSS仍由 `WebPresentationConfigV1`负责；runtime resource bytes由 `WebPresentationApiV1`负责。两者职责明确分离。

---

## 12. Update to ADR 0031

本 ADR 对 ADR 0031 做以下 current-v1 narrow update：

1. ADR 0031 中“`receiveRenderData(...)` 是唯一需要 LoomRealm额外定义的 WC ABI”的表述更新为：Web Presentation API v1包含 `RenderContextReceiver` 与 `RenderDataReceiver` 两个独立 optional receiver；
2. ADR 0031 中尚未具体化的 Business WC runtime Content capability现在由 M13 `PresentationResourceClient`关闭；
3. ADR 0031 的 existing update-order保持，但新 element creation前增加 one-shot context injection；
4. ADR 0031 对 Render Update v1、DOM read-only boundary、no RenderEvent ABI、no generic layer framework的所有决策保持不变。

本 ADR 不 supersede ADR 0031；两者构成同一 M13 Web presentation decision chain。

---

## 13. Qualification

M13 Chromium qualification新增：

```text
optional RenderContextReceiver
context injection before first managed DOM insertion / connectedCallback
one context injection per HTMLElement instance
move/reorder does not re-inject
context and data receivers independently implementable
real M12 resource read through PresentationResourceClient
expected version exact match
version mismatch → CONTENT_CONFLICT
returned bytes caller-owned
no origin/token/path/private client exposure
AbortSignal / Window teardown cancellation
context callback throw does not rollback authority and is not retried
```

---

## 14. Consequences

正向：

- M13 自己关闭 Web presentation runtime resource seam，不把未定义 capability拖到 `loom.map`；
- M12 trusted/private ResourceClient继续保持 private；
- context/data由同一个 formal API治理，但 lifetime语义不混在一起；
- 业务组件无需全局 service locator或 LoomRealm base class；
- exact version read使 Render state与最终 resource bytes保持可验证一致；
- M14 可以直接作为真实 consumer使用已冻结 capability，而不是边做地图边重新选择 infrastructure ABI。

代价：

- M13增加一个非常小的 business-facing browser ABI；
- Projector materialization需要在首次 DOM insertion前执行 one-shot context injection；
- M13 qualification必须增加真实 Content read + browser lifecycle组合测试。

---

## 15. Reopen Conditions

以下不是 reopen理由：

```text
某业务想要 AssetManager convenience API
某组件希望拿直接 URL避免复制 bytes
某 framework偏好 global dependency injection
某业务希望自动 decode image/audio
```

允许 reopen：

```text
真实 business WC无法在首次 managed insertion前安全接收必要 capability
Window-lifetime capability产生 demonstrable correctness/security contradiction
expected-version resource read无法表达真实 presentation resource semantics
PWA conformant realization无法保持同一 business-observable API
```
