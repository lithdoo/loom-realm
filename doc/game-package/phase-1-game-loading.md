# 第一阶段游戏启动与异步内容加载

## 1. 文档目的

本文档定义 LoomRealm 第一阶段如何打开只读游戏包、建立轻量内容目录，并按需异步加载地图和人物。

本文档不定义 Session Coordinator 的完整状态机和命令流程；相关内容由《第一阶段 Session Coordinator》负责。

核心原则：

> 启动时读取游戏身份、入口和内容索引；只加载入口场景需要的地图与人物；后续内容按需异步加载；图片资源由 Web Client 通过 Runtime Service 请求。

第一阶段不把所有地图、人物或图片资源读入内存，也不构建全量 `Game Snapshot`。

## 2. 模块结构

```text
只读游戏包目录
        ↓
Game Package Loader
        ↓
Game Package Context
├── Game Catalog
├── Map Repository
├── Actor Repository
└── Resource Repository
        ↓
Session Coordinator
        ↓
Runtime Core
```

职责边界：

- `Game Package Loader` 打开目录、校验清单并建立轻量索引；
- `Repository` 按 ID 异步读取、解析、校验和缓存静态内容；
- `Session Coordinator` 组织入口场景和地图切换流程；
- `Runtime Core` 只处理已经准备好的结构化内容和权威状态；
- `Runtime Service` 提供状态、命令和资源接口；
- `Web Client` 请求、解码和缓存图片资源。

## 3. 核心对象

第一阶段使用以下对象：

```text
Game Package Context
    游戏包身份、轻量目录和内容仓储

Game Catalog
    地图、人物和资源的 ID 索引

Map Snapshot
    单张已加载地图的只读运行定义

Actor Definition
    单个人物的只读定义

Runtime State
    当前会话的可变权威状态
```

静态内容可以缓存、淘汰和重新加载。运行状态不能依赖某个静态对象是否仍在缓存中。

## 4. Game Package Source

`Game Package Source` 是对只读游戏目录的最小访问抽象：

```ts
interface GamePackageSource {
  readText(path: string): Promise<string>;
  readBinary(path: string): Promise<Uint8Array>;
  exists(path: string): Promise<boolean>;
  list(path: string): Promise<readonly string[]>;
}
```

第一阶段只实现：

```text
DirectoryGamePackageSource
```

该接口只提供加载静态内容所需的只读能力，不模拟完整文件系统。

路径规则：

- 规范路径必须位于游戏包根目录内；
- 禁止绝对路径；
- 禁止路径穿越；
- 禁止符号链接和目录连接点逃逸；
- 禁止远程 URL；
- Runtime 不通过该接口写入任何内容。

## 5. Game Package Loader

`Game Package Loader` 负责打开游戏包并建立 `Game Package Context`。

启动时读取：

- `realm.game.json`；
- 游戏包格式和游戏身份；
- 初始地图和玩家人物入口；
- Runtime 版本和 Feature 要求；
- FSDB 根结构和必要 Namespace 元数据；
- 地图 ID 与记录位置索引；
- 人物 ID 与记录位置索引；
- 资源 Key 与物理位置索引。

启动时不读取：

- 所有地图的 Tile 详情；
- 所有人物的完整定义；
- 所有 Portal 的运行数据；
- 图片、音频等资源主体；
- 整个游戏包的全量内容摘要。

Loader 成功后返回：

```ts
interface GamePackageContext {
  readonly catalog: GameCatalog;
  readonly maps: MapRepository;
  readonly actors: ActorRepository;
  readonly resources: ResourceRepository;
}
```

## 6. Game Catalog

`Game Catalog` 是启动后常驻内存的轻量目录：

```ts
interface GameCatalog {
  readonly game: GameIdentity;
  readonly entry: GameEntry;
  readonly maps: ReadonlyMap<string, MapCatalogEntry>;
  readonly actors: ReadonlyMap<string, ActorCatalogEntry>;
  readonly resources: ReadonlyMap<string, ResourceDescriptor>;
}
```

示意目录项：

```ts
interface MapCatalogEntry {
  readonly id: string;
  readonly definitionLocation: string;
}

interface ActorCatalogEntry {
  readonly id: string;
  readonly definitionLocation: string;
}

interface ResourceDescriptor {
  readonly id: string;
  readonly packagePath: string;
  readonly mediaType?: string;
}
```

目录项保存定位和轻量元数据，不保存完整 Tile 层、通行网格、人物详情或图片字节。

## 7. Map Repository

`Map Repository` 根据地图 ID 异步加载一张地图：

```ts
interface MapRepository {
  load(mapId: string): Promise<MapSnapshot>;
}
```

加载一张地图时读取并校验：

