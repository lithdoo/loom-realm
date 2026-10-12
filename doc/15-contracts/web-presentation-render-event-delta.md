# Web Presentation Render Event Delivery Delta

> 状态：**DRAFT / REOPEN PROPOSAL / NOT IMPLEMENTED / NOT QUALIFIED**  
> 层级：Renderer Window-local business presentation ABI delta  
> 作用对象：[Web Presentation API v1](./web-presentation-api-v1.md)  
> 复用协议：[Render Update v1](./render-update-v1.md)  
> 动机 consumer：`game-libs/rpg-dialogue`

本文提出将现有 `render.event` 从 Renderer 继续投递到对应 RenderNode materialized business WebComponent。

本 delta **不新增 Render Update message kind，不新增 ACK / Result / replay / RPC，也不建立第二份 presentation state**。Subsystem 侧已经通过 `RenderDomain.emit({ targetKey, name, data })` 产生 `render.event`；本设计只补齐 Web Presentation 最后一段投递能力。

本文使用 `MUST`、`MUST NOT`、`SHOULD`、`MAY` 表达规范强度。

核心原则：

> **Retained Render state 描述“UI 现在是什么”；Render Event 描述“current UI 现在做一下什么”；WebComponent local state 描述“组件自己如何完成这个瞬时表现”。三者不得合并成第二套 authority。**

---

## 1. 目标与边界

当前链路：

```text
Subsystem RenderDomain.emit(...)
        ↓
Render Update v1: render.event
        ↓
Renderer
        ✕
Business WebComponent
```

目标链路：

```text
Subsystem RenderDomain.emit(...)
        ↓
Render Update v1: render.event
        ↓
Renderer / Web Projector
        ↓
current target RenderNode materialized element
        ↓
receiveRenderEvent(...)
```

该能力用于表达**瞬时 presentation impulse**，例如：

```text
scroll-up
scroll-down
scroll-to-latest
reveal
focus
shake
pulse
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

## 2. Structural ABI

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

完整职责分离：

```text
receiveRenderContext(...)
→ Window / environment capability

receiveRenderData(...)
→ retained current RenderNode.data

