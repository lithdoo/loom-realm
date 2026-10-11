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

> **当前 RPG 对话界面由哪些稳定的视觉语义区域组成，以及这些区域当前应该表达什么 retained facts。**

```text
Dialogue business/session state
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

第三方实现可以完全改变 DOM、Shadow DOM、Canvas、WebGL、Live2D、CSS 和动画，但仍消费同一份 Dialogue Render Tree 语义。

---

## 2. v0 顶层视觉结构

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
characters    上层人物图 / 立绘 / 角色视觉区域
conversation  中间当前会话区域
controls      下方操作提示区域
history       可显示 / 隐藏的历史记录模态区域
```

这是一棵**视觉语义树**，不是默认 HTML 结构。

---

## 3. `lr-dialogue-view`

`lr-dialogue-view` 是一次当前 Dialogue interaction 的 Presentation root。

建议稳定 key：

```text
dialogue
```

职责：

- 提供 Dialogue Presentation 的整体视觉宿主；
- 同时容纳人物、当前会话、控制提示和历史模态；
- 不拥有剧情业务状态；
- 不决定 quest、inventory、battle、map transition 或 Realm State mutation。

不冻结固定宽高、定位、背景、边框或视觉主题。

---

## 4. 人物视觉区域：`lr-dialogue-characters`

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

预计数据：

```ts
interface DialogueCharacterRenderDataV0 {
  readonly characterId: string;
  readonly displayName?: string;
  readonly active: boolean;
  readonly placement?: string;
  readonly expression?: string;
  readonly visual?: unknown;
}
```

`placement` 是业务语义 layout hint，例如 `left / center / right / far-left / far-right`，不是 CSS pixel coordinate。

第三方 Presentation MAY 将其解释成头像、立绘、Live2D、3D placement，或忽略该 hint。

---

## 5. 会话区域：`lr-dialogue-conversation`

Conversation 是当前一次**可提交的可见会话单元**：

```text
lr-dialogue-conversation
├─ lr-dialogue-text
└─ lr-dialogue-choices?
   └─ lr-dialogue-choice*
```

预计数据：

```ts
interface DialogueConversationRenderDataV0 {
  readonly conversationId: string;
  readonly speakerCharacterId?: string;
}
```

### 5.1 `conversationId`

`conversationId` 标识当前可提交 Conversation unit，而不是整个 NPC Dialogue session。

`lr-dialogue-conversation` WebComponent 可以长期保持同一个 RenderNode / HTMLElement identity，因此 `conversationId` 同时承担 Presentation-local interaction state 的生命周期边界。

当 `conversationId` 改变时，Conversation WebComponent MUST 将上一 Conversation unit 的 local interaction state 视为结束，并重置至少：

```text
typewriter / reveal progress
current option selection
conversation-local scroll position
```

这避免新的会话单元错误继承上一单元的“已完整显示”“已选择选项”或滚动位置。

### 5.2 Speaker identity

当前发言者优先作为 conversation 的业务事实表达：

```text
speakerCharacterId
+
characters[*].characterId
```

Presentation 可以据此决定高亮角色、显示名字及名字的具体位置。

v0 不冻结独立 `lr-dialogue-speaker` node；只有真实 consumer 证明 speaker 需要独立 identity / lifecycle / interaction 时再增加。

---

## 6. 文本：`lr-dialogue-text`

`lr-dialogue-text` 表达当前 Conversation unit 的完整文本事实：

```ts
interface DialogueTextRenderDataV0 {
  readonly text: string;
}
```

重要原则：

> **Runtime / Render Tree 始终提供完整文本；逐字显示进度属于 Conversation WebComponent 的 Presentation-local state。**

因此不得为了 typewriter animation 持续发布部分字符串。

默认 / 第三方 Presentation 可以自行实现：

```text
typewriter
instant reveal
text speed
glyph animation
voice-synchronized reveal
```

“确认时文字尚未显示完整则立即完整显示”的精确行为由 Presentation Event ABI 定义，见 `RPG_DIALOGUE_V0_PRESENTATION_EVENTS.md`。

---

## 7. 选项：`lr-dialogue-choices` / `lr-dialogue-choice`

Choices 是 Conversation 的可选区域：

