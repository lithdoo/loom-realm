# 第一阶段游戏包规范

## 1. 文档目的

本文档定义 LoomRealm 第一阶段可以由以下命令直接启动的游戏包目录：

```bash
loom-realm start ./game --save ./game.0.lrsav
```

本文档规定游戏包的根目录结构、清单、静态数据、资源、路径安全和加载边界。

游戏启动与地图、人物异步加载流程由《第一阶段游戏启动与异步内容加载》定义；地图、碰撞、状态同步、DOM 渲染和存档字段由对应专题文档定义。

## 2. 规范定位

第一阶段游戏包是一个完整、自包含、运行期间只读的目录。

```text
./game
= LoomRealm 只读游戏包

./game.0.lrsav
= LoomRealm 独立可写存档
```

游戏包必须包含启动和后续运行所需的静态数据与资源，但不得包含玩家当前进度。

LoomRealm 不提供游戏内容编辑器或项目创作接口。游戏包可以由人、AI、脚本或外部转换工具生成，只要最终目录符合本规范。

## 3. 核心原则

1. **目录即游戏包**：第一阶段只接受目录，不接受 ZIP、ASAR 或单文件游戏包。
2. **运行期间只读**：Runtime 不向游戏包写入存档、缓存、日志或生成结果。
3. **自包含**：游戏运行不得依赖游戏包外部素材、绝对路径或原始工程。
4. **数据与存档分离**：静态游戏定义位于游戏包，可变进度位于 `.lrsav`。
5. **入口唯一**：游戏包根目录必须存在唯一的 `realm.game.json`。
6. **路径受限**：清单和数据中的物理路径必须位于游戏包内部。
7. **纯数据与静态资源**：第一阶段游戏包不得要求 Runtime 执行任意脚本或二进制。
8. **启动不全量加载**：游戏包必须支持通过索引定位地图、人物和资源，不要求启动时读取所有详情。
9. **静态内容可重读**：地图和人物详情可以从游戏包异步重新加载，不得承载会话可变状态。
10. **资源主体按需读取**：图片资源由 Runtime Service 在客户端请求时打开，不进入 Runtime Core。

## 4. 根目录结构

第一阶段标准结构为：

```text
game/
├── realm.game.json
│
├── data/
│   └── [FSDB]project/
│       ├── [struct]map.definition/
│       ├── [extend]map.tileset/
│       ├── [group]map.tile/
│       ├── [group]map.portal/
│       │
│       ├── [struct]tile.set/
│       ├── [group]tile.property/
│       ├── [resource]tile.sheet/
│       ├── [resource]tile.autotile/
│       ├── [resource]tile.compiled/
│       │
│       ├── [struct]actor.definition/
│       └── [resource]actor.sprite/
│
└── licenses/
    └── 可选的许可、署名和来源说明
```

第一阶段不要求 `build/`。未来若增加构建产物，必须保持可丢弃、可重建，并且不能成为唯一的游戏定义来源。

### 4.1 必需内容

- `realm.game.json`；
- `data/[FSDB]project`；
- 清单入口引用的地图和玩家人物；
- 每张可运行地图所需的 Tile、Tileset、通行属性和资源定义；
- 每个可生成人物所需的人物定义和 Sprite 资源定义。

### 4.2 可选内容

- `licenses/`；
- 未被入口地图使用但仍符合 Schema 的其他地图、人物和资源；
- 零条或多条 Portal 记录。

第一阶段验收游戏包必须包含两张地图和一对双向 Portal，但一般游戏包规范不要求每个游戏都包含 Portal。

## 5. `realm.game.json`

### 5.1 最小示例

```json
{
  "format": "loom-realm-game",
  "formatVersion": 1,
  "game": {
    "id": "59cb1abf-ced2-4fb1-a45e-c70a32590ca0",
    "title": "Lappet Demo",
    "version": "0.1.0",
    "saveCompatibilityVersion": 1
  },
  "entry": {
    "initialMapId": "map.definition/lappet-town",
    "playerActorId": "actor.definition/player"
  },
  "paths": {
    "projectFsdb": "data/[FSDB]project"
  },
  "requires": {
    "loomRealm": ">=0.1.0 <0.2.0",
    "features": [
      "map.rmxp-three-layer",
      "map.autotile-static",
      "runtime.grid-walking",
      "runtime.portal"
    ]
  },
  "source": {
    "profile": "pokemon-essentials-v21.1"
  }
}
```

