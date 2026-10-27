# PokeMan Dialogue Web Component 设计

> 路径：`examples/PokeMan/doc/69-dialogue-web-component.md`
>
> 状态：**Design / Ready for implementation**
>
> 本文只定义 PokeMan 的 Dialogue Web Presentation：视觉布局、Web Component 行为、Presentation-local state、人物 sprite 展示、Conversation / History 模式以及 Presentation 资源接入。固定 Dialogue 的业务数据模型见 [64-dialogue.md](./64-dialogue.md)；Content / FSDB 物理模型见 [68-content-fsdb.md](./68-content-fsdb.md)。
>
> 本文不修改 `@loomrealm-game/rpg-dialogue` Runtime、public API 或 Frozen Presentation ABI。PokeMan 实现必须继续兼容现有 canonical `lr-dialogue-*` tags、attrs/data 和 Render Event / Custom Event 语义。

# 1. 目标

PokeMan 的 Dialogue Presentation 采用一个覆盖在 Map 等底层画面之上的 **Conversation Modal**。

Modal 外壳在整个 Dialogue session 内保持稳定，但内部布局按模式切换：

```text
backdrop
└─ modal
   ├─ Conversation mode
   │  ├─ character pane
   │  │  └─ 当前人物的地图像素图
   │  └─ content pane
   │     ├─ speaker
   │     ├─ text
   │     ├─ choices
   │     └─ continue indicator
   │
   └─ History mode
      └─ history pane (100% modal content width)
         ├─ history header
         └─ history entries
```

设计原则：

1. **Modal shell 稳定**：Conversation、Choice、History 切换时，backdrop、modal 的位置、尺寸、边框和 stacking 不重建、不跳动。
2. **Conversation 中人物区稳定**：当前台词、逐字显示和 Choice 切换时，左侧 character stage 保持稳定；它不是 portrait thumbnail，而是复用 Map 4×4 character sprite sheet 的人物舞台。
3. **History 是同一 Modal 的全宽布局模式**：进入 History 后隐藏人物区和当前 Conversation 内容，History 占满 modal 内容区域；不切换 Scene，也不创建第二个 modal。
4. **History 优先可读性而不是人物展示**：历史记录包含多 speaker、多轮消息，不使用单一左侧人物去代表整段历史。
5. **Presentation-local state 留在 Web Component**：逐字显示、当前选项、滚动位置等不进入 gameplay state。
6. **Runtime ABI 保持不变**：PokeMan 只替换默认 Browser Presentation 的具体视觉实现，不向 `rpg-dialogue` 增加 PokeMan-specific API。

# 2. 非目标

本阶段不设计或实现：

- Dialogue graph / `Choice.target` 的业务解释；
- `Dialogue.mutation`、Event State、Relationship、Contract；
- NPC → Dialogue 的 Map wiring；
- Battle / Message / System Menu；
- 独立人物立绘资源系统；
- 表情、口型、Live2D、Spine；
- 新的 `rpg-dialogue` RenderNode 或新的 Runtime command；
- 对 Frozen `RPG_DIALOGUE_V0_PRESENTATION.md` / v1 public surface 的修改。

这些能力如果以后需要，应由对应业务 Subsystem 或新的 Presentation data 设计单独增加。

# 3. 参考范式

本设计组合两类成熟交互范式：

```text
JRPG / Fire Emblem style
→ 人物展示区 + 对话正文区
→ 强化当前 speaker 的存在感

Visual Novel backlog
→ 当前对话与 History 共用同一视觉上下文
→ History 使用连续 speaker + text 列表
→ 打开时优先定位到最新记录
```

PokeMan 不复制任何具体游戏 UI；只采用这些信息架构原则。人物继续复用 Map sprite 资源，但界面本身采用现代、克制的 JRPG / Visual Novel 视觉语言，不把像素素材的风格扩展成整套像素化 UI。

# 4. 与 RPG Dialogue canonical tree 的关系

现有 `@loomrealm-game/rpg-dialogue` canonical tree 保持：

```text
lr-dialogue-view
├─ lr-dialogue-characters
│  └─ lr-dialogue-character*
├─ lr-dialogue-conversation
│  ├─ lr-dialogue-text
│  └─ lr-dialogue-choices
│     └─ lr-dialogue-choice*
├─ lr-dialogue-controls
│  └─ lr-dialogue-control-hint*
└─ lr-dialogue-history
   └─ lr-dialogue-history-entry*
```

PokeMan Web Component 不重排 Runtime tree identity；视觉布局通过 `lr-dialogue-view` 的 Shadow DOM、slot 和 CSS grid 完成。

建议 `lr-dialogue-view` Shadow DOM：

```html
<div class="backdrop" aria-hidden="true"></div>
<section class="modal">
  <slot></slot>
</section>
```

其中默认 slot 的 canonical direct children 按 mode 投影：

```text
Conversation mode
lr-dialogue-characters    → character
lr-dialogue-conversation  → content
lr-dialogue-history       → hidden
lr-dialogue-controls      → controls / hints

History mode
lr-dialogue-characters    → hidden
lr-dialogue-conversation  → hidden
lr-dialogue-history       → full modal content area
lr-dialogue-controls      → controls / hints
```

`lr-dialogue-history[visible="true"]` 触发 History layout。History 打开时由 `lr-dialogue-view` 观察该 attr，并在 host 上维护仅供 Presentation 使用的 mode，例如：

```text
data-mode="conversation"
data-mode="history"
```

该 mode 不是 Runtime state，不通过事件回传。

## 4.1 精确 Wireframe：四个 UI state

PokeMan Presentation 把 UI 视图归一为四个互斥状态：

```text
REVEALING
CONVERSATION
CHOICES
HISTORY
```

它们不是四个 Runtime mode。Runtime 仍然只有：

