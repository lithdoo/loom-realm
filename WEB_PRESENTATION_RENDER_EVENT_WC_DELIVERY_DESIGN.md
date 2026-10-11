# Web Presentation Render Event → WebComponent Delivery Design

> 状态：**DESIGN / IMPLEMENTATION-READY / NOT IMPLEMENTED / NOT QUALIFIED**  
> 层级：Renderer / Web Presentation 内部实现设计  
> 目标：补齐现有 `render.event` 从 Renderer 到 exact live business WebComponent 的最后一公里  
> 非目标：不新增 Render Update message，不新增 DOM command protocol，不新增第二份 Presentation Store

本文针对当前 LoomRealm Web Presentation 的一个明确缺口：

```text
Subsystem RenderDomain.emit(...)
        ↓
Render Update v1: render.event
        ↓
Renderer Data
        ↓
RendererRenderStore.onEvent(...)
        ✕
Business WebComponent
```

目标闭环：

```text
Subsystem RenderDomain.emit(...)
        ↓
render.event
        ↓
RendererRenderStore validate / observe
        ↓
Renderer Control currentness gate
        ↓
RendererPresentationEffect.deliverRenderEvent(...)
        ↓
WebProjector exact live identity lookup
        ↓
optional receiveRenderEvent({ name, data })
        ↓
Business WebComponent presentation-local state
```

该能力的第一真实 consumer 是 `game-libs/rpg-dialogue`，但本设计属于 Framework Web Presentation，不引入任何 Dialogue vocabulary。

---

## 1. 当前实现事实

现有系统已经具备以下能力：

1. `RenderDomain.emit({ targetKey, name, data })` 已存在；
2. `render.event` 已是 Render Update v1 的正式 message kind；
3. Subsystem RenderManager 会验证 event，并拒绝 stale target；
4. RenderManager 将 Event 作为 state-work barrier 处理，保留同一 carrier 上的 state/event 顺序；
5. Renderer Data peer 已有 `onRenderEvent`；
6. `RendererRenderStore.onEvent()` 会验证 current domain / baseline / target，并保留 bounded qualification/observation history；
7. `RendererRenderStore.isPresentationTargetCurrent(domainId, targetKey)` 已能判断当前 presentation 是否完整 eligible；
8. WebProjector 已维护完整 live identity：

```text
(Session, subsystemKey, generation, domainId, targetKey)
```

9. WebProjector 已对每个 live element 保存 `LiveElement` record；
10. `receiveRenderContext()` / `receiveRenderData()` 已有成熟 callback failure policy；
11. WC → Subsystem 的 `emitCustomEvent()` reverse path 已实现并 Qualified。

当前真正缺失的只有：

```text
accepted/current render.event
→ current exact LiveElement
→ receiveRenderEvent(...)
```

因此本设计禁止通过新增 View/Store/队列/扫描历史来绕路。

---

## 2. 核心设计决策

本设计冻结以下原则：

```text
A. 不新增 Render Update message kind
B. 不修改 Subsystem public RenderDomain.emit API
C. 不把 event 放入 RendererPresentationView
D. 不通过 reevaluate() 扫描 Store event history
E. 新增独立 transient presentation seam
F. Event 只投递给 exact current live identity
G. Missing target / missing receiver = drop / ignore
H. No buffer / no wait / no replay
I. Patch/Data reconcile 必须先于随后 Event callback
J. receiveRenderEvent callback throw = ordinary presentation callback failure
K. Structural-failed / ended WebProjector 不再投递 event
L. Event 不成为 retained presentation truth
```

架构上必须保持两条独立路径：

```text
Retained path
render.snapshot / render.patch
→ Store
→ RendererPresentationView
→ WebProjector.reevaluate(...)
→ DOM / attrs / receiveRenderData(...)

Transient path
render.event
→ Store current validation / observation
→ currentness gate
→ WebProjector.deliverRenderEvent(...)
→ receiveRenderEvent(...)
```

不得把 transient path 合并进 retained path。

---

## 3. Structural ABI

### 3.1 WebComponent optional receiver

在现有 structural receiver 之外增加：

```ts
interface RenderEventReceiver {
  receiveRenderEvent(
    event: DeepReadonly<WebPresentationRenderEvent>,
  ): void;
}

interface WebPresentationRenderEvent {
  readonly name: string;
  readonly data: JsonObject;
}
```

