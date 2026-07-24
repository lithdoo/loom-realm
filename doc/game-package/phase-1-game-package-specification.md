# 第一阶段游戏包规范

## 1. 文档目的

本文档定义 LoomRealm 第一阶段可以由以下命令直接启动的游戏包目录：

```bash
loom-realm start ./game --save ./game.0.lrsav
```

本文档只规定游戏包的根目录结构、清单、静态数据、资源、构建产物、路径安全和加载校验边界。

地图、人物行走、碰撞、状态同步、DOM 渲染和存档内部字段由对应专题文档定义。

## 2. 规范定位

第一阶段游戏包是一个完整、自包含、运行期间只读的目录。

```text
./game
= LoomRealm 只读游戏包

./game.0.lrsav
= LoomRealm 独立可写存档
```

游戏包必须包含启动游戏所需的静态数据和资源，但不得包含玩家当前进度。

LoomRealm 不提供游戏内容编辑器或项目创作接口。游戏包可以由人、AI、脚本或外部内容转换工具生成，只要最终目录符合本规范。

## 3. 核心原则

1. **目录即游戏包**：第一阶段只接受目录，不接受 ZIP、归档文件或单文件游戏包。
2. **运行期间只读**：Runtime 不向游戏包写入存档、缓存、日志或编译结果。
3. **自包含**：游戏运行不得依赖游戏包外部的素材、绝对路径或原始工程。
4. **数据与存档分离**：静态游戏定义位于游戏包，可变进度位于 `.lrsav`。
5. **入口唯一**：游戏包根目录必须存在唯一的 `realm.game.json`。
6. **路径受限**：清单和数据中的物理路径必须位于游戏包内部。
7. **纯数据与静态资源**：第一阶段游戏包不得携带要求 Runtime 执行的任意 Node.js、Ruby、Shell 或其他脚本。
8. **加载与运行分离**：Game Loader 将目录内容转换为不可变 `Game Snapshot` 后，Runtime Core 不再直接遍历游戏包文件。

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
├── build/
│   └── 可选的预编译运行时产物
│
└── licenses/
    └── 可选的许可、署名和来源说明
