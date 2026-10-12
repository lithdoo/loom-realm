# Web Presentation API v1

> 层级：Renderer Window-local business presentation ABI  
> 状态：Active / Normative / Frozen  
> 稳定程度：**Design Frozen**  
> 历史 M13 Base：Implemented / Qualified  
> Render Event Delivery Delta：**NOT IMPLEMENTED / NOT QUALIFIED**  
> Milestone：M13 Web Presentation  
> 依赖：[Render Update v1](./render-update-v1.md)、[Content API v1](./content-api-v1.md)、[渲染系统](../10-architecture/rendering-system.md)  
> 增量：[Web Presentation Render Event Delivery Delta](./web-presentation-render-event-delta.md)  
> 相关：[Web Presentation Config v1](./web-presentation-config-v1.md)、[ADR 0031](../decisions/0031-business-owned-web-component-projection.md)  
> 最近复核：2026-10-12

本文使用 `MUST`、`MUST NOT`、`SHOULD`、`MAY` 表达规范强度。

核心原则：

> **Web Projector 只机械投影 current authoritative retained facts，并将 eligible transient Render Event 精确投递给 current business Custom Element。DOM不是 Render/Main authority source；Render Event不是 retained state、RPC 或第二份 Store。**

历史 M13 qualification 只证明当时的 qualification subject；2026-10-12 frozen Render Event Delivery delta 不自动继承历史 PASS。

---

## 1. Scope / Business Type Surface

```ts
interface RenderContextReceiver {
  receiveRenderContext(context: WebPresentationContext): void;
}

interface RenderDataReceiver {
  receiveRenderData(data: DeepReadonly<JsonObject>): void;
}

interface RenderEventReceiver {
  receiveRenderEvent(
    event: DeepReadonly<WebPresentationRenderEvent>,
  ): void;
}

interface WebPresentationRenderEvent {
  readonly name: string;
  readonly data: JsonObject;
}

interface WebPresentationContext {
  readonly resources: PresentationResourceClient;

  emitCustomEvent(
    name: string,
    data?: InputEventV1["payload"],
  ): void;
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

`WebPresentationContext` V1 closed shape = exactly `resources` + `emitCustomEvent`。Error contract 是 structural `Error + readonly code`；不冻结 shared constructor/`instanceof` identity。

该 TypeScript surface 描述 **structural ABI shape**，不要求 mandatory base class。Business code MAY 以兼容 structural type直接实现。

V1 仍不定义：

```text
WC→Render mutation
DOM→Store reverse sync
component registry
AssetManager
dynamic loader
layout/stacking framework
global service locator
```

### 1.1 Renderer Presentation Effect forward seam

由于 `RendererPresentationEffect` 已通过 `@loomrealm/renderer/web-presentation` 暴露，Render Event delivery 使用 source-compatible optional structural capability：

```ts
interface RendererPresentationRenderEvent {
  readonly sessionId: string;
  readonly subsystemKey: string;
  readonly generation: number;
  readonly domainId: string;
  readonly targetKey: string;
  readonly name: string;
  readonly data: DeepReadonly<JsonObject>;
}

interface RendererPresentationEffect {
  reevaluate(
    source: RendererPresentationSource,
    emitNodeEvent: (event: RendererPresentationNodeEvent) => void,
  ): void;

  deliverRenderEvent?(
    event: DeepReadonly<RendererPresentationRenderEvent>,
  ): void;
}
```

`reevaluate(...)` 只负责 retained projection；`deliverRenderEvent(...)` 只负责 transient Render Event。Effect 未实现该 optional capability 时，Event 对该 effect 直接 drop。

Event MUST NOT 被加入 `RendererPresentationSource` retained view，也不得通过 `reevaluate()` drain transient queue。

任何从 `RendererPresentationEffect.deliverRenderEvent(...)` 逃逸的 throw MUST 在 Renderer presentation boundary 被捕获并按 ordinary presentation-local failure 隔离；不得逃逸到 Renderer Data handler，也不得仅因该 throw 导致 Data Runtime local-fatal / terminal。

---

## 2. Receiver Independence / Ordering

Element MAY 实现 neither / one / multiple receiver；三个 receiver 相互独立：

```text
context
→ Renderer Window presentation lifetime
→ stable capability/environment