完整 WC 结构能力变成：

```text
receiveRenderContext(context)
→ Window / environment capability

receiveRenderData(data)
→ retained current full RenderNode.data

receiveRenderEvent(event)
→ transient presentation impulse
```

`receiveRenderEvent` 是 optional structural method：

```text
没有实现
→ event 被忽略
→ 不是 structural failure
```

不引入 mandatory base class，不要求新增 public presentation package。

### 3.2 Internal Renderer presentation event

`packages/renderer/src/internal/presentation-seam.ts` 增加独立类型：

```ts
import type { RenderEventV1, RenderNodeV1 } from "@loomrealm/data";

export interface RendererPresentationRenderEvent {
  readonly sessionId: string;
  readonly subsystemKey: string;
  readonly generation: number;
  readonly domainId: string;
  readonly targetKey: string;
  readonly name: RenderEventV1["name"];
  readonly data: RenderEventV1["data"];
}
```

注意不要复用现有 `RendererPresentationNodeEvent`。

现有：

```text
RendererPresentationNodeEvent
= WC → Renderer → Subsystem
```

新增：

```text
RendererPresentationRenderEvent
= Subsystem → Renderer → WC
```

二者方向相反，必须保持不同类型，不能为了名字相似而合并。

---

## 4. RendererPresentationEffect seam

当前：

```ts
export interface RendererPresentationEffect {
  reevaluate(
    source: RendererPresentationSource,
    emitNodeEvent: (event: RendererPresentationNodeEvent) => void,
  ): void;
}
```

修改为：

```ts
export interface RendererPresentationEffect {
  reevaluate(
    source: RendererPresentationSource,
    emitNodeEvent: (event: RendererPresentationNodeEvent) => void,
  ): void;

  deliverRenderEvent(
    event: RendererPresentationRenderEvent,
  ): void;
}
```

语义：

```text
reevaluate(...)
→ retained state reconciliation
→ may create/remove/move/update live elements

deliverRenderEvent(...)
→ one-shot transient delivery to an already-current live element
→ MUST NOT trigger full reconcile
```

`deliverRenderEvent()` 是 synchronous effect call。

原因：现有 Data dispatch、Store commit、Presentation reevaluate 都是按 message 顺序同步完成；保持 synchronous seam 可以直接保证：

```text
Patch
→ Store commit
→ reevaluate / attrs / receiveRenderData
→ Event
→ receiveRenderEvent
```

无需 ACK、Promise 或第二条 async queue。

---

## 5. Renderer Control delivery point

当前 `packages/renderer/src/control.ts`：

```ts
onRenderEvent: (message) =>
  slot.current?.peer === peer
    ? slot.render.onEvent(message)
    : acceptedDataMessage
```

这只到 Store，不通知 Presentation。

应改为专用 helper，而不是复用 `commitRenderMessage()`。

原因：

```text
Snapshot/Patch accepted
→ Store retained state changed
→ notifyPresentation() / reevaluate()

Event accepted
→ retained state没有改变
→ 不应该 notifyPresentation()
→ 应直接 deliver transient event
```

建议形状：

```ts
private commitRenderEvent(
  slot: RendererDataSlot,
  peer: RendererDataPeer,
  message: RenderEventV1,
): DataInboundDisposition {
  if (slot.current?.peer !== peer) return acceptedDataMessage;

  const outcome = slot.render.onEvent(message);
  if (outcome.kind !== "accepted") return outcome;

  if (!slot.render.isPresentationTargetCurrent(
    message.domainId,
    message.targetKey,
  )) {
    return outcome;
  }

  const current = this.currentValue;
  if (current === null) return outcome;

  const authority = current.snapshot.dataAuthorities.find(
    ({ subsystemKey }) => subsystemKey === slot.current?.identity.subsystemKey,
  );
  if (authority === undefined) return outcome;

  const identity = slot.current.identity;
  if (
    identity.controlPeer !== current.peer ||
    identity.generation !== authority.generation ||
    identity.dataProfile !== authority.dataProfile
  ) {
    return outcome;
  }

  this.deliverPresentationRenderEvent({
    sessionId: current.snapshot.sessionId,
    subsystemKey: identity.subsystemKey,
    generation: identity.generation,
    domainId: message.domainId,
    targetKey: message.targetKey,
    name: message.name,
    data: message.data,
  });

  return outcome;
}
```

