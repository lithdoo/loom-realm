# LoomRealm 总体架构

## 1. 文档目的

本文档是 LoomRealm 项目架构的核心入口。

本文档定义系统定位、核心模块、职责边界和主要运行流程，不展开游戏目录 Schema、地图算法、Client Node 业务 Schema、资源协议字段或 DOM 实现细节。

专题文档必须服从本文档中的模块边界。

## 2. 系统定位

LoomRealm 是一个约定游戏目录结构、通过命令行启动、由权威运行时驱动并使用 Web 客户端呈现的 RPG 运行平台。

第一阶段启动方式：

```bash
loom-realm start ./game
```

其中：

- `./game` 是运行期间只读的游戏包目录；
- LoomRealm 打开游戏包、建立内容索引、加载入口场景并运行游戏；
- 地图和人物内容按需异步加载；
- Runtime Core 维护权威游戏状态；
- Runtime Execution Loop 串行驱动命令、Tick 和控制操作；
- Session Coordinator 协调异步内容准备；
- Client State Projector 将 Runtime/Session 快照投影为通用 Scoped State Tree；
- Web Client 通过已注册的自定义节点完成 DOM 渲染；
- 图片资源由 Web Client 通过 Runtime Service 按 Key 请求；
- LoomRealm 不提供游戏内容编辑器或项目创作接口；
- 存档系统保留为后续模块，不进入第一阶段运行闭环。

## 3. 核心对象

### 3.1 游戏包

游戏包保存静态游戏定义和资源：

- 游戏清单和格式版本；
- 地图、Tile、Tileset 和人物定义；
- Portal 和其他静态关系；
- 图片资源；
- 内容索引所需的 FSDB 元数据。

游戏运行期间不得修改游戏包。

### 3.2 Game Package Context

```text
Game Package Context
├── Game Catalog
├── Map Repository
├── Actor Repository
└── Resource Repository
```

它是打开游戏包后建立的只读内容访问上下文，不会把整个游戏复制到内存中。

### 3.3 Game Catalog

Game Catalog 是启动时常驻内存的轻量内容目录，保存：

- 游戏身份和入口；
- 地图 ID 与记录位置；
- 人物 ID 与记录位置；
- 资源 Key 与物理位置；
- Runtime Feature 要求。

它不保存所有地图 Tile、人物详情或图片资源主体。

### 3.4 Runtime State

Runtime State 是 Runtime Core 持有的权威可变状态，第一阶段至少包含：

- 当前地图和场景人物；
- 玩家位置和朝向；
- 当前移动状态；
- 逻辑时间；
- Runtime Lifecycle；
- 权威 Runtime Revision；
- 统一暂停状态。

Runtime State 不是客户端协议对象，也不能直接序列化给 Web Client。

### 3.5 Session State

Session State 是 Session Coordinator 的会话控制状态：

```text
starting
running
loading
failed
closed
```

Session State 与 Runtime State 分离。`loading` 表示会话正在准备异步内容，不是新的游戏业务状态。

Session Coordinator 提供带独立 Revision 的 Session Snapshot。

### 3.6 Client State

Client State 是由 Runtime Snapshot 和 Session Snapshot 投影得到的客户端目标状态：

```text
Client State
└── Scopes
    └── Scope
        └── Roots[]
            └── Node
                ├── key
                ├── tag
                ├── data
                └── children[]
```

Client State 只描述客户端应该呈现什么，不拥有游戏规则权威性。

### 3.7 Runtime Transaction

Runtime Execution Loop 为每次 Core 操作产生 Runtime Transaction。

必须区分：

```text
RuntimeTransaction.id
RuntimeState.revision
SessionSnapshot.revision
ClientState.revision
ClientScope.revision
Runtime RPC sequence
```

它们分别表示执行顺序、权威状态版本、会话版本、客户端状态版本、Scope 版本和通信消息顺序，不得混用。

## 4. 架构原则

