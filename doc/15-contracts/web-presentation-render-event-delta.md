# Web Presentation Render Event Delivery Delta

> 状态：**Active / Normative / Design Frozen**  
> 实现：**NOT IMPLEMENTED**  
> 资格：**NOT QUALIFIED**  
> 层级：Renderer Window-local business presentation ABI delta  
> 作用对象：[Web Presentation API v1](./web-presentation-api-v1.md)  
> 复用协议：[Render Update v1](./render-update-v1.md)  
> 动机 consumer：`game-libs/rpg-dialogue`  
> Design Freeze：2026-10-12

本文冻结现有 `render.event` 从 Renderer 继续投递到对应 RenderNode materialized business WebComponent 的最后一跳。

本 delta **不新增 Render Update message kind，不新增 ACK / Result / replay / RPC，不建立第二份 presentation state，也不改变 Render Update v1 wire**。Subsystem 已通过 `RenderDomain.emit({ targetKey, name, data })` 产生 `render.event`；本设计只冻结 Renderer → Web Presentation 的 delivery seam 与执行语义。

本文使用 `MUST`、`MUST NOT`、`SHOULD`、`MAY` 表达规范强度。

核心原则：

> **Retained Render state 描述“UI 现在是什么”；Render Event 描述“current UI 现在做一下什么”；WebComponent local state 描述“组件自己如何完成这个瞬时表现”。Event 可以被投递，但不得变成 Store、RPC、replay log 或 DOM command protocol。**

---

## 1. Scope / Unique Flow

唯一合法逻辑链路：

```text
Subsystem RenderDomain.emit(...)
        ↓
Render Update v1: render.event
        ↓
current Renderer Data handler
        ↓
Render Store applicability gate only
        ↓
current Web Presentation effect
        ↓
exact current live RenderNode element
        ↓
receiveRenderEvent(...)
```

该能力适合表达瞬时 presentation impulse，例如：

```text
scroll-up
scroll-down
scroll-to-latest
reveal
focus-selected-choice
shake
pulse
commit
```

它不是：

```text
retained Render state
DOM command protocol
Subsystem↔Renderer RPC
reliable message queue
replay log
business mutation channel
```

---

## 2. Business WebComponent ABI

在现有 `RenderContextReceiver` / `RenderDataReceiver` 之外增加：

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

职责固定分离：

```text
receiveRenderContext(...)
→ Window / environment capability

receiveRenderData(...)
→ retained current RenderNode.data

receiveRenderEvent(...)
→ transient presentation impulse
```

Business element MAY 实现或不实现 `RenderEventReceiver`；不要求 mandatory base class。

### 2.1 Synchronous fire-and-forget

`receiveRenderEvent()` 固定为 synchronous fire-and-forget callback：

```text
Renderer invokes callback
→ callback returns or throws
→ this delivery attempt is complete
```

Renderer：

- MUST NOT 等待 animation、scroll、focus transition 或其他 presentation effect 完成；
- MUST NOT 等待、解释或传播 callback 内部产生的 Promise；
- MUST ignore any accidental runtime return value；
- MUST NOT 从 callback result 推导 ACK / success / retry；
- MUST NOT 自动 retry 同一 event。

Business WebComponent MAY 在 callback 内启动异步 presentation-local 工作，但其完成状态不属于 LoomRealm protocol。

### 2.2 Event value ownership

交给 presentation effect / business receiver 的 Event 必须是 **detached readonly value**：

```text
wire-decoded message
!=
presentation-delivered event object
```

实现 MUST 保证 business 对 event/data 的 mutation 尝试不能修改：

```text
wire-decoded message
Renderer protocol bookkeeping
Renderer Store
future delivery
another consumer
```

实现 MAY deep-clone + deep-freeze，或使用 observable-equivalent ownership mechanics；不得只依赖 TypeScript `readonly` 声明而共享可变 wire object。

---

## 3. Renderer Presentation Forward Seam

当前公开 `RendererPresentationEffect` structural seam 增加一个 **optional** forward capability，以保持已有 effect 实现 source-compatible：

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

规则：