```text
lr-dialogue-conversation
├─ lr-dialogue-text
└─ lr-dialogue-choices
   ├─ lr-dialogue-choice
   ├─ lr-dialogue-choice
   └─ ...
```

每个 choice 必须拥有稳定业务 identity：

```ts
interface DialogueChoiceRenderDataV0 {
  readonly choiceId: string;
  readonly text: string;
  readonly enabled: boolean;
}
```

建议 key：

```text
choice.<choiceId>
```

### 7.1 `choiceId`，不是 index

选择结果必须面向稳定 `choiceId`，不得把数组 index 当成业务 identity。

ordering、disabled policy 和第三方视觉布局均可以变化。

### 7.2 当前选项不是 retained state

v0 **不提供 `selected` RenderData 字段**。

当前 option selection 属于 `lr-dialogue-conversation` WebComponent 的 Presentation-local interaction state：

```text
selectedOptionId = null | choiceId
```

新 Conversation unit 初始 MUST 为：

```text
selectedOptionId = null
```

也就是说：

> **存在 choices 时，不默认选择任何 option。**

selection 可以由 `scroll-up / scroll-down` 的 Presentation 优化、独立 `option-next / option-above` 事件以及未来明确允许的 pointer/touch 行为改变，但不需要持续同步回 Subsystem。

只有真正提交时，WebComponent 才通过 `submit` custom event 将最终业务选择返回 Subsystem。

---

## 8. Conversation Presentation-local state

Conversation WebComponent 至少允许拥有以下 local state：

```text
revealComplete / typewriter progress
selectedOptionId
scroll position
local animation / focus state
```

这些状态：

- 不进入 Renderer Store；
- 不要求 Snapshot / Patch 恢复；
- 不成为 Subsystem / Realm State authority；
- 在 `conversationId` 改变时按 v0 contract 重置。

Subsystem 仍拥有当前文本、choices、choice enabled 状态及当前 Conversation unit 的合法性。

---

## 9. 控制提示区域：`lr-dialogue-controls`

Control Hint 表达语义 action，不硬编码物理按键。

```ts
interface DialogueControlHintRenderDataV0 {
  readonly action: string;
  readonly label: string;
  readonly enabled: boolean;
}
```

候选 canonical actions 仍为 DRAFT，例如：

```text
confirm
navigate-up
navigate-down
history
```

具体 Keyboard / Gamepad / Touch binding 属于产品 / input composition，不属于 Render Tree ABI。

---

## 10. 历史记录模态：`lr-dialogue-history`

History 是稳定视觉区域：

```text
lr-dialogue-view
└─ lr-dialogue-history
   ├─ lr-dialogue-history-entry
   ├─ lr-dialogue-history-entry
   └─ ...
```

显示 / 隐藏是 retained state：

```ts
interface DialogueHistoryRenderDataV0 {
  readonly visible: boolean;
}
```

```text
visible=false
→ history modal 隐藏

visible=true
→ history modal 显示
```

**进入 / 退出 History 不使用 Presentation Event。**

打开和关闭直接通过 `visible` 的 RenderNode state update 表达，因为这是当前 UI 状态而不是瞬时 impulse。

History WebComponent 可以自行维护 scroll position、virtualization、focus transition 和 local animation。

History entry：

```ts
interface DialogueHistoryEntryRenderDataV0 {
  readonly entryId: string;
  readonly speakerCharacterId?: string;
  readonly speakerName?: string;
  readonly text: string;
}
```

建议 key：

```text
history.<entryId>
```

History 记录已经发生过的当前 Dialogue transcript，不是 Story / Quest history。

---