data
→ retained RenderNode.data value
→ changes by committed Render state

event
→ transient presentation impulse
→ no retained value / no replay
```

新 element retained observable order：

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

已有 element retained update：

```text
structure / children / root reorder
→ attrs
→ receiveRenderData only when required
```

Render Event 永不作为 element construction/reconnect baseline 的一部分 replay。它只能在 exact live element 已经 current 且 eligible 时进行一次 delivery attempt。

若 retained commit causally precedes Event：

```text
retained reconcile / data attempt
→ receiveRenderEvent
```

若 Event causally precedes later retained change/removal：

```text
receiveRenderEvent attempt completes
→ later retained change/removal becomes presentation-observable
```

详细 ordering 以 Render Event Delivery Delta 为准。

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

V1 的 JSON structural equality 固定为递归 value equality：

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

Minimal per-live-element delivery bookkeeping 是允许的 private mechanics，不是第二份 Render authority。

---

## 4. Authority Topology / Presentation Inputs

Presentation读取现有 authoritative facts，不拥有 topology registry。

Production presentation input 只有：

```text
A. committed/fresh current Renderer Control snapshot
   → sessionId / dataAuthorities authoritative topology change

B. successful current Render Store commit
   → render.domains / render.snapshot / render.patch
   → retained projection reevaluation

C. eligible current render.event
   → one-shot forward delivery attempt
   → no retained projection state
```

Current Control snapshot 是 current `(Session, subsystemKey, generation)` topology source；per-subsystem Renderer Store 是对应 retained Render replica source。

`render.event` 不改变 Renderer Store、不触发 retained Store commit、不进入 retained presentation view。

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
→ no Render Event delivery caused by stale carrier
→ no LoomRealm-caused detach/reinsert
```

Partial rebaseline MUST NOT泄漏到 DOM；complete baseline后 reconcile一次，并保留 matching live identity HTMLElement。其他 healthy subsystem MAY继续 projection。

若某 Domain 已 baselined、但同 subsystem 仍有其他 Domain unbaselined，则该 subsystem 的 Render Event **不得投递给 WC**：

```text
→ drop
→ no buffer
→ no replay after complete baseline
```

### Control transport loss

Current Control peer terminal若没有新的 committed replacement snapshot：

```text
→ preserve/freeze last successful managed presentation
→ MUST NOT reinterpret local loss as empty Session/DataAuthority topology
→ no stale Render Event delivery
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
→ all S transient Event becomes ineligible
→ S' waits matching carriers + complete baselines
→ create only fresh S' elements
```

即使其他 textual ids全部相同，也 MUST NOT 跨 Session复用 HTMLElement 或 Event。

### DataAuthority removed

```text
committed snapshot removes subsystemKey
→ remove that subsystem managed elements
→ all pending/stale transient Event for it is ineligible
```

Removal MUST NOT等待未来 Render Store commit。

### Generation changed

```text
G → G+1
→ retire/remove G element universe immediately
→ G transient Event cannot cross
→ wait G+1 matching carrier + complete baseline
→ fresh G+1 elements
```

相同 textual `domainId/key` MUST 得到 fresh HTMLElement；旧 generation Event MUST NOT 投递给 fresh element。

---

## 7. Mechanical Projection / Identity

```text
RenderNode.tag      → document.createElement(tag)
RenderNode.attrs    → managed host attrs
RenderNode.children → managed ordered light DOM
RenderNode.data     → §3 receiver delivery
render.event        → §8.2 transient receiver delivery
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

Render Event 只能影响 WC presentation-local behavior；不能创建、删除、reparent RenderNode，也不能修改 Renderer Store。

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

### 8.1 RenderNode custom event return path

Each live RenderNode receives its own stable `WebPresentationContext`; all such contexts share the same Window-lifetime `PresentationResourceClient`. `emitCustomEvent(name, data)` is the only reverse capability. An omitted or explicitly `undefined` `data` argument uses one frozen module-local empty JSON object；`null` is not a default and remains invalid. The method emits through existing User Input v1 wire using reserved channel：

```ts
const WEB_PRESENTATION_EVENT_CHANNEL_V1 =
  "x.loomrealm.web-presentation.event" as const;
