# Battle v0：核心战斗设计草案

> 状态：Draft / design only；2026-09-22。本文整理产品讨论，不代表已经实现、接口已经冻结或通过测试。
> 参照仓库 `main` 基线：`2b975a6598d58778d3e5e4c31d9b1f6b2deea161`。
> 范围优先级：地图与 Actor 移动、技能释放及表现、Prompt → LLM → 合法行为 → 结算；提示词优化和训练体系延后。

## 1. 产品定位与首个可验收闭环

Battle 是一个基于 RPGMap 场景的两角色、回合制、LLM 驱动战斗游戏库。地图中央有我方与敌方两个 Actor，双方轮流决策并执行一个行动。用户未来扮演「训练师」，以四选一的指导信息影响我方角色；v0 只要预留并验证单条临时指导能够进入本轮决策，不实现长期学习。

最小闭环：加载一张 N×N RPGMap 战斗地图 → 出生两个 Actor → 我方回合获取战况与合法行动 → [可选]用户指导 → LLM 返回行动 ID → 验证、移动或施法 → 呈现 → 敌方以相同规则决策 → 轮转至一方 HP 归零 → 返回结果。

**既定边界：LLM 选择行动意图；Map 管地图和角色运动；Battle 管回合、战斗资源、技能规则及胜负；Browser 只呈现。** LLM 文本、DOM 或动画均不能直接修改权威战斗事实。

## 2. 已讨论并暂定的产品决策

| 主题 | v0 选择 | 限制/备注 |
| --- | --- | --- |
| 地图 | 复用 RPGMap 地图数据、Tileset、通行、坐标、投影和 Sprite | 初始内容可选 8×8，N×N 是内容参数；不另造棋盘引擎 |
| 角色 | 我方、敌方各一个 Actor，共用移动与技能规则 | `actorId` 唯一，不能把敌方写死为永远静止的 NPC |
| 回合 | 顺序轮流；一方每次恰好选择 `move` / `skill` / `wait` 之一 | 暂无移动后施法组合或多行动点 |
| 移动 | 采用 RPGMap 的方向、合法落点及运动表现 | v0 先以单次合法运动（普通一步；若地图支持则沿既有 ledge jump）为一个 `move`；移动力 3 格/多步寻路以后再定 |
| 碰撞 | 不能越界、进入不通行格或占用格 | 合法运动由相同 Map 规则计算，不能只做曼哈顿半径校验 |
| 技能 | 初版一个单目标攻击技能即可 | 技能表定义消耗、射程、目标、伤害；不由 LLM 生成数值 |
| 技能表现 | 在目标格叠加贴图，透明度渐显再渐隐 | 暂无弹道、粒子、复杂 Timeline；视觉不决定命中 |
| 模型 | 我方与敌方分别以当前可见战况选择合法行动 ID | 允许同一种决策协议、不同角色设定；不泄露另一方私有上下文 |
| 用户指导 | 预留当前我方回合的指导输入 | 最终目标是四选一；生成策略、训练和永久记忆延后 |

上表中的具体数值和数据形状是设计选择，不等于当前 Map 或 LoomRealm 的公共契约。

## 3. 所有权：一份战场，不做两套位置权威

- **RPGMap 地图/运动权威**：地图内容、格子地形与通行、Actor 的已提交坐标与方向、一次运动的合法性和进度、地图投影。
- **Battle 战斗权威**：当前行动方、阶段、回合序号、HP/MP、技能列表和消耗、技能结算、战斗日志、胜负状态。
- **Decision Adapter**：接收冻结的战斗观察与合法行动，返回提议行动；没有状态提交权。
- **Presentation**：消费提交后的地图、人物、技能效果与战斗 UI 数据，绘制动画；不 reverse-sync 坐标或 HP。

Battle 生成对 LLM 的观察时，组合 **Map 已提交的坐标快照**与 Battle 的战斗状态，不能长期维护第二份可独立修改的 Actor 坐标。技能改 HP 只写 Battle；移动成功只由 Map 确认位置后，Battle 才推进回合。

LoomRealm Main 仍然拥有 Session/Runtime/Frame/Activation/InputTarget 权威；Battle 作为一个长生命周期 Frame 管理一场战斗。地图复用应作为 Battle 同一 Subsystem 内的业务模块，不应通过另开 Map Frame 制造两套战斗场景和生命周期。

