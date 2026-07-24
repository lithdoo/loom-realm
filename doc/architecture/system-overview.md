# LoomRealm 总体架构

## 1. 文档目的

本文档是 LoomRealm 项目架构的核心入口。

本文档定义系统定位、核心模块、职责边界和主要运行流程，不展开游戏目录 Schema、存档字段、地图算法、通信消息或 DOM 实现细节。

专题文档必须服从本文档中的模块边界。

## 2. 系统定位

LoomRealm 是一个约定游戏目录结构和存档格式、通过命令行启动、由权威运行时驱动并使用 Web 客户端呈现的 RPG 运行平台。

典型启动方式：

```bash
loom-realm start ./game --save ./game.0.lrsav
```

其中：

- `./game` 是运行期间只读的游戏包目录；
- `./game.0.lrsav` 是独立可写的存档文件；
- LoomRealm 负责打开游戏包、恢复存档、按需加载内容、运行游戏并承载客户端；
- LoomRealm 不提供游戏内容编辑器，也不提供项目创作接口。

## 3. 核心对象

LoomRealm 围绕以下对象运行：

```text
只读游戏包
    +
可写存档
    ↓
运行会话
    ├── 轻量游戏目录
    ├── 当前地图内容
    ├── 当前人物定义
    └── 权威运行状态
```

### 3.1 游戏包

游戏包保存静态游戏定义和资源，包括：

- 游戏清单和格式版本；
- 地图、Tile、Tileset 和人物定义；
- Portal 和其他静态关系；
- 图片资源；
- 可选的构建产物。

游戏运行期间不得修改游戏包。

### 3.2 存档

存档保存可变游戏状态，包括：

- 当前地图；
- 玩家位置和朝向；
- 世界变量和永久变化；
- 游戏时间；
- 后续扩展的队伍、背包和任务状态。

存档必须与对应游戏包进行身份和版本兼容校验。

### 3.3 游戏目录

`Game Catalog` 是启动时建立的轻量内容目录。

它保存：

- 游戏身份和入口；
- 地图 ID 与记录位置；
- 人物 ID 与记录位置；
- 资源 Key 与物理位置；
- Runtime Feature 要求。

它不保存全部地图 Tile、全部人物详情或图片资源主体。

### 3.4 运行会话

运行会话由游戏包和可选存档创建。

运行会话只持有当前运行所需的静态内容和可变权威状态。其他地图和人物由异步内容仓储在需要时加载。

## 4. 架构原则

1. **游戏包只读**：运行过程不把玩家进度、缓存或日志写回游戏目录。
2. **存档独立可写**：可变世界状态只写入独立 `.lrsav`。
3. **启动只加载入口内容**：启动时不把整个游戏读入内存。
4. **地图与人物按需异步加载**：内容 I/O 由 Session Coordinator 和 Repository 负责。
5. **运行时权威**：地图、人物、移动、碰撞和地图切换结果由 Runtime Core 决定。
6. **Runtime Core 不执行 I/O**：Runtime Core 只接收已经加载和校验的结构化内容。
7. **场景切换原子提交**：目标地图准备完成前不改变当前权威状态。
8. **客户端只做投影**：Web Client 发送归一化用户意图，并将客户端可见状态投影为 DOM。
9. **资源主体按需交付**：图片不进入 Runtime Core，由 Runtime Service 按资源 Key 提供给客户端。
10. **协议与部署分离**：同一运行时语义可以通过本机或远程通道承载。
11. **桌面宿主与游戏逻辑分离**：Hostra 管理 Electron 窗口和进程，不参与游戏规则。
12. **不提供创作能力**：游戏目录由外部工具、人或 AI 按 LoomRealm 规范生成和维护。

## 5. 总体结构

```text
loom-realm CLI
        │
        ├── 游戏包目录
        └── 可选存档文件
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
       ├── 确定会话入口
       ├── 异步加载当前地图
       ├── 异步加载当前人物
       └── 管理内容缓存
                ↓
          Runtime Core
                ↓
         Runtime Service
       ├── 状态与事件
       ├── 资源接口
       ├── 保存命令
       └── 健康检查
                ↓
           Web Client
                ↓
        浏览器或 Hostra
```