```

### 4.1 必需内容

第一阶段必需：

- `realm.game.json`；
- `data/[FSDB]project`；
- 清单入口引用的地图和玩家人物；
- 地图运行所需的 Tile、Tileset、通行属性和图片资源。

### 4.2 可选内容

第一阶段可选：

- `build/`；
- `licenses/`；
- 未被初始地图使用、但仍符合 Schema 的其他地图和资源；
- `map.portal` 中的零条或多条 Portal 记录。

第一阶段验收游戏包必须包含两张地图和一对双向 Portal，但一般游戏包规范不要求每个游戏必须包含 Portal。

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
    "projectFsdb": "data/[FSDB]project",
    "prebuilt": "build"
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
| `game` | 必需 | 游戏身份、显示信息与存档兼容版本 |
| `entry` | 必需 | 初始地图和玩家人物 |
| `paths` | 必需 | FSDB 与可选构建产物位置 |
| `requires` | 必需 | Runtime 版本与功能要求 |
| `source` | 可选 | 来源追踪信息，不参与核心运行语义 |

未知顶层字段的处理规则由 `formatVersion` 决定。第一阶段 Loader 可以保留未知字段，但不得在未声明支持时依赖其语义。

## 6. 格式与游戏身份

### 6.1 `format`

必须严格等于：

```text
loom-realm-game
```

其他值必须被拒绝。

### 6.2 `formatVersion`

第一阶段固定支持：

```json
"formatVersion": 1
```

该字段表示游戏包规范版本，不等于 LoomRealm 程序版本，也不等于游戏内容版本。

Loader 遇到高于自身支持范围的版本时必须拒绝加载，不能尝试猜测兼容性。

### 6.3 `game.id`

`game.id` 是游戏永久身份，第一阶段建议使用 UUID 字符串。

规则：

- 发布后不得因为游戏标题、目录名或普通内容更新而改变；
- 存档必须记录并校验该值；
- 复制游戏包时默认仍视为同一个游戏；
- 创建独立分支游戏时应生成新的游戏 ID。

### 6.4 `game.title`

人类可读标题，仅用于窗口、日志和界面显示，不作为引用 Key。

### 6.5 `game.version`

游戏内容发布版本，第一阶段使用 SemVer 字符串。

它用于显示、诊断和来源追踪，但不能单独决定存档是否兼容。

### 6.6 `game.saveCompatibilityVersion`

存档兼容版本使用正整数。

当游戏内容发生破坏性存档变更时递增。普通图片更新、文案修正或不影响已有状态的数据调整不要求递增。

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

- `initialMapId` 必须引用存在的 `map.definition`；
- `playerActorId` 必须引用存在的 `actor.definition`；
- 初始地图必须定义有效的 `defaultSpawn`；
- 出生坐标必须在地图范围内并允许玩家站立；
- 出生方向由地图 `defaultSpawn.direction` 提供；
- 清单不重复保存初始坐标，避免与地图定义产生两个来源。

当加载已有存档时，存档中的当前地图和人物位置覆盖初始入口，但 Loader 仍必须验证清单入口本身有效。

## 8. 路径约定

### 8.1 `paths.projectFsdb`

第一阶段标准值：

```json
"projectFsdb": "data/[FSDB]project"
```

该目录保存规范化静态游戏数据和 FSDB 资源。

第一阶段允许字段存在以保留未来调整能力，但正式验收夹具应使用标准路径。

### 8.2 `paths.prebuilt`

第一阶段标准值：

```json
"prebuilt": "build"
```

该目录可以不存在。不存在时 Loader 根据规范化数据加载或在游戏包外部生成缓存。

### 8.3 路径规则

游戏清单中的路径必须：

- 使用 `/` 作为规范分隔符；
- 使用游戏包根目录的相对路径；
- 解析后仍位于游戏包根目录内部；
- 不以 `/`、盘符或 UNC 路径开头；
- 不包含越出游戏包的 `..`；
- 不使用 `http:`、`https:`、`file:` 或其他 URL；
- 不通过符号链接、junction 或等价机制逃逸到包外。

第一阶段 Loader 应拒绝游戏包内部的符号链接和目录连接点，避免平台差异和路径逃逸。

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

第一阶段 Loader 至少必须确保：

- 所有 FSDB Key 唯一；
- 所有强引用可以解析；
- 初始地图和玩家存在；
- 地图宽高和三个 Tile 层完整；
- 每一行 Tile 数量与地图宽度一致；
- Tile ID 可由地图 Tileset 解析；
- 通行属性覆盖实际使用的 Tile；
- 人物 Sprite 存在且尺寸有效；
- Portal 来源、目标地图和坐标有效。

## 10. 资源模型

第一阶段资源继续使用 FSDB `[resource]` 结构，不另外建立并行的 `assets/` 目录规范。

标准资源命名空间包括：

```text
tile.sheet
tile.autotile
tile.compiled
actor.sprite
```

运行时和客户端使用稳定资源 Key，例如：

```text
tile.sheet/outdoor
tile.compiled/outdoor-autotiles
actor.sprite/player
```

客户端状态不得暴露游戏包内的实际文件系统路径。

```text
资源 Key
→ Runtime Service 资源接口
→ 图片内容与内容版本
```

资源物理位置、扩展名和文件名是 Loader 的实现细节，不是客户端协议的一部分。

## 11. 规范化数据与构建产物

### 11.1 规范化权威内容

以下内容属于游戏定义：

- `realm.game.json`；
- 地图、Tile、Tileset、人物和 Portal 数据；
- Tile 通行属性和 Priority 来源数据；
- 普通 Tileset 和人物图片；
- 用于重新生成构建产物的 Autotile 来源资源。

### 11.2 可选构建产物

`build/` 可以包含：

- 展开后的静态 Autotile Atlas；
- 编译后的地图渲染项；
- 有效方向通行网格；
- Priority 排序数据；
- 资源索引和内容摘要。

构建产物必须可以由规范化内容重新生成，不得成为唯一的业务数据来源。

### 11.3 外部缓存

游戏运行期间不得更新游戏包中的 `build/`。

当预编译产物缺失或失效时，运行时缓存写入游戏包外部，例如：

```text
<user-data>/loom-realm/cache/<game-id>/<content-digest>/
```

缓存位置不是游戏包规范的一部分，具体由运行环境决定。

## 12. 构建产物有效性

Loader 使用预编译产物前必须验证其与当前游戏内容匹配。

第一阶段至少需要比较：

- 游戏包格式版本；
- 构建器格式版本；
- 输入内容摘要；
- 使用的功能 Profile；
- 构建产物自身是否完整。

推荐流程：

```text
发现 build 元数据
    ↓
