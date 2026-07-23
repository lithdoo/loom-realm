# 第一阶段项目 FSDB 数据模型

## 1. 文档目的

本文档定义 LoomRealm 第一阶段地图运行时原型所需的最小 FSDB 数据模型。

第一阶段只需要支持：

- 加载地图；
- 渲染瓦片；
- 加载一个玩家角色；
- 玩家移动与静态碰撞；
- 在两张地图之间跳转。

本文档不设计完整 RPG 数据库，也不提前引入事件、NPC、战斗、存档、插件、多库依赖或用户自定义结构。

## 2. 核心边界

第一阶段只建立一个项目数据库：

```text
[FSDB]project/
```

该数据库保存游戏开始前已经确定的静态定义，包括地图、瓦片集、地图瓦片、传送点和玩家角色定义。

以下数据不写入项目 FSDB：

- 当前地图；
- 玩家当前坐标；
- 玩家当前朝向；
- 玩家是否正在移动；
- 当前按键状态；
- 地图切换过程状态。

这些数据属于运行时权威状态，由运行时在加载项目后创建和维护。

基本原则是：

> FSDB 保存世界定义，运行时保存世界当前状态。

## 3. 命名空间规则

FSDB 表和资源使用以下命名形式：

```text
<domain>.<concept>
```

命名空间用于表达数据所属领域和概念，避免使用含义过宽的扁平名称。

第一阶段使用：

```text
map.definition
map.tileset
map.tile
map.portal

tile.set
tile.sheet

actor.definition
actor.sprite
```

其中：

- `map.*` 表示地图定义、地图内容和地图关系；
- `tile.*` 表示瓦片集及其资源；
- `actor.*` 表示人物定义及其资源。

命名尽量使用单数概念。后续可以沿用相同规则增加 `map.layer`、`map.event`、`tile.property`、`actor.animation` 等结构，但第一阶段不提前创建这些目录。

## 4. 第一阶段最小目录

```text
[FSDB]project/
├── [struct]map.definition/
├── [extend]map.tileset/
├── [group]map.tile/
├── [group]map.portal/
│
├── [struct]tile.set/
├── [resource]tile.sheet/
│
├── [struct]actor.definition/
└── [resource]actor.sprite/
```

各目录职责如下：

| FSDB 结构 | 职责 |
|---|---|
| `map.definition` | 定义地图尺寸、名称和默认出生位置 |
| `map.tileset` | 建立地图与瓦片集之间的关系 |
| `map.tile` | 保存地图各位置的瓦片索引和碰撞信息 |
| `map.portal` | 保存地图中的跳转区域和目标位置 |
| `tile.set` | 定义瓦片图集的切分方式 |
| `tile.sheet` | 保存瓦片图集图片资源 |
| `actor.definition` | 定义玩家角色的精灵切分、移动和碰撞参数 |
| `actor.sprite` | 保存人物行走图资源 |

## 5. 地图定义

`[struct]map.definition` 中每个文件表示一张地图，文件名作为地图 ID。

示例：

```text
[struct]map.definition/
├── town.json
└── house.json
```

地图定义只保存地图自身的属性，例如：

- 显示名称；
- 横向格子数；
- 纵向格子数；
- 默认出生位置。

示例：

```json
{
  "name": "Town",
  "width": 20,
  "height": 15,
  "defaultSpawn": {
    "x": 3,
    "y": 5
  }
}
```

地图使用哪个瓦片集属于地图与瓦片集之间的关系，因此单独放入 `[extend]map.tileset`，避免把结构引用直接混入地图定义。

第一阶段每张地图只使用一个瓦片集。

## 6. 地图与瓦片集关系

`[extend]map.tileset` 建立地图与 `tile.set` 之间的关系。

示例：

```json
{
  "mapId": "town",
  "tileSetId": "outdoor"
}
```

对应 `.extend.meta` 应声明：

```jsonl
{"field":"mapId","struct":"map.definition","desc":"使用瓦片集的地图"}
{"field":"tileSetId","struct":"tile.set","desc":"地图使用的瓦片集"}
```

第一阶段要求一张地图只能有一条有效的瓦片集关系。

## 7. 瓦片集定义

`[struct]tile.set` 描述一张瓦片图集如何被切分，而不是描述地图中的具体瓦片位置。

示例：

```text
[struct]tile.set/outdoor.json
```

```json
{
  "name": "Outdoor",
  "sheet": "outdoor.png",
  "tileWidth": 32,
  "tileHeight": 32,
  "columns": 8
}
```

瓦片集至少需要描述：

- 使用的图集资源；
- 单个瓦片宽度；
- 单个瓦片高度；
- 图集列数。

运行时通过瓦片索引和瓦片集切分规则计算源图像区域。

第一阶段不把每一个 Tile 建成独立的 `[struct]` 实体。Tile 只是瓦片图集中的索引位置。

后续需要瓦片名称、默认碰撞、地形类别、动画或自动拼接规则时，再增加专门的瓦片属性结构。

## 8. 地图瓦片数据

`[group]map.tile` 按地图 ID 分组保存地图网格内容。

示例：

```text
[group]map.tile/
├── town.jsonl
└── house.jsonl
```

`town.jsonl` 中的所有记录都属于 `town` 地图。

每条记录至少包含：

- 地图坐标；
- 瓦片索引；
- 当前位置是否阻挡。

示例：