1. **游戏包只读**：运行过程不把状态、缓存或日志写回游戏目录。
2. **启动只加载入口内容**：启动时不把整个游戏读入内存。
3. **地图和人物按需加载**：静态内容通过异步 Repository 按 ID 读取。
4. **Repository 负责缓存**：缓存策略不进入 Coordinator、Loop 或 Core。
5. **Core 不执行 I/O**：Runtime Core 只接收已加载和校验的结构化内容。
6. **Core 单一写入口**：所有 Core 命令、Tick 和控制操作只通过 Runtime Execution Loop 执行。
7. **严格串行**：Runtime Execution Loop 防止 Core 并发和重入。
8. **运行时权威**：移动、碰撞、Portal 和地图切换结果由 Runtime Core 决定。
9. **异步准备、同步提交**：目标场景准备完成前不改变当前权威状态。
10. **统一暂停**：手动暂停、过场暂停和加载暂停共享相同冻结语义。
11. **Runtime 与 Client State 分离**：Runtime 内部对象不得直接序列化给客户端。
12. **投影层独立**：Client State Projector 在 Core 事务外读取不可变快照。
13. **投影原子提交**：投影失败不发布部分 Client State，也不回滚 Core 状态。
14. **通用客户端树**：业务通过 Scope、Tag 和 Data Schema 扩展，不固定 RPG Client DTO。
15. **一个节点对应一个 DOM Element**：Key 决定身份，Tag 决定实现，Data 决定节点数据，Children 决定直接子节点。
16. **多 Scope 原子性**：多个 Scope 同时变化时发布完整 Snapshot。
17. **事件与状态分离**：状态 Frame 可以合并，一次性 Runtime Event 不得丢失。
18. **资源主体按需交付**：图片不进入 Runtime Core 或 Client State 主体。
19. **协议与部署分离**：相同 Runtime RPC 语义可以通过本机或远程通道承载。
20. **桌面宿主与游戏逻辑分离**：Hostra 管理窗口和进程，不参与游戏规则。
21. **不提供创作能力**：游戏目录由外部工具、人或 AI 按规范生成和维护。

## 5. 总体结构

```text
loom-realm CLI
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
├── Session State / Revision / Snapshot
├── 准备入口场景
├── 协调异步地图与人物加载
└── 处理 Runtime Effect
        ↓ control operations
Runtime Execution Loop
├── Control Queue
├── Command Queue
├── Monotonic Clock
├── Fixed Tick Scheduler
├── Effect Barrier
└── Runtime Transaction Publisher
        ↓ serialized synchronous calls
Runtime Core
├── 权威 Runtime State
├── 移动与碰撞
├── Portal 检测
└── 统一暂停
        ↓ RuntimeSnapshot
Projection Scheduler
├── 合并连续状态请求
└── 保留最新 Projection Frame
        ↓
Client State Projector
├── Scope Projector Registry
├── Tree Validation
├── Structural Equality
├── Client State Revision
└── Scope Revision
        ↓ Projection Commit
Runtime Service
├── 命令与节点事件入口
├── state.snapshot / scope.replace
├── Runtime Event
├── 资源接口
└── 健康检查
        ↓
Web Client
├── Client Store
├── Scope Tree Reconciler
├── Custom Node Registry
├── Resource Cache
└── DOM / CSS 渲染
        ↓
浏览器或 Hostra
```

Pokémon Essentials v21.1 导出、地图转换和 Autotile 处理属于游戏包生产工具链，不属于游戏运行时或编辑能力。

## 6. 核心模块

### 6.1 Game Package Specification

定义 `loom-realm start <directory>` 接受的只读目录结构和语义：

- `realm.game.json`；
- 格式版本；
- 游戏唯一标识；
- 初始地图和玩家人物；
- FSDB 数据位置；
- 静态资源位置；
- 数据 Key、资源 Key 和引用规则；
- 路径安全规则。

### 6.2 Game Package Loader

启动时读取：

- 游戏清单；
- 游戏身份、入口、版本和 Feature；
- FSDB 根结构；
- 地图、人物和资源的轻量索引。

启动时不读取：

- 所有地图完整数据；
- 所有人物完整定义；
- 图片资源主体；
- 全游戏内存快照。

### 6.3 Content Repositories

```text
Map Repository
    mapId → Promise<Map Snapshot>

Actor Repository
    actorId → Promise<Actor Definition>

Resource Repository
    resourceId → Descriptor / Resource Body
```

