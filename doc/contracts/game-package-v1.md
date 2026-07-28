# LoomRealm 游戏包契约 v1

> 状态：**Active / Normative**  
> 适用范围：第一阶段 `formatVersion: 1`  
> 最近复核：2026-07-28  
> 主要定义：游戏包根目录、清单、入口文件、内容定位、路径安全和加载边界

相关文档：

- [`../overview/product-scope.md`](../overview/product-scope.md)：产品范围；
- [`../architecture/main-system-and-subsystems.md`](../architecture/main-system-and-subsystems.md)：初始子系统和调用栈；
- [`../game-package/phase-1-game-loading.md`](../game-package/phase-1-game-loading.md)：Loader、Catalog 和 Repository；
- [`../runtime/phase-1-pokemon-essentials-map-runtime.md`](../runtime/phase-1-pokemon-essentials-map-runtime.md)：地图子系统 FSDB Profile。

## 1. 公开命令

```bash
loom-realm start ./game
loom-realm validate ./game
```

- `start` 快速建立会话，只加载入口子系统启动所需内容；
- `validate` 遍历游戏包全部强引用并报告完整问题；
- Save System 不进入第一阶段。

## 2. 核心原则

1. **目录即游戏包**：第一阶段只接受普通目录。
2. **运行期间只读**：程序主系统和子系统不得向游戏包写入状态、缓存或日志。
3. **唯一游戏清单**：根目录必须存在 `realm.game.json`。
4. **唯一入口文件**：清单必须引用一个 `realm.entry.json`。
5. **入口系统化**：入口文件定义初始子系统和 JSON 参数，不固定为地图字段。
6. **路径受限**：所有物理路径必须解析到游戏包内部。
7. **纯数据和静态资源**：第一阶段游戏包不能要求执行包内脚本或本机二进制。
8. **启动不全量加载**：只建立轻量目录并加载初始子系统所需内容。
9. **资源主体按需读取**：图片字节不进入 Client State Tree。
10. **来源与运行格式分离**：原始 Pokémon Essentials 工程不是可直接启动的游戏包。

## 3. 根目录结构

第一阶段标准结构：

```text
game/
├── realm.game.json
├── realm.entry.json
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
    └── 可选许可和来源说明
```

必需内容：

- `realm.game.json`；
- 清单引用的入口文件；
- 入口子系统启动所需的数据和资源；
- 第一阶段地图入口使用的地图、人物、Tile 和资源定义。