- `reevaluate(...)` 继续只处理 retained projection；
- `deliverRenderEvent(...)` 只处理 transient Render Event；
- effect 未实现 `deliverRenderEvent` 时，该 event 对此 presentation effect 直接 drop；
- Renderer MUST NOT 为此能力把 Event 塞进 `RendererPresentationSource` / retained view；
- Renderer MUST NOT 通过 `reevaluate()` drain event queue；
- Renderer MUST NOT 特判具体 `WebProjector` class identity；只依赖 structural effect capability；
- **任何从 `RendererPresentationEffect.deliverRenderEvent(...)` 逃逸的 throw 都必须被 Renderer 边界捕获并按 ordinary presentation-local failure 隔离；MUST NOT 逃逸出 Renderer Data handler，MUST NOT 因而把 Data Runtime 变成 local-fatal / terminal。**

`WebProjector` 是当前标准 effect，实现 `deliverRenderEvent(...)`。

---

## 4. Delivery Eligibility / Currentness

Render Event 到达 Renderer 后，Web Presentation delivery 只有在以下条件**同时成立**时才 eligible：

```text
1. current Control Session exists
2. owning subsystemKey still exists in current DataAuthority topology
3. generation matches current authority
4. current matching Data carrier is still installed
5. Render Update v1 says Domain/target is applicable on this carrier
6. owning subsystem is Web-Presentation-eligible
   = registrySeen + every current Domain baselined
7. current presentation effect is still attached
8. effect/Projector is not ended or structurally failed
9. exact live identity still maps to the exact materialized element
```

完整 live identity：

```text
(Session, subsystemKey, generation, domainId, targetKey)
```

任一条件不成立：

```text
→ drop
→ no buffer
→ no wait
→ no replay
→ no retarget
```

### 4.1 Partial rebaseline

Render Update v1 的 Domain-local applicability 与 Web Presentation eligibility 必须区分。

例如：

```text
Domain A baselined
Domain B still unbaselined
Event targets A
```

即使 Event 在 Render Update 层对 A 已 logical-applicable，Web Presentation subsystem 仍处于 partial rebaseline，因此：

```text
→ drop for WC delivery
→ MUST NOT buffer until B baseline
→ MUST NOT replay after complete baseline
```

这保持既有规则：partial rebaseline 不得泄漏到 managed presentation。

### 4.2 Detached / ended / failed Window

以下状态均使 forward Event delivery inert：

```text
presentation attachment detached
WebProjector teardown / ended
Window structural presentation failure
expired exact live record
removed/retired target
old Session/generation/carrier
```

即使旧 HTMLElement 仍物理存在，也 MUST NOT 再调用其 `receiveRenderEvent()`。

---

## 5. Ordering

### 5.1 Retained-state-before-event barrier

若 current carrier observation 为：

```text
Patch R→R+1
Event E
```

且 E 最终 eligible，则 business element observable order MUST 等价于：

```text
1. Renderer Store commits R+1
2. Web Presentation reconciles causally preceding retained facts
3. if data changed, receiveRenderData(current full data) delivery attempt completes
4. receiveRenderEvent(E) delivery attempt completes
```

“reconcile 完成”的契约含义是：

> target 已经观察到所有 causally preceding retained presentation facts；Web Projector 不得把 E 提前越过仍未完成的 retained projection。

不要求等待 paint/vsync，也不等待 WC 自己启动的异步动画、microtask 或 resource read。

### 5.2 Event-before-later-Render-message barrier

若 current carrier observation 为：

```text
Event E targets X
Patch P later updates/removes X
```

且 E eligible，则必须观察为：

```text
receiveRenderEvent(E) returns or throws
→ only then may P become observable to Web Presentation
```

因此 eligible forward Event MUST NOT 通过 deferred task / microtask 被推迟到 causally later Render Update 之后。

更一般地：

> **An eligible RenderEvent delivery attempt MUST complete before any causally later Render Update message from the same current carrier becomes observable to Web Presentation.**

该规则与 Render Update v1 `Event → later Patch/remove` barrier 对齐。

### 5.3 Event-to-event FIFO

对同一 exact live target：

```text
Event A
Event B
```

若 A/B 都 eligible，则：

```text
receiveRenderEvent(A)
→ return/throw
→ receiveRenderEvent(B)
```

Renderer MUST NOT 并行调用同一 target receiver，也 MUST NOT reorder / coalesce / deduplicate Event。

不建立 cross-target / cross-domain / cross-subsystem transaction；只保留 current carrier causality 与同-target FIFO。