## 4. RPGMap 复用前提与当前缺口

RPGMap v1 的设计目标包含 `RPGMapBuilder`、`RPGMapHandler`、`getSnapshot()`、静态 NPC 和多 Sprite；截至本文基线，这些是尚待交付的实施设计，`game-libs/map/src/index.ts` 仍仅默认导出 `mapDefinition`。既有 Runtime 的可控移动围绕单一 Player 和键盘方向输入；规划中的 NPC 是静态阻挡物，**并无双 Actor 自动移动能力**。

Battle 的目标复用接口（仅需求草案，非 RPGMap 已存在 API）：

1. 初始化一张战斗地图并放置两个可移动 Actor，使用原有 Character Sprite 资源与方向规则。
2. 获取包含双方已提交位置、方向、运动状态的只读一致快照；按 `actorId` 查询由 RPGMap 自身规则计算的合法单步运动集合。
3. Battle 根据 LLM 选择的合法行动，命令指定 `actorId` 执行运动，并获知成功、被阻挡、取消或不可恢复失败；同一时刻不重叠运动。
4. 地图/Actor 投影继续复用已有 View/Sprite 表现；不能为 Battle 绕过 RPGMap 的通行、碰撞、运动提交或资源校验。
5. 战斗地图不触发跨图 Transfer、Bridge 玩法等 RPG 探索行为；采用内容配置/受控场景限制处理，具体复用边界在 Map 设计确认后冻结，不暗中禁用通用 Map 契约。

**禁止把静态 `setNPC()` 伪装成逐帧移动 API，或让 Battle 修改浏览器 Sprite 坐标代替 Runtime 移动。** 若 Map 公开接口暂不可用，Battle 包维持设计状态，不声明运行闭环已经存在。

相关现有文档：[`RPG_MAP_V1_FINAL_SCOPE_AND_CLOSURE.md`](../../map/todo_docs/RPG_MAP_V1_FINAL_SCOPE_AND_CLOSURE.md)、[`RPG_MAP_PUBLIC_API_V1_EXECUTION_CONTRACT.md`](../../map/todo_docs/RPG_MAP_PUBLIC_API_V1_EXECUTION_CONTRACT.md)、[`RPG_MAP_GENERIC_MODULE_DESIGN.md`](../../map/todo_docs/RPG_MAP_GENERIC_MODULE_DESIGN.md)。实施时以当时主分支最新规范和源码复核，不把本草案反向当成 Map 冻结接口。

## 5. Battle 数据概念（示意，不是代码 Schema）

```text
BattleSession
  battleId / stateVersion / turnNumber / phase / activeActorId
  map: reference to one RPGMap scene
  actors: ally + enemy, keyed by actorId
    team / hp / maxHp / mp / maxMp / skillIds / statusEffects
    position + facing: read from RPGMap snapshot, not independently writable
  activeDecision: decisionId + frozen stateVersion + legal actions
  history: committed action + authoritative outcome
  result: optional winner/draw/failure
```

`Actor` 指棋盘上的角色；“玩家”专指选择提示卡的人。双方共用规则，观察范围可依各自可见信息配置；v0 可用完全公开战场信息，不引入战争迷雾。出生坐标必须合法、不重合。角色占一格。

**地图尺寸**由 RPGMap 的 `width/height` 给定。初始测试可以选择 8×8，但不要硬编码 8×8 或另外维护一份独立矩阵。左上角原点和格子单位沿用 Map。距离和视线应由具体技能规则定义，不能拿 RPGMap 的通行定义直接等同技能射程。

## 6. 一次行动：移动、技能、等待

### 6.1 共同规则

一次行动回合仅接受 `move`、`skill`、`wait` 中的一个；提交后轮到另一方。合法行动集合由规则系统先生成，LLM 只能引用集合里的 `actionId`。合法性检查至少绑定当前 `battleId + decisionId + stateVersion + actorId`。绝不执行自由文本中的额外命令。

### 6.2 Move

Battle 请求 Map 给出当前 Actor 在当前稳定场景下的合法运动选项。v0 一个选项对应一次 RPGMap 正常步行，或地图原有的单次跳跃结果（如启用）。LLM 选择目标行动 ID；Map 自己确认与执行运动，Battle 等待运动结束后再切换回合。不能把连续 3 格当一次行动，除非未来单独设计多步移动、路径和行动预算。

### 6.3 Skill

