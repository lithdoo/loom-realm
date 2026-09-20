# 地图地形行为系统：实施闭环与验收计划（Essentials v21.1）

> 状态：**Implementation plan / NOT Implemented / NOT Qualified**。本文是 [地形行为设计草案](./TERRAIN_BEHAVIOR_DESIGN_DRAFT.md) 的实施配套文档；问题及真实地图身份见 [Ledge / Bridge 通行缺口分析](./LEDGE_BRIDGE_PASSABILITY_ANALYSIS.md)。2026-09-20 制定。本文只规定交付顺序和验收，不表示已经改动代码、执行测试或通过 qualification；不追溯修改冻结的 M14 first-slice 合同。
>
> 确定的范围：**内部易扩展，暂不支持外部扩展**。不提供插件 API、动态注册、行为 DSL、任意 Ruby/JS 执行器或通用 RMXP 事件解释器。桥和悬崖是第一批真实用例；冰面、水域等只保留数据和未来扩展方向。

## 1. 闭环的定义与唯一执行链

“完成”必须贯通原版数据 → 可校验投影 → Map Library 语义 → Runtime 事件和动作 → 同步渲染 → 真实地图玩法 → 自动化回归。只有接口、合成单测或静态画面均不算完成。

```text
原版 RMXP Map / Tileset / Map 7 桥头事件
  -> fixture consumer：严格投影 terrain_tags、狭义 MapAction
  -> Content：加载/校验 Map、Tileset、MapAction
  -> Map Library：有效地形解析与通行策略（含 bridgeLevel）
  -> event dispatch：按原版时序决定接触/踏入/边缘动作
  -> movement planner：blocked / walk / jump
  -> Runtime executor：验证后启动一个动作，统一更新状态
  -> render projection：同一状态生成 bridge depth、player/camera motion
  -> browser renderer：按受校验协议绘制，不重新推断地形玩法
  -> 验收：Map 7 / Map 47 实际路径 + 合成/集成/浏览器/回归测试
```

**Runtime 是人物位置、方向、`bridgeLevel`、活动动作和事件进度的唯一权威状态。** 事件仅改变声明的状态；行为模块读取状态并计算结果；Renderer 只消费投影数据。禁止在 Map ID、坐标、tile ID 或 Renderer 中二次写死碰撞逻辑。代码可由少量内部纯函数/静态分发构成，不设计所有地形通用的巨型 handler 接口。

## 2. 实施前取证门禁（不可跳过）

1. 用本地 Essentials v21.1 FSDB 读取 **Map 7 Cedolan City** 桥头的实际事件 ID、坐标、页面条件、触发类型、through、指令码及执行顺序，留取可复现的事件摘录/测试素材。**Map 27 是 Day Care 室内，不当作运河桥样本。** 未读取真实事件前，不声称任何特定桥头采用 contact 或 step。
2. 对照 v21.1 原版 `Game_Map#playerPassable?`、`Game_Player#move_generic`、`Game_Character#jump`/`jumpForward`、桥状态函数及 TilemapRenderer，记录判断先后、状态转移、绘制深度。尤其明确：原版跳跃先通过面前方向判断，再由 `jump` 判断最终落点；**不能额外要求跨越格可以按普通一步通行**。其他角色/事件阻挡、地图边界与跳跃联通规则以原版证据确定，不凭设计预设。
3. 建立一张事实表：原版证据位置、原始数据/事件、目标内部语义、覆盖测试及暂不支持项。遇到条件事件、混合指令、未知 trigger 或无法核实的事件分支，按 map/event/page ID 报告并阻止该行为被错误投影，不能静默忽略。
4. 检查现有 M14 严格 Tileset 合同及实际 fixture 生成路径，决定 schema 与历史 fixture 的显式迁移方式。**完整保留 0–17 标签不等于本轮支持 18 类玩法**；未知/不支持标签不得擅自转换为 Neutral 或无条件放行。

