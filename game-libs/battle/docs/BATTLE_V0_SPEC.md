# Battle v0 核心规范

> 状态：**Design only / 规范草案**。本文是 Battle v0 已冻结 gameplay/runtime 语义的唯一权威来源；不代表 Runtime、Schema、构建或测试已经实现。
>
> 统一状态词：
> - **FROZEN / MUST**：v0 实现必须遵守。
> - **SHOULD**：实现建议，不改变核心规则兼容性。
> - **OPEN**：尚未冻结，代码不得自行假设。
> - **NON-GOAL**：明确不进入 v0。

## 1. 范围与权威

Battle v0 是一个独立的**双 Actor 同时行动**战斗系统。核心能力包括：200 ms 固定逻辑 Tick、确定性 reducer/事件队列、短期 Decision Plan、原子格子移动、单目标技能、受击保护、确定性 Replay，以及纯表现 Presentation。

运行时分三层：

- **Simulation**：唯一战斗规则与状态权威。
- **Decision**：产生结构化短期战术计划。
- **Presentation**：只渲染 Simulation 事实与 Projection。

共享的 `battle/contracts` 只是数据边界，不是第四个运行层。

### ARCH-001 — Simulation 唯一权威 — FROZEN

只有 Simulation 可以修改以下权威事实：逻辑时间、Actor committed tile/direction、占位/预约、HP、action state、accepted plan、保护区间、generation、技能结算、BattleResult、Replay 事实。

LLM/Promise 回调、Browser 动画完成、DOM、Sprite 坐标、camera 等都不得直接修改 Simulation。

### ARCH-002 — Decision 决定战术意图 — FROZEN

Decision 负责决定“想做什么”，并直接生成结构化 `PlanSubmission`，包括明确的 path 和可选 skill intent。

Simulation 不得预先枚举战术路线再让 Decision 选择 `planId`。

### ARCH-003 — Presentation 只负责表现 — FROZEN

Presentation 决定“怎样显示”。

屏幕插值坐标、掉帧、动画完成、camera、viewport 等不得反向修改权威位置、伤害、时间或胜负。

### ARCH-004 — 不复用 RPGMap Runtime — FROZEN

Battle 可以消费 LoomRealm 已有 Map/Tileset/Autotile/Character 的 Content/Resource 形式，但不得把 RPGMap Runtime 的移动、计时器、Transfer/Bridge、探索状态作为 Battle 权威。

### ARCH-005 — 三层模块独立导出，Simulation 自有运行循环 — FROZEN

Decision、Simulation、Presentation 必须可以作为独立模块实现、导出和测试。三者可以依赖共享 Contract/Port，但不得依赖彼此的 concrete implementation。

依赖与运行边界：

- **Decision = Plan**：只根据 `BattleObservation / PlanConstraints / RecentEvents / Optional Guidance` 产生结构化 `PlanSubmission`；不得直接修改 Battle State，也不需要知道 Presentation 如何实现。
- **Simulation = Execute**：是完整、自驱动的 Battle Runtime，自己拥有 Battle clock、200 ms Tick scheduler、event queue、`TICK-001` reducer、accepted plan execution、authoritative state、BattleResult 与 Replay。业务层不得接管或重写这些运行职责。
- **Presentation = Present**：根据 Scene 初始化数据与 Simulation 已决定的 Projection/表现命令更新视图；不得参与规则判定，也不得通过动画完成、DOM/Sprite 状态或 Browser ACK 反向驱动 Simulation。
- Simulation 可以通过共享的 `DecisionPort` / `PresentationPort` 使用业务注入的实现；这种依赖只针对稳定接口，不得 import 或假设具体 Decision/Browser implementation。
- 使用 Battle 的 Application/Subsystem 只负责选择 concrete implementation、构造/注入三层、提供 Host capability，并把 Frame abort、pause/background 等外部生命周期映射给 Battle Runtime。它不是第四个 gameplay Runtime Layer，也不负责逐 Tick 实施 Battle。

因此，headless Simulation 必须能用 Mock/Script Decision、可控时钟以及 Null/Recording Presentation 跑完整 Battle；Decision 与 Presentation 也必须分别能够使用 synthetic input 独立验证。

## 2. Canonical terminology

整套 Battle 文档统一使用以下术语：

