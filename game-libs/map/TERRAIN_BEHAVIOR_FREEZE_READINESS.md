# Terrain Behavior：原版行为资格与正式签署记录

> **PRODUCT IMPLEMENTED ON MAIN / ORIGINAL RGSS BEHAVIOR QUALIFICATION PENDING / CONTRACT_V1 NOT FORMALLY FROZEN.** [PR #43](https://github.com/lithdoo/loom-realm/pull/43) 已合入 main；这不是六道原版资格签核。当前产品行为由[地图模块说明](../../doc/20-modules/loom-map/README.md)和[交付边界](./TERRAIN_BEHAVIOR_DELIVERY_CONTRACT.md)记录。未完成事项只由[路线图](../../doc/30-implementation/roadmap.md)排期，本页只拥有 FG 的精确资格状态。

原始源码：Pokémon Essentials v21.1 `ea7b5d56d2436591160983c4e641a2ceee2d875a`。原始文件 SHA、静态规则、产品观察等级和合法本地复现入口见 [证据](./TERRAIN_BEHAVIOR_EVIDENCE.md)；合同审查范围见 [C-01～08 候选摘要](./TERRAIN_BEHAVIOR_CONTRACT_CANDIDATE.md)。此前六 FG 均未获得授权签核，保持 OPEN。不可将静态 replay、合法本地 FSDB 或 LoomRealm 产品试玩描述成原版 RGSS 动态帧日志，也不可把 live skip 算 PASS。

| FG | 已有产品/静态基础 | 仍需独立签核的证据 | 资格状态 |
| --- | --- | --- | --- |
| FG-01 原版事实 | Map7/21/47 源数据、Map21 静态统一路线 | 原版 RGSS 事件/桥/跳跃/持续输入帧日志，或经授权的正式缩窄决议 | OPEN |
| FG-02 数据与导入 | 版本化 terrain_tags、迁移与 MapAction 已实现 | 实际新 schema subject 的独立资格审查 | OPEN |
| FG-03 事件状态 | On/Off、held input、blocked/here 产品回归存在 | 原版 start/interpreter execute、重复按键和桥层时序对照，或正式缩窄决议 | OPEN |
| FG-04 运动显示 | 一次 jump、桥层深度原子重投影 | 原版跳跃时长、遮挡/运动精度，或正式缩窄决议 | OPEN |
| FG-05 许可与 CI | 原创合成 fixture、产品测试及合法本地 live 入口 | 明确原始素材再分发权利或批准 synthetic-only 资格；live skip 不算 PASS | OPEN |
| FG-06 合同签署 | 实际类型、C-01～08 候选与测试 | 授权 reviewer 对版本/ABI、DEC 和 FG 的具名审查及签署 | OPEN |

**严格区分：** 实现已在 main，不再给 AG-01～04 发工作卡；FG OPEN 只阻止宣称原版逐帧保真和 `CONTRACT FROZEN`，不撤销产品功能。若拿到新的原版动态证据，逐项补充来源、命令、原版环境、精确代码/素材 digest、审核人、日期和结果；不能回填历史 M14/M15 ledger 或在没有实际审核的情况下创建正式 V1。