验证格式和输入摘要
    ├── 有效 → 加载预编译产物
    └── 无效或缺失 → 在外部缓存重新编译
```

构建产物失效不应自动修改游戏包。

## 13. 功能要求

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

### 13.1 `requires.loomRealm`

表示游戏包要求的 LoomRealm 运行版本范围。

第一阶段应定义并使用一种确定的版本范围语法；建议采用 SemVer range。

### 13.2 `requires.features`

Feature ID 用于声明游戏包运行所必需的能力。

第一阶段基准 Feature：

```text
map.rmxp-three-layer
map.autotile-static
runtime.grid-walking
runtime.portal
```

规则：

- Feature ID 区分大小写，统一使用小写和点分命名；
- Runtime 不支持任何必需 Feature 时必须拒绝启动；
- Feature 只声明运行能力，不声明内容来源；
- Pokémon Essentials 来源信息不能代替 Feature 声明。

是否允许可选 Feature 延后设计。

## 14. 来源追踪

`source` 是可选的非权威来源信息：

```json
{
  "profile": "pokemon-essentials-v21.1"
}
```

各地图或 Tileset 可以继续保存更细的来源 Map ID、Tileset ID 和原始文件名。

来源字段用于：

- 调试导入问题；
- 对照原始内容；
- 重新生成游戏包；
- 记录兼容 Profile。

Runtime Core 不根据来源字段改变通用移动、碰撞或状态同步逻辑。

## 15. Pokémon Essentials 边界

Pokémon Essentials 工程不是 LoomRealm 游戏包。

```text
Pokémon Essentials v21.1 工程
→ 外部导出、转换和 Autotile 编译工具
→ LoomRealm 游戏包
→ loom-realm start
```

可以直接运行的游戏包不得依赖：

- `Data/MapXXX.rxdata`；
- Ruby 运行环境；
- Pokémon Essentials Ruby 脚本；
- 原始工程绝对路径；
- 未包含在游戏包内的 Pokémon Essentials 素材。

第一阶段 LoomRealm Loader 只读取标准游戏包，不负责从原始 Pokémon Essentials 工程现场导入。

## 16. 与存档的边界

游戏包不包含运行进度。

存档文件通过以下信息绑定游戏包：

- `game.id`；
- `game.saveCompatibilityVersion`；
- 存档格式版本；
- 可选的游戏内容诊断版本或摘要。

启动示例：

```bash
loom-realm start ./game --save ./game.0.lrsav
```

第一阶段规则：

- 存档文件存在时读取并继续；
- 存档文件不存在时从游戏初始入口启动；
- 保存时创建或原子替换指定存档；
- 未指定 `--save` 时创建临时会话；
- 存档路径不得位于游戏包目录内部；
- 保存不得修改 `realm.game.json`、FSDB、资源或 `build/`。

`.lrsav` 的具体格式由存档专题文档定义。

## 17. 加载与校验流程

Game Loader 按以下顺序处理游戏包。

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

### 17.3 FSDB 结构校验

- FSDB 根目录存在；
- 必需 Namespace 存在；
- Schema 和元数据有效；
- Key 唯一；
- 引用完整；
- 必需资源存在。

### 17.4 运行语义校验

- 初始地图和玩家人物存在；
- 初始出生位置有效且可站立；
- 地图 Tile 和 Tileset 可解析；
- Autotile 预编译产物可用，或来源足以重新编译；
- 通行属性和 Priority 可以编译；
- Portal 目标有效；
- 人物图片布局有效。

### 17.5 运行能力校验

- LoomRealm 版本满足 `requires.loomRealm`；
- Runtime 支持全部必需 Feature；
- 游戏包未要求第一阶段不支持的能力。

### 17.6 创建快照

全部校验通过后：

```text
游戏包目录
→ Game Loader & Compiler
→ 不可变 Game Snapshot
→ Runtime Core
```

Runtime Core 不再以游戏包文件作为动态业务状态来源。

## 18. 错误行为

游戏包存在以下问题时必须拒绝启动：

- 清单缺失、损坏或格式不匹配；
- 不支持的 `formatVersion`；
- 游戏 ID 或入口字段无效；
- 路径逃逸或包外依赖；
- 必需 FSDB 数据或资源缺失；
- 引用无法解析；
- 初始出生位置非法；
- Tile、Autotile、通行或人物资源无法编译；
- Runtime 版本或 Feature 不满足；
- 存档位于游戏包内部。

错误至少应包含：

- 稳定错误代码；
- 严重级别；
- 游戏包根目录；
- 相关文件或 FSDB Key；
- 字段路径；
- 人类可读说明；
- 可选的修复建议。

错误代码和诊断格式由后续错误模型专题统一定义。

## 19. 第一阶段最小游戏包

一个可以启动的最小游戏包至少包含：

```text
realm.game.json

