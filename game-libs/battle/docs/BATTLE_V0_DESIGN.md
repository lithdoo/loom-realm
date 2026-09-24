# Battle v0：双 Actor 同时行动、200 ms Tick 与事件队列战斗设计

> 状态：**设计草案 / Design only；讨论整理于 2026-09-23。** 本文继续取代 2026-09-22 的传统交替回合旧方案，并进一步取消「复用 RPGMap Runtime」这一前提。
> **范围声明：**这里区分「已形成方向」「建议的 v0 默认方案」「仍待定」。讨论结果不是现有 API、已完成源码、数值冻结或测试通过。
> 优先事项：Battle 自有地图/Actor 运行逻辑、200 ms 离散时间、确定性事件队列、短期 LLM 计划、原子逐格移动、施法、冲突、受击与表现；提示词优化、训练及长期记忆延后。


## 1. 一句话定位与最小闭环

Battle 是一个**独立的双 Actor 战斗系统**，运行时明确拆成三层：**Simulation（行为/规则权威）**、**Presentation（纯表现）**、**Decision（可插拔决策）**。它不运行或调用 RPGMap Runtime，只沿用/兼容 LoomRealm 既有地图与角色素材的组织形式，以及格子、通行、角色朝向、Sprite 等地图角色逻辑概念。Actor 坐标、占位、路径执行、技能和冲突都只由 Simulation 维护权威事实。

我方和敌方两个 Actor **同时**沿各自时间轴思考、移动和施法，不等待对方结束回合。Battle 以 **1 Tick = 200 ms** 作为权威逻辑时间粒度，并维护自己的**事件队列**。LLM 调用、移动完成、技能完成、受击中断、保护到期等都转换为按 Tick 对齐的事件；异步回调本身不能直接修改战斗状态。

最小闭环：加载兼容的地图/素材数据 → 放置两个 Actor → 并发发起各自 LLM/模拟决策 → 把返回结果量化到 Tick 并入队 → Actor 根据短期计划逐格移动 → 途中进入射程则停止后续移动并施法 → 技能按事件到期统一结算 → 受阻或受击取消旧计划并重新决策 → 双方持续并发行动，直到一方/双方死亡或战斗被外部终止。

这里的「同时」不是多线程并发写状态，而是**同一个事件调度器在相同逻辑时间批量处理双方事件**。LLM、Promise、Browser 动画和 DOM 都没有权威状态提交权。



## 2. 决策状态：哪些已形成方向，哪些只是建议

| 主题 | 讨论形成的方向 | 状态/边界 |
| --- | --- | --- |
| 架构 | 三层：Simulation / Presentation / Decision；Simulation 是唯一权威，Presentation 只投影，Decision 只提计划 | 实现前冻结规则 |
| 地图 | Battle 自己实现战斗地图/Actor 运行逻辑；仅沿用/兼容 RPGMap 的素材形式与地图角色逻辑概念 | 产品方向；不依赖 RPGMap Runtime |
| 角色 | v0 我方、敌方各一名，均可自主移动及施法，角色占一格 | 产品方向 |
| 并行行动 | 取消传统交替回合，Actor 独立思考、移动、施法 | 已取代旧回合方案 |
| Tick | Battle 逻辑最小单位 200 ms；规则持续时间以整数 Tick 表示，LLM 实际耗时向上量化到 Tick | 产品方向；暂停/恢复策略待定 |
| 事件队列 | 异步结果先登记；只把**相同 dueTick** 的事件视为同时发生。宿主晚醒时必须按逻辑 Tick 逐个补处理，不能把不同 Tick 压成一批 | 实现前冻结规则 |
| 决策 | 一次 LLM 请求返回一段短期计划；每个 Actor 同时最多一个有效 Decision Request | 实现前冻结规则 |
| 路径 | 路径属于计划内容；优先由 Battle 构造当前快照下合法的候选 `planId`，候选显式包含 path，LLM 只选择计划 | 实现前冻结规则 |
| 单格移动 | 一格是原子动作：起点继续占用、目标格被预约，`move_complete` 时才原子提交到目标格 | 实现前冻结规则 |
| 移动受击 | 已经开始的单格移动继续完成；受击取消的是本格之后尚未开始的后续移动计划 | 实现前冻结规则 |
| 碰撞 | 只预约下一格；同 Tick 争同格统一裁决，失败者结束当前计划并重新决策 | 产品方向；平局算法待定 |
| 普通单体技能 | 合法起手后锁定 Actor；目标普通移动不会使该技能自动落空 | v0 建议默认 |
| 技能限制 | v0 **不引入 MP**；以后可按技能选择冷却、次数、能量、弹药等限制形式 | 已明确移除 MP 前提 |
| 受击保护 | 使用半开区间语义 `[hitTick + 1, protectedUntilTickExclusive)`；保护期间允许思考/移动，不能攻击/施法，不受伤、不再次中断、不刷新保护 | 实现前冻结规则 |
| 保护中的攻击计划 | LLM 可返回带攻击意图的计划；保护只禁止 `cast_start`，移动仍可执行，保护结束后按最新战况重新检查是否起手 | 实现前冻结规则 |
| 生命周期取消 | Frame abort / Battle cancel 属于控制平面，立即失效 Battle authority，不等待下一个 Tick | 实现前冻结规则 |
| 技能视觉 | 结算后只在命中格叠一张贴图，按 Tick 阶段渐显渐隐 | 产品方向；具体 Browser 接口待定 |
| 玩家指导 | 未来四选一指导影响我方下一次 LLM 请求；原型可固定 guidance 或跳过 | 后续交互设计 |