- **tile**：整数格坐标。
- **committed tile**：Actor 当前 Simulation 权威格。
- **path**：`PlanSubmission` 中未来要进入的格子序列，不包含当前格。
- **step**：已经开始的一格原子移动。
- **PlanSubmission**：Decision 已产生、但尚未被 Simulation 接受的计划。
- **accepted plan**：Simulation 已校验并接管执行的计划。
- **Decision Request**：绑定某个 `decisionGeneration` 的一次异步决策请求。
- **Action**：新启动的 move step、原地 `turn`、或 skill windup。
- **windup**：技能前摇。
- **resolve**：技能产生权威 `hit / immune / miss / invalid` 的结算点。
- **recovery**：技能结算后的行动锁。
- **coefficient**：range matrix 中的确定性效果倍率。
- **coefficientUnits**：Runtime 中千分制的 coefficient。
- **protection**：有效受击后的一段免疫区间。

Runtime 字段统一使用 **direction**；不得再用 `facing` 表示同一个状态字段。

## 3. Battle 配置与初始化

### TIME-001 — Tick 固定为 200 ms — FROZEN

`tickDurationMs = 200`。

所有规则持续时间使用整数 Tick。真实异步操作可以任意时刻完成，但只能在确定的逻辑 Tick 成为权威事实。

### BATTLE-001 — v0 只有两个 combat Actor — FROZEN

v0 固定为双方各一个 Actor，每个 Actor 占一个格。

### BATTLE-002 — 默认满血开战 — FROZEN

v0 Actor 初始 HP 等于 `max_hp`，暂不需要独立 `initial_hp` Content 字段。

### PLAN-001 — 短期计划长度 — FROZEN

`PlanConstraints.maxPathSteps` 必须存在。

v0 默认值为 **6**；具体 Battle Config 可以调整这个值而不改变 Contract 结构。

### RNG-001 — battleSeed — FROZEN

由于同格冲突使用伪随机裁决，每场 Battle 初始化时必须持有 `battleSeed`，并写入 Replay。

规则随机不得依赖不可回放的 `Math.random()`。

## 4. Actor Runtime State 与不变量

概念状态：

```text
actorId
team
hp
tile
direction
actionState
acceptedPlanId?
activeStep?
protectedUntilTickExclusive
actionGeneration
decisionGeneration
```

### STATE-001 — 权威位置永远是整数格 — FROZEN

Simulation 中不存在权威“半格位置”。

Actor 移动插值期间仍 committed 在起点格，直到 `move_complete`。

### STATE-002 — direction 是规则输入 — FROZEN

沿用 LoomRealm/RPGMap 数值：

```text
2 = down
4 = left
6 = right
8 = up
```

Skill range 旋转读取 Simulation direction，而不是 Presentation Sprite 朝向。

### STATE-003 — 每个 Actor 同时最多一个有效 Decision Request — FROZEN

同一 `decisionGeneration` 最多一个有效 pending Decision Request。

`ensureDecision(actorId, reason)` 在同 generation 内必须幂等；同 Tick 多个重规划原因不得重复创建请求。

### STATE-004 — 每 Actor 每 Tick 最多启动一个新 Action — FROZEN

即使 windup/recovery 为 0，一个 Actor 在一个逻辑 Tick 内也最多启动一次新的主动 Action。

## 5. 时间、事件队列与异步完成

### TIME-002 — Simulation 自有事件队列 — FROZEN

事件按 `dueTick` 排序，核心概念包括：

```text
decision_ready
move_complete
skill_resolve
recovery_complete
```

异步回调只能登记完成事实/时间戳或未来事件，不得直接改 Battle State。

### TIME-003 — 积压 Tick 必须逐 Tick 归约 — FROZEN

Battle clock 正常运行期间，如果调度器晚醒：

```text
while lastProcessedTick < targetTick:
  lastProcessedTick += 1
  processTick(lastProcessedTick)
```

不同 `dueTick` 绝不能压成同一个“同时事件批次”。

### TIME-004 — Pause / Background 冻结 Battle Clock — FROZEN

当 Host 明确暂停 Battle，或 App/Host 进入 background 状态时：

- Battle monotonic clock 冻结；
- `currentTick` 不推进；
- pause/background 期间的现实时间不计入 Decision、move、windup、recovery 或 protection；
- 恢复后从原逻辑时刻继续，不补算暂停期间对应的 Tick。

