# Terrain Behavior：实施准入与正式冻结门禁

> **IMPLEMENTATION AUTHORIZED / NOT IMPLEMENTED / NOT FORMALLY FROZEN / BEHAVIOR QUALIFICATION PENDING**。用户已明确授权有边界地开始开发。[实施准入与交付合同](./TERRAIN_BEHAVIOR_DELIVERY_CONTRACT.md) 是**编码授权及产品 Done 的唯一入口**；[实施计划](./TERRAIN_BEHAVIOR_IMPLEMENTATION_PLAN.md) 管 PR 顺序；本文 FG-01～06 仅管理**原版行为资格与正式 CONTRACT_V1**，不再阻止 AG-01～04 开发。历史 [冻结执行记录](./TERRAIN_BEHAVIOR_FREEZE_EXECUTION.md) 与 [Issue #42](https://github.com/lithdoo/loom-realm/issues/42) 保留当时的准备要求，不推翻本轮新的用户实施授权。
>
> 复核基线 `62938013103b94c3b69786b66216440b1d49fb1c`；固定上游 Pokémon Essentials v21.1 `ea7b5d56d2436591160983c4e641a2ceee2d875a`。历史原始证据见[证据](./TERRAIN_BEHAVIOR_EVIDENCE.md) §14，重新抽取/统一静态 E2E 与 CI 见 §15–16；[复核](./TERRAIN_BEHAVIOR_EVIDENCE_REVIEW.md)限定证明等级；[候选合同](./TERRAIN_BEHAVIOR_CONTRACT_CANDIDATE.md) C-01～08 提供开发用字段基线，但**尚不是发布的运行时 API**。

## 1. 三条状态轴彼此独立

| 轴 | 当前状态 | 完成标准 |
|---|---|---|
| Implementation entry | **AUTHORIZED** | 依交付合同，AG-01 立即启动，每 PR 绑定真实 base SHA、接口、测试与 CI；不等 RGSS/真图再分发许可/六 FG PASS |
| Product delivery | **NOT IMPLEMENTED** | AG-01→04 合流、**真实 LoomRealm Runtime+Browser** 完成 Map7→Map21 Bridge 与 Map47 Ledge E2E，反例/旧回归及代码 SHA 对应 CI 通过；静态 tracer 不能替代产品运行 |
| Vanilla fidelity / formal specification | **NOT QUALIFIED / NOT FROZEN** | FG-01～06 获授权签核后才创建正式 `TERRAIN_BEHAVIOR_CONTRACT_V1.md`；无原版 RGSS 不宣称逐帧一致，许可不明不放入真图 CI |

证据等级不可混淆：`SOURCE-PROVEN` 原版源码；`FSDB-OBSERVED` 带 digest 的素材；`STATIC-INFERRED` JS/BFS/replay；`PROJECT-DECISION-PROVISIONAL` 可测的临时产品策略；`PRODUCT-OBSERVED` 实际 LoomRealm 产品运行；`DYNAMIC-OBSERVED` 原版 RGSS 日志。`COMPLETE/provenNegativeBridge` 仅限工具声明的入口，并非全游戏 Ruby 已遍历。

## 2. 已有基础与事实边界

Map7 是限定扫描内 Bridge 负例，Map21 有 93 个 tag15 格及八桥事件，bridgeLevel 0/2 的 `over_trigger?` true 是静态计算；Map47 有 30 个 Ledge 格，404 已识别为 choices 控制流。Map7 `(40,0)` 物化 edge→Map21 四组 Off/On→实际 tag15→反向 transfer 的 `replayWorld` 已为**统一静态** E2E，独立检查仅验证边成员/邻接/tag15 与部分 checkpoint，不证明 RGSS 帧。旧分段 `traceStep.transfer=null` 不作产品验收。完整来源/文件 SHA 在证据 §16。

Agent 记录有 FSDB 时本地 fixture **106 pass**、map package **78 pass**；绿 CI [35499617524](https://github.com/lithdoo/loom-realm/actions/runs/35499617524) 在 `5b550b4` 是 **100 pass / 0 fail / 6 live skip**。这些都不是新开发完成后的测试结果，6 skip 也不是原版真实地图通过。当前 `TilesetRecord` 五字段、Runtime 四字段 InitialInput、walk 250ms；`terrain_tags`、MapAction、jump payload **尚未实现**。新 schema subject 与 M14/M15 历史资格不可混写。

## 3. 六道 FG 继续 OPEN，但不是编码停工令

| Gate | 已有事实 | 正式 PASS 尚缺什么 |
|---|---|---|
| **FG-01 原版事实** | Map7 限定负例、Map21 统一静态 E2E、Map47 静态样本 | 原版 RGSS 动态事件/跳跃/转图对照，或授权评审明确批准缩小保真范围 |
| **FG-02 数据/导入** | 取证器区分连接 source/target mapId；三条 PBS 物化 7 edge，67/93 D0-false 仅潜在风险，**无已证实误删** | AG-01 新 Tileset/schema/迁移、Content、狭义 MapAction、Transfer 实际 producer-consumer 与新 subject 审查 |
| **FG-03 事件/状态** | 原版 `start≠execute`、八事件静态触发矩阵、源码转图清桥 | AG-03 产品事件/held input/重复/多事件与原版时序对照，或正式缩减承诺 |
| **FG-04 运动/画面** | 现有 walk 250ms、epoch 与 depth 缓存断点 | AG-03/04 完整数值运动 ABI、resize/cancel/transfer/旧包、原地桥深度原子更新及原版保真审查 |
| **FG-05 fixture/CI/许可** | 本地原始 SHA、合成 fixture、绿 CI 100/0/6 skip | 素材合法再分发许可，**或**授权明确选择 synthetic-only CI 的资格范围；真实地图 skip 不得记 PASS |
| **FG-06 合同/资格** | C-01～08 候选、AG 交接、Issue #42 | 根据已实现 ABI 生成正式 V1、固定实施 SHA、M14/M15 新 subject 差异及 reviewer 对 FG/DEC 逐项签核 |

**六 FG 全 OPEN。** 允许在对应 PR 采用有来源、明确标注并经产品测试的 `PROJECT-DECISION-PROVISIONAL` 时序及 jump 数值 duration；不能伪装成原版 `DYNAMIC-OBSERVED`。受阻的资格分支不得使与之无关的产品开发全部停工。

## 4. 产品闭环的唯一验收

按 [交付合同](./TERRAIN_BEHAVIOR_DELIVERY_CONTRACT.md)：AG-01 数据/Content → AG-02 有效标签/通行与 blocked/walk → AG-03 Bridge 事件/bridgeLevel/静止 depth → AG-04 一次两格 Ledge jump/Browser motion。PR3/4 共享 Runtime/Browser 需先统一 ABI，不能并行覆写。每 PR 写实际 SHA、生产/消费 schema、合成/本地合法真图测试、失败处理及 CI 结果。

合流后必须用**真实 LoomRealm Runtime+Browser**重放 Map7→Map21 四组桥端（桥上/桥下/折返/切图归零、事件与 depth），Map47 正向一次 jump 与逆向/阻挡/边界/中间事件反例；同时保证 walk/resize/transfer/旧 M14/M15 不退化。产品功能通过可标 `IMPLEMENTED / BEHAVIOR QUALIFICATION PENDING`；无 RGSS/许可/签核时不标 `CONTRACT FROZEN`。

**结论：现在直接实施 AG-01，停止将 FZ 准备当成编码前提。** 未证实的原版逐帧/素材许可/正式签核独立保留，不构造虚假绿色门禁。
