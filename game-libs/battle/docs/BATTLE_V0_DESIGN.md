# Battle v0：双 Actor 同时行动、200 ms Tick 与事件队列战斗设计

> 状态：**设计草案 / Design only；讨论整理于 2026-09-23。** 本文继续取代 2026-09-22 的传统交替回合旧方案，并进一步取消「复用 RPGMap Runtime」这一前提。
> **范围声明：**这里区分「已形成方向」「建议的 v0 默认方案」「仍待定」。讨论结果不是现有 API、已完成源码、数值冻结或测试通过。
> 优先事项：Battle 自有地图/Actor 运行逻辑、200 ms 离散时间、确定性事件队列、短期 LLM 计划、原子逐格移动、施法、冲突、受击与表现；提示词优化、训练及长期记忆延后。


## 1. 一句话定位与最小闭环

Battle 是一个**独立的双 Actor 战斗系统**，运行时明确拆成三层：**Simulation（行为/规则权威）**、**Presentation（纯表现）**、**Decision（可插拔决策）**。它不运行或调用 RPGMap Runtime，只沿用/兼容 LoomRealm 既有地图与角色素材的组织形式，以及格子、通行、角色朝向、Sprite 等地图角色逻辑概念。Actor 坐标、占位、路径执行、技能和冲突都只由 Simulation 维护权威事实。

我方和敌方两个 Actor **同时**沿各自时间轴思考、移动和施法，不等待对方结束回合。Battle 以 **1 Tick = 200 ms** 作为权威逻辑时间粒度，并维护自己的**事件队列**。LLM 调用、移动完成、技能完成、受击中断、保护到期等都转换为按 Tick 对齐的事件；异步回调本身不能直接修改战斗状态。

最小闭环：加载兼容的地图/素材数据 → 放置两个 Actor → 并发发起各自 LLM/模拟决策 → 把返回结果量化到 Tick 并入队 → Actor 根据短期计划逐格移动 → 计划携带的技能意图达到该计划要求的最低效果系数后停止后续移动并进入前摇 → 前摇到期统一结算 → 进入后摇 → 受阻或受击按规则取消旧计划并重新决策 → 双方持续并发行动，直到一方/双方死亡或战斗被外部终止。

这里的「同时」不是多线程并发写状态，而是**同一个事件调度器在相同逻辑时间批量处理双方事件**。LLM、Promise、Browser 动画和 DOM 都没有权威状态提交权。



## 2. 决策状态：哪些已形成方向，哪些只是建议

| 主题 | 讨论形成的方向 | 状态/边界 |
| --- | --- | --- |
| 架构 | 三层：Simulation / Presentation / Decision；Simulation 是唯一权威，Presentation 只投影，Decision 只提计划 | 实现前冻结规则 |
| 地图/角色素材 | `struct.Map`、`struct.Tileset`、Tileset/Autotile/Character Graphics 沿用现有 RPGMap 内容形式；不复用 RPGMap Runtime | 实现前冻结方向 |
| Battle Actor | 新增角色规则定义：名字、Character 资源、最大 HP、技能组；战斗中当前 HP/坐标/朝向属于 Runtime State | v0 Content 方向 |
| Battle Skill | 新增技能规则定义：范围矩阵、基础伤害、前摇、后摇、效果引用；v0 不设 `tracking` | v0 Content 方向 |
| Battle Effect | 技能视觉效果单独定义并引用 `resource.Graphics/BattleEffects/...`；规则技能与表现素材分离 | v0 Content 方向 |
| 角色 | v0 我方、敌方各一名，均可自主移动及施法，角色占一格 | 产品方向 |
| 并行行动 | 取消传统交替回合，Actor 独立思考、移动、施法 | 已取代旧回合方案 |
| Tick | Battle 逻辑最小单位 200 ms；规则持续时间以整数 Tick 表示，LLM 实际耗时向上量化到 Tick | 产品方向；暂停/恢复策略待定 |
| 事件队列 | 异步结果先登记；只把**相同 dueTick** 的事件视为同时发生。宿主晚醒时必须按逻辑 Tick 逐个补处理，不能把不同 Tick 压成一批 | 实现前冻结规则 |
| 决策 | 一次 LLM 请求返回一段短期计划；每个 Actor 同时最多一个有效 Decision Request | 实现前冻结规则 |
| 路径 | 路径属于计划内容；优先由 Battle 构造当前快照下合法的候选 `planId`，候选显式包含 path，LLM 只选择计划 | 实现前冻结规则 |
| 技能出手阈值 | Skill 矩阵只定义客观合法范围/效果系数；带技能的计划用 `minCoefficient` 表达本次愿意在多高系数时**开始技能**。一旦开始前摇，`minCoefficient` 不再约束最终效果；resolve 使用当时实际 coefficient | v0 计划语义 |
| 单格移动 | 一格是原子动作：起点继续占用、目标格被预约，`move_complete` 时才原子提交到目标格 | 实现前冻结规则 |
| 移动受击 | 已经开始的单格移动继续完成；受击取消的是本格之后尚未开始的后续移动计划 | 实现前冻结规则 |
| 碰撞 | 只预约下一格；同 Tick 争同格统一裁决，失败者结束当前计划并重新决策 | 产品方向；平局算法待定 |
| 单体技能结算 | v0 不锁定命中位置、不设 `tracking`；起手后目标仍可移动，resolve 时按双方最新已提交位置/朝向重新读取范围矩阵。范围内按当时 coefficient 结算，范围外为 `miss` | v0 规则 |
| 技能限制 | v0 **不引入 MP**；以后可按技能选择冷却、次数、能量、弹药等限制形式 | 已明确移除 MP 前提 |
| 受击保护 | 使用半开区间语义 `[hitTick + 1, protectedUntilTickExclusive)`；保护期间允许思考/移动，不能攻击/施法，不受伤、不再次中断、不刷新保护 | 实现前冻结规则 |
| 保护中的攻击计划 | LLM 可返回带攻击意图的计划；保护只禁止 `windup_start`，移动仍可执行，保护结束后按最新战况重新检查是否起手 | 实现前冻结规则 |
| Recovery | recovery 是行动锁而不是思考锁：期间可 Thinking/接收并暂存下一 Plan，但不能开始新的 Action；受到实际造成伤害的 `hit` 时立即中断 recovery，并按正常受击流程重决策 | v0 规则 |
| 系数语义 | range matrix 的正数 coefficient 是确定性的效果倍率，不是命中概率；v0 不因 coefficient 引入随机命中判定 | v0 规则 |
| 生命周期取消 | Frame abort / Battle cancel 属于控制平面，立即失效 Battle authority，不等待下一个 Tick | 实现前冻结规则 |
| 技能视觉 | 结算后只在命中格叠一张贴图，按 Tick 阶段渐显渐隐 | 产品方向；具体 Browser 接口待定 |
| 玩家指导 | 未来四选一指导影响我方下一次 LLM 请求；原型可固定 guidance 或跳过 | 后续交互设计 |

**未冻结的平衡值：**地图大小、一次计划最大移动格数、单格移动 Tick 数、技能范围矩阵/伤害/前摇与后摇 Tick、保护 Tick 数等均需实测。当前明确冻结的是 **200 ms/Tick 的基础时间粒度和上述事件/动作语义**。


## 3. 三层架构、接口与权威归属

Battle v0 采用三个运行层，职责必须单向且可替换：

```text
                 ┌────────────────┐
                 │    Decision    │
                 │ Observation    │
                 │ Legal Plans    │
                 │ LLM / Mock     │
                 └───────┬────────┘
                         │ submit plan
                         ▼
                 ┌────────────────┐
                 │   Simulation   │
                 │ Tick / Queue   │
                 │ Map / Actors   │
                 │ Rules / Result │
                 └───────┬────────┘
                         │ snapshot / events / projection
                         ▼
                 ┌────────────────┐
                 │  Presentation  │
                 │ Map / Sprite   │
                 │ Effect/Camera  │
                 └────────────────┘
```

核心约束是：