```text
CONVERSATION
HISTORY
```

对应关系固定为：

```text
Runtime CONVERSATION
├─ text reveal incomplete
│  → UI REVEALING
├─ text reveal complete + choices.length === 0
│  → UI CONVERSATION
└─ text reveal complete + choices.length > 0
   → UI CHOICES

Runtime HISTORY
└─ history.visible === "true"
   → UI HISTORY
```

因此：

- `REVEALING / CONVERSATION / CHOICES` 都由 `lr-dialogue-conversation` 的 Presentation-local state 区分；
- `HISTORY` 由 Runtime retained fact `lr-dialogue-history[visible="true"]` 决定；
- `revealing` 不进入 Runtime、Renderer Store 或 Shared State；
- `choices.length` 来自 canonical `lr-dialogue-choices` children，不创建额外状态 authority。

### REVEALING

条件：

```text
history.visible = false
AND revealComplete = false
```

Wireframe：

```text
┌──────────────────────────────────────────────────────────────┐
│                      lr-dialogue-view                        │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ modal                                                  │  │
│  │                                                        │  │
│  │ ┌──────────────────┐  ┌─────────────────────────────┐ │  │
│  │ │ characters       │  │ conversation                │ │  │
│  │ │                  │  │ Professor                   │ │  │
│  │ │   active sprite  │  │                             │ │  │
│  │ │                  │  │ 你终于来▌                  │ │  │
│  │ │                  │  │                             │ │  │
│  │ │                  │  │ choices*                    │ │  │
│  │ └──────────────────┘  └─────────────────────────────┘ │  │
│  │                                                        │  │
│  │ controls                                               │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

`choices*` 表示 canonical choices 如果存在仍然存在并可显示。原因是 Frozen Runtime 在 Conversation mode 中只要 `choices.length > 0`，`previous / next` 就是 enabled，并可能向 Conversation 发出 `choice-previous / choice-next`；Presentation 必须能够履行 selection 语义，不能因为文字仍在 reveal 就丢弃这些事件。

此状态：

- character pane：visible；
- conversation pane：visible；
- text：partial；
- choices：若存在则 visible，可导航；
- continue indicator：hidden；
- history：hidden；
- `commit`：立即 reveal all，**不得 submit**。

### CONVERSATION

条件：

```text
history.visible = false
AND revealComplete = true
AND choices.length === 0
```

Wireframe：

```text
┌──────────────────────────────────────────────────────────────┐
│ ┌──────────────────┐  ┌───────────────────────────────────┐ │
│ │ characters       │  │ conversation                      │ │
│ │                  │  │ Professor                         │ │
│ │   active sprite  │  │                                   │ │
│ │                  │  │ 你终于来了。                      │ │
│ │                  │  │                                   │ │
│ │                  │  │                              ⌄    │ │
│ └──────────────────┘  └───────────────────────────────────┘ │
│ controls                                                     │
└──────────────────────────────────────────────────────────────┘
```

此状态：

- text：完整；
- choices container：仍然存在，但 children 为空；
- continue indicator：visible；
- `commit`：发出 `submit({ conversationId })`。

### CHOICES

条件：

```text
history.visible = false
AND revealComplete = true
AND choices.length > 0
```

Wireframe：

```text
┌──────────────────────────────────────────────────────────────┐
│ ┌──────────────────┐  ┌───────────────────────────────────┐ │
│ │ characters       │  │ conversation                      │ │
│ │                  │  │ Professor                         │ │
│ │   active sprite  │  │                                   │ │
│ │                  │  │ 你愿意接受吗？                    │ │
│ │                  │  │                                   │ │
│ │                  │  │ ┌───────────────────────────────┐ │ │
│ │                  │  │ │ 接受                      ›   │ │ │
│ │                  │  │ ├───────────────────────────────┤ │ │
│ │                  │  │ │ 拒绝                          │ │ │
│ │                  │  │ └───────────────────────────────┘ │ │
│ └──────────────────┘  └───────────────────────────────────┘ │
│ controls                                                     │
└──────────────────────────────────────────────────────────────┘
```

此状态：

- continue indicator：hidden；
- `selectedChoiceId` 可以为 `null`；
- `choice-next`：选择第一个 enabled 或下一个 enabled；
- `choice-previous`：选择最后一个 enabled 或上一个 enabled；
- `commit + selectedChoiceId = null`：no-op；
- `commit + selected enabled choice`：发出 `submit({ conversationId, choiceId })`。

### HISTORY

条件：

```text
history.visible = true
```

Wireframe：

```text
┌──────────────────────────────────────────────────────────────┐
│                      lr-dialogue-view                        │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ modal                                                  │  │
│  │                                                        │  │
│  │ HISTORY                                                │  │
│  │ ────────────────────────────────────────────────────── │  │
│  │                                                        │  │
│  │ Professor                                              │  │
│  │ 你终于来了。                                           │  │
│  │                                                        │  │
│  │ Rival                                                  │  │
│  │ 我已经等很久了。                                       │  │
│  │                                                        │  │
│  │ Professor                                              │  │
│  │ 现在开始吧。                                           │  │
│  │                                                        │  │
│  │ controls                                               │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

此状态：

- `lr-dialogue-characters`：layout / a11y hidden；
- `lr-dialogue-conversation`：layout / a11y hidden，但 HTMLElement 与 local state 保留；
- `lr-dialogue-history`：100% modal content width；
- `previous / next`：只滚动 History；
- `confirm`：Runtime disabled / no-op；
- `history`：返回 Runtime CONVERSATION；
- `cancel`：返回 Runtime CONVERSATION；
- 打开后按 retained-before-event 顺序处理 `visible=true`，随后响应 `scroll-to-latest`。

## 4.2 Canonical DOM 与 Shadow DOM 分区

