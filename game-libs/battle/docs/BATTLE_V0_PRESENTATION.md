# Battle v0 Presentation 设计

> 状态：**Design only / Presentation 草案**。
>
> 本文专门描述 Battle Presentation 的模块边界、LoomRealm Subsystem 接入方式、实例生命周期、并发模型和建议接口。
>
> - gameplay/runtime 权威语义仍以 [BATTLE_V0_SPEC.md](./BATTLE_V0_SPEC.md) 为准；
> - 数据字段的最终 Schema 仍以 [BATTLE_V0_CONTRACTS.md](./BATTLE_V0_CONTRACTS.md) 为准；
> - 本文中的 exact TypeScript method/type shape 在 `CONTRACT-OPEN-003` 冻结前属于推荐设计，不覆盖已有 FROZEN Rule。

## 1. 目标

Presentation 的职责只有一句话：

> **把 Simulation 已经决定的视觉事实翻译成 LoomRealm RenderDomain / Browser 表现。**

Presentation 不解释 Battle Rule，不决定 gameplay transition。

因此它可以决定：

- Map/Tileset/Autotile 怎样画；
- Actor Sprite 怎样显示；
- committed move step 怎样插值；
- HP、死亡、技能效果怎样表现；
- camera、viewport、layout 怎样变化；
- Browser resource / animation 生命周期如何清理。

它不得决定：

- Actor 是否可以移动；
- damaging hit 是否中断 move；
- HP 应扣多少；
- Actor 是否死亡；
- protection / recovery / generation 是否变化；
- skill 是 hit / immune / miss / invalid；
- BattleResult。

这些事实必须先由 Simulation 决定，再进入 Presentation。

## 2. 参考现有 Map 包的工程模式

Battle Presentation 应优先沿用已经实现的 `game-libs/map` 工程惯例，而不是另建一套渲染基础设施。

Map 当前的核心形态是：

```text
@loomrealm-game/map
    │
    ├─ RPGMapBuilder(scope, frame)
    │        ↓
    │   RPGMapHandler
    │
    ├─ map-owned Runtime
    │        ↓
    │   RenderDomain
    │
    └─ browser/map.browser.js + map.css
         lr-map-view
         lr-map-sprite
```

Battle 不复用 RPGMap Runtime，但复用这套**模块接入方式**：

- game-lib 可以直接依赖 `@loomrealm/subsystem`；
- Builder/Handler 接收现有 `SubsystemScope / Frame`；
- game-lib 内部使用 `scope.content`、`scope.viewport`、`scope.createRenderDomain()`；
- Browser 表现继续通过 game-lib 自带 browser assets/custom elements；
- Presentation 对上只暴露 Battle 语义，不向 Simulation 暴露 `RenderDomain` / DOM。

## 3. 模块与 Session 生命周期

必须区分“长期复用的 Battle 库”与“一场 Battle 的 session”。

### 3.1 长期复用

以下对象/代码可以跨多场 Battle 复用：

```text
@loomrealm-game/battle package
SubsystemScope
ContentClient / content cache
Renderer infrastructure
Browser custom element definitions
battle.browser.js / battle.css
Builder / factory class definitions
```

### 3.2 每场 Battle 独立

每一场 Battle 创建独立 session：

```text
BattleSession
├─ Simulation Runtime
├─ Decision session
├─ PresentationHandler
├─ RenderDomain
├─ scheduler / event queue
├─ Battle state
├─ visual state
└─ session cancellation authority
```

一个已经 `close()` 的 PresentationHandler 不重新 `initialize()` 承载下一场 Battle。

新的 Battle 创建新的 Handler。

这样避免上一场残留的：

- RenderDomain；
- viewport subscription；
- `sceneEpoch / visualEpoch / motionId`；
- transient effect state；
- animation/timer；
- resource Promise；
- stale Browser completion；

污染下一场 Battle。

## 4. 并发模型

“每场 Battle 一个实例”不是并发限制，反而是并发基础。

同一个 Battle library / Subsystem environment 可以同时持有多个互不共享可变状态的 session：

```text
Battle environment
    │
    ├─ Battle A
    │    ├─ Simulation A
    │    ├─ Decision A
    │    ├─ Presentation A
    │    └─ RenderDomain A
    │
    └─ Battle B
         ├─ Simulation B
         ├─ Decision B
         ├─ Presentation B
         └─ RenderDomain B
```

因此实现禁止 package-global：

```text
currentBattle
currentDomain
currentProjection
currentMotionId
```

这类单例可变状态。

所有 session-local 状态必须保存在各自实例内。

### 4.1 同时运行与同时可见不是同一个问题

多个 Battle Runtime 同时运行不要求多个 Battle 同时显示。

如果产品要在一个 viewport 同时显示多场 Battle，例如：