Repository 负责异步读取、解析、局部校验、同 ID 并发去重和进程内缓存。

### 6.4 Session Coordinator

负责：

- 准备入口地图和人物；
- 维护 Session State、Revision 和 Snapshot；
- 通过 Execution Loop 初始化 Core；
- 接收 Pending Runtime Effect；
- 在第一次 await 前进入 `loading`；
- 异步准备目标场景；
- 通过 Loop 提交地图切换；
- 请求 Session Change 和 Map Commit Projection；
- 处理加载失败和关闭。

不负责：

- 游戏规则；
- Tick 调度；
- 直接调用 Core；
- Client State 生成；
- Repository 缓存；
- 资源主体；
- 网络和 DOM。

### 6.5 Runtime Execution Loop

Runtime Execution Loop 是 Runtime Core 的唯一写入口。

负责：

- 串行执行 Command、Tick 和 Control Operation；
- 固定步长 Tick；
- 单调时钟和 Accumulator；
- 控制/命令队列；
- 普通命令容量限制；
- Effect Barrier；
- Runtime Transaction；
- Snapshot 边界读取；
- 启动、关闭和故障生命周期。

Runtime Service 和 Session Coordinator 不能持有可写 Core 引用。

### 6.6 Runtime Core

Runtime Core 是同步、确定性的游戏规则和权威状态核心。

负责：

- 初始化 Runtime State；
- 维护当前地图和人物状态；
- 处理方向意图和人物移动；
- 执行碰撞判定；
- 检测 Portal 并产生 MapTransitionEffect；
- 原子提交 PreparedMapTransition；
- 维护 Runtime Revision；
- 统一暂停和恢复；
- 提供不可变 Runtime Snapshot。

不依赖文件系统、FSDB、Promise、DOM、Electron、Hostra、WebSocket、HTTP 或 Client Node Tag。

### 6.7 Projection Scheduler

Projection Scheduler 位于 Runtime Transaction 和 Client State Projector 之间。

负责：

- 在 Core 事务回调栈外执行投影；
- 合并连续普通 Tick 的状态 Frame；
- 保留最新 Runtime/Session Snapshot；
- 合并 `forceSnapshot` 标记；
- 不合并或丢弃 Runtime Event。

### 6.8 Client State Projector

读取：

```text
Runtime Snapshot
+ Session Snapshot
+ Runtime Transaction ID
+ Projection Cause
```

负责：

- 按功能注册 Scope Projector；
- 为 Scope 生成有序 Roots；
- 验证 Key、Tag、Data 和 Children；
- 比较新旧 Scope 内容；
- 维护 Client State Revision 和 Scope Revision；
- 原子提交完整 Client State；
- 返回 unchanged、snapshot 或 scope-replace。

发布选择：

```text
0 个 Scope 变化 → unchanged
1 个 Scope 变化 → scope.replace
2 个以上变化 → state.snapshot
地图切换提交 → state.snapshot
```

Projector 不修改 Runtime、不读取资源主体、不执行 DOM 或网络操作。

### 6.9 Runtime Service

Runtime Service 负责：

- 接收用户命令和节点事件；
- 检查 Session 状态；
- 通过 Execution Loop 提交命令；
- 发布 Runtime Event；
- 消费 Projection Commit；
- 发布 `state.snapshot` 和 `scope.replace`；
- 按资源 Key 调用 Resource Repository；
- 提供 Web Client 静态文件和健康检查。

Runtime Service 不直接调用 Core，不自行生成 Client State，也不实现人物移动、碰撞、Portal 或 DOM 节点行为。

### 6.10 Web Client

负责：

- 连接 Runtime Service；
- 接收 Snapshot、Scope Replace、Event 和 Error；
- 维护独立于 DOM 的 Client Store；
- 验证 Sequence、State Revision 和 Scope Revision；
- 按 Scope 挂载 Roots；
- 按稳定 Key 复用 DOM Element；
- 按 Tag 解析已注册自定义节点；
- 将输入归一化为用户意图；
- 按资源 Key 请求、解码和缓存图片；
- 管理非权威动画和临时视觉状态。

