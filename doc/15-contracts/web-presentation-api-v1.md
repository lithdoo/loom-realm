# Web Presentation API v1

> 状态：Active / Normative / Stabilizing  
> Milestone：M13 Web Presentation Projection  
> 层级：Renderer Window-local business presentation ABI  
> 依赖：[Render Update v1](./render-update-v1.md)、[Content API v1](./content-api-v1.md)、[渲染系统](../10-architecture/rendering-system.md)  
> 相关：[Web Presentation Config v1](./web-presentation-config-v1.md)、[ADR 0031](../decisions/0031-business-owned-web-component-projection.md)  
> 最近复核：2026-09-08

本文使用 `MUST`、`MUST NOT`、`SHOULD`、`MAY` 表达规范强度。

本契约冻结 **Renderer Window 内 Web Projector 与 business-owned Custom Element 之间的本地 ABI**。它不是 network/wire protocol，不修改 Render Update v1，也不向业务暴露 Renderer Store、Content credential、filesystem path、physical URL 或 Platform resolver。

---

## 1. Scope

Web Presentation API v1 统一治理两个彼此独立的 optional receiver：

```text
receiveRenderContext(...)
    → Window-lifetime presentation capability injection
    → at most once per HTMLElement instance

receiveRenderData(...)
    → retained RenderNode.data delivery
    → initial + subsequent committed data changes
```

两个 receiver 属于同一个 API/version，但职责与调用频率独立；实现一个不要求实现另一个。

V1 不定义：

```text
RenderEvent → WC callback
WC → Render mutation
DOM → Store reverse sync
component registry
AssetManager / decoder registry
dynamic component loader
layout / stacking framework
global presentation service locator
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

interface PresentationResourceError extends Error {
  readonly code: PresentationResourceErrorCode;
}
```

`WebPresentationContext` V1 是 closed capability shape：

```text
exactly resources
```

`PresentationResourceError` 的稳定 contract 是 `Error + readonly code` 的 structural shape；V1 **不** 要求业务依赖某个共享 constructor identity 或 `instanceof` 语义。

---

## 3. Receiver Independence / Lifetime

业务 element MAY 实现 neither / one / both receiver；缺少任一 optional method都不是 presentation failure。

两个 receiver 不得合并成“每次 data 更新重新注入 context”的 callback：

```text
context = capability / environment
          Renderer Window lifetime
          stable across Render commits

data    = authoritative retained presentation state
          Render commit lifetime
          changes repeatedly
```

---

## 4. Context Injection

新 projected HTMLElement 的 observable order：

```text
document.createElement(tag)
↓
receiveRenderContext(current WebPresentationContext), if implemented
↓
first managed DOM insertion / connectedCallback may happen
↓
managed structure / children
↓
attrs
↓
receiveRenderData(current full data), if implemented
```

因此 `receiveRenderContext(...)` MUST 在该 element 第一次进入 LoomRealm-managed DOM 前完成。

同一 HTMLElement instance：

```text
receiveRenderContext
→ at most once
```

Render move、Domain/root reorder、attrs/data update、same-live-wire-node reconciliation 不得重复注入 context。一次调用即计为 injection attempt；如果 callback throws，后续 Render commit不得自动重试形成 retry loop。

---

## 5. Context Ownership

Presentation context 的 logical lifetime：

```text
Renderer Window lifetime
=
current Web presentation environment lifetime
```

它不绑定 Frame、Activation、RenderDomain、RenderNode、Data carrier 或 Subsystem Runtime lifetime。

Projector MAY 给多个 elements 共享同一个 frozen context/client object；object identity 本身没有业务语义。Element 从 DOM 移除不要求单独 revoke 已交付 capability。

Renderer Window teardown MUST 终止 presentation resource capability lifetime，并取消仍在进行的 resource reads。

Phase 1 presentation JS 是同一 Renderer Window Realm 中按配置加载的 trusted executable business material；本 contract 是 authority/capability boundary，不是 hostile-code sandbox。

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

