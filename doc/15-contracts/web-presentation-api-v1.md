# Web Presentation API v1

> 层级：Renderer Window-local business presentation ABI  
> 状态：Active / Normative / Frozen  
> 稳定程度：Design Frozen  
> 依赖：[Render Update v1](./render-update-v1.md)、[Content API v1](./content-api-v1.md)、[渲染系统](../10-architecture/rendering-system.md)  
> 相关：[Web Presentation Config v1](./web-presentation-config-v1.md)、[ADR 0031](../decisions/0031-business-owned-web-component-projection.md)  
> Qualification evidence：[M13 Web Presentation Qualification](../30-implementation/m13-qualification.md)  
> 最近复核：2026-10-12

本文定义 Web Projector 对 business Custom Element 的唯一 v1 ABI。Web Projector 机械投影 current retained Render facts，并将 eligible transient Render Event 精确投递给 current live element；DOM/WC private state 不是 Render/Main authority source。

本文使用 `MUST`、`MUST NOT`、`SHOULD`、`MAY` 表达规范强度。

## 1. Business type surface

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

`WebPresentationContext` v1 closed shape = exactly `resources` + `emitCustomEvent`。Error contract 是 structural `Error + readonly code`；不冻结 shared constructor/`instanceof` identity。

这些 receiver 是 structural ABI，不要求 mandatory base class。Element 可以实现 none / one / multiple receiver。

v1 不定义：

```text
WC→Render mutation
DOM→Store reverse sync
public component registry
AssetManager
dynamic loader
layout/stacking framework
global service locator
```

### 1.1 Renderer Presentation Effect seam

`@loomrealm/renderer/web-presentation` 的 structural effect surface：

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

`reevaluate(...)` 只处理 retained projection；`deliverRenderEvent(...)` 只处理 transient Render Event。未实现 optional `deliverRenderEvent` 的 effect 直接 drop forward Event。

Render Event MUST NOT 进入 `RendererPresentationSource` retained view，也不得通过 `reevaluate()` drain transient queue。

任何从 `deliverRenderEvent(...)` 逃逸的 throw 必须在 Renderer presentation boundary 隔离，不得逃逸到 Renderer Data handler，也不得仅因 presentation throw 导致 Data Runtime local-fatal / terminal。

## 2. Receiver lifetime and ordering

三个 receiver 相互独立：

```text
context
→ Renderer Window presentation lifetime capability

data
→ current retained RenderNode.data

event
→ one-shot transient presentation impulse
```

新 element 的 retained observable order：

```text
construct
→ receiveRenderContext(...), if implemented
→ first managed insertion / connectedCallback may occur
→ managed structure/children
→ attrs
→ receiveRenderData(current full data), if implemented
```

因此：

- context 必须在第一次 managed insertion 前注入；同一 HTMLElement 最多一次；
- `connectedCallback()` 不得假设 initial attrs/children/data 已 ready；
- callback throw 仍计为该次 delivery attempt，不自动 retry。

已有 element 的 retained update：

```text
structure / children / root reorder
→ attrs
→ receiveRenderData only when required
```

Render Event 永不作为 construction/reconnect baseline replay；它只能投递给 exact current live element。

Carrier causality：

```text
preceding retained commit
→ reconcile / receiveRenderData attempt
→ receiveRenderEvent attempt
→ causally later Render Update may become presentation-observable
```

同一 exact target 的 eligible Event FIFO，不并行、不 reorder、不 coalesce、不 deduplicate。

## 3. Render Data delivery

`receiveRenderData` 交付 current retained **full** `RenderNode.data`；wire partial patch 不直接暴露。

```text
initial materialization
→ attempt current full data once

later committed state
→ attempt again only if retained JSON value changed structurally
```

JSON structural equality：

```text
primitive
→ compare by JSON value

array
→ length + order significant; recurse by element

object
→ member order insignificant; exact key set + recursive value equality
```

因此 object property insertion order 不触发重发；array order 改变会触发。Attrs/order-only commit 若 data structural value不变，MUST NOT 重发 data callback。

实现可以使用 recursive compare、canonical hash 或 observable-equivalent mechanics，但不得以 JS object identity 决定 delivery。

Callback throw 仍记录为该 structural value 的一次 attempt；无 data change 的后续 commit 不自动 retry。

Minimal per-live-element delivery bookkeeping 是 private mechanics，不是第二份 Render authority。

## 4. Authority topology and presentation eligibility

Presentation 只读取现有 authoritative facts，不拥有 topology registry。

Production inputs：

```text
A. committed current Renderer Control snapshot
   → sessionId / dataAuthorities topology

B. successful current Render Store commit
   → render.domains / render.snapshot / render.patch
   → retained projection reevaluation

C. eligible current render.event
   → one-shot receiveRenderEvent delivery attempt
```

Current Control snapshot 是 `(Session, subsystemKey, generation)` topology source；per-subsystem Renderer Store 是对应 retained Render replica source。

`render.event` 不修改 Renderer Store、不触发 retained commit、不进入 retained presentation view。

对 current `(sessionId, subsystemKey, generation)`，subsystem presentation-eligible 当且仅当：

