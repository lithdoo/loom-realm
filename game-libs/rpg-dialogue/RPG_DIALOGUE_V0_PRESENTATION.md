# RPG Dialogue v0 Presentation / Render Tree Design

> 状态：**DRAFT / PREIMPLEMENTATION**  
> 层级：`game-libs/rpg-dialogue` 业务库内部 Presentation ABI  
> 非目标：**不是 LoomRealm Core / Renderer / Render Update 的新架构层协议**

本文定义 `@loomrealm-game/rpg-dialogue` 的 v0 RenderNode Tree 设计方向。

RPG Dialogue 使用 LoomRealm 既有 `RenderNode` / `RenderDomain` 作为承载；本文只定义 Dialogue 业务库自己的：

- 视觉语义树；
- canonical node vocabulary；
- 各视觉区域的业务含义；
- 默认 WebComponent 与第三方 WebComponent 的替换边界。

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

> **当前 RPG 对话界面由哪些稳定的视觉语义区域组成，以及这些区域当前应该表达什么事实。**

它位于业务模型与具体 Web 表现之间：

```text
Dialogue business/session state
        │
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

当前 v0 设计采用一个稳定 `dialogue-view`，其下包含四个主要视觉区域：

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

这里的四个区域分别代表：

```text
characters    上层人物图 / 立绘 / 角色视觉区域
conversation  中间当前会话区域
controls      下方操作提示区域
history       可显示 / 隐藏的历史记录模态区域
```

这是一棵**视觉语义树**，不是默认 HTML 结构。

第三方组件不要求使用对应的 DOM 嵌套，也不要求使用相同 CSS layout。

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

`dialogue-view` 不要求默认实现必须是全屏，也不冻结固定宽高、定位、背景、边框或视觉主题。

---

## 4. 人物视觉区域：`lr-dialogue-characters`

人物区域位于 Dialogue 主视图的上层视觉区域，并允许同时存在多个角色。

```text
lr-dialogue-characters
├─ lr-dialogue-character
├─ lr-dialogue-character
└─ ...
```

### 4.1 多角色是 v0 基础能力

Dialogue 不假定画面上只有一个 speaker portrait。

合法场景包括：

```text
A 与 B 对话
A / B / C 三人同时在场
当前发言者高亮，其他角色仍保留
角色进入 / 离开当前会话画面
```

每个 `lr-dialogue-character` 必须拥有独立稳定 `key`，以便第三方 Presentation 保持独立 element identity 和本地动画状态。

建议：

```text
character.<characterId>
```

### 4.2 Character 语义数据

v0 预计至少需要表达：

```ts
interface DialogueCharacterRenderDataV0 {
  readonly characterId: string;
  readonly displayName?: string;

  // 当前是否是会话焦点 / 发言焦点。
  readonly active: boolean;

  // 业务语义位置 hint；不是 CSS 坐标。
  readonly placement?: string;

  // 表情 / pose 等业务 presentation hint。
  readonly expression?: string;

  // 可选视觉资源引用；精确 shape 在后续资源设计中冻结。
  readonly visual?: unknown;
}
```

`placement` 只表达业务层视觉 hint，例如：

```text
left
center
right
far-left
far-right
```

第三方 Presentation MAY 解释成：

- AVG / JRPG 立绘位置；
- 头像卡片位置；
- Live2D 模型站位；
- 3D character placement；
- 或完全忽略该 hint。

v0 不把 CSS pixel coordinate、flex/grid 结构或 DOM wrapper 写入业务 ABI。

---

## 5. 会话区域：`lr-dialogue-conversation`

Conversation 是当前一次可见会话单元。

```text
lr-dialogue-conversation
├─ lr-dialogue-text
└─ lr-dialogue-choices?
   └─ lr-dialogue-choice*