初版只需一个单目标攻击技能。以下为验收数据样本，不是永久平衡值：

```json
{
  "skillId": "firebolt",
  "targetKind": "enemy-actor",
  "range": 3,
  "distanceRule": "manhattan",
  "mpCost": 2,
  "damage": 3,
  "effectImage": "resource.Graphics/<configured-skill-effect>"
}
```

Battle 根据已提交位置检查目标、范围、资源及其他条件；扣 MP、应用伤害、追加结算记录、检查 HP 是否归零。LLM 无权决定伤害、命中或凭空发明技能。v0 可以约定障碍只阻挡行走，技能暂不检查视线；这是明确的简化，后续可增加 LOS/范围技能。

技能目标以**目标格**定位特效：如果选定目标 Actor，则 Battle 在结算时先确定其已提交格子，冻结为本次效果坐标。只在合法、已结算的技能动作上发布效果，不因模型输出文字触发特效。

### 6.4 Wait

始终可用，直接结束当前 Actor 行动回合；也用于无法获得有效 LLM 决策时的确定性兜底，并记录原因。未来是否将失败决策视为弃权或重试，可单独调整。

## 7. 技能视觉：目标格贴图渐显渐隐

一次已结算技能产生表现描述（非业务伤害命令）：

```json
{
  "effectId": "effect-00012",
  "sceneEpoch": 1,
  "tile": { "x": 4, "y": 3 },
  "image": { "namespace": "resource.Graphics", "key": "<configured-effect-key>", "contentVersion": "<actual-content-version>" },
  "fadeInMs": 150,
  "holdMs": 200,
  "fadeOutMs": 250
}
```

这是内部拟议形状；素材引用需遵守既有 Content/Presentation Resource 契约，由 Runtime 提供正确版本，Browser 不直接访问本地路径。动画透明度 `0 → 1 → 1 → 0`，总时长示例 600ms，贴图锚定目标格，建议位于地形与角色之上。v0 不提供弹道、粒子、击退和复杂特效系统。

表现应作为现有地图 View 的业务扩展或与其协调的 Battle 表现层；具体 RenderDomain 节点和 Browser Custom Element 方案待 Map 多 Sprite 实现确认，**不得假定现有 `lr-map-view` 已支持效果叠图**。可使用稳定存在的表现节点及带唯一 `effectId` 的数据记录，让 Browser 按 ID 去重，避免重复接收完整数据时重播；不能违反同一 RenderDomain 中被删除节点 key 不可复用的约束。

权威技能结算与动画分离：Battle 完成规则提交后可进入 `presenting` 阶段，以受控时长推进下回合；不得把 Browser 绘制、图片解码或 DOM 回调当成伤害/胜负确认。退出或 Frame 取消时终止待显示效果及后续决策。

## 8. Prompt → LLM → Action 数据流

```text
已提交 Map 快照 + Battle 战斗数据
    → Rule/LegalActionBuilder 生成合法行动
    → 冻结 DecisionSnapshot（版本、当前 Actor、观察、近期历史、可选指导）
    → DecisionAdapter 发送给对应 Actor 的 LLM
    → 返回结构化 actionId
    → 解析 + 决策 ID/版本/行动集合验证
    → Map 执行 Move 或 Battle 结算 Skill/Wait
    → 提交新状态 + 历史 + 表现
```

请求的最小字段：`battleId`、`decisionId`、`stateVersion`、`actorId`、`observation`、`legalActions`、`guidance`（可空）、`recentHistory`（可空）。`observation` 包含双方当前可见 HP/MP、坐标、当前角色技能/消耗、必要地形或障碍信息。地图不可只发送一张图片来代替规则信息；提示词格式和历史压缩策略以后优化。

示意：

```json
{
  "battleId": "battle-001",
  "decisionId": "decision-007",
  "stateVersion": 11,
  "actorId": "ally",
  "observation": { "self": { "hp": 10, "mp": 5, "position": [1, 3] }, "enemy": { "hp": 6, "position": [3, 2] } },
  "guidance": "优先主动进攻",
  "legalActions": [
    { "id": "move:1,2", "type": "move", "to": [1, 2] },
    { "id": "skill:firebolt:enemy", "type": "skill", "skillId": "firebolt", "targetId": "enemy" },
    { "id": "wait", "type": "wait" }
  ],
  "recentHistory": []
}
```

