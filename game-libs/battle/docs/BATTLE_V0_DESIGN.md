# Battle v0：双 Actor 同时行动、200 ms Tick 与事件队列战斗设计

> 状态：**设计草案 / Design only；讨论整理于 2026-09-23。** 本文继续取代 2026-09-22 的传统交替回合旧方案，并进一步取消「复用 RPGMap Runtime」这一前提。
> **范围声明：**这里区分「已形成方向」「建议的 v0 默认方案」「仍待定」。讨论结果不是现有 API、已完成源码、数值冻结或测试通过。
> 优先事项：Battle 自有地图/Actor 运行逻辑、200 ms 离散时间、事件队列、短期 LLM 计划、逐格移动、施法、冲突、受击与表现；提示词优化、训练及长期记忆延后。


## 1. 一句话定位与最小闭环

Battle 是一个**独立的双 Actor 战斗运行时**。它不运行或调用 RPGMap Runtime，只沿用/兼容 LoomRealm 既有地图与角色素材的组织形式，以及格子、通行、角色朝向、Sprite 等地图角色逻辑概念。战斗地图、Actor 坐标、占位、路径执行和冲突均由 Battle 自己维护唯一权威。

我方和敌方两个 Actor **同时**沿各自时间轴思考、移动和施法，不等待对方结束回合。Battle 以 **1 Tick = 200 ms** 作为权威逻辑时间粒度，并维护自己的**事件队列**。LLM 调用、移动完成、技能完成、受击中断、保护到期等都转换为按 Tick 对齐的事件；异步回调本身不能直接修改战斗状态。

最小闭环：加载兼容的地图/素材数据 → 放置两个 Actor → 并发发起各自 LLM/模拟决策 → 把返回结果量化到 Tick 并入队 → Actor 根据短期计划逐格移动 → 途中进入射程则停止后续移动并施法 → 技能按事件到期统一结算 → 受阻或受击取消旧计划并重新决策 → 双方持续并发行动，直到一方/双方死亡或战斗被外部终止。

这里的「同时」不是多线程并发写状态，而是**同一个事件调度器在相同逻辑时间批量处理双方事件**。LLM、Promise、Browser 动画和 DOM 都没有权威状态提交权。


## 2. 决策状态：哪些已形成方向，哪些只是建议

| 主题 | 讨论形成的方向 | 状态/边界 |
| --- | --- | --- |
| 地图 | Battle 自己实现战斗地图/Actor 运行逻辑；仅沿用/兼容 RPGMap 的素材形式与地图角色逻辑概念 | 产品方向；不依赖 RPGMap Runtime |
| 角色 | v0 我方、敌方各一名，均可自主移动及施法，角色占一格 | 产品方向 |
| 并行行动 | 取消传统交替回合，Actor 独立思考、移动、施法 | 已取代旧回合方案 |
| Tick | Battle 逻辑最小单位 200 ms；规则持续时间以整数 Tick 表示，LLM 实际耗时向上量化到 Tick | 产品方向；暂停/恢复细节待定 |
| 事件队列 | 所有异步结果先登记为事件；每个 Tick 从队列取出到期事件，统一归并和结算，再安排未来事件 | 核心架构方向 |
| 决策 | 一次 LLM 请求给一段短期计划，不逐格请求；冲突/受击/计划结束后重规划 | 产品方向 |
| 移动与技能 | 移动逐格执行和预约；在起点或某格完成后发现目标入射程，则停止后续移动并开始施法 | 产品方向 |
| 碰撞 | 只预约下一格；同 Tick 争同格统一裁决，失败者结束当前计划并重新决策 | 产品方向；平局算法待定 |
| 普通单体技能 | 合法起手后锁定 Actor；目标普通移动不会使该技能自动落空 | v0 建议默认 |
| 技能限制 | v0 **不引入 MP**；以后可按技能选择冷却、次数、能量、弹药等限制形式 | 已明确移除 MP 前提 |
| 受击 | 有效伤害中断当前计划/施法/旧决策并立即重规划；进入有上限的保护 | 产品方向 |
| 保护行为 | 保护期间允许思考和移动，**不能开始攻击/施法**；免疫进一步伤害与中断，不刷新保护 | 当前 v0 规则 |
| 技能视觉 | 结算后只在命中格叠一张贴图，按 Tick 阶段渐显渐隐 | 产品方向；具体 Browser 接口待定 |
| 玩家指导 | 未来四选一指导影响我方下一次 LLM 请求；原型可固定 guidance 或跳过 | 后续交互设计 |

