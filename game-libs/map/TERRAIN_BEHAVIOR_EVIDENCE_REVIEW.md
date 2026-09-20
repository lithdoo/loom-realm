# 地形行为取证：复核结论、证明边界与冻结交接

> 状态：**Evidence review / NOT FROZEN / NOT IMPLEMENTED / NOT QUALIFIED**。本文件复核取证提交 [`e60e4a52`](https://github.com/lithdoo/loom-realm/commit/e60e4a521a726233bbda0bb1892f6d25bc47573d)，不代表又一次本地 FSDB 读取、测试复跑或原版 RGSS 运行。原始数据与运行命令见 [原始证据](./TERRAIN_BEHAVIOR_EVIDENCE.md) **§15**；§14 是先前的静态记录，若表述冲突，以带日期和输入指纹的 §15 及本文件的证明范围为准。门禁状态见 [冻结准备](./TERRAIN_BEHAVIOR_FREEZE_READINESS.md)，实施任务见 [计划](./TERRAIN_BEHAVIOR_IMPLEMENTATION_PLAN.md)。

## 1. 这次究竟完成了什么

| 对象 | 已有记录（限指定 v21.1 corpus） | 证据等级与边界 |
|---|---|---|
| Map 7 Cedolan City | Map007 SHA-256 `c34ddaaec265241fd35149d6d3758f8f08a5503b057c891e396c39b08518c6b7`；11 events / 19 pages / 521 commands；tag 15 格=0、桥候选=0 | 原始素材抽取 + 更新后扫描；**仅证明当前工具覆盖的 Map 7 事件/图块/调用入口**，不证明全游戏任意 Ruby 方法调用均无桥行为。`provenNegativeBridge` 是此限定谓词，不是通用数学证明。 |
| Map 21 Route 2 | Map021 SHA-256 `cd226a09dbf5cbfd2207edd44fb7dd419327ae901a1f1c0f6ad35601df85c575`；93 unique/93 placed Bridge 格；8 个直接 On/Off 事件（4、7、10、20、22、23、25、28），另 1、2 是邻接进化事件 | FSDB 抽取；八事件在 bridgeLevel 0、2 的 `over_trigger?` 均由移植规则静态计算为 true，预测 `here`；**不是原版运行观察**。 |
| Map 47 Route 7 | Map047 SHA-256 `5f4ee232e4f4b8b44950f826b13cd601ffecb87e455c1dda92c5908152df043e`；70×43、30 unique/placed Ledge 格；静态样本 `(16,9) → (16,11)` | FSDB 抽取 + 静态规则计算；没有原版跳跃帧、相机或跨图行为实测。未知事件命令码 404 已保留，不能因不认识就默默当作空脚本。 |
| 全 corpus | 此次报告为 69 张 `Map*.rxdata`；Bridge 格及直接 Bridge 脚本扫描仅发现 Map 21 | 结论仅限所用 corpus、输入指纹、扫描入口和完整性规则；没有证明其他发行版或未追踪 Ruby 方法体。 |

原版规则引用固定 `Maruno17/pokemon-essentials` tag v21.1，commit `ea7b5d56d2436591160983c4e641a2ceee2d875a`。`SOURCE-PROVEN` 只用于源码条件及分支；`FSDB-OBSERVED` 是带指纹的素材记录；`STATIC-INFERRED` 是本地规则移植/路径搜索结果；`DYNAMIC-OBSERVED` 仅用于原版游戏真实日志。**本轮无 DYNAMIC-OBSERVED。**

## 2. REVIEW-01～04：静态修复完成，不等于端到端验收

| ID | 已提交的实际修复及交叉证据 | 已通过的静态边界 / 仍未解决 |
|---|---|---|
| REVIEW-01 触发分类 | `vanilla-map-rules.mjs` 逐层计算 `Game_Map#playerPassable?`；Ruby `d=0` 方向 bit 为 0；`buildEventTriggerMatrix` 逐占用格判定 8 个事件在 bridgeLevel 0、2 的 `over_trigger?`；`EV-TRIGGER-*` | 计算值均 true，预测成功抵达后 `check_event_trigger_here`；空图形自身**不是**充分条件。`Event#start` 置位和解释器实际执行的帧对齐未实测。 |
| REVIEW-02 假 COMPLETE | Map/Tileset Table shape、负 tile ID、异常 355/655、111/117 参数及解析错误进入失败或 `INCOMPLETE`；`EV-VALID-01～06` | 重新扫描记录 Map 7 为限定范围内 COMPLETE/无桥；未知代码及脚本方法体覆盖范围仍应随报告保留。 |
| REVIEW-03 CE 间接调用 | `common-event-reachability.mjs` 从调用入口计算嵌套可达集合和路径；直接/多层/循环/缺目标及独立 autorun 入口测试 `EV-CALL-*` | 本 corpus Map 7/21 的 117 调用为零，未发现 CE 桥脚本；autorun/parallel、任意方法体 `eval/send` 不由地图事件可达性结论全部排除。 |
| REVIEW-04 跨图坐标 | `map-connection-audit.mjs` 使用源/目标 mapId 分别取得地图与 Tileset，按 PBS 候选与物化 edge 核对；`EV-TRANSFER-*` | Map 21 的 3 条 PBS 连接对应现有 7 条 edge，`21,E,77,47` 为几何越界；67 个 D0-false Bridge 格仅是**潜在过滤风险**，没有已证实真实误删。 |

独立脚本 `map-evidence-independent-check.mjs` 用 decoder 重新计算 Map 21 Bridge 格、8 个脚本 ID、Map 47 Ledge 格；**独立性只覆盖这些统计，不覆盖八事件触发分类、路径可行性或逐帧时序**。不应写成全部行为已经双实现验证。

## 3. ROUTE-21：连续静态片段与真正跨图闭环必须分开

`map21-bridge-routes.mjs` 从 Map 7→21 的合法落点样本选择 Map 21 `(19,76)`，对四组桥头 BFS 寻路；分别 `replayInputs` 计算两步 Off→On、On→Off 和部分带内/负例。§15.3 的南组报告 11 步到 `(14,70)`，中南组 20 步、中北组 73 步、北跨组 37 步。它们是**静态路径搜索记录**，不是 RGSS 输入日志。

**当前实现边界（不要表述为已验证的完整端到端路线）：** `fromMap7Landing.bfs` 与 `ontoBridge` 是分别生成的段；`ontoBridge` 以指定桥头 `bridgeLevel=0` 重新初始化，没有把 BFS 终态（方向、bridgeLevel、事件结果）直接传入并合并重放。`map-route-trace.mjs` 对动作的 `transfer` 返回 `null`，并没有在同一次模拟中实际执行 Map 7→21 的 edge/转图重置。因此 `bfs.found=true`、`ontoBridge.continuous=true` 和上桥最终 `bridgeLevel=2` **分别成立时，仍不能自动推出 Map 7→桥面的一条完整原版可重放轨迹**。旧 §14.6 只保留作历史关键点草图；§15.3 是改进后的静态片段，但不能升级为 `DYNAMIC-OBSERVED`。

关闭端到端子项需：选取真实 Map 7 起点 → 原始连接边 → Map 21 落点，检查两段交界状态完全一致；从落点连续 replay BFS+Off→On+桥面+On→Off+折返，逐步断言位置、方向、bridgeLevel、事件 start/execute、transfer 和下一次输入；验证每组是否真的接触 Bridge-tagged deck，而不仅仅踏上 On 事件带。随后用原版 RGSS 日志核对帧与执行顺序。若只能运行静态 tracer，诚实标 `STATIC-INFERRED`，不可改写为整项 PASS。

## 4. Map 47：静态样本已取得，运动验收尚未开始

证据 §15.4 与 `map47-ledge-routes.mjs` 的静态结果包含方向、前方 Ledge、最终落点、逆向样本和候选阻挡/边界集合。现成样本 `(16,9)` 向下越过 `(16,10)` 至 `(16,11)` 是**起点合法性与最终落点的静态推断**。若某负例集合为空，应如实记录“本地图无该类实物样本”，改用标明来源的合成规则测试，不得虚构地图坐标。中途事件实物样本未找到；跨图跳跃、原版跳跃弧线/相机、每帧到达事件仍未验证。未知 404 须查原版命令语义或列出明确支持排除理由，不能因统计数量正确就假定完整事件行为可解释。

## 5. 测试、复现和许可证据

此次 Agent 在 Windows 10 / Node v22.12.0、有本地 FSDB 的条件下记录：

```text
node --test tools/fixtures/essentials-v21.1/map-event-evidence.test.mjs tools/fixtures/essentials-v21.1/map-evidence-acceptance.test.mjs
# 报告：36 pass / 0 fail / 0 skip
node tools/fixtures/essentials-v21.1/map7-bridge-evidence.mjs --source "examples/essentials-v21.1-local/[FSDB]Essentials v21.1" --corpus-scan --output ".local/map7-bridge-evidence.json"
node tools/fixtures/essentials-v21.1/map21-bridge-evidence.mjs --source "examples/essentials-v21.1-local/[FSDB]Essentials v21.1" --output ".local/map21-bridge-evidence.json"
node tools/fixtures/essentials-v21.1/map47-ledge-evidence.mjs --source "examples/essentials-v21.1-local/[FSDB]Essentials v21.1" --output ".local/map47-ledge-evidence.json"
node tools/fixtures/essentials-v21.1/map-evidence-independent-check.mjs 7 21 47
```

上述为**提交内记录**，不是本次远程文档审查独立重跑；没有查到该取证 HEAD 对应的 PR workflow，不能宣称 CI PASS。旧 18/18 属于先前提交，不是本次测试分母。原始 FSDB、完整 Map21/47 JSON 放在 gitignored `.local/`，不假定其可合法分发；既有 Map7 附录 A 包含原始事件命令，许可核对未完成，FG-05 保持 OPEN。只向仓库提交最小结构化事实、指纹、短摘录和可再生成方法；不要将本地 JSON 误称为可公开 CI fixture。

## 6. 下一步单次验收交接与停工条件

| 工作包 | 必须拿到的证据 | 完成条件 / 阻碍时状态 |
|---|---|---|
| `E2E-21` | 贯通真实连接和 BFS/桥带/桥面/离开/反向的**同一次完整状态 replay**，四组各一条逐步 trace，真实 deck 命中与 start/execute 次数 | 静态 replay 全断言、边界/事件负例测试；动态结果另外记等级，不把一个 `continuous` 布尔值当闭环证明。 |
| `DYN-21/47` | 原版 RGSS 上桥/下桥/held input/转图、两格 jump/落点事件/帧日志，固定输入与素材 SHA | 无合法 RGSS 环境则 `BLOCKED` 且列具体缺口；**当前 FG-01 明确要求逐帧，未经正式修改及审查不得改成“动态可选”**。 |
| `FIXTURE/CI` | 核清原始素材与 Map7 附录 A 许可，合法最小 golden fixture，CI 实际 run URL/SHA、pass/fail/skip | 无分发授权不复制原地图；没有 CI 能执行的真实正例则 FG-05 OPEN。 |
| `CONTRACT/ABI` | C-01～08 exact schema、producer/consumer、事件时序与 state/motion/depth 矩阵、M14/M15 正式 ledger 审查 | 所有 FG 各自满足后才签核 `CONTRACT_V1`；不得倒推旧资格或先派 AG-01～04。 |

**验收输出模板：** `item / source+SHA / map-event-page-command or tile xyz / rule+固定源码 / input+initial state / expected+actual / evidence grade / exact test command+exit+pass-fail-skip / CI run+SHA / unresolved owner / reviewer`。任何 `STATIC-INFERRED` 与 `DYNAMIC-OBSERVED` 必须分列；数据完整性、行为原版保真、合法可重放和资格是四种不同结论。

最终状态：**Map 7/21/47 的静态原始记录已形成，REVIEW-01～04 的静态修复已提交；完整跨图 replay、动态与 fixture/合同/签核仍开放。FG-01～06 全部 OPEN，NOT FROZEN / NOT IMPLEMENTED / NOT QUALIFIED。**
