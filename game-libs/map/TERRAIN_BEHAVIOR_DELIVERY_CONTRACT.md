# Terrain Behavior：现行产品交付边界

> **PRODUCT IMPLEMENTED / ORIGINAL RGSS DYNAMIC QUALIFIED / CONTRACT_V1 FROZEN.** 代码最初通过 [PR #43](https://github.com/lithdoo/loom-realm/pull/43) 合入 main；2026-10-09 在 official v21.1 runtime 上完成 Map21/47 动态观察，并在 subject `8131f6dd140ac21edb52879eb9ec1fd1a8cd7ba9` 将 Ledge 由 400ms 修正为原版观察的 500ms。正式范围见 [Terrain Behavior Contract v1](./TERRAIN_BEHAVIOR_CONTRACT_V1.md)，精确 provenance、帧事实、产品对照与回归见[最终资格记录](../../doc/30-implementation/final-performance-terrain-qualification.md)和[最终关闭记录](../../doc/30-implementation/final-qualification-closure.md)。

## 产品责任与数据

合法的本地 Essentials Map/Tileset/Events/PBS 只读 → 白名单 importer → prepared FSDB → Content 校验 → map-owned 地形纯查询/移动计划 → Runtime 唯一事件及运动状态 → 同一次 RenderDomain 人物/相机/地形深度更新 → map-owned Browser 呈现。具体阅读入口是 [当前地图模块](../../doc/20-modules/loom-map/README.md)。

- `struct.Tileset` 保留 `id,tileset_name,autotile_names,passages,priorities`，新增 1D `terrain_tags` 并以显式版本迁移处理旧五字段记录；错误输入 fail-closed。
- 原值 0～17 保留；本合同 slice 只承诺 Neutral(13)、Bridge(15)、Ledge(1)。None(0) 和 NoEffect(17) 不可冒充 Neutral。有效 TerrainTag 和双向 passage 必须分开查询。
- MapAction 只投影有证据的 `pbBridgeOn`/`pbBridgeOff` 事件页面/占用/触发，不执行原始 Ruby 或引入通用事件解释器。MapTransfer 源和目标各按自身 mapId 校验。

## 行为与所有权

- 单次方向输入仅有一项 `blocked | walk | jump` 计划；walk 为既有 250ms。受阻走 front touch，成功到达后才判断 here/arrival；事件 start 与 interpreter execute 分离。
- Runtime 唯一持有坐标、方向、`bridgeLevel∈{0,2}`、事件调度、motionId/sceneEpoch/visualEpoch。On execute 后为 2，Off execute 或 transfer 后为 0；持续按键不能在同一次占用上重复 action。
- Bridge 层切换即使原地发生，也必须把人物、地形深度和必要相机投影在同一个 RenderDomain 更新中提交；不可用常量 z-index 或 `+32` 猜测代替实际层级。
- Ledge 在支持方向执行一次跨两格 jump、一个 motionId；合法落点只触发一次 arrival。official v21.1 动态观察确认 500ms 与 24px 峰值，产品已对齐；跨图 jump 不支持。
- Browser 只验证并播放 Runtime payload，不管理通行或桥状态；resize、取消、切图和旧 motion completion 不得覆盖新状态。

## Qualification / evidence policy

Repository policy is `synthetic-only CI + legal-local original qualification + sanitized repository facts/digests`. 原始 `.rxdata`、PBS、Graphics、Audio、`Game.exe`、RGSS DLL、截图和 raw observation logs 不进入仓库。静态回放、产品 E2E、原版动态观察保持不同证据等级。

[原版事实与可复现来源](./TERRAIN_BEHAVIOR_EVIDENCE.md)；[最终关闭记录](./TERRAIN_BEHAVIOR_FREEZE_READINESS.md)；[正式 v1 合同](./TERRAIN_BEHAVIOR_CONTRACT_V1.md)；[唯一路线图](../../doc/30-implementation/roadmap.md)。
