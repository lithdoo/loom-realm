# 第一阶段游戏启动与异步内容加载

## 1. 文档目的

本文档定义 LoomRealm 第一阶段如何打开游戏包、建立运行入口，并在运行期间异步加载地图和人物内容。

本文档取代“启动时把整个游戏编译为完整 Game Snapshot”的设计。第一阶段不要求把所有地图、人物或图片资源读入内存。

核心原则是：

> 启动时读取游戏身份、入口和内容索引；当前场景所需的地图与人物异步加载；图片资源由 Web Client 通过 Runtime Service 按需请求。

## 2. 模块定位

游戏加载不是一次性复制整个游戏包，而是创建一个可持续使用的只读内容访问上下文。

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
按需加载当前地图和人物
        ↓
Runtime Core
```

`Game Package Loader` 负责打开游戏包和建立索引。

`Session Coordinator` 负责所有异步 I/O、缓存和场景准备。

`Runtime Core` 只接收已经加载和校验的结构化内容，不读取文件系统，也不直接执行异步加载。

## 3. 不再使用完整 Game Snapshot

第一阶段不定义包含全部地图和全部人物的全量 `Game Snapshot`。

改为以下对象：

```text
Game Package Context
    游戏身份、入口、目录和内容仓储

Map Snapshot
    单张已加载地图的只读运行定义

Actor Definition
    单个人物的只读定义

Runtime State
    当前会话中的可变权威状态
```

这些对象边界如下：

```text
静态游戏内容
├── Game Catalog
├── Map Snapshot
└── Actor Definition

可变会话内容
└── Runtime State
```

静态内容可以从内存缓存中淘汰并重新加载；可变状态不得依赖静态内容对象是否仍在缓存中。

## 4. 第一阶段模块组成

### 4.1 Game Package Source

`Game Package Source` 是对只读游戏目录的最小访问抽象。

```ts
interface GamePackageSource {
  readText(path: string): Promise<string>;
  readBinary(path: string): Promise<Uint8Array>;
  exists(path: string): Promise<boolean>;
  list(path: string): Promise<readonly string[]>;
}
```

第一阶段只实现普通目录后端：

```text
DirectoryGamePackageSource
```

接口只提供加载所需的只读能力，不模拟完整文件系统。

路径解析必须保证：

- 规范路径位于游戏包根目录内；
- 禁止绝对路径；
- 禁止路径穿越；
- 禁止符号链接和目录连接点逃逸；
- 禁止远程 URL。

### 4.2 Game Package Loader

`Game Package Loader` 只负责打开游戏包并建立 `Game Package Context`。

它在启动阶段读取：

- `realm.game.json`；
- 游戏包格式和游戏身份；
- Runtime 版本与 Feature 要求；
- FSDB 根结构和必要 Namespace 元数据；
- 地图 ID 与记录位置索引；
- 人物 ID 与记录位置索引；
- 资源 Key 与物理位置索引。

它不在启动阶段读取：

- 所有地图的 Tile 详情；
- 所有人物完整定义；
- 图片、音频等资源主体；
- 所有 Portal 的完整运行数据；
- 游戏包全部文件的内容摘要。

### 4.3 Game Catalog

`Game Catalog` 是启动时常驻内存的轻量目录。

```ts
interface GameCatalog {
  readonly game: GameIdentity;
  readonly entry: GameEntry;
  readonly maps: ReadonlyMap<string, MapCatalogEntry>;
  readonly actors: ReadonlyMap<string, ActorCatalogEntry>;
  readonly resources: ReadonlyMap<string, ResourceDescriptor>;
}
```

示意结构：

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

目录项只保存定位和轻量元数据，不保存完整地图层、通行网格或图片字节。

### 4.4 Map Repository

`Map Repository` 根据地图 ID 异步加载一张地图。

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

`Map Snapshot` 是单张地图的不可变运行定义，不包含当前玩家位置、当前移动进度或其他存档状态。

### 4.5 Actor Repository

`Actor Repository` 根据人物 ID 异步加载人物定义。

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

启动时只加载当前玩家人物。后续人物在进入包含该人物的地图或实际生成该人物前加载。

### 4.6 Resource Repository

`Resource Repository` 负责根据资源 Key 定位资源，并在 Runtime Service 收到客户端请求后打开资源内容。

```ts
interface ResourceRepository {
  describe(resourceId: string): ResourceDescriptor | undefined;
  open(resourceId: string): Promise<ResourceBody>;
}
```

资源加载链路：

```text
Web Client
→ 请求资源 Key
→ Runtime Service
→ Resource Repository
→ 读取资源主体
→ 返回给 Web Client
```

Game Package Loader 只建立资源目录并做轻量完整性检查，不把资源主体放入启动快照或 Runtime Core。

## 5. 启动游戏的数据加载

命令：

```bash
loom-realm start ./game --save ./game.0.lrsav
```

启动流程分为五个阶段。

### 5.1 打开游戏包

```text
解析 CLI 参数
→ 确认游戏目录存在
→ 创建 DirectoryGamePackageSource
→ 读取 realm.game.json
```

失败时不创建运行会话。

### 5.2 建立轻量目录

```text
读取游戏身份和入口
→ 检查格式与 Feature
→ 读取 FSDB Namespace 元数据
→ 建立地图、人物和资源索引
→ 创建 Game Package Context
```

此阶段不深度读取所有地图和人物。

### 5.3 确定会话入口

没有存档时：

```text
当前地图 = manifest.entry.initialMapId
当前人物 = manifest.entry.playerActorId
当前位置 = 初始地图 defaultSpawn
```

存在存档时：

```text
当前地图 = save.currentMapId
当前人物 = save.playerActorId 或游戏入口人物
当前位置 = save.playerPosition
```

在加载地图详情前，必须先通过目录确认相关 ID 存在。

### 5.4 异步准备启动场景

`Session Coordinator` 并行发起：

```text
Map Repository.load(currentMapId)
Actor Repository.load(playerActorId)
```

两者成功后执行启动场景校验：

- 玩家 Sprite 资源 Key 存在；
- 地图所需结构有效；
- 目标坐标位于地图范围内；
- 目标坐标允许玩家站立；
- 地图引用的必需资源 Key 均存在；
- 存档位置与当前地图兼容。

资源主体仍不在此时读取。

### 5.5 创建运行会话

```text
Game Catalog
+ 当前 Map Snapshot
+ 玩家 Actor Definition
+ 可选 Save Snapshot
        ↓