Pokémon Essentials v21.1 导出、地图转换和 Autotile 处理属于游戏包生产工具链。它们用于生成符合 LoomRealm 规范的游戏包，不属于游戏启动时的编辑能力。

## 6. 核心模块

### 6.1 Game Package Specification

游戏包规范定义 `loom-realm start <directory>` 所接受目录的结构和语义。

它约定：

- 游戏清单文件；
- 格式版本；
- 游戏唯一标识；
- 初始地图和玩家入口；
- FSDB 数据位置；
- 静态资源位置；
- 数据 Key、资源 Key 和引用规则；
- 运行期间只读和路径安全规则。

游戏包规范是 LoomRealm 最主要的公开内容契约。

### 6.2 Game Package Loader

`Game Package Loader` 负责打开游戏目录并建立只读 `Game Package Context`。

启动时读取：

- `realm.game.json`；
- 游戏身份、入口、版本和 Feature；
- FSDB 根结构和必要 Namespace 元数据；
- 地图、人物和资源的轻量索引。

启动时不读取：

- 所有地图的完整 Tile 数据；
- 所有人物完整定义；
- 图片资源主体；
- 整个游戏包的全量内存快照。

### 6.3 Content Repositories

内容仓储提供异步、只读、按 ID 加载能力。

```text
Map Repository
    mapId → Promise<Map Snapshot>

Actor Repository
    actorId → Promise<Actor Definition>

Resource Repository
    resourceId → Descriptor / Resource Body
```

地图和人物加载可以缓存，但缓存行为不得改变游戏语义。

### 6.4 Session Coordinator

`Session Coordinator` 是异步 I/O 与同步 Runtime Core 之间的协调层。

它负责：

- 读取和校验可选存档；
- 确定启动地图、玩家人物和位置；
- 并行加载入口地图和玩家人物；
- 管理地图和人物缓存；
- 准备地图切换；
- 在内容准备完成后请求 Runtime Core 原子提交；
- 将资源读取委托给 Resource Repository；
- 管理启动和加载失败边界。

Session Coordinator 不实现移动、碰撞或 Portal 规则。

### 6.5 Save System

存档系统负责读取、校验和写入 `.lrsav` 文件。

它负责：

- 从存档恢复 `Save Snapshot`；
- 新游戏时创建初始存档状态；
- 校验游戏 ID、存档版本和内容兼容性；
- 从 Runtime Core 获取可持久化状态；
- 原子写入存档；
- 处理损坏、版本不支持和写入失败。

建议语义：

- 存档存在时读取并继续；
- 存档不存在时从游戏初始状态启动，并在保存时创建；
- 未提供 `--save` 时启动临时会话。

### 6.6 Runtime Core

Runtime Core 是游戏规则和权威状态的核心。

启动输入：

```text
Game Identity
+ 当前 Map Snapshot
+ 玩家 Actor Definition
+ 可选 Save Snapshot
```

职责：

- 初始化运行会话；
- 维护当前地图和人物状态；
- 处理方向意图和人物行走；
- 执行碰撞判定；
- 检测 Portal 并产生地图切换请求；
- 原子提交已准备好的地图切换；
- 维护权威状态事务；
- 生成客户端可见状态；
- 生成可持久化存档快照。

Runtime Core 不依赖文件系统、FSDB、DOM、Electron、Hostra、WebSocket 或 HTTP，也不直接等待异步内容加载。

### 6.7 Runtime Service

Runtime Service 将 Runtime Core 暴露给客户端和本地宿主。

它负责：

- 状态同步；
- 用户事件传递；
- 完整状态和增量状态；
- 状态版本与恢复；
- 运行时加载状态和错误通知；
- 图片资源接口；
- Web Client 静态文件；
- 健康检查和服务就绪状态；
- 调用 Save System 执行保存。

Runtime Service 不实现人物移动、碰撞或地图切换规则。

### 6.8 Web Client

Web Client 是环境独立的普通 Web 应用。

它负责：

- 连接 Runtime Service；
- 接收完整状态、增量状态和加载状态；
- 维护客户端状态镜像；
- 将键盘输入归一化为用户意图；
- 按资源 Key 请求图片；
- 解码、缓存并显示图片资源；
- 使用 DOM/CSS 渲染地图和人物；
- 管理动画帧、CSS 插值、加载和调试状态。

Web Client 不读取游戏目录或存档文件，不判断碰撞，也不通过 DOM 反向修改权威状态。

