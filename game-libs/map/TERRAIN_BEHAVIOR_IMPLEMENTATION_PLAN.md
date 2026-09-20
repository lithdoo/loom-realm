# 地图地形行为系统：实施闭环与验收计划（Essentials v21.1）

> 状态：**Implementation plan / NOT FROZEN / NOT IMPLEMENTED / NOT QUALIFIED**。2026-09-20 多维度一致性复核修订。本文依赖 [设计草案](./TERRAIN_BEHAVIOR_DESIGN_DRAFT.md)，冻结条件见 [冻结准备](./TERRAIN_BEHAVIOR_FREEZE_READINESS.md)。不是已执行的代码计划或资格通过声明；不追溯修改 M14 历史合同。
>
> 范围：内部可扩展、无外部插件或动态 handler；只实现 Neutral、Bridge、Ledge 的本轮所需行为，其他 TerrainTag 保留数据。悬崖验 Map 47 Route 7；Map 27 Day Care 不是桥样本。**Map 7 Cedolan City 在本 corpus 中无桥事件/Bridge 图块**，见 [TERRAIN_BEHAVIOR_EVIDENCE.md](./TERRAIN_BEHAVIOR_EVIDENCE.md)，不能再默认当作桥闭环正例。

## 1. 完整交付链及当前纠错

```text
Essentials v21.1 源 Map/Tileset/Event
 → 逐项取证；selective importer 保留 terrain_tags 和运行时必需事件事实
 → prepared FSDB / M12 ContentClient 的严格结构校验
 → 两种内部查询：有效地形、逐层通行（含桥层）
 → 玩家按原版顺序作方向通行判断；失败才检查面前 touch
 → 成功则选择 walk / 单次两格 jump
 → Runtime 执行动作；完成后结算应触发事件/transfer/下一输入
 → 同次 RenderDomain 更新人物、camera 和桥面深度
 → Browser 严格校验、原子呈现；Map 7/47 + 回归验证
```

**删除旧设计假设**：“contact 动作先执行并立即重新求本次通行”不是 v21.1 `move_generic` 的既定行为，不得实现。原版先检查 `can_move_in_direction?`，失败才 `check_event_trigger_touch`；`Game_Event#start` 标记待执行，不是同步执行脚本。具体事件调度、桥头切换时间和再输入须按引擎源码加**真实桥地图**证据决定；Map 7 没有这类事件。已有 Runtime `ContactTransfer` 在 `canMove` 前启动的路径需做兼容性审计，避免把既有简化实现当原版依据。

**另一个交叉断点**：`map-transfer-consumer.mjs` 使用不含 terrain/player state 的 `projectedD0Passable` 在导入时过滤 step、contact 和 edge。不能一边增加 runtime 桥层判断，一边让 importer 在此前永久丢弃状态相关出口。需划清可静态证明的筛选和必须延迟到 Runtime 的事件事实；补充普通传送和桥附近传送回归。

## 2. 阶段 0：冻结前取证与基线记录

1. 从可访问的本地 Essentials v21.1 FSDB 提取指定地图每个相关桥头事件的 map/event/page ID、坐标、完整页面条件与选页优先级、trigger、through/graphic、命令码/参数/缩进/顺序；辨明脚本开始与实际生效时间。原版 Ruby 证据固定在 v21.1 tag/blob。**Map 7 已提取：零桥候选**（[证据](./TERRAIN_BEHAVIOR_EVIDENCE.md)）。不得把 Map 7 坐标写成桥运行时逻辑。若合同仍要真实桥事件，须另选授权地图再取证。
2. Map 47 固定可复现的起点、朝向、输入序列、面前 tag、源格方向通行、最终落点、落点事件/角色、反向和阻挡负例。`jumpForward(2)` 先有方向检查，`jump` 校验最终落点；不得额外把中间格当第二次普通走路。图外及跨连接地图的情况需确证或明确不支持。
3. 审计 `projectedD0Passable`、`selectStaticPage`、`emitStep`、`emitContacts`、`expandConnection` 对 Neutral/Bridge、页面条件和状态依赖的误分类/丢弃；列旧输入→原记录→期望输出差异。无关 NPC/剧情事件不构成全图 fail；相关桥头候选解析不完整须报 map/event/page 和原因。
4. 记录当前 base SHA、正式 M14/M15 ledger 状态及实际可取得的 CI/本地证据。当前代码已有 Tileset `autotile_names`，历史四字段断言漂移必须单列；不可悄悄削减 schema、篡改旧资格或用旧 subject PASS 证明新 subject。对 CI 某项 PASS，只声称该 workflow 在指定 SHA 通过，不自动宣称正式 Closed。
5. 依法确认真实素材的使用/分发条件：能提交则提供最小派生 fixture、来源指纹与生成过程；不能提交则标记 CI 覆盖缺口并保持相关冻结门禁 OPEN，不能造假的原版路线。