## 11. Canonical v0 Tree 示例

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
  attrs: {},
  data: { version: 0 },
  children: [
    {
      key: "characters",
      tag: "lr-dialogue-characters",
      attrs: {},
      data: {},
      children: [
        {
          key: "character.hero",
          tag: "lr-dialogue-character",
          attrs: {},
          data: {
            characterId: "hero",
            displayName: "艾莉",
            active: false,
            placement: "left",
            expression: "neutral"
          },
          children: []
        },
        {
          key: "character.elder",
          tag: "lr-dialogue-character",
          attrs: {},
          data: {
            characterId: "elder",
            displayName: "村长",
            active: true,
            placement: "right",
            expression: "serious"
          },
          children: []
        }
      ]
    },
    {
      key: "conversation",
      tag: "lr-dialogue-conversation",
      attrs: {},
      data: {
        conversationId: "elder.intro.1",
        speakerCharacterId: "elder"
      },
      children: [
        {
          key: "text",
          tag: "lr-dialogue-text",
          attrs: {},
          data: { text: "村外最近出现了一只怪物。" },
          children: []
        },
        {
          key: "choices",
          tag: "lr-dialogue-choices",
          attrs: {},
          data: {},
          children: [
            {
              key: "choice.accept",
              tag: "lr-dialogue-choice",
              attrs: {},
              data: {
                choiceId: "accept",
                text: "我会去看看。",
                enabled: true
              },
              children: []
            },
            {
              key: "choice.decline",
              tag: "lr-dialogue-choice",
              attrs: {},
              data: {
                choiceId: "decline",
                text: "我现在没空。",
                enabled: true
              },
              children: []
            }
          ]
        }
      ]
    },
    {
      key: "controls",
      tag: "lr-dialogue-controls",
      attrs: {},
      data: {},
      children: []
    },
    {
      key: "history",
      tag: "lr-dialogue-history",
      attrs: {},
      data: { visible: false },
      children: []
    }
  ]
};
```

注意示例中没有 `selected`；初始 option selection 属于 WC local state，并且为空。

---

## 12. Default 与第三方 WebComponent

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

第三方实现必须消费相同的 Render Tree / Node Data / Event ABI，但 MAY 自由决定 DOM、Shadow DOM、CSS、Canvas、WebGL、Live2D、layout、animation、portrait、choice 与 history 的具体呈现。

---

## 13. 与 LoomRealm Core 的边界

本设计不要求 Core 理解 Dialogue vocabulary。

```text
Subsystem / Dialogue business code
    owns Dialogue presentation facts

RenderDomain
    carries generic RenderNode tree / RenderEvent

Renderer Store
    owns current retained render replica

Web Projector
    mechanically projects generic RenderNode

Business WebComponents
    own concrete visual realization and permitted presentation-local interaction state
```

Core 不增加：

```text
DialogueNode
DialogueComponent
DialogueHistory
DialogueChoice
Dialogue layout engine
Dialogue theme system
```

---

## 14. 与 Dialogue Business Model 的边界

Render Tree 不等于 Dialogue Document。

```text
Dialogue request / content / sequence
        ↓
Dialogue session / business interaction
        ↓ projection
Dialogue Render Tree
        ↓
Presentation-local interaction
        ↓ submit
Dialogue session / business interaction
```

Dialogue Presentation 可以拥有 typewriter、selection、scroll 等 local interaction state，但不拥有 quest、inventory、battle、branch side effect 或 Realm State mutation authority。

---

## 15. v0 暂不冻结事项

以下内容仍需要后续设计：

```text
1. exact TypeScript validation limits
2. character visual/resource reference shape
3. canonical placement / expression vocabulary
4. exact control hint action vocabulary
5. physical keyboard / gamepad / pointer mapping
6. pointer/touch 对 option selection / commit 的精确规则
7. history retention limit / virtualization boundary
8. accessibility semantics
9. localization / rich text / markup boundary
10. voice / auto-advance semantics
11. Dialogue public module API / request / result shape
```

Presentation Event 与 submit interaction 的当前设计见 `RPG_DIALOGUE_V0_PRESENTATION_EVENTS.md`。

---

## 16. 当前设计原则摘要

```text
Render Tree 是视觉语义树，不是剧情脚本。

View 固定表达：
Characters / Conversation / Controls / History。

Conversation 由 conversationId 标识当前可提交单元。
conversationId 改变时，WC 重置 reveal / option selection / scroll local state。

Runtime 提供完整文本；typewriter progress 属于 WC local state。

Choices 不包含 selected retained fact；初始不默认选择任何 option。
当前 option selection 属于 Conversation WC local interaction state。

History 通过 visible retained state 显示 / 隐藏，
进入 / 退出 History 不使用 transient event。

第三方可以完全替换 WebComponent 视觉实现，
但消费同一份 Dialogue Presentation ABI。

本协议属于 rpg-dialogue game-lib，
不进入 LoomRealm Core vocabulary。
```