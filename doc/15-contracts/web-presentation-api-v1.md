# Web Presentation API v1

> 层级：Renderer Window-local business presentation ABI  
> 状态：Active / Normative / Frozen  
> 稳定程度：Frozen / Implemented / Qualified
> Milestone：M13 Web Presentation  
> 依赖：[Render Update v1](./render-update-v1.md)、[Content API v1](./content-api-v1.md)、[渲染系统](../10-architecture/rendering-system.md)  
> 相关：[Web Presentation Config v1](./web-presentation-config-v1.md)、[ADR 0031](../decisions/0031-business-owned-web-component-projection.md)  
> 最近复核：2026-09-09

本文使用 `MUST`、`MUST NOT`、`SHOULD`、`MAY` 表达规范强度。

核心原则：

> **Web Projector 只机械投影 current authoritative facts；business Custom Element只读消费 context/data/resource capability。DOM不是 Render/Main authority source。**

---

## 1. Scope / Type Surface

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
    options?: { readonly signal?: AbortSignal },
  ): Promise<PresentationResource>;
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

`WebPresentationContext` V1 closed shape = exactly `resources`。Error contract是 structural `Error + readonly code`；不冻结 shared constructor/`instanceof` identity。

该 TypeScript surface 描述 **structural ABI shape**，不要求 M13 新增独立 `@loomrealm/presentation` package、public runtime object或 mandatory base class。Business code MAY 以兼容 structural type直接实现；是否在后续真实 author consumer 中增加 type-only package/subpath，只能由真实 ergonomics/correctness需求 reopen，不能为了 package symmetry预建。

V1 不定义 RenderEvent→WC、WC→Render mutation、DOM→Store reverse sync、component registry、AssetManager、dynamic loader、layout/stacking framework或 global service locator。

---

## 2. Receiver Independence / Ordering

Element MAY 实现 neither / one / both receiver。

Context 与 data lifetime独立：

```text
context
→ Renderer Window presentation lifetime
→ stable capability/environment

data
→ retained RenderNode.data value
→ changes by committed Render state
```

新 element observable order：

```text
construct
→ receiveRenderContext(...), if implemented
→ first managed insertion / connectedCallback may occur
→ managed structure/children
→ attrs
→ receiveRenderData(current full data), if implemented
```

因此 context MUST 在第一次 managed insertion 前注入；同一 HTMLElement最多一次。Callback throw也计为一次 attempt，不自动 retry。

`connectedCallback()` 只能依赖 context 已注入（若实现 receiver）；不得假设 initial attrs/children/data ready。

已有 element update：

```text
structure / children / root reorder
→ attrs
→ receiveRenderData only when required
```

---

## 3. Render Data Delivery

`receiveRenderData` 交付 current retained **full** data；wire partial patch永不暴露。

```text
initial materialization
→ attempt current full data once

later committed state
→ attempt again only if retained JSON value changed structurally
```

Object identity无语义。Attrs/order-only commit若 data structural value未变，MUST NOT 重发 data callback。

### 3.1 Frozen structural equality

V1 的 JSON structural equality固定为递归 value equality：

```text
null / boolean / string / number
→ compare by JSON value

array
→ length + element order significant
→ compare elements recursively

object
→ member order insignificant
→ exact key set must match
→ each key's value compares recursively
```

因此：

```text
{"a":1,"b":2}
==
{"b":2,"a":1}
```

但：

```text
[1,2] != [2,1]
{"a":1} != {"a":1,"b":null}
```

实现 MAY 使用 recursive compare、canonical hash或其他 deterministic equivalent；observable callback decision必须等价于上述规则，不得以 JS object identity 或 property insertion order决定 delivery。

Callback throw仍记录为该 structural value 的一次 delivery attempt；无 data change 的后续 commit MUST NOT 对同一 value自动 retry。

Minimal per-live-element delivery bookkeeping是允许的 private mechanics，不是第二份 Render authority。

---

