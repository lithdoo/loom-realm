# RPG Dialogue v0 Presentation / Render Tree Design

> 状态：**DRAFT / PREIMPLEMENTATION**  
> 层级：`game-libs/rpg-dialogue` 业务库内部 Presentation ABI  
> 非目标：**不是 LoomRealm Core / Renderer / Render Update 的新架构层协议**

本文定义 `@loomrealm-game/rpg-dialogue` 的 v0 RenderNode Tree 设计方向。

RPG Dialogue 使用 LoomRealm 既有 `RenderNode` / `RenderDomain` 作为承载；本文只定义 Dialogue 业务库自己的视觉语义树、canonical node vocabulary、各视觉区域的业务含义，以及默认 / 第三方 WebComponent 的替换边界。

LoomRealm Core 仍只理解通用：

```text
RenderNode
├─ key
├─ tag
├─ attrs
├─ data
└─ children
```

Core 不理解 `character`、`conversation`、`choice`、`history` 等 Dialogue 语义。

---

## 1. 设计目标

Dialogue Render Tree 不是剧情脚本，不是 Dialogue Document，也不是 DOM 模板。

它描述的是：

> **当前 RPG Dialogue session 的 retained presentation facts。**

```text
RPGDialogue
├─ current Conversation request
├─ session History
└─ Presentation interaction state
        │ projection
        ▼
RPG Dialogue Render Tree v0
        │
        ▼
LoomRealm Renderer Store / Web Projector
        │
        ▼
Default WebComponents
        or
Third-party WebComponents
```

第三方实现可以完全改变 DOM、Shadow DOM、Canvas、WebGL、Live2D、CSS 和动画，但仍消费同一份 Dialogue structural / semantic ABI。

Module API 与连续 Conversation lifecycle 见 `RPG_DIALOGUE_V0_MODULE_API.md`。

---

## 2. RenderNode ownership rule

v0 对 canonical RenderNode 使用统一 ownership rule：

```text
RenderNode.tag / tree
→ RPG Dialogue-defined structural vocabulary

RenderNode.attrs
→ RPG Dialogue-defined semantic facts

RenderNode.data
→ caller-owned WebComponent payload when the public module API exposes one
```

当前 v0 public API 明确暴露 caller-owned payload 的 canonical node 是：

```text
lr-dialogue-character
```

`DialogueCharacterV0.data` 的字段结构完全由 caller 与其 WebComponent 定义。RPG Dialogue 只要求它满足 LoomRealm `JsonObject` transport shape，并原样放入 character node 的 `data`。

RPG Dialogue 对 caller-owned `data`：

```text
MUST NOT wrap
MUST NOT interpret
MUST NOT rename keys
MUST NOT inject Dialogue-defined fields
MUST NOT apply semantic defaults inside data
MUST NOT derive gameplay behavior from data
```

因此业务可以自行使用 static portrait、sprite animation、Canvas、WebGL、Live2D、Spine、3D avatar 或其他 custom presentation，而无需把这些实现 schema 加入 RPG Dialogue ABI。

未暴露 caller-owned payload 的 canonical nodes，其 `data` 保持 `{}`；Dialogue 自己的语义不得因此回到 `data`。

---

## 3. v0 顶层视觉结构

```text
lr-dialogue-view
├─ lr-dialogue-characters
│  └─ lr-dialogue-character*
│
├─ lr-dialogue-conversation
│  ├─ lr-dialogue-text
│  └─ lr-dialogue-choices?
│     └─ lr-dialogue-choice*
│
├─ lr-dialogue-controls
│  └─ lr-dialogue-control-hint*
│
└─ lr-dialogue-history
   └─ lr-dialogue-history-entry*
```

四个主要视觉区域：

```text
characters    人物图 / 立绘 / 角色视觉区域
conversation  当前会话区域
controls      操作提示区域
history       可显示 / 隐藏的历史记录模态区域
```

这是一棵**视觉语义树**，不是默认 HTML 结构。

---

## 4. `lr-dialogue-view`

`lr-dialogue-view` 是一个 `RPGDialogue` instance 当前 Presentation session 的 root。

建议稳定 key：

```text
dialogue
```

职责：

- 提供 Dialogue Presentation 的整体视觉宿主；
- 同时容纳人物、当前 Conversation、控制提示和 History；
- MAY 跨多个顺序 `openConversation()` operation 保持同一 RenderNode / HTMLElement identity；
- History MAY 在多个 Conversation 之间持续存在；
- 不拥有剧情业务状态；
- 不决定 quest、inventory、battle、map transition 或 Realm State mutation。

