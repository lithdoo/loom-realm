# Terrain Behavior：现行产品交付边界

> **PRODUCT IMPLEMENTED / ORIGINAL RGSS DYNAMIC TECHNICAL EVIDENCE COMPLETE / POLICY AND AUTHORIZED SIGN-OFF PENDING / CONTRACT_V1 NOT FORMALLY SIGNED.** 代码最初通过 [PR #43](https://github.com/lithdoo/loom-realm/pull/43) 合入 main；2026-10-09 又在 official v21.1 runtime 上完成 Map21/47 动态观察，并在 subject `8131f6dd140ac21edb52879eb9ec1fd1a8cd7ba9` 将 Ledge 由 400ms 修正为原版观察的 500ms。精确 provenance、帧事实、产品对照与回归见[最终资格记录](../../doc/30-implementation/final-performance-terrain-qualification.md)。FG-05/06 尚未批准，因此此状态仍不等于正式合同签署。

## 产品责任与数据

合法的本地 Essentials Map/Tileset/Events/PBS 只读 → 白名单 importer → prepared FSDB → Content 校验 → map-owned 地形纯查询/移动计划 → Runtime 唯一事件及运动状态 → 同一次 RenderDomain 人物/相机/地形深度更新 → map-owned Browser 呈现。具体阅读入口是 [当前地图模块](../../doc/20-modules/loom-map/README.md)。

- `struct.Tileset` 保留 `id,tileset_name,autotile_names,passages,priorities`，新增 1D `terrain_tags` 并以显式版本迁移处理旧五字段记录；错误输入 fail-closed。不得修改原版 passage、静默补默认字段或将本次数据 schema 追认到旧 M14/M15 资格 subject。
- 原值 0～17 保留；此切片只为 Neutral(13)、Bridge(15)、Ledge(1) 新增语义。None(0) 和 NoEffect(17) 不可冒充 Neutral。有效 TerrainTag 和双向 passage 必须分开查询。
- MapAction 只投影有证据的 `pbBridgeOn`/`pbBridgeOff` 事件页面/占用/触发，不执行原始 Ruby 或引入通用事件解释器。相关未知脚本局部 fail-closed；不可按固定 map/event/tile ID 编写玩法分支。MapTransfer 源和目标各按自身 mapId 校验。

## 行为与所有权

- 单次方向输入仅有一项 `blocked | walk | jump` 计划；walk 为既有 250ms。受阻走 front touch，成功到达后才判断 here/arrival；事件 start 与 interpreter execute 分离，受阻不能启动 walk-on Bridge 事件。
- Runtime 唯一持有坐标、方向、`bridgeLevel∈{0,2}`、事件调度、motionId/sceneEpoch/visualEpoch。On execute 后为 2，Off execute 或 transfer 后为 0；事件完成后持续按键仍可继续输入，但不能在同次输入重新判定另一动作。
- Bridge 层切换即使原地发生，也必须把人物、地形深度和必要相机投影在同一个 RenderDomain 更新中提交；不可用常量 z-index 或 `+32` 猜测代替桥上/桥下实际层级。
- Ledge 在支持的方向执行**一次跨两格 jump、一个 motionId**，中间格不作为 walk 到达事件；合法落点只触发一次 arrival。official v21.1 动态观察确认 500ms 定义与 24px 峰值，产品已对齐；跨图 jump 不支持。
- Browser 只验证并播放 Runtime payload，不管理通行或桥状态；resize、取消、切图和旧 motion completion 不得覆盖新状态。

## 产品验证及资格边界

覆盖 Map7 普通行走/传送和桥负例、Map7→Map21 四对 On/Off 与桥上桥下/held input/blocked touch、Map47 两格 jump 与逆向/落点/边界，以及 resize/cancel/旧包和原有 M14/M15 回归。运行 `npm test -w @loomrealm-game/map`、相关 fixtures、`npm run test:m14` 和真实产品 Browser/Desktop E2E；仅合法本地素材执行 live 输入，CI skip 不能算 PASS。静态回放不等于产品 E2E；产品 E2E 亦不等于原版 RGSS 动态测量。

[原版事实与可复现来源](./TERRAIN_BEHAVIOR_EVIDENCE.md)；[尚未签署的 FG/DEC 资格](./TERRAIN_BEHAVIOR_FREEZE_READINESS.md)；[原版合同候选摘要](./TERRAIN_BEHAVIOR_CONTRACT_CANDIDATE.md)；[唯一路线图](../../doc/30-implementation/roadmap.md)。AG-01～04 的实施顺序和逐轮 review 仅见[已清理许可边界的历史 main 快照](https://github.com/lithdoo/loom-realm/tree/c00fe76b20ab07aeebe18a8056e39a024a9f9859/game-libs/map)，不再以过时的 NOT IMPLEMENTED 文本派单。
