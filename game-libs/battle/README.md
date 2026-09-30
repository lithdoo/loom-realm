# Battle 游戏库

> 状态：**Battle v0 Simulation gameplay baseline FROZEN + IMPLEMENTED + TESTED + CLOSED-LOOP QUALIFIED；Presentation FROZEN + IMPLEMENTED + TESTED + CLOSED-LOOP QUALIFIED；Decision + Decision availability circuit FROZEN FOR IMPLEMENTATION**。既有 Simulation/Presentation closed-loop qualification 保持有效；DeepSeek concrete Decision 及连续 provider failure 自动暂停 Battle 的 live Runtime circuit 尚未落地。

Battle 是一个独立的双 Actor 同时行动战斗系统：

> **Decision 决定想做什么；Simulation 决定能不能做、什么时候发生、结果是什么；Presentation 决定怎么显示。**

Battle 使用 200 ms/Tick 的确定性 Simulation，不复用 RPGMap Runtime；只兼容已有 Map/Tileset/Autotile/Character Graphics 的资源形式。

## 文档入口

不要从 README 推断具体规则。当前规范按职责拆分为：

- **[BATTLE_V0_SPEC.md](./docs/BATTLE_V0_SPEC.md)** — 唯一核心 gameplay/runtime 规范，含 Rule IDs、Tick reducer、OPEN/non-goals。
- **[BATTLE_V0_CONTRACTS.md](./docs/BATTLE_V0_CONTRACTS.md)** — Content、Observation、PlanSubmission、Snapshot、Event、Projection 等数据契约。
- **[BATTLE_V0_SIMULATION.md](./docs/BATTLE_V0_SIMULATION.md)** — **FROZEN + IMPLEMENTED + TESTED + CLOSED-LOOP QUALIFIED**：Simulation Runtime state、Clock/scheduler、Decision/Plan pipeline、Tick transaction、events、Projection cadence、terminal arbitration、Snapshot/Replay 与测试 doubles。
- **[BATTLE_V0_DECISION.md](./docs/BATTLE_V0_DECISION.md)** — **FROZEN FOR IMPLEMENTATION**：DeepSeek-only concrete Decision、apiKey-only 配置、Analyze/Strategize/Materialize pipeline、Responses API、JSON Schema、parser、failure、timeout/retry/Abort、测试与 Agent contract。
- **[BATTLE_V0_INTEGRATION.md](./docs/BATTLE_V0_INTEGRATION.md)** — RPGMap 素材兼容、三层组合、Host/Frame、Decision credential wiring、Guidance、workspace 集成。
- **[BATTLE_V0_PRESENTATION.md](./docs/BATTLE_V0_PRESENTATION.md)** — **FROZEN + IMPLEMENTED + TESTED + CLOSED-LOOP QUALIFIED**：Presentation API、Render Tree/Browser ABI、world-coordinate motion、camera、viewport/resize、HUD/effects、lifecycle/failure 与 Agent execution contract。
- **[BATTLE_V0_TEST_MATRIX.md](./docs/BATTLE_V0_TEST_MATRIX.md)** — Rule ID → 场景 → 预期结果的验收矩阵。
- **[BATTLE_V0_DESIGN.md](./docs/BATTLE_V0_DESIGN.md)** — 文档索引、旧章节迁移表和历史说明。

权威顺序：

```text
SPEC
→ CONTRACTS
→ SIMULATION
→ DECISION
→ INTEGRATION
→ PRESENTATION
→ TEST_MATRIX
```

README 与 DESIGN 索引不覆盖上述规范。

## 当前核心方向

已经冻结的核心边界包括：