然后 Data handler：

```ts
onRenderEvent: (message) =>
  this.commitRenderEvent(slot, peer, message)
```

实现可以抽取现有 currentness helper，避免重复比较；最终 observable semantics 必须等价。

---

## 6. Currentness gate

Event 能进入 WC 之前必须同时满足：

```text
current Control exists
AND matching current DataAuthority exists
AND matching current Data carrier exists
AND matching Store currentCarrier
AND registrySeen
AND every current Domain baselined
AND event.domainId is current
AND event.targetKey is live in that domain
AND exact current Presentation attachment exists
AND exact live element identity still exists
```

其中 Store-level gate 直接复用：

```ts
slot.render.isPresentationTargetCurrent(
  message.domainId,
  message.targetKey,
)
```

该函数当前已经要求：

```text
currentCarrier
registrySeen
all domains baselined
exact domain exists
exact target live
```

因此：

### partial rebaseline

```text
Event arrives during partial rebaseline
→ Store MAY record it in qualification/observation history
→ isPresentationTargetCurrent(...) = false
→ Presentation delivery drops
→ complete baseline later也不得 replay
```

### same-generation carrier loss

```text
old DOM may remain frozen
but Store currentCarrier=false
→ event delivery drop
```

### fresh generation

```text
G event cannot route to G+1 element
```

即使 textual `domainId/targetKey` 一样，也必须因 full identity 不同而 drop。

---

## 7. Event observation history 与 Presentation truth

当前 `RendererRenderStore` 保留：

```ts
private events: RenderEventV1[] = [];
const MAX_EVENTS = 1024;
```

并通过 `snapshotForQualification()` 暴露 bounded history。

这项机制可以保留，但语义必须写准确：

```text
Store events[]
= bounded qualification / observation history

NOT
= retained presentation facts

NOT
= RendererPresentationView state

NOT
= event replay queue

NOT
= WebProjector input source
```

`readPresentationFacts()` 继续不包含 events。

WebProjector MUST NOT 读取或扫描 `snapshotForQualification().events`。

每个 Event 的 Presentation delivery 只能发生在该 Event 被当前 Data handler 接收的那一次同步路径上。

---

## 8. Ordering contract

本设计依赖并正式要求以下 observable ordering：

如果 Subsystem 同一 carrier 顺序发布：

```text
Patch P
Event E
```

且两者都属于 current identity，则 WC 必须观察：

```text
1. Patch P committed into Renderer Store
2. WebProjector reevaluate P
3. DOM structure/attrs reconciled
4. receiveRenderData(newFullData), if data changed
5. receiveRenderEvent(E)
```

不得出现：

```text
receiveRenderEvent(E)
→ later receiveRenderData(P)
```

现有系统已具备这条顺序的基础：

```text
Subsystem RenderManager
→ Event 与 state work有明确队列顺序

Data Runtime
→ message dispatch serialized

Renderer onRenderPatch
→ commitRenderMessage()
→ synchronous notifyPresentation()
→ synchronous WebProjector.reevaluate()

next onRenderEvent
→ only after prior dispatch completes
```

因此实现时不得将 `deliverRenderEvent()` 放到 microtask、timer 或独立 async queue 中。

典型必须成立的业务序列：

```text
Patch:
history.visible = true

Event:
history.scroll-to-latest

WC observes:
visible=true first
then scroll-to-latest
```

---

## 9. WebProjector exact delivery

`WebProjector` 已有：

```ts
private readonly live = new Map<string, LiveElement>();
```

且 `LiveElement` 已保存：

```text
sessionId
subsystemKey
generation
domainId
targetKey
element
```

因此 `deliverRenderEvent()` 不需要 DOM query，也不需要遍历 tree。

建议实现：

```ts
deliverRenderEvent(
  event: RendererPresentationRenderEvent,
): void {
  if (this.ended || this.failed) return;

  const key = identity(
    event.sessionId,
    event.subsystemKey,
    event.generation,
    event.domainId,
    event.targetKey,
  );

  const record = this.live.get(key);
  if (record === undefined) return;

  const receiver = record.element as HTMLElement & {
    receiveRenderEvent?: (
      event: WebPresentationRenderEvent,
    ) => void;
  };

  if (typeof receiver.receiveRenderEvent !== "function") return;

  const delivered = createDetachedFrozenRenderEvent(
    event.name,
    event.data,
  );

  try {
    receiver.receiveRenderEvent(delivered);
  } catch (cause) {
    this.options.reportFailure?.(cause);
  }
}
```