**未冻结的平衡值：**地图大小、一次计划最大移动格数、单格移动 Tick 数、技能射程/伤害/蓄力 Tick、保护 Tick 数等均需实测。当前明确冻结的是 **200 ms/Tick 的基础时间粒度和上述事件/动作语义**。


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
- 技能起手、蓄力、`hit / immune / invalid`、伤害、死亡；
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
  → cast_started
  → cast_complete
  → hit / immune / invalid
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
  → cast_started
  → after N ticks: hit / immune / invalid
  → update HP / state
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

## 4. 地图/素材兼容边界：借形式，不复用 RPGMap Runtime

Battle **不调用 `RPGMapBuilder`、`RPGMapHandler` 或 RPGMap Runtime 的移动实现**，也不要求 RPGMap 为 Battle 扩展双 Actor API。这样 Battle 的 200 ms Tick、预约、受击中断和多 Actor 并发不会受 RPGMap 单 Player/动画时序约束。

需要复用的是「形式和规则语义」，不是运行时代码：

1. 地图仍采用 LoomRealm/RPGMap 相同或兼容的地图内容形式，保留宽高、Tileset、格子坐标、通行等概念；具体 Battle 输入 Schema 在实现前冻结。
2. 角色继续使用既有 Character Sprite/方向/Pattern 等素材形式，让 Battle 与已有素材生产链兼容。
3. Battle 自己实现指定 Actor 的逐格运动、短路径执行、下一格预约、碰撞与同 Tick 冲突裁决。
4. Browser 表现可以沿用既有地图/角色的视觉约定，但 Battle 不通过修改 RPGMap DOM/Sprite 来代替规则提交。
5. RPGMap 的 Transfer、Bridge、探索事件等行为不自动进入 Battle；若未来需要某项地图语义，应明确选择并在 Battle 中实现/兼容，而不是隐式调用 RPGMap Runtime。

因此，RPGMap 当前公开 API 是否支持两个可移动 Actor **不再是 Battle v0 的实现前置依赖**。实现前真正需要确认的是：哪些地图/角色资源 Schema 应作为兼容输入，以及 Battle 自己的地图加载与渲染投影怎样接 LoomRealm 的 Content/Presentation 契约。



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
- `cast_complete`：技能蓄力到期，进入该 Tick 候选命中集合；
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
| 技能蓄力 | 3 Tick（600 ms），仅为样例 |
| LLM 实际用时 500 ms | 向上对齐为 3 Tick（600 ms） |
| 技能渐显/停留/渐隐 | 可各 1 Tick，Browser 在阶段内平滑插值 |

不再要求与 RPGMap Runtime 的 250 ms walk duration 对齐；Battle 的动作 Tick 是自身规则。


## 6. Actor 状态、计划、代次与取消

两个 Actor 各自拥有独立状态，不能使用全局 `activeActorId`、`turnNumber` 或「我方回合→敌方回合」循环。