TIME-003 的 catch-up 只用于**Battle clock 仍在运行时** scheduler/event loop 晚醒等情况。

### DEC-001 — Decision 延迟计入游戏时间 — FROZEN

Decision/LLM 的真实耗时属于 Battle 时间。

例如真实用时 500 ms，最早可在 600 ms / 3 Tick 边界使用。

Decision State 至少记录：

```text
startedAtMonotonicMs
completedAtMonotonicMs?
deadlineMonotonicMs
dueTick?
```

如果 `completedAt <= deadline`，即使宿主 callback 更晚才被处理，也算按时完成；timeout/ready 不能由 callback 先后顺序决定。

### DEC-002 — 旧 generation 无提交权 — FROZEN

Decision Request 绑定 `decisionGeneration`。

generation 失效后，迟到响应只能记录诊断，不能再次提交计划。

## 6. Decision Protocol 与 PlanSubmission

### PLAN-002 — Decision 读取 Observation + Constraints — FROZEN

Decision 只读取 Simulation 提供的：

```text
BattleObservation
PlanConstraints
RecentEvents
Optional Guidance
```

不得直接把 Presentation DOM/Sprite/camera/动画进度当作战斗事实。

### PLAN-003 — 最小 PlanSubmission — FROZEN

逻辑结构：

```text
PlanSubmission
├── turn?: Direction
├── path: GridPosition[]
└── skill?: {
      skillId
      targetActorId
      minCoefficient
    }
```

规则：

- `path` 只包含未来目的格，不包含 Actor 当前格；
- 只允许上下左右四方向，每一步 Manhattan distance = 1；
- `path.length <= PlanConstraints.maxPathSteps`；
- `turn` 只表达**原地转向**，因此出现 `turn` 时 `path` 必须为空；
- `path: []`、无 turn、无 skill = hold/reobserve；
- `path: []`、无 turn、有 skill = direct cast；
- `path: []`、有 turn、无 skill = pure turn；
- `path: []`、有 turn、有 skill = 先原地 turn；本 Tick Action 配额耗尽，skill intent 保留到后续 Tick重新校验；
- v0 不增加自由执行字段 `strategy/reason/priority/fallback/moveGoal`。

### PLAN-004 — minCoefficient 的合法值 — FROZEN

`minCoefficient` 必须等于该 Skill range matrix 中实际存在的某个**去重正 coefficient**（规范化后比较）。

例如 Skill 只有 `0.5 / 1.0`，则 `0.73` 非法。

### PLAN-005 — 提交时校验 — FROZEN

Simulation 在提交时校验：

- path 长度；
- 坐标为整数且不越界；
- 四方向邻接；
- 静态地形可通行；
- `turn` 必须是合法 Direction，且不能与非空 path 同时出现；
- skill 属于 Actor；
- target 当前合法；
- `minCoefficient` 合法；
- `decisionGeneration` 仍有效；
- Actor 当前状态允许接受计划。

提交时**不要求未来 path 的动态占位一直为空**。

occupied/reserved/contested 等动态条件必须在每一步真正开始前重新检查。

Plan 被接受只表示“当前可以开始”，不保证未来一定走完或成功施法。

### PLAN-006 — Reject 与一次修正机会 — FROZEN

Reject 必须返回机器可读 reason，例如：

```text
path_too_long
path_out_of_bounds
path_not_adjacent
terrain_blocked
invalid_turn
turn_with_path
unknown_skill
invalid_target
invalid_min_coefficient
stale_decision_generation
actor_not_ready
```

同一 `decisionGeneration` 最多允许**一次修正重试**。

第二次仍非法：

- 当前 generation 失败；
- Actor 保持 idle；
- 最早下一逻辑 Tick 才能新建 Decision generation。

如果修正需要再次调用 LLM，其耗时照常计入 Battle 时间。

### PLAN-007 — Plan 动态执行 — FROZEN

accepted plan 在执行过程中持续面对实时战场：

