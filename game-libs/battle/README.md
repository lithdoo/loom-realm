# Battle 游戏库（设计占位包）

> 状态：**Design only / 未实现**。当前只有包清单和设计文档，没有 `src/`、运行入口、导出、依赖、构建脚本或测试，不能当作可加载的 LoomRealm Subsystem。

唯一主设计文档：[`docs/BATTLE_V0_DESIGN.md`](./docs/BATTLE_V0_DESIGN.md)（2026-09-24 修订）。

## 三层架构

Battle 明确拆成三个运行层：

- **Simulation（行为/规则层）**：唯一战斗权威。负责 200 ms Tick、事件队列、地图格子、Actor 坐标与占位、逐格移动/预约、技能、伤害、保护、中断、合法计划、行为提交结果和 Battle Result。
- **Presentation（渲染/表现层）**：与决策无关，只消费 Simulation 的 Render Projection。负责地图、角色 Sprite、移动插值、技能特效、摄像机与资源绘制；动画完成、掉帧或 DOM 状态不能反向修改战斗事实。
- **Decision（决策层）**：可拔插的计划生成器。从 Simulation 获取 Observation / Legal Plans / Recent Events，通过 Mock、脚本、手动策略或 LLM 选择 `planId`，再提交给 Simulation。Decision 不直接读取 Sprite、DOM、camera 或动画进度作为战斗事实。

一句话：**Decision 决定想做什么；Simulation 决定能不能做、什么时候发生、结果是什么；Presentation 决定怎么显示。**

实现时建议增加一个很薄的 `battle/contracts` 类型边界（不是第四个运行层），定义 `BattleSnapshot`、`BattleObservation`、`LegalPlan`、`PlanSubmission`、`BattleEvent`、`RenderProjection` 等公共数据契约。

## Content 模型

v0 新增三个 Battle Content 概念：

- **`struct.BattleActor`**：角色静态定义，包含名字、现有 Character Graphics、`max_hp` 和 `skills[]`。当前 HP、位置、朝向等属于每场战斗的 Runtime State。
- **`struct.BattleSkill`**：技能规则，包含范围矩阵、基础伤害、`windup_ticks`、`recovery_ticks`、tracking 和 effect 引用。
- **`struct.BattleEffect`**：纯 Presentation 视觉定义，引用 `resource.Graphics/BattleEffects/...`，负责图片、锚点和渐入/停留/渐出；不会改变伤害和技能规则。

技能范围统一使用一张 m×n 矩阵，不额外保存 `origin`、`shape` 或 `rotate_with_facing`：

```json
[
  [0, 1, 0],
  [0, 1, 0],
  [0, "↑", 0]
]
```

约定 `"↑"` 必须且只能出现一次，表示施法者位置和 Content 的标准朝向；0 和矩阵外区域无效；正数表示合法目标格并同时作为效果系数。Actor 实际方向为左/右/下时，由 Simulation 旋转整个矩阵。

v0 仍只处理单目标 Actor；暂不拆 target matrix / effect matrix，也不增加地面选点、AOE 或额外 target/effect type。未来确有需求再扩展。

## 核心运行规则

Battle 不复用 RPGMap Runtime，但 **Map / Tileset / Autotile / Character Graphics 直接沿用现有 RPGMap 内容形式**。Battle 不新增 `BattleMap` 或 `BattleActorVisual`。

双方同时行动，Simulation 以 **200 ms/Tick** 和自有事件队列统一调度。宿主晚醒时逐 Tick 补算；单格移动采用**起点占用 + 终点预约 + `move_complete` 原子提交**。移动中受击不会取消已经开始的这一格，只取消后续计划。

一次 Decision 调用产生一段短期计划。v0 优先使用显式 `planId + path` 的合法候选，让路线本身成为决策的一部分；带技能候选额外携带 `minCoefficient`，让**出手时机**也保留为 Decision 的战术选择。每个 Actor 同时最多一个有效 Decision Request。

v0 不引入 MP 或固定技能资源系统。Skill 的范围矩阵只定义目标位置是否合法以及效果系数；**是否在当前合法位置立即出手属于 Plan 决策**。带技能的 LegalPlan 显式携带 `skillId + targetActorId + minCoefficient`：只有当前目标格系数达到本计划的 `minCoefficient` 才停止剩余移动并进入前摇，因此 AI 可以选择“远处尽快出手”或“继续靠近到更高系数再出手”。只移动计划不会因途中技能可用而自动攻击。规则时间先只保留前摇和后摇，前摇结束时结算。目标移动后的持续有效性由 tracking 决定，具体枚举仍待冻结。结算至少区分 `hit / immune / invalid`。受到有效伤害后进入固定上限保护：保护期间可以思考和移动，但不能攻击/施法；再次命中为 `immune`，不会刷新保护。

Frame abort / Battle cancel 属于控制平面，立即终止 Simulation 提交权，不等待下一个 Tick。

## 当前真实待实现点

- 三层都尚未实现；Simulation 必须先做到**无 Browser、无 LLM 也能被 Mock/Script 驱动跑完整场战斗**。
- Map/Tileset/Character 基础素材已决定沿用 RPGMap 格式；`BattleActor / BattleSkill / BattleEffect` 的正式 Content Schema subject/version、RenderProjection 和 Observation/LegalPlan Schema 尚未冻结。
- 200 ms 单调时钟、逐 Tick scheduler、事件优先队列、代次取消、原子逐格预约、范围矩阵旋转/系数、Plan `minCoefficient` 起手阈值、技能前摇/后摇、同 Tick 冲突、批量伤害和终局闸门均仍是设计。
- Presentation 的地图/双 Sprite/`BattleEffect` 投影、camera API 和 Browser 生命周期尚待设计；表现事件默认不是规则 ACK。
- `SubsystemScope` 尚无公开 LLM 服务；真实 LLM Decision 的宿主、授权、密钥、取消、完成时刻、deadline 和超时需要受控接口。
- 玩家未来通过四选一提示卡指导我方；v0 可固定 guidance 或跳过。提示词优化、跨战学习和长期记忆不属于核心闭环。
- 这里只修订文档，没有实现 Battle Runtime，也未运行构建、单测或 Browser E2E。

## npm workspace 遗留注意

根 `package.json` 通过 `game-libs/*` 识别 Battle 包，但 Battle 包先前合入时未同步根 `package-lock.json`；此项仍需单独处理并验证 `npm ci`。本次文档更新不解决锁文件问题，也不宣称构建通过。