```text
thinking --decision_ready--> moving / casting / idle
moving --move_complete--> [入射程且可攻击] casting / [继续] moving / [计划结束] thinking
casting --cast_complete--> thinking
moving/casting/thinking --受到有效伤害且存活--> interrupted → thinking
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
- 旧 `move_complete`、`cast_complete` 或迟到 LLM 结果即使仍在队列中，到期时发现代次不匹配就丢弃；
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
  "castWhenInRange": true
}
```

Battle 只保证这条 path 在**生成候选的当前快照**下合法，不承诺未来一定能走完。执行期间对手会移动，因此每一格仍必须重新检查占位和预约。

允许的计划族至少包括：沿显式路径接近并攻击、直接施法、只移动、原地保持/重新观察。未来如果改用受限 Schema 参数，也必须保证路线选择权和技能意图不会被引擎暗中改写。

### 7.2 动态执行

1. 请求绑定当前 Actor 的 `decisionGeneration`；旧 generation 永远不能提交计划。
2. 接受结果时用最新战场检查计划起始条件。敌人在请求期间正常移动，不自动使整份战略意图失效。
3. 执行 path 时，每一步开始前重新检查通行、占位和预约；每一步完成后检查是否进入技能射程。
4. 如果提前进入射程并允许攻击，停止剩余 path、开始施法；如果受击保护尚未结束，则**保留该计划的攻击意图，但禁止 `cast_start`**。
5. 保护期间仍可继续该计划允许的移动。保护到期后，在开始任何攻击前重新检查目标存活、射程和计划代次；仍合法则施法，不合法则继续剩余计划或结束并重新决策。
6. 路线受阻、目标消失、路径耗尽或计划已失去意义时，停止计划并 `ensureDecision`；不能在同一 Tick 无限重试。
7. 模型格式错误/非法候选允许有限重试；超时/服务失败采用确定性保底行为。重试不能凭空暂停 Battle，也不能延长受击保护。

Decision Observation 至少包含双方公开 HP、整数格位置、当前 action state、技能耗时、保护剩余 Tick、对手是否正在施法/移动，以及最近冲突/失败原因。v0 不发送 MP。

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


## 9. 技能：途中触发、锁定 Actor、明确结算结果

### 9.1 施法起手

- 在计划起点以及每个 `move_complete` 提交后，Battle 用最新整数格位置检查计划中的技能射程。
- 如果目标在射程内且施法者**不受保护**，则停止旧计划剩余移动并开始施法，锁定 `targetActorId`，安排未来 `cast_complete`。
- 如果目标在射程内但施法者仍受保护，不丢弃攻击意图；继续允许计划中的合法移动，或等待保护结束。保护结束后必须重新检查射程和目标状态后才能 `cast_start`。
- v0 不引入 MP 或通用技能资源条。
- 锁定型普通技能合法起手后，目标普通移动不会让技能自动落空。
- 施法者蓄力期间不能移动；受到有效伤害后 `actionGeneration` 失效，未来旧 `cast_complete` 作废。

### 9.2 技能完成的统一结果

`cast_complete` 到期时不直接返回简单 true/false，而至少归约为：

```text
hit      // 目标有效且没有保护：正常造成伤害
immune   // 目标有效但处于受击保护：0 伤害，不触发中断，不刷新保护
invalid  // 目标死亡、Battle 已结束、目标/行动代次无效等：不结算
```

建议表现：

- `hit`：结算伤害，并在目标**本 Tick 完成移动后的最新已提交格**播放正常技能效果；
- `immune`：不造成伤害，但仍可播放技能命中视觉（未来可叠加 IMMUNE 等提示），让玩家知道技能确实完成且被保护挡下；
- `invalid`：不产生正常命中伤害或命中特效，可记录调试/战斗日志。

地形通行不自动等于技能 LOS。v0 可以先不做 LOS；固定格子 AOE、闪避、脱锁、抛射物、移动施法等后续扩展。

技能验收样本只要求：`skillId`、目标规则、射程、伤害、蓄力 Tick 与效果资源。所有具体数值均非定稿。

### 9.3 效果表现

只在结算结果要求表现时生成唯一 `effectId`，把贴图锚定到结算时目标最新已提交格；Browser 可在 Tick 阶段内部平滑插值。

