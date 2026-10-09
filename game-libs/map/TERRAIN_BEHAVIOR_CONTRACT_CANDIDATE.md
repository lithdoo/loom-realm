# Terrain Behavior：原版保真合同候选摘要（历史 / 已由 v1 取代）

> 本候选页已完成使命。2026-10-09 current subject `8131f6dd140ac21edb52879eb9ec1fd1a8cd7ba9` 的原版动态技术证据、Policy B 治理决定和最终关闭均已完成；current contract 为 [TERRAIN_BEHAVIOR_CONTRACT_V1.md](./TERRAIN_BEHAVIOR_CONTRACT_V1.md)。本页只保留 C-01～08/DEC-01～07 的候选审查历史，不再拥有 current status。

产品实现及准确接口以 [现行交付边界](./TERRAIN_BEHAVIOR_DELIVERY_CONTRACT.md)、`src/semantics.ts`、`src/runtime.ts`、`browser/map.browser.js`、importer/Content 与当前测试为准。原始 v21.1 源码固定 `ea7b5d56d2436591160983c4e641a2ceee2d875a`；本地 Map7/21/47/Tilesets 等结构化 SHA 和安全复现入口见 [证据](./TERRAIN_BEHAVIOR_EVIDENCE.md)。`SOURCE-PROVEN`、`FSDB-OBSERVED`、`STATIC-INFERRED`、`PRODUCT-OBSERVED` 与原版 `DYNAMIC-OBSERVED` 仍必须严格区分。

## C-01～08 候选范围

| 项 | 最终收口前的候选范围 |
| --- | --- |
| C-01 Data | `terrain_tags` + 显式旧 Tileset 迁移、新 schema subject。 |
| C-02 Semantics | TerrainTag 与 passage 分离；Neutral/Bridge/Ledge 语义。 |
| C-03 Event/Transfer | 白名单 MapAction 与源/目标 MapTransfer；Map21 四对 On/Off 动态观察。 |
| C-04 Time | move admission、arrival/start、execute、held input 顺序。 |
| C-05 State | bridgeLevel 0/2、切图 reset、可见深度切换。 |
| C-06 Motion/Render | walk 250ms、jump 500ms、24px 峰值、同步桥深度及 motion/epoch fencing。 |
| C-07 Support | 仅 Neutral(13)/Bridge(15)/Ledge(1)；水/冰/骑行/冲浪、任意 NPC 解释器及跨图 jump 不在范围。 |
| C-08 Qualification | legal-local original qualification、synthetic-only CI、sanitized repository evidence。 |

上述候选范围及 DEC-01～07 的最终接受状态由 [Terrain Behavior Contract v1](./TERRAIN_BEHAVIOR_CONTRACT_V1.md) 持有；当前项目级关闭见 [final qualification closure](../../doc/30-implementation/final-qualification-closure.md)。
