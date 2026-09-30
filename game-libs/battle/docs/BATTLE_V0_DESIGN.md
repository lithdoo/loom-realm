# Battle v0 文档索引与迁移说明

> 状态：**Core gameplay 已冻结；Simulation gameplay baseline = FROZEN + IMPLEMENTED + TESTED + CLOSED-LOOP QUALIFIED；Presentation = FROZEN + IMPLEMENTED + TESTED + CLOSED-LOOP QUALIFIED；Decision + Decision availability circuit = FROZEN FOR IMPLEMENTATION**。DeepSeek concrete Decision、replaceable DecisionWorkflow boundary 与连续 provider failure 自动暂停 Battle 的 live Runtime policy 已唯一化；PlayerGuidance concrete contract 明确延期，真实实现/qualification 与 Host composition 仍属于后续工作。
>
> 本文件不再重复定义 Battle 规则。2026-09-25 起，原单体 `BATTLE_V0_DESIGN.md` 已重构为“核心规范 / 数据契约 / 集成说明 / 测试矩阵”四份文档，以避免同一规则在多个章节重复维护。
>
> 重构前的完整单体设计仍保留在 Git 历史中（可从主线提交 `4370fed33f3f1d3e628991fbb59157aec318f73c` 及更早历史查看）。规则迁移以本页映射表核对，历史讨论不再作为当前规范来源。

## 1. 当前文档结构

### 1.1 [BATTLE_V0_SPEC.md](./BATTLE_V0_SPEC.md) — 唯一核心规则源

负责：

- Simulation / Decision / Presentation 权威边界；
- 200 ms Tick 与事件队列；
- Runtime state invariants；
- Decision / PlanSubmission；
- 原子移动与 seeded contention；
- Skill range / coefficient / windup / recovery；
- hit / immune / miss / invalid；
- protection / interruption；
- Tick reducer 唯一处理顺序；
- BattleResult / cancel；
- deterministic replay；
- v0 non-goals；
- Core OPEN 状态（当前 gameplay blocking OPEN = 0）。

所有已冻结 gameplay/runtime 语义必须以这里的 Rule ID 为准。

### 1.2 [BATTLE_V0_CONTRACTS.md](./BATTLE_V0_CONTRACTS.md) — 数据契约

负责：

- `BattleActor / BattleSkill / BattleEffect` 逻辑 Content shape；
- `BattleConfig`；
- `BattleObservation`；
- `PlanConstraints`；
- `PlanSubmission / PlanConstraints / PlanRejectReason`；
- `BattleSnapshot`；
- 已冻结的 Presentation `BattleSceneInit / RenderProjection / SkillEffectProjection / BattleEffect`；
- Decision-facing shared data boundary；
- 其余非 Presentation subject/version、字段命名和正式 Schema OPEN。

Contracts 不重新定义玩法规则。

### 1.3 [BATTLE_V0_SIMULATION.md](./BATTLE_V0_SIMULATION.md) — Simulation Implementation Spec — baseline QUALIFIED；Decision availability circuit FROZEN FOR IMPLEMENTATION

负责：

- ResolvedBattleDefinition 与 Simulation input boundary；
- Runtime/Actor/Action/Decision/AcceptedPlan exact state；
- initialization 与 initial Decision request；
- BattleClock、scheduler、pause/resume、late-wake catch-up；
- ScheduledEventQueue / DecisionInbox exact boundary；
- TICK-001 transaction 与 shell/reducer command boundary；
- bounded active/pending Plan handoff；
- Projection cadence、motion/effect identity；
- terminal arbitration、BattleResult/Snapshot public semantics；
- Simulation-owned `BattleEvent`、`ReplayRecord / ReplayDriver`；
- async race semantics、BattleReplayBuilder、headless test doubles 与 Agent execution contract / Definition of Done。

Simulation 实施细节不得重新定义 SPEC gameplay Rule，也不得改变 Presentation frozen ABI。

