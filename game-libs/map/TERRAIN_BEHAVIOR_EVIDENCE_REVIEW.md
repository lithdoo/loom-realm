# 地形行为证据复核与 Map 21 后续取证交接

> 状态：**Review / evidence scope only / NOT FROZEN / NOT IMPLEMENTED / NOT QUALIFIED**。2026-09-20 对提交 `a809a5551ccad0ba4a3f1c6159976256363af29a` 的只读复核。本文不是新的原始 FSDB 事实，也不代替 [原始取证记录](./TERRAIN_BEHAVIOR_EVIDENCE.md)。发现与待验证项必须保持区分；本文件的 OPEN 项只能由后续真实取证和实际运行结果关闭。

## 1. 地图职责与事实边界（替代所有旧的 Map 7 桥正例要求）

| 地图 | 本轮职责 | 已有证据 | 尚不能宣称 |
|---|---|---|---|
| Map 7 Cedolan City | **Bridge 负例**；普通门 contact/transfer、Neutral 与地图连接回归 | 已记录 11 events / 19 pages / 521 commands；无被扫描到的 `pbBridgeOn/Off`、无放置的 tag 15 图块；含到 Map 21 的北缘连接 | 不能索取不存在的 Map 7 桥头 ID；不能以它验桥上、桥下和桥事件的逐帧行为 |
| Map 21 Route 2 | **Bridge 正例候选，必须补齐正式取证** | 当前 corpus 清单记录 93 个 tag 15 格、8 个直接调用 `pbBridgeOn/Off` 的事件和 2 个邻接但并非桥脚本的事件；`Map021.rxdata` SHA-256 已在证据文档 | 还没有 Map 21 所有相关命令、`size(w,h)` 原版碰撞、真实输入路径、传送差异、逐帧证据及可重放 fixture；不能标为已验收 |
| Map 47 Route 7 | Ledge 正例 | 已有问题分析；本轮只知不放置 Bridge 图块 | 尚无完整 Ledge 路线取证；不得标 FG-01 PASS |
| Map 27 Day Care | 排除的误认样本 | 室内地图，不是桥正例 | 不以 Map 27 代替 Map 21 |

“本 corpus 唯一发现 Map 21”仅指取证器扫描的 **69 个 `Map*.rxdata` 文件及其已实现的直接脚本／图块／名称／注释路径**，不是对其他 Essentials 发行版本、任意间接调用或所有动态行为的无限定证明。原始文件的指纹及本地运行日志由下一轮继续核对；本次远程复核没有读取本地 FSDB、没有运行原版游戏。

## 2. 前次取证器审查发现：需补强但不推翻已记录事实

1. `map-event-evidence.mjs` 已完整保留各 event/page 的原始命令，并扫描直接 `355/655` 与 Map 7 对 CommonEvent 的直接调用；全 corpus 的 `scanSiblingMapsForBridgeEvidence` 只按直接拼接脚本、名称、注释、地形格搜寻，**不等于递归调用图完整扫描**。移动路线 `209/509` 内嵌 `RPG::MoveCommand` 的 script、嵌套 CommonEvent／间接方法／动态 Ruby 调用需分类核查；不确定则列未确认，不能把未扫描等同零命中。只检查可能包含 Ruby 的真实入口，勿实现通用事件解释器或 `eval`。
2. `collectMap7Evidence` 在缺少 Tilesets 时能返回 `bridgeTerrain.missing=true` 和零格；`scanSiblingMapsForBridgeEvidence` 对 Tilesets 缺失会跳过地形扫描。**用于证明“无桥”的严格模式必须要求 Map、MapInfos、Tilesets、CommonEvents 与匹配图块表全部存在且结构、尺寸、引用有效**；错误、tile ID 越界、tag 表缺项、未解析间接调用要显式失败或输出 `INCOMPLETE`，不得以 `0` 冒充完整结果。
3. 检查 `script=355/655` 合并规则是否对应固定 v21.1 `command_355`，保留行界与指令坐标；补充移动路线脚本、嵌套 common event、缺表、坏 table、地图引用越界、未知间接调用及干净环境无 FSDB 的负面测试；全 corpus 按文件 SHA/计数记录可重跑摘要。
4. 已提交的 `map-event-evidence.test.mjs` 含真实 FSDB 存在才运行的 live 测试；无素材时 skip。原证据只提供提取 CLI 退出码与测试命令，**尚无可独立核验的完整测试通过/skip/失败统计、CI artifact 或合法可分发 golden fixture**。下一轮逐条提供运行日期、命令、SHA、退出码及摘要，不把 skip 计作 live PASS。
5. `TERRAIN_BEHAVIOR_EVIDENCE.md` 的附录 A 含长篇原始命令及脚本。审查许可与最小摘录边界；若无法确认可分发性，停止新增大段原文，保留本地完整转储、提交最小结构化事实／摘要／指纹与再生成命令，并对已有附录给出保留、压缩或移出仓库的处理记录。不得在未经许可确认前继续复制整张 Map 21。