- 地图定义；
- 地图尺寸和 Tile Size；
- 三个 Tile 层；
- 地图使用的 Tileset；
- 实际使用 Tile 的通行和 Priority 属性；
- Portal；
- 默认出生点；
- 当前地图引用的人物 ID；
- 当前地图引用的资源 Key。

输出：

```ts
interface MapSnapshot {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  readonly tileSize: number;
  readonly defaultSpawn: SpawnPoint;
  readonly layers: readonly TileLayer[];
  readonly passability: PassabilityGrid;
  readonly portals: PortalIndex;
  readonly actorIds: readonly string[];
  readonly resourceIds: readonly string[];
}
```

`Map Snapshot` 不包含玩家当前坐标、移动进度或其他可变会话状态。

## 8. Actor Repository

`Actor Repository` 根据人物 ID 异步加载人物定义：

```ts
interface ActorRepository {
  load(actorId: string): Promise<ActorDefinition>;
}
```

第一阶段人物定义至少包含：

```ts
interface ActorDefinition {
  readonly id: string;
  readonly spriteResourceId: string;
  readonly spriteLayout: {
    readonly columns: 4;
    readonly rows: 4;
  };
}
```

启动时只加载玩家人物。其他人物在进入包含该人物的地图或实际创建运行时人物之前加载。

Actor Repository 只返回静态定义，不创建运行时人物状态。

## 9. Resource Repository

`Resource Repository` 根据资源 Key 定位资源，并在 Runtime Service 收到客户端请求后打开资源主体：

```ts
interface ResourceRepository {
  describe(resourceId: string): ResourceDescriptor | undefined;
  open(resourceId: string): Promise<ResourceBody>;
}
```

资源链路：

```text
Web Client
→ 请求资源 Key
→ Runtime Service
→ Resource Repository
→ 打开资源主体
→ 返回给 Web Client
```

Game Package Loader 只建立资源目录并执行轻量完整性检查：

- 资源 Key 唯一；
- 资源路径安全；
- 文件存在；
- 扩展名或声明类型受支持。

第一阶段不在启动时读取、解码或预载全部图片。

## 10. Repository 缓存

缓存属于 Repository，而不是 Session Coordinator。

```text
MapRepository.load(mapId)
├── ready：返回缓存内容
├── loading：返回同一个 Promise
└── not-loaded：读取、解析、校验并缓存
```

第一阶段缓存要求：

- 同一 ID 的并发请求共享一个加载任务；
- 当前地图可以常驻；
- 两张验收地图可以全部驻留，但不是规范要求；
- 缓存命中与否不得改变游戏语义；
- 不要求持久化缓存；
- 不要求 LRU；
- 加载失败不永久缓存。

## 11. 启动游戏

命令：

```bash
loom-realm start ./game
```

启动流程：

```text
解析 CLI 参数
→ 创建 DirectoryGamePackageSource
→ 读取和校验 realm.game.json
→ 建立 Game Catalog
→ 创建 Map、Actor、Resource Repository
→ 创建 Game Package Context
→ 创建 Runtime Core
→ 创建 Session Coordinator
→ Session Coordinator.start()
```

Session Coordinator 并行加载入口内容：

```text
MapRepository.load(entry.initialMapId)
ActorRepository.load(entry.playerActorId)
```

加载完成后校验：

- 初始地图有效；
- 玩家人物有效；
- 默认出生位置在地图范围内；
- 默认出生位置允许玩家站立；
- 玩家 Sprite 资源 Key 存在；
- 地图引用的必需资源 Key 存在。

资源主体仍不在启动阶段读取。

成功后：

```text
Game Identity
+ 入口 Map Snapshot
+ 玩家 Actor Definition
+ 默认出生位置
        ↓
Runtime Core.initialize(...)
        ↓
Session 进入 running
        ↓
Runtime Service 发布首个完整状态
```

## 12. Runtime Core 与异步边界

Runtime Core 不直接：

- 调用 Repository；
- 调用 `fs`；
- 执行 `await`；
- 读取 FSDB；
- 打开图片资源。

Runtime Core 接收已经准备好的对象并执行同步事务。

地图切换流程：

```text
Runtime Core 检测 Portal
→ 返回 MapTransitionEffect
→ Session Coordinator 暂停 Runtime
→ 异步准备目标地图和人物
→ Runtime Core 原子提交 PreparedMapTransition
→ 恢复 Runtime
```

完整协调行为由《第一阶段 Session Coordinator》定义。

## 13. 地图异步加载

地图切换遵循“准备—提交”：

```text
当前地图继续有效
→ 加载目标 Map Snapshot
→ 加载目标地图必需 Actor Definition
→ 校验目标位置和引用
→ 创建 PreparedMapTransition
→ Runtime Core 原子提交
```

目标地图准备失败时：

- 当前地图保持不变；
- 玩家状态保持不变；
- 不提交部分切换；
- Session Coordinator 根据错误类型恢复或进入失败状态。

