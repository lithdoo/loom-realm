# Terrain Behavior：四 PR 实施与验收计划（Essentials v21.1）

> **IMPLEMENTATION AUTHORIZED / PRODUCT IMPLEMENTED / BEHAVIOR QUALIFICATION PENDING**。AG-01～04 已在工作分支实现。实际 API：`validateTilesetRecord` / `migrateLegacyTilesetRecord`、`struct.MapAction/v1-bridge`、`resolveEffectiveTerrainTag`、`evaluatePassability`、`planMovement`、Runtime `bridgeLevel ∈ {0,2}`、jump 400ms。FG-01～06 仍 OPEN。本文件仍管实施顺序；合入主分支以实际 PR 为准。

## 1. 一个功能链，而非五个独立系统

```text
v21.1 固定原始素材（本地只读，校验 SHA）
→ selective importer / schema-versioned prepared FSDB / Content
→ map-owned terrain tag 查询 + passability（分开）
→ one input → blocked | walk | jump 的纯计划
→ map Runtime 唯一的 mapId/position/direction/bridgeLevel/event/motion state
→ 同一次 RenderDomain 更新：人物 + 相机 + tile depth
→ map-owned Browser 只验证/播放 motion，不决定地形/碰撞
→ 本地产品 Map7→Map21 Bridge / Map47 Ledge E2E + CI + 回归
```

实现只在 `tools/fixtures/essentials-v21.1`、既有 Content/schema、`game-libs/map` 的必要 producer/consumer 和自有 Browser。禁止改原版 passages，硬编码 Map/event/tile IDs，执行原始 Ruby，引入插件、DSL、万能解释器，或向 framework/Renderer/Hostra 下沉玩法。保留 TerrainTag 0～17，只有 Neutral(13)、Bridge(15)、Ledge(1) 在本 slice 得到新行为。Map7 Bridge 负例，Map21 Bridge 正例，Map47 Ledge 正例，Map27 不是 Bridge 样本。