Web Client 不读取游戏目录，不判断碰撞，也不通过 DOM 反向修改权威状态。

### 6.11 CLI & Session Bootstrap

负责：

- 解析 `start` 命令；
- 定位游戏包目录；
- 调用 Game Package Loader；
- 创建 Runtime Core；
- 创建 Runtime Execution Loop；
- 创建 Projection Scheduler 和 Client State Projector；
- 创建 Session Coordinator；
- 启动 Runtime Service；
- 选择浏览器或 Hostra；
- 管理启动失败和退出流程。

### 6.12 Hostra Desktop Adapter

Hostra 是可选 Electron 桌面宿主，负责窗口、Runtime Service 进程和桌面生命周期。

Hostra Control RPC 与 LoomRealm Runtime RPC 是独立通道。Hostra 不参与游戏规则、权威状态或 Client State 生成。

### 6.13 Save System

Save System 是后续模块，不进入第一阶段设计和实现闭环。

仅保留边界：

- 存档位于游戏包外部；
- 存档保存可变会话状态；
- 存档不复制静态地图、人物或资源定义；
- Runtime Core 未来可以提供稳定持久化快照。

## 7. 主要运行流程

### 7.1 启动游戏

```text
loom-realm start ./game
→ 打开并校验游戏包
→ 建立 Game Catalog 和 Repository
→ 创建 Core / Execution Loop / Projector / Coordinator
→ 并行加载入口地图与人物
→ 校验出生位置
→ executionLoop.start(initialization)
→ Session running
→ Client State Projector 首次投影
→ Runtime Service ready
→ 打开 Web Client
→ 发布 state.snapshot
```

初始投影成功前 Runtime Service 不进入 ready。

### 7.2 用户操作

```text
用户输入
→ Web Client 归一化命令
→ Runtime Service 检查 Session
→ executionLoop.submitCommand(command)
→ Runtime Core 同步事务
→ RuntimeTransaction + RuntimeSnapshot
→ Projection Scheduler
→ Client State Projector
→ unchanged / scope.replace / state.snapshot
→ Runtime Service 发布
→ Client Store 更新
→ Web Client 协调 DOM
```

Runtime Event 使用独立通道发布。

### 7.3 地图切换

```text
人物完成一步
→ Core 检测 Portal
→ MapTransitionEffect
→ Loop 建立 Effect Barrier
→ Session loading
→ 投影 Loading Scope
→ loop.pause()
→ Repository 准备目标场景
→ loop.commitMapTransition(prepared)
→ 强制完整 Client State Snapshot
→ loop.completeEffect(effectId)
→ Session running
→ 更新/删除 Loading Scope
→ loop.resume()
```

目标内容准备失败且 Core 尚未提交时，当前 Scene 保持完整有效。

### 7.4 Client State 同步

首次连接、恢复、多 Scope 变化和地图提交：

```text
ProjectionSnapshot
→ state.snapshot
→ Client Store 全量替换
→ 按 Scope 和 Key 协调 DOM
```

单 Scope 变化：

```text
ProjectionScopeReplace
→ scope.replace
→ Client Store 替换单 Scope
→ 复用稳定 Key 对应 Element
```

第一阶段不实现节点级 Patch 或多 Scope Batch Patch。

### 7.5 资源加载

```text
Client Node Data 中的资源 Key
→ Web Client 请求资源
→ Runtime Service
→ Resource Repository.open(resourceId)
→ 返回资源主体
→ Web Client 解码、缓存和显示
```

资源读取速度不控制 Runtime 是否运行。

## 8. 数据边界

### 8.1 Game Catalog

- 游戏身份和入口；
- 地图、人物和资源索引；
- Runtime Feature。

### 8.2 Runtime Scene Content

- 当前 Map Snapshot；
- Actor Definitions；
- 通行和 Portal 定义；
- 逻辑资源 Key。

### 8.3 Runtime Snapshot

- Runtime Lifecycle；
- Runtime Revision；
- 逻辑时间；
- 暂停状态；
- 当前 Runtime Scene；
- 可选 Runtime Failure。