Runtime materialize 的 light DOM **不得改形**：

```html
<lr-dialogue-view version="0">
  <lr-dialogue-characters>
    <lr-dialogue-character
      character-id="..."
      display-name="..."
      active="true|false">
    </lr-dialogue-character>
  </lr-dialogue-characters>

  <lr-dialogue-conversation
    conversation-id="..."
    speaker-name="...">
    <lr-dialogue-text text="..."></lr-dialogue-text>

    <lr-dialogue-choices>
      <lr-dialogue-choice
        choice-id="..."
        text="..."
        enabled="true|false">
      </lr-dialogue-choice>
    </lr-dialogue-choices>
  </lr-dialogue-conversation>

  <lr-dialogue-controls>
    <lr-dialogue-control-hint action="confirm" ...></lr-dialogue-control-hint>
    <lr-dialogue-control-hint action="previous" ...></lr-dialogue-control-hint>
    <lr-dialogue-control-hint action="next" ...></lr-dialogue-control-hint>
    <lr-dialogue-control-hint action="history" ...></lr-dialogue-control-hint>
    <lr-dialogue-control-hint action="cancel" ...></lr-dialogue-control-hint>
  </lr-dialogue-controls>

  <lr-dialogue-history visible="false|true">
    <lr-dialogue-history-entry
      entry-id="..."
      speaker-name="..."
      text="...">
    </lr-dialogue-history-entry>
  </lr-dialogue-history>
</lr-dialogue-view>
```

PokeMan 只定义每个 canonical element 自己的 Shadow DOM。

### `lr-dialogue-view`

```text
#shadow-root
├─ .backdrop
└─ .modal[role=dialog]
   ├─ .surface
   └─ <slot class="canonical-root">
```

`.modal` 是唯一稳定外框。slot 使用 layout flattening，使四个 canonical direct children 参与 modal grid；实现不得把 canonical nodes 从 `lr-dialogue-view` reparent 到别处。

Conversation mode：

```css
grid-template-columns: 32% minmax(0, 68%);
grid-template-rows: minmax(0, 1fr) auto;
grid-template-areas:
  "characters conversation"
  "characters controls";
```

History mode：

```css
grid-template-columns: minmax(0, 1fr);
grid-template-rows: minmax(0, 1fr) auto;
grid-template-areas:
  "history"
  "controls";
```

`lr-dialogue-view` 用 `MutationObserver` 观察 direct child `lr-dialogue-history[visible]`，只更新 Shadow DOM 内部 `.modal` 的 private mode class / data；不向 Runtime 写任何 attr。

### `lr-dialogue-characters`

```text
#shadow-root
└─ .character-stage
   └─ <slot>
```

规则：

- 多个 `lr-dialogue-character` 可以同时存在；
- 只把 `active="true"` 的 character 作为主要可见人物；
- inactive characters 可以保留在 DOM，但不得抢占主要视觉空间；
- 不根据 `speaker-name` 猜测 active character。

### `lr-dialogue-character`

```text
#shadow-root
└─ .character
   ├─ canvas.sprite[aria-hidden=true]
   └─ .fallback[aria-hidden=true]
```

`display-name` 可用于 accessibility / fallback，不要求在左侧重复显示姓名；当前 speaker 文本由 Conversation 右侧 header 表达。

### `lr-dialogue-conversation`

```text
#shadow-root
└─ .conversation
   ├─ header.speaker
   ├─ .body
   │  └─ <slot>
   │     ├─ lr-dialogue-text
   │     └─ lr-dialogue-choices
   └─ footer.status
      └─ .continue-indicator
```

`lr-dialogue-conversation` 是唯一 Conversation interaction owner，持有：

```text
observedConversationId
revealText
revealIndex
revealComplete
selectedChoiceId
conversationScroll
revealTimer
presented = true|false
```

它根据 private state 在自己的 Shadow DOM 内计算：

```text
REVEALING | CONVERSATION | CHOICES
```

不通过 LoomRealm Custom Event 上报该 phase。

### `lr-dialogue-text`

```text
#shadow-root
└─ span.text
```

canonical `text` attr 永远保存完整文本；可见 partial text 只由 Conversation 通过 local coordination 写入 WC-local rendering state。

### `lr-dialogue-choices`

```text
#shadow-root
└─ .choice-list[role=listbox]
   └─ <slot>
```

容器始终存在；没有 choice 时为空。

### `lr-dialogue-choice`

```text
#shadow-root
└─ .choice[role=option]
   ├─ .label
   └─ .selection-marker
```

`selected` 不是 canonical attr。Conversation 通过 private method / local DOM coordination 设置 WC-local selection。

### `lr-dialogue-controls`

```text
#shadow-root
└─ footer.control-hints
   └─ <slot>
```

五个 canonical hint node 始终存在。Presentation 可以隐藏 disabled hint 或降低其权重，但不能改写 `enabled` authority。

### `lr-dialogue-history`

```text
#shadow-root
└─ section.history
   ├─ header.history-header
   │  └─ h2 "History"
   └─ .history-scroll
      └─ <slot>
```

History 自己持有：

```text
pixel scroll position
local focus
virtualization state (future)
```

### `lr-dialogue-history-entry`

```text
#shadow-root
└─ article.entry
   ├─ .speaker
   └─ .text
```

不显示人物大图，不把 `speaker-name` 解析成 Character reference。

## 4.3 State ownership

```text
RPGDialogue Runtime
├─ lifecycle: READY | ACTIVE | CLOSED
├─ interaction mode: CONVERSATION | HISTORY
├─ history.visible
├─ choices / enabled facts
└─ control-hint enabled facts

lr-dialogue-view
└─ derived visual mode: conversation | history

lr-dialogue-conversation
├─ reveal progress
├─ selectedChoiceId
├─ conversation pixel scroll
└─ UI phase: REVEALING | CONVERSATION | CHOICES

lr-dialogue-history
└─ history pixel scroll / local focus
```