证据 §16 已有从 Map7 `(40,0)` 边进 Map21、四组桥端、真实 tag15、返回 Map7 的**统一静态** E2E，独立检查覆盖边成员、邻接和 tag15，不覆盖原版 RGSS 逐帧。Map47 静态 30 Ledge 格与逆向反例、404 控制流语义已记录。绿 CI [35499617524](https://github.com/lithdoo/loom-realm/actions/runs/35499617524) 在 `5b550b4` 的 100 pass、0 fail、6 skip 是**合成/无真实 FSDB CI**；本地 Agent 报告有 FSDB 时 fixtures 106 pass、map 78 pass，不能算新实现通过。证据出处见 [证据](./TERRAIN_BEHAVIOR_EVIDENCE.md) §16 和 [复核](./TERRAIN_BEHAVIOR_EVIDENCE_REVIEW.md)。

## 2. 四个纵向 PR 与硬性 Done

| PR | 依赖、责任、最小产物 | 本 PR 必须通过 |
|---|---|---|
| **AG-01 / PR1 数据** | 直接启动。原始 `terrain_tags`→有六字段且保留 `autotile_names` 的 Tileset；旧五字段显式 migrator、新 schema subject/Content；狭义 MapAction 白名单与事件 occupied tiles，MapTransfer 保留动态相关连接事实 | 真实来源（本地有 FSDB）/合成→prepared→Content→Map consumer 的贯通用例；Table 长度/值域、缺事件、非法/不透明脚本 fail-closed；旧 Map/Transfer/Tileset 回归；合成 CI 绿。绝不声称 Map21 D0 已发生误删 |
| **AG-02 / PR2 语义+walk** | PR1 合入；map-owned `resolveEffectiveTerrainTag` 与 `evaluatePassability`；Neutral/Bridge0/2/None/NoEffect、源/目标方向与边界；冻结 `MovementPlan` 判别联合类型，仅接 blocked/walk 与现有 Runtime | 纯函数真值矩阵、普通 map input→Runtime→RenderDomain→Browser walk、Map7 边缘传送及 250ms/resize/cancel 回归；jump 暂不执行、不造两次 walk 或空 dispatcher |
| **AG-03 / PR3 Bridge** | PR2 合入；MapAction 占用/trigger、事件 start 与 execute 分步、bridgeLevel 切换/转图归零；必要的 Runtime/Browser depth 同步投影 | Map7 负例、Map21 八桥事件/四组 On/Off/tag15/桥下/折返/转图、held input/重复触发/触碰负例；原地切桥也刷新人物+地形深度；取消/旧包与事件错误不使状态撕裂；真实**产品** E2E，不只读 forensic CLI |
| **AG-04 / PR4 Ledge** | PR3 合入或已审核共享 ABI；一次 `jumpForward(2)` planner + Runtime/Browser 一条 motion（同 motionId），明确产品数值 duration/相机/弧线/完成 | Map47 `(16,9)→(16,11)`，逆向、源/落点阻挡、边界/中间事件合成反例，一次到达触发，resize/transfer/cancel/旧 completion 与 walk/Bridge 回归，真实**产品**可观察动画 |

**唯一共享 ABI 的审查点**：PR1 锁数据版本/MapAction；PR2 锁完整 MovementPlan 的形状；PR3/4 接入共享 Runtime/Browser 前锁一次事件和 motion on-wire（必要时版本演进）。不能让 AG-03 和 AG-04 在未同步下并行覆写共享文件。每 PR 写固定 base SHA、实际改动路径、生产者/消费者、假设、测试命令与 exit/pass/fail/skip、CI run/SHA、回退方案。不要求 AG-01 在编码前获得 RGSS、完整真图 CI 许可或六道 FG 的 PASS。

## 3. 必须当场落定的产品设计细节

- **数据**：Tileset 恰好原五字段加 `terrain_tags`，保留 `autotile_names`；旧记录显式迁移，新 qualification subject，不能修改 M14/M15 历史账本。MapTransfer 源/目标坐标分别属于各自 mapId；无真实误删不得破坏旧 edge。相关不透明事件停该地图/页面投影，不让无关 NPC 阻塞整图。
- **时序**：先通行；失败 front touch，成功动作 arrival 后才能 start；start 不是 execute。选择一种确定的产品事件调度和 held input 处理策略并写测试，暂记 `PROJECT-DECISION-PROVISIONAL`，不用“必与 RGSS 逐帧一致”作借口停编码。每次输入恰好归属一个动作，禁止同次先执行桥事件又重新判断通行。
- **状态**：Runtime 持有且仅持有一个 bridgeLevel（本 slice `{0,2}`），默认 0；On/Off execute 改状态，transfer 归零；失败/取消清未完成事件与旧 motion，不能半提交。bridgeLevel 即使在站立不动时更改，也要在一个 RenderDomain update 中同步地形 depth、人物、必要相机；不采取永远置顶的渲染捷径。
- **运动**：walk 250ms 是既有产品事实；jump 不能拆两次 walk，也不能把 `'UNVERIFIED'` 字符串传给 Browser 的数值 duration。PR4 在唯一 payload/常量中选数值项目策略并测到完成、resize/cancel/切图与陈旧回调，标注非原版实测。Browser 只执行动作投影，不决定碰撞。

## 4. 一次性验收而非循环取证

**单 PR 验收**：新增合成正反例＋本地真实 Map7/21/47（素材存在时）＋受影响旧回归＋相关 CI。记录本 PR HEAD 与数据 digest、命令/exit/pass-fail-skip、失败和修复、产品行为截图或日志。原版源码/静态推论/产品运行/原版 RGSS 四种证据不混写。真实素材不能进入无许可的仓库；CI 的 live skip 只是 skip。

**最终交付验收**：四 PR 实际合流后，用**LoomRealm 产品**输入从 Map7→Map21 走四组桥端、桥面/桥下/切层/折返与 Map7 负例；Map47 正向一次 jump、逆向/阻挡/边界，检查 tile depth/人物/相机同步、held input、重复事件、取消/转图/陈旧包。验证旧普通 walk、resize、transfer、地图布局/Content/M14/M15 不回归；明确一组可复现路径、测试 SHA、CI run 和受影响回归表。不能只用静态取证器结案。

原版逐帧 RGSS 对照、Map007/021/047 数据许可与 true live CI、FG-01～06 签核是**单独的行为保真/规范资格**，即使未完成也不阻挡产品开发；产品已验证可记 `IMPLEMENTED / BEHAVIOR QUALIFICATION PENDING`，但不冒充 `DYNAMIC-OBSERVED` 或 `CONTRACT FROZEN`。

**结案：先交付可运行可测的产品功能，再按真实证据提升保真资格。禁止把新取证计划、一个绿色静态 tracer 或一份更长的文档当成功能完成。**
