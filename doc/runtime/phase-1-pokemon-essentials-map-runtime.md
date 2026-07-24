# 第一阶段 Pokémon Essentials v21.1 地图与行走运行时

## 1. 文档目的

本文档定义 LoomRealm 第一阶段使用 Pokémon Essentials v21.1 地图和素材进行测试时的地图数据、导入、碰撞、人物行走、Portal、状态同步与 DOM 渲染边界。

本设计将 Pokémon Essentials v21.1 / RPG Maker XP 地图格式作为第一阶段的兼容输入，但 LoomRealm 运行时仍使用自身的 FSDB、权威状态和前端渲染架构。

核心原则是：

> Pokémon Essentials 负责提供真实测试地图和素材格式；LoomRealm 负责把这些内容转换为稳定、可校验、可同步和可渲染的标准运行时模型。

本文档中的地图兼容设计替代第一阶段早期文档里的以下简化假设：

- 单一地图 Tile 层；
- 从 `0` 开始的 LoomRealm 自定义普通 Tile 索引；
- 在每个地图格子上直接保存 `blocked`；
- 第一阶段暂不处理 Autotile 和 Tile Priority。

## 2. 第一阶段兼容范围

第一阶段支持 Pokémon Essentials v21.1 地图格式中的以下子集：

- 地图宽度和高度；
- RPG Maker XP 的三个 Tile 数据层；
- 原始 RPG Maker XP Tile ID；
- 普通 Tileset；
- 七个实际 Autotile 槽位和空槽；
- Tile 通行属性；
- Tile Priority；
- 一个玩家人物；
- 四方向格子行走；
- 两张地图之间的 LoomRealm Portal；
- Pokémon Essentials/RPG Maker XP 四方向人物行走图。

第一阶段不支持：

- Pokémon、训练师、道具、战斗和 PBS 业务数据；
- RPG Maker XP 事件页和事件指令；
- NPC 与动态地图事件；
- 地图事件中的自动传送指令导入；
- Terrain Tag 对应的草丛、水面、桥梁、瀑布等完整行为；
- Bush、Counter、反射和动态阴影表现；
- Autotile 动画；
- 天气、音频和遭遇；
- Pokémon Essentials 存档。

第一阶段可以读取真实地图数据，但只运行完成地图显示、人物行走、碰撞和地图跳转闭环所需的部分。

## 3. 兼容层与运行时边界

总体链路为：

```text
Pokémon Essentials v21.1 项目
├── Data/MapXXX.rxdata
├── Tileset 数据
├── Graphics/Tilesets
├── Graphics/Autotiles
└── Graphics/Characters
            ↓
Pokémon Essentials v21.1 导出器
            ↓
可检查的中间 JSON 与图片引用
            ↓
LoomRealm 导入、校验与 Autotile 编译
            ↓
[FSDB]project
            ↓
LoomRealm 后端运行时
            ↓
客户端可见状态 + 图片资源接口
            ↓
前端 DOM/CSS 渲染
```

LoomRealm 浏览器前端和正式运行时不直接加载 Ruby Marshal 或 `.rxdata` 文件。

原始格式知识只存在于导出器和兼容编译层。移动、碰撞、Portal、状态同步和 DOM 渲染不直接依赖 Pokémon Essentials 的 Ruby 类。

## 4. 本地素材来源

Pokémon Essentials 项目的本机路径不写入项目 FSDB，也不提交到公共仓库。

可以使用被 Git 忽略的本地工作区配置：

```text
realm.workspace.local.json
```

示例：

```json
{
  "assetSources": {
    "pokemon-essentials-v21.1": {
      "adapter": "pokemon-essentials",
      "version": "21.1",
      "root": "/local/path/to/Pokemon Essentials v21.1"
    }
  }
}
```

项目 FSDB 只保存稳定的 LoomRealm 数据 Key 和资源 Key，不保存本机绝对路径。

## 5. 第一阶段 FSDB 结构

地图兼容后的最小结构为：

```text
[FSDB]project/
├── [struct]map.definition/
├── [extend]map.tileset/
├── [group]map.tile/
├── [group]map.portal/
│
├── [struct]tile.set/
├── [group]tile.property/
├── [resource]tile.sheet/
├── [resource]tile.autotile/
├── [resource]tile.compiled/
│
├── [struct]actor.definition/
└── [resource]actor.sprite/
```

各目录职责如下：