## 14. 人物异步加载

第一阶段只要求玩家人物，但接口按长期模型设计：

```text
启动游戏
→ 加载玩家人物

进入地图
→ 加载地图运行必需的人物

运行时创建人物
→ 创建前加载 Actor Definition
```

静态人物定义与运行人物状态分离：

```text
Actor Definition
    Sprite、布局和静态能力

Runtime Actor State
    地图、坐标、朝向和移动状态
```

## 15. 校验策略

校验分为两种运行模式。

### 15.1 启动快速校验

启动时检查：

- 清单和格式版本；
- 游戏身份和入口；
- Runtime Feature；
- FSDB 根结构；
- 地图、人物和资源 Key 唯一性；
- 入口地图和入口人物可以定位；
- 所有资源路径均位于游戏包内。

### 15.2 按需深度校验

内容首次加载时检查：

- 地图层数据完整；
- Tile 和 Tileset 引用可解析；
- 通行和 Priority 数据有效；
- Portal 目标存在；
- 人物定义有效；
- 资源 Key 存在；
- 目标坐标在范围内且可站立。

未来可以增加独立命令：

```bash
loom-realm validate ./game
```

该命令遍历全部内容执行深度校验，但不属于第一阶段启动闭环的必需实现。

## 16. 加载错误

建议错误代码至少包括：

```text
GAME_MANIFEST_NOT_FOUND
GAME_MANIFEST_INVALID
GAME_FORMAT_VERSION_UNSUPPORTED
GAME_FEATURE_UNSUPPORTED
GAME_PATH_OUTSIDE_PACKAGE
FSDB_NAMESPACE_INVALID
CONTENT_ID_DUPLICATED
MAP_NOT_FOUND
MAP_INVALID
ACTOR_NOT_FOUND
ACTOR_INVALID
RESOURCE_NOT_FOUND
RESOURCE_PATH_INVALID
SPAWN_INVALID
PORTAL_TARGET_INVALID
```

错误至少包含：

- 稳定错误代码；
- 人类可读说明；
- 游戏包根目录；
- 相关 FSDB Key；
- 相关文件路径；
- 字段路径；
- 可选修复建议。

## 17. 第一阶段非目标

第一阶段不实现：

- 全游戏一次性加载；
- 完整 `Game Snapshot`；
- ZIP、ASAR 或其他单文件游戏包；
- 热重载和文件监听；
- 后台预加载；
- 持久化编译缓存；
- 增量构建；
- 远程游戏包；
- 内容依赖包；
- DLC 和补丁合并；
- 存档恢复；
- 客户端图片就绪后再恢复 Runtime。

## 18. 第一阶段验收

正常路径：

- 启动时只建立轻量目录；
- 入口地图和玩家人物并行加载；
- 图片资源主体不在启动时读取；
- Portal 触发目标地图异步加载；
- 目标内容准备完成后原子提交；
- 资源由 Web Client 按 Key 请求；
- 重复加载同一地图可以命中缓存。

错误路径：

- 清单不存在或损坏；
- 入口地图不存在；
- 入口人物不存在；
- 地图 Tile 数据损坏；
- 人物资源 Key 不存在；
- Portal 目标地图不存在；
- 目标出生位置无效；
- 游戏包路径逃逸。

确定性要求：

- Repository 缓存命中与否不改变结果；
- 同一地图产生语义一致的 Map Snapshot；
- 异步完成顺序不改变 Runtime 提交结果；
- 图片读取速度不影响权威状态。

## 19. 已冻结决策

| 问题 | 第一阶段结论 |
|---|---|
| 游戏包来源 | 普通只读目录 |
| 启动加载 | 身份、入口和轻量索引 |
| 全量 Game Snapshot | 不使用 |
| 地图详情 | `MapRepository.load()` 按需加载 |
| 人物详情 | `ActorRepository.load()` 按需加载 |
| 图片主体 | 客户端请求时读取 |
| 内容缓存 | Repository 负责 |
| Runtime I/O | 禁止 |
| 地图切换 | 异步准备、同步原子提交 |
| 存档 | 第一阶段不接入 |
| 单文件包 | 第一阶段不支持 |

## 20. 当前结论

```text
启动
→ 建立 Game Catalog
→ 加载入口地图和玩家人物
→ 初始化 Runtime

运行
→ 地图和人物按需异步加载
→ Repository 负责读取和缓存
→ Session Coordinator 负责协调
→ Runtime Core 负责同步权威状态事务

资源
→ Web Client 按 Key 请求
→ Runtime Service 调用 Resource Repository
```

第一阶段加载架构的重点不是预先读取整个游戏，而是建立稳定的内容访问边界，使 Runtime Core 始终不依赖文件系统和异步 I/O。