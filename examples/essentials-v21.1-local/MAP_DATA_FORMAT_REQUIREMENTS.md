# 地图数据格式需求草案

> 状态：Draft  
> 目录：`examples/essentials-v21.1-local`  
> 目的：描述玩家在本示例中仍会碰到的 **地图格子 / tileset / autotile 数据形态** 体验缺口。本文只写要什么，不写怎么做。  
> 证据基线：本地 Essentials v21.1 FSDB（`[FSDB]Essentials v21.1`，由官方 ZIP `--force` 导入）中全部 `struct.Map` / `struct.Tileset` / `Graphics/Autotiles`；权威对齐 `Maruno17/pokemon-essentials@ea7b5d56`。  
> 前置：`MAP_BEHAVIOR_REQUIREMENTS.md` 三项与 autotile first-slice（`MAP_AUTOTILE_DESIGN_DRAFT.md` Feature implementation complete）已落地；本草案不重开那些已满足项。

当前示例已经能：空格、`tileId ≥ 384` 普通图块、`tileId 48..383` autotile 的 **静态第 0 帧**（含 block 96×128 系与 single-cell 高 32 系）。下面仍缺的是：玩家在真实户外/水下图上应看到的 **随时间变化的 autotile**，以及「凡本存档地图数据里出现过的格子形态，进入该图都不得再因格式关窗」。

本文不改 M14/M15 Closed 合同。不要求一次做完 RMXP 的 panorama / fog / hue / terrain_tags / 事件图元。

---

## 0. 当前存档里的真实地图数据形态（证据）

下列统计来自本目录当前 FSDB 全量地图，不是假 fixture。

### 0.1 格子 id 分区（69 张 Map）

| 分区 | 含义 | 本存档出现量 | 本示例现状 |
|---|---|---|---|
| `tileId === 0` | 空 | 103470 | 已支持（跳过绘制） |
| `tileId 1..47` | RMXP 保留 / 本包未用 | **0** | 仍 fail closed；本包无验收压力 |
| `tileId 48..383` | 7 槽 × 48 variant autotile | 6160 | **静态 frame 0** 已支持 |
| `tileId ≥ 384` | 普通 tileset 格 | 61739 | 已支持 |

含 autotile 格子的地图 id：`2, 5, 7, 21, 23, 28, 31, 35, 39, 40, 41, 44, 45, 52, 68, 69, 70, 71, 72, 73`（共 20 张）。其余图仅 empty + regular。

### 0.2 Autotile 位图几何（`Graphics/Autotiles`）

本存档 Autotiles 库共 40 张 PNG，几何 **只有两类**，无第三种：

- **block**：`height === 128` 且 `width ≥ 96` 且 `width % 96 === 0`（28 张；多帧时每帧宽 96）
- **single-cell**：`height === 32` 且 `width ≥ 32` 且 `width % 32 === 0`（12 张；多帧横排）

地图数据里实际引用过、且玩家会看见的素材包括：

| 素材 | 几何 | 出现地图（摘要） |
|---|---|---|
| Sea / Sea deep / Sea without shore / Water rock / Fountain1 / Underwater dark | block | 海岸、喷泉、水下等 |
| Flowers1 | single-cell 160×32 | Map002 等户外 |
| Waterfall / Waterfall crest / Waterfall bottom | single-cell 128×32 | Map069 |
| Seaweed dark / Seaweed light | single-cell 128×32 | Map070 |

Tileset 上已登记、但当前任意 Map 格子 **未引用** 的名字：`Brown cave sand`、`Fountain2`、`Sand shore`——仍属本存档合法素材，一旦被图使用就必须可画。

### 0.3 与已落地 first-slice 的关系

- first-slice 已证明：上述两类几何 + 48-variant 投影足以让含 Flowers1 的 Map002 **进得去、看得见、不关窗**。
- first-slice **明确不做** autotile 多帧动画；因此海面、花丛、瀑布、水草在原版会「动」，本示例仍停在第 0 帧。这是本草案要补的玩家可见缺口。

---

## 1. 必须成立

### 1.1 本存档出现过的格子形态均可进入

