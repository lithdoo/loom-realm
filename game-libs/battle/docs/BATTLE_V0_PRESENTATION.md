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

Battle Presentation 建议参考 Map 已使用的视觉 fencing 模式：

```text
sceneEpoch
visualEpoch
motionId
```

目的不是创建 gameplay generation，而是防止旧视觉工作污染新画面。

例如：

```text
motionId=17 正在 Browser 插值
        ↓
Simulation 中该 move 已经失效
        ↓
发布更高 visualEpoch，Projection 不再含 motionId=17
        ↓
Presentation/Browser 旧 motion completion 变成 stale visual fact
        ↓
不得反向提交 Battle 状态
```

即使没有 Browser completion callback，epoch/id 也有利于幂等 reconciliation 和测试。

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

## 14. Browser 实现

建议 package 跟随 Map 的 asset 形态：

```text
browser/battle.browser.js
browser/battle.css
```

内部 custom elements 可以概念上是：

```text
lr-battle-view
lr-battle-actor
lr-battle-effect
```

exact tag 与节点结构不在本文冻结。

Battle 不应为了复用代码直接绑定 RPGMap 的 `lr-map-view / lr-map-sprite` Runtime contract；未来如果确实有稳定的通用 tile-map / character-sprite primitive，应独立抽取共享组件。

## 15. 建议的业务组装

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

## 16. 最低测试要求

Presentation 可以完全脱离真实 Simulation/Decision 测试。

至少覆盖：

1. synthetic `BattleSceneInit` 可以创建 Map/Actor 初始 RenderDomain；
2. direction 改变只改变 visual direction；
3. movement Projection 创建对应 motion；
4. motion 正常结束后收敛 destination；
5. 新 Projection 取消旧 motion 时只做 visual reconciliation，不执行 gameplay rule；
6. 相同 Projection 重复 render 不重复产生一次性 effect；
7. stale `sceneEpoch / visualEpoch / motionId` 不污染新状态；
8. viewport resize 只改变 layout/camera；
9. pause/resume 冻结并恢复视觉时间；
10. close 幂等，关闭 RenderDomain 并阻止 stale async write；
11. 两个 PresentationHandler 同时存在时 visual/session state 不串场；
12. Null/Recording Presentation 可替换 Browser Presentation，而不改变 Simulation reducer。

## 17. 仍待冻结的 Presentation OPEN

本文不关闭以下现有 OPEN：

- `BattleSceneInit / RenderProjection / SkillEffectProjection` exact Schema；
- `render` vs `apply`、`close` vs `dispose` 等最终 method naming；
- BattleEffect exact anchor/timing/outcome visuals；
- camera `focusHint`；
- Browser node/effect cleanup exact contract；
- Host/Runtime Control suspend/resume 到 Battle pause/resume 的 exact wiring；
- 多 Battle 同屏时的 viewport region / layout ownership。

这些问题必须在实现前或实现过程中显式冻结，不能由 Browser implementation 隐式定义。
