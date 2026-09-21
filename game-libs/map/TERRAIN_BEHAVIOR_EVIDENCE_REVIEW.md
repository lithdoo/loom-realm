# Terrain Behavior：证据复核、证明边界与交付状态

> 本文件是原版取证的历史复核，不代表本次重新运行原版 RGSS。当前**产品代码已实施，主分支合入仍以 PR/CI 为准**；`BEHAVIOR QUALIFICATION PENDING / NOT FORMALLY FROZEN`。结构化原始事实和再生成入口见 [证据](./TERRAIN_BEHAVIOR_EVIDENCE.md) §1–16；实施/产品完成定义见 [交付合同](./TERRAIN_BEHAVIOR_DELIVERY_CONTRACT.md)。旧版本证据的完整 Map7 命令附录因再分发范围未获核清，已从当前发布版删去，改由合法本地 FSDB 再生成。不得将历史提交的记录当作最新 CI。

## 1. 原版事实与边界

| 对象 | 固定证据 | 限制 |
|---|---|---|
| Map7 | Map007 SHA `c34ddaaec265241fd35149d6d3758f8f08a5503b057c891e396c39b08518c6b7`；11 events/19 pages/521 commands；tag15 格和桥候选均为 0 | 只在受检 corpus 与入口内是负例；不证明全游戏 Ruby 方法体无桥 |
| Map21 | Map021 SHA `cd226a09dbf5cbfd2207edd44fb7dd419327ae901a1f1c0f6ad35601df85c575`；93 个实际 tag15 格；8 个直接桥事件 IDs 4/7/10/20/22/23/25/28 | `over_trigger?` 在 0/2 均 true 是静态计算，原版逐帧未实测 |
| Map47 | Map047 SHA `5f4ee232e4f4b8b44950f826b13cd601ffecb87e455c1dda92c5908152df043e`；30 Ledge 格；`(16,9)→(16,11)` | 静态跳跃样本；没有原版弧线/相机和跨图动态结果 |
| corpus | 69 张 `Map*.rxdata`；在受检范围内仅 Map21 命中 Bridge | 不能外推其它发行版、动态 eval 或自动 Common Event |

原版源码固定 Pokémon Essentials v21.1 commit `ea7b5d56d2436591160983c4e641a2ceee2d875a`。`SOURCE-PROVEN` 指源码，`FSDB-OBSERVED` 指带 digest 的本地文件，`STATIC-INFERRED` 指静态计算，`PRODUCT-OBSERVED` 指 LoomRealm 实际运行，`DYNAMIC-OBSERVED` 专指原版游戏帧日志；原版日志目前不存在。

## 2. REVIEW-01～04 结果

| ID | 取证修复 | 边界 |
|---|---|---|
| REVIEW-01 | `vanilla-map-rules.mjs` 逐层模拟 `Game_Map#playerPassable?`；Bridge 八事件逐占用格 `over_trigger?` 在 0/2 静态均 true | `Event#start` 置位与解释器真正 execute 帧尚未原版动态验证 |
| REVIEW-02 | Table shape、负 tile、异常 355/655 和 111/117 非法参数 fail-closed 或 INCOMPLETE | 未扫描 Ruby 方法体不能称 COMPLETE |
| REVIEW-03 | CE A→B→C 可达性、循环/缺目标合成用例 | Map7/21 的 117 调用 0；不排除独立 autorun/parallel |
| REVIEW-04 | 传送按源/目标 mapId 各自校验尺寸/Tileset；PBS 三条物化 7 edge | `(21,E,77,47)` 几何越界；67 个 D0-false 桥格仅潜在风险，未证实实际误删 |

独立脚本 `map-evidence-independent-check.mjs` 重读 Map21 桥格与八事件、Map47 Ledge；`map21-e2e-independent-check.mjs` 核对统一回放的边成员、邻接、tag15、部分 start/execute checkpoint。独立检查并未覆盖全部 `over_trigger?` 细节或 RGSS 逐帧。

## 3. E2E-21 静态连续路径

旧 `map21-bridge-routes.mjs` 分段 BFS/replay 只能生成输入，不可单独算 E2E。新 `map-world-replay.mjs#replayWorld` 从 Map7 `(40,0)` 的真实物化边进入 Map21 `(19,76)`，单状态连续经过 Off→On→真实 tag15→Off→反向传送。四组路线的静态 trace `continuous=true`、`walkedTag15=true`、返回 Map7 且 bridgeLevel=0，独立检查通过。中北组从南侧落点会经过其它桥事件，记录 On start/execute 8/8，不应隐去。所有上述结果均 `STATIC-INFERRED`，不是 RGSS 游戏输入录像。

## 4. Map47 Ledge 与未知命令

真实样本 30 个合法两格静态跳、30 个反向失败；`(16,9)→(16,11)` 仍成立。中间事件、边界及落点阻挡缺原版真实样本，以 `sampleKind=synthetic` 的原创夹具验收，不能冒充 Map47 实测。404 已明确标注为 `show-choices-branch-end`，Map47 EV007/013 的该命令不在 Ledge 格；不把未知控制流当作可执行物理。跨图 jump 本轮不支持。

## 5. 测试与许可边界

历史 Agent 记录 Windows 10/Node v22.12.0、有本地 FSDB：取证专项早期 36 pass、后续 37 pass；统一 freeze 合成/实图测试 54 pass；`npm run test:fixtures` 本地 106 pass。历史绿 CI [35499617524](https://github.com/lithdoo/loom-realm/actions/runs/35499617524) 属于 `5b550b4`，100 pass、6 live skip，不能代替当前实现分支的 CI。当前测试必须取当前 SHA 对应的 Actions。原版 FSDB、Map21/47 完整转储及 Map7 完整事件命令都不得以未核清的再分发资格提交；当前 [证据](./TERRAIN_BEHAVIOR_EVIDENCE.md) 已用精简索引替代原始命令附录。跳过的 live 测试只标 skip。

## 6. 实施与正式资格分开

AG-01～04 的产品功能已在 `feat/map-terrain-behavior` 实施；相关 PR 合入与产品 CI 应另行验收。FG-01～06 的原版逐帧保真、素材分发、合同正式签署仍按 [冻结准备](./TERRAIN_BEHAVIOR_FREEZE_READINESS.md) 的独立资格标准保持 OPEN。用户的实施授权不代表 reviewer 已批准正式 `CONTRACT_V1`。取证之外的真实代码状态、最终 SHA、browser 及 CI 以 [交付合同](./TERRAIN_BEHAVIOR_DELIVERY_CONTRACT.md) 和对应提交为准。
