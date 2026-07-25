# LoomRealm 游戏包契约 v1

> 状态：**Active / Normative**  
> 适用范围：第一阶段 `formatVersion: 1`  
> 最近复核：2026-07-25  
> 主要定义：游戏包根目录、清单、内容定位、路径安全和加载边界

本文档定义 `loom-realm start <directory>` 接受的第一阶段只读游戏包。

相关文档：

- [`../overview/product-scope.md`](../overview/product-scope.md)：产品定位和第一阶段范围；
- [`../game-package/phase-1-game-loading.md`](../game-package/phase-1-game-loading.md)：Loader、Catalog 和 Repository 内部设计；
- [`../runtime/phase-1-pokemon-essentials-map-runtime.md`](../runtime/phase-1-pokemon-essentials-map-runtime.md)：当前 LoomRealm FSDB Profile 和兼容编译规则；
- [`../fsdb/FSDB目录结构详解.md`](../fsdb/FSDB目录结构详解.md)：通用 FSDB 基础格式。

## 1. 公开命令

第一阶段启动命令：

```bash
loom-realm start ./game
```

全包验证命令：

```bash
loom-realm validate ./game
```

`validate` 可以分阶段实现，但其语义与 `start` 不同：

- `start` 快速建立当前会话，只深度加载当前场景；
- `validate` 遍历游戏包全部强引用并报告完整内容问题。

Save System 不进入第一阶段运行闭环。本契约不定义 `--save`、`.lrsav` 文件格式、存档恢复或迁移。

## 2. 核心原则

1. **目录即游戏包**：第一阶段只接受普通目录。
2. **运行期间只读**：Runtime 不向游戏包写入存档、缓存、日志或编译结果。
3. **自包含**：运行所需静态定义和资源位于游戏包内部。
4. **唯一清单**：根目录必须存在唯一 `realm.game.json`。
5. **路径受限**：所有物理路径必须解析到游戏包根目录内部。
6. **纯数据与静态资源**：游戏包不能要求 Runtime 执行任意脚本或本机二进制。
7. **启动不全量加载**：目录结构必须允许建立地图、人物和资源的轻量索引。
8. **静态内容可重读**：地图和人物定义不得保存当前会话可变状态。
9. **资源主体按需读取**：图片字节不进入 Game Catalog、Runtime Core 或 Client State。
10. **来源与运行格式分离**：Pokémon Essentials 工程是转换输入，不是可直接启动的 LoomRealm 游戏包。

## 3. 根目录结构

第一阶段标准结构：

```text
game/
├── realm.game.json
├── data/
│   └── [FSDB]project/
│       ├── [struct]map.definition/
│       ├── [extend]map.tileset/
│       ├── [group]map.tile/
│       ├── [group]map.portal/
│       ├── [struct]tile.set/
│       ├── [group]tile.property/
│       ├── [resource]tile.sheet/
│       ├── [resource]tile.autotile/
│       ├── [resource]tile.compiled/
│       ├── [struct]actor.definition/
│       └── [resource]actor.sprite/
└── licenses/
    └── 可选许可、署名和来源说明
```

### 3.1 必需内容

- `realm.game.json`；
- `data/[FSDB]project`；
- 清单引用的入口地图和玩家人物；
- 当前可运行地图需要的 Tile、Tileset、通行、Priority 和资源定义；
- 当前可生成人物需要的人物定义和 Sprite 资源。

### 3.2 可选内容

- `licenses/`；
- 未被入口地图使用的其他合法地图、人物和资源；
- 零条或多条 Portal；
- 未使用的 Autotile 槽位。

游戏包不得依赖根目录外的原始工程、素材目录或绝对路径。

## 4. `realm.game.json`

### 4.1 最小示例