Runtime Core 初始化
        ↓
Runtime Service 启动
        ↓
Web Client 获取首个完整状态
```

只有启动场景准备完成后，运行会话才进入 `ready` 状态。

## 6. Runtime Core 与异步加载边界

`Runtime Core` 不直接调用 Repository，也不执行文件 I/O。

异步工作由 `Session Coordinator` 完成：

```text
Session Coordinator
├── Game Package Context
├── Map Repository
├── Actor Repository
├── 内容缓存
└── Runtime Core
```

Runtime Core 的操作应保持确定性。它接收已经准备好的内容并执行同步状态事务。

例如地图切换不是：

```text
Runtime Core
→ await fs.readFile(...)
```

而是：

```text
Runtime Core 产生地图切换意图
→ Session Coordinator 异步准备目标场景
→ Runtime Core 原子提交已准备场景
```

## 7. 地图异步加载

地图切换必须使用“准备—提交”两阶段流程。

### 7.1 发现切换

```text
玩家完成合法移动
→ Runtime Core 检测 Portal
→ 生成 MapTransitionRequest
```

请求至少包含：

```ts
interface MapTransitionRequest {
  readonly targetMapId: string;
  readonly targetPosition: GridPosition;
  readonly targetDirection?: Direction;
}
```

### 7.2 准备目标场景

`Session Coordinator` 执行：

```text
加载目标 Map Snapshot
→ 加载目标地图必需人物定义
→ 校验目标位置
→ 建立 PreparedMapTransition
```

准备期间：

- 当前地图继续保持有效；
- Runtime 不接受会导致重复地图切换的输入；
- 客户端可以显示过渡或加载状态；
- 目标资源主体可由客户端根据即将到来的状态按需加载。

### 7.3 原子提交

全部必需内容加载成功后：

```text
PreparedMapTransition
→ Runtime Core 原子提交
→ 更新当前地图和玩家位置
→ 发送新地图完整状态
```

若目标地图加载失败：

- 当前地图和人物状态保持不变；
- 不提交部分切换；
- 会话返回稳定错误；
- 客户端退出加载状态并显示错误。

## 8. 人物异步加载

第一阶段只要求玩家人物，但接口按长期模型设计。

人物加载时机：

```text
启动游戏
→ 加载玩家人物

进入地图
→ 加载该地图运行必需的人物

运行时生成新人物
→ 生成前加载对应 Actor Definition
```

人物定义加载失败时，不得创建对应运行时人物。

人物静态定义与人物会话状态分离：

```text
Actor Definition
    Sprite、布局和静态能力

Runtime Actor State
    地图、坐标、朝向和移动状态
```

静态定义可以缓存或重新加载；运行时人物状态属于 Runtime Core 和存档系统。

## 9. 缓存与并发

第一阶段采用简单的进程内只读缓存。

### 9.1 读取去重

同一内容的并发请求必须共享一个加载任务：

```text
load(map/town)
load(map/town)
        ↓
