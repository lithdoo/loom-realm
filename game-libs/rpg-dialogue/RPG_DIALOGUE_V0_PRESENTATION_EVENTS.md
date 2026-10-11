# RPG Dialogue v0 Presentation Events

> 状态：**DRAFT / PREIMPLEMENTATION**  
> 层级：`game-libs/rpg-dialogue` 业务层 Presentation Event / Interaction ABI  
> 依赖：[`RPG_DIALOGUE_V0_PRESENTATION.md`](./RPG_DIALOGUE_V0_PRESENTATION.md)  
> 架构依赖：[`Web Presentation Render Event Delivery Delta`](../../doc/15-contracts/web-presentation-render-event-delta.md)

本文定义 RPG Dialogue 在 Subsystem 与业务 WebComponent 之间的双向交互协议，并冻结 v0 的 **Node Event Contract**：哪些 canonical RenderNode 可以接收哪些 `render.event`，哪些节点可以通过 `emitCustomEvent(...)` 向 Subsystem 回传业务交互结果。

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

`render.event` 按 `domainId + targetKey` 精确寻址 current live RenderNode，因此 event vocabulary 必须同时规定 **event name + legal target node**；不能只定义全局事件名。

---

## 1. Node Event Contract

v0 canonical node-level contract：

| Canonical node | Retained data role | Subsystem → WC `receiveRenderEvent` | WC → Subsystem `emitCustomEvent` |
| --- | --- | --- | --- |
| `dialogue` | root / version / overall presentation container | none | none |
| `characters` | character collection container | none | none |
| `character.<characterId>` | character identity / display / active / placement / expression / visual | none | none |
| `conversation` | current `conversationId` / speaker; interaction owner | `scroll-up`, `scroll-down`, `option-above`, `option-next`, `commit` | `submit` |
| `text` | current full text | none | none |
| `choices` | choice collection container | none | none |
| `choice.<choiceId>` | `choiceId` / text / enabled | none | none |
| `controls` | control-hint collection container | none | none |
| `control.<action>` | action / label / enabled hint | none | none in v0 |
| `history` | `visible`; history interaction surface | `scroll-up`, `scroll-down`, `scroll-to-latest` | none |
| `history.<entryId>` | transcript entry | none | none |

### 1.1 Targeting rule

`rpg-dialogue` Subsystem MUST only emit an event to a node that declares that event in the table above。

例如：

```ts
renderDomain.emit({
  targetKey: "conversation",
  name: "commit",
  data: {},
});

renderDomain.emit({
  targetKey: "history",
  name: "scroll-to-latest",
  data: {},
});
```

下面这些不是 v0 contract：

```text
target=choice.accept, name=commit
target=text,          name=scroll-down
target=history.line-1,name=scroll-up
```

未知或投错 target 的 event 属于 producer / implementation bug。Presentation implementation MUST NOT 将其重新解释成其他合法事件；可以忽略并进行本地诊断。

### 1.2 Interactive owner 与 data node

v0 明确区分两类节点：

```text
Interactive owner node
  conversation
  history

Presentation data node
  character.*
  text
  choices
  choice.*
  control.*
  history.*
```

不是每个 RenderNode 都必须拥有 event contract。大多数节点只通过 `receiveRenderData(...)` 接收 retained facts。

`conversation` 是当前 Conversation unit 的唯一 interaction owner；`history` 是 History surface 的 interaction owner。

---

## 2. Conversation 与 descendant nodes 的本地协调

Render Tree 仍保持：

```text
lr-dialogue-conversation        key=conversation
├─ lr-dialogue-text             key=text
└─ lr-dialogue-choices          key=choices
   └─ lr-dialogue-choice*       key=choice.<choiceId>
```

虽然 `commit` / `option-next` 等事件只投递给 `conversation`，当前 full text 和 option facts 仍分别位于 descendant `text` / `choice.*` nodes。

因此 v0 冻结以下行为边界：

> **Conversation WebComponent owns interaction；descendant text / choice nodes provide presentation data and participate only through Window-local presentation coordination.**

Conversation implementation MUST 能够在本地 Presentation 内完成：

```text
1. 判断当前 text 是否已经 reveal complete；
2. 请求当前 text 立即完整显示；
3. 按 Render Tree 当前顺序读取 descendant choices；
4. 读取每个 choice 的 choiceId / enabled；
5. 维护 selectedOptionId；
6. 将当前 selection 反映到 descendant choice 的视觉状态；
7. 在需要时保证当前 selection 可见。
```