| FSDB 结构 | 职责 |
|---|---|
| `map.definition` | 地图标识、宽高、三个图层和来源信息 |
| `map.tileset` | 地图与 Tileset 之间的关系 |
| `map.tile` | 三个图层上的原始 RPG Maker XP Tile ID |
| `map.portal` | LoomRealm 第一阶段地图跳转定义 |
| `tile.set` | 普通 Tileset、Autotile 槽位和兼容参数 |
| `tile.property` | Tile 通行、Priority 和保留的 Terrain Tag |
| `tile.sheet` | 原始普通 Tileset 图片 |
| `tile.autotile` | 原始 Autotile 图片 |
| `tile.compiled` | 为 DOM 渲染预编译的普通 32×32 Tile Atlas |
| `actor.definition` | 玩家行走图布局、锚点与移动参数 |
| `actor.sprite` | 人物行走图图片 |

## 6. 地图定义

`map.definition` 使用 LoomRealm 稳定地图 ID，同时保存原始 Pokémon Essentials Map ID 作为来源信息。

示例：

```json
{
  "name": "Lappet Town",
  "width": 40,
  "height": 30,
  "layerCount": 3,
  "source": {
    "profile": "pokemon-essentials-v21.1",
    "mapId": 5
  },
  "defaultSpawn": {
    "x": 12,
    "y": 18,
    "direction": "down"
  }
}
```

规则：

- `width` 和 `height` 使用格子数；
- 第一阶段 `layerCount` 固定为 `3`；
- 地图坐标原点为左上角；
- `x` 向右递增；
- `y` 向下递增；
- LoomRealm 地图 ID 使用 FSDB Key；
- `source.mapId` 只用于追踪、调试和重新导入，不作为长期主键。

## 7. Tile ID 规则

`map.tile` 保存 Pokémon Essentials/RPG Maker XP 原始 Tile ID，不转换成从 `0` 开始的普通 Tile 索引。

第一阶段使用以下语义：

```text
Tile ID = 0
    空 Tile

Tile ID = 1–383
    Autotile 槽位及其组合形态

Tile ID >= 384
    普通 Tileset Tile
```

普通 Tile 的图集位置为：

```text
regularIndex = tileId - 384
column = regularIndex % 8
row = floor(regularIndex / 8)
```

保留原始 Tile ID 的原因：

- 可以直接对照 RPG Maker XP 和 Pokémon Essentials 地图；
- 可以定位导入错误；
- 可以保留 Autotile 与普通 Tile 的原始边界；
- 可以稳定地重新导入地图；
- 后端兼容编译层可以集中处理格式差异。

前端不解释 `384`、Autotile 槽位或原始 Tile ID。

## 8. `map.tile` 存储格式

`map.tile` 按地图 ID 分组，并采用“每图层每行一条 JSONL 记录”的格式。

示例：

```text
[group]map.tile/lappet-town.jsonl
```

```jsonl
{"layer":0,"y":0,"tileIds":[384,384,384,385,385,0]}
{"layer":0,"y":1,"tileIds":[384,390,390,390,384,0]}
{"layer":1,"y":0,"tileIds":[0,0,0,412,0,0]}
{"layer":2,"y":0,"tileIds":[0,0,0,0,0,0]}
```

规则：

- `layer` 只能是 `0`、`1`、`2`；
- `y` 是地图行号；
- `tileIds` 的数组索引就是 `x`；
- `tileIds.length` 必须等于地图宽度；
- 每个图层必须包含从 `0` 到 `height - 1` 的完整行；
- `0` 表示该图层的该位置没有 Tile；
- 同一地图中不得出现重复的 `layer + y`；
- Tile ID 必须能够被当前地图使用的 `tile.set` 解析。

采用按行记录而不是逐格记录，可以在保持 JSONL 可检查性的同时，避免三层真实地图产生过多记录。

## 9. Tileset 与 Autotile

`tile.set` 明确记录 Pokémon Essentials/RPG Maker XP 兼容参数。

示例：

```json
{
  "name": "Outdoor",
  "profile": "pokemon-essentials-v21.1",
  "tileWidth": 32,
  "tileHeight": 32,
  "regularTileStartId": 384,
  "regularColumns": 8,
  "sheetResourceId": "tile.sheet/outdoor",
  "autotileResourceIds": [
    null,
    "tile.autotile/grass",
    "tile.autotile/water",
    "tile.autotile/path",
    null,
    null,
    null,
    null
  ]
}
```

`autotileResourceIds` 使用八个槽位：

- 槽位 `0` 为空 Tile 槽位；
- 槽位 `1–7` 对应实际 Autotile 文件；
- 未使用的槽位保存 `null`。

## 10. Autotile 编译