### 5.4 Drop does not block

若 A 因 stale / partial rebaseline / missing receiver / failed Window 等原因 drop 或 ignore，后续仍 eligible 的 B MAY 继续；不存在 ACK head-of-line blocking。

---

## 6. Renderer Store Rule: Applicability Only, No Event History

`RendererRenderStore` 对 `render.event` 的职责只允许是 **Render Update applicability gate**。

它 MAY 检查：

```text
current carrier
registrySeen
Domain current
Domain baselined
targetKey live
```

但 MUST NOT：

```text
retain Event
store Event history
expose Event through retained presentation facts
replay Event
把 Event 计入 Domain revision
因为 Event 修改 authoritative replica
```

因此当前 repository realization 中的 qualification-only：

```text
RendererRenderStore.events
RenderStoreSnapshot.events
MAX_EVENTS
```

在实现本 delta 时 MUST 删除，不得保留为“方便测试”的第二份 transient log。

Event delivery 的测试证据应观察：

```text
Renderer presentation forward seam
WebProjector callback
business WC receiver
```

而不是观察 Store event history。

---

## 7. WebProjector Delivery

`WebProjector.deliverRenderEvent(...)` 的机械流程固定为：

```text
receive detached readonly RendererPresentationRenderEvent
→ if ended/failed: drop
→ resolve exact live identity
→ if exact current LiveElement missing: drop
→ if element lacks RenderEventReceiver: ignore
→ invoke synchronously:
   receiveRenderEvent({ name, data })
→ return; do not await / retry / ack
```

WebProjector MUST NOT：

- 跨 Session / generation / domain 只按 textual key 猜 target；
- 将 retired identity 的 Event 给后来同名 fresh element；
- 因 target 暂时不存在而等待 future node；
- 保存 Event 供 reconnect / rematerialization replay；
- 允许 Event 创建、删除、reparent RenderNode；
- 从 WC local state reverse-sync Renderer Store。

---

## 8. Reverse Input / No Synchronous Business Reentrancy

Business WebComponent 在 `receiveRenderEvent()` 内 MAY 调用现有：

```ts
WebPresentationContext.emitCustomEvent(...)
```

但该调用仍属于 **WebComponent → Subsystem User Input path**，不是当前 Render Event 的 response。

规范要求：

```text
forward render-event delivery begins
→ WC receiveRenderEvent(...)
→ optional emitCustomEvent(...)
   → currentness + argument validation MAY occur synchronously
   → valid reverse input is staged locally
→ WC callback returns OR throws
→ forward delivery stack ends
→ only then may staged reverse input enter normal bounded InputGate publication
→ only then may Subsystem business execution observe it
```

因此：

- MUST NOT 因 `emitCustomEvent()` 同步 re-enter Subsystem business execution；
- invalid `emitCustomEvent()` 仍按既有 API 同步 throw `TypeError`；
- 若一个 valid reverse input 已成功 staged，随后 receiver callback 又 throw，该 staged input **MUST NOT rollback**，应在 forward stack 结束后按正常 InputGate 规则继续；
- **同一次 `receiveRenderEvent()` callback 内成功 staged 的多个 reverse inputs MUST 保持 `emitCustomEvent()` 调用顺序进入 InputGate；MUST NOT reorder / coalesce / deduplicate。**
- staging 是 Window-local execution mechanics，不创建新 wire queue / ACK / RPC；
- 实现 MAY 使用 microtask/task 作为 reverse publication mechanics，但这不是 public ABI；forward Render Event 本身不得因此延迟越过 later Render Update。

例如：

```text
emitCustomEvent("a")
emitCustomEvent("b")
callback returns

→ InputGate observes a
→ then b
```

---

## 9. Failure Semantics

`receiveRenderEvent()` 及承载它的 `RendererPresentationEffect.deliverRenderEvent(...)` 都属于 ordinary business presentation execution boundary。

若 WC callback throw，或任意 exception 从 `deliverRenderEvent(...)` 逃逸：

```text
→ Renderer catches at presentation boundary
→ presentation-local report
→ this Event delivery attempt ends
→ no automatic retry
→ no Renderer Store rollback
→ no Main / Subsystem / Realm State authority mutation
→ no automatic Runtime / Frame failure
→ no Data Runtime local-fatal / terminal solely because of presentation throw
→ previously staged valid reverse input is not rolled back
→ best-effort continuation where possible
```

