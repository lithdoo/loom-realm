# Battle v0 文档索引与迁移说明

> 状态：**Design only / 未实现**。
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
- 尚未冻结的核心规则。

所有已冻结 gameplay/runtime 语义必须以这里的 Rule ID 为准。

### 1.2 [BATTLE_V0_CONTRACTS.md](./BATTLE_V0_CONTRACTS.md) — 数据契约

负责：

- `BattleActor / BattleSkill / BattleEffect` 逻辑 Content shape；
- `BattleConfig`；
- `BattleObservation`；
- `PlanConstraints`；
- `PlanSubmission / PlanAcceptance`；
- `BattleSnapshot / BattleEvent`；
- `RenderProjection / SkillEffectProjection`；
- Replay 数据边界；
- 尚未冻结的 subject/version、字段命名和正式 Schema 细节。

Contracts 不重新定义玩法规则。

### 1.3 [BATTLE_V0_INTEGRATION.md](./BATTLE_V0_INTEGRATION.md) — LoomRealm / Browser / LLM 集成

负责：

- RPGMap **素材形式兼容**，以及“不复用 RPGMap Runtime”的边界；
- Tileset / Autotile / Character Graphics 约定；
- Presentation / camera / Browser 生命周期；
- BattleEffect 表现；
- Mock / Script / Manual / Random / LLM Decision Adapter；
- LLM 完成时间、授权、cancel/error 集成问题；
- 玩家 Guidance；
- Frame / Host / Abort；
- pause/background；
- LOS、stalemate 的产品/集成待定项；
- workspace / package-lock；
- 实施顺序。

### 1.4 [BATTLE_V0_TEST_MATRIX.md](./BATTLE_V0_TEST_MATRIX.md) — 验收矩阵

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

BATTLE_V0_INTEGRATION.md
  ↓ LoomRealm / Browser / LLM integration

BATTLE_V0_TEST_MATRIX.md
  ↓ acceptance scenarios
```

README 和本索引只是导航，不覆盖上述规范。

如果局部行为描述与同 Tick 顺序存在解释空间，以 SPEC 中的 `TICK-*` reducer 规则为最终执行顺序。

## 3. 规范状态词

当前文档统一只使用四种状态：

- **FROZEN / MUST**：v0 实现必须遵守。
- **SHOULD**：实现建议，不改变核心兼容语义。
- **OPEN**：尚未冻结，代码不得自行假设。
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
| §5 Tick/事件队列 | SPEC §5/10；INTEGRATION §9 | 核心时间规则保留，pause 移到集成 OPEN |
| §6 Actor/代次/取消 | SPEC §4/5/9/11 | 归入 Runtime invariants / lifecycle |
| §7 LLM→短期计划 | SPEC §6；CONTRACTS §6–9；INTEGRATION §5–6 | Decision 协议与 LLM Adapter 分离 |
| §8 移动 | SPEC §7 | 成为唯一 Movement 规则源 |
| §9 技能 | SPEC §8–9；INTEGRATION §4 | 规则与视觉表现分离 |
| §10 受击 | SPEC §9 | 与 protection/interruption 合并 |
| §11 Tick Event Loop | SPEC §10–12 | reducer 保留为最终顺序；Replay 独立 |
| §12 Guidance/Frame | INTEGRATION §7–9；SPEC CTRL-001 | 产品输入与核心 cancel 分离 |
| §13 MVP 验收 | TEST_MATRIX；INTEGRATION §13 | 从“第二份规则”改成测试引用 |
| §14 已冻结/待定 | SPEC §14；CONTRACTS §18；INTEGRATION §14 | OPEN 项按领域集中管理 |

## 6. 已迁移且仍然保留的关键设计

以下信息没有因为去重而删除，已进入唯一规范位置：

- Battle 三层架构与 Simulation sole authority；
- 三层 concrete implementation 彼此解耦，只共享 Contracts；Host/Coordinator 负责 Decision→Plan、Simulation Tick 与 Presentation wiring；
- RPGMap 只复用素材/数据形式，不复用 Runtime；
- 双 Actor 同时行动，无传统回合；
- 1 Tick = 200 ms；
- overdue Tick 必须逐 Tick 归约；
- LLM/Decision 实际耗时计入 Battle 时间；
- one valid Decision Request per Actor generation；
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
- Guidance 只进入 Decision，不直接修改 Simulation；
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

**当前 Core gameplay 没有未冻结 OPEN 项。**

仍存在的 OPEN 只属于 Contracts / Integration，例如 Content subject/version、BattleEffect/RenderProjection exact Schema、Decision Adapter、Guidance Host wiring；它们不得改变 Core 已冻结玩法语义。

## 8. 当前实施入口

当前 Battle 仍是 design-only。建议下一步：

```text
1. 冻结/实现 Content serialization schema
2. 冻结/实现核心 Contracts
3. Content validator
4. headless Simulation reducer
5. Mock/Script Decision
6. TEST_MATRIX 全部 frozen-rule 场景
7. Presentation
8. real LLM Decision Adapter
9. Guidance / Host E2E
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