### 5.2 顶层字段

| 字段 | 第一阶段 | 说明 |
|---|---|---|
| `format` | 必需 | 固定为 `loom-realm-game` |
| `formatVersion` | 必需 | 游戏包规范版本，使用正整数 |
| `game` | 必需 | 游戏身份、显示信息和存档兼容版本 |
| `entry` | 必需 | 初始地图和玩家人物 |
| `paths` | 必需 | FSDB 位置 |
| `requires` | 必需 | Runtime 版本与功能要求 |
| `source` | 可选 | 来源追踪信息，不参与核心运行语义 |

未知字段的处理由 `formatVersion` 决定。第一阶段 Loader 可以保留未知字段，但不能在未声明支持时依赖其语义。

## 6. 格式与游戏身份

### 6.1 `format`

必须严格等于：

```text
loom-realm-game
```

### 6.2 `formatVersion`

第一阶段固定支持：

```json
"formatVersion": 1
```

该字段表示游戏包规范版本，不等于 LoomRealm 程序版本，也不等于游戏内容版本。

Loader 遇到高于自身支持范围的版本时必须拒绝加载。

### 6.3 `game.id`

`game.id` 是游戏永久身份，第一阶段使用 UUID 字符串。

规则：

- 发布后不得因为标题、目录名或普通内容更新而改变；
- 存档必须记录并校验该值；
- 复制游戏包默认仍视为同一个游戏；
- 创建独立分支游戏时应生成新的游戏 ID。

### 6.4 `game.title`

人类可读标题，只用于窗口、日志和界面显示，不作为引用 Key。

### 6.5 `game.version`

游戏内容发布版本，第一阶段使用 SemVer 字符串。

它用于显示、诊断和来源追踪，但不能单独决定存档是否兼容。

### 6.6 `game.saveCompatibilityVersion`

存档兼容版本使用正整数。

第一阶段只要求精确相等：

```text
save.gameId == manifest.game.id
save.saveCompatibilityVersion == manifest.game.saveCompatibilityVersion
```

复杂迁移和多版本兼容延后实现。

## 7. 游戏入口

`entry` 第一阶段包含：

```json
{
  "initialMapId": "map.definition/lappet-town",
  "playerActorId": "actor.definition/player"
}
```

规则：

- `initialMapId` 必须能在地图目录中定位；
- `playerActorId` 必须能在人物目录中定位；
- 初始地图必须定义有效的 `defaultSpawn`；
- 出生方向由地图 `defaultSpawn.direction` 提供；
- 清单不重复保存初始坐标。

没有存档时，启动过程异步加载清单入口地图和玩家人物，然后深度校验出生位置。

加载已有存档时，存档中的当前地图和位置覆盖初始入口；清单入口仍必须在轻量目录中存在，但不要求为启动当前存档而立即加载其完整详情。

## 8. 路径约定

### 8.1 `paths.projectFsdb`

第一阶段标准值：

```json
"projectFsdb": "data/[FSDB]project"
```

### 8.2 路径规则

游戏清单和 FSDB 中的路径必须：

- 使用 `/` 作为规范分隔符；
- 使用游戏包根目录相对路径；
- 解析后仍位于游戏包根目录内部；
- 不以 `/`、盘符或 UNC 路径开头；
- 不包含越出游戏包的 `..`；
- 不使用 `http:`、`https:`、`file:` 或其他 URL；
- 不通过符号链接、junction 或等价机制逃逸到包外。

第一阶段 Loader 应拒绝游戏包内部的符号链接和目录连接点。

## 9. FSDB 内容要求

`data/[FSDB]project` 是第一阶段静态游戏定义的权威来源。

最小逻辑结构：

```text
[FSDB]project/
├── [struct]map.definition/
├── [extend]map.tileset/
├── [group]map.tile/
├── [group]map.portal/
├── [struct]tile.set/
├── [group]tile.property/
├── [resource]tile.sheet/
├── [resource]tile.autotile/
├── [resource]tile.compiled/
├── [struct]actor.definition/
└── [resource]actor.sprite/
```

具体记录 Schema 由第一阶段项目 FSDB 和 Pokémon Essentials 地图兼容文档定义。