Receiver/effect throw **不是 structural presentation failure**，不得等价为 unknown-tag preflight failure，也不得自动永久冻结整个 Window。

若 callback 自己启动的异步 presentation work 后续失败，属于 business WebComponent local concern；protocol 不观察异步 completion。

实现 MAY 记录 diagnostic / telemetry，但不得把 diagnostic 变成 ACK / NACK wire contract。

---

## 10. Explicit Non-goals

Business contract MAY 定义语义化 impulse：

```text
scroll-down
reveal
focus-selected-choice
shake
commit
```

架构层 MUST NOT 定义或鼓励：

```text
set-scroll-top-320px
set-css-left
add-class
remove-class
query-selector
append-dom
set-style
```

本 delta 也不定义：

```text
eventId
business-visible sequence number
priority
timeout
ack/result
retry
persistent queue
cross-target transaction
remote DOM handle
```

未来若真实 consumer 需要以上能力，必须独立 reopen；不得偷偷扩张 `WebPresentationRenderEvent`。

---

## 11. Bidirectional Business Presentation Seam

冻结后的两个方向：

```text
Subsystem → WebComponent
RenderDomain.emit(...)
→ render.event
→ RendererPresentationEffect.deliverRenderEvent(...)
→ WebProjector
→ receiveRenderEvent(...)

WebComponent → Subsystem
WebPresentationContext.emitCustomEvent(...)
→ existing bounded InputGate
→ User Input wire
→ Subsystem
```

两边都不是 RPC：

- `receiveRenderEvent` 无 Result / ACK；
- `emitCustomEvent` 不是 `receiveRenderEvent` response；
- WC 不直接修改 Render Store；
- authoritative business state 仍属于 Subsystem / Realm State 等既有 owner；
- DOM / WC private state 不是 Render/Main authority source。

---

## 12. Repository Implementation Mapping

当前 repository realization 的唯一实现方向冻结为：

```text
packages/renderer/src/internal/presentation-seam.ts
→ add RendererPresentationRenderEvent
→ add optional RendererPresentationEffect.deliverRenderEvent(...)

packages/renderer/src/internal/render-store.ts
→ onEvent remains applicability gate
→ remove retained events[] / MAX_EVENTS / snapshot events evidence

packages/renderer/src/control.ts
→ onRenderEvent preserves current-carrier ordering
→ run Store applicability/currentness gate
→ require full Web Presentation subsystem eligibility
→ build detached readonly forward event
→ call current effect.deliverRenderEvent synchronously when implemented
→ catch effect delivery throw at presentation boundary; never leak into Data handler
→ stage reverse custom input while forward callback stack is active
→ flush staged reverse inputs FIFO after forward stack ends

packages/renderer/src/internal/web-projector.ts
→ implement deliverRenderEvent(...)
→ exact live identity lookup
→ failed/ended/stale/missing receiver rules
→ synchronous receiveRenderEvent({name,data})

packages/renderer/src/web-presentation.ts
→ export the frozen seam/type surface required by the public subpath
```

不得替换为：

```text
Event Store
Event replay queue
RendererPresentationSource.events
reevaluate() event draining
WebProjector class special-case in ControlHolder
new Render Update message/profile/version
```

---

## 13. Qualification Minimum

标记 Implemented / Qualified 前至少关闭：