> **Decision 决定“想做什么”；Simulation 决定“能不能做、什么时候发生、结果是什么”；Presentation 决定“怎样显示”。**

### 3.1 Simulation Layer（行为层 / 权威规则层）

Simulation 是 Battle 的唯一业务权威。它负责：

- Battle 单调时钟、200 ms Tick、事件队列与确定性归约；
- 地图格子、静态通行、Actor 已提交坐标/朝向、下一格预约；
- 原子单格移动、多格计划执行、冲突裁决；
- 技能起手、前摇、结算、后摇、`hit / immune / miss / invalid`、伤害、死亡；
- 受击中断、保护区间、action/decision generation；
- 合法计划候选、行为提交验证、Battle Result、事件日志与回放事实。

Simulation 接受的是**行为意图/计划提交**，不是 Browser 动画命令。例如：

```ts
submitPlan(actorId, planId)
getLegalPlans(actorId)
getObservation(actorId)
getSnapshot()
subscribeEvents(listener)
cancelBattle()
```

以上只是概念接口，不代表已经冻结 TypeScript ABI。

`submitPlan` 的同步返回只表示“是否接受这份计划进入执行状态”，不能假装立即返回整个未来行为结果。因为一份计划可能跨多个 Tick：

```text
submit
  → move_started
  → move_complete
  → windup_started
  → skill_resolve
  → hit / immune / miss / invalid
  → recovery_started
  → recovery_complete
```

真实结果通过后续权威事件/快照产生。

### 3.2 Presentation Layer（渲染/表现层）

Presentation **与决策无关，也没有战斗规则提交权**。职责包括：

- 地图、Tileset、角色 Sprite 绘制；
- Actor 从起点格到终点格的移动插值动画；
- 技能贴图、透明度时间线、命中/免疫视觉；
- 摄像机跟随、焦点、缩放、Viewport/Layout；
- 资源解析、绘制生命周期和表现清理。

“Presentation 控制角色移动”只表示**播放从 A 到 B 的动画**，不表示它决定角色是否能移动或 Actor 当前权威坐标。即使 Browser 掉帧、动画未完成或资源加载失败，Simulation 的 Tick、位置、伤害和胜负也不能被反向改变。

推荐 Presentation 只接受投影/表现控制，例如：

```ts
applyProjection(projection)
playEffect(effect)
setCamera(command)
resize(viewport)
dispose()
```

Presentation 可以产生 `animationFinished`、`assetFailed`、`viewportChanged` 等表现/诊断事件，但这些默认**不是战斗规则 ACK**。

摄像机是 Presentation 自己的状态。Simulation 只关心地图格子与 Actor 规则位置，不关心 `cameraX / cameraY / zoom`。

### 3.3 Decision Layer（决策层）

Decision 是可拔插的计划生成器。删除或替换 Decision Layer 后，Simulation 仍必须能由测试/脚本/手动提交驱动正常运行。

允许实现包括：

```text
MockDecision
ScriptDecision
ManualDecision
RandomDecision
LLMDecision
```

Decision 的工作流是：

```text
Simulation Observation
    + Legal Plans
    + Recent Events
    + Optional Guidance
      → Prompt / Strategy
      → LLM or other policy
      → choose planId
      → Simulation.submitPlan(...)
```

**Decision 原则上只读取 Simulation 提供的 Observation / Snapshot / Legal Plans，不直接读取 Presentation 的 Sprite、DOM、camera 或动画进度作为战斗事实。**

如果未来 AI 确实需要“可见区域”“角色当前动作”“玩家视野”等视觉相关语义，也应由 Simulation/Observation Builder 用明确字段输出，而不是让 Decision 直接依赖 Render State。这样不会出现“画面插值到 x=2.7，但规则坐标仍在格 2”时 AI 读取到两套冲突事实。

### 3.4 Simulation Snapshot 与 Render Projection 必须分离

至少区分两类数据：

**Battle/Simulation Snapshot：规则事实**

```text
tick
actors[actorId].tile
actors[actorId].hp
actors[actorId].actionState
reservations
protection
battleStatus
```

只有 Simulation 能修改。

**Render Projection：视觉描述**

```text
actorId
fromTile / toTile
animation
startTick / endTick
spriteRef
effects
camera hints?
```

Presentation 消费 Projection 来绘制；不能从插值后的 screen position 反推规则坐标并 reverse-sync 回 Simulation。

### 3.5 Skill 的跨层数据流

技能必须遵循同样的单向边界：

```text
Decision
  → choose attack plan

Simulation
  → windup_started
  → after N ticks: skill_resolve
  → hit / immune / miss / invalid
  → update HP / state
  → recovery_started
  → emit effect projection

Presentation
  → draw skill image / hit visual
```

Decision 不能直接调用 `renderer.fireball(...)`，Presentation 也不能因动画播放完成才通知 Simulation “现在可以扣血”。

### 3.6 Contracts：公共契约，不是第四个运行层

实现时建议提供很薄的公共类型/契约模块，例如：

```text
battle/contracts
  BattleSnapshot
  BattleObservation
  LegalPlan
  PlanSubmission
  PlanAcceptance
  BattleEvent
  RenderProjection
  SkillEffectProjection
```

Simulation、Presentation、Decision 都依赖这些契约，避免三者直接互相引用内部实现。Contracts 只是数据边界，不拥有运行状态，不是第四个业务层。

### 3.7 LoomRealm 框架边界

LoomRealm Main 继续拥有 Session、Activation、InputTarget、Frame 等现有框架权威。一场 Battle 在一个长生命周期 Subsystem Frame 中运行，不改 Hostra/Main 职责。

玩家四选一指导属于外部输入，经受控 InputTarget/业务命令进入 Decision Observation；Browser DOM 不得直接改 Simulation State。


## 4. Content 与素材定义：沿用 RPGMap 基础格式，只新增 Battle 规则内容

Battle **不调用 `RPGMapBuilder`、`RPGMapHandler` 或 RPGMap Runtime 的移动实现**，但 Presentation 尽量直接兼容现有 RPGMap 的 Content/Graphics 形式，避免重复定义地图和 Character 素材格式。

### 4.1 地图、Tileset、Autotile、Character 直接沿用现有形式

v0 不新增 `BattleMap`、`BattleTileset` 或 `BattleActorVisual`。

继续使用现有：

```text
struct.Map
struct.Tileset

resource.Graphics/Tilesets/...
resource.Graphics/Autotiles/...
resource.Graphics/Characters/...
```

当前现有地图/角色视觉约定包括：

- Map 使用现有格子宽高和三层 Tile Table；
- Tileset/Autotile 使用现有 RPGMap 图像布局；
- 基础 Tile 尺寸为 32×32；
- Character Sprite 使用现有 4×4 atlas；
- 方向继续使用 `2 / 4 / 6 / 8`；
- Pattern 继续使用 `0 / 1 / 2 / 3`；
- Graphics 资源仍以 `namespace + key + contentVersion` 作为确定资源身份。

Battle 可以读取这些 Schema/资源并自行实现加载和绘制，但不调用 RPGMap Runtime 来移动角色、计算 Battle Tick、提交位置或处理战斗规则。

RPGMap 的 Transfer、Bridge、探索事件等运行时语义也不会自动进入 Battle；未来若需要，应单独决定哪些语义进入 Simulation。

### 4.2 `struct.BattleActor`：角色静态定义

角色的“战斗规则定义”和“当前战斗实例状态”必须分离。

v0 的角色静态定义建议保持很小：

```json
{
  "id": "mage",
  "name": "Mage",
  "character": {
    "namespace": "resource.Graphics",
    "key": "Characters/Mage"
  },
  "max_hp": 10,
  "skills": ["firebolt", "grab"]
}
```

字段语义：

- `id`：角色定义标识；
- `name`：显示名；
- `character`：直接引用现有 Character Graphics，不新增角色视觉格式；
- `max_hp`：最大 HP；v0 默认开战满血，因此暂不增加独立 `initial_hp`；
- `skills`：该角色可用的 `BattleSkill` id 列表。

以下数据**不属于** `struct.BattleActor`，而属于每场 Battle 的 Actor Runtime State：

