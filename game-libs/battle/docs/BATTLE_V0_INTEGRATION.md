# Battle v0 集成说明

> 状态：**Design only / Integration 草案**。本文说明 Battle Core 如何与 LoomRealm Resource、Presentation、Decision Adapter、Host/Frame 生命周期及 workspace 工程集成。
>
> Gameplay 语义只以 [BATTLE_V0_SPEC.md](./BATTLE_V0_SPEC.md) 为准；数据结构以 [BATTLE_V0_CONTRACTS.md](./BATTLE_V0_CONTRACTS.md) 为准。

## 1. 集成职责边界

Battle 运行时保持三层：

```text
Decision
  ↓ PlanSubmission
Simulation
  ↓ Snapshot / Events / RenderProjection
Presentation
```

集成层必须保持以下权威边界：

- Decision 只提出意图，不直接修改 Battle State；
- Simulation 负责校验、调度、结算和 BattleResult；
- Presentation 只消费 Projection；
- Host/Frame 负责 Battle 外部生命周期和授权；
- Contracts 只传数据，不拥有状态。

## 2. RPGMap Resource 兼容

Battle 复用的是**素材/Content 形式**，不是 RPGMap Runtime 行为。

### 2.1 复用的 Content / Resource 概念

Battle 可以读取现有：

```text
struct.Map
struct.Tileset

resource.Graphics/Tilesets/...
resource.Graphics/Autotiles/...
resource.Graphics/Characters/...
```

当前已确认的兼容约定：

- Map 概念字段包括 `tileset_id`、`width`、`height`、ProjectedTable 风格的 tile `data` 和 `behaviors`；
- Tileset 概念字段包括 `id`、`tileset_name`、`autotile_names`、`passages`、`priorities`、`terrain_tags`；
- tile size = 32×32；
- direction 继续使用 `2 / 4 / 6 / 8`；
- Character pattern 使用 `0 / 1 / 2 / 3`；
- Graphics 资源身份沿用 `namespace + key + contentVersion`；
- 常用 namespace 为 `resource.Graphics`；
- Tileset key：`Tilesets/<tilesetName>`；
- Autotile key：`Autotiles/<name>`；
- Character key：`Characters/<characterName>`。

真正实现时，应优先复用仓库已有 shared type / reader，而不是平行复制一套结构。

### 2.2 Character atlas

Character 图片继续按 4×4 atlas 使用，图片宽高必须可被 4 整除：

```text
frameWidth  = image.width  / 4
frameHeight = image.height / 4

sourceX = pattern * frameWidth
sourceY = ((direction - 2) / 2) * frameHeight
```

Character frame 可以大于 32×32，Presentation 应以 Actor tile 为基准做底部居中显示。

### 2.3 Tileset / Autotile

普通 Tileset 沿用现有 32×32 tile 布局，当前格式每行 8 个 tile。

Autotile 继续使用现有 block/cell 形式。

这些只是资源/渲染格式，不能反向定义 Battle movement/timing。

### 2.4 明确不复用的 Runtime

Battle 不得把以下模块当作 Battle 权威：

- `RPGMapBuilder`；
- `RPGMapHandler`；
- RPGMap movement/timer；
- RPGMap Transfer / Bridge / exploration Runtime；
- RPGMap Browser movement completion。

`lr-map-view` / `lr-map-sprite` 属于 RPGMap Browser/Runtime 细节，不进入 Battle Core。

如果未来 Battle 需要探索语义，必须明确加入 Simulation，而不是从 RPGMap Runtime 隐式继承。

## 3. Presentation 集成

Presentation 只负责显示。

职责包括：

- Map/Tileset/Autotile 绘制；
- Character Sprite；
- authoritative A→B step 的插值；
- BattleEffect；
- camera follow/focus/zoom；
- viewport/layout；
- resource load/dispose 生命周期。

### 3.1 Position Projection

active move step 期间：

```text
Simulation committed tile = origin
Presentation screen position = interpolated origin→destination
```

Presentation 不得把插值坐标 reverse-sync 回 Simulation。

### 3.2 Presentation diagnostics

Presentation 可以产生：

```text
animationFinished
assetFailed
viewportChanged
```

这些默认都不是 Battle Rule ACK。

Simulation 不得等待动画完成后才提交移动、扣血、死亡或 BattleResult。

### 3.3 Camera

Camera 完全属于 Presentation。

Simulation 不拥有：

```text
cameraX
cameraY
zoom
```

### INTEGRATION-OPEN-001 — camera focus hint — OPEN

是否允许 RenderProjection 携带非权威 `focusHint` 尚未冻结。

## 4. BattleEffect 表现

BattleEffect 是 Presentation-only Content。

v0 当前最小方向：

- 一张 Graphics；
- 一个 anchor；
- 简单 fade-in / hold / fade-out；
- 不预埋 projectile、particle、Shader、复杂 animation editor。

资源 key 约定：

```text
resource.Graphics/BattleEffects/<EffectName>
```

Simulation 只输出 effect identity/result/anchor/startTick 等权威事实；视觉生命周期由 Presentation 自己处理。

概念 Projection：

```json
{
  "effectId": "effect-00012",
  "sceneEpoch": 1,
  "result": "hit",
  "effect": "firebolt",
  "tile": { "x": 4, "y": 3 },
  "startTick": 120
}
```

### INTEGRATION-OPEN-002 — BattleEffect 视觉细节 — OPEN

尚未冻结：

- exact anchor/timing Schema；
- `immune` 是否有独立免疫视觉；
- `miss` 是否播放空挥/落空效果；
- `invalid` 是否完全无视觉；
- Browser effect cleanup 生命周期。

## 5. Decision 实现类型

Decision 是可替换组件，预期可以有：

