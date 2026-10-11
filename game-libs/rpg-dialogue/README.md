# RPG Dialogue 游戏库

> 状态：**DESIGN / PREIMPLEMENTATION**

`@loomrealm-game/rpg-dialogue` 目标是提供可复用的 RPG 对话 Presentation / Interaction 能力。

当前设计明确不把它做成剧情脚本语言。RPG Dialogue 不拥有 `next`、branch、condition、quest/inventory mutation、battle launch、map transfer 或 Story Flow authority；业务方使用普通 TypeScript 控制连续对话。

设计入口：

- [RPG Dialogue v0 Module API](./RPG_DIALOGUE_V0_MODULE_API.md)
- [RPG Dialogue v0 Presentation / Render Tree Design](./RPG_DIALOGUE_V0_PRESENTATION.md)
- [RPG Dialogue v0 Presentation Events](./RPG_DIALOGUE_V0_PRESENTATION_EVENTS.md)
- [Web Presentation Render Event Delivery Delta](../../doc/15-contracts/web-presentation-render-event-delta.md)

## Module shape

v0 采用长期 `RPGDialogue` 实例 + 顺序 one-shot `openConversation()` operation：

```ts
const dialogue = new RPGDialogue(scope, frame);

const res0 = await dialogue.openConversation({
  conversation,
  characters,
  history,
});

const res1 = await dialogue.openConversation({
  conversation: nextConversation,
  characters: nextCharacters,
  history: nextHistory,
});

dialogue.close();
```

一次 `openConversation()` 对应一个当前可展示、可提交的 Conversation unit。Conversation 完成只 resolve 当前 Promise；`RPGDialogue` 实例保持存活，业务随后可以执行任意逻辑并决定是否打开下一轮 Conversation。

同一个 `RPGDialogue` v0 同时最多一个 active Conversation；不定义 queue / stack / replace / nested Conversation。

每次 request 提供完整 retained input snapshot：

```text
conversation   当前 Conversation 内容与 choices
characters     当前人物列表
history        已完成、当前允许展示的 transcript
```

History 内容 authority 属于 caller。RPG Dialogue 不自动把当前 Conversation 或 choice 写入 history，也不拥有 durable Story / Quest history。

## Presentation ownership

v0 Render Tree 按四个主要视觉区域组织：

```text
Characters
Conversation
Controls
History modal
```

该 vocabulary 属于 `rpg-dialogue` game-lib，不进入 LoomRealm Core。

Canonical RenderNode 的 ownership 规则：

```text
RenderNode.tag / tree
→ RPG Dialogue structural vocabulary

RenderNode.attrs
→ RPG Dialogue-defined semantic facts

RenderNode.data
→ caller-owned WebComponent payload where exposed by the public API
```

当前明确允许 caller-owned payload 的节点是 `lr-dialogue-character`。`DialogueCharacterV0.data` 为 `JsonObject`，字段结构完全由业务方及其 WebComponent 定义；RPG Dialogue 只验证 transport shape 并原样放入 `RenderNode.data`，不包裹、不解释、不改名、不应用内部默认值。

因此业务方可以使用同一 Dialogue API 实现静态头像、sprite animation、Canvas、WebGL、Live2D、Spine 或其他自定义人物 Presentation，而不要求 RPG Dialogue 定义这些 schema。

Dialogue 自己的人物语义：

```text
characterId
displayName
active
placement
expression
```

进入 `RenderNode.attrs`，不占用业务方的 `data` schema。

## Presentation state / local state / transient events

```text
RenderNode attrs/data
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
→ current Conversation submission
```

`conversationId` 是 RPG Dialogue 内部为每次 `openConversation()` 分配的 Presentation identity；改变时 WC 重置上一 Conversation 的 reveal、option selection 和 conversation-local scroll state。caller 不需要维护该 identity。

## Node Event Contract

`render.event` 按 `domainId + targetKey` 精确寻址 RenderNode，因此 v0 interaction owner 维持为：

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
```

其他 canonical nodes 当前不直接拥有 business interaction event。

`commit` 行为：

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

Choices 不包含 retained `selected`；初始不默认选择任何 option。

History modal 的 open/close 属于 Dialogue / Presentation interaction state；History 内容由 caller 每次作为完整 transcript snapshot 提供。

`receiveRenderEvent()` 的 Web Presentation 投递目前仍是 **DRAFT / REOPEN PROPOSAL**，未实现、未资格；Dialogue 文档不得把该能力声明为已落地。