```text
actorId
currentHp
x / y
direction
actionState
activePlan
activeStep
protectedUntilTickExclusive
actionGeneration
decisionGeneration
```

其中 `direction` 是 Simulation 权威规则状态，不只是 Sprite 表现，因为技能范围可以依赖朝向。

### 4.3 `struct.BattleSkill`：最小技能规则定义

v0 暂不加入 MP、冷却、暴击、命中率、元素、穿甲、技能次数等未来机制。基础定义只保留：

```text
id
name
range
damage
timing.windup_ticks
timing.recovery_ticks
effect
```

示意：

```json
{
  "id": "grab",
  "name": "抓",
  "range": [
    [0, 1, 0],
    [0, "↑", 0]
  ],
  "damage": 0,
  "timing": {
    "windup_ticks": 0,
    "recovery_ticks": 2
  },
  "effect": "grab"
}
```

这里 `effect` 引用独立的 `struct.BattleEffect`，不直接包含图片和渐隐参数。

### 4.4 技能范围矩阵：一个矩阵同时表达原点、朝向、有效范围和系数

v0 不采用 `origin + rotate_with_facing + mask` 这种多字段结构，也暂不拆分“可选择范围”和“最终影响范围”。

`BattleSkill.range` 就是一张任意 **m×n 规则矩形矩阵**。Content 中所有技能统一按**施法者朝上**定义。

单元格语义：

```text
"↑" = 施法者所在格，同时定义标准朝向为上
0   = 无效区域
> 0 = 有效目标格，同时该数字是效果系数
矩阵之外 = 无效区域
```

例如：

```json
[
  [0, 1, 0],
  [0, 1, 0],
  [0, "↑", 0]
]
```

表示角色朝上时可以作用于正前方两格。

Actor 实际方向改变时，Simulation 根据其 `direction` 旋转整个矩阵：

```text
朝上                  朝右

0 1 0                 0 0 0
0 1 0                 ↑ 1 1
0 ↑ 0                 0 0 0
```

图中的其他方向箭头只用于说明；**Content 中永远只写 `"↑"`**。

矩阵必须满足：

1. 每一行长度相同，构成规则矩形；
2. 必须且只能出现一个 `"↑"`；
3. 其他单元格只能是有限、非负数字；
4. `0` 永远表示无效；
5. 大于 0 的数值表示该格合法，并作为效果系数；
6. 矩阵之外永远无效。

因此普通技能不再需要 `range = 3`、`front_only`、`shape = cone`、`rotate_with_facing` 等字段。

例如只允许正前方一格：

```json
[
  [0, 1, 0],
  [0, "↑", 0]
]
```

例如近处 100%、远处 50%：

```json
[
  [0, 0.5, 0],
  [0, 1,   0],
  [0, "↑", 0]
]
```

如果基础伤害为 10，则系数 1 的格子基础结果为 10，系数 0.5 的格子基础结果为 5。coefficient 是确定性的效果倍率，**不是 100% / 50% 命中概率**。具体整数化/舍入规则仍需冻结。

v0 的统一含义是：

> **技能仍选择一个目标 Actor；目标 Actor 所在格映射到旋转后的 range 矩阵，若对应值大于 0，则该位置在技能规则上合法，该值就是对该目标的确定性效果倍率。是否在这个合法位置开始技能，由当前 Plan 的 `minCoefficient` 决定；技能一旦开始，最终 resolve 不再要求满足 `minCoefficient`，而是读取当时实际 coefficient。**

当前**不增加** `target.type`、`effect.type`、第二张 effect matrix、地面选点或 AOE 结构。以后真的需要“选一个格子再影响周边”“链式目标”“多 Actor AOE”等机制，再通过新的类型/结构扩展，而不是现在预埋。

### 4.5 朝向与移动

Actor 的 `direction` 同时服务于规则和 Presentation：

- Simulation 用它旋转技能范围矩阵；
- Presentation 用它选择 Character Sprite 的方向行。

默认移动方向会更新 Actor 朝向。例如向右完成/开始移动时，Actor 朝向进入右侧方向。是否增加独立 `turn` 行为以及转向需要多少 Tick，目前仍待确认；v0 不允许通过 Presentation 自己旋转 Sprite 来改变规则朝向。


### 4.6 技能时间：规则前摇/后摇与视觉持续时间分离

普通 v0 技能暂不引入独立 `active_ticks`，规则时间简化为：

```text
windup
  → resolve
  → recovery
  → 角色重新可开始正常后续行动
```

因此：

- `windup_ticks`：技能起手到规则结算之间的等待时间；
- `recovery_ticks`：技能结算后的后摇时间；
- 技能特效在屏幕上显示多久**不属于** Skill timing，而属于 Battle Effect 的 Presentation timing。

v0 **不设置 `tracking`**。有前摇并不意味着“锁定目标”：前摇期间目标可以继续移动；resolve 时统一根据 caster/target 的最新已提交格和 caster 当前方向重新读取 range matrix。

`windup_ticks = 0` 表示没有蓄力等待，适合“抓”等即时技能：合法起手后应直接进入该技能的 resolve，不需要额外的 lock/tracking 机制。它在单个 Tick reducer 中与其他同 Tick 技能如何组成统一结算批次，仍需在 Tick 顺序中单独冻结；不能因此允许零时间递归连续 Action。

前摇受到实际造成伤害的 `hit` 时，本次未结算技能取消。

Recovery 的 v0 语义冻结为：

- recovery 是**行动锁，不是思考锁**；
- recovery 期间可以发起/继续 Decision Thinking，也可以接收并暂存已经 ready 的下一 Plan；
- recovery 期间不能开始新的 move / turn / windup 等 Simulation Action；
- 正常情况下到 `recovery_complete` 后才能执行已经准备好的下一 Plan；
- recovery 期间受到实际造成伤害的 `hit` 时，recovery 立即中断，旧计划/旧 Decision generation 按正常受击规则失效，并确保一次新的 Decision；
- `immune` 不造成伤害，因此不会中断 recovery。

### 4.7 `struct.BattleEffect`：独立表现素材

技能效果视觉单独定义，不写进 Skill 规则。

v0 建议新增：

```text
struct.BattleEffect
resource.Graphics/BattleEffects/...
```

最小示意：

```json
{
  "id": "firebolt",
  "image": {
    "namespace": "resource.Graphics",
    "key": "BattleEffects/Firebolt"
  },
  "anchor": "tile-center",
  "timing": {
    "fade_in_ticks": 1,
    "hold_ticks": 2,
    "fade_out_ticks": 1
  }
}
```

第一版只要求单张图片及简单渐入/停留/渐出，不预先加入粒子、Shader、弹道或帧动画系统。

这样同一份视觉效果可以被多个 Skill 复用；修改特效图片或显示时长不会改变 Simulation 的伤害、范围或技能前后摇。

### 4.8 当前 Content 关系

```text
struct.Map / struct.Tileset
        │
        └──────────────→ Presentation

resource.Graphics/Characters/...
        ▲
        │
struct.BattleActor
        │ skills[]
        ▼
struct.BattleSkill
  range matrix
  damage
  windup / recovery
  effect
        │
        ▼
struct.BattleEffect
        │
        ▼
resource.Graphics/BattleEffects/...
```

这里的 Schema 示例仍是设计层概念结构，不代表 Content Schema/TypeScript ABI 已经实现或注册。

## 5. 离散时间与事件队列：200 ms/Tick

Battle 使用固定逻辑粒度 `tickDurationMs = 200`。真实世界的异步操作可以在任意时刻完成，但只能映射到某个确定的逻辑 Tick，并在该 Tick 的统一归约中成为权威事实。

### 5.1 事件队列模型

Battle 维护按 `dueTick` 排序的事件队列。概念字段：

```text
BattleEvent
  eventId
  dueTick
  type
  actorId?
  actionGeneration?
  decisionGeneration?
  payload
```

典型事件包括：

