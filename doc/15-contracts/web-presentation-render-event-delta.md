# Web Presentation Render Event Delivery Delta

> 状态：**DRAFT / REOPEN PROPOSAL / NOT IMPLEMENTED / NOT QUALIFIED**  
> 层级：Renderer Window-local business presentation ABI delta  
> 作用对象：[Web Presentation API v1](./web-presentation-api-v1.md)  
> 复用协议：[Render Update v1](./render-update-v1.md)  
> 动机 consumer：`game-libs/rpg-dialogue`

本文提出将现有 `render.event` 从 Renderer 继续投递到对应 RenderNode materialized business WebComponent。

本 delta **不新增 Render Update message kind**。Subsystem 侧已经通过 `RenderDomain.emit({ targetKey, name, data })` 产生 `render.event`；本设计只补齐 Web Presentation 最后一段投递能力。

---

## 1. 目标

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

它不是 retained Render state，也不是 DOM command protocol。

---

## 2. Proposed structural ABI

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

---

## 3. Target identity

`render.event.targetKey` 只能解析到事件所属 `domainId` 内的 current live node。

完整 live presentation identity 仍为：

```text
(Session, subsystemKey, generation, domainId, targetKey)
```

Web Projector MUST NOT：

- 跨 Session 投递；
- 跨 DataAuthority generation 投递；
- 跨 domainId 仅按 textual key 猜测目标；
- 将旧 element identity 的事件转交给 fresh identity。

---

## 4. Delivery semantics

### 4.1 Transient / no replay

`receiveRenderEvent` 保持 Render Update v1 的 Event 语义：

```text
transient
best-effort presentation impulse
not retained
not replayed
not part of Renderer Store state
```

事件投递后 Web Projector 不保存 event history。

Same-generation reconnect / fresh baseline 只恢复 Snapshot/Patch state，不重放旧 event。

### 4.2 Missing target

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

v0 delta 不把“receiver missing”定义为 structural presentation fatal。

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
```

这些 presentation-local 状态不能反向成为 Render/Main authority。

---

## 5. Ordering with retained state

事件必须保留 current Render Update carrier 的 ordered observation semantics。

如果 Subsystem 顺序发送：

```text
Patch R→R+1
Event E
```

且两者均被 current Renderer 接受，则 business element 的可观察顺序 MUST 等价于：

```text
1. Renderer Store commit R+1
2. Web Presentation 完成该 commit 对 current live element 的 reconcile / receiveRenderData
3. receiveRenderEvent(E)
```

典型用例：

```ts
// 先打开 history
renderDomain.update({
  nodes: [{
    key: "history",
    data: { set: { visible: true } },
  }],
});

// 再要求 presentation 滚到最新记录
renderDomain.emit({
  targetKey: "history",
  name: "scroll-to-latest",
  data: {},
});
```

业务组件必须先观察到 `visible=true` 的 retained state，再收到 `scroll-to-latest`。

本 delta 不要求 Browser ACK，也不增加 Subsystem↔Renderer RPC。

---

## 6. Failure semantics

`receiveRenderEvent()` 是 business presentation callback。

需要在实现阶段与现有 Web Presentation callback failure policy 对齐并冻结：

- callback throw 是否冻结当前 Window presentation；
- 是否与 `receiveRenderData()` callback throw 使用同一分类；
- fatal 后后续 event 是否停止投递。

在这些语义正式冻结前，本 delta 保持 DRAFT，不得标记 Qualified。

---

## 7. Explicit non-goals

本能力不是远程 DOM command protocol。

业务 contract MAY 定义：

```text
scroll-down
reveal
focus-selected-choice
shake
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

---

## 8. Bidirectional business presentation seam

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
- `emitCustomEvent` 不允许 WebComponent 直接修改 Render Store；
- authoritative business state 仍留在 Subsystem / Realm State 等既有 owner。

---

## 9. Reopen / implementation checklist

正式合入 Web Presentation contract 前至少需要关闭：

```text
[ ] RenderEventReceiver exact type surface
[ ] current/live target lookup rules
[ ] Patch/Data delivery → Event ordering tests
[ ] missing target / missing receiver behavior
[ ] callback throw failure semantics
[ ] same-generation reconnect no replay
[ ] fresh Session/generation no stale delivery
[ ] Chromium E2E：Subsystem emit → exact business WC callback
[ ] architecture regression：Event does not mutate Renderer Store
```

这些关闭之前：

```text
Render Update v1 event wire capability = existing / frozen
WebComponent receiveRenderEvent delivery = proposed / draft
```