游戏包不得依赖根目录外的工程、素材或绝对路径。

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
  "entry": "realm.entry.json",
  "paths": {
    "projectFsdb": "data/[FSDB]project"
  },
  "requires": {
    "loomRealm": ">=0.1.0 <0.2.0",
    "systems": [
      "loom.map"
    ],
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
| `formatVersion` | 必需 | 第一阶段为整数 `1`。 |
| `game` | 必需 | 游戏身份和显示版本。 |
| `entry` | 必需 | 游戏包内入口文件的相对路径。 |
| `paths` | 必需 | 游戏包内静态内容根路径。 |
| `requires` | 必需 | 平台版本、子系统和 Feature 要求。 |
| `source` | 可选 | 来源追踪，不参与核心运行语义。 |

`entry` 必须是安全的包内相对路径。第一阶段标准值为：

```json
"entry": "realm.entry.json"
```

## 5. `realm.entry.json`

### 5.1 最小结构

```json
{
  "format": "loom-realm-entry",
  "formatVersion": 1,
  "system": "loom.map",
  "params": {
    "mapId": "map.definition/lappet-town",
    "playerActorId": "actor.definition/player"
  }
}
```

字段：

| 字段 | 要求 | 说明 |
|---|---|---|
| `format` | 必需 | 固定为 `loom-realm-entry`。 |
| `formatVersion` | 必需 | 第一阶段为整数 `1`。 |
| `system` | 必需 | 初始模块子系统 ID。 |
| `params` | 必需 | 交给初始子系统的 JSON 调用参数。 |

规则：

- `system` 必须是非空稳定字符串；
- `system` 必须在运行平台可解析，并满足 `requires.systems`；
- `params` 必须是 JSON 值，第一阶段推荐对象；
- 程序主系统只验证公共 JSON 结构；
- 目标子系统负责验证 `params` 的业务 Schema；
- 入口文件不得包含可执行代码、回调、文件句柄或进程信息。

### 5.2 第一阶段地图入口

内置 `loom.map` 子系统接受：

```ts
interface MapEntryParams {
  readonly mapId: string;
  readonly playerActorId: string;
}
```

规则：

- `mapId` 必须能由地图目录定位；
- `playerActorId` 必须能由人物目录定位；
- 初始地图必须提供有效 `defaultSpawn`；
- 出生坐标和方向来自地图定义；
- 地图子系统在返回 ready 前完成入口地图和人物深度校验。

这些字段属于 `loom.map` 的调用契约，不属于程序主系统的固定入口 Schema。

## 6. 游戏身份

- `game.id` 使用稳定 UUID；
- 普通内容更新和目录重命名不得改变 `game.id`；
- `game.title` 只用于显示；
- `game.version` 使用 SemVer，用于诊断和发布标识；
- `formatVersion` 与应用版本、游戏版本互相独立。

## 7. 路径安全

所有物理路径必须：

- 使用 `/` 作为规范分隔符；
- 使用游戏包根目录相对路径；
- 规范化后仍位于游戏包内部；
- 不以 `/`、盘符或 UNC 路径开头；
- 不通过 `..` 越出游戏包；
- 不使用 `http:`、`https:`、`file:` 等 URL；
- 不通过符号链接、junction 或等价机制逃逸。

第一阶段 Loader 应拒绝游戏包内部的符号链接和目录连接点。

## 8. FSDB 内容要求

`data/[FSDB]project` 是第一阶段地图静态定义的权威来源。

最小逻辑结构：

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

具体地图层、原始 Tile ID、Autotile、通行和 Priority 语义由地图兼容文档定义。

未来其他子系统可以定义自己的数据 Namespace，但必须在对应子系统契约中说明，并保持游戏包只读和路径安全规则。

## 9. 索引与加载

游戏包应允许 Loader 在不解析全部记录详情的情况下建立：

```text
mapId      → map.definition 记录位置
actorId    → actor.definition 记录位置
resourceId → 资源物理位置和描述
```

第一阶段启动流程：

```text
校验 realm.game.json
→ 校验 realm.entry.json 公共结构
→ 检查初始 system 可用
→ 建立轻量 Game Catalog
→ 启动初始子系统
→ 初始子系统按需加载 params 引用内容
```

程序主系统不应根据 `system` 猜测业务参数或直接加载地图。内容加载由目标子系统或其内部 Repository 负责。

## 10. 分层校验

### 10.1 包入口校验

- 游戏目录存在且可读；
- 两个 JSON 文件是有效 UTF-8 JSON；
- 格式和版本受支持；
- `entry` 路径安全；
- 初始 `system` 可解析；
- 平台版本和系统要求满足。

### 10.2 轻量目录校验

- FSDB 根目录和必需 Namespace 存在；
- 地图、人物和资源 Key 唯一；
- 建立目录不读取图片主体和全部地图 Tile。

### 10.3 子系统参数校验

- 目标子系统验证 `params`；
- 引用内容可以定位；
- 当前调用所需内容可以加载；
- 子系统 ready 前完成必要深度校验。

### 10.4 全包验证

`loom-realm validate` 应检查：

- 游戏清单和入口文件；
- 必需子系统与 Feature；
- 所有地图、人物、Portal 和资源强引用；
- Autotile 编译输入和产物；
- 路径安全和资源存在性。

## 11. 资源模型

Client State 只携带稳定资源 Key，不携带游戏包文件路径。

```text
Client Node Data 中的资源 Key
→ 获授权的资源服务或子系统资源接口
→ 资源主体
→ Web Client Resource Cache
```

图片字节不得进入：

- Game Catalog；
- Map Snapshot；
- Runtime Core；
- Client State Tree。

## 12. 系统与 Feature 要求

`requires.systems` 声明启动或内容运行所必需的系统 ID：

```json
"systems": ["loom.map"]
```

`requires.features` 声明系统能力：

```text
map.rmxp-three-layer
map.autotile-static
runtime.grid-walking
runtime.portal
```

规则：

- 缺少任一必需系统或 Feature 时拒绝启动；
- 系统 ID 表示可调用的模块子系统；
- Feature 表示实现能力；
- `source.profile` 不能替代系统或 Feature 声明；
- 第一阶段系统注册表由本地运行平台提供，游戏包不携带可执行系统程序。

## 13. 来源追踪

```text
Pokémon Essentials v21.1 工程
→ 外部导出和转换工具
→ LoomRealm 游戏包
→ loom-realm start
```

可运行游戏包不得依赖 Ruby 运行环境、原工程绝对路径或包外素材。Runtime Loader 不负责在启动时现场导入原工程。

## 14. 错误要求

错误至少包含：

- 稳定错误代码；
- 严重级别；
- 人类可读说明；
- 文件和字段路径；
- 相关系统或内容 ID；
- 可选修复建议。

启动阶段必须拒绝：

- 清单或入口文件缺失、损坏或版本不匹配；
- 初始系统不可解析；
- 入口参数被目标子系统拒绝；
- 路径逃逸或包外依赖；
- 必需 Namespace 缺失；
- 平台版本、系统或 Feature 不满足；
- 初始子系统无法进入 ready。

## 15. 第一阶段非目标

本契约不定义：

- Save System；
- ZIP、ASAR 和单文件分发；
- 包签名、加密和 DRM；
- 在线资源和自动下载；
- 游戏包内子系统可执行文件；
- 子系统包管理器和第三方安装格式；
- 插件脚本和任意代码执行；
- 地图热重载；
- 完整 Pokémon 业务数据库；
- 游戏内容编辑器或创作 API。

## 16. 冻结决策

| 决策 | 第一阶段结论 |
|---|---|
| 启动输入 | 普通目录 |
| 启动命令 | `loom-realm start ./game` |
| 游戏清单 | `realm.game.json` |
| 入口文件 | `realm.entry.json` |
| 初始系统 | 入口文件 `system` |
| 初始参数 | 入口文件 `params` |
| 游戏包运行期间 | 只读 |
| 子系统程序来源 | 本地运行平台，不随游戏包执行 |
| 静态数据位置 | `data/[FSDB]project` |
| 地图和人物详情 | 地图子系统按 ID 异步加载 |
| 图片主体 | 客户端需要时按 Key 读取 |
| 外部路径和 URL | 禁止 |
| Save System | 后续阶段 |

## 17. 当前结论

```text
只读游戏包
├── realm.game.json
├── realm.entry.json
└── data/[FSDB]project
        ↓
程序主系统读取初始 system 与 params
        ↓
启动初始模块子系统并压栈
        ↓
子系统按需加载自己的静态内容和资源
```

游戏包描述静态内容和程序入口；程序主系统管理调用栈；每个模块子系统解释自己的调用参数并维护自身运行状态。