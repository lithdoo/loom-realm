# Battle 游戏库（设计占位包）

> 状态：**Design only / 未实现**。当前只有包清单和设计文档，没有 `src/`、运行入口、导出、依赖、构建脚本或测试，不能当作可加载的 LoomRealm Subsystem。

唯一主设计文档：[`docs/BATTLE_V0_DESIGN.md`](./docs/BATTLE_V0_DESIGN.md)（2026-09-23 修订）。

## 一句话定位

Battle 计划实现一个**独立的双 Actor 战斗运行时**：不复用 RPGMap Runtime，只沿用/兼容其地图、Tileset、Character Sprite 等素材形式及格子/通行/角色方向等地图角色逻辑概念。Battle 自己拥有地图坐标、占位、逐格移动、下一格预约和冲突权威。

双方同时行动，Battle 以 **200 ms/Tick** 和**自有事件队列**统一调度 LLM 决策、移动完成、技能完成、受击中断与保护。异步结果只登记完成事实；规则状态只在逻辑 Tick 的确定性归约中改变。宿主如果晚醒，必须按 Tick 逐个补处理，不能把不同 `dueTick` 压成同一批。

一次 LLM 调用生成一段短期计划。v0 优先使用显式 `planId + path` 的合法候选，让路线本身成为 AI 决策的一部分。单格移动采用**起点占用 + 终点预约 + `move_complete` 原子提交**；移动中受击不会取消已经开始的这一格，只取消后续计划。

v0 不引入 MP 或固定技能资源系统。普通单体技能建议锁定 Actor，结算至少区分 `hit / immune / invalid`。受到有效伤害后进入固定上限保护：保护期间可以思考和移动，但**不能攻击/施法**；再次被命中结算为 `immune`，不会刷新保护。LLM 可以保留攻击意图，保护结束后按最新战况重新检查是否起手。

每个 Actor 同时最多一个有效 Decision Request。Decision 的 timeout/ready 不依赖异步回调顺序，而根据真实完成时刻与 deadline 判断。Frame abort / Battle cancel 属于控制平面，**立即**终止提交权，不等待下一 Tick。

## 当前真实待实现点

- Battle 自有地图/Actor Runtime 尚未实现；需要明确兼容哪些 RPGMap 地图/Tileset/Character 素材结构。
- 200 ms 单调时钟、逐 Tick scheduler、事件优先队列、代次取消、单 Actor 单 Decision Request、原子逐格预约、同 Tick 冲突、批量伤害和终局闸门均仍是设计。
- 合法候选 path 的生成预算、同格冲突平手算法、技能射程/LOS、保护和移动的具体 Tick 数值仍待模拟测试。
- `SubsystemScope` 尚无公开 LLM 服务；Decision Adapter 的宿主、授权、密钥、取消、完成时刻、deadline 和超时需要受控接口。
- Web Presentation 只负责表现：双 Sprite、地图投影和技能格子贴图需要消费 Battle 权威状态，不能由 DOM 反向修改战斗事实。
- 玩家未来通过四选一提示卡指导我方；v0 可固定 guidance 或跳过。提示词优化、跨战学习和长期记忆不属于核心闭环。
- 这里只修订文档，没有实现 Battle Runtime，也未运行构建、单测或 Browser E2E。

## npm workspace 遗留注意

根 `package.json` 通过 `game-libs/*` 识别 Battle 包，但 Battle 包先前合入时未同步根 `package-lock.json`；此项仍需单独处理并验证 `npm ci`。本次文档更新不解决锁文件问题，也不宣称构建通过。