```text
MockDecision
ScriptDecision
ManualDecision
RandomDecision
LLMDecision
```

Simulation 必须在**没有 Browser、没有真实 LLM**时也能被 Mock/Script 驱动跑完整 Battle。

## 6. LLM Decision Adapter

当前仓库公开的 Subsystem surface 还没有冻结 Battle 的最终 LLM 服务接口。

Adapter 最终需要解决：

- LLM 请求位于哪个 Host 层；
- authorization / credential；
- AbortSignal / cancel；
- trusted completion timestamp；
- deadline；
- service/network error metadata；
- structured output validation；
- 同 generation 的一次 correction retry。

Browser 不应持有模型密钥。

### 6.1 Completion time

Adapter 必须提供可信的真实完成时间，以满足 `DEC-001`。

例如：

```text
model completed = 480 ms
host callback handled = 700 ms
→ Battle 应按可信 480 ms 映射 dueTick
```

不能只把 JavaScript callback 真正被调度到的时刻当“模型思考时间”。

### 6.2 Model / Service 差异

不同模型、网络、供应商可以有不同 deadline/product limit，但不得修改 Core 中“completion fact → dueTick”的确定性规则。

### INTEGRATION-OPEN-003 — Decision Adapter API — OPEN

尚未冻结：

- exact Adapter interface；
- error enum；
- cancel guarantee；
- default deadline；
- model/service limit；
- credential/authorization wiring。

## 7. Player Guidance

未来玩家作为“训练师”给我方下一次 Decision 提供临时 Guidance。

Guidance：

- 必须从授权的 Host/InputTarget 路径进入；
- 只成为下一次 Decision Observation/context；
- 不直接修改 HP、position、protection、damage；
- 不暂停对手时间轴；
- 不保证 AI 一定遵从。

产品方向仍是四张预配置 Guidance 卡。v0 Core 开发阶段可以固定 Guidance 或完全跳过。

### INTEGRATION-OPEN-004 — Guidance Host Wiring — OPEN

InputTarget / Host / Guidance exact contract 尚未冻结。

## 8. Frame / Abort / Subsystem 生命周期

Battle 运行在 LoomRealm Frame/Subsystem 生命周期中。

Frame abort / Battle cancel 遵循 `CTRL-001`：

```text
abort/cancel
→ 立即失效 Battle authority/epoch
→ 停 scheduler
→ best-effort cancel LLM/resource
→ Presentation cleanup
→ Frame cleanup
```

不等待下一个 200 ms Tick。

所有迟到 Decision/Event 都必须因 generation/epoch 校验失败而失去提交权。

## 9. Pause / Background

逐 Tick catch-up 规则已经冻结，但产品如何定义 pause 仍未冻结。

### INTEGRATION-OPEN-005 / OPEN-CLOCK-001 — Battle Clock — OPEN

Host background / explicit pause 时，需要在以下方案中冻结一种：

- 冻结 Battle monotonic clock；
- Battle 时间继续流逝，恢复时逐 Tick 补算。

无论采用哪种方案，只要时间继续，绝不能把多个 dueTick 合并成一个批次。

当前产品方向可以优先考虑“显式 pause 时冻结”，但这不是规范。

## 10. LOS 与 Map 规则

当前 Tile passability 只明确控制 movement。

### Skill LOS（引用 `OPEN-LOS-001`）

墙体是否阻挡技能尚未冻结。

当前建议：

- v0 不做 LOS；
- 不推导 `unwalkable = blocks skill`；
- range matrix 单独决定位置是否合法；
- 未来有具体机制需求时，再显式加入 LOS。

在冻结前，Runtime 不得自行增加 terrain LOS。

## 11. Stalemate

v0 当前没有 Battle 最大总时长。

可以先记录非权威 diagnostics：

```text
ticksSinceLastDamage
ticksSinceLastPositionChange
decisionCountWithoutProgress
collisionRetryCount
```

### 正式僵局结果（引用 `OPEN-STALEMATE-001`）

只有模拟数据证明长期追逐/无效规划是实际问题后，再决定是否加入 `stalemate`。

## 12. Workspace / Build 状态

Battle 当前仍是 design-only。

已知工程项：

- 根 `package.json` 通过 `game-libs/*` 识别 Battle；
- Battle 合入时根 `package-lock.json` 尚未做对应同步验证；
- Runtime 开发后必须单独验证 `npm ci`、build、unit test、Browser E2E。

文档更新不能被描述成“构建/测试已经通过”。

## 13. 推荐实施顺序

```text
1. 冻结 BattleActor / BattleSkill / BattleEffect v1 serialization schema
2. 冻结 BattleObservation / PlanConstraints / PlanSubmission / PlanAcceptance
3. 实现 Content validator
4. 实现 headless Simulation reducer + scheduler + event queue
5. 用 Mock/Script Decision 驱动
6. 跑 frozen-rule deterministic Test Matrix
7. 实现 RenderProjection + Presentation
8. 接真实 LLM Decision Adapter
9. 接 Guidance / Host
10. 验证 package-lock / npm ci / unit / Browser E2E
```

真实 LLM 不是验证 Simulation 正确性的前置条件。

## 14. Integration OPEN 汇总

- **INTEGRATION-OPEN-001**：camera focus hint。
- **INTEGRATION-OPEN-002**：BattleEffect Schema / outcome visuals / cleanup。
- **INTEGRATION-OPEN-003**：Decision Adapter API/timing/error/cancel/defaults。
- **INTEGRATION-OPEN-004**：Guidance Host/InputTarget wiring。
- **INTEGRATION-OPEN-005**：pause/background product policy。
- **OPEN-LOS-001**：Skill LOS。
- **OPEN-STALEMATE-001**：正式 stalemate。
- Runtime 开始后还需处理 package-lock / build 验证。
