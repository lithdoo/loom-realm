# Terrain Behavior：原版保真合同候选摘要（未签署）

> **产品已在 main 实现；原版动态资格未完成，CONTRACT_V1 尚未签署。** 本页仅记录待核实的原版保真资格及 C-01～08/DEC-01～07 的审核范围；不阻止已授权的产品实现，也不声明原版逐帧保真。历史完整、已去除受限完整事件附录的 C-01～08 讨论和原始备选见 [固定 main 快照](https://github.com/lithdoo/loom-realm/blob/c00fe76b20ab07aeebe18a8056e39a024a9f9859/game-libs/map/TERRAIN_BEHAVIOR_CONTRACT_CANDIDATE.md)；其 `NOT IMPLEMENTED` 和禁止实施语句是**当时的历史状态，不再生效**。

## 当前事实与审查层级

产品实现及准确接口以 [现行交付边界](./TERRAIN_BEHAVIOR_DELIVERY_CONTRACT.md)、`src/semantics.ts`、`src/runtime.ts`、`browser/map.browser.js`、importer/Content 与当前测试为准。原始 v21.1 源码固定 `ea7b5d56d2436591160983c4e641a2ceee2d875a`；本地 Map7/21/47/Tilesets 等结构化 SHA 和安全复现入口见 [证据](./TERRAIN_BEHAVIOR_EVIDENCE.md)。`SOURCE-PROVEN`、`FSDB-OBSERVED`、`STATIC-INFERRED`、`PRODUCT-OBSERVED` 与原版 `DYNAMIC-OBSERVED` 是不同等级，不可互相冒充。未核清素材权利前不得提交原始 rxdata/PBS/完整事件命令。

## C-01～08 审查范围

| 项 | 产品落地事实与原版资格边界 |
| --- | --- |
| C-01 Data | `terrain_tags` + 显式旧 Tileset 迁移、新 schema subject 已实现；独立正式资格仍需核对生产者/消费者及合法输入。 |
| C-02 Semantics | TerrainTag 与 passage 分离，Neutral/Bridge/Ledge 产品语义有测试；尚不能声称全部原版游戏状态保真。 |
| C-03 Event/Transfer | 白名单 MapAction 与源/目标 MapTransfer 已实现；Map21 八事件 `over_trigger?` 的早期结果为静态推导，不是逐帧运行。 |
| C-04 Time | 产品区分通行、front/here、start 与 execute，并修复 held input；原版 interpreter tick、等待帧、同帧事件顺序仍需 RGSS 观察或正式调整验收范围。 |
| C-05 State | Runtime 桥层 0/2 与切图重置为产品事实；需要原版状态转移动态对照才能升级保真资格。 |
| C-06 Motion/Render | 产品 walk 250ms、jump 400ms/单动作、同步桥深度及 motion/epoch fencing；jump 时长、弧线、遮挡的原版精度仍待测。 |
| C-07 Support | 本切片仅 Neutral(13)/Bridge(15)/Ledge(1)；水/冰/骑行/冲浪、任意 NPC 解释器及跨图 jump 不在承诺范围。 |
| C-08 Qualification | 本地真实素材和 CI 合成/跳过必须分开；未经素材许可、原版动态和授权 reviewer 审查不得签发 CONTRACT_V1。 |

DEC-01～07 的旧备选和取舍可追溯上述固定历史版本；**是否批准原版行为假设、正式 schema/ABI、权利与签署仍 OPEN**，不能将产品实现视作自动审签。六项独立 FG 的当前状态、签署条件与记录入口仅在 [冻结资格记录](./TERRAIN_BEHAVIOR_FREEZE_READINESS.md)；待完成内容只在[路线图](../../doc/30-implementation/roadmap.md)登记。