这些是**源代码审查发现和待验证风险**，不是已经重新运行提取器得出的 Map 7 相反结论。不要因此擅自把 Map 7 写成有桥，也不要把原版 `Game_Event#start` 当同步脚本调用。

## 3. 下一个取证任务：Map 21 严格正例

依据 [证据文档 §13](./TERRAIN_BEHAVIOR_EVIDENCE.md)，以 Map 21 Route 2 为正式新增取证对象，独立记录以下可审核字段，禁止把 Map 7 CLI 的固定 map=7 校验悄悄放开或硬编码运行时地图坐标：

- 确认 `Map021.rxdata`、MapInfos、Tilesets、CommonEvents、MapTransfer 实际路径／SHA-256／身份／尺寸；扫描所有事件、全部页面、全部命令、所有地图图层及可达 CommonEvent 与 move-route scripts；输出覆盖与未解析入口。
- 对 8 个已识别脚本事件逐个保留 Event ID、事件名、坐标、页面条件、trigger、through、graphic、`size(w,h)` 原文、全部命令码／索引／缩进／参数／执行顺序、`pbBridgeOn` 参数（缺参亦记录）/`pbBridgeOff`、邻接和实际桥格覆盖。另证 2 个进化事件为什么不应投影为桥行为；其他间接候选不要静默排除。
- 从固定 `v21.1` 原版源码确认 `size(w,h)` 从事件名称到角色占用／碰撞／touch 检查的**实际调用链**。单页 trigger 1、through false、空图形是否触发、从哪一侧触发，以及状态切换是当前输入还是后续输入生效：先给静态来源和推论，再用可运行环境进行有日志的动态验证；未运行则明确 `UNVERIFIED`。注意事件起点格本身可能没有 tag 15，不能仅按“事件站在桥块上”筛选。
- 给出四对 On/Off 桥端的真实最小输入序列、初始位置／方向／bridgeLevel、每次 check/start/execute/motion、桥上桥下 passage、遮挡与返回；校验跨地图 transfer 是否清零以及 Map 7→21 连接。无玩法实现时可先用原版行为轨迹与离线数据取证，绝不伪造 LoomRealm 运行结果。
- 对 Map 21 实际运行 `projectedD0Passable` 及 `selectStaticPage`／`emitStep`／`emitContacts`／`expandConnection` 审计，保存源事实→当前投影→应保留的动态事实对照；有真实差异才写“已证实误删”，否则写“潜在风险／未复现”。
- 合规核查后输出最小派生 fixture、可重复生成程序和 golden 断言；如无法合法分发，列本地 live 路径和 CI 覆盖缺口并维持 FG-05 OPEN。

**输出规范**：证据行包含 `source path + SHA-256 + map/event/page/command or tile x,y,z + v21.1 symbol/link + 观察方式 + 事实/推论/待测 + rule/test ID`；包括零命中覆盖分母、异常/未知统计、截图或日志的可复现操作（若实际运行）。Map 21 取证完成只解决 FG-01 的桥子项；Map 47 及其他门禁仍独立开放。

## 4. 门禁和流程同步

- FG-01：Map 7 负例取证已记录；**严格扫描边界复核 OPEN、Map 21 正例 OPEN、Map 47 OPEN、动态时序 OPEN**；整项 OPEN。
- FG-02/03：等待 Map 21 `size()`、事件来源、传送静态筛选及事件 start/execute 证据；不冻结 `MapAction` 或即时重算规则。
- FG-04：运动 ABI、桥投影更新仍 OPEN。
- FG-05：许可、最小素材、可重放路径、live test 与 CI 差距仍 OPEN。
- FG-06：精确合同、base SHA、AG-01～04 任务卡和资格签核仍 OPEN。

**下一步**：本地 Agent 先补取证器严格性并重跑 Map 7/corpus，然后独立取证 Map 21；将事实与修订结论写入 [证据文档](./TERRAIN_BEHAVIOR_EVIDENCE.md)，完成后再单独调查 Map 47。不得借复核任务实施 Bridge/Ledge、修改 M14/M15 历史记录或宣告冻结。