Pokémon Essentials/RPG Maker XP Autotile 的最终 32×32 Tile 由四个 16×16 子块组合，并存在 48 种组合形态。

第一阶段不让 DOM 渲染层实现 Autotile 拼接算法，而是在导入或构建阶段预编译：

```text
原始 PE Autotile 图片
        ↓
按照 48 种组合规则展开
        ↓
生成普通 32×32 Tile Atlas
        ↓
写入 tile.compiled
        ↓
后端生成标准源矩形
        ↓
前端使用 CSS background-position
```

第一阶段只使用 Autotile 第一帧。Autotile 动画延后实现。

`tile.compiled` 是可重新生成的兼容产物，不是新的游戏业务实体。

## 11. Tile 属性与碰撞来源

真实 Pokémon Essentials 地图的通行性和遮挡不能继续存为每个地图位置上的单一 `blocked`。

`tile.property` 按 Tileset 保存 Tile 属性。

概念示例：

```jsonl
{"tileId":384,"sourcePassageFlags":0,"passable":{"down":true,"left":true,"right":true,"up":true},"priority":0,"terrainTag":0}
{"tileId":385,"sourcePassageFlags":15,"passable":{"down":false,"left":false,"right":false,"up":false},"priority":0,"terrainTag":0}
{"tileId":412,"sourcePassageFlags":0,"passable":{"down":true,"left":true,"right":true,"up":true},"priority":1,"terrainTag":0}
```

规则：

- `sourcePassageFlags` 保留原始来源值，便于对照和重新导入；
- `passable` 是导入器生成的标准四方向通行结果；
- `priority` 用于人物与 Tile 的前后遮挡；
- `terrainTag` 第一阶段保留但不执行完整特殊行为；
- `map.tile` 不再保存 `blocked`；
- 运行时根据三个图层的 Tile 和 `tile.property` 编译当前位置的有效通行结果。

第一阶段碰撞仍是格子碰撞，不实现像素级碰撞和复杂物理。

## 12. 运行时地图实例

后端加载 FSDB 后，将地图静态数据编译为运行时地图实例。

概念结构：

```text
Runtime Map
├── mapId
├── width
├── height
├── three tile layers
├── compiled render tiles
├── effective directional passability grid
├── portals
└── content version
```

运行时代码不在移动和渲染过程中直接遍历 FSDB 文件。

建议链路：

```text
FSDB Reader
    ↓
Pokémon Essentials Compatibility Compiler
    ↓
Map Repository
    ↓
Runtime Map
```

兼容编译器负责：

- 验证三层地图数据；
- 解析原始 Tile ID；
- 关联 Tileset 和 Tile 属性；
- 关联或生成 Autotile 编译资源；
- 计算每个 Tile 的标准渲染源矩形；
- 计算方向通行网格；
- 计算 Priority 对应的渲染排序信息。

## 13. 人物行走图

第一阶段使用 Pokémon Essentials/RPG Maker XP 四方向行走图：

- 四列动画帧；
- 四行方向；
- 方向顺序为下、左、右、上；
- 单帧宽度为图片宽度除以 `4`；
- 单帧高度为图片高度除以 `4`；
- 人物视觉锚点为底部中心；
- 人物逻辑占用范围为一个地图格。

`actor.definition` 示例：

```json
{
  "name": "Hero",
  "spriteResourceId": "actor.sprite/hero",
  "layout": {
    "profile": "rmxp-character",
    "columns": 4,
    "rows": 4,
    "directionRows": {
      "down": 0,
      "left": 1,
      "right": 2,
      "up": 3
    }
  },
  "anchor": {
    "x": 0.5,
    "y": 1
  },
  "logicalFootprint": {
    "width": 1,
    "height": 1
  },
  "stepDurationMs": 160
}
```

`frameWidth` 和 `frameHeight` 可以在资源加载与校验阶段从图片尺寸推导，不必在每个人物定义中重复保存。

## 14. 坐标与权威人物状态

地图逻辑和人物移动统一使用整数格子坐标。

后端权威人物状态概念上包括：

```text
Player Runtime State
├── mapId
├── settledPosition
│   ├── x
│   └── y
├── direction
├── movement
│   ├── from
│   ├── to
│   ├── startedAt
│   └── durationMs
└── phase
    ├── idle
    ├── stepping
    └── mapTransition
```

边界如下：

- 当前地图属于后端权威状态；
- 已稳定站立的格子属于后端权威状态；
- 一步移动的起点、终点和时序属于后端权威状态；
- DOM 当前绘制到两个格子之间的像素位置属于前端表现状态；
- 当前显示的行走动画帧属于前端表现状态。

