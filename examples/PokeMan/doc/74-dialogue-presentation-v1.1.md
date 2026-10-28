# PokeMan Dialogue Presentation v1.1 优化方案

> 路径：`examples/PokeMan/doc/74-dialogue-presentation-v1.1.md`
>
> 状态：**Design frozen / implementation-ready**
>
> 对应问题：[Issue #118 — PokeMan Dialogue Presentation v1.1: keep sessions visually continuous and tighten layout](https://github.com/lithdoo/loom-realm/issues/118)
>
> 本文是 [69-dialogue-web-component.md](./69-dialogue-web-component.md) 的 **有限 authority override**。本文只修正连续 Conversation 的 shell 可见性、active-character 响应式布局、视觉密度与人物 stage 连续性；其余 canonical tree、History、Reveal、Choice、sprite producer、Presentation resource、collision preflight 与 Runtime ABI 继续由 69 负责。

# 1. 背景

真实 PokeMan 产品验证发现当前 Dialogue Presentation 存在三个 UX 问题：

1. 连续 Conversation 在 `ACTIVE → READY → ACTIVE` 之间会让整个 modal/backdrop 消失再出现；
2. `<= 640px` 时人物区与正文被强制改成上下结构，对 640×480 等正常游戏 viewport 过早；
3. modal、人物区、正文、speaker 与 controls 的多层 padding 累积过大，整体更像网页 modal，而不是紧凑的 JRPG / VN 对话框。

另外，当前人物 element 在相同 sprite data 被重复投影时会重新进入 load/fallback 流程，可能造成不必要的 sprite 闪动。v1.1 把它纳入“人物 pane 连续性”一起处理。

本文 **不处理 Conversation 正文的 `↑/↓` 滚动语义**。该问题属于 semantic routing，应单独设计，不与本 PR 混合。

# 2. Authority override

69 继续是 PokeMan Dialogue Presentation 的主设计文档，但以下条款由本文覆盖：

```text
69 §4.2 / §4.3 / §4.5
→ control-hint facts 与 view visibility 的关系
→ READY 不再等价于“已打开 shell 必须 hidden”

69 §5.1
→ active character 双栏比例由 32/68 调整为 30/70

69 §5.2
→ 640px 不再是 stacked layout breakpoint
→ stacked layout 仅用于真正窄屏

69 中与 visual density 相关的建议值
→ 由本文的 v1.1 spacing baseline 覆盖
```

以下内容 **不被本文改写**：

```text
canonical lr-dialogue-* tree
Web Component tag / attr / data ABI
RPGDialogue Runtime public API
Render Event / Custom Event 语义
REVEALING / CONVERSATION / CHOICES / HISTORY 四 UI state
History full-width mode
first active character 选择规则
sprite versioned ref producer contract
sprite fallback contract
reveal first-confirm-only rule
choice selection / submit rule
pointer/touch gameplay boundary
semantic control hints 不显示 physical key glyph
Presentation source / FSDB sync
customElements collision preflight
```

# 3. v1.1 目标

最终体验固定为：

```text
Dialogue session open
→ shell 出现一次

Conversation A ACTIVE
→ reveal / submit

A settle → Runtime READY
→ shell 保持
→ backdrop 保持
→ character pane 保持
→ modal geometry 保持
→ interaction disabled

Conversation B ACTIVE
→ 同一 shell 原位更新内容
→ 新 Conversation 从头 reveal

B → READY → C
→ 同样保持 shell 连续

RPGDialogue.close() / RenderDomain close
→ shell 才真正消失
```

因此用户视觉上看到的是一个连续 Dialogue session，而不是每段台词都重新打开一次 modal。

# 4. Shell visibility 与 interaction readiness 解耦

## 4.1 问题

当前实现把五个 canonical control hint 的 enabled facts 同时当作：

```text
Runtime ACTIVE/READY evidence
+
整个 Dialogue shell 的 visibility authority
```

于是：

```text
all five hints disabled
→ presented=false
→ modal.hidden=true
→ backdrop.hidden=true
```

而 RPGDialogue 每个 Conversation settle 后都会进入 READY，因此连续 A/B/C 必然闪隐。

## 4.2 v1.1 private state

`lr-dialogue-view` 改为持有以下 Presentation-local private facts：

```text
controlsComplete: boolean
interactionActive: boolean
shellPresented: boolean
mode: conversation | history
hasActiveCharacter: boolean
```

其中：

```text
controlsComplete
= 五个 canonical action hints 已完整 materialize

interactionActive
= controlsComplete
  AND 至少一个 hint enabled=true

shellPresented
= 当前 lr-dialogue-view lifetime 内是否曾观察到 interactionActive=true
```

`shellPresented` 是 WC-local latch：

```text
initial = false

first interactionActive=true
→ shellPresented=true

later READY / all hints disabled
→ shellPresented remains true

lr-dialogue-view disconnect / RenderDomain close
→ element lifetime ends
→ latch naturally disappears
```

不得新增 public `active` / `ready` / `presented` canonical attr。

不得把该 latch 写入 Runtime、Renderer Store、Shared State 或 Session Event。

## 4.3 Exact visibility derivation

固定：

```text
five hints incomplete
AND shellPresented=false
→ shell hidden

five hints complete
AND all false
AND shellPresented=false
→ initial READY
→ shell hidden

five hints complete
AND any true
→ interactionActive=true
→ shellPresented=true
→ shell visible

later five hints complete
AND all false
AND shellPresented=true
→ intermediate READY
→ shell remains visible
→ interaction disabled / inert

view disconnects
→ shell removed by DOM lifetime
```

这样仍然避免 first-connect flash，同时不再在 A/B/C 之间隐藏 shell。

## 4.4 READY 的交互规则

中间 READY：

```text
modal/backdrop visible
view inert=true
controls semantic facts remain disabled
Conversation local reveal timer stopped
pointer/touch remains non-gameplay
no submit
no history toggle
no cancel
```

READY 不新增第五个用户可交互 UI state；它仍是四个 UI state 之外的正交 non-interactive shell condition。

## 4.5 Conversation presentation coordination

原来的 `conversation.setPresented(boolean)` 语义应拆成或重命名为能够准确表达：

```text
shell visibility
interaction/reveal activity
```

推荐 private seam：

```text
conversation.setInteractionActive(boolean)
```

规则：

```text
interactionActive=true
AND mode=conversation
→ Conversation 可以 reveal / 响应 Render Event

interactionActive=false
OR mode=history
→ stop reveal timer
→ preserve revealIndex / selectedChoiceId / scroll
```

方法名不是 ABI，Agent 可选等价 private 实现，但不得再用“shell visible”间接代表“Conversation interaction active”。

# 5. Conversation 切换必须保持视觉连续

## 5.1 Shell / element continuity

同一个 RPGDialogue instance 的 A/B/C：

```text
lr-dialogue-view HTMLElement
modal HTMLElement
backdrop HTMLElement
lr-dialogue-characters HTMLElement
active lr-dialogue-character HTMLElement (same canonical key when same character)
```

应尽可能保持同一 identity。

Runtime retained projection 在 READY 已存在，下一次 `openConversation()` 只更新 canonical projection。Presentation 不得主动 teardown/recreate shell。

## 5.2 Atomic visual transition

Conversation identity 变化时：

```text
old conversation settled
→ READY shell retained
→ new conversation-id/data reconciled
→ local selection/reveal reset
→ new text reveal begins
```

允许正文瞬时更新；不允许：

```text
modal fade out
backdrop fade out
character pane collapse
modal resize
page/scene transition
```

不要求在 READY 显示 loading spinner。正常 A→B 的 READY 时间应作为短暂 inert retained state。

# 6. Character sprite 连续性

当前 `lr-dialogue-character.receiveRenderData()` 每次都会重新 `_startLoad()`，而 `_startLoad()` 会先显示 fallback。若 A/B/C 使用完全相同的 versioned sprite ref，这会造成无意义的资源重取与人物闪动风险。

v1.1 固定：

```text
new parsed sprite ref === current parsed sprite ref
AND current status is loading or ready
AND render context identity unchanged
→ do not abort/restart load
→ do not show fallback
→ keep current canvas visible
```

只有以下情况重新 load：

```text
namespace changes
key changes
contentVersion changes
render resource context changes
element reconnect requires fresh acquisition
previous load ended in fallback and a valid new acquisition opportunity arrives
```

ref equality 必须比较 exact：

```text
namespace
key
contentVersion
```

仍保留 69 的 stale rejection、AbortController、ImageBitmap cleanup、PNG/4x4 validation 与 fallback。

# 7. Active-character layout v1.1

## 7.1 Normal game viewport

有 active character 时固定双栏：

```text
character = 30%
conversation = 70%
```

CSS 等价：

```css
.modal.with-character {
  grid-template-columns: 30% minmax(0, 70%);
  grid-template-rows: minmax(0, 1fr) auto;
  grid-template-areas:
    "characters conversation"
    "characters controls";
}
```

必须保持水平布局的 qualification viewport：

```text
1280×720
800×600
640×480
```

其中 800×600 是当前 Hostra/Desktop 默认窗口的重要产品基线。

## 7.2 No active character

继续沿用 69：

```text
no active character
→ character pane hidden / no grid space
→ conversation 100% width
```

transient speaker / narration 不创建 fake character。

## 7.3 History

继续沿用 69：

```text
History
→ character hidden
→ conversation hidden
→ history 100% modal content width
```

## 7.4 Narrow stacked breakpoint

`640px` 不再触发上下布局。

v1.1 第一版固定：

```text
viewport width >= 480px
→ active-character layout remains horizontal

viewport width < 480px
→ stacked layout allowed
```

建议 CSS：

```css
@media (max-width: 479px) {
  .modal.with-character {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: minmax(88px, 30%) minmax(0, 1fr) auto;
    grid-template-areas:
      "characters"
      "conversation"
      "controls";
  }
}
```

360×480 作为 stacked qualification viewport。

# 8. Visual density / spacing baseline

v1.1 使用统一紧凑 spacing scale：

```text
4 / 8 / 12 / 16
```

第一版固定 baseline：

```text
modal padding                 = 16px
characters padding            = 4px 12px 4px 0
conversation top/left         = 2px / 8px
speaker bottom padding        = 8px
body padding                  = 10px 4px 6px 0
choice list top margin        = 12px
choice row padding            = 8px 12px
controls host top             = 8px
control hints internal top    = 8px
history header bottom         = 8px
history scroll top            = 8px
history entry vertical        = 10px / 12px
```

这些值可以在 implementation PR 中因真实 geometry 做 ±2px 的小调整，但如果超出该范围或重新回到现有宽松密度，需要更新本文，而不是 Agent 自行发散。

## 8.1 Modal geometry

不要求为了“紧凑”大幅缩小 modal。v1.1 主要通过减少内部空白增加有效内容面积。

第一版保持：

```text
width  = min(88vw, 960px)
height = min(68vh, 520px)
```

这样降低 layout 风险，同时修掉真正的 padding 浪费。

# 9. Character stage visual weight

人物 stage 继续存在，但降低“card inside card”感觉。

固定：

```text
stage remains a stable pane
background contrast softer than current
no extra border
radius <= modal radius - 4px
sprite remains centered
```

sprite visual scale 从当前约 55% stage height 提高到：

```text
70% stage height target
acceptable qualification band: 68%–72%
```

同时：

```text
max-width 仍限制在 pane 内
max-height 不得溢出
aspect ratio preserved
image-rendering: pixelated
canvas intrinsic frame remains 32×48 for Professor
```

# 10. Controls visual weight

canonical 五个 hint 继续全部存在，semantic contract 不变。

v1.1 只改视觉：

```text
controls region geometry remains stable
enabled hint readable
disabled hint visually quieter
READY does not collapse controls row
```

disabled opacity 建议：

```text
0.16–0.20
```

不得只因为 disabled 就从 canonical DOM 删除 hint。

不得显示 `Enter` / `ArrowUp` / Gamepad glyph 等 physical binding。

# 11. Accessibility / inert boundary

ACTIVE：

```text
shell visible
view/modal interactive according to existing semantics
```

intermediate READY：

```text
shell visible
view/modal inert
controls aria-disabled reflect canonical facts
Conversation reveal paused
```

History：

```text
shell visible
history is active content
character/conversation layout+a11y hidden
```

initial READY before first ACTIVE：

```text
shell hidden
inert
not exposed as an empty modal
```

Domain close：

```text
view removed
no retained hidden shell outside domain lifetime
```

# 12. Explicit non-goals

本文不实现：

```text
Conversation ↑/↓ text scrolling
RPGDialogue control routing changes
new semantic actions
RPGDialogue public API changes
Frame / Call changes
Render ABI changes
PokeMan gameplay subsystem changes
Dialogue graph / Story changes
physical key hints
pointer/touch gameplay authority
new portrait asset system
```

# 13. Implementation landing

实现 PR 优先只修改：

```text
examples/PokeMan/presentation/dialogue.browser.js
examples/PokeMan/presentation/dialogue.css
examples/PokeMan/test/dialogue-presentation.browser.test.mjs
```

由于 source 与 FSDB Presentation 必须保持一致，还应通过现有：

```text
examples/PokeMan/scripts/sync-map-presentation.mjs
```

同步：

```text
[FSDB]PokeMan/[resource]Presentation/dialogue/dialogue.browser.js.js
[FSDB]PokeMan/[resource]Presentation/dialogue/dialogue.css.css
```

只有真实 closed-loop 产品 qualification 需要时，才扩：

```text
apps/pwa/test/pokeman-map.e2e.test.mjs
apps/pwa/test/pokeman-staging.e2e.test.mjs
```

不得修改：

```text
game-libs/rpg-dialogue Runtime / public API
packages/subsystem
packages/main
common-controls
PokeMan subsystems/dialogue.mjs
PokeMan subsystems/map.mjs
```

除非发现与本文目标直接相关、可复现、且 Presentation-local 无法修复的 framework correctness bug；遇到这种情况应先停止并更新设计，而不是顺手扩大实现范围。

# 14. Required browser qualification

`examples/PokeMan/test/dialogue-presentation.browser.test.mjs` 至少新增/修改以下证明。

## 14.1 Initial READY remains hidden

```text
fresh view
five hints complete + all false
shellPresented has never latched
→ modal hidden
→ backdrop hidden
```

防止 first-connect flash。

## 14.2 ACTIVE → READY continuity

```text
first ACTIVE
→ modal visible

all hints become false
→ modal still visible
→ backdrop still visible
→ view inert
→ conversation interaction inactive
→ modal rect unchanged
→ character stage rect unchanged
```

并等待至少一个 reveal interval，证明 READY 不后台推进 reveal。

## 14.3 READY → next ACTIVE continuity

模拟下一 `conversation-id` / text 更新并重新 enabled controls：

```text
same lr-dialogue-view
same modal
same character element/key when character unchanged
same outer rect
new reveal state resets
shell never hidden during transition
```

测试应通过同步 observation / MutationObserver 记录 `hidden` attribute 变化，证明不是“最终又 visible”而是中间从未 flash hidden。

## 14.4 Sprite idempotence

同一 exact sprite ref 重复 `receiveRenderData()`：

```text
resource acquisition count remains 1
ready canvas remains visible
fallback does not reappear
```

ref/contentVersion 改变时才触发新 acquisition。

## 14.5 Layout geometry

至少验证：

```text
1280×720 → horizontal, ~30/70
800×600  → horizontal, ~30/70
640×480  → horizontal, ~30/70
360×480  → stacked
```

并继续验证：

```text
no active character → single full-width conversation
History → full-width history
modal always inside viewport
choice rows not clipped
```

## 14.6 Density

对 computed geometry 做稳定断言，而不是 screenshot-only：

```text
modal padding ≈ 16px
character/content effective gap substantially below old ~38px
body / controls padding match compact baseline
Professor sprite rendered height / stage height within 0.68–0.72
```

# 15. Product E2E qualification

建议扩现有真实 PWA E2E，至少对 Professor A→B→C 增加 continuity observation：

```text
open A
→ install observer on lr-dialogue-view modal/backdrop hidden state
→ complete A
→ wait B
→ assert no hidden=true transition

choose ready/not-yet
→ complete B
→ wait C
→ assert no hidden=true transition

complete/cancel final C
→ Dialogue element/domain finally disappears
```

同时验证：

```text
same lr-map-view stays mounted
Dialogue still overlays Map
History full-width behavior unchanged
second interaction creates fresh new Dialogue session
```

本优化不要求为视觉调整新建第二套 E2E harness。

# 16. Required commands

实现后至少运行：

```text
npm test -w @loomrealm-example/pokeman
npm run test:rpg-dialogue
npm run build:qualification -w @loomrealm/pwa
npm run test:unit -w @loomrealm/pwa
node apps/pwa/scripts/run-e2e.mjs m17
npm run build:staging -w @loomrealm/pwa
node apps/pwa/scripts/run-e2e.mjs staging
```

如果实现时仓库脚本已变化，使用当前真实等价命令并在 PR 中报告 exact command；不得引用不存在的 script。

# 17. Exit criteria

```text
[ ] #118 的 continuity/layout/density scope 全部覆盖
[ ] initial READY still hidden
[ ] first ACTIVE opens shell once
[ ] A→READY does not hide modal/backdrop
[ ] READY remains inert
[ ] READY does not advance reveal in background
[ ] READY→B keeps same shell geometry
[ ] B→READY→C keeps same shell geometry
[ ] final domain close removes Dialogue shell
[ ] same sprite ref does not reload/fallback flash
[ ] 1280×720 horizontal ~30/70
[ ] 800×600 horizontal ~30/70
[ ] 640×480 horizontal ~30/70
[ ] 360×480 stacked
[ ] no active character remains full-width Conversation
[ ] History remains full width
[ ] compact spacing baseline landed
[ ] character/content gap substantially reduced
[ ] Professor sprite stage ratio 68–72%
[ ] semantic control hints unchanged
[ ] reveal/choice/history behavior unchanged
[ ] source/FSDB Presentation exact sync preserved
[ ] no RPGDialogue Runtime/public API change
[ ] no Frame/Render ABI change
[ ] no PokeMan gameplay subsystem change
[ ] focused browser qualification passes
[ ] real PWA Professor continuity path passes
[ ] staging regression passes
```

# 18. What this proves

完成后，PokeMan Dialogue Presentation 将证明：

```text
one Dialogue session
→ one visually continuous shell
→ stable character pane
→ atomic Conversation changes
→ compact game-oriented layout
→ no READY flash
```

同时保持：

```text
Runtime lifecycle authority unchanged
canonical Presentation ABI unchanged
gameplay child-Frame architecture unchanged
History / Choice / Reveal semantics unchanged
```

这是一项 Presentation UX contract 修正，不是 Dialogue Runtime v2。