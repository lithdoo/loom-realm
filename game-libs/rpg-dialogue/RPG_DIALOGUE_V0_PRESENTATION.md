# RPG Dialogue v0 Presentation

> 层级：`@loomrealm-game/rpg-dialogue` Presentation / Interaction ABI  
> 状态：Active Design  
> 稳定程度：Stabilizing  
> 依赖：[RPG Dialogue v0 API](./RPG_DIALOGUE_V0_API.md)、[Web Presentation API v1](../../doc/15-contracts/web-presentation-api-v1.md)、[Render Update v1](../../doc/15-contracts/render-update-v1.md)

本文定义 RPG Dialogue v0 的 canonical Render Tree、`attrs/data` ownership、WebComponent local state 与双向 interaction event contract。

它不是剧情脚本、DOM 模板或 LoomRealm Core 的新协议。Core 只理解通用 `RenderNode`、Render Update 与 Web Presentation ABI；`character`、`conversation`、`choice`、`history` 等语义只属于 `rpg-dialogue`。

## 1. Ownership model

Canonical node 统一遵守：

```text
RenderNode.tag / tree
→ RPG Dialogue structural vocabulary

RenderNode.key
→ RPG Dialogue-private presentation lifetime identity

RenderNode.attrs
→ RPG Dialogue-defined retained semantic facts

RenderNode.data
→ caller-owned WebComponent payload only where API explicitly exposes one
```

业务 identity 与 Render lifetime identity 必须分离：

```text
characterId / choiceId / entryId
→ business semantic identity
→ exposed through canonical attrs

RenderNode.key
→ presentation node lifetime identity
→ obeys Render Update v1 one-shot key rules
→ MUST NOT be treated as business identity
```

v0 明确暴露 caller-owned `data` 的 canonical node 只有：

```text
lr-dialogue-character
```

`DialogueCharacterV0.data` 必须原样进入 character node `data`。RPG Dialogue 不解释、包装、重命名或注入 caller schema。

其他 canonical nodes 的 Dialogue facts 放在 `attrs`，`data` 保持 `{}`。

## 2. Canonical Render Tree

```text
lr-dialogue-view
├─ lr-dialogue-characters
│  └─ lr-dialogue-character*
│
├─ lr-dialogue-conversation
│  ├─ lr-dialogue-text
│  └─ lr-dialogue-choices
│     └─ lr-dialogue-choice*
│
├─ lr-dialogue-controls
│  └─ lr-dialogue-control-hint*
│
└─ lr-dialogue-history
   └─ lr-dialogue-history-entry*
```

`lr-dialogue-choices` 是稳定 structural container；没有 choices 时它仍存在，只是 children 为空。

这是视觉语义树，不约束具体 HTML/Shadow DOM/Canvas/WebGL 实现。

## 3. Canonical node ABI

| node / key | Dialogue-owned attrs | `data` owner | Subsystem → WC Render Event | WC → Subsystem Custom Event |
| --- | --- | --- | --- | --- |
| `lr-dialogue-view` / `dialogue` | `version` | `{}` | none | none |
| `lr-dialogue-characters` / `characters` | none | `{}` | none | none |
| `lr-dialogue-character` / private live key | `character-id`, `display-name?`, `active`, `placement?`, `expression?` | caller | none | none |
| `lr-dialogue-conversation` / `conversation` | `conversation-id`, `speaker-character-id?` | `{}` | `scroll-up`, `scroll-down`, `choice-previous`, `choice-next`, `commit` | `submit` |
| `lr-dialogue-text` / `text` | `text` | `{}` | none | none |
| `lr-dialogue-choices` / `choices` | none | `{}` | none | none |
| `lr-dialogue-choice` / private live key | `choice-id`, `text`, `enabled` | `{}` | none | none |
| `lr-dialogue-controls` / `controls` | none | `{}` | none | none |
| `lr-dialogue-control-hint` / private live key | `action`, `label`, `enabled` | `{}` | none | none |
| `lr-dialogue-history` / `history` | `visible` | `{}` | `scroll-up`, `scroll-down`, `scroll-to-latest` | none |
| `lr-dialogue-history-entry` / private live key | `entry-id`, `speaker-character-id?`, `speaker-name?`, `text` | `{}` | none | none |