- 接受计划时用最新状态校验；Decision 思考期间普通敌方移动不会自动令整份战略意图失效；
- 如果存在 pending `turn`，先把 turn 作为一个独立 Action 执行并标记完成；它消耗当前 Tick 的 Action 配额，因此同一 Tick 不能再 move 或 windup；若计划还带 skill intent，则后续 Tick按最新状态重新检查技能起手；
- 每个 move step 开始前重新检查 passability/occupancy/reservation/lifecycle/generation；
- 带 skill 的计划在 plan 起点、每次 `move_complete` 后、以及 protection 结束重新获得攻击资格时检查当前 coefficient；
- coefficient 为 0/矩阵外或低于 `minCoefficient` 时不施法，只要剩余 path 合法就继续移动；
- 达到 `minCoefficient` 且 Actor 可以攻击时，停止尚未使用的 path，进入 windup；
- path 已耗尽仍未达到阈值时，不得自动“降级”为更低 coefficient 攻击；计划结束/保持并进入后续 Decision；
- 路线被阻、目标消失、计划失去意义时结束计划，并在后续合法 Tick 重规划；不得同 Tick 零时间反复重试。

### PLAN-008 — move-only 不会自动攻击 — FROZEN

没有 skill intent 的 Plan 永远不会因为途中进入某技能合法范围而自动施法。

## 7. Turn 与 Movement

### TURN-001 — 原地 Turn Action — FROZEN

v0 保留独立 `turn` Action，用于 Actor 在**同一 committed tile** 上主动改变 direction。

规则：

- `turn` 立即把 Simulation `direction` 改为目标 Direction；
- 不改变 committed tile、occupancy 或 reservation；
- 不需要 `turn_complete` future event；
- turn 本身占用 STATE-004 的“本 Tick唯一新 Action”配额；
- 因此 turn 后同一 Tick不能再启动 move 或 skill windup；
- protection 只禁止 skill windup，因此受保护 Actor可以 turn；
- recovery 是 action lock，因此 recovery 中不能 turn；
- pure turn 完成后计划结束；如果同一 Plan 还带 skill intent，则该 intent 留到后续 Tick重新校验。

### MOVE-001 — 单格移动是原子提交 step — FROZEN

A→B：

```text
占用 A
→ 申请/获得 B reservation
→ move_start：direction 立即变为 A→B 的方向
→ 移动期间 committed/occupied tile 仍是 A
→ move_complete
→ 释放 A
→ 占用 B
→ 释放 B reservation
```

这里“原子”表示**只有完整提交到 B 或保持在 A，不存在权威半格位置**；不表示已经启动的移动不可中断。

Presentation 可以平滑插值，但 Simulation 在完成前仍认为 Actor 位于 A。

### MOVE-002 — 多格 path 串行执行 — FROZEN

每个 Actor 同时最多一个 active step。

上一格 `move_complete` 提交前，不得启动下一格。

每次新 step 都重新验证动态占位和预约。

### MOVE-003 — 同 Tick 争同格使用可回放随机 — FROZEN

多个 Actor 同 Tick 申请同一目的格：

- 先统一收集；
- 最多一个成功；
- 所有竞争者等概率；
- 结果由稳定输入派生，例如：
  `battleSeed + currentTick + targetTile + sorted competingActorIds`。

不得依赖遍历顺序、Promise 顺序、`Math.random()` 或“之前已经消费了多少 RNG”。

### MOVE-004 — v0 禁止直接 swap — FROZEN

相邻两个 Actor 不允许在同 Tick 直接穿过彼此交换格子。

### MOVE-005 — 冲突失败方 — FROZEN

失败方留在原格，当前计划结束，记录如 `contested` 的原因，并在后续 Tick 重规划。

不得同 Tick 零时间重试。

### MOVE-006 — move_start 瞬间转向 — FROZEN

移动 step 真正开始时，Actor 的 `direction` **立即**变为移动方向。

位置仍保持原 committed tile，直到 `move_complete`。

如果这次移动随后被受击中断，direction 不回滚；Actor 保持“刚才试图移动的方向”。

### MOVE-007 — 移动中 damaging hit 立即中断 step — FROZEN

Actor 在 active step 中受到 `finalDamage > 0` 的 `hit` 时，当前移动立即失败：

- 取消 active step；
- 取消对应未来 `move_complete` 的提交权；
- 释放 destination reservation；
- Actor 继续占用最后一个 committed origin tile，不会停在半格，也不会提交到 destination；
- 旧 accepted plan / action generation 失效。

如果 Actor **存活**：

- 获得 protection；
- 旧 Decision generation 失效；
- 确保且只创建一个受击后的新 Decision Request；
- 后续计划从该 committed origin tile 开始。

如果 Actor **死亡**：