## 15. 输入模型

前端不发送原始 `keydown` 或 `keyup` DOM 事件。

前端把键盘状态归一化为一个当前方向意图：

```text
up | down | left | right | none
```

同时按下多个方向时，使用最近按下且仍保持按下的方向。

前端只在归一化方向意图发生变化时发送事件。后端保存当前方向意图，并在人物处于 `idle` 时决定是否开始下一步。

这种方式可以支持持续按住方向键行走，而不依赖浏览器原始键盘重复频率。

## 16. 一步行走状态机

人物采用 Pokémon 风格的四方向格子步进行走。

状态流程：

```text
idle
    ↓ 当前方向意图不为空
更新朝向
    ↓
计算目标格
    ↓
检查地图边界和方向通行
    ├── 不可通行 → 保持位置，回到 idle
    └── 可通行 → 进入 stepping
                       ↓
                  移动时序完成
                       ↓
                 提交 settledPosition
                       ↓
                    检查 Portal
                       ↓
             idle 或 mapTransition
```

具体规则：

1. 人物开始尝试移动时先更新朝向；
2. 碰撞失败时朝向保留，但人物位置不变；
3. 地图边界始终不可越过；
4. 人物一次只移动一个格子；
5. `stepping` 期间不开始第二步，但后端保留最新方向意图；
6. 一步结束后，如果方向意图仍然存在，可以立即开始下一步；
7. 前端使用 `movement.from`、`movement.to` 和 `durationMs` 进行 CSS Transform 插值；
8. CSS 动画是否结束不能决定后端移动结果；
9. 状态同步不发送逐帧像素坐标。

运行时可以使用固定更新循环或单调时钟检查一步是否完成，具体 Tick 频率由实现阶段确定。

## 17. 方向通行判定

运行时对一次移动至少执行：

```text
当前格坐标
    + 移动方向
    ↓
计算目标格
    ↓
检查地图边界
    ↓
检查当前格离开方向
    ↓
检查目标格进入方向
    ↓
检查三个图层的有效 Tile 属性
    ↓
得到可通行或不可通行结果
```

Pokémon Essentials 原始 passage flags 的解释集中在兼容编译器中，不分散到人物移动代码和前端。

第一阶段人物只占一个逻辑格。人物图片的高度、宽度和底部透明区域不参与碰撞。

## 18. Portal 与地图切换

第一阶段 Portal 仍由 LoomRealm 的 `map.portal` 定义，不导入完整 RPG Maker XP 事件系统。

Portal 在人物完成一步移动并稳定进入触发区域后检查。

规则：

- Portal 目标地图必须存在；
- 目标坐标必须在地图范围内；
- 目标坐标必须允许人物站立；
- 地图切换期间人物状态进入 `mapTransition`；
- `mapTransition` 期间不接受新的移动结果；
- 切换后清空当前方向意图，避免立即反向触发；
- 地图切换完成后发送新地图的完整客户端可见状态；
- 前端加载缺失资源并原子替换 DOM 场景。

第一阶段可以手工为两张导入地图定义双向 Portal。

自动识别和转换原地图中的地图转移事件延后实现。

## 19. 客户端可见地图状态

前端不接收原始 FSDB 目录，也不解析 Pokémon Essentials Tile ID 和 Tile 属性。

后端输出标准化的客户端可见状态，概念上包括：

```text
Map Render State
├── mapId
├── width
├── height
├── tileWidth
├── tileHeight
├── contentVersion
├── groundRenderItems
├── worldRenderItems
├── portals for debug
└── player
```

每个标准渲染项至少包含：

```text
地图坐标
图片资源引用
图片源矩形
渲染平面
排序值
```

后端负责把原始三个数据层和 Tile Priority 编译成前端可直接执行的渲染顺序。

## 20. DOM 渲染结构

Pokémon Essentials 的三个源数据层不要求与三个 DOM 图层一一对应。

第一阶段建议使用：

```text
game viewport
└── game scene
    ├── ground layer
    ├── world layer
    │   ├── actor
    │   └── priority tiles
    ├── portal debug layer
    └── overlay layer
```

其中：

- `ground layer` 保存始终位于人物下方的 Tile；
- `world layer` 保存人物和需要按世界位置排序的 Priority Tile；
- `portal debug layer` 只在调试模式显示；
- `overlay layer` 显示地图切换遮罩、加载和错误。

人物和 Priority Tile 的 DOM 排序使用后端输出的标准排序值。前端不自行解释 Pokémon Essentials Priority。

普通 Tile 和预编译 Autotile 都通过 CSS 背景图及 `background-position` 渲染。