data/[FSDB]project/
├── 至少一个 map.definition
├── 该地图的 map.tileset
├── 该地图的三个 map.tile 图层
├── 至少一个 tile.set
├── 地图使用 Tile 的 tile.property
├── 地图需要的 tile.sheet
├── 地图需要的 tile.compiled
│   或足够生成它的 tile.autotile
├── 至少一个 actor.definition
└── 对应 actor.sprite
```

清单必须引用存在的初始地图和玩家人物。

## 20. 第一阶段验收游戏包

用于第一阶段端到端验收的公开测试游戏包应包含：

- 一个固定 UUID 游戏 ID；
- `formatVersion: 1`；
- 两张原创或可公开分发的测试地图；
- RPG Maker XP/Pokémon Essentials 语义的三个 Tile 层；
- 普通 Tile；
- 静态第一帧 Autotile；
- 方向通行属性；
- Priority Tile；
- 一个四行四列玩家 Sprite；
- 一对手工定义的双向 Portal；
- 可站立的初始出生位置；
- 至少一个阻挡和一个方向通行测试区域；
- 可选的有效预编译 `build/`；
- 不包含 Pokémon 或其他无权公开分发的素材。

端到端验收至少执行：

```bash
loom-realm start ./game
loom-realm start ./game --save ./game.0.lrsav
```

并验证临时会话、创建存档、恢复存档、移动、碰撞和地图切换。

## 21. 第一阶段非目标

第一阶段游戏包规范不定义：

- ZIP 或单文件分发格式；
- 包签名、加密或 DRM；
- 在线资源和自动下载；
- 外部包依赖；
- DLC、补丁包和继承；
- 插件和任意脚本执行；
- 多语言资源包；
- 存档迁移脚本；
- NPC 和完整事件系统；
- 战斗和 Pokémon 业务数据库；
- 游戏内容编辑器或创作 API。

## 22. 已冻结的第一阶段决策

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
| 构建产物位置 | 可选 `build/` |
| 运行时缓存 | 游戏包外部 |
| 游戏包运行期间 | 只读 |
| 外部绝对路径 | 禁止 |
| 网络资源 | 禁止 |
| 符号链接和连接点 | 禁止 |
| 包内存档 | 禁止 |
| 任意可执行脚本 | 禁止 |
| 初始入口 | 地图 ID + 玩家人物 ID |
| 出生坐标来源 | 初始地图 `defaultSpawn` |

## 23. 仍待专题确认

以下内容不阻止先采用本规范，但需要后续专题冻结：

- `requires.loomRealm` 的正式版本范围语法和解析库；
- Feature Registry 的正式列表和兼容规则；
- `build/` 元数据和内容摘要 Schema；
- Game Snapshot 的正式结构；
- 资源内容版本和 MIME 类型契约；
- `.lrsav` 文件格式；
- CLI 错误码、退出码和日志格式；
- 统一错误与诊断 Schema；
- 游戏包内容摘要是否参与存档兼容判断。

## 24. 当前结论

第一阶段游戏包的公开契约是：

```text
只读目录
├── realm.game.json
├── data/[FSDB]project
├── 可选 build
└── 可选 licenses
        ↓
Game Loader 校验与编译
        ↓
不可变 Game Snapshot
        ↓
Runtime Core
```

游戏包只描述游戏是什么，存档描述游戏已经发生了什么。LoomRealm 通过 CLI 加载二者并建立运行会话，不修改游戏内容，也不提供内容编辑能力。