严禁形成以下反向 authority：

```text
WC local phase
→ Runtime mode

selectedChoiceId
→ Renderer Store

History pixel scroll
→ Shared State
```

## 4.4 Input / event routing matrix

| UI state | Runtime mode | `confirm` | `previous` | `next` | `history` | `cancel` |
| --- | --- | --- | --- | --- | --- | --- |
| REVEALING | CONVERSATION | `conversation.commit` → reveal all | 有 choices 时 `choice-previous` | 有 choices 时 `choice-next` | → HISTORY | 按 session cancelable |
| CONVERSATION | CONVERSATION | `conversation.commit` → submit | no event | no event | → HISTORY | 按 session cancelable |
| CHOICES | CONVERSATION | commit；无 selection no-op，有 selection submit | `choice-previous` | `choice-next` | → HISTORY | 按 session cancelable |
| HISTORY | HISTORY | no-op | `history.scroll-up` | `history.scroll-down` | → CONVERSATION | → CONVERSATION |

其中 REVEALING 如果当前 Conversation 自带 choices，selection navigation 仍必须工作；`commit` 永远先结束 reveal，不得在同一次 command 中继续 submit。


# 5. Modal 布局

## 5.1 桌面 / 横屏掌机

Modal 外部几何在 Conversation / History 间不变：

```text
modal width  = min(88vw, 960px)
modal height = min(68vh, 520px)
```

Conversation mode 使用：

```text
character pane = 32%
content pane   = 68%
```

示意：

```text
┌────────────────────────────────────────────────────────────┐
│                                                            │
│   ┌──────────────────┐  ┌──────────────────────────────┐   │
│   │                  │  │ Professor                    │   │
│   │                  │  │ ──────────────────────────── │   │
│   │                  │  │                              │   │
│   │      PIXEL       │  │ 你终于来了。                 │   │
│   │     CHARACTER    │  │                              │   │
│   │                  │  │ 这里有件事情想和你谈谈。     │   │
│   │                  │  │                              │   │
│   │                  │  │                        ▼     │   │
│   └──────────────────┘  └──────────────────────────────┘   │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

不使用 50/50。人物区是当前 Conversation 的视觉锚点，正文区需要更大的可读空间。

History mode 改为单列全宽：

```text
history pane = 100%
```

示意：

```text
┌────────────────────────────────────────────────────────────┐
│ HISTORY                                                    │
│ ────────────────────────────────────────────────────────── │
│                                                            │
│ Professor                                                  │
│ 你终于来了。                                               │
│                                                            │
│ Rival                                                      │
│ 我已经等很久了。                                           │
│                                                            │
│ Professor                                                  │
│ 现在开始吧。                                               │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

History 不保留左侧人物区。它展示的是多 speaker、多轮消息；单一人物舞台在这里既占空间，也会产生 speaker 归属歧义。

## 5.2 窄屏 fallback

Conversation mode 在可用宽度不足以可靠维持左右结构时，允许变为上下结构：

```text
┌────────────────────────────┐
│       CHARACTER STAGE      │
├────────────────────────────┤
│ speaker                    │
│ dialogue / choices         │
└────────────────────────────┘
```

History mode 仍然是单列全宽：

```text
┌────────────────────────────┐
│ HISTORY                    │
│ history entries            │
└────────────────────────────┘
```

建议 breakpoint 由实际可读宽度决定，不冻结设备型号。初始实现可从 `max-width: 640px` 开始验证。

窄屏仍必须满足：

- Conversation mode 中 character stage 保留；
- History mode 中 character stage 隐藏，history 使用完整可用宽度；
- History 不改变 modal 外框；
- Choice row 保持足够高度；
- 文本不横向滚动。

# 6. Backdrop 与层级

Dialogue modal 应明显高于 Map，但仍允许玩家感知底层场景。

推荐：

```css
backdrop background: rgb(0 0 0 / 0.52);
```

`backdrop-filter: blur(2px)` 只能作为可选 enhancement，不能作为可读性前提。

Modal 本体应接近不透明，避免地图纹理穿透正文。

最终 stacking 仍由 RPG Dialogue RenderDomain 的 `zIndex` authority 决定；PokeMan Web Component 不自行建立跨 RenderDomain 的全局层级规则。

# 7. 视觉语言

PokeMan Dialogue UI **不采用像素风格**。

人物素材仍然来自现有 Map character sprite sheet，但：

```text
pixel character asset
≠
pixel-style interface
```

界面本身采用现代、克制的 JRPG / Visual Novel modal 语言：

- soft / high-opacity surface；
- moderate radius；
- subtle shadow；
- 清晰、舒适的 typography；
- restrained accent color；
- 轻量分隔线；
- 短促、平滑的 opacity / transform transition；
- 不依赖 hover；
- focus / selection 对手柄操作必须明显可见。

Modal 不使用：

- hard pixel border；
- square-corner retro frame；
- pixel shadow；
- 模拟 8-bit / 16-bit UI palette；
- 为了“复古感”而降低文字可读性的装饰；
- 把每个控件都做成像素菜单。

人物 sprite 可以与现代 UI surface 并置，形成“现代界面 + 复古人物素材”的视觉反差；这种反差是允许的，也是第一版推荐方向。

推荐 surface 层级：

```text
backdrop
→ dimmed game world

modal
→ high-opacity primary surface

character pane
→ quiet secondary surface / neutral stage

content pane
→ primary reading surface

selected choice
→ subtle accent surface + border / marker
```

推荐基本尺寸：