- `decision_ready`：LLM 结果最早可在某 Tick 被接收；
- `move_complete`：某一格原子移动到期；
- `skill_resolve`：技能前摇到期，进入该 Tick 候选命中集合；
- `recovery_complete`：技能后摇到期，Actor 可以离开 recovery 状态；
- 决策服务完成/错误的外部回调可登记状态和完成时刻，但不能直接改 Battle State。

**受击保护不依赖 `protection_expire` 业务事件来决定是否生效。**规则直接用 `protectedUntilTickExclusive` 与当前 Tick 比较，避免同 Tick 的“保护到期事件”和“技能命中事件”产生排序歧义。

Promise/`setTimeout`/网络回调只负责登记完成事实或未来事件，不得直接修改 Actor 坐标、HP、技能和胜负。

### 5.2 积压 Tick 必须逐 Tick 归约

调度器读取单调时钟，计算真实世界已经推进到的目标逻辑 Tick。如果宿主晚醒，例如上一次处理到 Tick 10、当前时钟已经对应 Tick 14，则必须：

```text
while lastProcessedTick < targetTick:
  lastProcessedTick += 1
  processTick(lastProcessedTick)
```

Tick 11、12、13、14 必须保持原有先后关系。**不能把所有 `dueTick <= 14` 的事件压成 Tick 14 的同时事件。**只有具有相同 `dueTick` 的事件才属于同一个逻辑时刻。

是否允许宿主进入“暂停模式”、后台恢复时是继续补 Tick 还是把战斗时钟整体冻结，仍待生命周期设计确认；但一旦选择继续时间，积压 Tick 的归约必须按顺序进行。

### 5.3 时间量化与 LLM 完成

- 规则动作持续时间使用整数 Tick。
- LLM 的真实调用耗时计入战斗。例如从某请求起点起实际耗时 500 ms，则最早在向上对齐后的 600 ms / 3 Tick 边界可用。
- Decision State 记录 `startedAtMonotonicMs`、`completedAtMonotonicMs?`、`deadlineMonotonicMs`、`dueTick?`，而不是依赖 timeout 与 decision-ready 两个回调谁先入队。
- 如果 LLM 恰好在 deadline 完成，使用“`completedAt <= deadline` 即成功”的统一规则；只有完成时刻晚于 deadline 或直到 deadline 仍无完成事实才算 timeout。
- 宿主事件循环晚处理一个已经完成的响应时，决策耗时应依据受信任的实际完成时刻/Adapter 完成时刻映射 Tick，而不是把本地回调被调度到的更晚时间误当成模型思考时间。具体 Adapter 如何提供该完成时刻必须在 LLM 接口设计中冻结。
- 两个 Actor 的 LLM 请求互不暂停战斗；一方 Thinking 时另一方可以移动或施法。
- Browser 可以高帧率插值，但规则只看整数 Tick、整数格和权威事件。
- 调度器必须使用单调时间源，不能靠 `setInterval(200)` 被调用了多少次来累加 Battle 时间。

### 5.4 时间计算示例（平衡参数非定稿）

| 事件 | 样例 |
| --- | --- |
| 单格移动 | 1 Tick（200 ms），仅为样例 |
| 一次计划最大移动 | 3 格，仅为样例；不是 3 次 LLM 调用 |
| 技能前摇 | 3 Tick（600 ms），仅为样例 |
| LLM 实际用时 500 ms | 向上对齐为 3 Tick（600 ms） |
| 技能渐显/停留/渐隐 | 可各 1 Tick，Browser 在阶段内平滑插值 |

不再要求与 RPGMap Runtime 的 250 ms walk duration 对齐；Battle 的动作 Tick 是自身规则。


## 6. Actor 状态、计划、代次与取消

两个 Actor 各自拥有独立状态，不能使用全局 `activeActorId`、`turnNumber` 或「我方回合→敌方回合」循环。

```text
thinking --decision_ready--> moving / windup / idle
moving --move_complete--> [达到 Plan.minCoefficient 且可攻击] windup / [继续] moving / [计划结束] thinking
windup --skill_resolve--> recovery
recovery --recovery_complete--> execute buffered plan / thinking
moving/windup/recovery/thinking --受到实际造成伤害的 hit 且存活--> interrupted → thinking
任意活动状态 --HP 归零--> dead
任意状态 --控制平面取消--> terminated
```

### 6.1 受击保护区间

Actor 使用 `protectedUntilTickExclusive`，按半开区间判断保护：

```text
protected = currentTick < protectedUntilTickExclusive
```

例如 Tick 10 受击并获得 3 个完整保护 Tick，则 Tick 11、12、13 受保护，`protectedUntilTickExclusive = 14`，Tick 14 开始恢复正常。保护规则不依赖“先执行 expire 还是先执行 hit”的事件排序。

### 6.2 代次取消

取消使用代次，不依赖一定能从优先队列物理删除旧事件：

- 每个行动使用 `actionGeneration`；
- 每个 LLM 请求使用 `decisionGeneration`；
- 受击、死亡、明确取消时增加相关代次；
- 旧 `move_complete`、`skill_resolve` 或迟到 LLM 结果即使仍在队列中，到期时发现代次不匹配就丢弃；
- **已开始的原子单格移动是例外：受击不能撤销这一个 `move_complete`；它应使用已经开始的 step token 完成本格提交，受击只使后续路径/计划代次失效。**

### 6.3 每个 Actor 同时最多一个有效 Decision Request

Battle 对外只允许一个统一的 `ensureDecision(actorId, reason)` 语义：

- 当前 generation 已有 pending request 时，不重复创建；
- 计划结束、冲突、非法计划、timeout 等多个原因在同一 Tick 同时发生，也只能得到一个有效请求；
- 受击会先使旧 `decisionGeneration` 失效，再创建且只创建一个新 generation 的请求；
- 迟到旧请求只能记录诊断信息，不能再次启动计划。

Battle 数据概念（非 TypeScript Schema）：

```text
BattleSession
  battleId / battleEpoch / sceneEpoch / stateVersion
  currentTick / tickDurationMs / status
  eventQueue
  map: Battle-owned map state
  actors[actorId]:
    team / hp / skills / actionState
    x / y / facing
    planId / actionGeneration / decisionGeneration / targetActorId
    activeStep? / protectedUntilTickExclusive
  decisions[actorId]:
    requestId / generation / status
    startedAtMonotonicMs / deadlineMonotonicMs
    completedAtMonotonicMs? / dueTick?
  reservations: next-tile claim for each active step
  history: decisions, movements, casts, damage, collision, interruption, protection and results
  result: ally win / enemy win / simultaneous defeat / cancelled / failure
```

v0 不包含 MP 字段。以后若增加技能资源/次数/冷却，应作为明确技能机制加入，而不是预先把所有技能绑定到 MP。


## 7. LLM → 短期计划 → 条件执行

### 7.1 路径属于计划，而不是 Battle 隐式替 AI 决策

路线本身会影响抢位、绕障碍、拉开距离和是否经过危险位置，因此不能只给 LLM 一个 `moveGoal`，再让 Battle 随意挑一条等价路径。

v0 优先采用**合法候选计划集合**：Battle 根据当前快照、地图静态通行和短期移动预算生成有限个候选 `planId`。每个移动候选显式包含 path；LLM 只选择候选，不直接提交任意自然语言路线。

示意：

```json
{
  "id": "plan-17",
  "targetActorId": "enemy",
  "path": [[2,2], [3,2], [4,2]],
  "skillId": "firebolt",
  "minCoefficient": 1.0
}
```

Battle 只保证这条 path 在**生成候选的当前快照**下合法，不承诺未来一定能走完。执行期间对手会移动，因此每一格仍必须重新检查占位和预约。

对于带技能意图的计划，`minCoefficient` 属于 **LegalPlan / PlanSubmission 的起手约束**，不属于 `BattleSkill` Content。它表达：

> “这个技能客观上已经可以命中”不等于“这次计划现在就要出手”；只有当前目标格的效果系数达到本计划的 `minCoefficient`，才允许停止移动并开始技能前摇。**一旦技能已经起手，`minCoefficient` 的职责结束；resolve 时按目标当时实际所在格的 coefficient 结算。**