```text
committed DataAuthority exists
AND matching current Data carrier exists
AND matching Store currentCarrier
AND registrySeen
AND every current Domain is baselined
```

Registry 为空时，Registry commit 即 complete baseline。

### Same-generation carrier loss

若 Control 仍声明 same session/subsystem/generation，但 matching carrier 丢失：

```text
→ preserve last successful managed DOM for that subsystem
→ freeze only that subsystem projection
→ no context/data callback caused by loss
→ no stale Render Event delivery
→ no LoomRealm-caused detach/reinsert
```

Partial rebaseline 不得泄漏到 DOM；complete baseline 后 reconcile 一次。即使某个 Domain 已 baselined，只要同 subsystem 仍有其他 current Domain 未 baseline，forward Render Event 都直接 drop，不 buffer / replay。

### Control transport loss

若 current Control peer terminal 且尚无新的 committed replacement snapshot：

```text
→ preserve/freeze last successful managed presentation
→ do not reinterpret local loss as empty topology
→ no stale Render Event delivery
```

## 5. Live identity transitions

完整 live node identity：

```text
(Session, subsystemKey, generation, domainId, key)
```

Same live identity 必须复用同一 HTMLElement。

Fresh Session：

```text
S → S'
→ retire/remove S managed element universe
→ discard S private delivery bookkeeping
→ S events become ineligible
→ wait S' matching carriers + complete baselines
→ create fresh S' elements
```

DataAuthority removal：

```text
committed snapshot removes subsystemKey
→ remove that subsystem managed elements
→ stale events become ineligible
```

Removal 不等待未来 Render Store commit。

Generation change：

```text
G → G+1
→ retire/remove G element universe immediately
→ G events cannot cross
→ wait G+1 current carrier + complete baseline
→ create fresh G+1 elements
```

相同 textual domain/key 不允许跨 fresh Session/generation 复用 HTMLElement 或 transient Event。

## 6. Mechanical projection

```text
RenderNode.tag      → document.createElement(tag)
RenderNode.attrs    → managed host attrs
RenderNode.children → managed ordered light DOM
RenderNode.data     → receiveRenderData
render.event        → receiveRenderEvent
```

Bare `key` 不是 Window-global identity。Move/reparent/reorder 必须移动 still-live HTMLElement，而不是 recreate。

Top-level managed body sequence：

```text
subsystemKey UTF-8 lexical ascending
→ zIndex ascending
→ same zIndex: domainId UTF-8 lexical ascending
→ authoritative roots order
```

该顺序只是 deterministic physical concatenation，不创建 cross-Subsystem global z-index/layout authority。

Business WC 对 managed attrs/data/light-DOM order 只读；可以自由拥有 Shadow DOM、Canvas/WebGL、private fields/cache/animation/layout。Renderer 不从 DOM reverse-sync Store，也不使用 MutationObserver policing。

Transient Event 只能影响 WC presentation-local behavior，不能创建/删除/reparent RenderNode 或修改 Renderer Store。

## 7. Presentation Resource capability

`PresentationResourceClient` 是 Renderer-private Content resource capability 的 narrow readonly façade：

```text
namespace + hierarchical key + expectedContentVersion
→ caller-owned bytes + MIME + actual contentVersion
```

`expectedContentVersion` 必须满足 Content contract 的 `sha256:<64 lowercase hex>`；version mismatch reject `CONTENT_CONFLICT`。

Business 不获得 origin、installationId、token/bearer、path、FSDB、privileged URL、raw Response、private ResourceClient 或 Platform resolver。

Returned bytes 必须 caller-owned；caller mutation不得影响 cache/future reads/other consumers。

Presentation context/resource capability lifetime = Renderer Window presentation lifetime：

```text
Window teardown
→ cancel in-flight reads
→ affected callers reject CONTENT_CANCELLED
→ later well-formed reads reject CONTENT_CANCELLED
```

Caller-provided AbortSignal 只取消其单次 read，并映射 `CONTENT_CANCELLED`。

## 8. WebComponent → Subsystem custom event

每个 live RenderNode 获得自己的 stable `WebPresentationContext`；所有 contexts 共享 Window-lifetime `PresentationResourceClient`。

`emitCustomEvent(name, data)` 是唯一 reverse capability。省略/显式 `undefined` data 使用 frozen module-local empty JSON object；`null` 不是 default。

Reserved User Input channel：

```ts
const WEB_PRESENTATION_EVENT_CHANNEL_V1 =
  "x.loomrealm.web-presentation.event" as const;
```

Renderer 绑定 provenance；resulting input payload exactly：

```ts
{
  domainId: string;
  targetKey: string;
  name: string;
  data: InputEventV1["payload"];
}
```

Business code 不得提供/覆盖 Session、subsystemKey、generation、domainId、targetKey、frameId、activationId 或 channel。

Acceptance order：

```text
attachment + Control/Data/Store/RenderNode currentness
→ name validation
→ reserved payload validation
→ targeted InputGate delivery to owning subsystem
```

Detached/ended/structurally-failed Projector、expired live record、old Session/generation、retired carrier、partial rebaseline 或 removed target 的 reverse event 在 argument validation 前 silently drop。