### 1.4 [BATTLE_V0_DECISION.md](./BATTLE_V0_DECISION.md) — Decision Implementation Spec — FROZEN FOR IMPLEMENTATION

负责：

- concrete product implementation `DeepSeekDecision`；
- v0 DeepSeek-only / configured-`DeepSeekTransport`-only public Decision configuration；credential 不进入 `DeepSeekDecision` options；
- fixed `deepseek-flash` + Responses API transport profile；
- stable `DeepSeekDecision` shell + replaceable internal `DecisionWorkflow` orchestration seam；
- minimal internal layering = `DecisionPort → DecisionWorkflow → DeepSeekTransport`；Transport 只负责 HTTP，Workflow 负责 provider protocol，其他 formatter/parser/classifier/budget/concurrency 逻辑保持 pure functions/constants；
- 当前 v0 workflow = Analyze + Strategize → Materialize（两次物理调用）；call/stage topology 不是 DecisionPort/public ABI；
- deterministic DecisionRequest → provider context formatting；
- compact terrain window；
- direct JSON Schema Plan output 与 local parser；
- concrete failure codes；
- 60s/request timeout、no automatic retry、AbortSignal；
- final serialized provider request 512 KiB hard budget；同一 `DeepSeekDecision` instance concurrent-safe，依靠 request-local state 而非 mutex/global queue；
- stateless correction behavior；
- FakeDeepSeekTransport、Simulation integration、qualification 与 Agent execution contract。

Decision spec 不拥有 Plan validation/correction/gameplay execution authority；这些继续属于 Simulation。

### 1.5 [BATTLE_V0_INTEGRATION.md](./BATTLE_V0_INTEGRATION.md) — LoomRealm / Browser / Host 集成

负责：

- RPGMap **素材形式兼容**，以及“不复用 RPGMap Runtime”的边界；
- Tileset / Autotile / Character Graphics 约定；
- Presentation / camera / Browser 生命周期；
- BattleEffect 表现；
- Mock / Script / Manual / Random / LLM Decision Adapter；
- LLM Adapter 授权、provider timeout/cancel/error 集成问题；
- Future PlayerGuidance：v0 不实现 concrete contract；仅冻结“通过 request-scoped typed DecisionWorkflow capability/data 扩展、不得修改 Simulation-facing DecisionPort”的架构余量；
- Frame / Host / Abort；
- pause/background；
- 已冻结的 LOS / stalemate / pause 规则在 Host/Presentation 集成中的影响；
- workspace / package-lock；
- 实施顺序。

### 1.6 [BATTLE_V0_PRESENTATION.md](./BATTLE_V0_PRESENTATION.md) — Presentation Implementation Spec — FROZEN

负责：

- 参考现有 Map 包的 Builder/Handler 工程模式；
- Presentation 与 SubsystemScope / Frame / RenderDomain 的接入；
- canonical `initialize / render / pause / resume / close` Presentation lifecycle，以及 Runtime 对其 lifecycle ownership；
- Battle session 生命周期；
- 多 Battle 并发与同屏布局边界；
- `sceneEpoch / Presentation-local visualEpoch / actor-local motionId` 视觉 fencing；
- Simulation 操作到 Projection/视觉 reconciliation 的映射；
- Presentation 独立测试要求。

本文不重新定义 gameplay Rule；Presentation public API、cross-layer Projection、Render Tree、Browser node data ABI、world-coordinate model、camera、viewport/resize、effect policy、lifecycle/failure/stale handling 已冻结，**Blocking Presentation OPEN = 0**。

### 1.7 [BATTLE_V0_TEST_MATRIX.md](./BATTLE_V0_TEST_MATRIX.md) — 验收矩阵

负责把 Rule ID 映射为可执行场景：

```text
Rule → Scenario → Expected Result
```

测试文档不再复制完整规则，只引用规范。

## 2. 文档权威顺序