### 9.1 为什么必须 exact identity lookup

禁止：

```text
document.querySelector(...)
querySelector by targetKey
search by tag
search by DOM id
search current tree by textual key only
```

合法 identity 只有：

```text
(Session, subsystemKey, generation, domainId, targetKey)
```

这与现有 HTMLElement identity contract 完全一致。

### 9.2 Missing target

如果 `live.get(identity)` 不存在：

```text
→ drop
→ no buffer
→ no retry
→ no replay
```

Renderer Control 已经做过 currentness gate；WebProjector 再做 exact live lookup 是 presentation-local second guard，用于防止 attachment/lifecycle 边界中的 stale delivery。

---

## 10. Delivered event value ownership

WC 不应获得可修改 Renderer 内部 observation/history 的 object identity。

`receiveRenderData()` 当前拿到的是 Store current retained data；Event path 应显式交付一个 detached readonly value。

建议实现一个小型 clone/freeze helper：

```ts
function cloneAndFreezeJson(value: JsonValue): JsonValue
```

然后：

```ts
function createDetachedFrozenRenderEvent(
  name: string,
  data: RenderEventV1["data"],
): WebPresentationRenderEvent {
  return Object.freeze({
    name,
    data: cloneAndFreezeJson(data),
  });
}
```

要求：

```text
receiver mutation attempt
→ cannot mutate Store event observation history
→ cannot mutate another receiver/event
→ cannot mutate Data peer message object used elsewhere
```

该 copy 不是第二份 authority，只是 callback value ownership isolation。

如果实现证明 Data decoder/message ownership 已经提供同等 detached + immutable guarantee，可以复用统一 helper；不得因为性能提前削弱 callback ownership。

---

## 11. Failure semantics

### 11.1 Missing receiver

```text
element exists
receiveRenderEvent undefined
→ ignore
```

不是错误，不 report structural failure。

### 11.2 Callback throw

```text
receiveRenderEvent throws
→ reportFailure(cause)
→ no Store rollback
→ no Main/Subsystem mutation
→ no Runtime/Frame automatic failure
→ WebProjector remains usable
→ later events continue best-effort delivery
```

该规则与当前：

```text
receiveRenderContext throw
receiveRenderData throw
```

保持同类 ordinary presentation failure。

### 11.3 Structural failed projector

现有 unknown-tag preflight structural failure 会使：

```text
this.failed = true
```

此后：

```text
reevaluate no longer mutates managed DOM
```

`deliverRenderEvent()` 也必须：

```text
if (this.failed) return
```

原因：structurally failed Window 已不再是可信 current presentation realization，不能继续向冻结旧 DOM 注入新的 transient behavior。

### 11.4 Teardown

```text
this.ended = true
→ all later render events drop
```

不得缓存到 future projector/window。

---

## 12. No replay rule

以下所有情况都不得 replay event：

```text
same-generation Data carrier reconnect
partial → complete rebaseline
fresh Session
fresh generation
WebProjector attach after event
missing target later appears
missing receiver later upgraded
DOM node temporarily absent then recreated
```

唯一合法 delivery 时机：

```text
Event is accepted on current Data path
AND target is presentation-current at that instant
AND exact live element exists at synchronous delivery time
```

否则该 Event 永久结束。

---

## 13. Event does not reevaluate retained presentation

处理 Event 时禁止调用：

```ts
notifyPresentation()
WebProjector.reevaluate(...)
```

原因：

```text
render.event
≠ retained state mutation
```

若 Event delivery 为了寻找 target 需要触发一次 reconcile，说明 currentness contract 已经被破坏。

正确顺序必须是：

```text
retained state message
→ reconcile

then transient event
→ exact existing live target delivery
```

---

## 14. Public Web Presentation contract reopen

当前 `doc/15-contracts/web-presentation-api-v1.md` 明确冻结：

```text
V1 不定义 RenderEvent→WC
render.event 不进入 Web Presentation ABI
Qualification 包含 RenderEvent not delivered to WC/DOM
```

因此实现本设计不是“只改 private code”，而是一次有真实 consumer 依据的 contract reopen。