```jsonl
{"x":0,"y":0,"tileIndex":1,"blocked":true}
{"x":1,"y":0,"tileIndex":1,"blocked":true}
{"x":1,"y":1,"tileIndex":5,"blocked":false}
```

第一阶段将碰撞信息直接保存在地图位置上，而不是保存在 Tile 定义中。

这样允许同一个视觉瓦片在不同地图位置拥有不同的通行结果，也避免提前设计瓦片属性继承和覆盖规则。

## 9. 地图传送点

`[group]map.portal` 按来源地图 ID 分组保存传送点。

示例：

```text
[group]map.portal/
├── town.jsonl
└── house.jsonl
```

文件名已经表示来源地图，因此记录中不重复保存来源地图 ID。

每条 Portal 记录至少包含：

- Portal ID；
- 来源地图中的触发区域；
- 目标地图 ID；
- 目标位置。

示例：

```jsonl
{"id":"town-to-house","x":8,"y":5,"width":1,"height":1,"targetMapId":"house","targetX":4,"targetY":7}
```

`map.portal` 的 `.extend.meta` 应声明 `targetMapId` 引用 `map.definition`。

第一阶段不单独建立出生点表。地图默认出生位置保存在地图定义中，Portal 目标位置保存在 Portal 记录中。

## 10. 人物定义

`[struct]actor.definition` 保存人物的静态定义。第一阶段只需要一个玩家角色。

示例：

```text
[struct]actor.definition/hero.json
```

人物定义可以包含：

- 显示名称；
- 行走图资源；
- 单帧宽高；
- 行列数量；
- 方向顺序；
- 移动速度；
- 碰撞盒尺寸和偏移。

示例：

```json
{
  "name": "Hero",
  "sprite": "hero.png",
  "frameWidth": 32,
  "frameHeight": 32,
  "columns": 4,
  "rows": 4,
  "directionOrder": ["down", "left", "right", "up"],
  "moveSpeed": 4,
  "collision": {
    "width": 24,
    "height": 16,
    "offsetX": 4,
    "offsetY": 16
  }
}
```

人物定义不保存当前地图、坐标、朝向或移动状态。

## 11. 资源按语义拆分

第一阶段不使用通用的 `[resource]asset.image`。

图片资源按用途拆分为：

```text
[resource]tile.sheet
[resource]actor.sprite
```

示例：

```text
[resource]tile.sheet/
├── outdoor.png
└── indoor.png

[resource]actor.sprite/
└── hero.png
```

拆分依据是资源语义，而不是文件扩展名。

`tile.sheet` 与 `actor.sprite` 虽然都可能是 PNG，但它们的加载和校验规则不同：

- `tile.sheet` 需要校验图片尺寸能否按瓦片宽高完整切分、列数是否匹配、瓦片索引是否越界；
- `actor.sprite` 需要校验行列布局、帧尺寸、方向顺序和动画帧是否有效。

因此不按 `asset.png`、`asset.webp` 等编码格式分类。未来即使人物资源改用 WebP，它仍然属于 `actor.sprite`。

只有在后续出现无法归入具体领域的共享资源时，才重新评估是否需要通用 `asset.*` 命名空间。

## 12. 项目入口

FSDB 外部可以保留一个最小项目入口文件，用于指出项目数据库、初始地图和玩家角色。

示例：

```text
realm.project.json
```

```json
{
  "database": "[FSDB]project",
  "entryMap": "town",
  "playerActor": "hero"
}
```

项目入口负责启动配置，不作为第一阶段 FSDB 内部的数据表。

## 13. 最小校验要求

第一阶段至少需要验证：

### 地图

- 地图宽高有效；
- 默认出生位置没有越界；
- 默认出生位置不是阻挡位置；
- 每张地图存在且只存在一个有效瓦片集关系。

### 瓦片集与瓦片

- 图集资源存在；
- 图集能够按照瓦片宽高完整切分；
- 地图中的瓦片索引没有越界；
- 地图坐标没有越界或重复；
- `blocked` 是布尔值。

### Portal

- Portal ID 在当前地图内唯一；
- 触发区域没有越界；
- 目标地图存在；
- 目标位置没有越界；
- 目标位置不是阻挡位置。

### Actor

- 人物精灵资源存在；
- 图片能够按照帧尺寸和行列数量切分；
- 方向定义有效；
- 移动速度和碰撞盒参数有效。

## 14. 第一阶段不设计的内容

第一阶段不加入：

- Tile 独立实体；
- Tile 默认属性和地图覆盖规则；
- 多地图图层；
- Autotile；
- 动画 Tile；
- NPC 和地图事件；
- 世界状态库和存档；
- 用户自定义 Schema；
- 通用资源库；
- 跨 FSDB 引用；
- 多个瓦片集同时参与一张地图；
- 完整资源清单和资源导入流水线。

## 15. 当前结论

第一阶段项目 FSDB 的最小模型为：

```text
map.definition
map.tileset
map.tile
map.portal

tile.set
tile.sheet

actor.definition
actor.sprite
```

其中：

- 地图、瓦片集和人物定义使用独立结构；
- 地图瓦片和传送点按地图分组；
- 地图与瓦片集关系使用显式扩展关系；
- Tile 作为瓦片集中的索引，不作为独立实体；
- 碰撞暂时属于地图位置；
- 图片资源按使用语义拆分；
- 项目 FSDB 只保存静态定义；
- 实时游戏状态由运行时维护。