receiveRenderEvent(...)
→ transient presentation impulse
```

Business element MAY 实现或不实现 `RenderEventReceiver`；不要求 mandatory base class。

### 2.1 Synchronous fire-and-forget receiver

`receiveRenderEvent()` 的 ABI 语义固定为 synchronous fire-and-forget callback：

```text
Renderer invokes callback
→ callback invocation returns or throws
→ protocol considers this delivery attempt complete
```

Renderer：

- MUST NOT 等待 animation、scroll、focus transition 或其他 presentation effect 完成；
- MUST NOT 等待、解释或传播 callback 内部产生的 Promise；
- MUST ignore any accidental runtime return value；
- MUST NOT 从 callback result 推导 ACK / success / retry；
- MUST NOT 自动 retry 同一 event。

Business WebComponent MAY 在 callback 内启动自己的异步 presentation-local 工作，但其完成状态不属于 LoomRealm protocol。

---

## 3. Target identity / currentness

`render.event.targetKey` 只能解析到事件所属 `domainId` 内的 **current live node**。

完整 live presentation identity：

```text
(Session, subsystemKey, generation, domainId, targetKey)
```

只有在事件实际投递时，该 identity 仍 current 且对应 element 仍为该 exact live node 的 materialized element，才可调用 receiver。

Web Projector MUST NOT：

- 跨 Session 投递；
- 跨 DataAuthority generation 投递；
- 跨 `domainId` 仅按 textual key 猜测目标；
- 将旧 element identity 的事件转交给 fresh identity；
- 将已 retired / removed target 的 event 转交给后来重新 materialize 的其他 element；
- 因为 target 暂时不存在而等待未来同名 node。

同 textual `domainId` / `targetKey` 不代表跨 Session / generation 的同一 target。

---

## 4. Delivery semantics

### 4.1 Transient / no replay

`receiveRenderEvent` 保持 Render Update v1 Event 语义：

```text
transient
best-effort presentation impulse
not retained
not replayed
not part of Renderer Store state
```

事件投递后 Web Projector MUST NOT 保存可用于 replay 的 event history。

Same-generation reconnect / fresh baseline 只恢复 Snapshot/Patch retained state，不重放旧 event。

Fresh Session / generation 永远不继承旧 event。

### 4.2 Missing target / missing receiver

当事件到达时，如果 current eligible presentation 中不存在匹配 target：

```text
→ drop
→ do not buffer
→ do not wait for a future node
→ do not replay after later insertion
```

如果 target element 存在但未实现 `RenderEventReceiver`：

```text
→ ignore the event for that element
```

以上两种情况均不是 structural presentation fatal，也不产生 ACK / error wire message。

### 4.3 Event does not mutate Render Store

`receiveRenderEvent()` 不能改变 Renderer Store 的 authoritative replica。

只有：

```text
render.snapshot
render.patch
```

可以改变 retained Render state。

Event 只影响 business WebComponent 自己的 presentation-local state，例如：

```text
scroll position
animation
focus
transient highlight
camera shake
local reveal progress
```

这些 presentation-local 状态不能反向成为 Renderer/Main/Realm State authority。

Event 也不能创建、删除、reparent RenderNode；node topology 仍只来自 committed retained Render state。

---

## 5. Ordering

### 5.1 Retained-state-before-event barrier

事件必须保留 current Render Update carrier 的 ordered observation semantics。

如果 Subsystem 顺序发送：

```text
Patch R→R+1
Event E
```

且两者均被 current Renderer 接受，则 business element 的可观察顺序 MUST 等价于：

```text
1. Renderer Store commit R+1
2. Web Presentation 将该 commit reconcile 到 current live element
3. 若 data changed，完成 receiveRenderData(current full data) delivery attempt
4. receiveRenderEvent(E)
```

这里“reconcile 完成”的契约含义是：

> **target 已经观察到所有 causally preceding retained presentation facts；Web Projector 不得把 E 提前越过仍未完成的同 target retained projection。**

该规则是 presentation barrier，不要求 Browser ACK，也不要求等待 WebComponent 自己启动的异步动画 / microtask / resource read 完成。

典型用例：

```ts
renderDomain.update({
  nodes: [{
    key: "history",
    data: { set: { visible: true } },
  }],
});