同一个 Promise<MapSnapshot>
```

避免重复读取和重复解析。

### 9.2 缓存状态

建议内部区分：

```text
not-loaded
loading
ready
failed
```

失败结果不能永久缓存。修复游戏包后重新启动时必须重新读取。

### 9.3 淘汰规则

第一阶段可以采用：

- 当前地图固定保留；
- 正在准备的目标地图固定保留；
- 已加载人物按引用保留；
- 其他内容允许 LRU 淘汰；
- 两张验收地图可以都常驻内存，但这不是规范要求。

第一阶段不要求持久化内容缓存。

## 10. 校验策略

校验分为三层。

### 10.1 启动结构校验

启动时检查：

- 清单格式；
- 游戏身份；
- 入口 ID；
- Runtime Feature；
- FSDB 根结构；
- 地图、人物和资源 Key 唯一性；
- 索引路径安全；
- 当前存档引用的地图和人物 ID 存在。

### 10.2 按需内容校验

加载地图或人物时检查其完整详情和局部引用。

地图错误只在该地图被启动、进入或显式验证时成为运行错误。

### 10.3 全包验证

完整发布检查应由独立流程完成：

```bash
loom-realm validate ./game
```

该命令遍历所有地图、人物和资源定义，执行深度校验，但不创建运行会话。

第一阶段可以先只定义该命令语义，具体实现可在启动闭环完成后补充。

## 11. 加载状态与错误

会话至少具有以下启动状态：

```text
opening-package
indexing-content
loading-save
loading-scene
ready
failed
```

地图切换至少具有：

```text
idle
preparing-map
committing-map
failed
```

错误至少区分：

```text
GAME_PACKAGE_OPEN_FAILED
GAME_MANIFEST_INVALID
GAME_CATALOG_INVALID
MAP_NOT_FOUND
MAP_LOAD_FAILED
MAP_REFERENCE_INVALID
ACTOR_NOT_FOUND
ACTOR_LOAD_FAILED
RESOURCE_NOT_FOUND
SPAWN_INVALID
SAVE_ENTRY_INVALID
```

错误应携带游戏包路径、内容 ID、记录位置和字段路径，但不能把本机物理路径暴露给 Web Client。

## 12. 第一阶段接口建议

```ts
interface GamePackageLoader {
  open(packageRoot: string): Promise<GamePackageContext>;
}

interface GamePackageContext {
  readonly catalog: GameCatalog;
  readonly maps: MapRepository;
  readonly actors: ActorRepository;
  readonly resources: ResourceRepository;
}

interface SessionCoordinator {
  start(input: StartSessionInput): Promise<RuntimeSession>;
  prepareMapTransition(
    request: MapTransitionRequest,
  ): Promise<PreparedMapTransition>;
}
```

接口保持异步，即使验收游戏包很小，以免未来更换存储后端或增加大型地图时修改运行时边界。

## 13. 第一阶段非目标

第一阶段不实现：

- 启动时加载整个游戏；
- 全量常驻 Game Snapshot；
- 图片资源预加载到 Runtime；
- Runtime Core 直接读取 FSDB；
- Runtime Core 直接等待文件 I/O；
- 地图热重载；
- 游戏包文件监听；
- 多线程内容解析；
- 持久化地图缓存；
- 后台下载远程内容；
- ZIP、ASAR 或其他单文件游戏包；
- 自动预测复杂地图访问路径。

## 14. 第一阶段验收

### 14.1 启动验收

- 打开有效游戏包；
- 建立地图、人物和资源目录；
- 不读取非入口地图的完整 Tile 数据；
- 并行加载入口地图和玩家人物；
- 创建 Runtime Session；
- 客户端接收首个完整状态。

### 14.2 地图切换验收

- 玩家进入 Portal；
- 目标地图异步加载；
- 当前地图在准备期间保持有效；
- 目标地图加载成功后原子切换；
- 目标地图加载失败时不改变当前权威状态。

### 14.3 人物加载验收

- 玩家人物在启动场景创建前完成加载；
- 未使用的人物不在启动时读取完整定义；
- 同一人物的并发请求只触发一次实际读取；
- 人物引用错误产生稳定诊断。

### 14.4 资源验收

- 启动时只建立资源目录并核验路径；
- 图片主体不进入 Game Catalog、Map Snapshot 或 Runtime Core；
- Web Client 请求资源后由 Runtime Service 按需读取并返回；
- 不存在的资源 Key 返回稳定错误。

## 15. 当前结论

第一阶段的加载链路是：

```text
启动时
游戏包目录
→ 清单与轻量内容索引
→ 确定存档入口
→ 异步加载当前地图和玩家人物
→ 创建 Runtime Session

运行时
地图切换或人物生成请求
→ Session Coordinator 异步准备内容
→ Runtime Core 原子提交状态变化

资源
Web Client 请求资源 Key
→ Runtime Service 按需读取资源主体
```

LoomRealm 不把整个游戏读入内存。它只常驻运行所需的全局目录和当前场景内容，并通过异步 Repository 逐步加载地图和人物。