# Terrain Behavior：原版行为资格与正式签署记录

> **ORIGINAL RGSS DYNAMIC TECHNICAL EVIDENCE COMPLETE / POLICY AND AUTHORIZED SIGN-OFF PENDING / CONTRACT_V1 NOT FROZEN.** 2026-10-09 对 current Terrain subject `8131f6dd140ac21edb52879eb9ec1fd1a8cd7ba9` 完成 official Pokémon Essentials v21.1 Map21/47 动态观察、产品对照和受影响回归。原版 500ms Ledge 与旧产品 400ms 的 divergence 已修复。精确环境、digest、帧事实、comparison 与测试见[最终资格记录](../../doc/30-implementation/final-performance-terrain-qualification.md)。本页不伪造 maintainer policy approval 或 reviewer signature。

原始源码固定为 Pokémon Essentials v21.1 `ea7b5d56d2436591160983c4e641a2ceee2d875a`。原始文件 SHA、静态规则、动态观察等级和合法本地复现边界见[证据](./TERRAIN_BEHAVIOR_EVIDENCE.md)；合同审查范围见 [C-01～08 候选摘要](./TERRAIN_BEHAVIOR_CONTRACT_CANDIDATE.md)。原始 runtime、rxdata、PBS、Graphics、Audio、截图和 raw logs 只留在 gitignored 本地环境；仓库只保存 sanitized 结构事实及 digest。

| FG | 当前证据 | 仍需外部动作 | 资格状态 |
| --- | --- | --- | --- |
| FG-01 原版事实 | official v21.1 runtime/data identity；Map21 四对 Bridge、held input；Map47 正向/逆向 jump 的 observation-only sanitized traces | 授权 reviewer 核对 subject、capture boundary 与结论 | **TECHNICAL PASS / AUTHORIZED SIGN-OFF PENDING** |
| FG-02 数据与导入 | current subject 的 versioned `terrain_tags`、migration、MapAction、live FSDB、producer/consumer regressions PASS | 授权 reviewer 核对结果 | **TECHNICAL PASS / SIGN-OFF PENDING** |
| FG-03 事件状态 | 原版 move admission→arrival/start→execute/state transition 顺序、0↔2、held no duplicate；产品 front/here/blocked tests PASS | 授权 reviewer 核对范围与 equivalence 分类 | **TECHNICAL PASS / SIGN-OFF PENDING** |
| FG-04 运动显示 | 原版两格 jump、500ms 定义、24px 峰值、depth、held 与逆向 blocked；产品 500ms 修复和 browser/pixel regressions PASS | 授权 reviewer 核对 exact/observable boundary | **TECHNICAL PASS / SIGN-OFF PENDING** |
| FG-05 许可与 CI | 未发现原始 Pokémon/Essentials 素材的完整再分发许可；CI 继续只使用原创可再分发 fixtures | Maintainer 批准 Policy B：`synthetic-only CI + legal-local original qualification + sanitized repo facts/digests` | **POLICY B DRAFTED / MAINTAINER APPROVAL REQUIRED** |
| FG-06 合同签署 | C-01～07 technical package ready；C-08 等待 policy/signature；DEC-01～07 已整理但未签署 | 真实授权 reviewer 对 subject、ABI、C/DEC/FG 具名签署 | **READY FOR AUTHORIZED SIGN-OFF / NOT SIGNED** |

## Dynamic evidence scope

- Map21 pairs：`25 On/23 Off`、`22 On/20 Off`、`10 On/7 Off`、`4 On/28 Off`。四组均记录真实按键、move admission、event start、interpreter execute、bridge transition 与可观察深度。
- Held input：连续实际 `Input.dir4` 跨过 Off/On，没有在同一 event occupancy 重复 action。
- Map47：`(16,9)→(16,11)` 一次正向两格 jump；500ms 定义、68 个被观察 jumping frames、24px 峰值、z=240；逆向真实输入保持 `(16,11)` 且没有 jump。
- Map47 corpus 没有 source-blocked、destination-blocked、边界或 skipped-cell-event 原版样本；这些只由明确标注的 synthetic tests 覆盖，不能写成 original observation。

## Contract disposition

C-01～07 在当前声明 slice 内已有技术证据；C-08 等待 FG-05/06。DEC-01～07 仍为 `UNSIGNED / REVIEW REQUIRED`。技术观察解决事实问题，不自动批准 policy、ABI 或 contract wording。

**严格边界：** 实现与 dynamic evidence 完成不等于 `CONTRACT FROZEN`。没有 maintainer 对 FG-05 的明确批准、没有真实授权 reviewer 的具名审查前：

- 不创建 `TERRAIN_BEHAVIOR_CONTRACT_V1.md`；
- 不把 FG-05/06 标为 PASS；
- 不关闭 Issue #42；
- 不把 synthetic-only Map47 边界案例写成原版动态事实。
