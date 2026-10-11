# RPG Dialogue v0 Presentation Events

> 状态：**DRAFT / PREIMPLEMENTATION**  
> 层级：`game-libs/rpg-dialogue` 业务层 Presentation Event / Interaction ABI  
> 依赖：[`RPG_DIALOGUE_V0_PRESENTATION.md`](./RPG_DIALOGUE_V0_PRESENTATION.md)  
> 架构依赖：[`Web Presentation Render Event Delivery Delta`](../../doc/15-contracts/web-presentation-render-event-delta.md)

本文定义 RPG Dialogue 在 Subsystem 与业务 WebComponent 之间的双向交互协议。

基本分工：

```text
RenderNode.data
→ retained presentation facts

Subsystem → WC
RenderDomain.emit(...)
→ receiveRenderEvent(...)
→ transient presentation operation

WC → Subsystem
WebPresentationContext.emitCustomEvent(...)
→ WEB_PRESENTATION_EVENT_CHANNEL_V1
→ business submission intent/result
```

---

## 1. Conversation 的 local interaction ownership

`lr-dialogue-conversation` WebComponent 允许拥有以下 Presentation-local state：

```text
typewriter / reveal progress
selectedOptionId: null | string
conversation scroll position
local focus / animation state
```

这些状态不进入 Renderer Store，也不持续同步回 Subsystem。

当 `conversationId` 改变时，Conversation WC MUST 重置上一 Conversation unit 的 local interaction state：

```text
reveal progress → fresh
selectedOptionId → null
scroll position → reset according to presentation policy
```

其中：

> **存在 options 时，不默认选择任何 option。**

---

## 2. Conversation：Subsystem → WebComponent

当前 canonical Conversation Presentation Events：

```text
scroll-up
scroll-down
option-above
option-next
commit
```

事件全部 target 当前 `conversation` RenderNode：

```ts
renderDomain.emit({
  targetKey: "conversation",
  name: "scroll-down",
  data: {},
});
```

Event name 属于 `rpg-dialogue` 业务 Presentation ABI，不属于 LoomRealm Core vocabulary。

---

## 3. `scroll-up` / `scroll-down`

`scroll-up` / `scroll-down` 表达的是 Conversation 的**方向性阅读导航**，而不是具体 DOM `scrollTop` 命令。

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

Conversation WC 自己决定：

```text
每次滚动距离
smooth / paged / line-based scrolling
scrollbar
wheel / touch inertia
内容滚动与 option selection 的协调方式
```

### 3.1 与 option selection 的联合优化

当当前 Conversation 存在 options 时，WC MAY 将 `scroll-up / scroll-down` 同时用于优化 option 的上下切换。

例如第三方 Presentation 可以采用：

```text
长文本尚未进入选项区域
→ scroll-down 主要滚动正文

已经浏览到 options 区域
→ scroll-down 同时推进当前 option selection
→ 自动保证新 selection 可见
```

具体策略属于 Presentation-local behavior。

Subsystem 不需要知道：

```text
当前 pixel scrollTop
当前 viewport 中看到了哪一行
本次 scroll 是否顺带改变了 selection
```

---

## 4. `option-above` / `option-next`

除了方向性阅读导航之外，v0 单独提供两个明确的 option selection event：

```text
option-above
option-next
```

它们只要求 Conversation WC 改变当前 option selection，不要求同时滚动正文。

```ts
renderDomain.emit({
  targetKey: "conversation",
  name: "option-above",
  data: {},
});

renderDomain.emit({
  targetKey: "conversation",
  name: "option-next",
  data: {},
});
```

WC 应根据当前可用 option 顺序选择前一个 / 后一个 enabled option，并可为保证可见性进行 Presentation-local scroll 调整。

如果当前尚无 selection：

```text
option-next
→ 可选择第一个可用 option

option-above
→ 可选择最后一个可用 option
```

具体 wrap-around 行为是否允许仍保持 DRAFT，不由 Core 决定。

selection 发生变化后仍然**不向 Subsystem 发事件**；它只是 WC local interaction state。

---

## 5. `commit`

`commit` 是 Conversation 的确认操作。

```ts
renderDomain.emit({
  targetKey: "conversation",
  name: "commit",
  data: {},
});
```

Subsystem 不直接判断“本次确认是 reveal 还是 submit”，因为 typewriter / reveal progress 属于 WC local state。

Conversation WC 收到 `commit` 后按以下状态机处理。

### 5.1 文本尚未完整显示

```text
commit
  ↓
text reveal incomplete
  ↓
立即完整显示当前 text
  ↓
不 submit
```

第一次确认只结束 typewriter / reveal，不产生业务提交。

### 5.2 文本已完整显示，且没有 options

```text
commit
  ↓
text complete
  ↓
no options
  ↓
emitCustomEvent("submit")
```

即：

```ts
context.emitCustomEvent("submit");
```

Renderer 最终向 Subsystem 交付：

```text
name = submit
data = {}
```

表示玩家完成了当前无选项 Conversation unit。

### 5.3 文本已完整显示，有 options，但尚未选择

```text
commit
  ↓
text complete
  ↓
options exist
  ↓
selectedOptionId === null
  ↓
no submit
```

v0 不允许：

```text
commit
→ 自动选择第一项
→ submit
```

