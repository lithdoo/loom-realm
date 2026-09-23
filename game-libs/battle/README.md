# Battle 游戏库（设计占位包）

> 状态：**Design only / 未实现**。当前只有包清单和设计文档，没有 `src/`、运行入口、导出、依赖、构建脚本或测试，不能当作可加载的 LoomRealm Subsystem。

唯一主设计文档：[`docs/BATTLE_V0_DESIGN.md`](./docs/BATTLE_V0_DESIGN.md)（2026-09-23 修订）。文档取代早期轮流行动、一次走一格、Move/Skill/Wait 互斥的草案；旧方案不再是当前 v0 规则。

## 一句话定位

Battle 在同一个 Subsystem Frame 中承载两个**同时行动**的 AI Actor：复用 RPGMap 的地图、通行和 Sprite 运动；Battle 按 **200 ms/Tick** 管理时间、短期计划、格子预约冲突、施法、伤害、受击中断、无敌保护和胜负；LLM 的**实际调用耗时计入战斗时间并向上量化到 Tick**。一次模型请求产生一段短期计划，角色可连续逐格移动，并在途中进入射程时停步施法，不逐格调用模型。技能表现仅在命中格叠加贴图渐显渐隐。

普通 v0 单体技能**建议**在合法起手时锁定目标 Actor：目标正常移动不会自动造成落空，技能仍可能因施法者有效受击而中断。冲突采用下一格预约；失败方停在最后合法位置，获得阻挡原因并重新决策。受击后取消旧计划，立即启动新 LLM 决策，并给予**有上限**的保护和短暂脱险机会。具体技能数值、移动惩罚、保护持续时间、Tick 相位边界和冲突平局算法尚待冻结，详见主文档。

玩家未来以四选一提示卡指导我方；v0 可用固定 guidance 或跳过。提示词优化、跨战学习和长期记忆不属于当前核心闭环。

## 当前真实依赖与待实现点

- 当前可核对的 RPGMap 基线以单一 Player + 键盘移动为中心，规划的 RPGMap v1 NPC 仍为静态。Battle 需要额外的双可移动 Actor、受控逐格运动、下一格预约和同 Tick 冲突接口；不能宣称已有。
- 现有 `SubsystemScope` 尚无公开 LLM 服务；Decision Adapter 的宿主、授权、密钥、取消、耗时计量和超时需要受控接口。
- Web Presentation 只负责表现：技能格子贴图、双 Sprite 和未来的四选一输入映射需另行确定，不允许 DOM 直接改写战斗事实。
- 这里只修订文档，未修改 Map、Main、Renderer、Hostra、示例或任何运行代码，也未运行测试。

## npm workspace 遗留注意

根 `package.json` 通过 `game-libs/*` 识别新包，但 Battle 包先前合入时未同步根 `package-lock.json`；此项仍需在具备仓库环境时执行 `npm install --package-lock-only --ignore-scripts`、提交更新并验证 `npm ci`。本次文档更新不解决锁文件问题，也不宣称构建通过。