- 玩家进入本 FSDB 中任意一张 Map 时，不得再因「不认识的 tileId 分区 / 缺 autotile 槽名 / 合法 block 或 single-cell 位图」而关窗或整图空白失败。
- 对 `48..383`：只要 `Tileset.autotile_names[slot]` 非空且对应 Autotiles 资源存在且几何属于 §0.2 两类之一，该格必须可投影、可绘制。
- 对仅含 empty + regular 的室内图（如 Map066/067），既有能力必须继续成立，不被本草案回退。

### 1.2 Autotile 动画（玩家可见）

- 凡位图宽度表明存在多帧（block：`width / 96 > 1`；single-cell：`width / 32 > 1`）的 autotile，在地图停留期间必须按原版可感知的节奏切换帧，而不是永远钉在 frame 0。
- 帧切换不得打乱既有遮挡、行走、跳转；人物与环境前后关系仍以既有 layering 为准。
- 动画节奏应让玩家看出海面/花/瀑布等在「动」，不能慢到像静止图、也不能快到闪烁不可辨。
- 同一 Tileset 上不同槽可有不同帧数；切换必须以该槽自己的位图为准。

### 1.3 与跳转 / 续玩的衔接

- 经门或边缘进入含动画 autotile 的图（如 Map002、海岸、Map069、Map070）后，动画必须在目标图上成立。
- 若后续落地存档续玩（见 `SAVE_BEHAVIOR_REQUIREMENTS.md`），读档落在上述图上时，动画与静态地砖同样成立。

### 1.4 不算完成

- 只保证「不关窗」，但海面/花/瀑布永远停在第 0 帧。
- 只用假地图或裁掉 autotile 格子来假装「全图格式已支持」。
- 只支持 Map002 Flowers1，其余本存档已引用的 Sea / Waterfall / Seaweed 等仍失败或静默不画。
- 发明本存档从未出现的第三种位图几何作为完成条件，同时丢下 §0.2 两类之一。

---

## 2. 明确不做（本草案）

- `tileId 1..47` 的可玩语义（本存档出现量为 0；若未来素材写入该区，另开需求）。
- panorama、fog、battleback、hue、terrain_tags 的绘制与语义。
- 事件页 / NPC / 对话 / 野生战遇等非「地砖格子格式」能力。
- 通用任意尺寸 autotile 引擎；本草案验收边界是本 FSDB 已有的两类几何。
- 重开 MapTransfer / walking / layering 已冻结状态机。
- 把本草案写成 M14/M15 资格夹具合同。

---

## 3. 共同约束

- 素材与地图权威仍是本目录真实 Essentials v21.1 FSDB，不另造一套「演示用地砖格式」。
- 验收以玩家在本示例窗口里能进入、能看见、能看出动画为准，不以是否新增包名或内部模块为准。
- 不要求本草案修改已 Closed 的 M14/M15 资格门禁。
- 与 `MAP_AUTOTILE_DESIGN_DRAFT.md` 冲突时：静态投影 / 两类几何 / fail closed 事实以已冻结实现为准；本草案只追加 **动画** 与 **全存档地图进入** 的玩家结果。

---

## 4. 建议验收场景

在本示例启动后，不改启动参数（除验收需要的出发图外），应能连续完成：

1. **室内无 autotile**：Map066 ↔ Map067 门往返仍正常。
2. **single-cell 户外**：Map066 东缘进入 Map002；花丛可见，且 Flowers1 多帧在动；可走回。
3. **block 水面**：进入本存档中含 Sea / Sea deep 的图（如 Map039 一带），海面多帧在动，不关窗。
4. **瀑布 single-cell**：进入 Map069，瀑布相关格可见且多帧在动。
5. **水下 single-cell + block**：进入 Map070，水草与水下暗底可见；有多帧的槽在动。

---

## 5. 完成判读（需求侧）

- **第一刀完成**：§1.1 + §4 场景 1–2（全分区可进 + Map002 动画）成立。  
- **本存档格式闭环**：§4 场景 1–5 全部成立，且不引入 §2 所列范围外的新格式依赖。  

具体算法、帧计时、文件白名单留给后续设计冻结稿；本文件不指定实现。