renderDomain.emit({
  targetKey: "history",
  name: "scroll-to-latest",
  data: {},
});
```

Business component 必须先观察到 `visible=true` 的 retained state，再收到 `scroll-to-latest`。

### 5.2 Event-to-event FIFO

对同一 current live target：

```text
(Session, subsystemKey, generation, domainId, targetKey)
```

若 current carrier ordered observation 为：

```text
Event A
Event B
```

且 A/B 都仍 eligible，则 receiver observable order MUST 为：

```text
receiveRenderEvent(A)
receiveRenderEvent(B)
```

Renderer MUST NOT 并行调用同一 target 的 event receiver，也 MUST NOT 为优化而重排、coalesce、deduplicate event。

本 delta 不建立 cross-target / cross-domain / cross-subsystem global transaction ordering；只保留既有 carrier observation 所能给出的顺序，并对同一 target 明确 FIFO。

### 5.3 Dropped event does not stall later event

若 Event A 因 stale / missing target / missing receiver 被 drop 或 ignore，后续仍 eligible 的 Event B MAY 继续投递；不存在等待 A ACK 的 head-of-line blocking。

---

## 6. Reentrancy / reverse input boundary

Business WebComponent 在 `receiveRenderEvent()` 内 MAY 调用现有：

```ts
WebPresentationContext.emitCustomEvent(...)
```

但这仍是 **WebComponent → Subsystem 的 User Input path**，不是当前 Render Event callback 的同步返回值。

规范要求：

```text
render event delivery stack
→ business WC callback
→ optional emitCustomEvent(...)
→ existing bounded User Input publication path
→ current render event delivery returns
→ only then may resulting business input be observed/handled by Subsystem execution
```

因此实现 MUST NOT 因 `receiveRenderEvent()` 内的 `emitCustomEvent()` 而同步 re-enter Subsystem business execution。

允许 `emitCustomEvent()` 按既有 Web Presentation API 对参数执行同步 validation / throw；若该异常未被 business callback 捕获，则按本 delta §7 作为 receiver callback throw 处理。

本规则只切断同步 business reentrancy；不引入新的 wire queue、ACK 或 RPC。

---

## 7. Failure semantics

`receiveRenderEvent()` 是 ordinary business presentation callback，直接复用 Web Presentation API v1 的 Ordinary Presentation Failure 分类。

若 callback throw：

```text
→ presentation-local report
→ this event delivery attempt ends
→ no automatic retry
→ no Renderer Store rollback
→ no Main / Subsystem / Realm State authority mutation
→ no automatic Runtime / Frame failure
→ best-effort continuation where possible
```

Receiver callback throw **不是 structural presentation failure**，不得等价为 unknown-tag preflight failure，也不得自动永久冻结整个 Window。

若 callback 自己捕获异常或异步 presentation work 后续失败，该处理完全属于 business WebComponent local concern；protocol 不观察异步 completion。

实现 MAY 记录 diagnostic / telemetry，但不得把 diagnostic 变成新的 event ACK / NACK wire contract。

---

## 8. Explicit non-goals

本能力不是远程 DOM command protocol。

Business contract MAY 定义语义化 presentation impulse：

```text
scroll-down
reveal
focus-selected-choice
shake
commit
```

但架构层 MUST NOT 定义或鼓励：

```text
set-scroll-top-320px
set-css-left
add-class
remove-class
query-selector
append-dom
set-style
```

具体 DOM / Shadow DOM / Canvas / WebGL 实现仍由 business WebComponent 拥有。

本 delta 也不定义：

```text
eventId
sequence number exposed to business
priority
timeout
ack/result
retry
persistent queue
cross-target transaction
remote DOM handle
```

若未来真实 consumer 需要以上能力，必须独立 reopen，不得偷偷扩张 `WebPresentationRenderEvent`。

---

## 9. Bidirectional business presentation seam

加入该 delta 后，business Presentation 形成两个方向：

```text
Subsystem → WebComponent
RenderDomain.emit(...)
→ render.event
→ receiveRenderEvent(...)

WebComponent → Subsystem
WebPresentationContext.emitCustomEvent(...)
→ User Input / business custom event path
```

两个方向不能混为 RPC：

- `receiveRenderEvent` 无 Result / ACK；
- `emitCustomEvent` 不是 `receiveRenderEvent` 的 response；
- `emitCustomEvent` 不允许 WebComponent 直接修改 Render Store；
- authoritative business state 仍留在 Subsystem / Realm State 等既有 owner；
- DOM / WC private state 仍不是 Render/Main authority source。

该 seam 的闭环是：

```text
Subsystem authoritative behavior
→ retained Render state + transient event
→ WebComponent presentation
→ user interaction
→ emitCustomEvent
→ existing Input Gate
→ Subsystem authoritative behavior
```

闭环不要求 presentation event 本身可靠、可重放或可确认。

---

## 10. Contract reopen / adoption rule

当前 `Web Presentation API v1` 明确冻结：

```text
RenderEvent not delivered to WC/DOM
```

并在 Frozen Invariants 中声明 M13 不建立 RenderEvent WC ABI。

因此本 delta **不能以“仅实现代码、不改 contract”的方式落地**。

正式采用时必须在同一 qualification subject 中完成一致性 reopen：

```text
A. Web Presentation API v1
   - Type Surface 纳入 RenderEventReceiver / WebPresentationRenderEvent
   - Receiver Independence / Ordering 纳入 event receiver
   - 删除/替换 “RenderEvent not delivered to WC/DOM” qualification item
   - 删除/替换 “M13 不建立 RenderEvent WC ABI” frozen invariant
   - Ordinary Presentation Failure 明确覆盖 receiveRenderEvent