## 10. 可索引性要求

因为地图和人物按需异步加载，游戏包必须允许 Loader 在不读取全部记录详情的情况下建立轻量目录。

第一阶段至少需要能够得到：

```text
mapId → map.definition 记录位置
actorId → actor.definition 记录位置
resourceId → 资源物理位置
```

FSDB 的物理组织可以通过目录、元数据或轻量索引提供这些映射，但必须满足：

- Key 唯一；
- 定位结果确定；
- 定位路径位于游戏包内部；
- 建立目录不要求读取图片主体；
- 建立目录不要求解析所有地图 Tile 数据。

第一阶段可以通过遍历记录文件名和元数据建立目录，不要求增加独立索引文件。

## 11. 地图内容边界

一张地图的完整详情在 `Map Repository.load(mapId)` 时读取。

地图局部加载至少需要解析：

- `map.definition`；
- 对应 `map.tileset`；
- 三个 `map.tile` 图层；
- 实际使用 Tile 的 `tile.property`；
- 当前地图 Portal；
- 默认出生点；
- 地图引用的人物 ID；
- 地图引用的资源 Key。

地图加载时必须检查：

- 地图宽高有效；
- 三个 Tile 层完整；
- 每行 Tile 数量与宽度一致；
- Tile ID 可以由当前 Tileset 解释；
- 通行和 Priority 数据足以建立当前地图运行结构；
- Portal 目标地图 ID 在地图目录中存在；
- 当前地图引用的人物和资源 Key 在目录中存在。

Portal 目标地图只需在目录中存在，不要求加载当前地图时同时读取所有目标地图详情。

## 12. 人物内容边界

一个人物的完整详情在 `Actor Repository.load(actorId)` 时读取。

人物加载时至少检查：

- 人物 ID 与请求一致；
- 必需字段存在；
- Sprite 资源 Key 存在；
- Sprite 布局声明符合第一阶段四列四行约定；
- 资源路径安全。

第一阶段可以读取少量图片头部元数据来验证尺寸，也可以把像素尺寸验证放到独立全包验证流程；不得为了建立人物目录而读取所有图片主体。

## 13. 资源模型

第一阶段资源继续使用 FSDB `[resource]` 结构，不建立并行 `assets/` 目录规范。

标准资源命名空间：

```text
tile.sheet
tile.autotile
tile.compiled
actor.sprite
```

稳定资源 Key 示例：

```text
tile.sheet/outdoor
tile.compiled/outdoor-autotiles
actor.sprite/player
```

客户端状态不得暴露游戏包实际文件系统路径。

```text
资源 Key
→ Runtime Service
→ Resource Repository
→ 图片主体
→ Web Client
```

### 13.1 启动时资源校验

启动建立资源目录时只要求：

- 资源 Key 唯一；
- 物理路径合法；
- 文件存在；
- 扩展名或声明类型在允许范围内。

### 13.2 按需资源读取

资源主体只在 Runtime Service 收到请求时读取。

图片字节不得进入：

- Game Catalog；
- Map Snapshot；
- Actor Definition；
- Runtime Core；
- Save Snapshot。

### 13.3 完整性校验

完整内容哈希、图片解码和所有资源尺寸验证不属于启动必需流程，可以由 `loom-realm validate` 执行。

## 14. Feature 要求

`requires` 示例：

```json
{
  "loomRealm": ">=0.1.0 <0.2.0",
  "features": [
    "map.rmxp-three-layer",
    "map.autotile-static",
    "runtime.grid-walking",
    "runtime.portal"
  ]
}
```

规则：

- Feature ID 区分大小写，统一使用小写和点分命名；
- Runtime 不支持任何必需 Feature 时必须拒绝启动；
- Feature 只声明运行能力，不声明内容来源；
- Pokémon Essentials 来源信息不能代替 Feature 声明。

## 15. 来源追踪与 Pokémon Essentials 边界

`source` 是可选的非权威来源信息：

```json
{
  "profile": "pokemon-essentials-v21.1"
}
```

Pokémon Essentials 工程不是 LoomRealm 游戏包。

```text
Pokémon Essentials v21.1 工程
→ 外部导出和转换工具
→ LoomRealm 游戏包
→ loom-realm start
```

可运行游戏包不得依赖：