```json
{
  "effectId": "effect-00012",
  "sceneEpoch": 1,
  "result": "hit",
  "tile": { "x": 4, "y": 3 },
  "image": {
    "namespace": "resource.Graphics",
    "key": "<configured-effect-key>",
    "contentVersion": "<actual-content-version>"
  },
  "fadeInTicks": 1,
  "holdTicks": 1,
  "fadeOutTicks": 1
}
```

Browser 按 `effectId` 去重和清理。动画不决定伤害、生死、Tick 或战斗结果；Frame 终止时清理旧效果。


## 10. 受击：中断、重新决策和固定保护区间

受到 `hit` 且实际造成伤害的命中时，本 Tick 先按统一命中批次应用伤害并判断死亡。存活 Actor：

1. 使当前多格计划、未完成施法和旧 LLM 请求代次失效；
2. **不撤销已经开始的原子单格移动**，该 step 仍会完成；
3. 创建且只创建一个新的 Decision Request；
4. 设置新的 `protectedUntilTickExclusive`；
5. 保护期间可以思考和移动用于脱险，但不能 `cast_start`；
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
3. **完成本 Tick 到期移动**：统一提交所有有效 `move_complete`，原子释放起点/占用终点/释放预约。
4. **收集本 Tick 到期技能**：把有效 `cast_complete` 放入候选命中集合。
5. **解析技能结果**：基于**移动完成后的最新位置**和本命中批次开始前的保护状态，把每次技能归约为 `hit / immune / invalid`。
6. **批量应用 hit 伤害**：同步修改 HP；同 Tick 已经到期的双方攻击不会因代码处理顺序互相吞掉。
7. **终局闸门**：如果产生死亡/双亡并达到结束条件，立即冻结新的游戏行为，只保留日志/表现/Frame 收尾。
8. **处理存活受击者**：失效旧计划/施法/Decision generation，设置保护，并对每个 Actor 最多启动一个新 Decision Request。
9. **接收本 Tick 可用的 Decision**：用实际完成时间、deadline、generation 和当前战场验证；timeout 与 ready 同 Tick 不按事件排序决定，而按 Decision State 的完成事实判断。
10. **推进现有/新计划**：检查当前格是否满足技能起手；受保护 Actor 只禁止攻击，不禁止计划中的合法移动。
11. **统一下一格预约**：其余移动计划同时申请下一格并裁决；成功者启动原子 step，失败者记录原因并安排后续 Tick 的重新决策。
12. **安排未来事件并发布快照**：新增未来 `move_complete`、`cast_complete` 等；递增状态版本并投影到 Browser。

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
- 接受的 `planId` 与 path；
- Decision 请求 generation、开始 Tick、实际完成时间/映射 dueTick、timeout；
- 移动预约和冲突裁决；
- 技能 `hit / immune / invalid` 结果；
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

- 一张与既有素材/地图形式兼容的 Battle 地图、两个合法可见 Sprite；双方位置只源于 Battle 自有地图权威。
- 单格移动使用「起点占用 + 终点预约 + 到期原子提交」；Browser 没有反向提交半格位置。
- 移动中受击时，本格仍完成；旧多格计划后续步骤取消，新计划从本格完成后的真实位置继续。
- 宿主从 Tick 10 晚醒到 Tick 14 时，Tick 11/12/13/14 按序分别归约，不能把不同 dueTick 的事件当成同时发生。
- 每个 Actor 同时最多一个有效 Decision Request；同 Tick 出现多个“需要重规划”的原因也不会重复发起 LLM。
- LLM 实际耗时 500 ms 按最早 600 ms/Tick 边界生效；恰好 deadline 完成按统一 completed-time 规则处理，不由 timeout/ready 回调先后决定。
- 合法候选 `planId` 显式携带 path；Battle 不暗中替 AI 选择等价路线；执行时每格重新检查动态占位/预约。
- 保护期内可以沿计划移动、可以保留攻击意图，但不能开始施法；保护结束后重新检查射程，仍合法才起手。
- 技能到期至少产生 `hit / immune / invalid` 三种确定结果；`immune` 不伤害、不打断、不刷新保护。
- 同 Tick 先完成所有移动，再解析到期技能；锁定 Actor 的技能效果落在目标本 Tick 移动完成后的最新格。
- 双方同 Tick 争一格无重叠；失败方收到原因并在后续 Tick 重决策，不发生零时间重试。
- 同 Tick 双技能按批处理，无顺序作弊；双亡有明确结果。
- Frame abort/cancel 立即停止提交权，不等待下个 Tick；迟到 Promise/LLM/事件不能篡改已终止 Battle。
- 模拟器可以输出无进展诊断指标；回放不重新调用 LLM，而使用已记录的 plan/dueTick/冲突结果重现战斗。
- Simulation 在完全没有 Browser/Presentation 的测试环境中仍能完成整场战斗并得到确定结果；Decision 也可替换为 Script/Mock。
- Presentation 掉帧、动画失败或 camera 改变不能改变 Simulation Snapshot、行为结果或胜负；Decision 不直接读取 DOM/Sprite/camera 作为战斗事实。
- 真实 Browser 可见性用 Browser E2E 单独验收，不把 Domain 提交或动画完成当作规则 ACK。