Event ABI identity 是：

```text
(target node kind, direction, event name, payload shape)
```

Event 不得投到未声明该 event 的 canonical node。

## 4. RenderDomain and identity lifetime

一个 `RPGDialogue` session 使用一个长期 Dialogue RenderDomain。它可以在第一次 `openConversation()` 时延迟创建；创建后跨 READY / ACTIVE 和多个顺序 Conversation 保持存活，直到 `RPGDialogue.close()`、Frame abort 或其他 session-terminal cleanup。

```text
RPGDialogue
└─ one Dialogue RenderDomain
   ├─ openConversation(A)
   ├─ READY
   ├─ openConversation(B)
   ├─ READY
   └─ close / abort → RenderDomain.close()
```

Conversation settle 不关闭 RenderDomain。READY 期间保留最后一次成功的 retained Dialogue projection，但不存在 active Conversation，Conversation submit 必须被拒绝。下一次 `openConversation()` 在同一个 Domain 中更新 retained projection，并分配新的 `conversation-id`。

### 4.1 Stable structural nodes

第一次 materialize Dialogue tree 后，以下 structural nodes 在该 RenderDomain lifetime 内保持 live，不因 Conversation 切换而删除：

```text
dialogue
characters
conversation
text
choices
controls
history
```

因此这些固定 key 可以安全作为稳定 RenderNode identity：

```text
dialogue
characters
conversation
text
choices
controls
history
```

`lr-dialogue-view` 表示整个 `RPGDialogue` Presentation session：

```ts
{
  key: "dialogue",
  tag: "lr-dialogue-view",
  attrs: { version: "0" },
  data: {},
  children: [...],
}
```

### 4.2 Dynamic item nodes

以下节点是动态 collection item：

```text
lr-dialogue-character
lr-dialogue-choice
lr-dialogue-control-hint
lr-dialogue-history-entry
```

它们的 `RenderNode.key` 由 RPG Dialogue 私有分配。v0 不冻结 key 格式，也不允许 business WebComponent 从 key 推导 `characterId`、`choiceId`、`action` 或 `entryId`。

连续存在的同一 semantic item MAY 保留同一 private Render key，从而保持同一个 HTMLElement / presentation-local state。例如 Alice 连续出现在相邻 Conversation snapshot 中时，可以继续使用当前 live character node。

一旦某个 dynamic RenderNode 被删除，其 key 就按 Render Update v1 规则永久 consumed 于当前 wire Domain lifetime。以后即使相同 business identity 再次出现，也必须分配 fresh Render key：

```text
business choiceId = "yes"
→ private Render key K1
→ node removed

later business choiceId = "yes" again
→ private Render key K2
→ K2 != K1
```

因此：

```text
same continuous semantic presence
→ MAY preserve RenderNode.key

removed semantic presence, then later returns
→ MUST use fresh RenderNode.key
```

`setHistory()` 的 replace 同样遵守这个规则；被移除的 History entry 以后即使以相同 `entryId` 再出现，也不能复用已 consumed 的旧 Render key。

`RPGDialogue` 不拥有 Quest、Inventory、Battle、Map 或 Realm State gameplay authority。

## 5. Characters

`characterId` 是 business identity，通过 `character-id` attr 暴露；RenderNode key 是模块私有 live identity。

概念映射：

```ts
{
  key: characterNodeKey,
  tag: "lr-dialogue-character",
  attrs: {
    "character-id": character.characterId,
    "active": character.active ? "true" : "false",
    ...(character.displayName === undefined
      ? {}
      : { "display-name": character.displayName }),
    ...(character.placement === undefined
      ? {}
      : { placement: character.placement }),
    ...(character.expression === undefined
      ? {}
      : { expression: character.expression }),
  },
  data: character.data,
  children: [],
}
```