遇到描述冲突时：

```text
BATTLE_V0_SPEC.md
  ↓ gameplay/runtime semantics

BATTLE_V0_CONTRACTS.md
  ↓ data shapes

BATTLE_V0_SIMULATION.md
  ↓ Simulation implementation contract

BATTLE_V0_DECISION.md
  ↓ concrete Decision implementation contract

BATTLE_V0_INTEGRATION.md
  ↓ LoomRealm / Browser / LLM integration

BATTLE_V0_PRESENTATION.md
  ↓ Presentation module design

BATTLE_V0_TEST_MATRIX.md
  ↓ acceptance scenarios
```

README 和本索引只是导航，不覆盖上述规范。

如果局部行为描述与同 Tick 顺序存在解释空间，以 SPEC 中的 `TICK-*` reducer 规则为最终执行顺序。

## 3. 规范状态词

当前文档统一只使用四种状态：

- **FROZEN / MUST**：v0 实现必须遵守。
- **FROZEN FOR IMPLEMENTATION**：该模块 blocking design choice 已清零，可直接交由 implementation agent 落地。
- **SHOULD**：实现建议，不改变核心兼容语义。
- **OPEN**：尚未冻结，代码不得自行假设；如果被标明为某 frozen 模块的 NON-GOAL/外部 wiring，则不得阻塞该模块实现。
- **NON-GOAL**：明确不进入 v0。

不再使用“产品方向 / 实现前方向 / 建议默认 / 基本冻结”等多套相近状态词。

## 4. Canonical terminology

核心规范已经统一关键术语：

```text
tile            权威整数格
direction       2 | 4 | 6 | 8；不再另用 facing 表示同一字段
path            PlanSubmission 中未来要进入的格，不包含当前格
step            已经开始的一格移动；受 damaging hit 时可被中断，永远不会停在半格
PlanSubmission  Decision 提交、尚未被 Simulation 接受的计划
accepted plan   Simulation 已接受并拥有的计划
acceptedPlanId  Simulation 内部标识
windup          技能前摇
resolve         技能权威结算点
recovery        结算后行动锁
coefficient     确定性效果倍率
protection      命中后的有限免疫区间
```

## 5. 旧章节迁移矩阵

| 原 `BATTLE_V0_DESIGN.md` | 新位置 | 处理方式 |
| --- | --- | --- |
| §1 定位与最小闭环 | SPEC §1–3 | 保留核心定位，去掉重复介绍 |
| §2 决策状态总表 | 本索引 + SPEC Rule IDs | 改为导航，不再重复定义规则 |
| §3 三层架构/接口 | SPEC §1；CONTRACTS；INTEGRATION §1/3/8 | 按“权威 / 数据 / 集成”拆分 |
| §4 Content 与素材 | CONTRACTS §4；SPEC §8；INTEGRATION §2/4 | 静态数据、规则语义、素材格式分离 |
| §5 Tick/事件队列 | SPEC §5/10；INTEGRATION §9 | 核心时间规则保留；pause 规则已冻结，只有 Host suspend/resume 来源映射仍属 Integration OPEN |
| §6 Actor/代次/取消 | SPEC §4/5/9/11 | 归入 Runtime invariants / lifecycle |
| §7 LLM→短期计划 | SPEC §6；CONTRACTS §6–9；INTEGRATION §5–6 | Decision 协议与 LLM Adapter 分离 |
| §8 移动 | SPEC §7 | 成为唯一 Movement 规则源 |
| §9 技能 | SPEC §8–9；INTEGRATION §4 | 规则与视觉表现分离 |
| §10 受击 | SPEC §9 | 与 protection/interruption 合并 |
| §11 Tick Event Loop | SPEC §10–12；SIMULATION §16–27 | reducer 顺序仍由 SPEC 冻结；Simulation 文档冻结 transaction/scheduler/replay implementation |
| §12 Guidance/Frame | INTEGRATION §7–9；SPEC CTRL-001 | 产品输入与核心 cancel 分离 |
| §13 MVP 验收 | TEST_MATRIX；INTEGRATION §13 | 从“第二份规则”改成测试引用 |
| §14 已冻结/待定 | SPEC §14；CONTRACTS §18；INTEGRATION §14 | OPEN 项按领域集中管理 |

