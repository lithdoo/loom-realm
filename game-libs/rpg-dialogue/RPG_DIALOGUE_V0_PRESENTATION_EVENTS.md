# RPG Dialogue v0 Presentation Events

> 状态：**DRAFT / PREIMPLEMENTATION**  
> 层级：`game-libs/rpg-dialogue` 业务层 Presentation Event ABI  
> 依赖：[`RPG_DIALOGUE_V0_PRESENTATION.md`](./RPG_DIALOGUE_V0_PRESENTATION.md)  
> 架构依赖：[`Web Presentation Render Event Delivery Delta`](../../doc/15-contracts/web-presentation-render-event-delta.md)

本文定义 RPG Dialogue 如何使用 proposed `RenderEventReceiver.receiveRenderEvent()` 接收 Subsystem 产生的瞬时 Presentation Event。

Dialogue 的 retained state 继续通过 RenderNode `data` 表达；滚动、立即 reveal 等一次性动作通过 Render Event 表达。

---

## 1. State 与 Event 分工

```text
RenderNode.data
→ 当前是什么
→ retained state

receiveRenderEvent(...)
→ 现在做一下什么
→ transient presentation impulse
```

Dialogue 示例：

```text
selectedChoiceId / history visible / current text
→ state

scroll-up / scroll-down / scroll-to-latest
→ event
```

不得用不断变化的 `commandId` 塞进 `RenderNode.data` 来模拟一次性事件。

---

## 2. Conversation scrolling

`lr-dialogue-conversation` 是一个业务语义上的可滚动 presentation surface。

Subsystem 在当前 Dialogue interaction state 判定本次输入应解释为会话滚动后，向 `conversation` node 发送事件：

```ts
renderDomain.emit({
  targetKey: "conversation",
  name: "scroll-up",
  data: {},
});

renderDomain.emit({
  targetKey: "conversation",
  name: "scroll-down",
  data: {},
});
```

对应 WebComponent：

```ts
interface RenderEventReceiver {
  receiveRenderEvent(
    event: DeepReadonly<WebPresentationRenderEvent>,
  ): void;
}
```

`lr-dialogue-conversation` 的 concrete implementation 自己决定：

```text
每次滚多少
是否 smooth scroll
是否分页滚动
是否基于 line / viewport proportion
是否显示 scrollbar
触摸 / wheel 的惯性
```

这些都不进入 Dialogue business ABI。

---

## 3. History scrolling

`lr-dialogue-history` 是独立的可滚动 modal surface。

当 History 已经处于 `visible=true` 时：

```ts
renderDomain.emit({
  targetKey: "history",
  name: "scroll-up",
  data: {},
});

renderDomain.emit({
  targetKey: "history",
  name: "scroll-down",
  data: {},
});
```

打开 History 后需要默认展示最新记录时，使用：

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

依赖架构层 ordering contract：WebComponent 必须先观察到 `visible=true`，再收到 `scroll-to-latest`。

History 的实际 `scrollTop`、scrollbar、viewport height、virtualization 与当前 pixel offset 都属于 Presentation-local state。

---

## 4. Input interpretation ownership

原始 Keyboard / Gamepad 输入仍由 Dialogue Handler 按当前 interaction state 解释。

```text
READING
↑ / ↓
→ conversation scroll-up / scroll-down event

CHOOSING
↑ / ↓
→ change selectedChoiceId retained state
→ 不发送 conversation scroll event

HISTORY_MODAL
↑ / ↓
→ history scroll-up / scroll-down event
```

因此 WebComponent 不负责判断：

```text
ArrowDown 到底代表滚动还是换选项？
```

这个决定属于 Dialogue interaction logic。

WebComponent 只接收已经解释后的 Presentation Event。

---

## 5. Pointer / touch local scrolling

Mouse wheel、touch drag、scrollbar drag 属于 concrete Web presentation 的局部交互时，可以直接修改对应 WebComponent 的 presentation-local scroll state。

正常情况下不需要形成：

```text
DOM scroll
→ emit custom event
→ Subsystem
→ render event
→ DOM scroll
```

这种反馈环。

只有当某个具体游戏规则真的需要知道滚动行为时，才能在业务 contract 中另行增加明确事件；v0 不预建该能力。

---

## 6. Proposed canonical Dialogue presentation events

当前候选 vocabulary：

```text
conversation target
  scroll-up
  scroll-down

history target
  scroll-up
  scroll-down
  scroll-to-latest
```

未来可能增加：

```text
conversation
  reveal

choice / conversation
  focus-selected-choice
```

但未被真实 consumer 需要前不冻结。

Event name 属于 `rpg-dialogue` 业务 Presentation ABI，不属于 LoomRealm Core vocabulary。

---

## 7. Explicit non-goals

Dialogue Event ABI 不允许退化成 DOM 命令：

```text
set-scroll-top-320px
set-style
add-class
query-selector
```

业务事件描述语义动作：

```text
scroll-down
scroll-to-latest
```

具体如何完成由 default / third-party WebComponent 决定。

---

## 8. Current design consequence

加入 `receiveRenderEvent()` 后，Dialogue 不再需要使用以下 workaround：

```ts
data: {
  command: {
    id: 42,
    action: "scroll-down"
  }
}
```

推荐模型固定为：

```text
retained Dialogue facts
→ RenderNode.data

transient Dialogue presentation impulses
→ RenderDomain.emit(...)
→ receiveRenderEvent(...)
```