- `Data/MapXXX.rxdata`；
- Ruby 运行环境；
- Pokémon Essentials Ruby 脚本；
- 原始工程绝对路径；
- 未包含在游戏包内的素材。

LoomRealm Loader 只读取标准游戏包，不负责从原始工程现场导入。

## 16. 与存档的边界

游戏包不包含运行进度。

存档通过以下信息绑定游戏包：

- `game.id`；
- `game.saveCompatibilityVersion`；
- 存档格式版本；
- 可选的游戏内容诊断版本。

第一阶段规则：

- 存档存在时读取并继续；
- 存档不存在时从游戏初始入口启动；
- 保存时创建或原子替换指定存档；
- 未指定 `--save` 时创建临时会话；
- 存档路径不得位于游戏包目录内部；
- 保存不得修改清单、FSDB 或资源。

启动已有存档时，只需要异步加载存档当前引用的地图和玩家人物，不要求加载全部游戏内容。

## 17. 启动加载与校验

`loom-realm start` 使用分层校验。

### 17.1 包入口校验

- 游戏目录存在且可读；
- 根目录存在 `realm.game.json`；
- 清单是有效 UTF-8 JSON；
- `format` 正确；
- `formatVersion` 受支持；
- 必需字段存在且类型正确。

### 17.2 路径安全校验

- 所有路径是包内相对路径；
- 不存在路径穿越；
- 不存在符号链接或连接点逃逸；
- 不存在外部 URL；
- 存档路径位于游戏包外部。

### 17.3 轻量目录校验

- FSDB 根目录存在；
- 必需 Namespace 存在；
- 地图 Key 唯一；
- 人物 Key 唯一；
- 资源 Key 唯一；
- 清单入口 ID 可以定位；
- 存档引用的当前地图和人物 ID 可以定位。

此阶段不要求深度解析所有地图、人物和资源主体。

### 17.4 启动场景深度校验

异步加载当前地图和玩家人物后检查：

- 当前地图结构完整；
- 当前地图 Tile、Tileset、通行和 Priority 可解释；
- 当前玩家人物定义有效；
- 当前玩家 Sprite 资源 Key 存在；
- 入口或存档位置有效且可站立；
- 当前地图局部引用有效。

### 17.5 创建运行会话

```text
游戏包目录
→ Game Package Loader
→ Game Package Context
→ 异步加载当前 Map Snapshot 和 Actor Definition
→ Runtime Core
```

Runtime Core 不遍历游戏包文件，也不直接读取 FSDB。

## 18. 运行期间按需加载

地图切换流程：

```text
Portal 触发
→ 目标地图 ID
→ Map Repository 异步加载
→ 校验目标位置和局部引用
→ Runtime Core 原子提交
```

人物加载流程：

```text
地图或运行逻辑需要人物
→ Actor Repository 异步加载
→ 校验静态定义
→ Runtime Core 创建人物状态
```

加载失败时不得提交部分地图切换或部分人物创建。

## 19. 全包验证

完整游戏发布检查使用独立语义：

```bash
loom-realm validate ./game
```

全包验证遍历：

- 所有地图详情；
- 所有人物详情；
- 所有强引用；
- 所有 Portal 目标和坐标；
- 所有资源定义和文件；
- 可选的资源头、尺寸或内容摘要。

`start` 追求快速建立当前会话；`validate` 追求完整发现游戏包错误。

## 20. 错误行为

以下问题必须在启动阶段拒绝启动：

- 清单缺失、损坏或格式不匹配；
- 不支持的 `formatVersion`；
- 游戏 ID 或入口字段无效；
- 路径逃逸或包外依赖；
- 必需 FSDB Namespace 缺失；
- 入口或存档当前地图无法定位；
- 玩家人物无法定位；
- 当前启动场景无法加载；
- Runtime 版本或 Feature 不满足；
- 存档位于游戏包内部。

未访问地图中的局部错误可以在该地图加载时报告；正式发布前应通过全包验证发现。

错误至少应包含：

- 稳定错误代码；
- 严重级别；
- 相关内容 ID；
- 记录位置或字段路径；
- 人类可读说明；
- 可选修复建议。

## 21. 第一阶段最小游戏包

一个可以启动的最小游戏包至少包含：