| 项目 | 初始建议 |
| --- | --- |
| Modal 最大宽度 | 960px |
| Modal 宽度 | 88vw |
| Modal 高度 | 58–68vh |
| Conversation 左区 | 30–34% |
| Conversation 右区 | 66–70% |
| History 内容区 | 100% |
| 外层 padding | 20–28px |
| 内容区 padding | 24–32px |
| 中文正文 | 18–22px |
| speaker | 16–18px / semibold |
| 行高 | 1.6–1.75 |
| Modal radius | 12–20px 起步验证 |
| Choice row | >= 44px |
| mode transition | 120–180ms |

建议：

- Modal shadow 柔和，不做高对比硬边阴影；
- border 若存在，只作为低对比分隔，不承担“像素框”造型；
- accent color 用于 speaker、selected choice、focus marker 等少量位置；
- History 以阅读密度为优先，不把每条 entry 做成厚重 card；
- `prefers-reduced-motion` 下关闭非必要位移和 pulse。

具体色值、字体、radius 和 shadow 在实现阶段通过 PokeMan screenshot qualification 调整，不冻结为 compatibility surface。

# 8. Character pane

Character pane **只属于 Conversation mode**。进入 History 后该区域从视觉布局和可访问交互树中隐藏；History 不需要人物舞台。

## 8.1 资源复用

第一版不新增 portrait table。

当前人物图继续来自 Map 使用的 `resource.Graphics` character sprite sheet。PokeMan Dialogue caller 通过现有 `DialogueCharacterV0.data` 传入 Presentation-owned payload。

推荐 PokeMan payload：

```ts
type PokeManDialogueCharacterData = Readonly<{
  sprite: Readonly<{
    namespace: string;
    key: string;
    contentVersion: string;
  }>;
}>;
```

`rpg-dialogue` Runtime 不解释该 data；PokeMan `lr-dialogue-character` Web Component 负责解释。

不要把 `npcId`、`instanceId`、Relationship identity 塞进 Presentation payload。

## 8.2 Map sprite sheet 约束

当前 PokeMan Map Presentation 已采用：

```text
character sheet = 4 columns × 4 rows

column = pattern 0..3
row    = direction 2 / 4 / 6 / 8
```

Dialogue 第一版固定显示正面静止帧：

```text
direction = 2
pattern   = 0
```

裁图逻辑应与 Map 保持一致：

```text
frameWidth  = image.width / 4
frameHeight = image.height / 4
sourceX     = pattern * frameWidth
sourceY     = ((direction - 2) / 2) * frameHeight
```

如果宽高不能整除 4，视为无效人物资源。

## 8.3 Rendering

人物素材本身是低分辨率 sprite，因此仍应避免浏览器平滑插值：

```css
image-rendering: pixelated;
```

canvas 必须关闭 image smoothing。

这里的 `pixelated` 只是 **sprite 资源渲染要求**，不是 Dialogue UI 的视觉风格要求。

人物 frame 在 character pane 中水平和垂直居中，显示高度目标约为 pane 高度的 45–60%，周围保留足够留白。缩放优先保持清晰边缘；不要求整个 pane、边框、文字或控件使用像素风格。

Character stage 可以使用现代的轻量背景处理，例如：

- neutral surface；
- 很弱的 radial / linear gradient；
- 柔和的普通阴影；
- 低对比装饰形状。

不使用 pixel shadow、retro frame 或模拟像素地面的装饰，也不增加第二套 portrait decoration authority。

## 8.4 ResourceClient

`lr-dialogue-character` 通过 Web Presentation `receiveRenderContext(context)` 获取 `context.resources`，使用：

```text
context.resources.resource(namespace, key, contentVersion)
```

加载 PNG。

实现应采用与 Map Presentation 同等级别的资源安全要求：

- ref shape 校验；
- MIME 必须是 `image/png`；
- stale async decode 不覆盖新人物；
- disconnected 后释放可释放资源；
- decode 失败不能提交半渲染状态。

# 9. Conversation mode

右侧结构：

```text
content pane
├─ speaker
├─ separator
├─ text viewport
├─ choices
└─ continue indicator
```

## 9.1 Speaker

`lr-dialogue-conversation[speaker-name]` 决定当前 display speaker。

speaker 只是显示文本，不推导 Character identity。

推荐视觉：

```text
Professor
────────────────────────
```

如果没有 `speaker-name`，speaker 行隐藏，正文获得对应空间。

## 9.2 Text reveal

`lr-dialogue-text[text]` 保留 Presentation-local reveal state：

```text
REVEALING
REVEALED
```

初始逐字显示。推荐基线约 24ms / Unicode code point，但实际速度属于 Presentation policy，可在实现时调优。

`commit` 行为必须兼容当前 ABI：

```text
REVEALING + commit
→ 立即 reveal all
→ 不 emit submit

REVEALED + no choices + commit
→ emitCustomEvent("submit", { conversationId })

REVEALED + choices + commit
→ 仅在存在有效当前选择时 submit
```

Conversation identity 变化必须重置 reveal state、选择状态和正文滚动位置。

## 9.3 Continue indicator

仅满足以下条件时显示：

```text
mode = conversation
AND reveal = REVEALED
AND 当前 conversation 可以继续提交
```

视觉建议使用右下角轻量 chevron / arrow indicator，例如细线 `⌄` 或等价图标。可以使用低幅 opacity 或 translateY 微动效表达可继续，周期约 600–800ms。

该提示应与现代 modal 视觉一致，不使用像素箭头或复古菜单光标。History 模式不显示该 indicator。

# 10. Choice

Choice 不弹第二个窗口，直接位于正文下方，使用现代 selectable row。

示意：

```text
你愿意接受这个任务吗？

┌──────────────────────────────┐
│ 接受                      ›  │
├──────────────────────────────┤
│ 拒绝                         │
└──────────────────────────────┘
```