成功结果只暴露：

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
privileged URL
raw fetch Response
arbitrary Content endpoint
Renderer-private ResourceClient object
Platform resolver / executable capability
```

V1 resource read继续复用 M12 identity/version：

```text
namespace + hierarchical ResourceKey + expectedContentVersion
```

`expectedContentVersion` MUST 满足 M12 `sha256:<64 lowercase hex>`；actual version mismatch MUST reject as `CONTENT_CONFLICT`，不得 silent读取其他版本 bytes。

Web Presentation API v1 **不** 冻结统一 RenderNode.data resource-reference schema；具体业务 element 如何从自己的 data 选择 namespace/key/version 属于 business contract。

---

## 7. Resource Value Ownership / Errors

成功返回的 `bytes` 必须是 caller-owned value：

```text
caller mutation
↛ internal cache
↛ future reads
↛ other consumers
```

underlying Renderer ResourceClient MAY 继续使用 M12 已冻结的 private cache/in-flight mechanics；Presentation API不新增第二份 asset cache authority。

Presentation-facing rejection使用稳定 code vocabulary：

```text
CONTENT_NOT_FOUND
CONTENT_CONFLICT
CONTENT_INVALID
CONTENT_UNAVAILABLE
CONTENT_CANCELLED
```

底层 Renderer-private error type/name不得泄漏；实现只需映射到 §2 的 structural error contract。

Resource failure是 presentation-local Promise rejection，不得 rollback Renderer Store、mutate Main/Subsystem authority 或 fail Runtime/Frame。

V1 不定义 ImageBitmap/HTMLImageElement/AudioBuffer decoding、Blob URL lifetime、texture cache、prefetch planner或 asset graph；这些属于 business presentation private state/policy。

---

## 8. Render Data Delivery

`receiveRenderData(...)` 交付 current retained data：

```text
optional method
initial materialization → current full data
committed data change → current full data
wire partial patch → never exposed
object identity → no semantic meaning
```

交付值不得成为 Store reverse-write capability。detached value + runtime deep-freeze 是允许的 implementation mechanics，但不是额外 application authority。

---

## 9. Observable Projector Ordering

新 element：

```text
0. construct
1. receiveRenderContext(...), if implemented
2. structure / managed insertion / children
3. attrs
4. receiveRenderData(...), if implemented
```

已有 element 的 committed update：

```text
1. structure / children / root reorder
2. attrs
3. receiveRenderData(...), only when current data delivery is required
```

已有 element 不重复执行 construct/context steps。

`connectedCallback` / `attributeChangedCallback` 是 browser-native lifecycle，不是 LoomRealm atomic-commit ABI；只有本契约明确的 receiver 调用具有 LoomRealm-defined callback semantics。

---

## 10. Data Currentness / Reconnect Semantics

Data carrier lifetime 不等于 live wire-node / HTMLElement lifetime。

same-generation current carrier loss时：

```text
keep last committed managed DOM mounted
freeze Projector mutation
no receiveRenderContext call
no receiveRenderData call
no LoomRealm-caused disconnect/reconnect of preserved elements
```

因此 carrier loss本身 MUST NOT 通过 remove/reinsert 触发 preserved business element 的 `disconnectedCallback` / `connectedCallback`。

replacement carrier开始后，Projector MUST 等待一个 complete presentation baseline：

```text
fresh Registry committed
AND
every Domain in current Registry has a fresh baseline
```

在 complete baseline 前到达的 individual Domain Snapshot/Patch MAY 更新 Renderer Store，但 MUST NOT 产生 partial DOM reconciliation，也 MUST NOT 向 WC交付混合新旧 `receiveRenderData(...)`。

complete baseline建立后，Projector对 current Store做一次 mechanical reconciliation：

```text
matching same live wire-node identity
→ preserve existing HTMLElement

removed identity
→ remove old managed HTMLElement