**阶段出口**：`TERRAIN_BEHAVIOR_EVIDENCE.md` 逐条事实/源链接/事件摘录/测试编号真实填写；`TERRAIN_BEHAVIOR_CONTRACT_V1.md` 只在字段/时序/fixture 审查完成后作为唯一增量规范冻结。模板不是证据，状态不得提前改为 Frozen。

## 3. 四个实施 PR（以冻结合同为唯一实施依据）

| PR | 依赖 / 改动边界 | 可审查产物 | 合并门槛及允许的完成声明 |
|---|---|---|---|
| **1 数据与投影** | 冻结合同；`m14-consumer.mjs`、`map-transfer-consumer.mjs`、`semantics.ts`、fixture/Content 测试；不改 Core | `terrain_tags` 精确投影/校验；传送静态筛选与动态事实保留规则修正；旧 fixtures 按明确迁移 | 0–17 数据可查，坏表拒绝，相关传送不被误删；只宣称数据准备就绪 |
| **2 内部规则与普通一步** | PR 1；Map Library 内部纯函数及 Runtime 最小接线 | `resolveEffectiveTerrainTag` 与 `evaluatePassability` 分离；Neutral/Bridge、源格/目标格 passage；完整 MovementPlan 类型冻结，执行器仅 `blocked/walk` | 多层、双向、None/NoEffect、旧一格步进/普通 transfer 回归通过；不可宣称桥已完成 |
| **3 Bridge 纵向闭环** | PR 2；事件 consumer、狭义 MapAction、Runtime、投影与必要 Browser 修改 | 已验证桥事件（**非 Map 7**）、选页/调度所需最小语义、数值 bridgeLevel、桥面深度缓存失效和同更新 | 真实桥地图两端、桥下、折返、桥头碰撞、附近传送、遮挡；Map 7 仅作负例。通过后才宣称 Bridge 完成 |
| **4 Ledge 纵向闭环** | PR 2 + PR 3 已稳定的共用运动协议；Ledge planner、Runtime、Browser、测试 | 原版方向+落点双阶段检查；一次 jump、统一 motion ID、动画弧线、事件结算 | Map 47 正向/反向/阻挡/中间事件、连续输入、resize、切图通过；通过后才宣称 Ledge 完成 |

PR 1、2 应按依赖合并；PR 3 是第一个完整玩家可见纵向切片；PR 4 检验同一内核能否复用。PR 4 可提前开展独立规划器测试，但共享 `runtime.ts`／`map.browser.js` 的最终集成需在 PR 3 motion 协议稳定后进行，禁止两个 Agent 无审查覆盖同一文件。若真实证据要求调整 PR 划分，先更改规格和任务卡，不为凑四个 PR 强拆半功能。

## 4. 必须落实到精确合同的交叉边界

