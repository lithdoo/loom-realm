# Terrain Behavior：原版保真合同候选摘要（未签署）

> **产品已实现，原版动态技术证据已完成；FG-05 policy 与 FG-06 authorized review 尚未签署，CONTRACT_V1 不存在。** 本页记录 C-01～08/DEC-01～07 的审核范围，不制造 maintainer approval。历史完整、已去除受限完整事件附录的讨论和原始备选见 [固定 main 快照](https://github.com/lithdoo/loom-realm/blob/c00fe76b20ab07aeebe18a8056e39a024a9f9859/game-libs/map/TERRAIN_BEHAVIOR_CONTRACT_CANDIDATE.md)。

> 2026-10-09 current checkpoint：C-01～07 在声明的 Terrain slice 内已有当前代码、数据/产品测试和原版动态观察支持；C-08 等待 FG-05/06。DEC-01～07 全部仍为 `UNSIGNED / REVIEW REQUIRED`。逐项证据见[最终资格记录](../../doc/30-implementation/final-performance-terrain-qualification.md)。

## 当前事实与审查层级

产品实现及准确接口以 [现行交付边界](./TERRAIN_BEHAVIOR_DELIVERY_CONTRACT.md)、`src/semantics.ts`、`src/runtime.ts`、`browser/map.browser.js`、importer/Content 与当前测试为准。原始 v21.1 源码固定 `ea7b5d56d2436591160983c4e641a2ceee2d875a`；本地 Map7/21/47/Tilesets 等结构化 SHA 和安全复现入口见 [证据](./TERRAIN_BEHAVIOR_EVIDENCE.md)。`SOURCE-PROVEN`、`FSDB-OBSERVED`、`STATIC-INFERRED`、`PRODUCT-OBSERVED` 与原版 `DYNAMIC-OBSERVED` 是不同等级，不可互相冒充。未核清素材权利前不得提交原始 rxdata/PBS/完整事件命令。

## C-01～08 审查范围

| 项 | 产品落地事实与原版资格边界 |
| --- | --- |
| C-01 Data | `terrain_tags` + 显式旧 Tileset 迁移、新 schema subject 已实现；独立正式资格仍需核对生产者/消费者及合法输入。 |
| C-02 Semantics | TerrainTag 与 passage 分离，Neutral/Bridge/Ledge 产品语义有测试；尚不能声称全部原版游戏状态保真。 |
| C-03 Event/Transfer | 白名单 MapAction 与源/目标 MapTransfer 已实现；Map21 四对 On/Off 的原版实际输入、到达、start、execute 与 state transition 已观察。 |
| C-04 Time | 产品区分通行、front/here、start 与 execute；原版观察确认 move 先准入、start 后 execute、held input 不在同一占用上重复 action。 |
| C-05 State | Runtime 桥层 0/2 与切图重置为产品事实；原版四对事件的 0↔2 transition 与可见深度切换已动态对照。 |
| C-06 Motion/Render | 产品 walk 250ms、jump 500ms/单动作、24px 峰值、同步桥深度及 motion/epoch fencing；原版 Map47 正向/逆向、held、深度和 500ms 定义已观察。 |
| C-07 Support | 本切片仅 Neutral(13)/Bridge(15)/Ledge(1)；水/冰/骑行/冲浪、任意 NPC 解释器及跨图 jump 不在承诺范围。 |
| C-08 Qualification | 本地真实素材和 CI 合成/跳过必须分开；未经素材许可、原版动态和授权 reviewer 审查不得签发 CONTRACT_V1。 |

DEC-01～07 的旧备选和取舍可追溯上述固定历史版本；**是否批准原版行为假设、正式 schema/ABI、权利与签署仍 OPEN**，不能将产品实现视作自动审签。六项独立 FG 的当前状态、签署条件与记录入口仅在 [冻结资格记录](./TERRAIN_BEHAVIOR_FREEZE_READINESS.md)；待完成内容只在[路线图](../../doc/30-implementation/roadmap.md)登记。