v0 **不冻结**这些 Window-local coordination 的具体 TypeScript / DOM API。默认或第三方 Presentation MAY 使用：

```text
light-DOM traversal
parent callback
private controller / registry
ordinary local DOM event
shared presentation-local object
```

但这些机制：

- MUST NOT 通过 LoomRealm `emitCustomEvent` 回 Subsystem 来同步 selection / reveal / scroll；
- MUST NOT 形成 `DOM → Subsystem → render.event → DOM` 的反馈环；
- MUST NOT 把 `selectedOptionId`、typewriter progress、pixel scrollTop 提升为 Renderer / Subsystem authority。

例如 pointer 点击 `choice.accept` 可以由 child choice element 在当前 Presentation 内通知其 ancestor `conversation` 改变 local selection；这不是 LoomRealm Web Presentation custom event，也不是 `rpg-dialogue` 对 Subsystem 的业务事件。

---

## 3. Conversation local interaction ownership

`lr-dialogue-conversation` WebComponent 允许拥有：

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

存在 options 时：

> **不默认选择任何 option。**

---

## 4. Conversation inbound events

所有以下 events 的 legal target 均为：

```text
targetKey = "conversation"
```

canonical vocabulary：

```text
scroll-up
scroll-down
option-above
option-next
commit
```

### 4.1 `scroll-up` / `scroll-down`

它们表达 Conversation 的**方向性阅读导航**，而不是 DOM `scrollTop` command。

```ts
renderDomain.emit({
  targetKey: "conversation",
  name: "scroll-down",
  data: {},
});
```

Conversation WC 自己决定每次滚动距离、smooth / paged / line-based scrolling、scrollbar、wheel / touch inertia，以及内容滚动与 option selection 的协调方式。

当存在 options 时，WC MAY 将 `scroll-up / scroll-down` 同时用于 option selection 优化。例如：

```text
长文本尚未进入 options 区域
→ scroll-down 主要滚动正文

已经进入 options 区域
→ scroll-down MAY 推进 local option selection
→ MAY 自动保证 selection 可见
```

Subsystem 不需要知道本次 scroll 是否顺带改变 selection。

### 4.2 `option-above` / `option-next`

这两个 event 明确要求只改变当前 option selection：

```text
option-above
option-next
```

它们不要求正文发生阅读滚动，但 WC MAY 为保证 selection 可见而进行 presentation-local scroll。

如果当前无 selection：

```text
option-next
→ 选择第一个 enabled option

option-above
→ 选择最后一个 enabled option
```

selection 变化后**不向 Subsystem 发事件**。

wrap-around policy 仍为 DRAFT，不由 LoomRealm Core 决定。

### 4.3 `commit`

`commit` 是当前 Conversation unit 的确认操作：

```ts
renderDomain.emit({
  targetKey: "conversation",
  name: "commit",
  data: {},
});
```

Subsystem 不判断本次 confirm 应该 reveal 还是 submit，因为 reveal progress 属于 Conversation Presentation-local state。

#### 文本尚未完整显示

```text
commit
→ text reveal incomplete
→ 立即完整显示当前 text
→ 不 submit
```

#### 文本完整，且没有 options

```text
commit
→ text complete
→ no options
→ emitCustomEvent("submit")
```

#### 文本完整，有 options，但尚无 selection

```text
commit
→ text complete
→ options exist
→ selectedOptionId === null
→ no submit
```

不得自动选择第一项。

#### 文本完整，有 options，且已有 selection

```ts
context.emitCustomEvent("submit", {
  optionId: "accept",
});
```

---

## 5. Conversation outbound event: `submit`

`conversation` 是 v0 唯一可以向 Subsystem 发业务 custom event 的 canonical node。

合法 event：

```text
submit
```

合法 payload：

```text
无 options：
{}

有 options：
{ optionId: string }
```

`submit` 必须由当前 `conversation` element 自己通过其 `WebPresentationContext.emitCustomEvent(...)` 发出；child `choice.<id>` 不直接向 Subsystem 发 `submit`。

Renderer 会自动附加当前 Presentation identity：

```text
Session
subsystemKey
generation
domainId
targetKey = conversation
```

Subsystem 收到 `submit` 后仍是 business authority，必须重新验证：

```text
当前 Conversation 是否仍允许提交
当前是否存在 options
若存在 options，optionId 是否存在
option 是否 enabled
当前 Render target / Session / generation 是否仍 current
```