## 4. Authority Topology / Reevaluation

Presentation读取现有 authoritative facts，不拥有 topology registry。

Production reevaluation source只有：

```text
A. committed/fresh current Renderer Control snapshot
   → sessionId / dataAuthorities authoritative topology change

B. successful current Render Store commit
   → render.domains / render.snapshot / render.patch
```

`render.event` 不进入 Web Presentation ABI，也不触发 projection。

Current Control snapshot 是 current `(Session, subsystemKey, generation)` topology source；per-subsystem Renderer Store 是对应 Render replica source。

---

## 5. Per-subsystem Currentness

对 current `(sessionId, subsystemKey, generation)`，该 subsystem只有满足以下条件才 presentation-eligible：

```text
committed DataAuthority exists
AND matching current Data carrier exists
AND matching Store currentCarrier
AND registrySeen
AND every Domain in current Registry is baselined
```

Registry为空时，Registry commit即 complete baseline。

### Same-generation Data carrier loss

```text
Control仍声明 same session/subsystem/generation
+ carrier lost
→ preserve that subsystem last successful managed DOM
→ freeze only that subsystem projection
→ no context/data callback caused by loss
→ no LoomRealm-caused detach/reinsert
```

Partial rebaseline MUST NOT泄漏到 DOM；complete baseline后 reconcile一次，并保留 matching live identity HTMLElement。其他 healthy subsystem MAY继续 projection。

### Control transport loss

Current Control peer terminal若没有新的 committed replacement snapshot：

```text
→ preserve/freeze last successful managed presentation
→ MUST NOT reinterpret local loss as empty Session/DataAuthority topology
```

---

## 6. Session / DataAuthority Identity Transitions

完整 live node identity：

```text
(Session, subsystemKey, generation, domainId, key)
```

Frozen rule：

```text
same live identity → same HTMLElement instance
```

### Fresh Session

```text
S → S'
→ retire/remove entire S managed element universe
→ discard S private identity/delivery bookkeeping
→ S' waits matching carriers + complete baselines
→ create only fresh S' elements
```

即使其他 textual ids全部相同，也 MUST NOT 跨 Session复用 HTMLElement。

### DataAuthority removed

```text
committed snapshot removes subsystemKey
→ remove that subsystem managed elements
```

Removal MUST NOT等待未来 Render Store commit。

### Generation changed

```text
G → G+1
→ retire/remove G element universe immediately
→ wait G+1 matching carrier + complete baseline
→ fresh G+1 elements
```

相同 textual `domainId/key` MUST 得到 fresh HTMLElement。

---

## 7. Mechanical Projection / Identity

```text
RenderNode.tag      → document.createElement(tag)
RenderNode.attrs    → managed host attrs
RenderNode.children → managed ordered light DOM
RenderNode.data     → §3 receiver delivery
```

Bare `key`不是 Window-global identity。Move/reparent/reorder MUST move existing HTMLElement，而不是 recreate still-live identity。

Top-level managed body sequence：

```text
subsystemKey UTF-8 lexical ascending
→ within subsystem: zIndex ascending
→ same zIndex: domainId UTF-8 lexical ascending
→ authoritative roots order
```

该顺序只是 deterministic physical concatenation，不创建 cross-Subsystem global z-index/layout authority。

Business WC 对 managed attrs/data/light-DOM order只读；可自由拥有 Shadow DOM、Canvas/WebGL、private fields/cache/animation/layout。Renderer不从 DOM reverse-sync Store，也不使用 MutationObserver policing。

---

## 8. Presentation Resource Capability

`PresentationResourceClient` 是 M12 Renderer-private ResourceClient 的 narrow readonly façade：

```text
namespace + hierarchical key + expectedContentVersion
→ caller-owned bytes + MIME + actual contentVersion
```

`expectedContentVersion` MUST 满足 M12 `sha256:<64 lowercase hex>`；version mismatch MUST reject `CONTENT_CONFLICT`。