原版证据入口：[TerrainTag](https://github.com/Maruno17/pokemon-essentials/blob/v21.1/Data/Scripts/010_Data/001_Hardcoded%20data/011_TerrainTag.rb)、[Game_Map](https://github.com/Maruno17/pokemon-essentials/blob/v21.1/Data/Scripts/004_Game%20classes/004_Game_Map.rb)、[Game_Player](https://github.com/Maruno17/pokemon-essentials/blob/v21.1/Data/Scripts/004_Game%20classes/008_Game_Player.rb)、[Game_Character](https://github.com/Maruno17/pokemon-essentials/blob/v21.1/Data/Scripts/004_Game%20classes/006_Game_Character.rb)、[Overworld](https://github.com/Maruno17/pokemon-essentials/blob/v21.1/Data/Scripts/012_Overworld/001_Overworld.rb)、[TilemapRenderer](https://github.com/Maruno17/pokemon-essentials/blob/v21.1/Data/Scripts/006_Map%20renderer/001_TilemapRenderer.rb)。本地 FSDB 可能未提交到 Git；若 CI 无法访问，需提交合法的最小派生 fixture/断言及其来源说明，而非伪造全地图统计。

## 3. 四个实施 PR：每个都可独立审查，功能只在纵向切片结束后宣称完成

| PR / 依赖 | 代码落点及最小产物 | 必须通过的门禁 | 完成声明 |
|---|---|---|---|
| **1. 数据贯通**（独立） | `tools/fixtures/essentials-v21.1/.../m14-consumer.mjs` → `struct.Tileset.terrain_tags`；`game-libs/map/src/semantics.ts` 合同与校验；fixture 生成与 Content 实际读取 | 0–17 原始值、表维度/范围、tile ID 引用、旧 fixture 迁移与负例；可查 Map 7 / 47 真实 tag | 仅数据可用，不宣称桥/悬崖已可玩 |
| **2. 最小行为骨架**（依赖 1） | 内部 `resolveTerrain`、`evaluatePassability`、`planMovement` 纯函数；`bridgeLevel` 数值状态语义；`blocked/walk/jump` 内部计划，Runtime 普通行走接入口 | Neutral 多图层、桥层两种状态、双向方向位/priority、越界、普通走路与既有 transfer 回归 | 仅规则及动作计划正确；桥尚未完成 |
| **3. 桥纵向闭环**（依赖 2） | 窄范围 MapAction/桥头事件投影及 Content 加载；事件分发、状态变更、桥 tile 深度与人物同步发布 | Map 7 两端上/下桥、桥下穿行、折返、接触/踏入时序、传送或重入后的状态语义，画面遮挡正确 | 验收通过后才可声明 Bridge 完成 |
| **4. 悬崖纵向闭环**（依赖 2；应在 3 的共用运行时协议稳定后集成） | 依原版规划一次两格 `jump`；落点/事件规则；单动作 ID、镜头/人物 motion、跳跃弧线 | Map 47 合法跳下、反向阻挡、落点受阻不穿墙、跨越格无误触发、连续输入/resize/transfer 回归 | 验收通过后才可声明 Ledge 完成 |

建议 PR 1、2 首先分别合并数据与内核；PR 3 为第一个用户可见的完整纵向切片；PR 4 用第二种行为检验内核能否复用。若 PR 4 要在 `attempt` / Renderer 到处追加 ledge 判断，应收敛职责后再合并，而非将其解释为“扩展性已经实现”。PR 划分是目标，不要求为了数量强拆不可单独验证的半功能。

## 4. 行为与事件边界：明确谁判断、何时执行

- **Terrain resolution**：读取 z=2→1→0 的原始 tile/tag/passage/priority；`Neutral` 忽略**该图层通行**而不是使全坐标自动放行。桥下 `bridgeLevel===0` 跳过 Bridge 并继续下层；桥上 `bridgeLevel>0` 使用 Bridge passage 并结束该格判定。`None` 与 `NoEffect` 都不能被误当 Neutral。
- **Passability**：保留现有出发格方向与目的格反方向检验；Bridge 是通行层选择策略，不是 jump 动画特例。普通地图与传送不因抽象改变规则。
- **Event projection**：复用现有 RMXP 事件结构读取能力，**不把 MapTransfer 偷换成 MapAction**，可以提取共享事件解析工具。仅在确认真实 Map 7 页面、触发/条件、指令顺序后白名单解析 `pbBridgeOn`/`pbBridgeOn(支持的整数)`/`pbBridgeOff`，按原值投影 `set-bridge-level`。未知混合脚本报 unsupported 并附带 map/event/page ID。
- **Event dispatch**：接触触发在原版规定的碰撞/尝试阶段处理，踏入触发在动作完成阶段处理；必要时执行接触状态动作后重新求一次通行结果，避免“状态未切换导致永远不能进入桥头”。不要默认所有事件均到达后触发。桥状态跨地图保留或重置须按原版验证，不能每次加载强制清零。
- **Jump planner**：原版前进方向判断通过且面前为 Ledge 时，产生一个两格 jump；沿用原版最终落点与事件碰撞语义，不能把它拆成两次 walk，也不能额外要求跨越格走路可通。完整动作失败保持起点；跨越格不得意外触发普通 step transfer。确切的跨地图边缘跳跃行为另按源代码和真实场景验收。

接口只要求最小的内部结果类型，例如 `blocked`、`walk(to)`、`jump(to,distance:2)`。未来的滑行、水域状态和踩灰地图修改依所属阶段加入，不预注册空 handler。

## 5. Runtime / Browser 同步协议门禁（防止“碰撞对了、画面错了”）

当前 `game-libs/map/src/runtime.ts` 在动作开始时把位置更新为目标格并发布相机/人物 motion，普通步进是 `WALK_STEP_MS=250`；`game-libs/map/browser/map.browser.js` 的严格校验将 player/camera motion 的 `durationMs` 限定为 250。跳跃不能只增加 Runtime 的 `kind: jump`：需要同时定义、验证及消费**同一个** motion ID、类型、持续时间和起终点；新的持续时间须受有界校验，不任意放开。Renderer 通过 motion kind 算跳跃弧线，不通过 terrain tag 判断动作种类。动作完成后再按原版时序处理抵达事件及 held input，阻挡动作不会留下半个状态。resize、取消、切图时不得残留动画或定时器。

桥面深度目前在图块投影中按 `priority` 计算，Runtime 又会复用已覆盖视口的 tile projection window。**`bridgeLevel` 改变必须令相关渲染投影失效或重新投影**，即使坐标与 camera 均未变；同次 domain 更新中发布桥面深度及玩家状态，不能先撞击状态更新、下一帧再调整遮挡。若 depth 或 sprite plane 方案需改浏览器严格 payload schema，应同步补全验证和正反例测试；不能靠提高所有玩家的全局 `z-index` 破坏其他建筑和树木遮挡。

## 6. 自动化验收矩阵与质量门禁

| 层级 | 断言示例 | 证据/运行入口 |
|---|---|---|
| 投影契约 | v21.1 18 个标签原值；不合法维度、缺表、越界 tile、未知事件形式拒绝；旧 fixtures 明确迁移 | `npm run test:m14:projection` + 新投影负例 |
| 语义单测 | Neutral overlay `0x0F` 不堵下层；桥层启闭与两侧方向位；普通地面、边界、NoEffect 区别；跳跃只按原版前置/最终落点条件 | `@loomrealm-game/map` 测试 + 独立行为纯函数测试 |
| Runtime 集成 | contact/step/edge 次序；桥 level 设置、失败动作零部分提交、jump 单 ID、落点只触发一次；连续输入、resize、切图后状态一致 | Map Library 集成测试；新增专用 terrain behavior 测试 |
| 浏览器呈现 | 桥下遮住人物、桥上人物可见、桥层切换同更新；跳跃抛物线、相机联动、duration/epoch/motion ID 严格匹配及错误 payload 拒绝 | Browser renderer 测试 + 可复现的帧/截图断言 |
| 真地图纵向 | **Map 7** 双端上/下桥、桥下通过、折返、切图；**Map 47** 合法跳下、反向受阻、落点受阻、跨越事件不过早触发 | 真实素材驱动自动化测试；必要时附本地人工试玩记录，不能用合成示例替代真实地图 |
| 历史回归 | 普通一步、原有 MapTransfer、角色相机、held input、viewport resize、包构建 | `npm run build:m14`、`npm run test:m14`、`npm run test:m15`，必要时新增专项命令 |

`test:m14` / `test:m15` 是否通过须以实际运行记录为准；当前文档不声明任何测试已通过。真实 FSDB 若不可在 CI 重现，至少提供合法可提交的最小派生 fixture 与对应校验，明确本地全量试玩和 CI 覆盖之间的差距。

### PR 合并检查表（每项均须给出证据）

- [ ] 取证：原版相关实现与 Map 7 事件页面/命令留有可复现来源；不支持项列明。
- [ ] 数据：schema、consumer、fixtures、Content、校验与迁移一致；没有丢失 terrain tag。
- [ ] 规则：源格/目标格、Neutral、Bridge、jump 的判定在纯函数测试中与原版一致。
- [ ] 时序：contact/step/edge、动作开始/完成、转图、held input 不产生重复或遗漏事件。
- [ ] 呈现：Runtime 与 Browser motion 协议同步；桥层改变会使投影更新；跳跃是一个连续动作。
- [ ] 端到端：Map 7、Map 47 对应真实路线和负例完成；给出 fixture、脚本或可复现步骤。
- [ ] 回归：记录实际执行命令、结果和未覆盖项；旧 M14 qualification 不被事后篡改。
- [ ] 文档：根据通过的验收更新设计文档的实施状态、PR/提交、仍不支持的功能；只有达标才将 Bridge / Ledge 标记为已实现。

## 7. 明确的停工线与交付声明

若取不到真实桥头事件，先交付规则及明确的待验证项，**不得编造 map/event ID、触发时机或自称桥已闭环**。若发现原版跳跃与当前规划假设冲突，先补证据和测试再修改规划器。若 renderer 无法与 Runtime 同更新表现，桥验收不得通过。不得以修改原始 `passages`、地图专属坐标 hack 或关闭负例测试作为修复。

**最终交付陈述应包含：** 数据与代码变更位置、原版事实表、Map 7 / 47 实测结果、自动化命令及执行结果、当前不支持项、设计文档状态更新。所有验收完成之前，本文件始终保持 `NOT Implemented / NOT Qualified`。