建议治理方式：

```text
Web Presentation API v1 reopen
→ 加入 optional RenderEventReceiver structural ABI
→ 加入 transient/no-replay/currentness/ordering/failure semantics
→ 移除 “RenderEvent not delivered to WC/DOM” qualification invariant
→ 重新 qualification
→ re-freeze V1
```

不需要：

```text
Render Update v2
Renderer Data profile v2
Main Control protocol change
Subsystem API version change
```

因为 wire message 与 producer API 已经存在；变化只发生在 Renderer Window-local business presentation ABI。

现有：

```text
doc/15-contracts/web-presentation-render-event-delta.md
```

可以作为 reopen proposal 来源；实现完成后应将最终规则合并进入 normative Web Presentation API，并避免长期维护两份互相覆盖的 normative truth。

---

## 15. 需要修改的代码文件

最小实现面：

```text
packages/renderer/src/internal/presentation-seam.ts
→ add RendererPresentationRenderEvent
→ add RendererPresentationEffect.deliverRenderEvent(...)

packages/renderer/src/control.ts
→ route onRenderEvent through commitRenderEvent(...)
→ Store onEvent first
→ presentation currentness gate
→ synchronous presentationEffect.deliverRenderEvent(...)
→ do NOT notifyPresentation()

packages/renderer/src/internal/web-projector.ts
→ add WebPresentationRenderEvent structural shape
→ add optional receiveRenderEvent receiver invocation
→ exact live identity lookup
→ detached/frozen event callback value
→ missing target/receiver drop
→ callback throw ordinary failure
```

预期不需要修改：

```text
packages/data Render Update wire shape
packages/subsystem RenderDomain.emit public shape
Main Control
Realm State
Host/platform contracts
```

测试辅助 / qualification 文件会按现有 test structure 增加覆盖。

---

## 16. Unit test matrix

至少覆盖：

### Renderer Control

```text
[ ] current + fully baselined + live target Event → deliver exactly once
[ ] stale peer Event → no delivery
[ ] removed DataAuthority → no delivery
[ ] generation mismatch → no delivery
[ ] carrier retired → no delivery
[ ] registry unseen → no delivery
[ ] partial rebaseline → no delivery
[ ] missing domain → no delivery
[ ] missing target → no delivery
[ ] accepted Event does not call reevaluate
[ ] Patch then Event → reevaluate before deliverRenderEvent
[ ] Event observation history remains bounded qualification data only
```

### WebProjector

```text
[ ] exact live identity receives event
[ ] same targetKey in different domain does not receive
[ ] same targetKey in different subsystem does not receive
[ ] old generation element does not receive new generation event
[ ] missing live element silently drops
[ ] missing receiveRenderEvent silently ignores
[ ] callback receives { name, data } only
[ ] callback data is detached / immutable
[ ] callback throw reports failure
[ ] callback throw does not set structuralFailed
[ ] later event still delivered after callback throw
[ ] structurally failed projector drops events
[ ] torn-down projector drops events
[ ] reevaluate after prior event does not replay it
```

### Ordering

```text
[ ] Patch attrs → Event: callback observes new attrs
[ ] Patch data → Event: receiveRenderData(new) happens before receiveRenderEvent
[ ] insert target → Event: newly materialized target receives Event
[ ] remove target → Event: Event drops
[ ] history visible=true Patch → scroll-to-latest Event: visible first, event second
```

---

## 17. Chromium qualification

必须增加真实 Chromium E2E，而不能只靠 fake effect。

最小 qualification custom element：

```ts
class QualificationElement extends HTMLElement {
  log: unknown[] = [];

  receiveRenderData(data: unknown) {
    this.log.push(["data", data, this.getAttribute("state")]);
  }

  receiveRenderEvent(event: unknown) {
    this.log.push(["event", event, this.getAttribute("state")]);
  }
}
```

E2E 至少证明：

```text
[ ] Subsystem RenderDomain.emit reaches exact WC
[ ] event.name/data shape exact
[ ] attrs committed before Event callback
[ ] data callback committed before Event callback
[ ] different targetKey does not receive
[ ] partial rebaseline does not leak event
[ ] reconnect does not replay event
[ ] fresh generation does not deliver stale event
[ ] missing receiver is harmless
[ ] receiver throw remains presentation-local
[ ] WC → Subsystem emitCustomEvent reverse path仍正常
```