```json
{
  "format": "loom-realm-game",
  "formatVersion": 1,
  "game": {
    "id": "59cb1abf-ced2-4fb1-a45e-c70a32590ca0",
    "title": "Lappet Demo",
    "version": "0.1.0"
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

### 4.2 顶层字段

| 字段 | 要求 | 说明 |
|---|---|---|
| `format` | 必需 | 固定为 `loom-realm-game`。 |
| `formatVersion` | 必需 | 本契约版本，第一阶段为整数 `1`。 |
| `game` | 必需 | 游戏身份和显示版本。 |
| `entry` | 必需 | 初始地图和玩家人物。 |
| `paths` | 必需 | 游戏包内的内容根路径。 |
| `requires` | 必需 | Runtime 版本和 Feature 要求。 |
| `source` | 可选 | 来源追踪信息，不参与核心运行语义。 |

第一阶段 Loader 可以保留未知字段，但不能依赖未声明支持的未知字段语义。

## 5. 格式和游戏身份

### 5.1 `format`

必须严格等于：

```text
loom-realm-game
```

### 5.2 `formatVersion`

第一阶段只支持：

```json
"formatVersion": 1
```

高于 Runtime 支持范围的版本必须被拒绝。该值不是 LoomRealm 程序版本，也不是游戏内容版本。

### 5.3 `game.id`

`game.id` 是稳定游戏身份，使用 UUID 字符串。

规则：

- 普通内容更新、标题变化和目录重命名不得改变该值；
- 复制同一个游戏包默认仍表示同一个游戏；
- 创建独立分支游戏时应生成新的 ID；
- 第一阶段不使用该字段实现存档兼容逻辑。

### 5.4 `game.title`

人类可读标题，仅用于窗口、日志和界面显示，不作为数据引用 Key。

### 5.5 `game.version`

游戏内容发布版本，使用 SemVer 字符串。它用于显示、诊断和来源追踪，不决定游戏包格式兼容性。

## 6. 游戏入口

`entry`：

```json
{
  "initialMapId": "map.definition/lappet-town",
  "playerActorId": "actor.definition/player"
}
```

规则：

- `initialMapId` 必须能由地图目录定位；
- `playerActorId` 必须能由人物目录定位；
- 初始地图必须提供有效 `defaultSpawn`；
- 出生坐标和方向来自地图定义，清单不重复保存；
- 启动时并行加载入口地图和玩家人物；
- 入口场景深度校验成功后才能初始化 Runtime Core。

## 7. 路径约定

`paths.projectFsdb` 的第一阶段标准值：

```json
"projectFsdb": "data/[FSDB]project"
```

所有清单和 FSDB 中的物理路径必须：

- 使用 `/` 作为规范分隔符；
- 使用游戏包根目录相对路径；
- 规范化后仍位于游戏包根目录内部；
- 不以 `/`、盘符或 UNC 路径开头；
- 不通过 `..` 越出游戏包；
- 不使用 `http:`、`https:`、`file:` 等 URL；
- 不通过符号链接、junction 或等价机制逃逸。

第一阶段 Loader 应拒绝游戏包内部的符号链接和目录连接点。

## 8. FSDB 内容要求

`data/[FSDB]project` 是游戏静态定义的权威来源。

当前最小逻辑结构：

```text
map.definition
map.tileset
map.tile
map.portal

tile.set
tile.property
tile.sheet
tile.autotile
tile.compiled