例如某技能近处系数为 `1.0`、远处为 `0.5`，Legal Plan 可以同时提供：

```text
P1: minCoefficient = 0.5  → 一进入远距离合法格即可出手
P2: minCoefficient = 1.0  → 即使 0.5 已可命中也继续接近，直到达到 1.0
```

这样“路线”和“出手时机”都仍属于 Decision 的战术选择，Simulation 只执行已选计划，不能自己挑更早的出手机会或改成另一技能。

为避免等价阈值制造重复候选，v0 LegalPlan Generator 应优先从该 Skill 矩阵实际存在的正系数中选择 `minCoefficient`；提交时至少要求它为有限正数且不高于该 Skill 的最大正系数。具体候选去重仍属于 LegalPlan 生成策略。

允许的计划族至少包括：沿显式路径接近并攻击、直接施法、只移动、原地保持/重新观察。带技能的计划显式携带 `skillId + targetActorId + minCoefficient`；只移动计划不携带技能意图，因此即使途中存在可用技能也不会自动攻击。未来如果改用受限 Schema 参数，也必须保证路线选择权、技能选择和出手阈值不会被引擎暗中改写。

### 7.2 动态执行

1. 请求绑定当前 Actor 的 `decisionGeneration`；旧 generation 永远不能提交计划。
2. 接受结果时用最新战场检查计划起始条件。敌人在请求期间正常移动，不自动使整份战略意图失效。
3. 执行 path 时，每一步开始前重新检查通行、占位和预约；在**计划起点、每个 `move_complete` 后，以及保护解除后重新获得攻击资格的检查点**，根据当前 `direction` 旋转 Skill 的范围矩阵并读取目标格系数。
4. 若目标格系数为 0/矩阵外，或虽大于 0 但仍小于当前 Plan 的 `minCoefficient`，则**不触发技能**；只要 path 仍可执行就继续移动。Simulation 不能因为“已经进入 Skill 的最低合法范围”而提前替 Decision 出手。
5. 若目标格系数 `>= minCoefficient` 且 Actor 当前允许攻击，则停止剩余 path 并进入技能前摇；如果受击保护尚未结束，则保留该计划的技能意图，但禁止 `windup_start`，继续该计划允许的合法移动或等待。
6. 保护结束后，如果技能尚未起手，必须使用最新 caster 坐标/朝向、target 坐标、计划代次和同一 `minCoefficient` 重新判断；之前曾达到阈值不产生未来起手权。若 path 已耗尽而阈值仍未达到，则本计划不能降级为较低系数起手，应结束/保持并进入后续决策流程。技能一旦已经起手，后续 resolve 不再检查 `minCoefficient`，只读取当时实际 coefficient。路线受阻、目标消失或计划失去意义时同样停止计划并 `ensureDecision`；不能在同一 Tick 无限重试。
7. 模型格式错误/非法候选允许有限重试；超时/服务失败采用确定性保底行为。重试不能凭空暂停 Battle，也不能延长受击保护。

Decision Observation 至少包含双方公开 HP、整数格位置/朝向、当前 action state、技能范围矩阵与前摇/后摇、保护剩余 Tick、对手是否正在移动/技能前摇/后摇，以及最近冲突/失败原因。v0 不发送 MP。

平台现状：当前公开 `SubsystemScope` 未提供 LLM API；Decision Adapter 的宿主、授权、密钥保护、完成时刻、deadline、取消需另立设计，不让 Browser 持有密钥。可先使用可控延迟的模拟 Adapter。


## 8. 移动：原子单格、起点占用与下一格预约

v0 将**单格移动冻结为原子动作**：

```text
Actor 当前占用 A
  → 申请并获得 B 的预约
  → 开始 A → B 的视觉运动
  → 运动期间：A 仍是规则占位，B 是该 Actor 的预约目标
  → move_complete 到期
  → 原子提交：释放 A，占用 B，释放 B 的预约
```

Browser 可以在 A 与 B 之间平滑插值，但规则系统里不存在半格位置。

具体规则：

- 一份短期计划可以包含多步 path，但任何时刻每个 Actor 最多只有一个 active step。
- 下一步只能在上一格 `move_complete` 已提交之后启动。
- 同一 Tick 多个 Actor 申请同一目标格时，先收集再统一裁决，最多一个成功；平手算法必须公平且可复现，不能依赖 Promise/回调先后。
- v0 禁止两个 Actor 同一 Tick 直接交换相邻格穿过彼此。
- 预约失败者仍在其原占位格，结束当前计划，记录 `terrain / occupied / reserved / contested` 等原因，并在后续 Tick 重新决策。
- 冲突后的新移动最早从下一逻辑 Tick 开始，不能在同一 Tick 反复失败和重试。

### 8.1 移动中受击

已经开始的一格移动**不会因受击回滚或停在半格**：

1. 本格 `move_complete` 仍按原 step token 到期并提交；
2. 受击立即使整个旧计划和尚未开始的后续步骤失效；
3. 新 LLM 决策可以在保护期内进行；
4. 本格完成后，如果新计划已准备好，则从新位置继续执行其合法移动；否则保持在新位置等待。

因此形成清晰边界：**单格移动不可拆；多格计划可被中断。施法仍然是可被有效受击打断的动作。**

移动本身已经有 Tick 时间成本。是否增加起步/转向额外 Tick、疲劳或连续移动递增惩罚，继续留作后续平衡问题。




## 9. 技能：起手阈值、前摇躲避、当前系数结算与后摇

### 9.1 技能起手

- 在计划起点、每个 `move_complete` 提交后，以及保护结束重新获得攻击资格时，Simulation 用施法者最新整数格坐标和 `direction` 旋转 Skill 的 `range` 矩阵。
- 将目标 Actor 的相对坐标映射到旋转后的矩阵，读取 `currentCoefficient`。
- `currentCoefficient <= 0` 或矩阵外：技能当前不能起手。
- `0 < currentCoefficient < Plan.minCoefficient`：技能客观上已经可以作用，但当前计划明确要求更高效果，因此不提前出手；path 仍可执行时继续移动。
- `currentCoefficient >= Plan.minCoefficient` 且施法者当前允许攻击：停止旧计划剩余移动并进入 `windup`。
- 如果已经达到起手阈值但施法者仍受保护，则保留技能意图，但不能 `windup_start`；继续允许计划中的合法移动或等待，之后重新按最新位置/朝向检查起手条件。
- v0 不引入 MP 或通用技能资源条。
- 前摇期间施法者不能移动；受到实际造成伤害的 `hit` 后，当前技能 action generation 失效，本次未结算技能取消。

`minCoefficient` **只决定什么时候开始技能**。技能一旦开始前摇，它不再约束最终结算效果。

角色的 `direction` 是规则输入。Presentation 显示的 Sprite 朝向不能反向改变技能矩阵方向。

### 9.2 前摇与 resolve：v0 不使用 tracking

v0 不定义 `tracking` 字段，也没有“合法起手后自动锁定最终命中”的默认规则。

普通技能统一遵循：

```text
达到 minCoefficient
  → windup_start
  → 前摇期间双方继续按各自规则行动
  → resolve 时重新读取双方最新 committed tile + caster direction
  → 得到 resolveCoefficient
```

resolve 时只关心**此刻目标实际处在技能矩阵的什么位置**：

- `resolveCoefficient > 0`：目标仍在效果区域；按这个**当前 coefficient** 计算效果；
- `resolveCoefficient <= 0` 或矩阵外：技能正常完成，但目标已经躲出效果区域，结果为 `miss`。

因此，例如一个技能近处为 `1.0`、远处为 `0.5`：

```text
起手时 coefficient = 1.0，Plan.minCoefficient = 1.0
→ 可以开始 windup

resolve 时目标仍在 1.0
→ 按 1.0 结算

resolve 时目标退到 0.5
→ 仍命中，按 0.5 结算

resolve 时目标离开矩阵
→ miss
```

这意味着前摇天然就是目标的规避窗口；不需要额外 `lock_actor / revalidate_range` 模式。

