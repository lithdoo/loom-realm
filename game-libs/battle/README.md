# Battle 游戏库

> 状态：**Design only / 未实现**。当前 Battle 规范已经完成结构重构，但还没有 Runtime `src/`、运行入口、构建/测试通过结论或可加载的 LoomRealm Subsystem。

Battle 是一个独立的双 Actor 同时行动战斗系统：

> **Decision 决定想做什么；Simulation 决定能不能做、什么时候发生、结果是什么；Presentation 决定怎么显示。**

Battle 使用 200 ms/Tick 的确定性 Simulation，不复用 RPGMap Runtime；只兼容已有 Map/Tileset/Autotile/Character Graphics 的资源形式。

## 文档入口

不要从 README 推断具体规则。当前规范按职责拆分为：

- **[BATTLE_V0_SPEC.md](./docs/BATTLE_V0_SPEC.md)** — 唯一核心 gameplay/runtime 规范，含 Rule IDs、Tick reducer、OPEN/non-goals。
- **[BATTLE_V0_CONTRACTS.md](./docs/BATTLE_V0_CONTRACTS.md)** — Content、Observation、PlanSubmission、Snapshot、Event、Projection 等数据契约。
- **[BATTLE_V0_INTEGRATION.md](./docs/BATTLE_V0_INTEGRATION.md)** — RPGMap 素材兼容、Presentation、LLM Adapter、Host/Frame、Guidance、workspace 集成。
- **[BATTLE_V0_TEST_MATRIX.md](./docs/BATTLE_V0_TEST_MATRIX.md)** — Rule ID → 场景 → 预期结果的验收矩阵。
- **[BATTLE_V0_DESIGN.md](./docs/BATTLE_V0_DESIGN.md)** — 文档索引、旧章节迁移表和历史说明。

权威顺序：

```text
SPEC
→ CONTRACTS
→ INTEGRATION
→ TEST_MATRIX
```

README 与 DESIGN 索引不覆盖上述规范。

## 当前核心方向

已经冻结的核心边界包括：

- 双 Actor 同时行动，无传统交替回合；
- Simulation 是唯一业务权威；
- Decision / Simulation / Presentation 的 concrete implementation 彼此解耦，只共享纯数据 Contracts；Host/Coordinator 负责 wiring；
- Simulation 发布 Snapshot/Event/RenderProjection，不直接调用或等待 Presentation；Presentation 可用 Scene/Projection 数据独立初始化和测试；
- 1 Tick = 200 ms，积压 Tick 顺序补算；
- Decision 直接生成结构化 `PlanSubmission`，Simulation 只校验/执行；
- 单格移动使用 committed origin + next-tile reservation + move_complete 原子提交，但 active step 可被 damaging hit 立即中断；
- move_start 瞬间更新 direction；v0 保留独立原地 `turn` Action；
- 同格竞争使用 `battleSeed` 的可回放等概率伪随机；
- range matrix 同时表达方向相对范围与 deterministic coefficient；
- `minCoefficient` 只控制技能起手，resolve 使用当前 coefficient；
- v0 无 `tracking`，范围外为 `miss`；
- coefficient Runtime 千分制，damage 向下取整；
- `windup_ticks=0` 使用 bounded instant-resolve batch；
- Recovery 是行动锁，不是思考锁；
- protection、同 Tick batch damage、simultaneous defeat 有确定语义；
- `finalDamage=0` 的 `hit` 不触发 interruption/protection/redecision；
- v0 不做 LOS；
- pause/background 冻结 Battle clock；
- v0 不设正式 stalemate / 最大战斗时长；
- Presentation/Browser/camera 不反向修改 Simulation。

具体语义请只查 SPEC Rule IDs。

## 当前 OPEN

**Core gameplay 当前没有未冻结 OPEN 项。**

此前关于 direction/turn、移动中致命受击、zero-damage hit、LOS、pause/background clock、stalemate 的问题都已经冻结进 SPEC。

仍待冻结的是数据/集成细节，例如：

- Content subject/version、key/id 和正式 Schema；
- BattleEffect / RenderProjection exact shape；
- Decision Adapter error/cancel/deadline 接口；
- Guidance Host/InputTarget wiring。

这些 OPEN 不得改变已经冻结的 Core gameplay 语义。

## 下一阶段

优先顺序：

```text
Content/Contracts schema
→ validator
→ headless Simulation
→ Mock/Script Decision
→ frozen-rule tests
→ Presentation
→ real LLM Decision
→ Guidance / Host E2E
```

## Workspace 注意

根 `package.json` 通过 `game-libs/*` 识别 Battle 包，但根 `package-lock.json` 同步与 `npm ci` 仍需在实现阶段单独验证。

本次文档重构不代表 Battle Runtime、build、unit test 或 Browser E2E 已完成。