状态：

```text
normal
selected
disabled
```

视觉建议：

- row 使用轻量 surface / divider，而不是像素菜单框；
- selected 使用 accent background、border、leading marker 或 chevron 中至少两种可见信号；
- disabled 降低对比度并保留明确的 disabled 语义；
- radius 与 modal 整体一致；
- 不使用 `▶` 作为固定的复古像素光标要求；
- 不依赖 hover。

规则：

- `choice-next` / `choice-previous` 只在 enabled choices 间循环；
- 当前没有 selection 时，第一次 next 选第一个 enabled，第一次 previous 选最后一个 enabled；
- disabled choice 保留显示，但不可成为 selection；
- selection 不能只靠颜色表达；
- `choiceId` 只用于 Custom Event payload，不展示给玩家。

# 11. History mode

## 11.1 核心原则

History 不创建新的 modal，但会改变 modal **内部布局**。

```text
Conversation
┌──────────────┬───────────────────────────┐
│ character    │ speaker + current text    │
└──────────────┴───────────────────────────┘

History
┌──────────────────────────────────────────┐
│ HISTORY + entries                        │
└──────────────────────────────────────────┘
```

保持不变：

- backdrop；
- modal position；
- modal size；
- modal border / shadow；
- overall stacking；
- 当前 Dialogue session。

History 打开后：

- 隐藏 `lr-dialogue-characters`；
- 隐藏当前 `lr-dialogue-conversation` 的视觉内容；
- `lr-dialogue-history` 占满 modal 内容宽度；
- Conversation 的 reveal / selection / scroll 等 Presentation-local state 保留，关闭 History 后恢复。

这里稳定的是 **Modal shell**，不是内部两栏布局。

## 11.2 History entry

`lr-dialogue-history-entry` 显示：

```text
Professor
你终于来了。

Rival
我已经等很久了。

Professor
现在开始吧。
```

History 列表不渲染左侧人物舞台，也不为每条记录重复放大人物 sprite。speaker name 已足够表达归属，History 应优先提供连续阅读空间。

entry 间使用 spacing / separator 区分，不把每条做成独立 card。

未来如确有识别需求，可以讨论很小的 inline speaker marker，但它不能重新引入固定左侧 character pane。

## 11.3 打开位置

History 首次打开默认定位最新记录：

```text
scrollTop = scrollHeight
```

原因是主要使用场景是回看最近一句，而不是从 session 第一条开始阅读。

现有 `scroll-to-latest` Render Event 继续生效。

## 11.4 History header

History mode 的 header：

```text
HISTORY
────────────────────────
```

或本地化后的等价标题。

Conversation mode 恢复 speaker header。

不增加全局页面 title。

## 11.5 人物区

History mode 明确不显示人物区。

原因：

1. History 可能同时包含多个 speaker；
2. 固定显示“进入 History 前的人物”会误导当前阅读语义；
3. 根据滚动 entry 动态切换大人物会制造视觉噪音，并把日志浏览变成新的 selection system；
4. 全宽文本更适合掌机和长中文记录。

因此第一版不实现 History → character stage 的任何绑定。

# 12. Conversation / History mode transition

History 切换保持 Modal shell 不动，但允许内部 layout 从两栏变为单栏。

推荐 transition：

```text
enter History:
character pane     opacity 1 → 0
conversation pane  opacity 1 → 0
history pane       opacity 0 → 1
layout             32/68 → 100% history

leave History:
history pane       opacity 1 → 0
layout             100% history → 32/68
character pane     opacity 0 → 1
conversation pane  opacity 0 → 1
```

视觉淡入淡出建议 120–160ms。grid 切换本身可以即时完成，不要求对列宽做复杂动画。

Modal、backdrop 不移动、不缩放、不重新 mount。

目标 mental model：

> 玩家仍处于同一个 Dialogue session，只是从“当前会话”切到“全宽历史记录”。

避免使用 page slide、scene fade 或重新创建 modal。

# 13. Reveal 与 History 的组合状态

Presentation 至少存在两个正交状态维度：

```text
mode
= CONVERSATION | HISTORY

reveal
= REVEALING | REVEALED
```

推荐 History 打开时：

```text
REVEALING
→ pause reveal timer
→ 保留 revealIndex

关闭 History
→ 恢复同一 conversation
→ 从原 revealIndex 继续
```

不要因为查看 History 而隐式完成当前句。

如果实现复杂度证明不值得，可以后续明确改为“进入 History 时 reveal all”，但第一版实现应优先尝试 pause/resume，因为它不会改变玩家尚未完成的阅读状态。

# 14. Canonical element 职责

| Element | PokeMan 职责 |
| --- | --- |
| `lr-dialogue-view` | backdrop、modal geometry、Conversation 两栏 / History 全宽 mode、slot layout |
| `lr-dialogue-characters` | Conversation-only character stage structural container；History 时隐藏 |
| `lr-dialogue-character` | resource load、4×4 sheet crop、pixel render、active visual |
| `lr-dialogue-conversation` | speaker、reveal coordination、choice selection、commit、正文滚动；History 时视觉隐藏但保留 local state |
| `lr-dialogue-text` | 当前可见文本 |
| `lr-dialogue-choices` | choice list layout |
| `lr-dialogue-choice` | row visual、selected / enabled state |
| `lr-dialogue-controls` | compact control hints；不得占据主要正文空间 |
| `lr-dialogue-control-hint` | action / label / enabled visual |
| `lr-dialogue-history` | History 全宽 viewport、scroll events、visible state |
| `lr-dialogue-history-entry` | speaker + text entry |

结构型 element 仍可使用简单 slot implementation，但 canonical tags 必须全部注册。

# 15. Interaction ABI