```

Conversation 负责表达当前玩家正在阅读和响应的内容。

### 5.1 Speaker identity

当前发言者优先作为 conversation 的业务事实表达，而不是强制要求独立 `speaker` 视觉节点。

预计形态：

```ts
interface DialogueConversationRenderDataV0 {
  readonly speakerCharacterId?: string;
}
```

第三方 Presentation 可以根据：

```text
speakerCharacterId
+
characters[*].characterId
```

决定：

- 高亮哪个人物；
- 是否显示名字；
- 名字显示在文本框、人物上方或其他位置；
- 是否完全隐藏 speaker name。

如果真实 consumer 证明 speaker 本身需要独立 identity / lifecycle / interaction，再考虑增加独立 `lr-dialogue-speaker` node；v0 DRAFT 不预先冻结。

---

## 6. 文本：`lr-dialogue-text`

`lr-dialogue-text` 表达当前会话的完整文本事实。

预计数据：

```ts
interface DialogueTextRenderDataV0 {
  readonly text: string;
}
```

重要原则：

> **Runtime / Render Tree 提供完整文本；逐字显示进度默认属于 Presentation-local visual state。**

因此不应为了 typewriter animation 持续发布：

```text
"村"
"村外"
"村外最"
...
```

默认 / 第三方 Presentation 可以自行实现：

- typewriter；
- instant reveal；
- text speed；
- glyph animation；
- voice-synchronized reveal。

是否需要显式的“立即显示完整文本”交互语义，在 Input/Event ABI 设计阶段单独冻结。

---

## 7. 选项：`lr-dialogue-choices` / `lr-dialogue-choice`

Choices 是 Conversation 的可选区域，不是所有会话都必须存在。

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
  readonly selected: boolean;
  readonly enabled: boolean;
}
```

建议 key：

```text
choice.<choiceId>
```

### 7.1 `choiceId`，不是 index

选择结果必须面向稳定 `choiceId`，不得把数组 index 当成业务 identity。

原因：

```text
ordering 可以变化
Presentation layout 可以变化
disabled / hidden policy 未来可以变化
第三方表现可以改变视觉排序方式
```

`selected` 表达当前 Dialogue interaction state 中哪个选项被选中。

它不是 CSS `:hover` 的替代物，而是用于统一：

```text
Keyboard ↑ / ↓
Gamepad D-Pad
Touch / Pointer
```

形成同一份当前 selection projection。

---

## 8. 控制提示区域：`lr-dialogue-controls`

Dialogue 主视图底部包含操作提示区域。

典型内容包括：

```text
确定
向上 / 向下选择
查看历史
```

树形：

```text
lr-dialogue-controls
├─ lr-dialogue-control-hint
├─ lr-dialogue-control-hint
└─ ...
```

Control Hint 表达的是**语义 action**，不是硬编码物理按键。

预计数据：

```ts
interface DialogueControlHintRenderDataV0 {
  readonly action: string;
  readonly label: string;
  readonly enabled: boolean;
}
```

候选 canonical actions：

```text
confirm
navigate-up
navigate-down
history
```

这些 action 名称目前仍为 DRAFT，在输入协议设计时再冻结。

业务 Render Tree 不应直接要求：

```text
Enter
ArrowUp
ArrowDown
H
Gamepad A
```

具体物理提示可以由产品 / Presentation 根据当前输入设备和 binding 决定。

这样同一语义可以呈现为：

```text
Keyboard → Enter / ↑↓ / H
Gamepad  → A / D-Pad / Y
Touch    → 点击 / 滑动 / History button
```

---

## 9. 历史记录模态：`lr-dialogue-history`

History 是 `dialogue-view` 下的稳定视觉区域，并作为可显示 / 隐藏的模态窗口存在。

```text
lr-dialogue-view
└─ lr-dialogue-history
   ├─ lr-dialogue-history-entry
   ├─ lr-dialogue-history-entry
   └─ ...
```

### 9.1 稳定 identity

History 不建议在每次打开 / 关闭时通过 insert/remove 表达生命周期。

更合适的模型是：

```ts
interface DialogueHistoryRenderDataV0 {
  readonly visible: boolean;
}
```

即：

```text
visible=false
→ history modal 隐藏

visible=true
→ history modal 显示并接管对应 interaction
```

这样第三方 Presentation 可以保持同一个 WebComponent identity，并自行实现：

- open / close animation；
- scroll position；
- virtualization；
- focus transition；
- local visual effects。

### 9.2 History entry

History 记录的是**已经发生过的当前 Dialogue transcript**，不是完整 Story / Quest history。

预计数据：

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

History 不拥有 quest、branch、inventory、battle 或 Realm State 业务事实。

---