`windup_ticks = 0` 表示不提供这个规避等待窗口：技能合法起手后直接进入 resolve。其精确 intra-Tick 批处理位置仍需与第 11 节事件顺序一起冻结，但不能通过同 Tick 递归产生无限 Action。

### 9.3 技能结算结果

技能在结算点归约为四类：

```text
hit      // 技能/目标有效，目标仍在效果区域且未受保护：按当前 coefficient 结算
immune   // 技能/目标有效，目标仍在效果区域但处于保护：0 伤害，不中断，不刷新保护
miss     // 技能正常完成、目标仍有效，但 resolve 时目标已在 0 / 矩阵外
invalid  // Battle/行动已失效、目标死亡/不存在、技能已被中断等：本次结算本身不成立
```

`miss` 与 `invalid` 必须区分：

- `miss` 是正常战斗结果：技能成功释放，只是目标通过移动离开了效果区域；
- `invalid` 是生命周期/目标有效性/代次等导致这次技能不应再进行正常结算。

对于基础伤害技能，概念计算为：

```text
rawDamage = skill.damage × resolveCoefficient
```

coefficient 是**确定性的效果倍率，不是命中概率**。v0 不因为 `0.5` 就执行“50% 随机命中”；它表示命中时按 0.5 倍效果结算。最终 HP 伤害的整数化/舍入规则仍待确定，不能依赖 JavaScript 隐式转换。

结算判断建议按以下概念顺序：

```text
1. Battle / action / target 是否仍有效？
   否 → invalid

2. 用最新 committed tile + caster direction 读取 resolveCoefficient
   <= 0 / 矩阵外 → miss

3. target 是否 protected？
   是 → immune

4. 否则 → hit，按 resolveCoefficient 计算效果
```

建议表现：

- `hit`：结算规则效果，并在目标本 Tick 最新已提交格播放 Skill 引用的 BattleEffect；
- `immune`：不造成伤害，但可以播放命中/免疫视觉；
- `miss`：不产生目标命中效果；是否播放空挥/落空视觉由 Presentation 契约后续决定；
- `invalid`：不产生正常技能命中表现，只记录规则/诊断日志。

v0 仍是单目标 Actor。范围矩阵只决定这个 Actor 是否在效果区域以及当前效果系数；它不是 AOE effect matrix。

地形通行不自动等于技能 LOS。v0 暂不因矩阵存在而自动引入 LOS、固定地面目标、AOE、弹道等机制。

### 9.4 Recovery

技能 resolve 完成后进入 recovery。

Recovery 是**行动锁，不是思考锁**：

- 可以发起/继续 Decision Thinking；
- 可以接收并暂存下一份 ready Plan；
- 不可以开始新的 move / turn / windup 等 Action；
- `recovery_complete` 后，如果暂存 Plan 仍合法，可以立即进入后续正常执行检查；
- recovery 中受到实际造成伤害的 `hit` 时，立即中断 recovery，旧计划/旧 Decision generation 失效，进入正常受击保护与重新 Decision 流程；
- `immune` 不造成实际伤害，因此不打断 recovery。

### 9.5 Effect Presentation

Simulation 结算后只输出 effect identity、锚点目标/格子、开始 Tick、结果等事实。Presentation 根据对应 `struct.BattleEffect` 决定图片及渐入/停留/渐出。

示意投影：

```json
{
  "effectId": "effect-00012",
  "sceneEpoch": 1,
  "result": "hit",
  "effect": "firebolt",
  "tile": { "x": 4, "y": 3 },
  "startTick": 120
}
```

Presentation 自己解析 `BattleEffect` 的 Graphics 和视觉时间线。动画不决定伤害、生死、Tick 或战斗结果；Frame 终止时清理旧效果。

## 10. 受击：中断、重新决策和固定保护区间

受到 `hit` 且实际造成伤害的命中时，本 Tick 先按统一命中批次应用伤害并判断死亡。存活 Actor：

1. 使当前多格计划、未完成前摇、recovery 和旧 LLM 请求代次失效；
2. **不撤销已经开始的原子单格移动**，该 step 仍会完成；
3. 创建且只创建一个新的 Decision Request；
4. 设置新的 `protectedUntilTickExclusive`；
5. 保护期间可以思考和移动用于脱险，但不能 `windup_start`；
6. 后续攻击若命中受保护 Actor，结算为 `immune`：不伤害、不再次中断、也不刷新/延长保护；
7. Tick 到达 `protectedUntilTickExclusive` 后自然恢复正常攻击与受击能力。

保护最大持续时间由命中 Tick 与配置决定，不因为 LLM 长时间不返回而延长。LLM 超时后采用确定性保底行为。

同一 Tick 的多次候选攻击按**该 Tick 命中批次开始前的保护状态**判断。当前 Tick 新产生的保护只影响后续 Tick，不回溯抵消该批次中的其他命中，因此允许 simultaneous defeat。


## 11. Tick 事件循环与同时事件处理

Battle 采用类似 Event Loop 的思想，但异步回调顺序不是游戏规则。调度器先根据单调时钟逐 Tick 追到目标时间，每一个逻辑 Tick 分别执行一次确定性的 reducer。

### 11.1 单个 Tick 的冻结处理顺序

对当前 `currentTick`：

1. **截取当前 Tick 事件快照**：只取 `dueTick === currentTick` 的有效候选；更早 Tick 应在之前的逐 Tick补处理循环中已经结算。
2. **过滤 Battle/Actor/代次失效事件**：死亡、旧 action generation、旧 decision generation 等不能继续提交。已开始原子移动的 step token 按第 8 节例外完成。
3. **完成本 Tick 到期移动与既有后摇结束**：统一提交有效 `move_complete`，原子释放起点/占用终点/释放预约；处理本 Tick 到期且仍有效的 `recovery_complete`。受到实际伤害的 recovery 已在受击流程中提前失效。
4. **收集本 Tick 到期技能**：把有效 `skill_resolve` 放入候选命中集合。
5. **解析技能结果**：基于**移动完成后的最新位置、caster 当前 direction**和本命中批次开始前的保护状态，重新读取 resolveCoefficient，把每次技能归约为 `hit / immune / miss / invalid`。`minCoefficient` 不参与 resolve。
6. **批量应用 hit 伤害**：同步修改 HP；同 Tick 已经到期的双方攻击不会因代码处理顺序互相吞掉。
7. **终局闸门**：如果产生死亡/双亡并达到结束条件，立即冻结新的游戏行为，只保留日志/表现/Frame 收尾。
8. **处理存活受击者**：失效旧计划/未结算技能前摇/Decision generation，设置保护，并对每个 Actor 最多启动一个新 Decision Request。
9. **接收本 Tick 可用的 Decision**：用实际完成时间、deadline、generation 和当前战场验证；timeout 与 ready 同 Tick 不按事件排序决定，而按 Decision State 的完成事实判断。
10. **推进现有/新计划**：对带技能意图的 Plan，用当前范围矩阵系数与该 Plan 的 `minCoefficient` 判断是否达到起手阈值；只有达到阈值且当前允许攻击才可进入前摇。受保护 Actor 只禁止攻击，不禁止计划中的合法移动。
11. **统一下一格预约**：其余移动计划同时申请下一格并裁决；成功者启动原子 step，失败者记录原因并安排后续 Tick 的重新决策。
12. **安排未来事件并发布快照**：新增未来 `move_complete`、`skill_resolve`、`recovery_complete` 等；递增状态版本并投影到 Browser。

处理期间新产生的未来动作不能重新进入当前 Tick 的事件快照，避免零时间递归。

### 11.2 决策和 timeout 的确定性

每个 Actor 同时最多一个有效请求。Decision Request 的最终状态来自其事实字段，而不是两个事件谁先跑：

```text
if completedAtMonotonicMs != null
   && completedAtMonotonicMs <= deadlineMonotonicMs:
  completed
else if deadline reached:
  timeout
else:
  pending
```

在同一个 Tick 内同时观察到 timeout 边界和模型完成事实时，上述规则唯一决定结果。

### 11.3 生命周期/Abort 属于控制平面

