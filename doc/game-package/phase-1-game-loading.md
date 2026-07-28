# 第一阶段游戏启动与异步内容加载

> 状态：**Active Design**  
> 适用范围：游戏包公共入口加载与内置 `loom.map` 子系统内容加载  
> 最近复核：2026-07-28  
> 主要定义：游戏包打开、入口文件、Game Catalog、Repository 和地图内容准备

相关文档：

- [`../contracts/game-package-v1.md`](../contracts/game-package-v1.md)：游戏包和 `realm.entry.json`；
- [`../architecture/main-system-and-subsystems.md`](../architecture/main-system-and-subsystems.md)：程序主系统启动初始子系统；
- [`../runtime/phase-1-session-coordinator.md`](../runtime/phase-1-session-coordinator.md)：地图子系统异步协调；
- [`../runtime/phase-1-pokemon-essentials-map-runtime.md`](../runtime/phase-1-pokemon-essentials-map-runtime.md)：地图数据 Profile。

核心原则：

> 程序主系统只读取游戏包公共清单和入口文件，并启动指定子系统；具体业务内容由目标子系统按需加载。第一阶段 `loom.map` 子系统使用轻量 Game Catalog 和异步 Repository 加载地图与人物。

## 1. 两阶段加载

### 1.1 程序主系统公共加载

```text
游戏目录
→ realm.game.json
→ realm.entry.json
→ 路径和版本校验
→ 检查初始 system 可解析
→ 创建 Game Package Context
→ 启动初始子系统
```

主系统不根据入口参数猜测地图、人物或其他业务内容。

### 1.2 目标子系统业务加载

```text
system.initialize(frameId, input)
→ 目标子系统验证 input Schema
→ 子系统打开所需 Catalog / Repository
→ 按需加载启动内容
→ 子系统生成首次 Client State
→ system.ready
```

第一阶段目标子系统是 `loom.map`。

## 2. Game Package Context

```ts
interface GamePackageContext {
  readonly root: SafePackageRoot;
  readonly manifest: GameManifest;
  readonly entry: GameEntry;
  readonly catalog: GameCatalog;
}
```

它由程序主系统建立，并以只读能力交给内置子系统或受控内容服务。

Game Package Context 不包含：

- 子系统调用栈；
- 子系统内部 Runtime State；
- 全部地图和资源主体；
- 可写文件系统能力；
- 任意脚本执行能力。

## 3. 公共启动校验

程序主系统执行：

- 游戏目录存在且可读；
- `realm.game.json` 是有效 UTF-8 JSON；
- `format` 和 `formatVersion` 受支持；
- `entry` 路径安全；
- `realm.entry.json` 公共结构有效；
- 初始 `system` 存在于本地 System Registry；
- `requires.loomRealm`、`requires.systems` 和 `requires.features` 满足；
- 游戏包不存在路径逃逸和链接逃逸。

公共校验不解释 `params` 的业务字段。

## 4. Game Catalog

第一阶段 Game Catalog 是启动时常驻内存的轻量目录：

```ts
interface GameCatalog {
  readonly game: {
    readonly id: string;
    readonly title: string;
    readonly version: string;
  };

  readonly maps: ReadonlyMap<string, ContentLocation>;
  readonly actors: ReadonlyMap<string, ContentLocation>;
  readonly resources: ReadonlyMap<string, ResourceDescriptor>;
}
```

Catalog 保存：

- 游戏身份；
- 地图、人物和资源 Key；
- 记录或资源的安全包内位置；
- 必要的类型和内容版本元数据。

Catalog 不保存：

- 所有地图 Tile；
- 所有人物详情；
- 图片字节；
- 当前会话状态；
- Client Scope。

虽然第一阶段 Catalog 主要服务地图子系统，它仍属于只读游戏包访问上下文，不是地图 Runtime Core 的一部分。

## 5. Catalog 建立

```text
打开 data/[FSDB]project
→ 扫描必要 Namespace 和轻量元数据
→ 建立 mapId / actorId / resourceId 索引
→ 校验 ID 唯一和物理路径安全
→ 不解析全部记录主体
→ 不读取图片字节
```

建立 Catalog 时必须拒绝：

- 重复 ID；
- 无法解释的物理位置；
- 路径逃逸；
- 必需 Namespace 缺失；
- 资源描述指向游戏包外部。

## 6. Repository

```text
Map Repository
    mapId → Promise<MapSnapshot>

Actor Repository
    actorId → Promise<ActorDefinition>

Resource Repository
    resourceId → Descriptor / Resource Body
```

Repository 负责：

- 通过 Catalog 定位内容；
- 异步读取和解析；
- 局部 Schema 校验；
- 同 ID 并发请求去重；
- 进程内缓存；
- 返回不可变结构。

Repository 不负责：

- 程序主系统调用栈；
- 地图业务状态；
- Runtime Tick；
- Client State 投影；
- DOM；
- 修改游戏包。

## 7. 地图子系统初始化

入口文件示例：

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

地图子系统初始化：