PokeMan Web Component 必须完整保持现有 Render Event / Custom Event ABI。

Conversation 接收：

```text
choice-next
choice-previous
commit
scroll-up
scroll-down
```

History 接收：

```text
scroll-up
scroll-down
scroll-to-latest
```

Conversation 发出：

```text
submit
```

无 choices：

```js
emitCustomEvent("submit", {
  conversationId
});
```

有 choices：

```js
emitCustomEvent("submit", {
  conversationId,
  choiceId
});
```

不得新增 PokeMan-only Custom Event 来表达 graph、mutation 或 NPC interaction。

# 16. Control hints

`lr-dialogue-controls` 可以显示当前有效 semantic actions，例如：

```text
[A] 继续
[↑↓] 选择
[Y] 历史
[B] 返回
```

但这里显示的是 semantic action 的 presentation hint，不处理 Keyboard code、Gamepad button 或统一 controls mapping。

物理输入 mapping 继续属于 product composition。

小屏空间不足时，control hints 可以压缩或只显示关键动作；不得遮挡正文和 choice。

# 17. Accessibility

即使主要目标是掌机，也应保证基本 Web accessibility：

- modal 使用 `role="dialog"` 或等价语义；
- active Dialogue 时提供可辨识 label；
- History header 可作为 section heading；
- disabled choice 暴露 `aria-disabled="true"`；
- selected choice 暴露 `aria-selected="true"`；
- History 隐藏时不能继续暴露为可交互可访问内容；
- History 打开时 Conversation visual content 与 character stage 应被隐藏并从交互语义中移除；
- 动画应尊重 `prefers-reduced-motion`；
- 颜色不是 selection / disabled 的唯一信息源。

Web Component 不抢占 product 的 raw keyboard focus mapping；semantic controls 仍从 Runtime Render Event 进入。

# 18. Failure behavior

Presentation failure 不得静默制造错误 gameplay submit。

至少覆盖：

```text
invalid character data
resource fetch failure
PNG decode failure
invalid 4×4 sprite sheet
missing conversation-id
duplicate / invalid choice state
stale async resource completion
```

人物资源失败时，可以显示稳定的 fallback silhouette / initials，但 Conversation 仍应保持可读；是否报告 projector failure 以 Web Presentation 现有 failure contract 为准。

失败时禁止：

- 自动提交 Conversation；
- 伪造 choice；
- 改写 Runtime attrs/data；
- 将旧人物 bitmap 错配给新 Conversation。

# 19. Presentation 资源落地

当前 PokeMan `presentation.json` 只加载：

```text
controls/device-input.browser.js
map/map.browser.js
map/map.css
page.css
```

实现阶段新增 PokeMan Dialogue Presentation：

```text
examples/PokeMan/
├─ presentation/
│  ├─ dialogue.browser.js
│  └─ dialogue.css
│
└─ [FSDB]PokeMan/
   └─ [resource]Presentation/
      └─ dialogue/
         ├─ dialogue.browser.js.js
         └─ dialogue.css.css
```

建议逻辑资源：

```json
{
  "styles": [
    { "namespace": "Presentation", "key": "map/map.css" },
    { "namespace": "Presentation", "key": "dialogue/dialogue.css" },
    { "namespace": "Presentation", "key": "page.css" }
  ],
  "scripts": [
    { "namespace": "Presentation", "key": "controls/device-input.browser.js" },
    { "namespace": "Presentation", "key": "map/map.browser.js" },
    { "namespace": "Presentation", "key": "dialogue/dialogue.browser.js" }
  ]
}
```

实际实现时应把 dialogue source → FSDB 同步纳入现有 Presentation 同步链或将脚本泛化为统一 Presentation sync；不要长期手工维护 source / FSDB 两份内容。

PokeMan 不加载 `game-libs/rpg-dialogue/browser/rpg-dialogue.browser.js` 与 PokeMan implementation 两套同名 custom elements。一个 document 中同一 canonical tag 只能由一个实现注册。

# 20. Interaction state machine

本节只给实现状态机；Runtime / Presentation ownership 以 §4.3 为准。

```text
                         new conversation-id
                                  │
                                  ▼
                      ┌──────────────────────┐
                      │      REVEALING       │
                      │ mode=CONVERSATION    │
                      │ revealComplete=false │
                      └──────────┬───────────┘
                                 │
                    timer complete / commit
                                 │
                 ┌───────────────┴────────────────┐
                 │                                │
          choices.length=0                 choices.length>0
                 │                                │
                 ▼                                ▼
      ┌────────────────────┐            ┌────────────────────┐
      │    CONVERSATION    │            │      CHOICES       │
      │ revealComplete=true│            │ revealComplete=true│
      │ choices=0          │            │ choices>0          │
      └─────────┬──────────┘            └─────────┬──────────┘
                │                                 │
                │ submit                          │ selected + submit
                ▼                                 ▼
          settle operation                  settle operation

REVEALING / CONVERSATION / CHOICES
                │
                │ controls.history()
                ▼
      ┌────────────────────┐
      │      HISTORY       │
      │ mode=HISTORY       │
      │ visible=true       │
      └─────────┬──────────┘
                │
                │ history() or cancel()
                ▼
      restore previous Conversation phase
      (REVEALING / CONVERSATION / CHOICES)
```

History 进入前必须保存的不是一个额外业务 state，而是当前 Conversation WC 已经持有的 local state：

```text
revealIndex
revealComplete
selectedChoiceId
conversationScroll
```

### Transition table