建议：

```ts
{
  key: "dialogue",
  tag: "lr-dialogue-view",
  attrs: { version: "0" },
  data: {},
  children: [...],
}
```

---

## 5. 人物视觉区域：`lr-dialogue-characters`

人物区域允许同时存在多个角色：

```text
lr-dialogue-characters
├─ lr-dialogue-character
├─ lr-dialogue-character
└─ ...
```

每个 `lr-dialogue-character` 必须拥有独立稳定 `key`：

```text
character.<characterId>
```

Public character model：

```ts
interface DialogueCharacterV0 {
  readonly characterId: string;
  readonly displayName?: string;
  readonly active: boolean;
  readonly placement?: string;
  readonly expression?: string;
  readonly data: JsonObject;
}
```

Dialogue-defined semantics 映射到 attrs：

```text
character-id
active
display-name?
placement?
expression?
```

概念映射：

```ts
{
  key: `character.${character.characterId}`,
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

`placement` 是业务语义 layout hint，不是 CSS pixel coordinate。`expression` 同样只是 Dialogue semantic hint；具体 WC 可以映射到 portrait frame、Live2D expression、animation state 等实现。

`active` 与当前 speaker identity 不等价；RPG Dialogue 不自动把 speaker 改写成 active character。

`RenderNode.data` 必须是 caller 提供的 `DialogueCharacterV0.data`。第三方 `lr-dialogue-character` WebComponent 可以通过 `receiveRenderData(data)` 消费 caller schema，并通过 `WebPresentationContext.resources` 加载实际资源。

---

## 6. 会话区域：`lr-dialogue-conversation`

Conversation 是当前一次**可提交的可见会话单元**：

```text
lr-dialogue-conversation
├─ lr-dialogue-text
└─ lr-dialogue-choices?
   └─ lr-dialogue-choice*
```

Dialogue-defined semantic attrs：

```text
conversation-id
speaker-character-id?
```

概念形状：

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

### 6.1 `conversation-id`

`conversation-id` 标识当前可提交 Conversation unit，而不是整个 `RPGDialogue` instance。

caller 不提供该 identity。每次成功开始新的 `openConversation()` operation 时，`RPGDialogue` 分配新的内部 Presentation identity。

当 `conversation-id` 改变时，Conversation WebComponent MUST 重置至少：

```text
typewriter / reveal progress
current option selection
conversation-local scroll position
```

### 6.2 Speaker identity

当前发言者作为 Conversation semantic fact 表达：

```text
conversation["speaker-character-id"]
+
character["character-id"]
```

Presentation 可以据此决定发言者名字、视觉强调等行为。

---

## 7. 文本：`lr-dialogue-text`

`lr-dialogue-text` 表达当前 Conversation unit 的完整文本事实。

```ts
{
  key: "text",
  tag: "lr-dialogue-text",
  attrs: {
    text: conversation.text,
  },
  data: {},
  children: [],
}
```

重要原则：

> **Runtime / Render Tree 始终提供完整文本；逐字显示进度属于 Conversation WebComponent 的 Presentation-local state。**

不得为了 typewriter animation 持续发布部分字符串。

---

## 8. 选项：`lr-dialogue-choices` / `lr-dialogue-choice`

每个 choice 必须拥有稳定业务 identity。

Dialogue-defined choice attrs：

```text
choice-id
text
enabled
```

概念映射：

```ts
{
  key: `choice.${choice.choiceId}`,
  tag: "lr-dialogue-choice",
  attrs: {
    "choice-id": choice.choiceId,
    text: choice.text,
    enabled: choice.enabled ? "true" : "false",
  },
  data: {},
  children: [],
}
```

选择结果必须面向稳定 choice identity，不得把数组 index 当成业务 identity。

Presentation Event 文档当前提交 payload 使用 `optionId`；v0 Module API 与 Event ABI 必须在 implementation freeze 前统一该命名。

v0 **不提供 `selected` attr / data field**。当前 option selection 属于 `lr-dialogue-conversation` WebComponent 的 Presentation-local interaction state：

```text
selectedOptionId = null | choice identity
```

新 Conversation unit 初始 MUST 为 `null`，不默认选择任何 option。

---

## 9. Conversation Presentation-local state

Conversation WebComponent 至少允许拥有：

```text
revealComplete / typewriter progress
selectedOptionId
scroll position
local animation / focus state
```

这些状态：

- 不进入 Renderer Store retained presentation facts；
- 不要求 Snapshot / Patch 恢复；
- 不成为 Subsystem / Realm State authority；
- 在 `conversation-id` 改变时按 v0 contract 重置。

`RPGDialogue` 仍拥有当前 text、choices、enabled state 以及当前 Conversation unit 的合法 submission validation。

---

## 10. 控制提示区域：`lr-dialogue-controls`

Control Hint 表达语义 action，不硬编码物理按键。

Dialogue-owned attrs：

```text
action
label
enabled
```

Module API v0 暂不要求 caller 传 control hints；默认 control hints MAY 由 `RPGDialogue` 根据当前 Conversation interaction state 生成。

---

## 11. 历史记录模态：`lr-dialogue-history`

History 是 `RPGDialogue` session 的稳定视觉区域：

```text
lr-dialogue-view
└─ lr-dialogue-history
   ├─ lr-dialogue-history-entry
   ├─ lr-dialogue-history-entry
   └─ ...