```text
┌──────────────┬──────────────┐
│   Battle A   │   Battle B   │
└──────────────┴──────────────┘
```

则还需要额外的 viewport region / mount rect / layout ownership 设计。

当前 `SubsystemScope.viewport` 只描述整个 viewport；本文不自行假设已有 sub-viewport API。

因此：

- **多 Battle session 并发**：Presentation 设计本身支持；
- **多 Battle 同屏布局**：独立的 Integration/UI OPEN，不通过共享一个 PresentationHandler 解决。

## 5. 建议的导出形态

Battle 三层独立导出时，Presentation 模块概念上提供：

```ts
import {
  BattlePresentationBuilder,
  type BattlePresentationHandler,
} from "@loomrealm-game/battle/presentation"
```

Builder 参考 Map：

```ts
export class BattlePresentationBuilder {
  constructor(
    scope: SubsystemScope,
    frame: Frame,
  )

  build(): BattlePresentationHandler
}
```

建议一个 Builder 对应一个 session build；需要第二场 Battle 时创建新的 Builder/Handler。

这不会限制并发，因为不同 Builder/Handler 可以同时存在。

## 6. 建议的最小 Handler 接口

```ts
export interface BattlePresentationHandler {
  initialize(
    scene: BattleSceneInit,
  ): Promise<void>

  render(
    projection: RenderProjection,
  ): void

  pause(): void

  resume(): void

  close(): void
}
```

语义：

- `initialize()`：一次性建立本场 Battle 的视觉 Scene；
- `render()`：正常运行期唯一主要入口，只表现 Simulation 已决定的视觉事实；
- `pause()/resume()`：冻结/恢复视觉时间，不产生任何 Battle Rule；
- `close()`：终止本 session 的视觉生命周期并释放 RenderDomain/resource/listener。

在最终 API 冻结前，`render` 也可以最终命名为 `apply`，`close` 也可以最终命名为 `dispose`；本文关注的是职责与生命周期，而不是提前覆盖 `CONTRACT-OPEN-003`。

## 7. initialize(scene)

建议初始输入只包含建立画面所需事实。

概念：

```ts
type BattleSceneInit = {
  battleId: string
  sceneEpoch: number
  tickDurationMs: number
  map: MapRef
  actors: readonly BattleActorRenderInit[]
}

type BattleActorRenderInit = {
  actorId: string
  team: "ally" | "enemy"
  character: ResourceRef
  tile: GridPosition
  direction: Direction
  hp: number
  maxHp: number
}
```

不进入 Scene Init 的 Simulation 内部字段包括：

```text
acceptedPlanId
decisionGeneration
actionGeneration
reservation
battleSeed
PlanConstraints
minCoefficient
```

### 7.1 初始化内部流程

参考 Map：

```text
initialize(scene)
    ↓
scope.content: Map / Tileset / Autotile / Character resources
    ↓
scope.viewport: initial layout
    ↓
buildInitialRenderState()
    ↓
scope.createRenderDomain(initial)
    ↓
subscribe viewport
```

`initialize()` 可以异步，因为资源准备天然可能异步。

正常设计是 Presentation 初始化完成后，Simulation 才启动本场 Battle clock；Battle 已运行后，不得等待 Browser 动画完成来推进 gameplay。

## 8. render(projection)

`render()` 是正常运行阶段唯一主要入口。

概念 Projection：

```ts
type RenderProjection = {
  sceneEpoch: number
  visualEpoch: number
  tick: number

  actors: readonly ActorRenderProjection[]
  effects: readonly SkillEffectProjection[]

  focusHint?: CameraFocusHint
}
```

Actor：

```ts
type ActorRenderProjection = {
  actorId: string

  tile: GridPosition
  direction: Direction

  hp: number
  maxHp: number
  life: "alive" | "dead"

  movement?: MovementProjection
}
```

Movement：

```ts
type MovementProjection = {
  motionId: number

  from: GridPosition
  to: GridPosition

  startTick: number
  completeTick: number
}
```

Effect：

```ts
type SkillEffectProjection = {
  effectId: string
  effect: string

  result:
    | "hit"
    | "immune"
    | "miss"
    | "invalid"

  tile?: GridPosition
  startTick: number
}
```

exact shape 仍由 Contracts 冻结。

### 8.1 RenderDomain 转换

内部路径：

```text
Simulation
    ↓ RenderProjection
BattlePresentationHandler.render()
    ↓
Battle-specific projection/reconciliation
    ↓
RenderDomainState / RenderDomainUpdate
    ↓
RenderDomain
    ↓
Browser renderer / lr-battle-*
```

Simulation 不直接接触：

```text
RenderDomain
RenderNode
domain.update()
domain.replace()
DOM
custom elements
```

