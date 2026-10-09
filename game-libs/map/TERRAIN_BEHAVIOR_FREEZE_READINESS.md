# Terrain Behavior：原版行为资格与正式关闭记录

> 本页原先用于跟踪 FG-01～06 的冻结准备状态。该准备阶段已于 2026-10-09 结束；current status 已迁移到 [Terrain Behavior Contract v1](./TERRAIN_BEHAVIOR_CONTRACT_V1.md) 和 [final qualification closure](../../doc/30-implementation/final-qualification-closure.md)。Issue #42 已关闭。

Qualification subject：`8131f6dd140ac21edb52879eb9ec1fd1a8cd7ba9`。

原版动态证据覆盖：

- Map21 四组 Bridge On/Off：25/23、22/20、10/7、4/28；
- held input 与 move admission / event start / interpreter execute / bridge transition 顺序；
- Map47 `(16,9)→(16,11)` 正向 jump、逆向 blocked、原版 500ms 与 24px 峰值；
- 产品已将旧 400ms Ledge 修正为 500ms，并完成受影响 M14/M15 重资格。

Repository evidence policy：`synthetic-only CI + legal-local original qualification + sanitized repository facts/digests`。原始 runtime、rxdata、PBS、Graphics、Audio、截图与 raw logs 不进入仓库。

FG-01～06、C-01～08、DEC-01～07 的 current disposition 不再由本准备页单独维护，以正式 v1 合同和最终关闭记录为准。Map47 corpus 中不存在的 source-blocked、destination-blocked、boundary、skipped-cell-event 场景仍仅属于 synthetic coverage，不能回写成 original observation。

未来 executable behavior 或 qualification input 改变时，按仓库 subject/staleness 规则重新资格。