## 10. Canonical v0 Tree 示例

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
│  ├─ lr-dialogue-control-hint      key=control.confirm
│  ├─ lr-dialogue-control-hint      key=control.navigate-up
│  ├─ lr-dialogue-control-hint      key=control.navigate-down
│  └─ lr-dialogue-control-hint      key=control.history
│
└─ lr-dialogue-history              key=history
   ├─ lr-dialogue-history-entry     key=history.line-1
   └─ lr-dialogue-history-entry     key=history.line-2
```

示意数据：

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
        speakerCharacterId: "elder"
      },
      children: [
        {
          key: "text",
          tag: "lr-dialogue-text",
          attrs: {},
          data: {
            text: "村外最近出现了一只怪物。"
          },
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
                selected: true,
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
                selected: false,
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
      children: [
        {
          key: "control.confirm",
          tag: "lr-dialogue-control-hint",
          attrs: {},
          data: {
            action: "confirm",
            label: "确定",
            enabled: true
          },
          children: []
        },
        {
          key: "control.history",
          tag: "lr-dialogue-control-hint",
          attrs: {},
          data: {
            action: "history",
            label: "历史",
            enabled: true
          },
          children: []
        }
      ]
    },
    {
      key: "history",
      tag: "lr-dialogue-history",
      attrs: {},
      data: {
        visible: false
      },
      children: []
    }
  ]
};
```

---

## 11. Default 与第三方 WebComponent

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

产品也可以完全不加载默认 Browser assets，而由自己的 Web Presentation Config 加载第三方实现。

第三方实现必须消费相同的 Render Tree / Node Data ABI，但 MAY 自由决定：

```text
DOM / Shadow DOM structure
CSS / theme
Canvas / WebGL / Live2D
layout
animation
portrait rendering
choice rendering
history rendering
input-device hint rendering
```

默认实现和第三方实现不能在同一 Window 中重复注册同名 Custom Elements；具体产品 composition 选择其一。

---

## 12. 与 LoomRealm Core 的边界

本设计不修改 LoomRealm Core。

仍保持：

```text
Subsystem / Dialogue business code
    owns Dialogue presentation facts

RenderDomain
    carries generic RenderNode tree

Renderer Store
    owns current render replica

Web Projector
    mechanically projects generic RenderNode

Business WebComponents
    own concrete visual realization
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

所有这些都属于 `game-libs/rpg-dialogue` 业务包。

---

## 13. 与 Dialogue Business Model 的边界

Render Tree 不等于 Dialogue Document。

必须保持：

```text
Dialogue request / content / sequence
        ↓
Dialogue session / interaction state
        ↓ projection
Dialogue Render Tree
        ↓
Presentation
```

因此未来业务模型增加：

```text
branching
localization
voice
conditions
character expression changes
history policy
```

不代表 Render Tree 必须一一复制这些业务结构。

Render Tree 只表达当前可见 Presentation facts。

---

## 14. v0 暂不冻结事项

以下内容仍需要后续设计，不应由实现自行永久定型：

```text
1. exact TypeScript data interfaces / validation limits
2. character visual/resource reference shape
3. canonical placement / expression vocabulary
4. exact control action vocabulary
5. WebComponent → Dialogue custom event ABI
6. confirm / reveal / advance 的精确 interaction state machine
7. keyboard / gamepad / pointer mapping
8. history open 时 input ownership / focus semantics
9. history retention limit / virtualization boundary
10. accessibility semantics
11. localization / rich text / markup boundary
12. voice / auto-advance semantics
```

这些应在真实业务 interaction 设计中逐项冻结，而不是通过默认 Browser 实现反向形成事实标准。

---

## 15. 当前设计原则摘要

```text
Render Tree 是视觉语义树，不是剧情脚本。

View 固定表达四个主要区域：
Characters / Conversation / Controls / History。

Characters 支持多角色同时存在。

Conversation 包含当前文本，并可包含 choices。

Controls 表达确定、上下选择、历史等语义动作提示，
不硬编码具体键盘 / 手柄按键。

History 是稳定存在、通过 visible 显示 / 隐藏的模态区域。

第三方可以完全替换 WebComponent 视觉实现，
但消费同一份 Dialogue Presentation ABI。

本协议属于 rpg-dialogue game-lib，
不进入 LoomRealm Core vocabulary。
```