WC 拥有 local selection，但不拥有最终业务合法性。

---

## 6. Keyboard / Gamepad

物理输入先由 Dialogue Subsystem Input Handler 接收并解释，再产生针对 interaction owner node 的 Presentation Event。

例如：

```text
Enter / Gamepad A
→ Dialogue confirm action
→ render.event target=conversation name=commit
```

```text
D-Pad Down
→ Dialogue option navigation action
→ render.event target=conversation name=option-next
```

这样 typewriter 与 option-selection local state 无需同步到 Subsystem。

---

## 7. Pointer / Touch

Pointer / Touch MAY 直接操作 Conversation Presentation-local state，例如：

```text
scrolling
option focus / selection
local hover / pressed visual state
```

这些行为默认不回传 Subsystem。

例如点击 `choice.accept` 可以在当前 Browser Presentation 内将 ancestor Conversation 的：

```text
selectedOptionId = "accept"
```

但不因此自动形成 LoomRealm custom event。

v0 尚未冻结：

```text
点击 option 是只选择，还是选择后等价于 commit
触摸已选 option 是否立即 commit
pointer selection 是否影响 keyboard/gamepad current selection
```

无论未来采用何种 pointer policy，最终业务提交仍统一由 `conversation` 发出：

```text
submit {}
submit { optionId }
```

---

## 8. History Node Event Contract

History 是否显示是 retained state：

```ts
interface DialogueHistoryRenderDataV0 {
  readonly visible: boolean;
}
```

```text
进入 History
→ history.data.visible = true

退出 History
→ history.data.visible = false
```

因此不存在 canonical `open-history` / `close-history` transient event。

所有 History transient events 的 legal target 均为：

```text
targetKey = "history"
```

仅有：

```text
scroll-up
scroll-down
scroll-to-latest
```

例如：

```ts
renderDomain.emit({
  targetKey: "history",
  name: "scroll-to-latest",
  data: {},
});
```

打开 History 并定位最新记录时：

```text
1. update history.data.visible = true
2. emit target=history, name=scroll-to-latest
```

依赖架构层 ordering contract：WC 必须先观察到 `visible=true`，再收到 `scroll-to-latest`。

History 的实际 scrollTop、viewport、scrollbar、virtualization 属于 Presentation-local state。

History v0 不向 Subsystem 发 custom event。

---

## 9. Canonical v0 Event Vocabulary

```text
conversation
  inbound from Subsystem:
    scroll-up
    scroll-down
    option-above
    option-next
    commit

  outbound to Subsystem:
    submit {}
    submit { optionId }

history
  inbound from Subsystem:
    scroll-up
    scroll-down
    scroll-to-latest

  outbound to Subsystem:
    none

all other canonical nodes
  inbound:
    none
  outbound:
    none
```

Event names are therefore not globally sufficient；v0 ABI identity is effectively：

```text
(target node kind, event direction, event name, payload shape)
```

---

## 10. State / Local State / Event Boundary

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

Transient Presentation Events：

```text
conversation.scroll-up
conversation.scroll-down
conversation.option-above
conversation.option-next
conversation.commit
history.scroll-up
history.scroll-down
history.scroll-to-latest
```

Business submission：

```text
conversation.submit
```

不得通过 RenderNode `data` 的 commandId 模拟一次性 event；也不得持续同步 `selectedOptionId`、scrollTop 或 typewriter progress。

---

## 11. Explicit non-goals

Dialogue Event ABI 不是 DOM command protocol。

允许：

```text
conversation + scroll-down
conversation + option-next
conversation + commit
history + scroll-to-latest
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

## 12. Current design consequence

当前闭环模型：

```text
Subsystem retained facts
→ RenderNode.data
→ receiveRenderData(...)

Subsystem transient operation
→ RenderDomain.emit({ targetKey, name, data })
→ current target node receiveRenderEvent(...)

Conversation Presentation-local coordination
→ text reveal
→ option selection
→ scroll

真正业务提交
→ conversation context.emitCustomEvent("submit", ...)
→ WEB_PRESENTATION_EVENT_CHANNEL_V1
→ Dialogue Subsystem
```

v0 因此冻结：

```text
conversation = Dialogue interaction owner
history      = History interaction owner
other nodes  = presentation data nodes
```

这既保留 RenderNode 的精确 target 语义，也避免把 typewriter、current option selection 或滚动位置提升为 Subsystem authority。