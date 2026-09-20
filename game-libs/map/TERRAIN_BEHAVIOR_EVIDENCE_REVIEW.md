# 地形行为证据复核：REVIEW-01～04 本轮关闭状态

> 状态：**Review / NOT FROZEN / NOT IMPLEMENTED / NOT QUALIFIED**。
> 本文记录取证器修复后的**独立复核**，不是玩法实现，也不是 Gate PASS。
> 原始观察与本轮新矩阵见 [TERRAIN_BEHAVIOR_EVIDENCE.md](./TERRAIN_BEHAVIOR_EVIDENCE.md) §14（历史指纹）与 **§15（本轮严格重跑）**。
> 基线文档修订 SHA：`240d084ceba236c6006afc89d7d4957991cf4992`。本轮同时修改取证器、测试与证据正文。

## 1. 地图职责

| 地图 | 职责 | 本轮结论 | 证据等级 |
|---|---|---|---|
| Map 7 Cedolan City | Bridge 负例 | 严格扫描后仍为 0 Bridge 格、0 桥候选、0 可达 Common Event 桥脚本。**证明范围**：本 corpus 的 Map 7 全部事件页/355/655/209/509/111-12/117 入口内无桥。不证明整个游戏没有 autorun/eval 间接入口。 | FSDB-OBSERVED + 扫描 COMPLETE |
| Map 21 Route 2 | Bridge 正例 | 93 unique Bridge 格；8 个直接 `pbBridgeOn/Off` 事件。**逐占用格** `passable?(d=0)` 后八事件在 bridgeLevel 0 与 2 均为 `over_trigger?=true`，归类 **here / walk-on**。这是计算出来的结果，不是“空图形 ⇒ 必然 walk-on”。 | SOURCE-PROVEN 条件 + STATIC-INFERRED 结果 |
| Map 47 Route 7 | Ledge 正例 | Map047 SHA-256 `5f4ee232…df043e`，70×43，Tileset 1；30 unique Ledge 格（tile 1194/1198/1212）；静态合法两格跳样本已抽出。未知命令 404 已记录，未当空脚本。 | FSDB-OBSERVED + STATIC-INFERRED 路线 |
| Map 27 Day Care | 排除 | 不是桥样本 | — |

未运行原版 RGSS：无 `DYNAMIC-OBSERVED`。skip ≠ PASS。`CONTRACT_V1` 仍不存在。旧 18/18 仅为 `5e71c7e` 历史记录。

## 2. REVIEW-01～04：本轮修复结果

### REVIEW-01：已给出八事件矩阵（子项证据齐备，非整项 Gate PASS）

源码（tag v21.1 / `ea7b5d56`）：

- `Game_Event#over_trigger?`：非空图形且 `!through` → false；hiddenitem → false；否则任一占用格 `map.passable?(i,j,0,$game_player)`。
- `Game_Map#playerPassable?`：`bit = (1 << ((d/2)-1)) & 0x0f`。Ruby 1.8 负移位是右移，故 **d=0 时 bit=0**（忽略方向位，仍检查 `0x0f` 全阻与 priority）。取证器按该分支逐层移植，不用自制等价式。
- `check_event_trigger_here` 要求 `over_trigger?`；`check_event_trigger_touch` **跳过** `over_trigger?` 事件。二者互斥。
- `Game_Event#start` 仅当 `@list.size > 1` 置 `@starting`，不等于 interpreter `eval`。

静态计算结果（占用格为地面 tile 387 等，**不是** tag 15，故 bridgeLevel 0/2 结果相同）：

| eventId | 脚本 | 原点 | 占用 | over_trigger 0/2 | 分支 |
|---:|---|---|---|---|---|
| 4 | On | (20,49) size(1,4) | x=20,y=46–49 | true / true | here |
| 28 | Off | (19,49) size(1,4) | x=19,y=46–49 | true / true | here |
| 7 | Off | (14,31) size(3,1) | x=14–16,y=31 | true / true | here |
| 10 | On | (14,32) size(3,1) | x=14–16,y=32 | true / true | here |
| 20 | Off | (22,58) size(2,1) | x=22–23,y=58 | true / true | here |
| 22 | On | (22,57) size(2,1) | x=22–23,y=57 | true / true | here |
| 23 | Off | (14,69) size(2,1) | x=14–15,y=69 | true / true | here |
| 25 | On | (14,68) size(2,1) | x=14–15,y=68 | true / true | here |