### 6.9 CLI & Session Bootstrap

`loom-realm` CLI 是游戏启动入口。

它负责：

- 解析命令和参数；
- 定位游戏包目录；
- 选择可选存档；
- 调用 Game Package Loader；
- 创建 Session Coordinator；
- 启动 Runtime Service；
- 选择浏览器或桌面宿主；
- 管理启动失败和退出流程。

CLI 只协调模块，不承载游戏规则，也不修改游戏内容。

### 6.10 Hostra Desktop Adapter

Hostra 是可选的 Electron 桌面宿主适配器。

它负责：

- 启动或承载本地 Runtime Service 子进程；
- 管理 BrowserWindow；
- 在 Runtime 就绪后打开 Web Client；
- 管理窗口和子进程生命周期；
- 提供受限制的桌面能力。

Hostra 控制 RPC 与 LoomRealm Runtime RPC 是两套独立通道。Hostra 不保存、代理或修改权威游戏状态。

## 7. 主要运行流程

### 7.1 启动游戏

```text
loom-realm start ./game --save ./game.0.lrsav
→ 打开游戏包和读取清单
→ 建立地图、人物和资源轻量索引
→ 读取可选存档并确定会话入口
→ 并行加载当前地图和玩家人物
→ 校验入口场景和玩家位置
→ 初始化 Runtime Core
→ 启动 Runtime Service
→ 打开 Web Client
→ 同步首个完整状态
```

只有入口场景准备成功后，会话才进入 `ready` 状态。

### 7.2 用户操作

```text
用户输入
→ Web Client 归一化意图
→ Runtime Service 传递事件
→ Runtime Core 处理移动和碰撞
→ 更新权威状态
→ 同步客户端可见状态
→ Web Client 更新 DOM 表现
```

### 7.3 地图切换

地图切换采用准备和提交两个阶段：

```text
人物合法完成一步
→ Runtime Core 检测 Portal
→ 产生 MapTransitionRequest
→ Session Coordinator 异步加载目标地图和人物
→ 校验目标位置
→ 建立 PreparedMapTransition
→ Runtime Core 原子提交地图切换
→ 发送新地图完整状态
```

准备失败时，当前地图和人物权威状态保持不变。

### 7.4 人物加载

```text
启动游戏或进入地图
→ 确定必需人物 ID
→ Actor Repository 异步加载
→ 校验人物定义与资源 Key
→ Runtime Core 创建运行时人物状态
```

未使用的人物不要求在启动时完整读取。

### 7.5 资源加载

```text
客户端状态中的资源 Key
→ Web Client 请求资源
→ Runtime Service 查询 Resource Repository
→ 按需读取图片主体
→ 返回内容与缓存信息
→ Web Client 解码并缓存
```

图片主体不进入 Game Catalog、Map Snapshot 或 Runtime Core。

### 7.6 保存游戏

```text
保存请求或保存时机
→ Runtime Core 生成 Save Snapshot
→ Save System 校验和序列化
→ 原子写入 .lrsav
```

保存过程不修改游戏包。

## 8. 数据与内存边界

### 8.1 启动时常驻数据

- 游戏身份和格式版本；
- Runtime Feature；
- 游戏入口；
- 地图 ID 索引；
- 人物 ID 索引；
- 资源 Key 索引；
- 当前地图；
- 当前玩家人物定义；
- 当前权威运行状态。

### 8.2 按需加载数据

- 非当前地图的 Tile、通行和 Portal 详情；
- 未使用人物的完整定义；
- 当前地图后续需要的人物；
- 图片和其他资源主体。

### 8.3 Runtime 权威状态

- 当前地图 ID；
- 人物稳定位置和朝向；
- 一步移动的起点、终点和时序；
- 碰撞和地图切换结果；
- 当前会话中的可恢复状态。

### 8.4 Web Client 表现状态

- DOM 当前像素位置；
- 人物动画帧；
- CSS 过渡进度；
- 图片加载状态；
- 调试和界面临时状态。

## 9. 校验策略

校验分为三层：

```text
start
→ 清单和全局索引校验
→ 当前入口场景深度校验

运行期间
→ 地图和人物按需深度校验

validate
→ 全游戏包深度校验
```

`loom-realm start` 不要求遍历并加载所有内容。