- 保持 dead 在最后 committed tile；
- 不获得新的行动机会；
- 不创建新的 Decision Request；
- Battle 按 terminal rule 结束或继续处理同时事件。

如果 `move_complete` 已经在同一 Tick 的 reducer 前置阶段成功提交，然后本 Tick后续才受到 hit，则该 step 已经完成，不再属于“移动中受击”。

## 8. Skill Range 与 coefficient

### SKILL-001 — 单一 range matrix — FROZEN

Skill 使用任意 m×n 规则矩形矩阵，并统一按**施法者朝上**编写。

```text
"↑" = caster origin + canonical facing
0   = 无效区域
>0  = 合法目标格 + deterministic coefficient
矩阵外 = 无效
```

校验：

- 每行长度一致；
- 必须且只能有一个 `"↑"`；
- 其他单元格只能是 finite nonnegative number；
- 正 coefficient 最多 3 位小数。

实际方向由 Simulation direction 旋转矩阵。

v0 不需要独立 `origin / shape / front_only / rotate_with_facing`，也不拆 target matrix / effect matrix。

### DAMAGE-001 — coefficient 千分制与伤害取整 — FROZEN

Content coefficient 加载后转成千分制：

```text
1.0  → 1000
0.5  → 500
1.25 → 1250
```

Runtime 比较和 Replay 使用 `coefficientUnits`。

基础伤害：

```text
finalDamage = floor(baseDamage × coefficientUnits / 1000)
```

允许 `finalDamage = 0`；v0 不暗加 minimum 1。

### SKILL-002 — minCoefficient 只负责起手 — FROZEN

`PlanSubmission.skill.minCoefficient` 表示“本计划愿意在多高效果倍率时**开始技能**”。

windup 前：

- current coefficient < min：不出手，能继续 path 就继续；
- current coefficient >= min 且 Actor 可攻击：停止剩余 path，开始 windup。

一旦 windup 已经开始，`minCoefficient` 不再约束 resolve。

### SKILL-003 — 无 tracking；resolve 看当前位置 — FROZEN

v0 没有 `tracking` 字段，也没有“起手后锁定命中”。

resolve 时重新读取：

- caster 当前 committed tile；
- caster 当前 direction；
- target 当前 committed tile。

结果：

- coefficient > 0：按**当前 coefficient** 结算；
- coefficient <= 0 / 矩阵外：`miss`。

例如：

```text
1.0 起手
→ 前摇中目标退到 0.5
→ 按 0.5 结算

目标离开矩阵
→ miss
```

### SKILL-004 — windup / resolve / recovery — FROZEN

普通生命周期：

```text
windup
→ resolve
→ recovery
→ next eligible Action
```

resolve 前受到实际伤害会取消未完成 windup。

Recovery 是**行动锁，不是思考锁**：

- Decision Thinking 可以开始/继续；
- ready 的下一 Plan 可以暂存；
- recovery 中不能启动 move/turn/windup；
- 实际伤害 `hit` 会中断 recovery，并进入正常受击流程；
- `immune` 不会中断 recovery。

### SKILL-005 — windup_ticks = 0 的即时批次 — FROZEN

`windup_ticks = 0` 在**起手同一 Tick**进入一次 bounded instant-resolve batch。

同 Tick 的即时技能必须先统一收集，再批量结算，因此仍允许 simultaneous defeat。

`recovery_ticks = 0` 只表示没有额外 recovery Tick；受 STATE-004 限制，同 Tick 不会获得第二次 Action。

### SKILL-006 — v0 不做 LOS — FROZEN

v0 的技能范围只由 range matrix + caster direction + 当前双方 committed tile 决定。

Tile passability **只控制移动**，不得自动推导“不可通行 Tile 会阻挡技能”。

因此即使 caster 与 target 之间存在不可通行地形，只要 target 当前映射到 range matrix 的正 coefficient 格，技能在范围规则上仍然有效。

未来如果需要墙体阻挡、弹道或视线，必须作为新的显式机制加入，而不是复用 movement passability。

## 9. Resolve、伤害、Protection 与中断

### HIT-001 — 四种技能结算结果 — FROZEN

```text
hit
immune
miss
invalid
```

- `hit`：action/target 有效，目标仍在效果区域，且未受保护。
- `immune`：action/target 有效，目标仍在效果区域，但处于 protection。
- `miss`：技能正常结算，但目标已经在 0/矩阵外。
- `invalid`：Battle/action/target 生命周期已不允许正常结算，例如目标已死/消失、action 被取消、Battle 已结束。