## 6. 已迁移且仍然保留的关键设计

以下信息没有因为去重而删除，已进入唯一规范位置：

- Battle 三层架构与 Simulation sole authority；
- Decision / Simulation / Presentation 作为可独立导出、替换和测试的模块，只共享 Contracts/Ports；Simulation 自己拥有 Battle clock、scheduler、Tick reducer 与 Plan execution，业务 Subsystem 只做构造、注入和外部生命周期映射；
- RPGMap 只复用素材/数据形式，不复用 Runtime；
- v0 双 Actor 同时行动，无传统回合；Actor cardinality 是 v0 rule，跨层/Runtime 以 actorId collection 建模，不把 1v1 写死成 actorA/actorB slots；
- 1 Tick = 200 ms；
- overdue Tick 必须逐 Tick 归约；
- Decision completion 只进入 Simulation Inbox，并在 Tick reducer snapshot 中消费；真实 wall-clock latency 不直接进入 gameplay timing；
- one valid Decision Request per Actor generation；Decision completion 只进入 Simulation Inbox，并在 Tick reducer snapshot 中消费；
- Decision/Action 采用有界流水：当前 Plan future intent 耗尽后可以在 active Action 尚未结束时预取下一 Decision，但最多只暂存一个 pending accepted plan；
- accepted path 逐 step materialize；未成功提交前一格时不创建后续 move task；
- Decision 直接生成结构化 `PlanSubmission`；
- `path` 不含起点、四方向、默认 `maxPathSteps=6`；
- `minCoefficient` 只控制技能起手；
- coefficient 千分制、向下取整、允许 0 damage；
- 单格移动采用 committed origin + next-tile reservation + move_complete 原子提交；
- move_start 瞬间更新 direction；
- 保留独立原地 `turn` Action；turn 立即改 direction，但消耗本 Tick唯一新 Action 配额；
- 同格冲突使用 `battleSeed` 的可回放等概率伪随机；
- 直接 swap 禁止；
- active step 中受到 positive damage 会立即移动失败：释放 destination reservation，留在最后 committed tile；存活者进入 protection + 受击后 Decision，死亡者不再 Decision；
- 无 `tracking`；resolve 读取当前相对位置；
- 退到较低 coefficient 按当前倍率；范围外 `miss`；
- `windup_ticks=0` 使用 bounded instant-resolve batch；
- recovery 可 Thinking、不可执行 Action、damage hit 可中断；
- protection 半开区间语义；
- same-batch protection 不回溯，允许 simultaneous defeat；
- move-only Plan 不自动攻击；
- protection 中可移动/turn/Thinking、不能 `windup_start`，攻击意图可保留并在结束后重检；
- `finalDamage=0` 的命中仍是 `hit`，但不触发 interruption/protection/redecision；
- v0 不做 LOS，Tile passability 不阻挡技能；
- pause/background 冻结 Battle clock；
- v0 不设正式 stalemate / 最大战斗时长，只记录无进展 diagnostics；
- abort/cancel 属于即时控制平面；
- Replay 不重新调用 LLM；
- Presentation/camera/DOM 无规则提交权；
- BattleEffect 与 Skill 规则分离；
- Future PlayerGuidance 只允许进入某次 DecisionWorkflow run，不直接修改 Simulation，也不得通过 DeepSeekDecision mutable state/provider conversation 隐式跨 request 保留；
- 当前不强制总 Battle 时长，先记录无进展诊断。

## 7. Core gameplay OPEN 状态

此前列出的 6 个核心 OPEN 已全部冻结，不再允许 Runtime 自行选择行为：