## 9. Simulation 操作如何映射 Presentation

原则：

> Simulation 先完成规则，再发布已经归约好的视觉事实。

| Simulation 已决定的事实 | Presentation 输入 | Presentation 行为 |
| --- | --- | --- |
| Battle 初始化 | `initialize(scene)` | 建立地图、Actor、HUD 等初始视图 |
| Actor 原地 turn | 新 Projection 的 `direction` 改变 | 更新 Sprite 朝向 |
| `move_start` | committed `tile=origin` + `movement={from,to,...}` | 开始视觉插值 |
| movement 进行中 | 同一 `motionId` 仍存在 | 继续视觉插值 |
| `move_complete` | `tile=destination`，`movement` 消失 | 收敛到 destination |
| move 被规则中断 | Simulation 已保留 origin；新 Projection 中 `movement` 消失 | 终止旧 visual motion 并收敛到当前 Projection |
| HP 改变 | `hp` 改变 | 更新 HP 表现 |
| Actor 死亡 | `life="dead"` | 表现死亡状态 |
| skill resolve | 新的 `SkillEffectProjection` | 播放对应 transient effect |
| protection/recovery | 如果没有专门视觉，则无 Presentation 字段 | 不做任何额外推导 |
| Battle pause | `pause()` | 冻结插值/effect/camera 的视觉时间 |
| Battle resume | `resume()` | 恢复视觉时间 |
| Battle terminal/cancel | `close()` | 清理本 session |

关键禁止：

```ts
if (damage > 0 && actorIsMoving) {
  cancelMovement()
}
```

这种代码不得存在于 Presentation，因为它重新实现了 `MOVE-007 / HIT-003`。

正确模型是：

```text
Simulation:
  规则已经决定 movement 不再有效
        ↓
Projection:
  movement 不存在
        ↓
Presentation:
  reconcile 到新的视觉事实
```

Presentation 可以看到 HP 改变、movement 消失、hit effect 同时出现，但不得推断三者之间的 gameplay 因果。

## 10. visualEpoch / motionId

Battle Presentation 建议参考 Map 已使用的视觉 fencing 思想，但不能照搬 Map 的“单 player motion”假设。

Scene 级视觉身份：

```text
sceneEpoch
visualEpoch
```

Actor movement identity 则属于各 Actor 自己：

```text
actor A → motionId=17
actor B → motionId=9
```

如果 camera 有独立动画，应使用单独的 camera motion identity，而不是复用某个 Actor 的 `motionId`。

原因是 Battle 允许双方同时行动，同一个 visual epoch 中可能同时存在两个不同 Actor motion、camera motion 和多个 effectId。

这些 identity 的目的不是创建 gameplay generation，而是防止旧视觉工作污染新画面。

例如：

```text
Actor A motionId=17 正在 Browser 插值
        ↓
Simulation 中该 move 已经失效
        ↓
发布更高 visualEpoch；Actor A 新 Projection 不再含 motionId=17
        ↓
Presentation/Browser 旧 motion completion 变成 stale visual fact
        ↓
不得反向提交 Battle 状态
```

因此 Battle 不应设计一个 scene-global `motionId` 来代表整场画面的唯一运动。即使没有 Browser completion callback，scene/visual epoch 与 actor-local motion identity 仍有利于幂等 reconciliation 和测试。

## 11. pause / resume

`TIME-004` 已冻结 Battle clock 在 pause/background 时停止。

Presentation 的 `pause()/resume()` 只负责同步视觉时间：

```text
movement interpolation
BattleEffect animation
camera animation
Presentation-local visual timer
```

它们不修改 Simulation。

推荐 Runtime 调用：

```text
battle.pause()
  ├─ freeze Simulation Battle clock
  └─ presentation.pause()

battle.resume()
  ├─ resume Simulation Battle clock
  └─ presentation.resume()
```

当前公开 `@loomrealm/subsystem` 的 Frame API 尚没有业务层的 suspend/resume callback；Host/Runtime Control 到 Battle `pause()/resume()` 的 exact wiring 仍属于 Integration OPEN。

## 12. close()

`close()` 是 terminal 生命周期操作，建议幂等。

内部至少清理：

```text
viewport subscription
visual timers / RAF
active/transient effects
pending Presentation resource work
RenderDomain.close()
session-local visual state
```

`close()` 后实例不可重新 initialize。

Frame abort / Battle cancel / terminal result / fatal Presentation failure 都最终需要进入 session cleanup，但 BattleResult 与失败语义仍由 Simulation/业务 composition 决定，不由 Presentation 决定。

## 13. 与 Subsystem 的实际联动

建议调用方式直接参考 Map：

```ts
const presentation =
  new BattlePresentationBuilder(
    scope,
    frame,
  ).build()
```

Handler 内部直接使用：