**纠正历史措辞：** “空图形 size() ⇒ 必然 walk-on”改为“空图形只取得 over_trigger 资格；本轮对八事件占用格算出 passable(d=0)=true，故归 here”。失败 bump **不会** start 这些事件（SOURCE-PROVEN：touch 跳过 over_trigger）。解释器是否在同一步内跑完仍为 STATIC-INFERRED。独立核对：`map-evidence-independent-check.mjs` 重算 93 格与八个脚本 ID，不比较 `collectMapEvidence` JSON 自身。

**路线方向：** 上桥必须从 Off（陆地）外侧走向 On（桥面）。EV010 On 在 y=32、EV007 Off 在 y=31，陆地在北，应从 `(14,30)` 向南踏入，而不是从南侧穿过 On 再踩 Off（那会把 bridgeLevel 清回 0）。旧生成器对 mid-north 用了错误南侧入口，本轮已改正。

### REVIEW-02：已 fail-closed（子项证据齐备）

负 tile ID ≠ 空 0；terrain_tags/passages/priorities 必须 1D 且 values.length=xSize；短 Table、缺 Tilesets、orphan 655、111 type 12 缺参数、117 非整数目标均不能 `provenNegativeBridge=true`。测试：`EV-VALID-01`～`06`。Map 7 重跑仍 COMPLETE + provenNegative。

### REVIEW-03：已按调用入口做可达闭包（子项证据齐备）

`computeCommonEventReachability` 从每个 Common Event 计算能否到达自身或嵌套 `pbBridgeOn/Off`。地图事件 117 必须命中**可达**集合才确认候选，并输出 `event → A → B → C` 链。覆盖：直接、两层/三层、环有桥、环无桥、缺目标、动态调用、共享 CE。Autorun/parallel Common Event 列为**单独入口**，不能声称已证明全游戏无间接调用。本 corpus 无 CE 含桥脚本，Map 7/21 候选数未因该修复改变。

### REVIEW-04：源/目标 mapId 已分开（子项证据齐备）

每条连接带 `(sourceMapId,sourceX,sourceY)` 与 `(targetMapId,targetX,targetY)`。目标 D0 用**目标地图** Tileset。Map 21 PBS 三条：

| 原始连接 | 结果 |
|---|---|
| `21,E,0,23,W,1` | 期望边 3 条均在 MapTransfer/21.json；另有 D0 会丢的对照，**不是已证实误删** |
| `21,S,0,7,N,21` | 期望边 4 条匹配；Map 7→21 落点 `(19–22,76)` 已列出 |
| `21,E,77,47,W,0` | 232 次越界，0 条期望边；与 D0 过滤分开 |

禁止把 D0 潜在风险写成误删。合成对照见 `EV-TRANSFER-01/02`。

## 3. 路线与 Map 47

四组连续静态路线由 `map21-bridge-routes.mjs` 生成：从 Map 7 北缘 `(40–43,0)` 北走落入 Map 21 `(19–22,76)`，BFS 到各组**陆地侧**桥头，再逐格踏入 Off→On。全部标 **STATIC-INFERRED / 非 RGSS 实测**。南组脚本：EV025 On / EV023 Off。中北组从 `(14,30)` 南走进 Off 再 On，结束 `bridgeLevel=2`。

Map 47：30 Ledge 格；合法方向样本包括 `(16,9)` 朝下跳过 `(16,10)` 落到 `(16,11)`。中间格有事件的现成样本未在本图找到，合成负例与真实路线分开。跨连接跳跃未证明。

## 4. 门禁（仍全部 OPEN）

子项证据齐备 ≠ Gate PASS。FG-01～06 仍 OPEN：无原版动态日志、无 `CONTRACT_V1`、无合法可分发完整地图 fixture、无玩法实现。状态继续 **NOT FROZEN / NOT IMPLEMENTED / NOT QUALIFIED**。