`characterNodeKey` 是 RPG Dialogue private implementation identity，不是 public ABI 字符串。

`placement` 是 semantic layout hint，不是 CSS 坐标。`expression` 是 Dialogue semantic hint；业务 WC 可以映射成 portrait frame、animation state、Live2D expression 等具体实现。

`active` 与当前 speaker 是独立事实。

业务 `lr-dialogue-character` 通过 `receiveRenderData(data)` 消费 caller schema，并可使用 `WebPresentationContext.resources` 读取资源。

## 6. Conversation

Conversation 是一次 `openConversation()` 对应的当前可提交 interaction unit：

```text
lr-dialogue-conversation
├─ lr-dialogue-text
└─ lr-dialogue-choices
   └─ lr-dialogue-choice*
```

Conversation structural node：

```ts
{
  key: "conversation",
  tag: "lr-dialogue-conversation",
  attrs: {
    "conversation-id": internalConversationId,
    ...(speakerCharacterId === undefined
      ? {}
      : { "speaker-character-id": speakerCharacterId }),
  },
  data: {},
  children: [...],
}
```

`conversation-id` 由 `RPGDialogue` 为每次成功开始的 `openConversation()` 分配；它不是 Story identity，也不由 caller 提供。

当 `conversation-id` 改变时，Conversation WC 必须重置至少：

```text
reveal/typewriter progress
selectedChoiceId
conversation-local scroll
local focus/animation associated with previous Conversation
```

Conversation settle 后 structural node 继续存活；READY 期间它只是最后一次 retained projection，不代表仍有 active operation。

## 7. Text and choices

完整文本事实始终通过 `lr-dialogue-text.attrs.text` 提供：

```ts
{
  key: "text",
  tag: "lr-dialogue-text",
  attrs: { text: conversation.text },
  data: {},
  children: [],
}
```

Runtime/Render Tree 不通过持续发布 partial string 实现 typewriter；逐字显示进度属于 Presentation-local state。

Choice 的 `choiceId` 是 business identity；对应 RenderNode 使用 private live key：

```ts
{
  key: choiceNodeKey,
  tag: "lr-dialogue-choice",
  attrs: {
    "choice-id": choice.choiceId,
    text: choice.text,
    enabled: choice.enabled === false ? "false" : "true",
  },
  data: {},
  children: [],
}
```

`choiceNodeKey` 不是 `choiceId`，也不属于 public ABI。`choiceId` 是稳定 business identity，数组 index 不是 identity。

v0 不发布 retained `selected` attr/data。当前 selection 属于 Conversation WC local state：

```text
selectedChoiceId = null | choiceId
```

新 Conversation 初始必须为 `null`；不默认选择第一项。

API preflight 保证：只要当前 Conversation 的 `choices` 非空，就至少存在一个 enabled choice。因此 choice navigation 不需要处理“有 choices 但没有任何合法 selection target”的状态。

## 8. Conversation local coordination

`conversation` 是当前 Conversation 唯一 interaction owner。Descendant `text` / choice nodes 只提供 retained presentation facts。

Conversation WC 可以使用 Window-local 机制协调 descendants，例如 light-DOM traversal、private controller、local DOM event 或 shared local object，但这些机制不得通过 LoomRealm custom event 来同步 reveal、selection 或 pixel scroll。

Presentation-local state 至少包括：

```text
reveal/typewriter progress
selectedChoiceId
conversation scroll position
local focus / animation state
```

它们不是 Renderer Store、Subsystem 或 Realm State authority。

## 9. Conversation inbound events

所有以下 Render Event 的 target 都是稳定 structural key：

```text
targetKey = "conversation"
```

### `scroll-up` / `scroll-down`

表示方向性阅读导航，不是 DOM `scrollTop` command。WC 决定 smooth/paged/line-based scrolling、滚动距离与 selection 可见性策略。

### `choice-previous` / `choice-next`

只要求改变当前 enabled choice selection。

若当前无 selection：

```text
choice-next     → first enabled choice
choice-previous → last enabled choice
```

