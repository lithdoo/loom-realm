# RPG Dialogue 游戏库

> 状态：**DESIGN / PREIMPLEMENTATION**

`@loomrealm-game/rpg-dialogue` 目标是提供可复用的 RPG 对话交互能力。

当前首先设计的是业务层 Presentation ABI / Render Tree、Presentation Event ABI 与 WebComponent interaction boundary，而不是剧情脚本语言。

设计入口：

- [RPG Dialogue v0 Presentation / Render Tree Design](./RPG_DIALOGUE_V0_PRESENTATION.md)
- [RPG Dialogue v0 Presentation Events](./RPG_DIALOGUE_V0_PRESENTATION_EVENTS.md)
- [Web Presentation Render Event Delivery Delta](../../doc/15-contracts/web-presentation-render-event-delta.md)

当前核心方向：

```text
Dialogue business/session state
        ↓ projection / render event
Dialogue Render Tree + transient Presentation Events
        ↓
LoomRealm Renderer / Web Projector
        ↓
Default or third-party WebComponents
        ↓ submit
Dialogue business/session state
```

v0 Render Tree 按四个主要视觉区域组织：

```text
Characters
Conversation
Controls
History modal
```

该 vocabulary 属于 `rpg-dialogue` game-lib，不进入 LoomRealm Core。

Presentation retained state、Presentation-local interaction state 与 transient event 明确分离：

```text
RenderNode.data
→ current retained presentation facts

Conversation WC local state
→ typewriter/reveal progress
→ current option selection
→ scroll position

RenderDomain.emit(...)
→ render.event
→ proposed WebComponent receiveRenderEvent(...)
→ transient presentation operation

WebComponent emitCustomEvent("submit", ...)
→ WEB_PRESENTATION_EVENT_CHANNEL_V1
→ final business submission to Dialogue Subsystem
```

## Node Event Contract

`render.event` 按 `domainId + targetKey` 精确寻址 RenderNode，因此 v0 明确规定哪些 canonical node 是 interaction owner：

```text
conversation
  Subsystem → WC:
    scroll-up
    scroll-down
    option-above
    option-next
    commit

  WC → Subsystem:
    submit {}
    submit { optionId }

history
  Subsystem → WC:
    scroll-up
    scroll-down
    scroll-to-latest

  WC → Subsystem:
    none

其他 canonical nodes
  inbound event: none
  outbound custom event: none
```

`conversation` 统一拥有当前 Conversation unit 的交互：typewriter/reveal、option selection、scroll 和 commit 判断。`text`、`choices`、`choice.*` 等 descendant nodes 仍保存各自 retained presentation data，并通过 Window-local Presentation coordination 与 `conversation` 协作；该协调不得绕回 Subsystem 同步 local state。

Conversation 当前 canonical Subsystem → WC events：

```text
scroll-up
scroll-down
option-above
option-next
commit
```

其中 `scroll-up / scroll-down` 既可用于内容滚动，也允许 WC 做 option selection 联合优化；`option-above / option-next` 是独立的明确 option 切换操作。

`commit` 的行为由 Conversation WC 根据自己的 reveal / selection local state 决定：

```text
text 未完整显示
→ 立即完整显示
→ 不 submit

text 已完整显示 + 无 options
→ submit {}

text 已完整显示 + 有 options + 尚未选择
→ 不 submit

text 已完整显示 + 有 options + 已选择
→ submit { optionId }
```

Choices 不包含 `selected` retained fact，并且初始不默认选择任何 option。`conversationId` 标识当前可提交 Conversation unit；改变时 WC 重置上一单元的 reveal、option selection 和 conversation-local scroll state。

History 的显示 / 隐藏直接通过 `RenderNode.data.visible` 表达，不使用 open/close event。History 当前只定义：

```text
scroll-up
scroll-down
scroll-to-latest
```

`receiveRenderEvent()` 的 Web Presentation 投递目前仍是 **DRAFT / REOPEN PROPOSAL**，未实现、未资格；Dialogue 文档不得把该能力声明为已落地。