不包含 Scope、Tag 或 DOM 信息。

### 8.4 Session Snapshot

- Session State；
- Session Revision；
- 可选 Session Error。

不包含加载 Promise、Repository 或 Client State。

### 8.5 Client State Tree

- Client State Version 和 Revision；
- Scope 名称和 Revision；
- 有序 Roots；
- Node Key、Tag、Data 和 Children；
- 逻辑资源 Key。

不包含 Runtime 类实例、碰撞索引、FSDB 物理位置、文件路径、DOM 引用或可执行代码。

### 8.6 Web Client 本地状态

- DOM Element 引用；
- 动画帧和 CSS 过渡；
- 图片加载和浏览器缓存状态；
- 输入设备瞬时状态；
- 不影响游戏规则的调试和界面状态。

## 9. 第一阶段边界

第一阶段验证：

- `loom-realm start <game-directory>`；
- 只读游戏包目录；
- 轻量 Game Catalog；
- 地图和人物异步 Repository；
- Runtime Execution Loop 固定 Tick；
- 一个玩家人物四方向格子行走；
- 静态碰撞和双向 Portal；
- 统一暂停；
- 地图切换异步准备和原子提交；
- Runtime/Session Snapshot；
- Client State Projector；
- Client Scoped State Tree；
- `state.snapshot` 和 `scope.replace`；
- Scope 多根 `roots[]`；
- 稳定 Key 和注册 Tag；
- Web Client 按 Key 请求资源；
- 自定义节点 DOM/CSS 渲染；
- 浏览器和 Hostra 桌面运行。

第一阶段不包含：

- Save System；
- ZIP、ASAR 或单文件游戏包；
- 游戏内容编辑器；
- 项目创作或修改 API；
- 后台预取和加载取消；
- 多会话和多人同步；
- NPC 和通用事件系统；
- 战斗和完整 Pokémon 业务逻辑；
- 节点级状态 Patch；
- 多 Scope Batch Patch；
- 固定地图、人物、HUD 或菜单 Client DTO；
- Server 下发任意 HTML、CSS 或 JavaScript；
- 插件系统。

## 10. 文档关系

```text
总体架构
├── 游戏包规范
├── 游戏启动与异步内容加载
├── Session Coordinator
├── Runtime Execution Loop
├── Runtime Core
├── Client State Projector
├── Client Scoped State Tree 协议
├── Runtime RPC 与状态同步
├── Hostra 桌面宿主
├── 地图与人物运行时专题
├── DOM 渲染专题
└── 路线图与设计待办
```

## 11. 当前主要设计缺口

已完成核心边界：

- Game Package Specification；
- Game Loading 与 Repository；
- Session Coordinator；
- Runtime Execution Loop；
- Runtime Core；
- Client Scoped State Tree；
- Client State Projector；
- Runtime RPC 总体同步语义。

仍需继续设计：

1. **第一阶段 Scope/Tag/Data Registry**：具体业务节点和 Schema；
2. **Runtime Service 精确 RPC 契约**：方法名、请求响应和连接生命周期；
3. **Client Store 与 Scope Tree Reconciler**；
4. **Custom Node Runtime 与 Input Controller**；
5. **资源接口**：MIME、缓存、版本和错误；
6. **CLI 契约与 Hostra Bootstrap**；
7. **统一错误和安全模型**；
8. **测试夹具、Golden Data 和端到端测试**；
9. **内容生产工具链**：Exporter、Autotile、Passage/Priority Compiler；
10. **Save System**：已明确暂缓。

## 12. 当前结论

```text
只读游戏包
→ Game Catalog + Repositories
→ Session Coordinator
→ Runtime Execution Loop
→ Runtime Core
→ RuntimeSnapshot + SessionSnapshot
→ Projection Scheduler
→ Client State Projector
→ Runtime Service
→ Web Client
```

Repository 负责读取和缓存；Session Coordinator 负责异步会话协调；Execution Loop 负责串行调度；Runtime Core 负责权威游戏规则；Client State Projector 负责原子生成通用 Scope Tree；Runtime Service 只负责协议、事件和资源；Web Client 负责状态镜像和呈现。