selection 改变不向 Subsystem 发业务事件。

是否 wrap-around 不属于跨实现 ABI；实现可以选择，但不能改变 choice identity、enabled legality 或最终 submit shape。

### `commit`

`commit` 的行为由当前 Presentation-local reveal/selection state 决定：

```text
text reveal incomplete
→ reveal immediately
→ no submit

text complete + no choices
→ submit current conversation

text complete + choices + no selection
→ no submit

text complete + selected enabled choice
→ submit current conversation + choiceId
```

Subsystem 不维护 typewriter progress，因此不能提前替 WC 决定一次 confirm 是 reveal 还是 submit。

## 10. Conversation outbound event: `submit`

只有 `conversation` node 可以向 Subsystem 发业务 custom event：

```text
name = "submit"
```

Payload 必须携带当前内部 `conversationId` 作为 correlation token：

```ts
// no choices
{ conversationId: string }

// selected choice
{ conversationId: string, choiceId: string }
```

Child choice node 不直接向 Subsystem 发 submit。

`RPGDialogue` 收到 submit 后必须重新验证：

```text
active Conversation still exists
current interaction mode === CONVERSATION
payload.conversationId === current internal conversationId
current Conversation has zero choices
→ choiceId MUST be absent
current Conversation has one or more choices
→ choiceId MUST be present
→ choiceId MUST identify a current choice
→ identified choice MUST be enabled
current Session / generation / Render target is still current
```

如果当前 mode 是 `HISTORY`，即使 `conversationId` 仍等于当前 active operation，Conversation submit 也必须被拒绝 / drop，且不得 settle `openConversation()`。

验证成功只 settle 当前 `openConversation()`；不会自动写 History、关闭 `RPGDialogue` 或决定下一 Conversation。

## 11. History

History entries 来自 `RPGDialogue` session-level History state，而不是当前 `ConversationRequestV0`。

```text
caller
→ transcript content semantics / mutation decision

RPGDialogue
→ current session History state / validation / projection

Realm State (optional)
→ durable persistence

WebComponent
→ local scroll / focus / virtualization / animation
```

History structural node：

```ts
{
  key: "history",
  tag: "lr-dialogue-history",
  attrs: {
    visible: historyVisible ? "true" : "false",
  },
  data: {},
  children: [...],
}
```

History entry 的 `entryId` 是 business identity；对应 RenderNode 使用 private live key：

```ts
{
  key: historyEntryNodeKey,
  tag: "lr-dialogue-history-entry",
  attrs: {
    "entry-id": entry.entryId,
    ...(entry.speakerCharacterId === undefined
      ? {}
      : { "speaker-character-id": entry.speakerCharacterId }),
    ...(entry.speakerName === undefined
      ? {}
      : { "speaker-name": entry.speakerName }),
    text: entry.text,
  },
  data: {},
  children: [],
}
```

`historyEntryNodeKey` 是 private presentation lifetime identity；`entryId` 才是业务 identity。

RPG Dialogue 不自动生成 transcript entry。

### 11.1 Visibility and history events

History open/close 使用 retained attr：

```text
history.attrs.visible = "true" | "false"
```

不存在 `open-history` / `close-history` transient event。

History transient event 的 target 统一是稳定 structural key：

```text
targetKey = "history"
```

Event names：

```text
scroll-up
scroll-down
scroll-to-latest
```

打开 History 并定位最新记录时顺序必须是：

```text
retained update: visible=true
→ Web Presentation reconcile
→ render.event: scroll-to-latest
```

依赖 Web Presentation API v1 的 retained-before-event ordering。

History 的 pixel scroll、focus、virtualization 与 animation 都是 WC-local state。

## 12. Input mode

`RPGDialogue` active interaction 至少区分：

```text
CONVERSATION
HISTORY
```

History visible 时，方向输入路由到 `history`；Conversation commit/choice navigation 不应继续作用于被遮挡的 Conversation。

Cancel precedence：