| Subsystem surface | Presentation 用途 |
| --- | --- |
| `scope.content` | Map/Tileset/Autotile/Character/BattleEffect 资源 |
| `scope.viewport` | layout / camera / resize |
| `scope.createRenderDomain()` | 创建本场 RenderDomain |
| `frame.signal` | 本场外部取消/资源读取取消 |
| `scope.createInputListener()` | 默认不属于纯 Presentation；Guidance/ManualDecision 另行接入 |
| `frame.call()` | 默认不属于 Presentation |

Presentation 不需要持有 Simulation 或 Decision concrete instance。

## 14. Render Tree 设计

Battle Render Tree 应把现有 Map 包作为主要工程基线：**一个稳定 Root View、少量长期存在的语义 Child Node、频繁变化放进 node.data、Browser custom element 内部处理 Canvas/DOM/动画。**

现有 Map 的核心树形是：

```text
RenderDomain
└── lr-map-view
    ├── lr-map-sprite
    └── lr-map-sprite ...
```

Battle v0 建议保持同样的稳定树思想：

```text
RenderDomain
└── battle:view
    tag = lr-battle-view
    │
    ├── battle:actor:<allyActorId>
    │   tag = lr-battle-actor
    │
    ├── battle:actor:<enemyActorId>
    │   tag = lr-battle-actor
    │
    ├── battle:effects
    │   tag = lr-battle-effects
    │
    └── battle:hud
        tag = lr-battle-hud
```

v0 确定存在一个**稳定的 Battle HUD logical slot/node**，不再是 optional。本文示例使用 `battle:hud / lr-battle-hud` 表达它，但 exact RenderNode key / custom-element tag 仍由 Presentation Schema 冻结。该 HUD 占用与 Map footer 相同的 footer 几何区域，用于显示双方 Actor 的 `当前 HP / 最大 HP`。HUD 只显示 Simulation 已经决定的 HP 事实，不计算 damage、death 或任何 gameplay transition。

### 14.1 为什么树必须稳定

当前 `@loomrealm/subsystem` 的 `RenderDomain.update()` surface 只支持更新**已有节点**的 attrs/data：

```ts
interface RenderDomainUpdate {
  zIndex?: number
  nodes?: readonly {
    key: string
    attrs?: RenderStringDelta
    data?: RenderDataDelta
  }[]
}
```

结构变化不通过该 `update()` surface 完成；当前 Map 在需要重建结构时使用 `domain.replace(state)`。

因此 Battle 不应把高频 gameplay/visual 变化建模成 Render Tree structural change。例如不建议：

```text
一个 Tile 一个动态 RenderNode
一个 HP bar 一个动态 RenderNode
一个 SkillEffect 一个 RenderNode
一帧动画一个 RenderNode
```

Battle v0 固定两个 Actor、一个 battle view、一个 effects layer，所以整场 Battle 的正常路径应尽量是：

```text
createRenderDomain(initial stable tree)
        ↓
大量 domain.update(...)
        ↓
domain.close()
```

`domain.replace()` 应保留给真正的 Scene/结构重建，而不是 move、damage、turn、skill effect 等普通运行操作。

### 14.2 屏幕适配与 Footer：复用 Map 已实现的几何规则

Battle v0 不再单独发明一套 viewport layout 算法。目标是让 Map → Battle 切换时 tile 尺度、逻辑可视区域、缩放方式和 footer 高度保持一致。

当前 Map Runtime 实际用于 Presentation layout 的核心是 `calculateLayout(width, height)`：

```text
tileSize = 32

barHeight:
  height < 480  → 24
  height < 720  → 32
  otherwise     → 48

contentWidth  = windowWidth
contentHeight = windowHeight - barHeight

rawColumns = ceil(contentWidth / 32)
rawRows    = ceil(contentHeight / 32)

rows = clamp(rawRows, 14, 33)

columns =
  rawRows < 14 || rawRows > 33
    ? max(1, round(rows * contentWidth / contentHeight))
    : rawColumns

logicalWidth  = columns * 32
logicalHeight = rows * 32

scaleX = contentWidth / logicalWidth
scaleY = contentHeight / logicalHeight
```

Map 的 `semantics.ts` 另外定义并测试了：

```text
DEFAULT_VIEWPORT = 640 × 480
MIN_VIEWPORT     = 320 × 240
MAX_VIEWPORT     = 1920 × 1080
clampViewport(...)
```

但**当前 Map Runtime 的 `layoutFromViewport()` 并不会先调用 `clampViewport()`**；它把 `SubsystemScope.viewport` 提供的正整数宽高直接传给 `calculateLayout()`。因此 Battle 文档不能把上述 clamp/default/min/max 描述成当前 Map Presentation Runtime 已经统一执行的入口规则。