`miss` 不能并入 `invalid`。

### HIT-002 — protection 半开区间 — FROZEN

使用 `protectedUntilTickExclusive`：

```text
protected = currentTick < protectedUntilTickExclusive
```

例如 Tick 10 受击后获得 3 个完整保护 Tick：

```text
Tick 11/12/13 protected
protectedUntilTickExclusive = 14
Tick 14 恢复正常
```

无需 `protection_expire` 业务事件。

### HIT-003 — damaging hit 的 aftermath — FROZEN

`damaging hit` 定义为：

```text
outcome = hit
&& finalDamage > 0
```

batch damage 应用后：

如果 Actor **存活**：

- 当前 Action 被中断：active movement 按 MOVE-007 失败；未结算 windup 取消；recovery 结束；
- 旧 accepted plan / action generation 失效；
- 旧 Decision generation 失效；
- 获得 protection；
- 确保且只确保一个新的 Decision Request。

如果 Actor **死亡**：

- 当前 Action 全部取消；
- active movement 按 MOVE-007 留在最后 committed tile 并释放 reservation；
- 不设置新的 protection；
- 不创建新的 Decision Request。

### HIT-004 — immune 不产生受击 aftermath — FROZEN

`immune`：

- 0 damage；
- 不中断；
- 不失效 Decision；
- 不刷新/延长 protection。

### HIT-005 — protection 中允许什么 — FROZEN

Actor 处于 protection 时：

- 可以继续 Decision Thinking；
- accepted plan 中合法移动可以继续；
- 可以执行合法的原地 turn；
- **不能启动新的 skill windup**；
- 原 attack intent 可以保留；
- protection 结束后，必须用最新 caster tile/direction、target tile、plan generation 和同一 `minCoefficient` 重新检查起手；
- 之前曾经达到阈值不产生未来出手权。

Protection 阻止的是技能起手，不是 Thinking、移动或原地 turn。

### HIT-006 — 同一 hit batch 的 protection 快照 — FROZEN

同一 hit batch 中所有攻击，都按该 batch 开始时的 protection 状态判断。

本 batch 新产生的 protection 不会回溯使同 batch 其他攻击变成 `immune`。

因此允许 simultaneous defeat。

### HIT-007 — zero-damage hit 不触发受击 aftermath — FROZEN

如果技能几何/保护判断得到 `hit`，但 DAMAGE-001 计算出：

```text
finalDamage = 0
```

则 outcome 仍然是 `hit`，可以产生正常 hit Presentation / Replay 事实，但它**不是 damaging hit**：

- HP 不变；
- 不打断 movement / windup / recovery；
- 不失效 accepted plan / Decision；
- 不创建 protection；
- 不触发受击后 redecision。

未来若需要“0 damage 但有硬直/控制”，必须单独增加明确的 control/interrupt 机制。

## 10. Tick Reducer

### TICK-001 — 单 Tick 唯一处理顺序 — FROZEN

每个 `currentTick`：

1. 截取 `dueTick === currentTick` 的事件快照。
2. 过滤 Battle/Actor 生命周期、已取消 active step 和旧 generation 事件。
3. 提交仍有效且在本 Tick 到期的 `move_complete`，并处理有效 `recovery_complete`。
4. 收集此前已经启动、在本 Tick 到期的 `skill_resolve`。
5. 用移动完成后的 committed position/direction 和 batch-start protection，把普通技能归约为 `hit / immune / miss / invalid`。
6. 同步批量应用普通 `hit` damage。
7. 对 `finalDamage > 0` 的目标应用 HIT-003 aftermath：包括中断 active movement、释放 reservation、失效 Action/Plan/Decision；死亡者不获得 protection 或新 Decision。
8. 执行普通批次 terminal gate；如果 Battle 已结束，不再启动新的游戏 Action。
9. 接收本 Tick 可用 Decision；按完成时间/deadline/generation 判断，不看 callback 顺序。
10. 推进 existing/new plan；每 Actor 最多产生一个“新 Action 意图”。pending turn 在这里立即执行并消耗 Action 配额；skill/move 按规则产生后续意图。
11. 收集第 10 步新启动的 `windup_ticks=0` 技能，组成一次 bounded instant-resolve batch。
12. 用与普通技能相同的 outcome / simultaneous damage / HIT-003 aftermath / terminal 规则结算即时批次。
13. 只对经过即时批次后仍存活、计划仍有效的 movement intent 统一做 next-tile reservation；预约成功即 `move_start`，并按 MOVE-006 立即更新 direction。
14. 安排未来 `move_complete / skill_resolve / recovery_complete`，发布 Snapshot/Projection。