```text
[ ] exact RenderEventReceiver / WebPresentationRenderEvent type surface
[ ] exact RendererPresentationRenderEvent forward seam
[ ] existing effect without deliverRenderEvent remains compatible and drops Event
[ ] throw escaping deliverRenderEvent is presentation-local and never Data local-fatal/terminal
[ ] Renderer Store retains no Event/history and exposes no Event retained facts
[ ] exact Session/subsystem/generation/domain/target currentness
[ ] partial rebaseline Event drops and never replays
[ ] detached/ended/structurally-failed Projector Event drops
[ ] retired/removed target cannot receive old Event
[ ] Patch/Data delivery → Event ordering
[ ] Event → later Patch/update/remove ordering
[ ] same-target Event A → Event B FIFO
[ ] no Event coalesce / deduplicate / parallel same-target callback
[ ] missing target drops without buffering
[ ] missing receiver ignores without fatal
[ ] delivered event/data is detached readonly ownership
[ ] callback throw = ordinary presentation-local failure
[ ] callback throw causes no Store rollback / Runtime / Frame failure
[ ] callback throw does not auto-retry same Event
[ ] same-generation reconnect no replay
[ ] fresh Session/generation no stale delivery
[ ] Event cannot mutate Renderer Store
[ ] Event cannot create/remove/reparent RenderNode
[ ] receiveRenderEvent→emitCustomEvent does not synchronously re-enter Subsystem
[ ] multiple staged reverse inputs preserve emitCustomEvent FIFO; no reorder/coalesce/deduplicate
[ ] valid reverse input staged before later callback throw is not rolled back
[ ] invalid emitCustomEvent inside receiver keeps synchronous TypeError contract
[ ] Chromium E2E: Subsystem emit → exact business WC callback
[ ] Chromium E2E: retained update → WC reconcile/data → Event
[ ] Chromium E2E: Event → later target removal preserves callback-before-removal
[ ] Chromium E2E: WC callback → emitCustomEvent → InputGate → Subsystem
[ ] Chromium E2E: WC callback stages reverse A then B → Subsystem observes A then B
[ ] architecture regression: no ACK / Result / replay / second Store introduced
```

推荐 concrete scenarios：

```text
history.visible=true → scroll-to-latest
choice active change → focus-selected-choice
Event A → Event B exact callback order
Event E → later remove target → E callback completes first
Domain A baseline + Domain B unbaselined → Event A dropped permanently
same textual key in fresh generation → old Event never crosses
structurally failed Window → old element receives no Event
custom presentation effect throws → Data carrier remains current; later presentation work may continue
receiver throw → later eligible presentation work can continue
receiver stages submit then throws → submit is not rolled back; no sync reentrancy
receiver stages reverse A then B → A reaches InputGate before B
```

---

## 14. Adoption / Qualification Subject

本次 design freeze 正式 reopen 并替换 `Web Presentation API v1` 旧的：

```text
RenderEvent not delivered to WC/DOM
M13 does not establish RenderEvent WC ABI
```

旧 M13 Implemented / Qualified evidence 仍是其历史 qualification subject 的有效证据，但 **不能自动迁移为本 delta 的 PASS**。

当前状态固定为：

```text
Render Update v1 Event wire capability
= Frozen / Implemented / Qualified under its own subjects

Web Presentation Render Event Delivery design
= Design Frozen
= NOT IMPLEMENTED
= NOT QUALIFIED
```

只有 code + tests + real Chromium evidence 与本 frozen contract 对齐后，才能分别提升为 Implemented / Qualified。

---

## 15. Frozen Invariants

除 correctness/security contradiction、cross-contract conflict 或 real consumer failure 外，下列设计不得因 speculative flexibility reopen：

1. Render Event 是 transient presentation impulse，不是 retained state；
2. business receiver 是 synchronous fire-and-forget structural ABI；
3. Renderer Presentation 使用 optional `deliverRenderEvent(...)` forward seam，不把 Event 混入 retained source；
4. `deliverRenderEvent(...)` 逃逸异常必须被 Renderer presentation boundary 隔离，不得导致 Data Runtime local-fatal / terminal；
5. exact live identity 决定投递资格；
6. Web Presentation partial rebaseline 时 Event 直接 drop，不 buffer / replay；
7. detached/ended/structurally-failed presentation 不再接收 Event；
8. retained state 必须先 reconcile，再投递 causally following Event；
9. eligible Event delivery 必须完成后，later Render Update 才能对 Web Presentation 可观察；
10. 同一 target Event FIFO，不并行、不重排、不 coalesce；
11. Renderer Store 不保留 Event history，不创建第二份 authority；
12. delivered event/data 必须与 wire object 隔离为 readonly ownership；
13. callback throw 是 ordinary presentation-local failure；
14. reverse custom event 继续走 existing Input path，禁止同步 business reentrancy；
15. 同一 forward callback 内 staged reverse inputs 保持 `emitCustomEvent()` FIFO，不重排、不 coalesce、不 deduplicate；
16. 已成功 staged 的 reverse input 不因随后 receiver throw rollback；
17. 不增加 ACK / Result / retry / event history / DOM command protocol。
