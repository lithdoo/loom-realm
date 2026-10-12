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

dialogue.setHistory(savedHistory);

const res0 = await dialogue.openConversation({
  conversation,
  characters,
});

dialogue.appendHistory({
  entryId: "elder.1",
  speakerCharacterId: "elder",
  text: conversation.text,
});

const res1 = await dialogue.openConversation({
  conversation: nextConversation,
  characters: nextCharacters,
});

dialogue.close();
```

一次 `openConversation()` 对应一个当前可展示、可提交的 Conversation unit。Conversation 完成只 resolve 当前 Promise；`RPGDialogue` 实例保持存活，业务随后可以执行任意逻辑并决定是否打开下一轮 Conversation。

同一个 `RPGDialogue` v0 同时最多一个 active Conversation；不定义 queue / stack / replace / nested Conversation。

每次 Conversation request 提供：

```text
conversation   当前 Conversation 内容与 choices
characters     当前人物列表
```

History 不再作为每次 request 的重复输入。它是 `RPGDialogue` instance 的 session-level retained state：

```text
setHistory(entries)
→ 完整替换当前 session transcript

appendHistory(entry)
→ 显式追加 caller 已决定应进入 History 的 entry

getHistorySnapshot()
→ 读取 readonly snapshot，用于业务检查或 durable persistence
```

History 的内容语义仍属于 caller。RPG Dialogue 不自动把当前 Conversation、choice、旁白或系统提示写入 History，也不拥有 durable Story / Quest history。

如果游戏需要跨地图、存档或跨 session 保存 History，caller 可以将 `getHistorySnapshot()` 的结果写入 Realm State，并在新的 `RPGDialogue` instance 上通过 `setHistory()` 恢复。

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

RPGDialogue History
→ session-level retained transcript state

RenderDomain.emit(...)
→ render.event
→ WebComponent receiveRenderEvent(...)
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

History modal 的 open/close 属于 Dialogue / Presentation interaction state；History entries 由 `RPGDialogue` session 持有并由 caller 显式修改。

`receiveRenderEvent()` 的 Web Presentation 投递现已 **Design Frozen / IMPLEMENTED / QUALIFIED**（exact executable subject `8b4cfc7bf4cfd852779fc08917bb705eb08de0a4`）。RPG Dialogue 可以把该 Renderer 能力作为已落地架构依赖；这不改变 `rpg-dialogue` 自身仍为 **DESIGN / PREIMPLEMENTATION**。