```text
realm.game.json

data/[FSDB]project/
├── 至少一个 map.definition
├── 入口地图的 map.tileset
├── 入口地图的三个 map.tile 图层
├── 至少一个 tile.set
├── 入口地图使用 Tile 的 tile.property
├── 入口地图需要的资源定义和文件
├── 至少一个 actor.definition
└── 玩家 actor.sprite 资源定义和文件
```

清单必须引用可以异步加载成功的初始地图和玩家人物。

## 22. 第一阶段验收游戏包

公开测试游戏包应包含：

- 一个固定 UUID 游戏 ID；
- `formatVersion: 1`；
- 两张原创或可公开分发的测试地图；
- RPG Maker XP/Pokémon Essentials 语义的三个 Tile 层；
- 普通 Tile；
- 静态第一帧 Autotile；
- 方向通行属性；
- Priority Tile；
- 一个四行四列玩家 Sprite；
- 一对双向 Portal；
- 可站立的初始出生位置；
- 至少一个阻挡和一个方向通行测试区域；
- 不包含无权公开分发的素材。

端到端验收至少执行：

```bash
loom-realm start ./game
loom-realm start ./game --save ./game.0.lrsav
```

并验证：

- 启动时不深度读取第二张地图；
- 入口地图和玩家人物异步加载；
- 图片主体由客户端请求时读取；
- Portal 触发后异步加载第二张地图；
- 目标地图成功后原子切换；
- 加载失败时当前状态不变；
- 存档创建和恢复。

## 23. 第一阶段非目标

第一阶段游戏包规范不定义：

- ZIP、ASAR 或单文件分发格式；
- 包签名、加密或 DRM；
- 在线资源和自动下载；
- 外部包依赖；
- DLC、补丁包和继承；
- 插件和任意脚本执行；
- 多语言资源包；
- 存档迁移脚本；
- 启动时全量 Game Snapshot；
- 地图热重载；
- NPC 和完整事件系统；
- 战斗和 Pokémon 业务数据库；
- 游戏内容编辑器或创作 API。

## 24. 已冻结的第一阶段决策

| 决策 | 第一阶段结论 |
|---|---|
| 游戏启动输入 | 目录 |
| 清单名称 | `realm.game.json` |
| 清单格式标识 | `loom-realm-game` |
| 游戏包规范版本 | 整数 `formatVersion` |
| 游戏身份 | 稳定 UUID |
| 游戏内容版本 | SemVer 字符串 |
| 存档兼容版本 | 独立正整数 |
| 静态数据位置 | `data/[FSDB]project` |
| 图片资源 | FSDB `[resource]` Namespace |
| 游戏包运行期间 | 只读 |
| 启动加载 | 清单、轻量目录和当前场景 |
| 地图详情 | 按 ID 异步加载 |
| 人物详情 | 按 ID 异步加载 |
| 图片主体 | 客户端请求时按需读取 |
| Runtime Core 文件 I/O | 禁止 |
| 全包深度校验 | 独立 `validate` 流程 |
| 外部绝对路径 | 禁止 |
| 网络资源 | 禁止 |
| 符号链接和连接点 | 禁止 |
| 包内存档 | 禁止 |
| 任意可执行脚本 | 禁止 |
| 初始入口 | 地图 ID + 玩家人物 ID |
| 出生坐标来源 | 初始地图 `defaultSpawn` |

## 25. 仍待专题确认

- `requires.loomRealm` 的正式版本范围语法；
- Feature Registry 的正式列表和兼容规则；
- Game Catalog 的正式 Schema；
- Map Snapshot 的正式 Schema；
- Actor Definition 的正式 Schema；
- Repository 缓存和并发去重接口；
- 资源内容版本和 MIME 类型契约；
- `.lrsav` 文件格式；
- CLI 错误码、退出码和日志格式；
- 统一错误与诊断 Schema；
- `validate` 的完整验收规则。

## 26. 当前结论

第一阶段游戏包的公开契约是：

```text
只读目录
├── realm.game.json
├── data/[FSDB]project
└── 可选 licenses
        ↓
启动时建立轻量 Game Catalog
        ↓
异步加载当前地图和人物
        ↓
创建 Runtime Session
        ↓
运行期间按需加载后续地图、人物和资源
```

游戏包只描述游戏是什么，存档描述游戏已经发生了什么。LoomRealm 不把全部游戏内容读入内存，也不让 Runtime Core 直接读取文件系统。