### 13.2 实施依赖顺序

冻结 Contracts 与地图/Actor 输入 Schema → 先实现可无 Decision/无 Browser 独立运行的 Simulation（200 ms 单调时钟、逐 Tick scheduler、事件队列、Actor 状态、原子移动、预约、技能与保护）→ 实现 Render Projection 与独立 Presentation → 实现 path-based Legal Plans / Observation → 用 Mock/Script Decision 驱动 Simulation 覆盖边界测试 → 接受控 LLM Decision / 玩家指导 → Hostra/Browser E2E。

**明确不在 v0：**传统交替回合、复用 RPGMap Runtime、逐格调用 LLM、MP/通用技能资源系统、职业/装备/升级、多单位、复杂状态/AOE/弹道/粒子/动画编辑器、跨图探索、提示词优化及评测、跨战训练档案、模型微调。多格移动、移动途中施法触发、事件队列、原子单格移动和显式 path 计划**已进入 v0**。


## 14. 尚需确认的关键问题（不得暗定）

以下问题仍可留到实现/模拟阶段决定；不要把已经冻结的事件语义重新列为开放问题：

1. Battle 要兼容到什么程度的 RPGMap 地图/Tileset/Character 素材形式；哪些结构直接复用 Content Schema，哪些转换为 Battle 专用输入？
2. 单格移动、技能蓄力、保护和一次计划最大 path 的具体 Tick 数值。
3. 同格预约冲突的公平平手算法；若算法包含随机性必须使用并记录 `battleSeed`。
4. 宿主失焦/用户主动暂停时，是冻结 Battle 单调时钟还是继续流逝；如果继续流逝，恢复后仍必须逐 Tick 顺序补算。
5. Decision Adapter 如何可靠提供完成时刻、deadline、取消以及服务错误元数据；不同模型/网络的耗时差异是否需要产品层限制。
6. 合法候选 path 的生成数量、去重和搜索预算；不能生成过多候选把 Prompt 撑爆，也不能只提供一个路线使 AI 无实际路线选择。
7. 技能实际射程度量、是否做 LOS，以及以后不同技能的锁定/固定格/资源限制扩展。
8. `immune` 的 Browser 表现是否只播放原技能效果，还是增加专门免疫提示。
9. Presentation 的 RenderProjection 具体 Schema、地图/双 Sprite/技能贴图节点和生命周期；Camera 是否完全由 Presentation 自主，或接受 Simulation 的非权威 focus hint。
10. 四选一指导如何通过现有授权 InputTarget 进入下一个我方 Decision Observation。
11. 长期无伤害追逐或 AI 持续无效规划暂不设置强制战斗总时长；根据 `ticksSinceLastDamage` 等诊断指标再决定是否增加僵局规则。
12. Battle 包根 `package-lock.json` 同步与 `npm ci` 仍需单独核验；本文档更新不代表运行代码已经交付。

**执行约束：**先用可控时间的模拟决策器和确定性事件日志验证：积压 Tick、timeout/ready 同刻、移动中受击、同 Tick 移动+命中、保护期攻击意图、重复重规划原因、冲突和同时致命攻击。通过后再接真实 LLM。