**未冻结的平衡值：**地图大小、一次计划最大移动格数、单格移动 Tick 数、技能射程/伤害/蓄力 Tick、保护 Tick 数等均需实测。当前唯一明确的基础时间粒度是 **200 ms/Tick**。


## 3. 权威归属与框架边界

- **Battle Map/Actor Runtime：**唯一地图格子、地形通行、Actor 已提交坐标/方向、下一格预约、逐格移动进度与占位来源。Battle 不再把 RPGMap Runtime 当位置权威。
- **Battle Combat：**唯一 Tick、事件队列、事件排序、Actor 行动状态/计划代次、HP、技能规则、伤害、中断、保护、日志与胜负来源。
- **Decision Adapter：**根据当前观察与合法计划调用对应 LLM，只返回提议计划与调用元数据；没有状态提交权。
- **Presentation：**读取 Battle 已提交的地图、Actor、动作和技能效果状态进行绘制。渲染帧率可高于 5 FPS，但动画回调不决定位置、命中、HP 或 Tick。
- **LoomRealm Main：**保留 Session、Activation、InputTarget、Frame 等现有框架权威。一场 Battle 仍在一个长生命周期 Subsystem Frame 中运行，不改 Hostra/Main 的职责。

Battle 只维护**一份可写的 Actor 逻辑坐标**。Browser 可以根据「起点、终点、动作起止 Tick」插值绘制角色，但半格视觉位置不是规则位置。

技能射程、地图通行和角色占位都是 Battle 规则的一部分，但它们是不同概念：地形不可通行不自动等于技能存在 LOS 阻挡。


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

Battle 使用固定逻辑粒度 `tickDurationMs = 200`。真实世界的异步操作可以在任意时刻完成，但只能在对应的 Tick 边界转化为权威事件。

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

- `decision_ready`：LLM 结果可在某 Tick 使用；
- `move_complete`：某一格移动到期；
- `cast_complete`：技能蓄力到期，进入候选命中集合；
- `protection_expire`：受击保护到期；
- `timeout` / `cancel`：决策或外部生命周期事件。

Promise/`setTimeout`/网络回调只负责**登记事件或记录完成时刻**，不得直接修改 Actor 坐标、HP、技能和胜负。

每个 Tick 的基本循环是：

```text
读取单调时钟
  → 计算当前应推进到的逻辑 Tick
  → 取出本 Tick 到期事件的固定快照
  → 按确定规则归并/批量结算
  → 更新一次权威状态
  → 根据结果把未来事件加入队列
  → 发布表现快照
```

处理某 Tick 时新产生的「未来动作」默认最早从后续 Tick 生效；不能不断重新抽取刚刚入队的同 Tick 事件形成零时间循环。伤害触发保护、代次失效等属于当前批次的同步状态归约，不通过递归事件回调抢跑。

### 5.2 时间量化

- 规则动作持续时间使用整数 Tick。
- LLM 从请求开始时刻到响应完成时刻的**实际耗时计入战斗**。例如耗时 500 ms，则最早按 3 Tick / 600 ms 对齐使用。
- 两个 Actor 的 LLM 请求互不暂停战斗；一方 Thinking 时另一方可以移动或施法。
- 逻辑 Tick 不等于浏览器渲染帧。Browser 可以 60 FPS 插值，但规则只看整数 Tick 与整数格。
- 所有同一 Tick 的到期事件先收集后处理，不能让 Promise 回调、网络返回或 DOM 帧先后决定胜负。
- 调度器必须使用单调时间源。页面失焦、系统暂停、积压 Tick 是「补跑还是暂停战斗」仍待明确，但不能靠 `setInterval(200)` 的调用次数充当权威时钟。