最终需要一条真实业务 consumer qualification：

```text
RPG Dialogue keyboard confirm
→ Dialogue RenderDomain.emit("commit")
→ renderer
→ lr-dialogue-conversation.receiveRenderEvent({ name:"commit" })
→ WC local reveal/submit decision
```

Framework qualification 不需要理解 Dialogue semantics，只需用它作为真实 consumer smoke test。

---

## 18. 性能约束

Event hot path 不允许：

```text
full RendererPresentationView rebuild solely for Event
full DOM traversal
querySelector target search
scan Store events history
reconcile all nodes
create Promise per event
setTimeout / microtask queue per event
```

期望复杂度：

```text
Store currentness check
+ Map identity lookup
+ optional callback
```

即接近 O(number of current domains) 的 existing `isPresentationTargetCurrent` baseline eligibility check + O(1) live identity lookup。

如果未来 Event 高频成为性能瓶颈，可单独优化 eligibility/currentness bookkeeping，但不得改变本设计的 observable semantics。

---

## 19. Security / authority invariants

实现后以下边界必须继续成立：

```text
WebComponent
MUST NOT mutate Renderer Store
MUST NOT gain Main authority
MUST NOT gain Subsystem authority
MUST NOT receive privileged identity/capability through event payload envelope
```

WC public callback只得到：

```ts
{
  name,
  data,
}
```

不得向 WC 暴露：

```text
sessionId
subsystemKey
generation
domainId
targetKey
carrier
Renderer Store
Control snapshot
```

这些 identity 只用于 Renderer 内部精确寻址。

`receiveRenderEvent()` 只是 Presentation-local impulse，不是 RPC：

```text
no return result
no ACK
no Store mutation
no automatic reply
```

WC 若需要向业务提交最终交互结果，仍使用既有：

```text
WebPresentationContext.emitCustomEvent(...)
```

---

## 20. Non-goals

本设计不解决：

```text
DOM command protocol
remote querySelector
pixel scroll authority
animation scheduler
business event bus
cross-node event bubbling protocol
WC acknowledgement
request/response RPC
persistent event log
event replay
Renderer Store event authority
Dialogue-specific commit/choice semantics
```

业务可以定义语义 event name，例如：

```text
commit
scroll-down
scroll-to-latest
shake
focus
```

Framework 不理解这些名字。

---

## 21. Implementation acceptance checklist

实现完成前必须全部满足：

```text
[ ] presentation seam 独立 transient method 已加入
[ ] Control Event path 不调用 notifyPresentation
[ ] Store validation/observation 发生在 delivery 之前
[ ] all-domains-baselined currentness gate 生效
[ ] exact Session/subsystem/generation/domain/target identity 生效
[ ] WebProjector 使用 live Map 精确寻址
[ ] missing target drop
[ ] missing receiver ignore
[ ] no buffer/no replay
[ ] Patch/Data → Event synchronous ordering 已测试
[ ] callback throw policy 与 receiveRenderData 对齐
[ ] structural-failed/teardown drop 已测试
[ ] event callback value ownership隔离已测试
[ ] Store events[] 文档改为 qualification/observation history，不是 presentation truth
[ ] Web Presentation API v1 normative reopen 完成
[ ] 原 “RenderEvent not delivered to WC/DOM” qualification 更新
[ ] Chromium E2E 通过
[ ] RPG Dialogue real-consumer smoke path 通过
```

完成以上事项后，该链路可以视为：

```text
Render Update v1 Event wire
= existing / frozen

Web Presentation RenderEvent delivery
= implemented / qualified / re-frozen
```

---

## 22. 最终架构形态

最终 Web Presentation 双向闭环：

```text
                    retained
Subsystem ───────────────────────────────▶ WebComponent
          RenderDomain.replace/update
          snapshot/patch
          Store
          reevaluate
          attrs + receiveRenderData

                    transient
Subsystem ───────────────────────────────▶ WebComponent
          RenderDomain.emit
          render.event
          currentness gate
          exact live identity
          receiveRenderEvent

                    submission
Subsystem ◀─────────────────────────────── WebComponent
          User Input reserved channel
          emitCustomEvent
```

三条路径分别负责：

```text
retained facts
transient presentation impulse
business interaction submission
```

任何一条都不应承担另外两条的 authority。