| 合同项 | Producer → Consumer | 必须冻结的内容 |
|---|---|---|
| Data | RMXP → importer → FSDB → `TilesetRecord` | `terrain_tags` exact key/shape/长度/值域/引用、None/Neutral/NoEffect、旧数据迁移/错误 |
| Transfer | Event → importer → MapTransfer/MapAction → Runtime | 静态筛选 vs 动态判定；页面/trigger/through/图形、事件顺序、重复冲突、缺 Content 记录、相关未知候选拒绝 |
| Terrain | validated map+tileset → internal rules | 有效标签查询与逐层 passage 查询分离；Neutral 仅忽略本层；桥上/下策略；源格/目标格双向 passage |
| Event time | directional input → Runtime event dispatch | 先判通行；失败 touch 的 start 与脚本生效分离；成功运动完成后 step；edge、transfer、held input 与冲突优先级 |
| State | Runtime → passability + projection | `bridgeLevel` 初始/合法值/跨图/重入/Frame 生命周期、变更时机、失败原子性；原四字段 initial input 不擅自扩大 |
| Motion | Runtime projection → Browser | walk/jump kind、起终点、duration 单位和精确范围、单 ID、scene/visual epoch、camera/人物一致进度、弧线与帧、resize/取消/切图/重入/非法包 |
| Depth | bridgeLevel → tile window → Browser | 桥状态变化时不论镜头是否移动均使缓存失效；桥面 depth + 人物同一次 domain update、同 epoch 接受；禁止全局玩家置顶 |
| Support | source facts → current supported subset | 其他地形只保留源标签，不执行完整水域/冰面等玩法；不把未实现功能伪装为 Neutral/永远可走 |

冻结合同必须写出 TypeScript exact types、JSON 正反样例、状态转换矩阵和事件次数。不得仅用“原子”“同步”“复刻原版”等自然语言让 Agent 自己决定。普通 walk 保持既有 250ms 行为；Browser 在 validator、启动、续接和插值多处固定 250，jump 不能只修改 payload 校验；时长/弧线取证后确定。原版事件碰撞数据若超出最小投影，需按证据决定收窄支持范围或增加必要事实，不可测试声称全 NPC 阻挡却不载入 NPC。

## 5. 验收矩阵与新 subject 规则

| 测试族 | 必须覆盖 |
|---|---|
| `DATA-*` | 原始 18 tag、Table 坏 shape/短表/非法引用、现有 autotile_names、迁移、真实 Content 读取 |
| `TR-*` | importer 中旧错误静态过滤的对照负例、条件/页面白名单、step/contact/edge、跨图出口不丢失 |
| `BR-PASS-*` | None/Neutral/NoEffect 区别；桥上/下、双向 passage、桥头阻挡与普通地面回归 |
| `BR-EVENT-*` | 真实桥事件执行一次、start 与生效分离、状态改变、传送重入、相关未知候选显式失败；Map 7 负例（0 命中） |
| `BR-RENDER-*` | 桥深度变更即使原地不动也更新，与人物同次/同 epoch；树冠、屋檐遮挡不退化 |
| `LD-JUMP-*` | 面前可通+有效 Ledge、最终落点、逆向、阻挡、边界、中间格事件不误触发 |
| `MOTION-*` | 原版对应的 jump 单动作、弧线、相机与人物共同进度，ID/时长/epoch 正反例、resize/切图/取消 |
| `REG-*` | 普通一步、现有 transfers/held input、viewport、M14/M15 已存在路径、包边界 |

真实 Map 7／47 必须提供固定起点、输入序列与逐步 expected（mapId、x/y、朝向、bridgeLevel、动作、事件计数、桥面/人物遮挡）；合成测试与人工试玩均不能取代真实可复现集成证据。测试命令以 package.json 当前存在的入口为准（如 `npm run build:m14`、`npm run test:m14:projection`、`npm run test:m14`、`npm run test:m15`）；专项命令只有创建并实际运行后才列作通过。报告每条命令、Git SHA、环境、结果与未覆盖项；历史 qualifier 的 Closed 与新 subject 的资格严格分开。

## 6. 每个实施 PR 的停止线与完成报告

任务卡固定 base SHA、合同版本、依赖、允许/禁止路径、规则/测试 ID、实际命令、错误处理、交接人。遇到缺失 FSDB、原版事实矛盾、事件无法保真、schema/ABI 冲突、测试不可合法复现、旧基线已失败时，只暂停受影响工作并提交 `事实及可复现证据 → 冲突条款 → 备选方案 → 下游与测试影响`；不能放宽校验、删负例、编造桥坐标或改 passages。其他已冻结且独立任务可继续。

完成报告须含变更文件与 commit、规则和 fixture 引用、Map 7/47 结果、实际执行的构建/测试、正式资格影响和仍不支持项。**设计冻结≠功能实现≠qualification Closed。** Map 7 本地取证已完成并记为负证据；Map 47 与桥正例地图仍未取证，不得宣称 FG-01 通过。