actor.definition
actor.sprite
```

具体地图层、原始 Tile ID、Autotile、通行和 Priority 语义由 Pokémon Essentials 兼容文档定义。本契约只冻结游戏包边界和可定位性要求。

## 9. ID 与可索引性

游戏包必须允许 Loader 在不解析全部记录详情的情况下建立：

```text
mapId      → map.definition 记录位置
actorId    → actor.definition 记录位置
resourceId → 资源物理位置和描述
```

要求：

- ID 唯一；
- 定位结果确定；
- 物理位置在游戏包内部；
- 建立目录不读取图片主体；
- 建立目录不解析所有地图 Tile 数据；
- 资源 Key 使用稳定语义命名空间，例如 `actor.sprite/player`。

第一阶段允许通过目录、文件名和 FSDB 元数据建立索引，不强制独立索引文件。

## 10. 分层加载和校验

### 10.1 包入口校验

- 游戏目录存在且可读；
- `realm.game.json` 存在且是有效 UTF-8 JSON；
- `format` 和 `formatVersion` 受支持；
- 必需字段存在且类型正确；
- Runtime 版本和 Feature 要求满足。

### 10.2 路径安全校验

- 所有路径是安全的包内相对路径；
- 不存在路径穿越、外部 URL 或链接逃逸。

### 10.3 轻量目录校验

- FSDB 根目录和必需 Namespace 存在；
- 地图、人物和资源 Key 唯一；
- 清单入口 ID 可以定位；
- 建立目录不深度读取全部内容和资源主体。

### 10.4 当前场景深度校验

入口地图和玩家人物加载后检查：

- 地图结构、三个 Tile 层和行宽完整；
- Tileset、Tile ID、通行和 Priority 可以解释；
- Portal 的局部引用有效；
- 人物定义和 Sprite 资源 Key 有效；
- 出生位置在地图范围内且允许站立。

### 10.5 全包验证

`loom-realm validate` 应遍历：

- 所有地图和人物详情；
- 所有强引用；
- 所有 Portal 目标和坐标；
- 所有资源定义和文件；
- Autotile 编译输入和产物；
- 可选资源头、尺寸或内容摘要。

## 11. 资源模型

标准资源命名空间包括：

```text
tile.sheet
tile.autotile
tile.compiled
actor.sprite
```

客户端状态只携带稳定资源 Key 和可选内容版本，不携带游戏包文件路径。

```text
Client Node Data 中的资源 Key
→ Runtime Service
→ Resource Repository
→ 资源主体
→ Web Client Resource Cache
```

图片字节不得进入：

- Game Catalog；
- Map Snapshot；
- Actor Definition 的普通 JSON 主体；
- Runtime Core；
- Client State Tree。

## 12. Feature 要求

`requires.features` 使用小写点分 ID，例如：

```text
map.rmxp-three-layer
map.autotile-static
runtime.grid-walking
runtime.portal
```

规则：

- Feature ID 区分大小写，规范值使用小写；
- Runtime 不支持任一必需 Feature 时必须拒绝启动；
- Feature 表示运行能力，不表示内容来源；
- `source.profile` 不能替代 Feature 声明。

正式 Feature Registry 仍需独立参考文档定义。

## 13. 来源追踪和兼容输入

`source` 可以记录：

```json
{
  "profile": "pokemon-essentials-v21.1"
}
```

它仅用于追踪、诊断和重新导入。

```text
Pokémon Essentials v21.1 工程
→ 外部导出和转换工具
→ LoomRealm 游戏包
→ loom-realm start
```

可运行游戏包不得依赖：

- `Data/MapXXX.rxdata`；
- Ruby 运行环境或 Pokémon Essentials 脚本；
- 原始工程绝对路径；
- 游戏包外部素材。

Runtime Loader 不负责在启动时从原工程现场导入。

## 14. 错误要求

错误至少应包含：

- 稳定错误代码；
- 严重级别；
- 人类可读说明；
- 相关内容 ID；
- 记录位置或字段路径；
- 可选修复建议。

启动阶段必须拒绝：

- 清单缺失、损坏或格式不匹配；
- 不支持的格式版本；
- 游戏身份或入口无效；
- 路径逃逸或包外依赖；
- 必需 Namespace 缺失；
- 入口地图或玩家人物无法定位；
- 当前启动场景无法加载；
- Runtime 版本或 Feature 不满足。

未访问地图的局部内容错误可以在首次加载该地图时报告，但正式发布前应由 `validate` 发现。

## 15. 最小游戏包

一个可启动的最小游戏包至少包含：

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

## 16. 第一阶段非目标

本契约不定义：

- Save System、`.lrsav` 或 `--save`；
- ZIP、ASAR 和单文件分发；
- 包签名、加密和 DRM；
- 在线资源和自动下载；
- 外部包依赖、DLC 和补丁合并；
- 插件和任意脚本执行；
- 地图热重载；
- NPC、完整事件系统和 Pokémon 业务数据库；
- 游戏内容编辑器或创作 API。

## 17. 冻结决策

| 决策 | 第一阶段结论 |
|---|---|
| 启动输入 | 普通目录 |
| 启动命令 | `loom-realm start ./game` |
| 清单 | `realm.game.json` |
| 格式标识 | `loom-realm-game` |
| 格式版本 | 整数 `1` |
| 游戏身份 | 稳定 UUID |
| 游戏内容版本 | SemVer |
| 静态数据位置 | `data/[FSDB]project` |
| 游戏包运行期间 | 只读 |
| 启动加载 | 清单、轻量目录和当前场景 |
| 地图和人物详情 | 按 ID 异步加载 |
| 图片主体 | 客户端请求时读取 |
| Runtime Core 文件 I/O | 禁止 |
| 全包深度校验 | 独立 `validate` 流程 |
| 外部路径和 URL | 禁止 |
| 符号链接和连接点 | 禁止 |
| 任意可执行脚本 | 禁止 |
| Save System | 后续阶段 |

## 18. 当前结论

```text
只读目录游戏包
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

游戏包只描述游戏静态内容是什么。当前会话发生了什么由 Runtime 权威状态描述；持久化存档属于后续阶段。