Battle v0 当前冻结的是：

- 复用 Map 的 32×32 tile；
- 复用 `calculateLayout` 的 `barHeight` breakpoint；
- 复用 `contentWidth / contentHeight`；
- 复用 `minRows=14 / maxRows=33`；
- 复用 columns/rows 计算；
- 复用 `logicalWidth / logicalHeight`；
- 复用 `scaleX / scaleY`；
- Browser logical world 到实际 viewport 的缩放语义。

**viewport clamp/default/min/max 是否成为 Map/Battle 共用的 Presentation 入口规则仍需单独明确。** 如果未来决定共用，应优先让 Map 与 Battle 通过同一个 shared viewport normalization primitive 实现，而不是只让 Battle 单方面调用 `clampViewport()`。

Battle 不应另行发明另一套 responsive breakpoint 或 logical grid 算法。

#### Resize settlement 必须对齐 Map 实际 Runtime 语义

Map 当前的 resize 行为不是简单的“所有 viewport resize 都 debounce 100 ms”。

实际语义包括：

- 首次可接受 layout / 尚未进入 settled resize 状态时，可以立即 commit；
- 已进入 settled resize 状态后，普通连续 resize 使用 `RESIZE_SETTLE_MS = 100`；
- active move、Map transition、NPC setting 等 operation busy 状态会推迟 layout commit；
- pending layout 可以在 operation 结束后的安全 commit 点被提交；
- 相同 layout 不重复发布；
- resize commit 会产生新的 visual epoch，并同步更新相关 visual data。

Battle 没有 RPGMap transition / NPC setting 这些具体状态，因此不能机械复制 Map Runtime 状态机；但应复用其**核心 settlement 原则**：

```text
viewport change
→ 记录 latest/pending layout
→ 避免在不安全的 visual transition 中途撕裂画面
→ settled 连续 resize 使用 100 ms settle window
→ 到安全 commit 点原子发布一组一致 visualEpoch 的 layout/camera/HUD/actor visual facts
```

实现阶段如果抽出共享 resize primitive，应以 Map 当前实际 Runtime 行为为基线；如果 Battle 保持独立实现，则测试应验证等价的 settlement properties，而不是只断言“等待 100 ms”。

### 14.2.1 Footer 的 Battle 内容

Map 的 footer 目前由 `lr-map-view` 自己在 Shadow DOM 中实现，并不是独立 RenderDomain node。Battle **只复用相同的 footer 几何/layout policy**，而采用自己的稳定逻辑 HUD node/slot 来承载 Battle HUD 内容：

```text
┌────────────────────────────────────┐
│                                    │
│          Battle battlefield        │
│                                    │
├────────────────────────────────────┤
│ Ally  87 / 100       Enemy 42 / 80 │
└────────────────────────────────────┘
                ↑
          same barHeight
```

因此 Battle battlefield 的可绘制 content 区域与 Map 一样：

```text
contentHeight = viewportHeight - barHeight
```

`lr-battle-hud` 只负责显示双方：

```text
current HP / max HP
```

概念 data：

```ts
type BattleHudRenderData = {
  sceneEpoch: number
  visualEpoch: number

  actors: readonly [
    {
      actorId: string
      side: "ally"
      hp: number
      maxHp: number
    },
    {
      actorId: string
      side: "enemy"
      hp: number
      maxHp: number
    },
  ]
}
```

exact field naming 仍由 Contracts/Presentation Schema 冻结，但以下 v0 Presentation 语义已经确定：

- 存在一个稳定的 Battle HUD visual slot/node；
- 它占用与 Map 相同的 footer 几何区域；
- 它显示双方 current/max HP；
- 它不复用 Map footer 的 RPGMap-specific data contract。

逻辑 HUD slot/node 已确定；最终 Browser custom-element tag、RenderNode key 细节和 node data exact Schema 仍保持 OPEN。

HP 更新应与本次 visual commit 的其他节点使用同一个 `visualEpoch`。Browser HUD 不根据 HP 数值推导 damage、death、protection 或 interruption。

### 14.2.2 已完成的 Presentation 实现前置：共享 Tile Presentation primitive

已从现有 Map 中抽取与 RPGMap gameplay 无关的纯视觉 primitive，形成独立 game-lib：

```text
game-libs/tile-presentation
@loomrealm-game/tile-presentation
```

依赖方向固定为：

```text
@loomrealm-game/tile-presentation
        ↑                     ↑
        │                     │
@loomrealm-game/map   @loomrealm-game/battle
```

Battle 不通过依赖 `@loomrealm-game/map` 来获得这些能力。

第一阶段只抽**纯函数、纯数据和无业务状态常量**，至少包括：

```text
TileViewportLayout
TILE_SIZE_PX = 32
calculateTileViewportLayout(width, height)
tileViewportLayoutsEqual(a, b)
RESIZE_SETTLE_MS = 100
```