Business MUST NOT获得 origin、installationId、token/bearer、path、FSDB、privileged URL、raw Response、private ResourceClient或 Platform resolver。

Returned bytes MUST caller-owned：caller mutation不得影响 cache/future reads/other consumers。

### Window lifetime

Presentation context/resource capability lifetime = Renderer Window presentation lifetime。

```text
Window teardown
→ terminate capability lifetime
→ cancel all in-flight resource reads
→ affected callers reject CONTENT_CANCELLED
```

Teardown 后，任何**格式正确**的 `resource()` 调用 MUST reject `CONTENT_CANCELLED`，不得成功读取或启动新的 underlying request。

Caller-provided AbortSignal只取消其单次 read；caller cancellation同样映射 `CONTENT_CANCELLED`。

---

## 9. Structural Failure / Preflight

Config 不声明 expected tag set。Projector需要 materialize新 live identity时，必须在本次首次 LoomRealm-managed DOM mutation前对**所有本次需要新建的 tags**做 side-effect-free preflight：

```text
for every new required node:
    customElements.get(tag) !== undefined
```

任一未注册：

```text
report Window-local structural failure
→ zero managed DOM mutation for this reconciliation
→ no unknown fallback element
→ no late-registration wait/upgrade recovery
→ preserve previous successfully reconciled managed DOM exactly
→ stop all future LoomRealm-managed DOM mutation in this Window
```

后续 Session/DataAuthority/generation/Store事实仍可变化，但 failed Window MUST 保持 physical DOM frozen。恢复只允许 fresh Renderer Window/bootstrap。

该 failure不 rollback Store、不 mutate Main/Subsystem、不 fail Runtime/Frame、不是 Render protocol-fatal。

---

## 10. Ordinary Presentation Failure

Receiver callback throw、resource rejection、ordinary DOM/business presentation exception：

```text
presentation-local report/rejection
no Store rollback
no Main/Subsystem authority mutation
no automatic Runtime/Frame failure
best-effort continuation where possible
```

Structural unregistered-tag failure遵守 §9 更强的 fail-closed规则。

---

## 11. Qualification Minimum

Real Chromium MUST至少证明：

```text
context before first insertion / at most once
connectedCallback cannot assume initial attrs/children/data
initial data full snapshot
object member order does not cause data redelivery
array order/data value change does cause data redelivery
attrs/order-only commit with structurally equal data does not redeliver
same identity preserves HTMLElement
fresh Session/generation never reuse HTMLElement
DataAuthority removal needs no later Render commit
same-generation carrier loss freezes only affected subsystem
partial rebaseline hidden / complete baseline reconciles once
Control transport loss does not invent empty authority
body ordering deterministic
unknown-tag preflight causes zero partial mutation
failed Window stays frozen across later authority changes
real M12 resource bytes/version/cancellation/value ownership
Window teardown cancellation + post-teardown CONTENT_CANCELLED
no credential/path/private-client exposure
RenderEvent not delivered to WC/DOM
```

---

## 12. Frozen Invariants / Reopen Rule

1. Control snapshot = Session/DataAuthority topology authority；
2. Store = per-subsystem Render replica authority；
3. DOM = mechanical projection only；
4. full live identity包含 Session/subsystem/generation/domain/key；
5. currentness按 subsystem独立计算；
6. transport loss != authority removal；
7. context/data receiver独立；data callback只按 §3 structural JSON value变化重发；
8. resource capability随 Window teardown终止；
9. unknown-tag preflight必须阻止 partial DOM mutation，并永久冻结 failed Window；
10. M13 structural ABI不要求新增 public presentation package/subpath；
11. M13不建立 public PresentationState、second Store/topology、loader/registry、AssetManager、layout/layer framework、global service locator或 RenderEvent WC ABI。

除 correctness/security contradiction、cross-contract conflict 或 real consumer failure 外，本契约在 M13 implementation/qualification期间不 reopen。