```

Renderer, not business code, binds provenance. Resulting `input.event.payload` exactly：

```ts
{
  domainId: string;
  targetKey: string;
  name: string;
  data: InputEventV1["payload"];
}
```

Business components MUST NOT provide or override `sessionId`, `subsystemKey`, `generation`, `domainId`, `targetKey`, `frameId`, `activationId`, or `channel`. `domainId` / `targetKey` come from exact current live RenderNode；`frameId` / `activationId` come from current Main authority。

Acceptance order is normative：

```text
attachment + Control/Data/Store/RenderNode currentness
→ name validation
→ complete reserved User Input payload validation
→ targeted InputGate delivery to owning subsystem
```

Events from detached attachment、ended/structurally failed Projector、expired exact live record、old Session/generation、retired carrier、partial rebaseline、removed target MUST be silently dropped before argument validation. A current source with invalid name or payload MUST synchronously throw `TypeError` and MUST NOT enter InputGate/Data writer. Names are valid Unicode scalar strings of 1..128 UTF-8 bytes. After name validation，Renderer uses Data payload validator first to require component `data` itself to be an `InputEventV1["payload"]` object，then again on complete `{ domainId, targetKey, name, data }` reserved payload. Complete envelope—not `data` alone—must satisfy existing User Input plain-JSON、finite-number、relative-depth、container-member、compact-JSON 262,144 UTF-8 byte limit。

Delivery is targeted to RenderNode owning subsystem. A different current `InputTarget` MUST cause a drop，never redirect. Once bounded User Input publisher accepts an event，later RenderNode removal does not retract it。

### 8.2 Render Event forward path

Subsystem forward path：

```text
RenderDomain.emit({targetKey,name,data})
→ render.event
→ current Renderer applicability/currentness gate
→ current RendererPresentationEffect.deliverRenderEvent(...)
→ WebProjector exact live identity lookup
→ receiveRenderEvent({name,data})
```

Delivered `RendererPresentationRenderEvent` / `WebPresentationRenderEvent` MUST be detached readonly ownership；business mutation cannot mutate wire object、Renderer bookkeeping、Store 或其他 delivery。

`receiveRenderEvent()` is synchronous fire-and-forget：

```text
invoke
→ return or throw
→ attempt complete
```

No Promise completion、ACK、result、retry 或 replay semantics。

Missing target → drop；missing receiver → ignore。Detached/ended/structurally failed Projector MUST NOT deliver even if old HTMLElement physically remains。

Ordering：

```text
preceding retained commit
→ reconcile / receiveRenderData attempt
→ Event callback attempt
→ causally later Render Update may become presentation-observable
```

Eligible Event MUST NOT be deferred past a later Render Update from same current carrier。

Renderer Store MUST NOT retain Event history。Store may gate Domain/target applicability only；qualification must observe forward seam / receiver，not a Store `events[]` log。

### 8.3 No synchronous business reentrancy

If `receiveRenderEvent()` calls valid `emitCustomEvent()`：

```text
currentness/arguments MAY validate synchronously
→ reverse input is staged locally
→ receiveRenderEvent returns or throws
→ only then staged input may enter normal bounded InputGate publication
→ only then Subsystem business execution may observe it
```

因此 `emitCustomEvent()` inside forward receiver MUST NOT synchronously re-enter Subsystem business execution。

Invalid reverse event still synchronously throws `TypeError` under §8.1。If valid reverse input has been successfully staged and the receiver later throws，that staged input MUST NOT rollback；it proceeds after forward stack ends under normal InputGate rules。

同一次 forward callback 内成功 staged 的多个 reverse inputs MUST 保持 `emitCustomEvent()` 调用 FIFO 进入 InputGate；不得 reorder、coalesce 或 deduplicate。例如 `emitCustomEvent("a")` 后 `emitCustomEvent("b")`，callback 结束后 InputGate 必须先观察 `a`，再观察 `b`。

No new wire message、Renderer Data profile version、Main Control protocol、Frame model、or Render Update version is introduced。

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
→ stop all future Render Event delivery in this Window
```

后续 Session/DataAuthority/generation/Store事实仍可变化，但 failed Window MUST 保持 physical DOM frozen；旧 HTMLElement 即使仍存在也不得收到 `receiveRenderEvent()`。恢复只允许 fresh Renderer Window/bootstrap。