如果同时决定把 viewport normalization 正式统一，再由同一 package 提供：

```text
normalizeTileViewport(size)
DEFAULT_VIEWPORT
MIN_VIEWPORT
MAX_VIEWPORT
```

但在该行为真正接入 Map Runtime 并通过 Map regression tests 前，不得把它描述成既有 Map Runtime 的当前语义。

共享 package **不得**包含：

```text
RenderDomain
SubsystemScope
Frame
Map camera policy
Battle camera policy
RPGMap movement / Transfer / Bridge / NPC
Battle movement / damage / skill / HP rule
Decision
Presentation session lifecycle
resize safe-commit state machine
```

其中 resize 的 `100 ms` constant 可以共享，但“什么时候可以安全 commit pending layout”仍由 Map/Battle 各自的 Presentation/session lifecycle 决定。

已完成的迁移顺序：

```text
1. 已建立 @loomrealm-game/tile-presentation
2. 已从 Map 搬迁已验证的纯 layout/tile primitive
3. Map 已改为 import shared package
4. Map 原有 layout/runtime regression tests 保持覆盖
5. Battle Presentation 实现时直接 import 同一 package
```

这样 Map 与 Battle 不需要长期维护两份 layout algorithm，也不需要把 parity test 当成防漂移的主要机制；两边直接消费同一个 implementation。

当前 shared implementation 的事实基线是 **Map Runtime 原先实际调用的 `calculateLayout(width, height)` 行为**，而不是尚未接入 Runtime 的 `clampViewport()` helper。此次迁移没有启用 viewport clamp，也没有修改 Map resize safe-commit lifecycle。

### 14.2.3 Camera 不属于这次“完全复用”

复用的是 **layout/footer/scale 的几何 policy**，以及实现时应与 Map 对齐的 resize settlement semantics；不是 Map 的单 Player camera policy，也不是当前尚未统一接入 Runtime 的 viewport clamp helper。

Map camera 以单个 Player 为中心；Battle 同时有两个 Actor，因此 Battle camera/focus 仍由 Battle Presentation 单独设计，例如双 Actor framing。Camera 不得因为复用 Map layout 而隐式跟随 ally。

### 14.3 lr-battle-view

`lr-battle-view` 对应 Map 的 `lr-map-view` 职责域，负责：

```text
Map / Tileset / Autotile
viewport geometry
Map-compatible footer/content geometry
logical coordinate space
scale
camera
tile layer/depth
child visual container
```

概念 data：

```ts
type BattleViewRenderData = {
  sceneEpoch: number
  visualEpoch: number

  viewportWidth: number
  viewportHeight: number

  barHeight: number
  contentWidth: number
  contentHeight: number

  columns: number
  rows: number
  logicalWidth: number
  logicalHeight: number
  scaleX: number
  scaleY: number

  mapWidth: number
  mapHeight: number

  cameraX: number
  cameraY: number

  tileset: ResourceRef
  autotiles: readonly (ResourceRef | null)[]
  tiles: readonly TileTuple[]
}
```

Battle 可以复用/抽取 Map 已验证的纯视觉概念，例如 32×32 tile geometry、Tileset/Autotile projection、resource identity、pixelated rendering、viewport scaling；不得因此复用 RPGMap movement/Transfer/Bridge/Event authority。

### 14.4 lr-battle-actor

v0 固定两个 Actor，因此两个 actor node 从初始化到 close 都保持稳定。

概念 data：

```ts
type BattleActorRenderData = {
  sceneEpoch: number
  visualEpoch: number

  actorId: string

  tileX: number
  tileY: number

  screenX: number
  screenY: number

  direction: Direction
  pattern: Pattern

  sprite: ResourceRef

  life: "alive" | "dead"

  motion: BattleActorMotion | null
}

type BattleActorMotion = {
  id: number
  fromScreenX: number
  fromScreenY: number
  durationMs: number
}
```

exact field shape 仍是 OPEN。

Browser actor element 内部可以负责：

- Character 4×4 atlas crop；
- screen position；
- movement interpolation；
- walking pattern；
- direction；
- actor-local death/pose visual。

双方 `hp / maxHp` 的标准 v0 显示位置是固定 `lr-battle-hud` footer；Actor node 不需要为了 footer 再复制一份 HP display state。

它不能根据 damage/effect 自己决定 gameplay movement 是否中断。

### 14.5 lr-battle-effects

技能/受击等 transient visual 不建议“一次 effect 一个 RenderNode”。

建议整场 Battle 固定一个：

```text
battle:effects
tag = lr-battle-effects
```

其 data 携带当前需要接收的 effect facts：