```

History **不来自 `ConversationRequestV0`**。`RPGDialogue` 内部持有当前 session history，并从自身当前 History snapshot 投影 history nodes。

caller 通过 Module API：

```text
setHistory(entries)
appendHistory(entry)
getHistorySnapshot()
```

显式决定 transcript 内容。

`RPGDialogue` MUST NOT 自动把当前 Conversation、提交 choice 或其他业务内容写入 History。

### 11.1 History ownership

```text
caller
→ transcript content semantics / mutation decision

RPGDialogue
→ current session history state / validation / render projection

Realm State（optional）
→ durable persistence when the game requires save/load or cross-session history

WebComponent
→ local scroll / focus / virtualization / animation
```

History session state 可以跨多个 `openConversation()` operation 保持，而当前 Conversation 每次 operation 都会替换。

### 11.2 History visibility

显示 / 隐藏是 retained Presentation interaction state，表达为 Dialogue-owned attr：

```text
visible="false"
visible="true"
```

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

**进入 / 退出 History 不使用 Presentation Event。**

History modal open/close 由 `RPGDialogue` / Presentation interaction state 管理，而不是 Story fact。

History WebComponent 可以自行维护 scroll position、virtualization、focus transition 和 local animation。

### 11.3 History entries

Dialogue-owned history entry attrs：

```text
entry-id
speaker-character-id?
speaker-name?
text
```

建议 key：

```text
history.<entryId>
```

概念映射：

```ts
{
  key: `history.${entry.entryId}`,
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

History 记录已经发生过的当前 Dialogue transcript，但 `RPGDialogue` 不拥有 Story / Quest history semantics，也不自动决定哪些内容进入 transcript。

---

## 12. Canonical v0 Tree 示例

```text
lr-dialogue-view                    key=dialogue
├─ lr-dialogue-characters           key=characters
│  ├─ lr-dialogue-character         key=character.hero
│  └─ lr-dialogue-character         key=character.elder
│
├─ lr-dialogue-conversation         key=conversation
│  ├─ lr-dialogue-text              key=text
│  └─ lr-dialogue-choices           key=choices
│     ├─ lr-dialogue-choice         key=choice.accept
│     └─ lr-dialogue-choice         key=choice.decline
│
├─ lr-dialogue-controls             key=controls
│  └─ lr-dialogue-control-hint*
│
└─ lr-dialogue-history              key=history
   └─ lr-dialogue-history-entry*
```

示意：

```ts
const dialogueTree = {
  key: "dialogue",
  tag: "lr-dialogue-view",
  attrs: { version: "0" },
  data: {},
  children: [
    {
      key: "characters",
      tag: "lr-dialogue-characters",
      attrs: {},
      data: {},
      children: [
        {
          key: "character.elder",
          tag: "lr-dialogue-character",
          attrs: {
            "character-id": "elder",
            "display-name": "村长",
            active: "true",
            placement: "right",
            expression: "serious",
          },
          data: {
            model: {
              namespace: "resource.Live2D",
              key: "Elder/model3.json",
            },
            motion: "talk_01",
          },
          children: [],
        },
      ],
    },
    {
      key: "conversation",
      tag: "lr-dialogue-conversation",
      attrs: {
        "conversation-id": "conversation.2",
        "speaker-character-id": "elder",
      },
      data: {},
      children: [
        {
          key: "text",
          tag: "lr-dialogue-text",
          attrs: { text: "村外最近出现了一只怪物。" },
          data: {},
          children: [],
        },
      ],
    },
    {
      key: "controls",
      tag: "lr-dialogue-controls",
      attrs: {},
      data: {},
      children: [],
    },
    {
      key: "history",
      tag: "lr-dialogue-history",
      attrs: { visible: "false" },
      data: {},
      children: [
        {
          key: "history.elder.1",
          tag: "lr-dialogue-history-entry",
          attrs: {
            "entry-id": "elder.1",
            "speaker-character-id": "elder",
            "speaker-name": "村长",
            text: "你终于来了。",
          },
          data: {},
          children: [],
        },
      ],
    },
  ],
};
```

注意：

```text
character attrs
→ Dialogue semantic ABI

character data
→ caller/WC schema

History children
→ RPGDialogue current session History snapshot

selected choice
→ WC local state, not retained attr/data
```

---

## 13. Default 与第三方 WebComponent

`@loomrealm-game/rpg-dialogue` 后续可以提供默认 Browser Presentation，注册 canonical tags：

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

产品可以完全不加载默认 Browser assets，而加载第三方实现。

第三方实现必须消费相同的 Render Tree / attrs / Event ABI；对 `lr-dialogue-character.data` 则消费该产品自己定义的 caller-owned schema。

---

## 14. 与 LoomRealm Core 的边界

本设计不要求 Core 理解 Dialogue vocabulary。

```text
caller
    owns Story Flow and transcript content decisions

RPGDialogue
    owns current Conversation interaction and session History state

RenderDomain
    carries generic RenderNode tree / RenderEvent

Renderer Store
    owns current retained render replica

Web Projector
    mechanically projects generic RenderNode

Business WebComponents
    own concrete visual realization and permitted presentation-local interaction state
```

Core 不增加 Dialogue-specific vocabulary、History authority、Live2D schema 或 portrait schema。

---

## 15. 与 Dialogue Business Model 的边界

```text
business code
        ↓
RPGDialogue.openConversation(request)
        ↓ projection
Dialogue Render Tree
        ↓
Presentation-local interaction
        ↓ submit
ConversationResult
        ↓
business code decides:
  side effects / History mutation / next Conversation / close
```

连续 Conversation 顺序由 caller 普通 TypeScript flow 决定。

History 与 Conversation 的生命周期不同：

```text
Conversation
→ one openConversation() operation

History
→ RPGDialogue session-level retained state across operations
```

---

## 16. v0 暂不冻结事项

以下内容仍需要后续设计：

```text
1. exact TypeScript validation limits / string byte limits
2. canonical placement / expression vocabulary
3. exact control hint action vocabulary
4. physical keyboard / gamepad / pointer mapping
5. pointer/touch 对 option selection / commit 的精确规则
6. history retention limit / virtualization boundary
7. accessibility semantics
8. localization / rich text / markup boundary
9. voice / auto-advance semantics
10. whether additional canonical nodes expose caller-owned data in v0
11. choiceId / optionId naming unification between Module API and Event ABI
12. whether History mutation is legal while a Conversation is active
```

以下事项不再属于 OPEN：

```text
character visual/resource reference shape
→ intentionally caller-owned JsonObject data schema

Dialogue public module shape
→ persistent RPGDialogue + sequential openConversation()

Story flow ownership
→ caller-owned; no built-in Dialogue Program

History lifetime
→ RPGDialogue session-level state, mutated explicitly by caller
```

---

## 17. 当前设计原则摘要

```text
Render Tree 是视觉语义树，不是剧情脚本。

View 固定表达：
Characters / Conversation / Controls / History。

RPGDialogue instance 可跨多个顺序 Conversation 持续存在。
每次 openConversation() 产生新的 internal conversation-id。

Dialogue-defined facts 放 attrs。
caller-defined character WC payload 原样放 character data。

Runtime 提供完整文本；typewriter progress 属于 WC local state。
Choices 不包含 selected retained fact；初始不默认选择任何 option。

History 不再由每次 ConversationRequest 重复提供。
RPGDialogue 内部持有当前 session History。
caller 通过 setHistory / appendHistory 明确修改 transcript 内容。
RPGDialogue 不自动记录 Conversation 或 choice。
History modal visibility 属于 Dialogue / Presentation retained interaction state。

第三方可以完全替换 WebComponent 视觉实现，
但消费相同的 Dialogue structural / semantic ABI。

本协议属于 rpg-dialogue game-lib，
不进入 LoomRealm Core vocabulary。
```