## 21. 资源接口

客户端可见状态只携带稳定资源 Key 和内容版本，不包含本机文件路径。

前端通过资源接口加载：

- `tile.sheet`；
- `tile.compiled`；
- `actor.sprite`。

原始 `tile.autotile` 通常只由导入器和构建流程使用，前端优先加载已编译资源。

资源接口只负责交付图片，不负责解释地图、碰撞、人物位置和 Tile ID。

## 22. 校验要求

第一阶段至少校验：

### 地图

- 地图宽高为正整数；
- `layerCount` 为 `3`；
- 三个图层的数据完整；
- 每行 `tileIds` 长度等于地图宽度；
- 每个图层正好包含地图高度数量的行；
- 不存在重复的 `layer + y`；
- 默认出生位置有效并可站立。

### Tileset

- 普通 Tileset 图片宽度能够按 32×32、每行 8 个 Tile 切分；
- 原始 Tile ID 可以解析；
- Autotile 槽位数量和资源引用有效；
- Autotile 能够成功编译；
- Tile 属性覆盖地图使用的 Tile ID；
- Priority 和通行字段有效。

### 人物

- 行走图宽高都能被 `4` 整除；
- 单帧尺寸有效；
- 四个方向行都存在；
- 出生位置与 Portal 目标位置可通行。

### Portal

- 来源和目标地图存在；
- 触发区域在来源地图范围内；
- 目标位置在目标地图范围内；
- 目标位置允许人物站立。

## 23. 第一阶段验收标准

第一阶段至少需要完成：

1. 从 Pokémon Essentials v21.1 项目导出两张真实地图；
2. 将地图宽高、三个图层和原始 Tile ID 写入 LoomRealm FSDB；
3. 导入地图使用的普通 Tileset、Autotile 和人物图片；
4. 预编译地图实际使用的 Autotile 第一帧；
5. 导入并标准化 Tile 通行属性和 Priority；
6. 后端成功编译运行时地图；
7. 前端通过 DOM 正确显示三个源层形成的最终地图；
8. 人物可以连续进行上下左右格子行走；
9. 碰撞失败时人物转向但不穿过阻挡；
10. 人物和 Priority Tile 的前后遮挡正确；
11. 人物可以通过手工定义的双向 Portal 在两张地图间往返；
12. 地图切换后前端获得完整状态并原子替换场景。

## 24. 版权与仓库边界

Pokémon Essentials 和 Pokémon 相关素材仅作为本地开发和兼容测试来源。

公共 LoomRealm 仓库应遵守：

- 不提交 Pokémon 图片和其他无法确认再分发权利的素材；
- 不提交用户本机的 Pokémon Essentials 项目目录；
- 将本地素材配置、导入缓存和编译图片加入 `.gitignore`；
- 仓库使用原创占位 Tileset、Autotile 和人物图执行自动测试；
- 可以公开兼容代码、导出器协议、数据 Schema 和文档；
- 不将 Pokémon Essentials 仓库许可证理解为对全部 Pokémon 素材的再分发授权。

## 25. 参考实现基准

第一阶段兼容实现以 Pokémon Essentials v21.1 官方仓库的以下行为为参考：

- `TilemapRenderer`：32×32 源 Tile、普通 Tileset 每行 8 个、普通 Tile 从 ID 384 开始；
- `TileDrawingHelper`：三个地图层和 48 种 Autotile 组合；
- `Sprite_Character`：四列、四行人物行走图及底部锚点；
- `Game_Player`：四方向格子移动、先转向、通行检查和碰撞失败行为。

参考仓库版本：

```text
Maruno17/pokemon-essentials
commit 8c5911e4a4b07b07e832e4bb0d5d8859e88b4a9b
```

## 26. 当前结论

第一阶段采用以下方向：

- 使用两张真实 Pokémon Essentials v21.1 地图测试；
- 保存三个地图数据层；
- 保留原始 RPG Maker XP Tile ID；
- `map.tile` 改为每图层每行一条 JSONL；
- 普通 Tile、Autotile、通行和 Priority 都进入兼容范围；
- Autotile 在后端导入或构建阶段预编译；
- `blocked` 不再作为地图格子的源字段；
- 人物使用整数格子坐标和 Pokémon 风格步进行走；
- 后端维护行走状态、碰撞结果和地图切换结果；
- 前端只根据标准客户端状态与资源接口进行 DOM/CSS 渲染；
- Portal 第一阶段由 LoomRealm 手工定义，不导入完整事件系统；
- Pokémon 相关素材只作为本地测试来源，不进入公共仓库。