| 原 OPEN | 当前冻结规则 |
| --- | --- |
| `OPEN-DIR-001` | `TURN-001 / MOVE-006`：move_start 瞬间转向；保留独立原地 turn Action |
| `OPEN-MOVE-001` | `MOVE-007 / HIT-003`：damaging hit 立即中断 active step；死亡留在最后 committed tile |
| `OPEN-HIT-001` | `HIT-007`：zero-damage hit 无受击 aftermath |
| `OPEN-LOS-001` | `SKILL-006`：v0 不做 LOS |
| `OPEN-CLOCK-001` | `TIME-004`：pause/background 冻结 Battle clock |
| `OPEN-STALEMATE-001` | `RESULT-002`：v0 不设正式 stalemate/最大时长 |

**当前 Core gameplay 没有未冻结 design OPEN；Simulation baseline 已 qualification，新增 Decision availability circuit 已冻结且待实现，不再存在需要 implementation agent 自行决策的 blocking OPEN。**

仍存在的 OPEN 只属于不阻塞 Simulation/Presentation/Decision implementation 的外部 Contracts / Integration，例如非 Presentation Content subject/version、Host suspend/resume 来源映射，以及 configured DeepSeekTransport 的 credential/network/product capability handoff。PlayerGuidance concrete contract/Host wiring 明确延期；其 workflow extensibility requirement 已冻结，不是当前 implementation OPEN。Concrete Decision 的 shell/workflow boundary、v0 topology、model/API、prompt/context、structured output、parser、failure、timeout/retry、Abort、correction statelessness 与 testing 已集中冻结在 **BATTLE_V0_DECISION.md**，不再属于 implementation OPEN。BattleEffect、BattleSceneInit、RenderProjection、SkillEffectProjection、Presentation lifecycle/Browser ABI 已冻结；这些外部 OPEN 不得反向改变 Core/Decision/Presentation 已冻结语义。

## 8. 当前实施入口

当前 **Core gameplay 已冻结，既有 Simulation baseline/DecisionPort/full Runtime 与 Presentation 已通过 closed-loop qualification；待完成的是 DeepSeekDecision + availability circuit implementation、外部 serialization 与业务 Host composition；PlayerGuidance concrete capability 延期到后续独立阶段**。已完成/后续实施顺序：

```text
1. 冻结/实现 Content serialization schema
2. 冻结/实现核心 Contracts
3. Content validator
4. 按 BATTLE_V0_SIMULATION.md 直接实现 headless Simulation Runtime（state + clock + scheduler + queues + reducer + replay）
5. DecisionPort + Mock/Script Decision
6. TEST_MATRIX 全部 frozen-rule 场景
7. 已完成渲染前置：抽取 `@loomrealm-game/tile-presentation`，迁移 Map 通用 tile viewport/layout primitive，并让 Map 切换到 shared implementation + regression coverage
8. 按 FROZEN Presentation Agent contract 直接实现 PresentationPort + Browser Presentation（依赖 shared tile-presentation）
9. 业务 Subsystem thin composition
10. 按 BATTLE_V0_DECISION.md 实现 DeepSeekDecision + availability circuit，再完成 configured DeepSeekTransport / product Host E2E；PlayerGuidance 后续独立设计/实现
```

真实 LLM 不是验证 Simulation 正确性的前置条件。

## 9. 历史说明

这次重构是**文档结构迁移，不是玩法重设计**。

为了避免关键信息丢失：

1. 旧章节到新文档有显式迁移矩阵；
2. frozen rule 使用稳定 Rule ID；
3. Test Matrix 反向引用 Rule ID；
4. OPEN 项集中列出；
5. 原 1300+ 行单体文档仍可通过 Git 历史审计。

后续新增或修改规则时，应修改唯一权威位置，并同步对应 Test Matrix；不要再把同一规则复制到 README、索引和多个章节中。
