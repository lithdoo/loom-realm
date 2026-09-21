# 地图游戏库：当前产品行为

> 实现入口：`game-libs/map` / `@loomrealm-game/map`。Terrain Behavior 已由 [PR #43](https://github.com/lithdoo/loom-realm/pull/43) 合入 `main`；**已实现不等于原版 RGSS 逐帧保真或当前 subject 正式资格通过**。具体产品行为见[交付边界](../../../game-libs/map/TERRAIN_BEHAVIOR_DELIVERY_CONTRACT.md)，原版资格见[FG 记录](../../../game-libs/map/TERRAIN_BEHAVIOR_FREEZE_READINESS.md)；下一阶段见[唯一路线图](../../30-implementation/roadmap.md)，M14 精确资格见[M14 ledger](../../30-implementation/m14-qualification.md)。

## 责任与数据流

```text
合法本地 Essentials / RMXP 原始数据（只读）
→ tools/fixtures/essentials-v21.1：选择性导入与校验
→ prepared FSDB：Map / Tileset / 狭义 MapAction + resources
→ M12 ContentClient
→ map-owned Runtime（坐标、输入、事件、运动唯一 authority）
→ RenderDomain → M11 Renderer Store → M13 Web Presentation
→ game-owned lr-map-view / lr-map-sprite
```

`game-libs/map` 是可复用游戏业务，而非 `packages/map` 公共协议。导入工具不进入 Runtime；Browser 不决定通行或事件；Game Entry 和页面样式归 `examples/essentials-v21.1`。

## 当前数据与运动语义

- 地图保持 RMXP 三层 Table；Tileset 保留 `id,tileset_name,autotile_names,passages,priorities` 并新增 `terrain_tags`。旧记录显式迁移，缺失或非法 Table fail-closed。地形原值 0–17 全部保留；此切片只实现 Neutral(13)、Bridge(15)、Ledge(1)，None(0) 与 NoEffect(17) 不等于 Neutral。
- `resolveEffectiveTerrainTag` 与 `evaluatePassability` 是不同纯查询；检查源方向、目标反方向、图层优先级与桥层。一次输入只生成 `blocked | walk | jump` 之一；blocked 不发生半步位移。
- 狭义 `MapAction` 只识别证据确定的 `pbBridgeOn`/`pbBridgeOff` 事件页面、占用和触发；不执行原始 Ruby。不透明相关事件局部拒绝，不因无关 NPC 使整图失败；不按 Map/event/tile 固定 ID 写玩法代码。
- 事件调度先判断本次移动：blocked/front 与成功 arrival/here 互斥。事件 start 和后续 interpreter execute 是两个检查点；受阻不能错误启动 walk-on Bridge。On/Off 执行后持续方向输入应继续调度下一步，不能同一输入二次判定。
- Runtime 独占 `bridgeLevel∈{0,2}`；On execute 后为 2，Off execute 和 transfer 后为 0。桥面、人物与必要相机在同一次 RenderDomain 更新里随状态改变；不要以人物固定 z-index 代替正确遮挡。
- 普通 walk 为产品原有 250ms；Ledge 是一次两格 jump、一个 motionId，中间格没有普通 arrival；落点事件一次。jump 400ms 和弧线系数属于产品暂定策略，不是原版 RGSS 动态证据；跨图 jump 不支持。切图、resize、取消及过期 motion 完成包不能回写新状态。

准确接口、类型及消费者以 `game-libs/map/src/semantics.ts`、`src/runtime.ts`、`browser/map.browser.js` 和测试为准；不在本文另造 on-wire ABI。

## 场景与验证

Map7 普通行走/Transfer 和桥负例；Map7→Map21 四组 On/Off（EV004/028、EV010/007、EV022/020、EV025/023）覆盖桥面、桥下、折返、held input 和 blocked touch；Map47 包含一次两格下跳 `(16,9)→(16,11)` 与逆向、阻挡、边界负例。事件 ID 仅用于场景识别，产品逻辑不可硬编码。

测试入口：`npm test -w @loomrealm-game/map`、`npm run test:m14`、真实 Browser/Hostra 产品 E2E、Essentials importer fixture tests；原始游戏素材仅在合法本地运行 live，CI skip 不等于 PASS。静态路线重放不能替代产品 E2E；产品 E2E 也不能证明原版 RGSS 帧精度。

规范引用：[User Input v1](../../15-contracts/user-input-v1.md)、[Render Update v1](../../15-contracts/render-update-v1.md)、[Content API v1](../../15-contracts/content-api-v1.md)、[M13 Presentation API](../../15-contracts/web-presentation-api-v1.md)。原始 SHA、事件摘要与合法复现入口见[地形证据](../../../game-libs/map/TERRAIN_BEHAVIOR_EVIDENCE.md)；尚待正式签署的 C-01～08 仅见[原版合同候选摘要](../../../game-libs/map/TERRAIN_BEHAVIOR_CONTRACT_CANDIDATE.md)。已完成 AG-01～04 任务卡、逐轮评审与方案草稿已经从 `game-libs/map/` 删除，原文仅可通过[安全的旧 main 快照](https://github.com/lithdoo/loom-realm/tree/c00fe76b20ab07aeebe18a8056e39a024a9f9859/game-libs/map)追溯。