### 5.3 时间计算示例（平衡参数非定稿）

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
moving --move_complete--> [入射程] casting / [继续] moving / [计划结束] thinking
casting --cast_complete--> thinking
moving/casting/thinking --受到有效伤害且存活--> interrupted → thinking
任意活动状态 --HP 归零或 Frame 取消--> dead / terminated
```

`protectedUntilTick` 是叠加状态：保护期间 Actor 可以 Thinking 或 Moving，但**不得开始 Casting/Attack**。保护结束后，攻击能力恢复。

取消使用代次而不是依赖「一定能从队列物理删除事件」：

- 每个行动使用 `actionGeneration`；
- 每个 LLM 请求使用 `decisionGeneration`；
- 受击、死亡、明确取消时增加对应代次；
- 旧 `move_complete`、`cast_complete` 或迟到 LLM 结果即使仍在队列中，到期时发现代次不匹配就丢弃。

Battle 数据概念（非 TypeScript Schema）：

```text
BattleSession
  battleId / sceneEpoch / stateVersion / currentTick / tickDurationMs / status
  eventQueue
  map: Battle-owned map state
  actors[actorId]:
    team / hp / skills / actionState
    x / y / facing
    planId / actionGeneration / decisionGeneration / targetActorId
    protectedUntilTick
  decisions[actorId]:
    requestId / startedAtMonotonicMs / startedAtTick
    completedAtMonotonicMs? / dueTick? / status
  reservations: next-tile claims for the current/future step
  history: decisions, movements, casts, damage, collision, interruption, protection and results
  result: ally win / enemy win / simultaneous defeat / cancelled / failure