- v0 严格双 Actor 同时行动，无传统交替回合；validator 要求恰好 1 ally + 1 enemy；Actor cardinality 是 v0 rule，跨层与 Runtime 使用有界 ActorId-addressed collection，禁止用数组 slot 表达 identity；
- Simulation 是唯一业务权威；
- Decision / Simulation / Presentation 作为可独立导出、替换和测试的模块，只共享 Contracts/Ports，不依赖彼此的 concrete implementation；
- Simulation 是完整、自驱动的 Battle Runtime：自己拥有 200 ms Battle clock、scheduler、event queue、Tick reducer 与 accepted-plan execution；public session 采用 one-shot `run()`，并由 Runtime 统一拥有注入后的 Decision/Presentation lifecycle；Core 只依赖 BattleClock/AbortSignal/Ports 等窄 capability，不依赖整个 SubsystemScope/Frame；
- Simulation 可以通过注入的 DecisionPort / PresentationPort 使用具体组件，但不等待 Browser 动画/ACK 推进规则；Presentation 可用 Scene/Projection 数据独立初始化和测试；
- 使用 Battle 的业务 Subsystem 只负责构造三层、注入 Host capability 和映射 Frame/pause/abort 生命周期，不负责逐 Tick 实施 Battle；
- 1 Tick = 200 ms，积压 Tick 顺序补算；
- Decision 每次调用只完成一次 Plan/failure attempt；completion 不带 gameplay timing/dueTick，只即时进入 Simulation-owned inbox；Tick reducer 在 snapshot 边界消费，Simulation 拥有 generation、stale 判定、Plan validation、correction retry 与 bounded active/pending accepted-plan pipeline；
- live Runtime 对连续 Decision service failure 使用固定 circuit breaker：连续 3 个 counted LLM/provider failure 后自动进入 PAUSED、冻结 Battle clock、abort active Decision 并停止新请求；必须显式 `battle.resume()` 才恢复；session_fatal 仍直接终止 Battle，Replay 不执行该 live availability policy；
- accepted Plan 采用逐 Action materialization：多格 path 只 materialize 当前一格；reservation 成功并 move_start 时消费该 path intent，但下一格必须等当前 `move_complete` 成功后才重新判断并尝试；未 materialize 的后续 intent 不产生 future event；
- Decision 与 Action 可以流水重叠，但只有当前 Plan 的 future intent 已全部 materialize 后才能预取下一 Decision；v0 最多保留一份 pending accepted plan，不建立无界 Plan FIFO；
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
- Presentation/Browser/camera 不反向修改 Simulation；`visualEpoch`、layout/camera/effect visual lifetime 属于 Presentation-local，Simulation 不发布 visualEpoch。

具体语义请只查 SPEC Rule IDs。

## 当前 OPEN

**Core gameplay 当前没有未冻结 OPEN 项；Simulation blocking implementation OPEN = 0。**

此前关于 direction/turn、移动中致命受击、zero-damage hit、LOS、pause/background clock、stalemate 的问题都已经冻结进 SPEC。

**Presentation v0 Blocking OPEN = 0。** Presentation 所需 BattleEffect / BattleSceneInit / RenderProjection / SkillEffectProjection、Render Tree、Browser data ABI、camera/viewport/effect/lifecycle、effect stacking 与 Renderer capacity failure policy 已冻结。

仍保持 OPEN 的只包括不阻塞 Simulation/Presentation implementation 的外部/后续细节，例如：

- BattleActor/BattleSkill 等非 Presentation Content 的统一 subject/version、key/id 与部分正式 Schema；
- Decision v0 concrete implementation 已在 **BATTLE_V0_DECISION.md** 达到 **FROZEN FOR IMPLEMENTATION**：DeepSeek only、外部仅 `apiKey`、固定 `deepseek-flash` + Responses API、每次 `decide()` 自包含 Call A + Call B、direct JSON Schema output、本地 parser、60s/request timeout、no automatic retry、failure codes 与 Abort semantics 均已唯一化；剩余仅 Host 到 concrete Decision 的 credential/composition wiring，不再有 blocking Decision implementation OPEN；
- Guidance Host/InputTarget wiring；
- Host suspend/resume 来源到 `battle.pause()/resume()` 的具体 composition wiring。

Decision completion wall-clock mapping 与 gameplay Decision deadline 已从 v0 删除，不再属于 OPEN；provider timeout 只作为基础设施失败策略。

这些 OPEN 不得改变已经冻结的 Core gameplay 或 Presentation ABI/行为语义。

`game-libs/tile-presentation` / `@loomrealm-game/tile-presentation` 已落地，Map 与 Battle Presentation 都直接消费其中已验证的纯 tile viewport/layout shared implementation。Battle 不复制 Map layout 代码，也不依赖 `@loomrealm-game/map` Runtime。Presentation specification 保持冻结，实现与测试已落地。

## 下一阶段

优先顺序：

```text
Resolved Battle input/validator
→ **已完成：按 FROZEN Simulation spec 实现 self-driven headless Simulation Runtime**
→ DecisionPort + Mock/Script Decision
→ frozen-rule tests
→ 已完成：@loomrealm-game/tile-presentation 抽取 + Map 切换/回归
→ **已完成：按 FROZEN Presentation Agent contract 实现 PresentationPort + Browser Presentation**
→ business Subsystem thin composition
→ **下一步：按 FROZEN Decision spec 实现 DeepSeekDecision**
→ Guidance / Host E2E
```

## Workspace 注意

根 `package.json` 通过 `game-libs/*` 识别 Battle 包，根 `package-lock.json` 已通过干净 `npm ci` 验证。官方 Presentation qualification 命令是：

```text
npm run test:battle
```

该命令明确构建 subsystem、renderer、tile-presentation、battle，并运行 Battle Simulation unit/acceptance 与 Presentation/Browser E2E。Battle v0 Simulation 与 Presentation 均已完成 closed-loop qualification；真实 provider、Guidance 与业务 Host composition 仍按 Integration 文档作为独立后续集成项。