```ts
type BattleEffectsRenderData = {
  sceneEpoch: number
  visualEpoch: number

  effects: readonly {
    effectId: string
    effect: string
    result: SkillResolveResult
    tile?: GridPosition
    startTick: number
  }[]
}
```

Browser element 内部可维护：

```ts
Map<effectId, ActiveVisualEffect>
```

行为：

```text
新的 effectId
→ 创建 visual effect

已接受过的 effectId
→ 不重复播放

视觉生命周期结束
→ 清理 Browser 内部 canvas/div/resource
```

这属于 Presentation-local transient lifecycle，不要求改变 Render Tree，也不产生 Battle ACK。

`effectId` 必须足够稳定，使相同 Projection 重复 render 时不会重复生成同一次 effect。

### 14.6 普通 Battle 操作只更新 data

例如双方同时开始移动，Tree 不变，只更新同一 visual epoch 下的节点 data：

```ts
domain.update({
  nodes: [
    {
      key: "battle:view",
      data: {
        set: {
          visualEpoch: 12,
        },
      },
    },
    {
      key: "battle:actor:ally",
      data: {
        set: {
          visualEpoch: 12,
          direction: 6,
          motion: allyMotion,
        },
      },
    },
    {
      key: "battle:actor:enemy",
      data: {
        set: {
          visualEpoch: 12,
          direction: 4,
          motion: enemyMotion,
        },
      },
    },
    {
      key: "battle:effects",
      data: {
        set: {
          visualEpoch: 12,
        },
      },
    },
    {
      key: "battle:hud",
      data: {
        set: {
          visualEpoch: 12,
        },
      },
    },
  ],
})
```

这里两个 Actor 可以拥有不同的 actor-local `motion.id`。

`move_complete`、turn、HP change、death、move interruption 同样都应该优先表现为 node.data transition，而不是 remove/insert Actor node。

### 14.7 move interruption 的 Tree 行为

当 Simulation 已经根据 Core Rule 决定 move 失效时，Render Tree 不发生结构变化：

```text
before:
  actor node
    tile = origin
    motion = motionId 17

after:
  same actor node
    tile = origin
    motion = null

  same hud node
    actor hp = newHp
```

如果同 Tick 还有受击特效，则同一 visual commit 同时更新固定 `battle:effects` 与 `battle:hud` 节点。

Presentation 只执行 visual reconciliation；不得从“damage > 0”推导“所以 motion 应取消”。

### 14.8 sceneEpoch / visualEpoch 一致性

参考 Map 的 Browser fencing，建议一次视觉 commit 涉及的固定节点使用一致的：

```text
sceneEpoch
visualEpoch
```

例如：

```text
battle:view          visualEpoch=57
battle:actor:ally    visualEpoch=57
battle:actor:enemy   visualEpoch=57
battle:effects       visualEpoch=57
battle:hud           visualEpoch=57
```

Browser implementation 可以拒绝/延后组合不一致的候选数据，从而避免同一画面混用不同 visual epoch。

这仍然只是 Presentation consistency，不具有 gameplay commit authority。

### 14.9 Map 可复用边界

可以优先复用或抽取的纯表现能力：

```text
Map viewport clamp/default/min/max
Map calculateLayout policy
Map footer/barHeight geometry
Map resize settlement semantics（100 ms 只是 settled 连续 resize 的参数，不代表全部状态机）
32×32 tile geometry
Tileset projection
Autotile projection
tile depth sorting
resource identity
4×4 Character atlas crop
pixelated rendering
viewport scaling
```

可以参考但 Battle 自己定义：

```text
camera policy
Battle projection window
Actor placement
actor-local concurrent motion
visual epoch policy
effect lifecycle
HUD content/styling
```

不得复用为 Battle authority：

```text
RPGMap movement semantics
bridgeLevel gameplay
Transfer
NPC event logic
MapAction
player input movement
Map Browser motion completion
```

实现阶段如果发现 tile/character rendering primitive 值得共享，应独立抽取公共视觉 primitive；不应为了 Battle v0 强迫重构 Map，也不应让 Battle 直接绑定 `lr-map-view / lr-map-sprite` 的 RPGMap-specific data contract。


## 15. Browser 实现

建议 package 跟随 Map 的 asset 形态：

```text
browser/battle.browser.js
browser/battle.css
```

内部 custom elements 可以概念上是：

```text
lr-battle-view
lr-battle-actor
lr-battle-effects
lr-battle-hud
```

上述 custom-element 名称与 RenderNode key 都是概念示例。v0 已冻结“存在稳定 Battle HUD logical slot/node”这一结构职责，但 exact tag/key、其余 node 结构和 data Schema 仍未冻结。

Battle 不应为了复用代码直接绑定 RPGMap 的 `lr-map-view / lr-map-sprite` Runtime contract；未来如果确实有稳定的通用 tile-map / character-sprite primitive，应独立抽取共享组件。