| From | Trigger | Guard | Action | To |
| --- | --- | --- | --- | --- |
| new Conversation | `conversation-id` changes | text non-empty | reset local state; start reveal | REVEALING |
| new Conversation | `conversation-id` changes | text empty + no choices | mark revealed | CONVERSATION |
| new Conversation | `conversation-id` changes | text empty + choices | mark revealed | CHOICES |
| REVEALING | reveal timer completes | no choices | `revealComplete=true` | CONVERSATION |
| REVEALING | reveal timer completes | has choices | `revealComplete=true` | CHOICES |
| REVEALING | `commit` | no choices | reveal all; no submit | CONVERSATION |
| REVEALING | `commit` | has choices | reveal all; no submit | CHOICES |
| REVEALING | `choice-next/previous` | has choices | update `selectedChoiceId`; continue reveal | REVEALING |
| CONVERSATION | `commit` | no choices | emit `submit({conversationId})` | settle |
| CHOICES | `choice-next/previous` | enabled target exists | update `selectedChoiceId` | CHOICES |
| CHOICES | `commit` | no selection | no-op | CHOICES |
| CHOICES | `commit` | selected enabled | emit `submit({conversationId, choiceId})` | settle |
| any Conversation phase | Runtime sets History visible | ACTIVE | pause reveal if needed; preserve local state; hide conversation/characters | HISTORY |
| HISTORY | `scroll-to-latest` | after visible retained reconcile | scroll to newest entry | HISTORY |
| HISTORY | `scroll-up/down` | history has entries | local scroll | HISTORY |
| HISTORY | Runtime clears History visible | ACTIVE | restore layout; resume reveal if it was paused | previous Conversation phase |
| any phase | new `conversation-id` | — | old reveal/selection/scroll state discarded | recompute from new Conversation |

### Local coordination contract

History open/close 不向 Conversation 发送新的 LoomRealm Render Event。PokeMan Presentation 使用 Window-local coordination：

```text
lr-dialogue-view observes history.visible
→ view calls private/local presentation hook on lr-dialogue-conversation
   setPresented(false | true)
→ conversation pauses/resumes reveal timer
```

该 hook：

- 不是 public ABI；
- 不发 Session Event；
- 不进入 Render Tree；
- 不改变 `conversation-id`、choice attrs 或 History attrs；
- 只控制 WC-local timer / visibility behavior。

如果 `setPresented(false)` 时已经 `revealComplete=true`，只暂停视觉展示，不改变 phase。

# 21. Testing strategy

## 21.1 Web Component unit / browser tests

至少验证：

- canonical tags 全部成功注册；
- Conversation mode 使用 character + content 两栏；
- History mode 隐藏 character stage 和当前 Conversation visual content；
- History pane 使用完整 modal 内容宽度；
- Conversation ↔ History 切换不改变 modal bounding box；
- `speaker-name` 正确投影；
- text reveal 逐步显示；
- revealing 时第一次 commit 只 reveal，不 submit；
- revealed 后 commit 正确 submit；
- choices next / previous / disabled / wrap；
- choice submit payload exact；
- History 初始定位最新记录；
- History scroll events；
- History 打开 / 关闭保留 Conversation selection、scroll 和 reveal state；
- resource sprite 使用 4×4 crop、direction=2、pattern=0；
- image smoothing 关闭；
- stale resource result 不覆盖新人物；
- disconnected cleanup；
- reduced motion；
- 无人物 / narration 时仍可正常显示 Conversation。

## 21.2 ABI qualification

PokeMan implementation 应使用实际 Web Presentation harness 验证：

```text
RPGDialogue controls
→ Render Event
→ PokeMan lr-dialogue-* Web Components
→ submit Custom Event
→ RPGDialogue result
```

不能只测试 DOM snapshot。

## 21.3 Screenshot / geometry qualification

至少建立：

```text
1280×720 conversation
1280×720 choices
1280×720 history
640×480 conversation
640×480 history
narrow viewport fallback
```

关注：

- modal 不溢出；
- sprite 缩放清晰、无平滑模糊；
- 中文正文可读；
- choice 不被截断；
- History 不显示 character stage；
- History 长列表使用完整内容宽度并可滚动；
- Conversation ↔ History 外框几何稳定。

# 22. 第一版验收

实现完成的定义：

- [ ] PokeMan 注册自己的 canonical `lr-dialogue-*` Web Components。
- [ ] 不修改 RPG Dialogue Runtime / public API / Frozen ABI。
- [ ] Dialogue 以 modal 覆盖底层地图。
- [ ] Modal 在 Conversation / History 间保持同一位置和尺寸。
- [ ] Conversation mode 左侧显示来自 Map character sheet 的正面静止像素人物。
- [ ] 人物 sprite 保持清晰、canvas no smoothing；该要求不扩展成像素风 UI。
- [ ] Conversation mode 右侧支持 speaker、逐字显示、继续、choices。
- [ ] History mode 隐藏人物区和当前 Conversation visual content。
- [ ] History 使用 100% modal 内容宽度显示 session entries，并默认定位最新记录。
- [ ] History 打开 / 关闭保留 Conversation 的 reveal、selection 和 scroll local state。
- [ ] semantic Render Events 与 `submit` Custom Event 完整兼容。
- [ ] Presentation 资源纳入 PokeMan source → FSDB 同步和漂移检查。
- [ ] Browser / qualification 测试覆盖真实 closed loop。
- [ ] 不引入 Dialogue graph、Event mutation、NPC wiring 等业务职责。

# 23. 后续可选增强

第一版之后可按真实需求逐项增加：

1. 多 character stage / active character 亮度切换；
2. sprite idle animation（人物资源增强，不改变现代 UI 基调）；
3. speaker-specific accent；
4. 专用 portrait resource；
5. expression / pose Presentation data；
6. History 小型 inline speaker marker（仅在确有识别需求时；不恢复固定人物区）；
7. History 搜索或更长 session virtualization；
8. touch-specific affordance。

这些均不是当前实现前置条件，也不应提前扩展 `rpg-dialogue` Runtime contract。