Current source 的 invalid name/payload 必须同步 throw `TypeError` 且不得进入 InputGate/Data writer。Name 为 1..128 UTF-8 bytes 的 Unicode scalar string。完整 envelope 必须满足 User Input v1 JSON/depth/member/size limits。

Delivery 只到 RenderNode owning subsystem；different current `InputTarget` 导致 drop，不 redirect。Input publisher 一旦接受，后续 RenderNode removal 不 retract。

## 9. Subsystem → WebComponent Render Event

Forward path：

```text
RenderDomain.emit({ targetKey, name, data })
→ render.event
→ current Renderer applicability/currentness gate
→ RendererPresentationEffect.deliverRenderEvent(...)
→ WebProjector exact live identity lookup
→ receiveRenderEvent({ name, data })
```

Delivered event/data 必须是 detached readonly ownership；business mutation不能修改 wire object、Renderer bookkeeping、Store 或其他 delivery。

`receiveRenderEvent()` 是 synchronous fire-and-forget：

```text
invoke
→ return or throw
→ attempt complete
```

没有 Promise completion、ACK、result、retry、buffer 或 replay semantics。

Missing target → drop；missing receiver → ignore。Detached/ended/structurally-failed presentation 即使旧 HTMLElement 仍物理存在也不得收到 Event。

Renderer Store 只做 applicability gate，不保留 Event history、不把 Event 计入 retained facts 或 Domain revision。

## 10. No synchronous business reentrancy

如果 `receiveRenderEvent()` 内调用 valid `emitCustomEvent()`：

```text
currentness / arguments may validate synchronously
→ reverse input is staged locally
→ receiveRenderEvent returns or throws
→ only then staged input may enter normal InputGate publication
→ only then Subsystem business execution may observe it
```

因此 reverse custom event 不得在 forward callback stack 内同步 re-enter Subsystem business execution。

Invalid reverse event 仍同步 throw `TypeError`。已经成功 staged 的 valid reverse input 不因随后 receiver throw 回滚。

同一 forward callback 内多个 staged reverse inputs 按 `emitCustomEvent()` 调用 FIFO 发布，不 reorder/coalesce/deduplicate。

## 11. Structural failure / preflight

Projector materialize 新 live identity 前，必须在本次首次 LoomRealm-managed DOM mutation 之前对所有新 tags 做 side-effect-free preflight：

```text
customElements.get(tag) !== undefined
```

任一 tag 未注册：

```text
→ report Window-local structural failure
→ zero managed DOM mutation for this reconciliation
→ no fallback element
→ no wait-for-late-registration recovery
→ preserve previous successful managed DOM exactly
→ stop all future LoomRealm-managed DOM mutation in this Window
→ stop all future forward Render Event delivery in this Window
```

恢复只允许 fresh Renderer Window/bootstrap。该 failure 不 rollback Store、不 mutate Main/Subsystem、不 fail Runtime/Frame，也不是 Render protocol-fatal。

## 12. Ordinary presentation failure

以下 ordinary presentation failure：

```text
receiveRenderContext throw
receiveRenderData throw
receiveRenderEvent throw
RendererPresentationEffect.deliverRenderEvent throw
resource rejection
ordinary DOM/business presentation exception
```

统一语义：

```text
presentation-local report/rejection
no Store rollback
no Main/Subsystem authority mutation
no automatic Runtime/Frame failure
no Data Runtime local-fatal/terminal solely because of presentation throw
no automatic retry
best-effort continuation where possible
```

`receiveRenderEvent`/`deliverRenderEvent` throw 不 rollback 已 staged valid reverse input。

Unknown-tag structural failure 遵守 §11 的更强 fail-closed 规则。

## 13. Frozen compatibility invariants

1. Control snapshot 是 Session/DataAuthority topology authority；
2. Store 是 per-subsystem retained Render replica authority；
3. DOM/WC 是 mechanical projection 与 presentation-local state owner，不是业务 authority；
4. full live identity 包含 Session/subsystem/generation/domain/key；
5. transport loss 不等于 authority removal；
6. context/data/event receiver 相互独立；
7. data 按 retained structural value 交付，event 按 transient occurrence 交付；
8. resource capability 随 Window lifetime 终止；
9. unknown-tag preflight 必须阻止 partial DOM mutation，并冻结该 Window 的 managed mutation/event delivery；
10. structural ABI 不要求 mandatory base class；
11. 不建立 second Presentation Store/topology、public component registry、AssetManager、layout framework 或 global service locator；
12. Render Event 不进入 retained source/Store history，不 buffer/replay；
13. partial rebaseline、stale identity、detached/ended/failed presentation 的 Event 直接 drop；
14. retained commit → Event → later Render Update 的 carrier causality不得重排；
15. delivered Event/data 与 wire object 隔离为 readonly ownership；
16. reverse custom event 继续走 existing InputGate，禁止同步 business reentrancy；
17. 不增加 Event ACK/Result/retry/persistent queue/DOM command protocol。

实现与 qualification 证据不在本 Contract 复制；以当前源码、tests 与对应 qualification evidence 为准。