用户必须先通过 `scroll-up / scroll-down`、`option-above / option-next`，或未来明确允许的 pointer/touch selection 行为形成实际 selection。

### 5.4 文本已完整显示，有 options，且已有 selection

例如：

```text
selectedOptionId = "accept"
```

收到 `commit` 后：

```ts
context.emitCustomEvent("submit", {
  optionId: "accept",
});
```

WC → Subsystem 的业务结果：

```text
name = submit
data = { optionId: string }
```

---

## 6. `submit`：WebComponent → Subsystem

Conversation v0 当前只定义一个 canonical reverse custom event：

```text
submit
```

合法 payload 有两种语义：

```text
无 options：
{}

有 options：
{ optionId: string }
```

Subsystem 收到 `submit` 后仍是业务 authority，必须重新验证当前 authoritative Conversation：

```text
当前 conversation 是否仍然允许提交
当前是否存在 options
如果存在 options，optionId 是否存在
option 是否 enabled
当前 Render target / Session / generation 是否仍然 current
```

WC 拥有 local selection，但不拥有最终业务合法性。

---

## 7. Keyboard / Gamepad 与 `commit`

物理输入仍先由 Dialogue Subsystem 的 Input Handler 接收并归一化。

例如：

```text
Enter / Gamepad A
→ Dialogue confirm action
→ render.event target=conversation name=commit
```

这样 reveal 状态无需同步到 Subsystem：

```text
Subsystem
  ↓ commit
Conversation WC
  ├─ text incomplete → reveal only
  └─ text complete   → maybe submit
```

Subsystem 不通过猜测或 retained field 判断 typewriter 是否完成。

---

## 8. Pointer / Touch

Pointer / Touch 可以直接操作 Conversation WC 的 Presentation-local state，例如：

```text
scrolling
option focus / selection
local hover / pressed visual state
```

这些行为默认不需要不断回传 Subsystem。

v0 尚未冻结：

```text
点击 option 是“只选择”还是“选择并等价于 commit”
触摸当前 option 是否立即提交
pointer selection 是否改变 keyboard/gamepad current selection
```

无论未来采用哪种规则，**最终业务提交仍统一为 `submit` custom event**。

---

## 9. History：retained visibility + 三个瞬时事件

`lr-dialogue-history` 的进入 / 退出不使用 Event。

History 是否显示直接由 retained state 控制：

```ts
interface DialogueHistoryRenderDataV0 {
  readonly visible: boolean;
}
```

```text
进入 History
→ RenderNode.data.visible = true

退出 History
→ RenderNode.data.visible = false
```

因此不存在 canonical：

```text
open-history event
close-history event
```

History 的瞬时 Presentation Events 只有：

```text
scroll-up
scroll-down
scroll-to-latest
```

示例：

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

renderDomain.emit({
  targetKey: "history",
  name: "scroll-to-latest",
  data: {},
});
```

打开 History 并默认定位最新记录：

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

依赖架构层 ordering contract：WC 必须先观察 `visible=true`，再收到 `scroll-to-latest`。

History 的实际 `scrollTop`、viewport、scrollbar、virtualization 等属于 Presentation-local state。

History v0 不定义 WC → Subsystem custom event。

---

## 10. Canonical v0 Event Vocabulary

### Subsystem → Conversation WC

```text
scroll-up
scroll-down
option-above
option-next
commit
```

### Conversation WC → Subsystem

```text
submit
  {}
  or
  { optionId: string }
```

### Subsystem → History WC

```text
scroll-up
scroll-down
scroll-to-latest
```

### History WC → Subsystem

```text
none in v0
```

---

## 11. State 与 Event 的最终边界

Retained state：

```text
conversationId
speaker
full text
options
option enabled state
history.visible
history entries
characters
control hints
```

Conversation WC local state：

```text
reveal/typewriter progress
selectedOptionId
scroll position
```

Transient Presentation Event：

```text
scroll-up
scroll-down
option-above
option-next
commit
scroll-to-latest
```

Business submission：

```text
submit
```

不得用不断变化的 `commandId` 塞进 RenderNode `data` 模拟一次性 event，也不得为了同步 Presentation-local state 持续发送 `selectedOptionId`、`scrollTop` 或 typewriter progress。

---

## 12. Explicit non-goals

Dialogue Event ABI 不是 DOM command protocol。

允许业务语义动作：

```text
scroll-down
option-next
commit
scroll-to-latest
```

不定义：

```text
set-scroll-top-320px
set-style
add-class
query-selector
append-dom
```

具体 DOM / Shadow DOM / Canvas / WebGL 行为属于 default / third-party WebComponent。

---

## 13. Current design consequence

当前推荐模型：

```text
Subsystem retained facts
→ RenderNode.data

Subsystem transient operation
→ RenderDomain.emit(...)
→ receiveRenderEvent(...)

Conversation WC local interaction
→ reveal / option selection / scroll

真正业务提交
→ emitCustomEvent("submit", ...)
→ WEB_PRESENTATION_EVENT_CHANNEL_V1
→ Dialogue Subsystem
```

这使 Dialogue 不需要把 typewriter、当前 option selection 或滚动位置提升为 Subsystem authority，同时仍保持最终提交和 option 合法性的业务 authority 在 Subsystem。