```text
HISTORY + cancel
→ close History
→ return to CONVERSATION

CONVERSATION + cancel + cancelable=true
→ settle current operation as { type: "cancelled" }

CONVERSATION + cancel + cancelable=false
→ no business settlement
```

物理 keyboard/gamepad mapping 属于 Dialogue Input Handler。典型映射：

```text
Confirm / Gamepad A
→ conversation.commit

D-Pad Up/Down while choices active
→ conversation.choice-previous / choice-next

History action
→ toggle retained history.visible
```

v0 不支持通过 pointer/touch 产生 Dialogue business/session interaction。Canonical v0 interaction 由 Dialogue Input Handler 驱动；第三方 WebComponent MAY 使用 pointer/touch 做 hover、动画或其他纯 presentation-local 行为，但 MUST NOT 因 pointer/touch 直接产生 Conversation submit、History visibility mutation、user cancel 或其他 Dialogue state mutation。

如果未来产品需要 pointer/touch 驱动上述 semantic action，应通过后续明确的 Dialogue ABI 扩展，而不是由第三方 WC 私自形成第二条 authority path。

## 13. Controls

`lr-dialogue-controls` 提供 presentation-only control hints，不是 Story facts。Canonical action vocabulary：

```text
confirm
choice-previous
choice-next
history
cancel
```

每个 `lr-dialogue-control-hint` 使用 private live Render key；`action` 是 semantic fact，不是 Render identity。

`lr-dialogue-control-hint` attrs：

```text
action
label
enabled
```

v0 public API 不让 caller 直接注入 control hints；RPG Dialogue 根据当前 interaction mode 与 session policy 生成。

## 14. WebComponent lifecycle requirements

Web Presentation API v1 的 retained materialization order 是：

```text
construct
→ receiveRenderContext, if implemented
→ first insertion / connectedCallback may occur
→ children / attrs
→ receiveRenderData, if implemented
```

因此第三方 Dialogue WebComponent：

- 不得在 `connectedCallback()` 假设 initial attrs 已完整；
- 应通过 attribute observation 或等价机制响应 managed attrs；
- character element 在 `receiveRenderData(character.data)` 前可以依赖当次 retained attrs 已被应用；
- `receiveRenderEvent()` 只处理 transient presentation impulse，不把 event 当 retained state 或 replay source；
- 不得把 dynamic node 的 private Render key 当作业务 identity 或持久化标识。

## 15. Attr/data limits

Dialogue-owned semantic strings进入 `RenderNode.attrs`，必须满足 Render Update v1 的 attr validation/UTF-8 limits。RPG Dialogue 应在 Subsystem boundary 提前拒绝会产生非法 RenderNode 的输入。

Caller-owned `character.data` 必须满足 RenderNode `data` 的 JSON transport limits。

这些限制属于 transport compatibility，不授权 Dialogue 解释 caller schema。

## 16. Default and third-party presentation

默认 Browser Presentation 可以注册 canonical tags：

```text
lr-dialogue-view
lr-dialogue-characters
lr-dialogue-character
lr-dialogue-conversation
lr-dialogue-text
lr-dialogue-choices
lr-dialogue-choice
lr-dialogue-controls
lr-dialogue-control-hint
lr-dialogue-history
lr-dialogue-history-entry
```

产品也可以完全不加载默认 assets，而提供第三方 WebComponents。第三方实现可以自由使用 DOM、Shadow DOM、Canvas、WebGL、Live2D、Spine 等，只要消费相同 structural/semantic/event ABI。

## 17. Non-goals

v0 Presentation ABI 不定义：

```text
Story Graph / Dialogue Document
DOM command protocol
pixel scroll commands
CSS class/style mutation commands
provider-specific portrait/Live2D/Spine schema
public dynamic RenderNode key format
business identity encoded in RenderNode.key
selected choice retained state
typewriter progress retained state
durable History persistence
pointer/touch business or session interaction
rich text/localization/voice/auto-advance protocol
```

这些不是隐藏的待实现 contract；它们明确不属于 v0 cross-implementation ABI。