该 failure不 rollback Store、不 mutate Main/Subsystem、不 fail Runtime/Frame、不是 Render protocol-fatal。

---

## 10. Ordinary Presentation Failure

Receiver callback throw、presentation effect callback throw、resource rejection、ordinary DOM/business presentation exception：

```text
presentation-local report/rejection
no Store rollback
no Main/Subsystem authority mutation
no automatic Runtime/Frame failure
no Data Runtime local-fatal / terminal solely because of presentation throw
no automatic callback retry
best-effort continuation where possible
```

该分类明确覆盖：

```text
receiveRenderContext
receiveRenderData
receiveRenderEvent
RendererPresentationEffect.deliverRenderEvent
```

`receiveRenderEvent` / `deliverRenderEvent` throw 不 rollback 已成功 staged 的 valid reverse custom input。

Structural unregistered-tag failure遵守 §9 更强 fail-closed 规则。

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

Render Event forward seam exact type/currentness
existing effect without deliverRenderEvent remains compatible
throw escaping deliverRenderEvent is presentation-local and never Data local-fatal/terminal
Renderer Store has no retained Event/history
Subsystem emit → exact current business WC receiveRenderEvent
Patch/Data reconcile → Event ordering
Event → later Patch/remove ordering
same-target Event FIFO
partial rebaseline Event drops without replay
fresh Session/generation Event never crosses
removed target old Event drops
failed/ended/detached Projector Event drops
missing receiver ignores without fatal
Event data detached readonly ownership
receiveRenderEvent throw is ordinary presentation-local failure
receiveRenderEvent throw has no Store/Runtime/Frame rollback/failure
receiveRenderEvent→emitCustomEvent has no synchronous Subsystem reentrancy
multiple staged reverse inputs preserve emitCustomEvent FIFO
valid staged reverse input survives later receiver throw
architecture regression: no ACK/result/retry/replay/second Store
```

历史 M13 qualification 中的 `RenderEvent not delivered to WC/DOM` 已由 2026-10-12 design freeze 正式替换；历史 evidence 不自动证明本增量。

---

## 12. Frozen Invariants / Reopen Rule

1. Control snapshot = Session/DataAuthority topology authority；
2. Store = per-subsystem retained Render replica authority；
3. DOM = mechanical projection only；
4. full live identity包含 Session/subsystem/generation/domain/key；
5. currentness按 subsystem独立计算；
6. transport loss != authority removal；
7. context/data/event receiver相互独立；data按 structural value交付，event只按 transient occurrence交付；
8. resource capability随 Window teardown终止；
9. unknown-tag preflight必须阻止 partial DOM mutation，并永久冻结 failed Window；failed Window 同时停止 forward Event delivery；
10. structural ABI 不要求 mandatory business base class；
11. 不建立 public PresentationState、second Store/topology、loader/registry、AssetManager、layout/layer framework或 global service locator；
12. Render Event 通过 optional `RendererPresentationEffect.deliverRenderEvent(...)` forward seam，不进入 retained source；
13. `deliverRenderEvent(...)` 逃逸异常必须在 Renderer presentation boundary 隔离，不得导致 Data Runtime local-fatal / terminal；
14. Renderer Store 不保留 Event history，不 replay Event；
15. partial rebaseline / stale identity / detached / ended / failed presentation 的 Event 直接 drop，不 buffer；
16. retained commit→Event→later Render Update 的 carrier causality不得被 presentation delivery 重排；
17. delivered Event/data 与 wire object 隔离为 readonly ownership；
18. `receiveRenderEvent` 是 synchronous fire-and-forget，callback throw 是 ordinary presentation-local failure；
19. reverse custom event 继续走 existing InputGate，禁止同步 business reentrancy；
20. 同一 forward callback 内 staged reverse inputs 保持 `emitCustomEvent()` FIFO，不重排、不 coalesce、不 deduplicate；
21. 已成功 staged 的 reverse input 不因随后 receiver throw rollback；
22. 不增加 Event ACK / Result / retry / persistent queue / DOM command protocol。

除 correctness/security contradiction、cross-contract conflict 或 real consumer failure 外，本 design-frozen ABI 不因 speculative flexibility reopen。Render Event Delivery 在实现与 Chromium qualification 完成前保持 **NOT IMPLEMENTED / NOT QUALIFIED**。