### TICK-002 — 当前 Tick 必须有界 — FROZEN

本 Tick 新产生的事实不得递归重新进入已经处理过的阶段。

即时 resolve、0 recovery、新 Decision、受击中断或即时 turn 都不能让同一 Actor回到 Action-start 阶段再启动第二个 Action。

## 11. BattleResult 与控制平面

### RESULT-001 — BattleResult — FROZEN

概念结果：

```text
ally win
enemy win
simultaneous defeat
cancelled
failure
```

死亡/终局检查发生在 TICK-001 的 terminal gate。

### RESULT-002 — v0 不设正式 stalemate / 最大时长 — FROZEN

v0 不因为战斗持续过久或长时间无伤害而自动结束，也不设置强制最大 Battle Tick 数。

只记录 REPLAY-002 的无进展 diagnostics；未来如果模拟数据证明需要，再通过新规则加入 `stalemate`，不得在 v0 Runtime 中暗加超时胜负。

### CTRL-001 — abort/cancel 是即时控制平面 — FROZEN

Frame abort、Battle cancel、Subsystem 退出不是普通 Tick Event。

必须立即：

- 失效 Battle authority/epoch；
- 禁止后续规则提交；
- 停止 scheduler；
- best-effort 取消 LLM/资源工作；
- 允许 Presentation/Frame 清理。

迟到 Promise/Event 不得修改已结束 Battle。

## 12. Determinism 与 Replay

### REPLAY-001 — Replay 必须记录的事实 — FROZEN

至少记录：

- 初始 Battle/Map/Actor 配置标识；
- `battleSeed`；
- accepted `PlanSubmission` + 内部 `acceptedPlanId`；
- Decision generation/start/completion/dueTick/timeout；
- movement reservation 与 contention 结果；
- skill `hit / immune / miss / invalid` + resolve coefficient；
- 实际伤害与 protection 区间；
- BattleResult。

Replay **不重新调用 LLM**。

### REPLAY-002 — diagnostics 不改变规则 — FROZEN

开发/模拟环境可以记录：

```text
ticksSinceLastDamage
ticksSinceLastPositionChange
decisionCountWithoutProgress
collisionRetryCount
```

除非未来有新规则明确引用，否则这些统计不得改变 gameplay。

## 13. v0 NON-GOAL

明确不进入 v0：

- 传统交替回合；
- RPGMap Runtime 复用；
- 逐格调用 LLM；
- MP / 通用技能资源条；
- 职业/装备/升级；
- 超过两个 combat Actor；
- 复杂状态系统；
- 地面选点；
- AOE / 第二张 effect matrix；
- projectile/ballistics；
- 粒子/Shader/动画编辑器；
- 探索/Transfer Runtime；
- Prompt 优化/评测作为 Battle Rule；
- 跨战训练记忆 / 模型微调。

## 14. Core OPEN 状态

此前的 6 个 core gameplay OPEN 已全部冻结：

- `OPEN-DIR-001` → TURN-001 + MOVE-006：move_start 瞬间转向，并保留独立原地 turn Action。
- `OPEN-MOVE-001` → MOVE-007 + HIT-003：任何 damaging hit 都立即中断 active movement；死亡留在最后 committed tile。
- `OPEN-HIT-001` → HIT-007：zero-damage hit 保持 `hit` outcome，但不触发 interruption/protection/redecision。
- `OPEN-LOS-001` → SKILL-006：v0 不做 LOS。
- `OPEN-CLOCK-001` → TIME-004：pause/background 冻结 Battle clock。
- `OPEN-STALEMATE-001` → RESULT-002：v0 不设正式 stalemate / 最大战斗时长，只记录 diagnostics。

**当前 Core gameplay 没有未冻结 OPEN 项。**

Content subject/version、BattleEffect 视觉细节、Decision Adapter API、Host/Browser 接口等仍分别在 Contracts / Integration 文档维护为 OPEN；这些不改变已经冻结的 Core gameplay 语义。