Frame abort、Battle cancel、Subsystem 退出不是普通 Battle Simulation Event，**不等待下一个 200 ms Tick**：

```text
abort/cancel
  → 立即令 battleEpoch / status 失效
  → 禁止任何后续规则提交
  → AbortSignal 尽力取消 LLM/资源工作
  → 停止 scheduler
  → 清理 Presentation
  → 完成 Frame 收尾
```

迟到 Promise 即使未来返回，也因为 `battleEpoch`/generation 不匹配而没有提交权。

### 11.4 确定性回放与开发诊断

事件队列天然适合做可复现战斗日志。v0 实现应至少记录：

- 初始地图/Actor 配置标识；
- 接受的 `planId`、path、`skillId`、`targetActorId` 与 `minCoefficient`；
- Decision 请求 generation、开始 Tick、实际完成时间/映射 dueTick、timeout；
- 移动预约和冲突裁决；
- 技能 `hit / immune / miss / invalid` 结果以及 resolve 时实际 coefficient；
- 受击和保护区间；
- Battle 结果。

如果未来冲突裁决、技能或 AI 候选生成引入伪随机，Battle 必须记录 `battleSeed`，不能靠不可回放的随机源。

开发/模拟环境建议额外统计但**不改变规则**：

```text
ticksSinceLastDamage
ticksSinceLastPositionChange
decisionCountWithoutProgress
collisionRetryCount
```

这样可以区分“玩法上的长期追逐”和“事件循环/状态机真的卡死”。当前仍不强制设置战斗总时长上限。


## 12. 玩家指导、Frame 生命周期及退出

未来玩家以「训练师」身份给我方下一次决策从四张**预配置**卡里选一张，指导只成为本次 LLM Observation 的临时字段：不直接修改 HP、伤害、位置、保护或其他战斗事实，也不保证模型一定遵从。v0 可先固定 guidance 或跳过。

由于双方同时行动，不得沿用旧 `await_guidance → ally turn → enemy turn` 全局回合状态机。指导不能阻塞敌方 Battle 时间轴。

Frame/Subsystem 取消遵循第 11.3 节控制平面规则：立即终止 Battle authority，而不是等待一个 Tick 后再取消。所有迟到决策、移动或技能事件都必须因 `battleEpoch`/generation 失效而无法提交。Web Presentation 只读事实，不允许 DOM reverse-sync BattleState。


## 13. MVP 验收与实施顺序

### 13.1 真实行为验收

- `struct.Map` / `struct.Tileset` / Character Graphics 可直接沿用现有 RPGMap 内容形式，不新增 BattleMap/BattleActorVisual；一张兼容地图和两个合法可见 Character Sprite 可正常投影。
- `BattleActor` 能引用 Character、max_hp 与 skills；`BattleSkill` 能用单一 m×n 范围矩阵表达朝向范围和确定性效果倍率，且 v0 不需要 `tracking`；`BattleEffect` 可独立替换图片/视觉时间而不改变技能规则。
- 单格移动使用「起点占用 + 终点预约 + 到期原子提交」；Browser 没有反向提交半格位置。
- 移动中受击时，本格仍完成；旧多格计划后续步骤取消，新计划从本格完成后的真实位置继续。
- 宿主从 Tick 10 晚醒到 Tick 14 时，Tick 11/12/13/14 按序分别归约，不能把不同 dueTick 的事件当成同时发生。
- 每个 Actor 同时最多一个有效 Decision Request；同 Tick 出现多个“需要重规划”的原因也不会重复发起 LLM。
- LLM 实际耗时 500 ms 按最早 600 ms/Tick 边界生效；恰好 deadline 完成按统一 completed-time 规则处理，不由 timeout/ready 回调先后决定。
- 合法候选 `planId` 显式携带 path；带技能候选还显式携带 `skillId / targetActorId / minCoefficient`。Battle 不暗中替 AI 选择等价路线或更早出手；执行时每格重新检查动态占位/预约和技能阈值。
- 保护期内可以沿计划移动、可以保留攻击意图，但不能开始技能前摇；保护结束后若技能尚未起手，重新检查朝向、范围矩阵和原 Plan 的 `minCoefficient`，达到同一阈值才起手。技能一旦起手，resolve 不再检查该阈值。
- 技能矩阵必须只有一个 `"↑"`，0/矩阵外无效，正数为合法格和效果系数；Actor 朝向变化时同一矩阵正确旋转。测试必须覆盖“0.5 已合法但 Plan 要求 1.0，因此继续移动而不提前释放”的情况。
- 技能 resolve 产生 `hit / immune / miss / invalid` 四类确定结果：目标仍在矩阵内时使用 resolve 时的实际 coefficient；目标移动到 0/矩阵外为 `miss`；`immune` 不伤害、不打断、不刷新保护。
- 同 Tick 先完成所有移动，再解析到期技能；技能不使用 tracking/锁定命中位置，而是按目标本 Tick 移动完成后的最新格与 caster 当前 direction 重新读取 coefficient。
- 双方同 Tick 争一格无重叠；失败方收到原因并在后续 Tick 重决策，不发生零时间重试。
- 同 Tick 双技能按批处理，无顺序作弊；双亡有明确结果。
- Frame abort/cancel 立即停止提交权，不等待下个 Tick；迟到 Promise/LLM/事件不能篡改已终止 Battle。
- 模拟器可以输出无进展诊断指标；回放不重新调用 LLM，而使用已记录的 plan/dueTick/冲突结果重现战斗。
- Simulation 在完全没有 Browser/Presentation 的测试环境中仍能完成整场战斗并得到确定结果；Decision 也可替换为 Script/Mock。
- Presentation 掉帧、动画失败或 camera 改变不能改变 Simulation Snapshot、行为结果或胜负；Decision 不直接读取 DOM/Sprite/camera 作为战斗事实。
- 真实 Browser 可见性用 Browser E2E 单独验收，不把 Domain 提交或动画完成当作规则 ACK。

### 13.2 实施依赖顺序

冻结 RPGMap 兼容资源边界 + `BattleActor / BattleSkill / BattleEffect` Content 契约 → 实现范围矩阵解析/旋转与 Actor direction 规则 → 先实现可无 Decision/无 Browser 独立运行的 Simulation（200 ms 单调时钟、逐 Tick scheduler、事件队列、Actor 状态、原子移动、预约、技能前摇/结算/后摇与保护）→ 实现 Render Projection 与独立 Presentation → 实现 path-based Legal Plans / Observation → 用 Mock/Script Decision 驱动 Simulation 覆盖边界测试 → 接受控 LLM Decision / 玩家指导 → Hostra/Browser E2E。

**明确不在 v0：**传统交替回合、复用 RPGMap Runtime、逐格调用 LLM、MP/通用技能资源系统、职业/装备/升级、多单位、复杂状态/AOE/弹道/粒子/动画编辑器、跨图探索、提示词优化及评测、跨战训练档案、模型微调。多格移动、移动途中施法触发、事件队列、原子单格移动和显式 path 计划**已进入 v0**。


## 14. 尚需确认的问题与建议推进顺序

下面只列仍然没有冻结、且会影响后续实现的问题。已经确认的规则（例如 200 ms Tick、范围矩阵、`minCoefficient` 只负责起手、resolve 按当前 coefficient、`miss`、删除 tracking、Recovery 行动锁）不再重新列为开放问题。

### 14.1 实现 Simulation / Decision 前优先冻结

#### 14.1.1 coefficient 的整数化与伤害舍入

当前已经冻结：

- coefficient 是确定性的效果倍率，不是命中概率；
- resolve 使用目标当时所在格的 coefficient。

仍需决定：

```text
baseDamage = 7
coefficient = 0.5
→ 最终伤害是 3、4，还是允许 3.5？
```

以及：

```text
baseDamage = 1
coefficient = 0.5
→ 0 还是至少 1？
```

**建议方向（尚未冻结）：**

- HP 与最终伤害保持整数；
- Content 可继续写小数 coefficient；
- 加载时把 coefficient 规范化为固定精度整数，例如千分制：
  - `1.0 → 1000`
  - `0.5 → 500`
  - `1.25 → 1250`