new identity
→ construct fresh HTMLElement
```

如果 fresh Registry 为空，complete baseline在 Registry commit 后成立，并 reconcile 到空 managed presentation。

fresh generation结束旧 wire-node identity universe；旧 generation 的 managed elements MUST 被 retire/remove。新 generation 即使复用相同 `domainId/key` 文本，也 MUST 创建 fresh HTMLElement，并按 §4 重新执行 context injection。

本契约不增加 business-visible stale/current callback、DOM attribute、event或 PresentationState API。

---

## 11. Failure Boundary

如果 `receiveRenderContext` 或 `receiveRenderData` throws：

```text
report presentation-local error
no Renderer Store rollback
no Main/Subsystem authority mutation
no automatic callback retry loop
continue best-effort projection where possible
```

Resource Promise rejection遵循同一 authority boundary，由业务选择 placeholder/drop/report/private recovery。

---

## 12. No Global Capability Channel

M13 V1 不把 PresentationResourceClient 公开为：

```text
window / globalThis service locator
DOM attribute
DOM CustomEvent payload
global Symbol registry
mandatory LoomRealm base CustomElement class
```

Capability 只通过 `receiveRenderContext(...)` 从 trusted Projector注入目标 projected element。

---

## 13. Relation to Config / Render Identity

两份 Web presentation contract职责分离：

```text
Web Presentation Config v1
→ Renderer Window启动前加载哪些 business JS/CSS

Web Presentation API v1
→ Window运行后 Projector与 business WC如何交互
```

Render node identity仍由 Frozen Render v1拥有。`key` 只在一个 wire Domain 内唯一；M13不得把裸 `key` 升级成 Window-global identity。Projector内部必须按 current wire-node identity scope 区分节点：

```text
(Session, subsystemKey, generation, domainId, key)
```

Renderer Window 已隐含固定 Session/Renderer scope时，private implementation MAY 只保存其余组成部分，但不得改变上述 logical identity。

same live wire-node identity MUST 保持同一 HTMLElement；fresh generation / different subsystem / different domain 即使 `key` 字符串相同，也不是同一 element identity。

本契约不要求 materialize public `RenderNodeIdentity` DTO 或 reusable identity framework。

---

## 14. Qualification

M13真实 Chromium qualification至少证明：

```text
context/data receivers independent and optional
context before first managed insertion / connectedCallback
same HTMLElement receives context at most once
same live wire-node identity preserves HTMLElement across move/reorder
same key string in different Domains/Subsystems does not collide
same-generation carrier loss keeps DOM mounted and fires no receiver/disconnect/reconnect
partial same-generation rebaseline does not mutate DOM or deliver mixed data
complete same-generation rebaseline preserves matching HTMLElement identity
fresh generation may reuse key string without reusing old HTMLElement identity
PresentationResourceClient reads real M12 bytes
expectedContentVersion mismatch rejects as CONTENT_CONFLICT
returned bytes mutation cannot alter future reads
no origin/token/path/private-client exposure
resource cancellation → CONTENT_CANCELLED
receiver/resource failure never rolls back authority
```

Node/unit tests可覆盖 façade validation/error mapping；browser lifecycle/injection/HTMLElement identity/currentness必须由真实 Chromium gate覆盖。

---

## 15. Final Invariants

1. `receiveRenderContext` 与 `receiveRenderData` 属于同一个 Web Presentation API v1，但保持独立 optional receiver；
2. Context 是 Window-lifetime capability/environment，不是 Render state；
3. Data 是 current retained Render state，不携 capability；
4. 新 HTMLElement在第一次 managed DOM insertion前完成 context injection；同一 HTMLElement最多一次；
5. same-generation carrier loss保持最后 committed DOM mounted并冻结 receiver/projection；partial rebaseline不泄漏，complete baseline后才 reconcile；
6. fresh generation创建 fresh HTMLElement identity universe；
7. Presentation resource capability只读且 version-checked；
8. business永远看不到 Content bearer/path/physical URL/FSDB/private Renderer client；
9. resource/callback failure不回滚 application authority；
10. RenderNode.data resource-reference schema仍由业务拥有；
11. bare RenderNode `key` 不是 Window-global identity；HTMLElement identity跟随完整 live wire-node scope；
12. M13不因此建立 AssetManager、dynamic loader、global service locator、public identity framework或第二份 Render authority。