```

v0 不包含 MP 字段。以后若增加技能资源/次数/冷却，应作为明确技能机制加入，而不是预先把所有技能绑定到 MP。

## 7. LLM → 短期计划 → 条件执行

### 7.1 一次调用返回完整短期意图，不逐格提问

典型计划语义：「靠近敌人，最多移动若干格；沿途在**单格完成时**或起点发现敌人在该技能射程内，立即停步施法；否则继续，路线受阻或距离预算耗尽则重新决策。」途中不会每走一格都再次请求 LLM；目标提前进入射程，无需机械走到 `moveGoal`。

示意（不是可直接执行的固定 JSON Schema）：

```json
{
  "targetActorId": "enemy",
  "moveGoal": [4, 2],
  "maxMoveSteps": 3,
  "skillId": "firebolt",
  "castWhenInRange": true
}
```

允许的计划族至少包括接近并攻击、直接施法、只移动、原地保持/重新观察。具体候选组合与字段在动作契约阶段冻结：优先由 Battle/Map 构造候选 `planId`，LLM 只引用合法候选，或使用经严格 Schema 和规则验证的结构化计划；**绝不能把任意自然语言、虚构路线/技能或模型生成的伤害数值直接执行。**

### 7.2 执行时动态校验，不能因战场改变就无限重问

输入包含 `battleId / actorId / decisionGeneration / decisionId / observation / legalPlans / recentEvents / guidance?`，观察含双方可见 HP、位置、地形、技能/耗时、正在思考/移动/蓄力的公开状态、保护剩余 Tick 与最近冲突原因。v0 不发送 MP，因为当前核心规则不包含 MP。与旧版只需 `actionId` 和严格 `stateVersion` 相比，现在需要**计划身份与有效请求代次**：

1. 请求绑定当前 Actor 的 `decisionGeneration`。受击、死亡、退出或明确取消时立即使旧代次失效，迟到结果必须丢弃；取消信号尽力传递到 Adapter，但不能依赖网络取消一定生效。
2. 接受结果时重新检查起始条件和当前 Map/战斗事实；**敌人在请求期间正常移动，不自动使整份战略意图作废**，否则双边同时移动会造成无休止的过期重问。
3. 每步移动前重新检查通行与预约；每步落点提交后或在起点检查施法射程。条件不满足则继续预定短期移动；到达上限仍不满足时结束计划、重新决策。
4. 若起始计划无效、冲突或目标消失，停止计划，以最新观察及失败原因重规划；防止同一逻辑时刻零耗时无限重新请求。
5. 模型输出格式错误/非法候选可有限重试；超时/服务失败采用确定性保底（例如合法等待或安全保持），必须记录原因和真实耗时。**重试、超时、保底、下次可决策时刻与受击无敌上限需一并设计**，不能凭重试获得免费时间或无限保护。

平台现状：当前公开 `SubsystemScope` 未提供 LLM API；Decision Adapter 的调用宿主、授权、密钥保护、超时和取消需另立设计，不能捏造 `scope.llm`，也不让 Browser 持有密钥。可用可控延迟的模拟 Adapter 先验证行为和时间语义。


## 8. 移动：Battle 自有逐格执行与下一格预约

- 一份短期计划可以包含多步移动，但 Battle 只按格推进。每次开始下一步前由 Battle 自己检查地图边界、通行、Actor 占位和预约。
- **只预约下一格**，不一次锁住整条路线。预约从该步开始到 `move_complete` 或取消时释放。
- 逻辑坐标在定义好的提交边界变化；Browser 的移动动画只做起点到终点的视觉插值。Battle 不存在「半格权威位置」。
- 同一 Tick 两个 Actor 申请同一格时，先收集全部申请再统一裁决，最多一人成功；公平且可复现的平手算法待定，不依赖哪个异步回调先执行。
- v0 禁止两个 Actor 在同一 Tick 直接交换相邻格而穿过彼此。
- 预约失败者留在最后已提交合法格，结束当前计划，记录 `terrain / occupied / reserved / contested` 等原因，并发起新的 LLM 决策。
- 冲突后的新移动最早从后续 Tick 开始，不能在同一 Tick 反复「失败→重决策→再次争同格」。
- 受击只取消尚未完成的后续行动。某个已经开始的单步在受击边界是「提交目标格」还是「留在起点」必须在动作契约中选定一种无歧义规则；无论选择哪一种，都不能留下半格规则状态。

移动本身已经有 Tick 时间成本。是否增加起步/转向额外 Tick、疲劳或连续移动递增惩罚，先留作后续平衡问题，不在 v0 强制。


## 9. 技能：途中可触发、锁定 Actor、v0 不使用 MP

### 9.1 施法条件与命中

- 在计划开始的起点以及每个 `move_complete` 后，Battle 用最新整数格位置检查技能射程；如果目标已在射程内，停止后续移动并开始施法。
- v0 普通单体技能开始施法时验证技能存在、目标存活/合法、射程以及施法者当前**不处于受击保护**。通过后锁定 `targetActorId`，安排未来 `cast_complete` 事件。
- v0 **不引入 MP 或通用技能资源条**。技能限制以后可以按技能采用冷却、次数、能量、弹药或其他规则。
- 锁定型普通技能合法起手后，目标仅靠普通移动不会使技能自动落空。到期时如果施法没有被打断、目标仍有效且战斗未终止，则进入该 Tick 的候选命中集合。
- 施法者蓄力期间不能移动；受到未被保护抵挡的有效伤害后，旧 `actionGeneration` 失效，未来 `cast_complete` 自动作废。
- 保护期间不能开始新的攻击/施法。已经处于保护时，LLM 即使返回攻击计划也不能立即起手，应保留/重验计划或重新规划，精确策略待动作契约冻结。
- 地形通行不自动等于技能 LOS。v0 可以先不做 LOS；固定格子 AOE、闪避、脱锁、抛射物、移动施法等后续扩展。

技能验收样本仅需要：`skillId`、目标规则、射程、伤害、蓄力 Tick 与效果资源。所有具体数值均非定稿。

### 9.2 效果表现

只在已经结算的技能事件上生成唯一 `effectId`，把一张贴图锚定到命中时目标的已提交格子；视觉阶段按 Tick 描述，Browser 可在阶段内部做平滑插值。

```json
{
  "effectId": "effect-00012",
  "sceneEpoch": 1,
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

Browser 按 `effectId` 去重和清理。动画不决定伤害、生死、Tick 或战斗结果；Frame 终止时清理旧效果。具体地图 View/Custom Element 方案在 Presentation 设计阶段确认。


## 10. 受击：中断、重新决策和保护窗口

受到真正造成伤害且未被保护抵挡的命中时，本 Tick 先按统一命中批次应用伤害并判断死亡。存活 Actor：

1. 使当前移动计划、未完成施法和旧 LLM 请求的代次失效；
2. 立即启动新的 LLM 决策；
3. 进入有上限的受击保护；
4. 在保护期间可以思考和移动用于脱险，**不能开始攻击/施法**；
5. 保护期间后续攻击不造成伤害、不再次中断，也**不刷新/延长保护**；
6. 保护到期后恢复正常受击与攻击能力。

保护的最大持续时间必须由命中 Tick/配置决定，不能因为 LLM 长时间不返回而无限延长。LLM 超时后采用确定性保底行为，但具体超时 Tick、保护 Tick 数和保底动作仍待实测。

同一 Tick 的多次候选攻击按**该 Tick 命中批次开始前的保护状态**判断。此 Tick 新产生的保护只影响后续 Tick，不回溯抵消已经属于本批次的其他命中。因此同 Tick 双方都受到致命伤害时可以产生 simultaneous defeat。

保护期间禁止攻击是当前 v0 明确规则；未来如果要加入格挡、反击、受击硬直或不同技能的无敌穿透，再作为独立机制扩展。


## 11. Tick 事件循环与同时事件处理

Battle 采用类似 JavaScript Event Loop 的思想，但不是把 JS 回调顺序当成游戏规则：**异步结果入 Battle 自有事件队列，固定 Tick 批量取出、统一归约。**

每个 Tick 建议执行以下流程：

1. **截取到期事件快照**：取出 `dueTick <= currentTick` 且尚未处理的事件，形成这一 Tick 的固定输入集合。处理期间新排入的未来动作不重新进入本批次。
2. **过滤失效代次**：丢弃已死亡 Actor、旧 `actionGeneration`、旧 `decisionGeneration`、已取消 Battle 对应的事件。
3. **完成移动事件**：归并本 Tick 到期的 `move_complete`，按移动提交规则更新整数格位置、释放旧预约。
4. **收集技能到期事件**：把有效 `cast_complete` 放入同一候选命中集合，而不是逐条立即扣 HP。
5. **批量结算命中/伤害**：基于命中批次开始前的目标/保护状态统一计算，再同步应用 HP 变化；同 Tick 已经到期的双方攻击不会因代码处理顺序互相吞掉。
6. **终局闸门**：如果本批次产生死亡/双亡并满足战斗结束条件，立即冻结新的游戏行为。后续只允许必要日志/表现/Frame 收尾，不再接受新决策或启动移动/技能。
7. **处理受击后果**：对仍存活的受击者使旧代次失效、建立固定上限保护、安排新的决策请求；本 Tick 新保护不影响第 5 步。
8. **接收 `decision_ready`**：验证仍然有效的 LLM 结果，以最新战场检查计划起始条件。迟到、被中断或属于旧代次的结果丢弃。
9. **检查计划即时条件**：未死亡且未蓄力的 Actor 在当前整数格检查是否已可施法；受保护 Actor禁止起手攻击。
10. **统一下一格预约**：其余移动计划同时申请下一格并裁决冲突；失败者记录原因并进入后续 Tick 的重新决策流程，成功者安排未来 `move_complete`。
11. **安排未来事件并发布快照**：把技能完成、移动完成、保护到期、超时等事件加入队列，递增状态版本并投影到 Browser。

### 11.1 事件调度约束

- 事件处理必须确定性：同样初始状态、同样 LLM 完成时间和同样计划，应得到同样结果。
- `eventId` 只用于稳定记录/平手排序，不能让网络到达顺序成为战斗优势。
- 已被取消的未来事件可以留在优先队列中惰性丢弃，避免复杂的物理删除；代次检查是最终安全边界。
- 事件循环不允许同一 Tick 无限重入。冲突后重新移动、非法计划后的再次尝试等至少跨过一个逻辑 Tick。
- Tick 调度基于单调时钟，不依赖 `setInterval` 准点。若宿主晚醒，应按明确的暂停/追赶策略计算应该处理到哪个 Tick。
- 同一个 Tick 内的纯状态后果（如伤害后设置保护、使旧代次失效）可以在一次 reducer 中完成，不必再排一个零延迟事件。

精确的移动提交边界、暂停/后台恢复、积压 Tick 是否逐个补跑或批量推进、同 Tick 多种事件的最终排序表，仍需用状态机契约和测试矩阵冻结。

## 12. 玩家指导、Frame 生命周期及退出

未来玩家以「训练师」身份给我方下一次决策从四张**预配置**卡里选一张，指导仅成为本次 LLM 观察的一项临时文本：不直接修改 HP、伤害、位置、保护或其他战斗事实，也不保证模型一定遵从。v0 可先固定 guidance 或跳过；四卡生成/优化、长期人格、跨战记忆和战后训练不在当前闭环。

由于双方同时独立行动，**不得沿用**旧 `await_guidance → ally turn → enemy turn` 的全局回合状态机。指导如何不阻塞敌方时间轴、何时读取下一条指导以及用户按钮如何进入受控输入链，尚需设计；Web Presentation 只读事实，不允许 DOM 直接修改 BattleState。Frame 取消时应失效所有决策代次、停止动作与效果、清理订阅/资源，并按现有 `FrameOutcome` 合法形状返回；Battle 结束后禁止继续提交迟到动作或伤害。

## 13. MVP 验收与实施顺序

### 13.1 真实行为验收

- 一张与既有素材/地图形式兼容的 Battle 地图、两个合法可见 Sprite；双方位置只源于 Battle 自有地图权威，均能执行多步计划，各单步有移动动画且不逐步请求 LLM。
- 同一游戏时段一方移动、一方施法或思考；LLM 真实耗时 500 ms 从边界开始按 600 ms 生效，期间对手不暂停，过期/迟到请求不可执行。
- 移动起点或途中进入射程，停止剩余步并开始蓄力；目标正常挪开后普通锁定技能仍能命中其最新位置，并正确显示格子渐显渐隐。
- 双方同 Tick 争一格无重叠；失败方保留已走合法格子、收到原因、重新决策，不在同 Tick 无限重试。
- 技能未完成时受伤中断并取消旧决策；受击保护期间不重复伤害/打断、可以思考和移动但不能开始攻击/施法，也不会因再次命中刷新保护；到期后恢复攻击和正常受击。
- 同 Tick 双技能命中按批处理，无顺序作弊；双亡有明确结果。无效回答、超时、模型异常、取消、Browser 动画掉帧不篡改战场。
- 真实 Browser 可见性用 Browser E2E 单独验收，不用 Domain 提交冒充画面 ACK。实际服务延迟、超时、Tick 调度和公平性需测量并记录，不把模拟适配器通过当真实 LLM 接入通过。

### 13.2 实施依赖顺序

冻结 Battle 自有地图/Actor 输入 Schema 与素材兼容边界 → 实现/冻结 200 ms Tick + 事件队列 + Actor 状态机 → 实现逐格移动/预约/冲突 → 冻结受击保护与技能结算时序 → 确认 Browser 地图/技能贴图表现接口 → 用可控延迟模拟 Adapter 验证并发与故障 → 设计并接入受控 LLM 服务/玩家指导 → 实际 Hostra/Browser E2E。

**明确不在 v0：**传统交替回合、复用 RPGMap Runtime、逐格调用 LLM、MP/通用技能资源系统、职业/装备/升级、多单位、复杂状态/AOE/弹道/粒子/动画编辑器、跨图探索、提示词优化及评测、跨战训练档案、模型微调。多格移动、移动途中施法触发和 Battle 自有事件队列**已进入 v0**。


## 14. 尚需确认的关键问题（不得暗定）

1. Battle 要兼容到什么程度的 RPGMap 地图/Tileset/Character 素材形式；哪些结构直接复用 Content Schema，哪些转换为 Battle 专用输入？
2. 单格移动的权威提交点：开始移动即占新格、完成事件才提交，还是使用「起点占用 + 目标预约」双状态；受击发生在移动中时如何收束？
3. 事件队列的数据结构、稳定排序键、单调时钟来源；宿主失焦/暂停后是暂停战斗、逐 Tick 追赶还是压缩推进积压 Tick？
4. LLM 请求若从 Tick 边界发起，实际完成时间怎样映射 `dueTick`；超时、取消、服务错误及宿主事件循环延迟如何记录和量化？
5. 合法计划是完全枚举 `planId`，还是受限 Schema 参数；默认最大移动步数与重新规划节奏如何控制调用成本？
6. 同格预约冲突的公平平手算法、失败后最小重试 Tick，以及狭窄地形中反复争格的策略信息。
7. 受击保护持续 Tick 数、LLM 超时与保护上限的关系；当前已明确保护期间不能攻击、不会被再次伤害/中断、也不会刷新保护。
8. 技能射程度量、LOS、技能到期时目标死亡/保护/场景取消的统一有效性检查；未来技能限制采用何种机制不在 v0 预设。
9. Browser 地图/双 Sprite/技能贴图的投影节点和生命周期；表现必须消费 Battle 权威状态，不反向提交。
10. LLM 受控宿主/API/凭据/取消/响应计时，以及未来四选一指导如何通过现有授权 InputTarget。
11. 长期无伤害追逐或 AI 持续无效规划目前不强制设置战斗时长上限；模拟测试必须能够识别并报告「长时间无进展」，之后再决定是否增加僵局规则。
12. 工作区维护：Battle 包的根 `package-lock.json` 同步与 `npm ci` 仍需单独核验；本文档更新不代表运行代码已交付。

**执行约束：**先用可控时间的模拟决策器验证事件顺序、取消、冲突、保护与同时命中，再接真实 LLM。具体 API/数值只有在状态机契约、测试矩阵和真实运行证据具备后才算冻结。