示意模型返回：`{"actionId":"skill:firebolt:enemy"}`。示例合法集合不代表演示坐标已通过真实 Map 规则。真实数据必须由运行时计算而不是从文档硬编码复制。

验证规则：回答只能引用冻结集合里的行动 ID；即使匹配，也须再次确认当前决策代次和已提交地图状态未过期。不存在的 ID、格式错误允许至多一次重问，随后 `wait`；超时/网络失败采用可追踪的 `wait`；Frame 取消直接丢弃响应并清理。不允许迟到响应覆盖下一回合。防止日志写入密钥或完整秘密提示词。

**平台缺口：** 当前公开 `SubsystemScope` 不包含 LLM 服务。`DecisionAdapter` 是 Battle 需求概念，真实 LLM 接入的授权、传输、密钥、取消和 Hostra/PWA 适配须另立接口设计；不得把它写成现有 `scope.llm` 或让 Browser 持有模型密钥。原型可使用模拟 Adapter 先完成端到端语义验证。

## 9. 回合/Frame 生命周期及 UI 输入

建议阶段：`battle_start → await_guidance(仅我方，可跳过) → deciding → resolving → presenting → turn_end → [下一方] / battle_end`。敌方不等待玩家指导。每个阶段只接受相应命令，禁止决策与运动、结算并发重叠；进入 `battle_end` 后不再请求 LLM。一方 HP 归零则在完成当前技能结算后产生结果；可先只支持胜负，平局条件预留。

用户最终可在我方每回合选四张**预配置**指导卡中的一张；卡片只是本轮 Prompt 的临时字段，不是指令保证，不直接增加伤害、修改位置或永久学习。四张卡的生成/优化、培养记忆、战斗后复盘均不在 v0。最小闭环可先使用固定的一条 guidance 或允许跳过来验证协议。

现有 Web Presentation API 是只读投影，不意味着业务 Custom Element 可以直接调用 Battle Runtime。输入应经既有授权输入链（`Main InputTarget × active Activation × Subsystem Interest`）或以后明确设计的受控命令入口；不能从 DOM reverse-sync BattleState。当前公开输入支持键盘、指针与自定义通道，但**四选一按钮具体如何映射还没有完成契约**。

Battle 以一个长生命周期 Subsystem Frame 承载一场战斗；Frame 取消及时终止待决策、运动等待和展示。Map Runtime/Browser 失败按其真实边界处理，不伪造 Browser 画面完成 ACK。Battle 结束返回现有 `FrameOutcome` 形状所允许的 JSON 结果，不自建 Main/Frame authority。

## 10. MVP 验收与后续阶段

可验收的基础场景：一张经过 RPGMap 校验的 N×N 地图；双方合法出生、Sprite 可见；双方可根据同一通行规则分别执行至少一次移动；火焰弹在合法范围内扣资源/HP 并在目标格正确渐显渐隐；LLM（或模拟 Adapter）在行动集合中选择后执行；非法回答、超时、迟到返回、退出取消均不会篡改状态；双方轮转并在 HP 为 0 时结束。浏览器实际可见性单独通过真实 Browser E2E 验证，不以 RenderDomain 提交代替视觉验收。

实施依赖顺序：确认 RPGMap 多可移动 Actor 扩展边界 → 确认目标格特效与已有 Map View 的表现合同 → 冻结 Battle 动作/状态契约 → 先用模拟决策器验证 → 再接受控 LLM 服务与选择卡输入 → 进行真实 Hostra/Browser E2E。

明确不在 v0：提示词优化和评测、训练档案及跨场战术记忆、模型微调、职业/装备/升级、多单位、多步寻路、移动后施法、AOE/状态效果复杂体系、技能弹道/粒子、自定义动画编辑器、跨图探索、棋盘规则另起炉灶。

## 11. 待定而非暗定的问题

- 双可移动 Actor 是在 RPGMap 公共接口上扩展，还是抽出内部通用 Actor-motion 能力供 Battle 装配；不得在已有静态 NPC API 上偷换语义。
- 技能贴图如何与 Map View 的坐标和层级对齐，如何在 Browser 生命周期变化时取消旧效果。
- 用户四选一的受控输入具体使用何种已有通道；是否需要新的业务命令契约。
- LLM 受控服务的宿主位置、请求/取消、凭据与生产环境可用性。

以上必须在实施前核对当时实际源码和现行 Map 规范，不能把目标设计视为已实现事实。