```text
验证 MapEntryParams
→ 并行 MapRepository.open(mapId)
  和 ActorRepository.open(playerActorId)
→ 加载地图直接引用的 Tileset、Tile Property 和人物
→ 校验 defaultSpawn
→ 构造 PreparedMapInitialization
→ 通过 Execution Loop 初始化 Map Runtime Core
→ 首次 Frame Client State 投影
→ system.ready
```

地图内容准备未完成前，Frame 处于 starting，不接收普通用户输入。

## 8. 地图深度校验

当前地图至少检查：

- 地图尺寸和三个 Tile 层；
- 每行 Tile 数据完整；
- Tileset 和 Tile ID 可解释；
- 通行和 Priority 数据可用；
- Portal 局部引用有效；
- 人物定义和 Sprite 资源 Key 有效；
- 出生位置在范围内并允许站立。

未访问地图的局部错误可以延迟到首次加载报告，但 `loom-realm validate` 应提前发现。

## 9. 后续地图按需加载

```text
Map Runtime Core 产生 MapTransitionEffect
→ Map Session Coordinator
→ MapRepository.open(targetMapId)
→ ActorRepository 按需加载场景人物
→ 校验目标 Portal 和 Spawn
→ PreparedMapTransition
→ Core 原子提交
```

Repository 缓存同 ID 内容，不把加载策略泄露给 Core。

## 10. 并发请求去重

同一 Repository 对相同 ID 的并发请求共享一次底层读取：

```text
open(map/A)
open(map/A)
open(map/A)
→ 一个读取 Promise
→ 多个调用者收到同一不可变结果
```

失败结果不应永久缓存。后续请求可以重试，除非错误明确是稳定内容错误并采用显式负缓存策略。

## 11. 缓存

第一阶段最小策略：

- Catalog 常驻；
- 已加载地图和人物在地图子系统进程内缓存；
- 同 ID 返回语义等价的不可变对象；
- 不要求 LRU；
- 不写持久化缓存；
- 子系统关闭时缓存释放。

缓存属于 Repository，不属于 Coordinator、Execution Loop 或 Core。

## 12. 资源读取

Client State 只携带逻辑资源 Key。

资源主体可以由平台资源服务或地图子系统授权资源接口提供：

```text
Renderer 请求 resourceKey
→ 验证当前游戏包和权限
→ Resource Repository.open(resourceKey)
→ 返回 MIME、内容版本和字节
→ Renderer 解码和缓存
```

资源字节不进入 Map Runtime Core 或 Scope Tree。

## 13. 其他模块子系统

未来其他子系统可以：

- 只使用调用参数，不访问游戏包；
- 使用 Game Package Context 的受限只读能力；
- 定义自己的 FSDB Namespace 和 Repository；
- 使用外部只读静态数据服务。

程序主系统不要求所有子系统使用 Game Catalog，也不把地图 Repository 作为公共子系统接口。

## 14. 错误分类

```text
PACKAGE_ERROR
    游戏清单、入口、路径或版本错误

SYSTEM_RESOLUTION_ERROR
    初始 system 不存在或不兼容

ENTRY_INPUT_ERROR
    目标子系统拒绝 params

CONTENT_INDEX_ERROR
    Catalog 建立失败

CONTENT_LOAD_ERROR
    地图、人物或资源读取失败

CONTENT_VALIDATION_ERROR
    已读取内容不满足 Schema 或引用规则
```

错误至少包含稳定代码、文件和字段路径、系统或内容 ID、人类可读说明和可选修复建议。

## 15. 安全边界

- 只读取游戏包内部规范化路径；
- 拒绝符号链接和连接点逃逸；
- 拒绝 URL 和绝对路径；
- 游戏包不携带第一阶段可执行子系统；
- Repository 返回逻辑 ID，不向 Renderer 暴露物理路径；
- 解析限制文件大小、记录数和递归深度；
- 所有内容视为不可信输入。

## 16. `validate`

全包验证应：

- 校验游戏清单和入口文件；
- 检查初始系统可用；
- 调用相应子系统参数校验器；
- 遍历地图、人物和资源强引用；
- 检查所有 Portal 目标；
- 检查 Autotile 编译输入和产物；
- 报告所有可发现错误，而不是遇到首个错误立即结束。

`validate` 不启动正式子系统调用栈，不产生会话状态。

## 17. 测试

至少覆盖：

- 游戏清单和入口文件成功读取；
- 不支持 system；
- 入口参数错误；
- 路径穿越和符号链接；
- Catalog 不读取图片主体；
- 同 ID 并发去重；
- 入口地图和人物并行加载；
- 未访问地图延迟加载；
- 加载失败不污染缓存；
- `validate` 全包检查；
- 程序主系统不解释地图参数。

## 18. 当前结论

```text
程序主系统
→ 读取公共游戏清单和入口
→ 启动目标子系统

地图子系统
→ 使用 Catalog 和 Repository 按需读取地图内容
→ 将 Prepared Content 同步交给内部 Runtime Core
```

公共 Loader 解决“启动哪个子系统”，地图内容 Loader 解决“地图子系统需要读取什么”，两者职责分离。