完整发布验证由独立命令负责：

```bash
loom-realm validate ./game
```

该命令可以在不启动游戏的情况下遍历所有地图、人物和资源定义。

## 10. 部署形态

```text
桌面本地模式
CLI → Hostra → 本地 Runtime Service ← Web Client

浏览器模式
CLI → 本地 Runtime Service ← 浏览器 Web Client

远程模式
远程 Runtime Service ← WebSocket → Web Client
```

不同部署方式共享游戏包规范、异步内容加载语义、存档语义、权威状态原则和资源 Key 模型。

## 11. 第一阶段边界

第一阶段验证：

- `loom-realm start <game-directory>` 启动流程；
- 可选 `--save <save-file>` 的读取、创建和写入闭环；
- 游戏包清单和轻量内容索引；
- 入口地图和玩家人物异步加载；
- 两张 Pokémon Essentials v21.1 语义的测试地图；
- 三层 Tile、普通 Tile、静态 Autotile、通行和 Priority；
- 一个玩家人物的四方向格子行走；
- 静态碰撞；
- 双向 Portal；
- 目标地图异步准备和原子切换；
- Runtime 权威状态和客户端同步；
- 图片资源按需请求；
- DOM/CSS 地图与人物渲染；
- 浏览器运行和 Hostra 桌面运行。

第一阶段不包含：

- 启动时加载整个游戏；
- 全量常驻 Game Snapshot；
- 游戏内容编辑器；
- 项目创作或修改 API；
- NPC 和通用事件系统；
- 战斗和完整 Pokémon 业务逻辑；
- 插件系统；
- 多人同步；
- ZIP、ASAR 或其他单文件游戏包；
- 复杂存档迁移和跨版本兼容。

## 12. 配套工具边界

Pokémon Essentials 导出器、地图转换器和其他内容生产工具可以存在，但它们是配套工具，不是 LoomRealm 的编辑能力。

```text
外部内容生产工具
→ LoomRealm 游戏包
→ loom-realm start
```

Runtime Core、Runtime Service 和 Web Client 不依赖某个特定内容生产工具。

## 13. 当前文档关系

```text
总体架构
├── 第一阶段游戏包规范
├── 第一阶段游戏启动与异步内容加载
├── 存档格式与持久化
├── CLI 与会话启动
├── 运行时通信与状态同步
├── Hostra 桌面客户端宿主
├── Pokémon Essentials 地图兼容运行时
├── 人物行走与碰撞运行时
├── DOM 渲染与渲染状态
└── 第一阶段路线图与设计待办
```

总体架构定义模块和边界。专题文档负责目录格式、异步加载、Schema、算法、协议和验收细节。

## 14. 当前架构缺口

当前最重要的缺口是：

1. **存档规范**：`.lrsav` 的身份、版本、数据范围、原子写入和兼容校验尚未设计。
2. **CLI 规范**：`start`、`validate`、默认值、退出码、日志和宿主选择尚未形成正式契约。
3. **Game Catalog Schema**：地图、人物和资源轻量索引的正式结构尚未冻结。
4. **Map Snapshot Schema**：单张已加载地图交给 Runtime Core 的结构尚未冻结。
5. **Actor Definition Schema**：人物静态定义和运行时状态边界尚未冻结。
6. **加载状态协议**：启动、地图准备和失败状态如何同步给客户端尚未定义。
7. **资源生命周期**：资源 Key、内容版本、缓存失效和响应 Header 尚未完整定义。
8. **错误与诊断**：游戏包、内容加载、存档、运行时和客户端错误尚未统一分类。
9. **测试基准**：异步加载、并发去重、失败回滚和端到端启动测试尚未形成完整夹具。
10. **安全模型**：不可信游戏包、路径穿越、资源访问和 Hostra Origin 限制仍需统一设计。

## 15. 当前结论

LoomRealm 的核心链路是：

```text
只读游戏包
→ 启动时建立轻量目录
→ 异步加载当前地图和人物
→ 创建权威运行会话
→ 运行期间按需加载后续内容
→ Web Client 按资源 Key 请求资源
```

游戏包描述游戏是什么，存档描述游戏已经发生了什么。LoomRealm 不把整个游戏读入内存，而是只加载当前会话所需内容，并在异步内容准备成功后原子提交运行状态变化。