- 运行时按整数计算：
  ```text
  finalDamage = floor(baseDamage × coefficientUnits / 1000)
  ```
- 不暗加“最低 1 点伤害”；若以后需要 minimum damage，应作为单独机制定义。

这样可以避免 JavaScript 浮点细节进入 Replay / 跨实现一致性。

#### 14.1.2 `windup_ticks = 0` 的同 Tick 结算位置

玩法语义已经冻结：

> `windup_ticks = 0` 表示没有蓄力等待；合法起手后应直接进入 resolve。

实现上仍需决定：如果 Actor 在 Tick N 的“推进 Plan”阶段才刚满足即时技能条件，这次 resolve 是：

```text
A. Tick N 内立即加入本 Tick 结算批次
B. Tick N+1 才结算
```

**建议方向（尚未冻结）：**采用 A，使 0 Tick 真正表示即时生效；同时增加硬约束：

> 单个 Actor 在一个 Tick 内最多启动一次新的主动 Action。

这样可以支持即时“抓”等技能，又避免 `windup=0 + recovery=0` 导致同 Tick 无限递归。

具体需要把即时技能插入第 11 节 reducer 的哪个阶段，必须与“同 Tick 批量伤害、同时致命”语义一起冻结。

#### 14.1.3 同格预约冲突的 deterministic tie-break

已冻结：

- 两个 Actor 同 Tick 申请同一格时统一裁决；
- 不能依赖 Promise/回调/遍历顺序；
- 失败者留在原格并在后续 Tick 重规划。

仍需决定：

> 两者条件完全相同时，谁获得该格？

可选方向：

- 固定按 actorId：最简单，但可能长期偏袒某一方；
- 基于 `battleSeed + tick + actorId` 的确定性伪随机：公平且可 Replay；
- 轮换冲突优先权：也可避免长期偏袒，但需要额外状态。

当前建议优先评估“带 seed 的确定性 tie-break”；若使用随机性，`battleSeed` 必须写入 Replay。

#### 14.1.4 LegalPlan 候选预算与去重

当前一个候选可能组合：

```text
path
+ skillId
+ targetActorId
+ minCoefficient
```

如果路径、技能和阈值全部做笛卡尔积，候选数会很快膨胀；但候选过少又会让 Decision 没有实际战术选择。

仍需冻结：

- 每次 Observation 最多生成多少个 LegalPlan；
- path 如何判定“战术等价”并去重；
- 同一 Skill 的 `minCoefficient` 取哪些值；
- approach / direct cast / move-only / hold 各保留多少候选；
- 搜索深度和计算预算。

当前建议是：`minCoefficient` 只从该 Skill 矩阵中实际存在的正系数里选，不生成任意连续小数；候选总数保持一个小而明确的上限。具体上限需用 Mock/Script Decision 和真实 Prompt 大小实测后冻结。

### 14.2 Content / Contracts 正式化

#### 14.2.1 三个 Battle Content Schema

概念已经形成：

```text
BattleActor
BattleSkill
BattleEffect
```

正式实现前仍需冻结：

- subject/version，例如是否使用 `struct.BattleActor/v1`；
- Content key 与对象内 `id` 是否必须一致；
- 字段命名风格；
- `skills[]`、`effect` 的引用方式；
- range matrix 的 Schema 校验；
- Graphics 引用是否直接沿用现有通用 Resource Ref Schema。

Schema version 应表示**结构兼容性**，不应因为 Fireball damage 从 5 调到 6 就升级版本。

#### 14.2.2 LOS 是否进入 v0

当前 range matrix 只描述相对位置，没有规定墙体是否阻挡技能。

例如：

```text
Actor  █ wall █  Target
```

即使矩阵覆盖 Target，也需要明确“能否作用”。

**建议方向（尚未冻结）：v0 不做 LOS。**

即：

- Tile passability 只决定移动；
- 不自动推导“不可通行 = 不可被技能穿过”；
- 技能只按 range matrix 判断；
- 未来确有需要再加入独立 LOS 规则。

这样避免把 RPGMap 的通行语义错误扩展成技能遮挡语义。

#### 14.2.3 BattleEffect v1 的最小表现能力

当前已经明确 BattleEffect 是 Presentation-only，但还需冻结：

- effect image 的正式引用字段；
- timing 字段；
- anchor 语义；
- `hit / immune / miss` 各自是否播放；
- effect cleanup 生命周期。

建议 v0 保持最小：单图片 + 简单 timing + 一个明确锚点，不提前引入 projectile、轨迹、粒子、Shader 或复杂动画系统。

#### 14.2.4 公共 Contracts

仍需正式定义：

```text
BattleSnapshot
BattleObservation
LegalPlan
PlanSubmission
PlanAcceptance
BattleEvent
RenderProjection
SkillEffectProjection
```

重点是把“Simulation 权威事实”和“Presentation 投影”彻底分开；Contracts 只是共享数据边界，不成为第四个运行层。

### 14.3 可随 Runtime / Host 集成继续决定

#### 14.3.1 暂停、后台与 Battle Clock

如果浏览器失焦/系统暂停，需要决定：

- 冻结 Battle 单调时钟；
- 还是 Battle 时间继续流逝，恢复后补算。

已冻结的底线是：

> 只要选择继续流逝，积压 Tick 就必须逐 Tick 顺序补算，不能合并。

产品方向上可优先考虑主动暂停时冻结 Battle clock，但此项尚未冻结。

#### 14.3.2 Decision Adapter 的真实完成时间

LLM 实际完成可能早于 JavaScript callback 被处理的时间。Decision Adapter 需要可靠提供：

```text
startedAt
completedAt
deadline
cancel / abort
error metadata
```

Simulation 用这些事实映射 `dueTick`，不能把 host event-loop 延迟误算成模型思考时间。

Simulation 初期可以用 Mock/Script Decision 绕过这个集成问题。

#### 14.3.3 Presentation / RenderProjection

仍需决定：

- 地图与双 Sprite 的投影格式；
- movement projection；
- effect projection；
- camera API；
- camera 是否接受 Simulation 的非权威 focus hint；
- Browser 节点和资源生命周期。

这些不应阻塞 headless Simulation 的实现。

#### 14.3.4 玩家四选一 Guidance

未来玩家 Guidance 应进入下一次 Decision Observation，而不是直接修改 Simulation。

仍需决定它如何经过现有授权 InputTarget / Host 框架传入 Decision。

#### 14.3.5 僵局处理

当前不设置强制 Battle 总时长。

先记录：

```text
ticksSinceLastDamage
ticksSinceLastPositionChange
decisionCountWithoutProgress
collisionRetryCount
```

用模拟数据判断是否真的存在长期无伤害追逐/无效规划，再决定是否增加 `stalemate` 或总时长规则。

#### 14.3.6 Workspace / package-lock

Battle 当前仍是 design-only。根 `package-lock.json` 同步、`npm ci`、构建、单元测试和 Browser E2E 都需要在真正加入 Runtime 代码时单独验证；文档冻结不代表这些工程项已经完成。

### 14.4 推荐实施顺序

下一阶段建议按下面顺序推进：

```text
1. 冻结 coefficient 整数化/舍入
2. 冻结 windup_ticks = 0 的同 Tick reducer 语义
3. 冻结同格冲突 tie-break
4. 冻结 LegalPlan 候选预算/去重
5. 正式定义 BattleActor / BattleSkill / BattleEffect v1 Schema
6. 定义核心 Contracts
7. 实现 Content validator + headless Simulation reducer
8. 用 Mock/Script Decision 覆盖边界测试
9. 再接 Presentation
10. 最后接真实 LLM Decision / Guidance / Host E2E
```

**执行约束：**在接真实 LLM 前，先用可控时间的模拟决策器和确定性事件日志验证：积压 Tick、timeout/ready 同刻、移动中受击、同 Tick 移动+命中、0 Tick 技能、保护期攻击意图、Recovery 受击、`miss`、重复重规划原因、同格冲突和同时致命攻击。

