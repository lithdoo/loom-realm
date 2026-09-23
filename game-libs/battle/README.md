# Battle 游戏库（设计占位包）

> 状态：**Design only / 未实现**。当前只有包清单和设计文档，没有 `src/`、运行入口、导出、依赖、构建脚本或测试，不能当作可加载的 LoomRealm Subsystem。

唯一主设计文档：[`docs/BATTLE_V0_DESIGN.md`](./docs/BATTLE_V0_DESIGN.md)（2026-09-23 修订）。

## 一句话定位

Battle 计划实现一个**独立的双 Actor 战斗运行时**：不复用 RPGMap Runtime，只沿用/兼容其地图、Tileset、Character Sprite 等素材形式及格子/通行/角色方向等地图角色逻辑概念。Battle 自己拥有地图坐标、占位、逐格移动、下一格预约和冲突权威。

双方同时行动，Battle 以 **200 ms/Tick** 和**自有事件队列**统一调度 LLM 决策、移动完成、技能完成、受击中断和保护到期。LLM 的实际调用耗时计入战斗并向上量化到 Tick；网络/Promise 回调只登记事件，不能直接修改战斗状态。

一次 LLM 调用生成一段短期计划；角色可以连续逐格移动，并在起点或某格完成后进入技能射程时停止后续移动、开始施法。v0 普通单体技能建议锁定 Actor，目标普通移动不会自动让技能落空。

v0 **不引入 MP 或固定技能资源系统**。技能以后可按需要增加冷却、次数、能量、弹药等限制。受到有效伤害时会中断旧计划/施法/决策并触发重新思考；受击保护期间允许思考和移动用于脱险，但**不能攻击/施法**，也不会因再次被攻击而刷新保护。

## 当前真实待实现点

- Battle 自有地图/Actor Runtime 尚未实现；需要明确兼容哪些 RPGMap 地图/Tileset/Character 素材结构，但不再要求 RPGMap 提供双 Actor 移动 API。
- 200 ms Tick、事件优先队列、代次取消、逐格预约、同 Tick 冲突、批量伤害和终局闸门均仍是设计。
- `SubsystemScope` 尚无公开 LLM 服务；Decision Adapter 的宿主、授权、密钥、取消、真实耗时计量和超时需要受控接口。
- Web Presentation 只负责表现：双 Sprite、地图投影和技能格子贴图需要消费 Battle 权威状态，不能由 DOM 反向修改战斗事实。
- 玩家未来通过四选一提示卡指导我方；v0 可固定 guidance 或跳过。提示词优化、跨战学习和长期记忆不属于核心闭环。
- 这里只修订文档，没有实现 Battle Runtime，也未运行构建、单测或 Browser E2E。

## npm workspace 遗留注意

根 `package.json` 通过 `game-libs/*` 识别 Battle 包，但 Battle 包先前合入时未同步根 `package-lock.json`；此项仍需单独处理并验证 `npm ci`。本次文档更新不解决锁文件问题，也不宣称构建通过。