## 16. 建议的业务组装

业务 Subsystem 只做 composition：

```ts
defineSubsystem((scope) => ({
  async frame(frame) {
    const presentation =
      new BattlePresentationBuilder(
        scope,
        frame,
      ).build()

    const decision =
      new BattleDecisionBuilder(
        scope,
        frame,
      ).build(/* ... */)

    const battle =
      new BattleSimulationBuilder(
        scope,
        frame,
      ).build({
        config,
        decision,
        presentation,
      })

    return await battle.run()
  },
}))
```

这里不应该出现：

```text
setInterval(...)
tick()
moveActor()
damageActor()
interruptMovement()
playEffect()
RenderProjection forwarding loop
```

Battle clock/tick 属于 Simulation；Projection 到 RenderDomain 的翻译属于 Presentation。

## 17. Presentation 实现 Gate

Battle Browser Presentation / RenderDomain implementation 的 shared primitive Gate 已完成：

1. 已创建 `game-libs/tile-presentation` / `@loomrealm-game/tile-presentation`；
2. 已将 Map 验证过的通用 tile viewport layout primitive 迁入该 package；
3. `@loomrealm-game/map` 已改为依赖并使用 shared implementation；
4. Map layout/runtime regression tests 继续作为集成保障；
5. `@loomrealm-game/battle` Presentation 实现时再依赖同一 package。

这是一项**渲染层实现前置任务**，不是 Battle Core gameplay 的前置任务。headless Simulation、DecisionPort 和 frozen-rule deterministic tests 不需要等待它。

该 Gate 已完成；后续仍不应在 Battle package 内复制 Map `calculateLayout` 实现。Battle Presentation 仍是 design-only，尚未实现。

## 18. 最低测试要求

Presentation 可以完全脱离真实 Simulation/Decision 测试。

至少覆盖：

1. synthetic `BattleSceneInit` 可以创建 Map/Actor 初始 RenderDomain；
2. direction 改变只改变 visual direction；
3. movement Projection 创建对应 motion；
4. motion 正常结束后收敛 destination；
5. 新 Projection 取消旧 motion 时只做 visual reconciliation，不执行 gameplay rule；
6. 相同 Projection 重复 render 不重复产生一次性 effect；
7. stale `sceneEpoch / visualEpoch / motionId` 不污染新状态；
8. 与 Map 对相同 viewport 输入产生相同 barHeight/content/rows/columns/logical size/scale；
9. viewport resize 对齐 Map 当前 settlement properties：首次/未 settled 可及时 commit、settled 连续 resize 使用 100 ms window、busy visual transition 期间保留 pending layout 并在安全点提交；不要求 Battle 单方面采用当前未接入 Map Runtime 的 clamp helper；
10. footer 高度与 Map 一致，并持续显示双方 current/max HP；
11. HP Projection 更新在同一 visualEpoch 更新固定 HUD，不改变 Render Tree 结构；
12. pause/resume 冻结并恢复视觉时间；
13. close 幂等，关闭 RenderDomain 并阻止 stale async write；
14. 两个 PresentationHandler 同时存在时 visual/session state 不串场；
15. 正常 move/turn/damage/effect 更新不改变稳定 Render Tree 结构；
16. 两个 Actor 可以在同一 visual epoch 拥有不同 motionId 并同时插值；
17. 重复提交相同 effectId 不重复创建 transient visual；
18. 普通运行路径以 domain.update() 为主，不因 transient effect 频繁 domain.replace()；
19. Null/Recording Presentation 可替换 Browser Presentation，而不改变 Simulation reducer。

## 19. 仍待冻结的 Presentation OPEN

本文不关闭以下现有 OPEN：

- `BattleSceneInit / RenderProjection / SkillEffectProjection` exact Schema；
- `render` vs `apply`、`close` vs `dispose` 等最终 method naming；
- BattleEffect exact anchor/timing/outcome visuals；
- camera `focusHint`；
- Browser node/effect cleanup exact contract；
- Render Tree 各 node 的 exact data Schema 与 Browser custom-element tag/key；稳定的 Battle HUD logical slot/node、Map-compatible footer geometry 与 current/max HP 内容已确定；
- viewport clamp/default/min/max 是否升级为 Map/Battle 共用的 Presentation 入口规则；
- 除首批 layout/tile primitive 外，character-atlas 等纯视觉 primitive 是否继续进入 `@loomrealm-game/tile-presentation`；
- Host/Runtime Control suspend/resume 到 Battle pause/resume 的 exact wiring；
- 多 Battle 同屏时的 viewport region / layout ownership。

这些问题必须在实现前或实现过程中显式冻结，不能由 Browser implementation 隐式定义。
