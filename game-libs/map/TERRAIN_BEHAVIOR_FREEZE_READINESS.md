# Terrain Behavior：原版行为资格与正式签署记录

> **PRODUCT/STATIC TECHNICAL EVIDENCE CURRENT / ORIGINAL RGSS DYNAMIC QUALIFICATION BLOCKED ON EXTERNAL RUNTIME / CONTRACT_V1 NOT FORMALLY FROZEN.** [PR #43](https://github.com/lithdoo/loom-realm/pull/43) 已合入 main；2026-10-09 对 Terrain subject `a5e406827d0e3814dad3ac797c4b5f13015173a0` 重跑了合法本地 FSDB、产品与回归证据，见[最终资格记录](../../doc/30-implementation/final-performance-terrain-qualification.md)。本机邻近合法范围没有 Game.exe/RGSS/mkxp runtime，因此这仍不是六道原版资格签核。当前产品行为由[地图模块说明](../../doc/20-modules/loom-map/README.md)和[交付边界](./TERRAIN_BEHAVIOR_DELIVERY_CONTRACT.md)记录。未完成事项只由[路线图](../../doc/30-implementation/roadmap.md)排期，本页只拥有 FG 的精确资格状态。

原始源码：Pokémon Essentials v21.1 `ea7b5d56d2436591160983c4e641a2ceee2d875a`。原始文件 SHA、静态规则、产品观察等级和合法本地复现入口见 [证据](./TERRAIN_BEHAVIOR_EVIDENCE.md)；合同审查范围见 [C-01～08 候选摘要](./TERRAIN_BEHAVIOR_CONTRACT_CANDIDATE.md)。六 FG 均未获得授权签核；下表区分技术通过、外部动态阻塞、policy 审批和签署状态。不可将静态 replay、合法本地 FSDB 或 LoomRealm 产品试玩描述成原版 RGSS 动态帧日志，也不可把 live skip 算 PASS。

| FG | 已有产品/静态基础 | 仍需独立签核的证据 | 资格状态 |
| --- | --- | --- | --- |
| FG-01 原版事实 | Map7/21/47 固定摘要、Map21 静态统一路线已在当前 run 重算 | 原版 RGSS 事件/桥/跳跃/持续输入帧日志，或经授权的正式缩窄决议 | **BLOCKED — EXTERNAL ORIGINAL RUNTIME REQUIRED** |
| FG-02 数据与导入 | `a5e4068` 上版本化 terrain_tags、迁移、MapAction、live FSDB 与 producer/consumer 回归通过 | 授权 reviewer 核对结果与 subject | **TECHNICAL PASS / SIGN-OFF PENDING** |
| FG-03 事件状态 | On/Off、held input、blocked/here 产品回归在真实本地 FSDB 与合成边界中通过 | 原版 start/interpreter execute、重复按键和桥层时序对照，或正式缩窄决议 | **PRODUCT/STATIC PASS; ORIGINAL DYNAMIC BLOCKED** |
| FG-04 运动显示 | 一次 jump、桥层深度原子重投影、像素遮挡回归通过 | 原版跳跃时长、遮挡/运动精度，或正式缩窄决议 | **PRODUCT/STATIC PASS; ORIGINAL DYNAMIC BLOCKED** |
| FG-05 许可与 CI | 原创合成 fixture、产品测试及合法本地 live 入口；未发现再分发许可 | 批准 `synthetic-only CI + legal-local original qualification + sanitized repo facts/digests` policy | **POLICY B DRAFTED / MAINTAINER APPROVAL REQUIRED** |
| FG-06 合同签署 | 实际类型、C-01～08 候选、测试与审查包已集中 | FG-01/03/04 动态结论、FG-05 批准，以及授权 reviewer 对版本/ABI、DEC 和 FG 的具名签署 | **READY AFTER EXTERNAL GATES / NOT SIGNED** |

**严格区分：** 实现已在 main，不再给 AG-01～04 发工作卡；FG OPEN 只阻止宣称原版逐帧保真和 `CONTRACT FROZEN`，不撤销产品功能。若拿到新的原版动态证据，逐项补充来源、命令、原版环境、精确代码/素材 digest、审核人、日期和结果；不能回填历史 M14/M15 ledger 或在没有实际审核的情况下创建正式 V1。

## 2026-10-09 qualification checkpoint

完整 subject audit、环境、命令、raw artifact SHA-256、Map21/47 静态与产品对照、C-01～08/DEC-01～07 disposition 见[最终资格记录](../../doc/30-implementation/final-performance-terrain-qualification.md)。当前没有原版 RGSS 动态 trace，也没有具名授权 reviewer approval；因此禁止创建 `TERRAIN_BEHAVIOR_CONTRACT_V1.md`、禁止关闭 Issue #42、禁止把上述技术 PASS 改写成六门正式 PASS。