B. 本 delta
   - 从 proposal 转为 adopted normative delta 或并回主 contract

C. Implementation + qualification
   - code / tests / Chromium evidence 与新 contract 同一 subject 对齐
```

在上述 contract reopen 完成前：

```text
Render Update v1 event wire capability = existing / frozen
WebComponent receiveRenderEvent delivery = proposed / draft
```

不得一边保留旧 Frozen invariant，一边把 WC event delivery 宣称为 Qualified。

---

## 11. Implementation minimum

最小实现只需要：

```text
1. structural RenderEventReceiver detection
2. current/live target lookup
3. retained projection barrier
4. same-target FIFO delivery
5. ordinary presentation failure isolation
6. stale/missing target drop
7. no replay across reconnect/session/generation
8. reverse-input no synchronous business reentrancy
```

建议 projector 内部流程保持机械化：

```text
accept current render.event
→ resolve exact live identity
→ if not eligible: drop
→ ensure all causally preceding retained projection is reconciled
→ if receiver absent: ignore
→ invoke receiveRenderEvent({ name, data }) synchronously
→ return; do not await / retry / ack
```

不应为该能力新增 independent Event Manager / Event Store / retry worker / presentation bus。

---

## 12. Qualification minimum

正式标记 Implemented / Qualified 前至少需要关闭：

```text
[ ] exact RenderEventReceiver / WebPresentationRenderEvent type surface
[ ] exact current/live target lookup rules
[ ] Patch/Data delivery → Event ordering
[ ] same-target Event A → Event B FIFO
[ ] no event coalesce / deduplicate / parallel same-target callback
[ ] missing target drops without buffering
[ ] missing receiver ignores without fatal
[ ] callback throw = ordinary presentation-local failure
[ ] callback throw causes no Store rollback / Runtime / Frame failure
[ ] callback throw does not auto-retry same event
[ ] same-generation reconnect no replay
[ ] fresh Session no stale delivery
[ ] fresh generation no stale delivery
[ ] retired/removed target cannot receive old event
[ ] event cannot mutate Renderer Store
[ ] event cannot create/remove/reparent RenderNode
[ ] receiveRenderEvent inside emitCustomEvent does not synchronously re-enter Subsystem business execution
[ ] invalid emitCustomEvent called inside receiver follows existing synchronous TypeError contract
[ ] Chromium E2E: Subsystem emit → exact business WC callback
[ ] Chromium E2E: retained update → WC reconcile/data → event
[ ] Chromium E2E: WC callback → emitCustomEvent → existing Input Gate → Subsystem
[ ] architecture regression: no ACK / Result / replay / second Store introduced
[ ] Web Presentation API v1 conflicting qualification item/invariant reopened and replaced
```

推荐至少覆盖以下 concrete scenarios：

```text
history.visible=true → scroll-to-latest
choice active change → focus-selected-choice
Event A → Event B exact callback order
target removed before event → drop
same textual key in fresh generation → old event never crosses
receiver throw → later eligible presentation work can continue
receiver emits submit → no synchronous Subsystem reentrancy
```

---

## 13. Frozen design intent after adoption

本 delta 一旦完成 contract reopen + implementation + qualification，设计意图应冻结为：

1. Render Event 是 transient presentation impulse，不是 retained state；
2. receiver 是 synchronous fire-and-forget structural ABI；
3. exact live identity 决定投递资格；
4. stale/missing target event 直接 drop，不 buffer / replay；
5. retained state 必须先 reconcile，再投递 causally following event；
6. 同一 target event FIFO，不并行、不重排、不 coalesce；
7. event 不修改 Store，不创建第二份 authority；
8. callback throw 是 ordinary presentation-local failure；
9. reverse custom event 继续走 existing User Input path，禁止同步 business reentrancy；
10. 不增加 ACK / Result / retry / event history / DOM command protocol。

除 correctness/security contradiction、cross-contract conflict 或 real consumer failure 外，不因 speculative flexibility 扩张该 ABI。
