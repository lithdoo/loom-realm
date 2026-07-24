# LoomRealm 总体架构

## 1. 文档目的

本文档是 LoomRealm 项目架构的核心入口。

本文档定义系统定位、核心模块、职责边界和主要运行流程，不展开游戏目录 Schema、地图算法、通信字段或 DOM 实现细节。

专题文档必须服从本文档中的模块边界。

## 2. 系统定位

LoomRealm 是一个约定游戏目录结构、通过命令行启动、由权威运行时驱动并使用 Web 客户端呈现的 RPG 运行平台。

第一阶段启动方式：

```bash
loom-realm start ./game
```

其中：

- `./game` 是运行期间只读的游戏包目录；
- LoomRealm 负责打开游戏包、建立内容索引、加载入口场景并运行游戏；
- 地图和人物内容按需异步加载；
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

Game Package Context 是打开游戏包后建立的只读内容访问上下文：

```text
Game Package Context
├── Game Catalog
├── Map Repository
├── Actor Repository
└── Resource Repository
```

它不会把整个游戏复制到内存中。

### 3.3 Game Catalog

Game Catalog 是启动时常驻内存的轻量内容目录。

它保存：

- 游戏身份和入口；
- 地图 ID 与记录位置；
- 人物 ID 与记录位置；
- 资源 Key 与物理位置；
- Runtime Feature 要求。

它不保存所有地图 Tile、所有人物详情或图片资源主体。

### 3.4 运行会话

运行会话只持有当前运行所需的静态内容和可变权威状态。

其他地图和人物由异步 Repository 在需要时加载。Session Coordinator 负责把异步内容准备结果交给同步 Runtime Core。

## 4. 架构原则

1. **游戏包只读**：运行过程不把状态、缓存或日志写回游戏目录。
2. **启动只加载入口内容**：启动时不把整个游戏读入内存。
3. **地图和人物按需加载**：静态内容通过异步 Repository 按 ID 读取。
4. **Repository 负责内容缓存**：缓存策略不进入 Session Coordinator 和 Runtime Core。
5. **Runtime Core 不执行 I/O**：Runtime Core 只接收已加载和校验的结构化内容。
6. **运行时权威**：人物移动、碰撞、Portal 和地图切换结果由 Runtime Core 决定。
7. **异步准备、同步提交**：目标场景准备完成前不改变当前权威状态。
8. **统一暂停**：手动暂停、过场暂停和加载暂停共享相同冻结语义。
9. **客户端只做投影**：Web Client 发送归一化意图并投影客户端可见状态。
10. **资源主体按需交付**：图片不进入 Runtime Core，由 Runtime Service 按 Key 提供。
11. **协议与部署分离**：相同运行时语义可以通过本机或远程通道承载。
12. **桌面宿主与游戏逻辑分离**：Hostra 管理窗口和进程，不参与游戏规则。
13. **不提供创作能力**：游戏目录由外部工具、人或 AI 按规范生成和维护。

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
├── 准备入口场景
├── 协调异步地图加载
├── 协调异步人物加载
└── 请求 Runtime 原子提交
        ↓
Runtime Core
├── 权威状态
├── 移动与碰撞
├── Portal 检测
└── 统一暂停
        ↓
Runtime Service
├── 状态与命令
├── 加载与错误通知
├── 资源接口
└── 健康检查
        ↓
Web Client
        ↓
浏览器或 Hostra
```

Pokémon Essentials v21.1 导出、地图转换和 Autotile 处理属于游戏包生产工具链，不属于游戏运行时或编辑能力。

## 6. 核心模块

### 6.1 Game Package Specification

游戏包规范定义 `loom-realm start <directory>` 接受的只读目录结构和语义。

它约定：

- `realm.game.json`；
- 格式版本；
- 游戏唯一标识；
- 初始地图和玩家人物；
- FSDB 数据位置；
- 静态资源位置；
- 数据 Key、资源 Key 和引用规则；
- 路径安全规则。

### 6.2 Game Package Loader

Game Package Loader 打开游戏目录并建立 Game Package Context。

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

Repository 负责：

- 异步读取；
- 解析和局部校验；
- 同一 ID 的并发读取去重；
- 简单进程内缓存。

缓存命中与否不得改变游戏语义。

### 6.4 Session Coordinator

Session Coordinator 是异步内容加载与同步 Runtime Core 之间的薄协调层。

它负责：

- 并行加载入口地图和玩家人物；
- 初始化 Runtime Core；
- 接收 Runtime Effect；
- 加载目标地图和必需人物；
- 加载期间暂停 Runtime；
- 校验 PreparedMapTransition；
- 请求 Runtime Core 原子提交；
- 处理加载失败和会话关闭。

它不负责：

- 移动、碰撞和 Portal 规则；
- FSDB 解析细节；
- Repository 缓存；
- 图片资源主体；
- 网络和客户端渲染；
- 存档。

第一阶段每个会话一个 Coordinator、一个 Runtime、一个活动加载任务。

### 6.5 Runtime Core

Runtime Core 是游戏规则和权威状态的核心。

启动输入：

```text
Game Identity
+ 入口 Map Snapshot
+ 玩家 Actor Definition
+ 默认出生位置
```

职责：

- 初始化运行会话；
- 维护当前地图和人物状态；
- 处理方向意图和人物行走；
- 执行碰撞判定；
- 检测 Portal 并产生 MapTransitionEffect；
- 原子提交 PreparedMapTransition；
- 维护权威状态版本；
- 生成客户端可见状态；
- 提供统一暂停和恢复行为。

Runtime Core 不依赖文件系统、FSDB、Promise、DOM、Electron、Hostra、WebSocket 或 HTTP。

### 6.6 Runtime Service

Runtime Service 将会话和 Runtime Core 暴露给客户端。

它负责：

- 接收用户命令；
- 检查 Session 状态；
- 调用 Runtime Core；
- 把异步 Effect 交给 Session Coordinator；
- 发布完整状态和增量状态；
- 发布加载状态和错误；
- 按资源 Key 调用 Resource Repository；
- 提供 Web Client 静态文件和健康检查。

Runtime Service 不实现人物移动、碰撞或地图切换规则。

### 6.7 Web Client

Web Client 是环境独立的普通 Web 应用。

它负责：

- 连接 Runtime Service；
- 接收状态、加载状态和错误；
- 维护客户端状态镜像；
- 将键盘输入归一化为用户意图；
- 按资源 Key 请求图片；
- 解码和缓存图片资源；
- 使用 DOM/CSS 渲染地图和人物；
- 管理动画帧和界面临时状态。

Web Client 不读取游戏目录，不判断碰撞，也不通过 DOM 反向修改权威状态。

### 6.8 CLI & Session Bootstrap

`loom-realm` CLI 是游戏启动入口。

它负责：

- 解析 `start` 命令和参数；
- 定位游戏包目录；
- 调用 Game Package Loader；
- 创建 Runtime Core；
- 创建 Session Coordinator；
- 调用 `SessionCoordinator.start()`；
- 启动 Runtime Service；
- 选择浏览器或 Hostra 宿主；
- 管理启动失败和退出流程。

CLI 不承载游戏规则，也不修改游戏内容。

### 6.9 Hostra Desktop Adapter

Hostra 是可选的 Electron 桌面宿主适配器。

它负责：

- 启动或承载本地 Runtime Service 进程；
- 管理 BrowserWindow；
- 在 Runtime 就绪后打开 Web Client；
- 管理窗口和子进程生命周期；
- 提供受限制的桌面能力。

Hostra 控制 RPC 与 LoomRealm Runtime RPC 是独立通道。Hostra 不参与游戏规则或权威状态。

### 6.10 Save System

Save System 是后续模块，不进入第一阶段设计和实现闭环。

架构只保留以下边界：

- 存档位于游戏包外部；
- 存档保存可变会话状态；
- 存档不复制地图、人物或资源定义；
- Runtime Core 未来可以提供稳定的持久化快照。

第一阶段不冻结 `.lrsav` 内部格式、迁移或写入策略。

## 7. 主要运行流程

### 7.1 启动游戏

```text
loom-realm start ./game
→ 打开并校验游戏包
→ 建立 Game Catalog 和 Repository
→ 创建 Session Coordinator 和 Runtime Core
→ 并行加载入口地图与玩家人物
→ 校验默认出生位置
→ 初始化 Runtime Core
→ 启动 Runtime Service
→ 打开 Web Client
→ 发布首个完整状态
```

### 7.2 用户操作

```text
用户输入
→ Web Client 归一化意图
→ Runtime Service 检查 Session 状态
→ Runtime Core 同步处理命令
→ 更新权威状态
→ 发布客户端可见状态
→ Web Client 更新 DOM
```

### 7.3 地图切换

```text
人物合法完成一步
→ Runtime Core 检测 Portal
→ 返回 MapTransitionEffect
→ Session Coordinator 进入 loading
→ Runtime 进入统一暂停
→ 异步加载目标地图和人物
→ 校验 PreparedMapTransition
→ Runtime Core 原子提交
→ Session 返回 running
→ Runtime 恢复
→ 发布新地图完整状态
```

目标地图准备失败时，当前地图和人物状态保持不变。

### 7.4 资源加载

```text
客户端状态中的资源 Key
→ Web Client 请求资源
→ Runtime Service
→ Resource Repository.open(resourceId)
→ 返回图片字节
→ Web Client 解码、缓存和显示
```

资源读取速度不控制 Runtime 是否运行。

### 7.5 统一暂停

Runtime 暴露单一暂停语义：

```text
running
↕
paused
```

手动暂停、过场暂停和加载暂停共享以下行为：

- 冻结游戏逻辑时间；
- 停止游戏状态推进；
- 拒绝普通游戏命令；
- 保留当前权威状态；
- 允许恢复、关闭、错误处理和场景提交等控制操作。

暂停原因不进入 Runtime 业务状态模型。

## 8. 数据边界

### 8.1 Game Catalog

- 游戏身份和入口；
- 地图 ID 索引；
- 人物 ID 索引；
- 资源 Key 索引；
- Runtime Feature。

### 8.2 Map Snapshot

- 单张地图的尺寸和 Tile 层；
- 通行网格；
- Portal 索引；
- 地图人物 ID；
- 地图资源 Key。

### 8.3 Actor Definition

- 人物静态身份；
- Sprite 资源 Key；
- Sprite 布局；
- 后续扩展的静态能力。

### 8.4 Runtime State

- 当前地图；
- 人物位置和朝向；
- 当前移动状态；
- 碰撞和 Portal 结果；
- 权威状态版本；
- 统一暂停状态。

### 8.5 Web Client State

- DOM 像素位置；
- 动画帧；
- CSS 过渡；
- 图片加载状态；
- 界面和调试临时状态。

## 9. 第一阶段边界

第一阶段验证：

- `loom-realm start <game-directory>`；
- 只读游戏包目录；
- 轻量 Game Catalog；
- 入口地图和玩家人物异步加载；
- 两张测试地图；
- 三层 Tile、普通 Tile、静态 Autotile、通行和 Priority；
- 一个玩家人物的四方向格子行走；
- 静态碰撞；
- 双向 Portal；
- 统一暂停；
- 地图切换异步准备和原子提交；
- Runtime 状态同步；
- Web Client 按 Key 请求资源；
- DOM/CSS 地图和人物渲染；
- 浏览器和 Hostra 桌面运行。

第一阶段不包含：

- 存档系统；
- ZIP、ASAR 或单文件游戏包；
- 游戏内容编辑器；
- 项目创作或修改 API；
- 后台预取和加载取消；
- 多会话和多人同步；
- NPC 和通用事件系统；
- 战斗和完整 Pokémon 业务逻辑；
- 插件系统。

## 10. 文档关系

```text
总体架构
├── 第一阶段游戏包规范
├── 第一阶段游戏启动与异步内容加载
├── 第一阶段 Session Coordinator
├── 运行时通信与状态同步
├── Hostra 桌面客户端宿主
├── Pokémon Essentials 地图兼容运行时
├── 人物行走与碰撞运行时
├── DOM 渲染与渲染状态
└── 第一阶段路线图与设计待办
```

总体架构定义模块和边界。专题文档负责目录格式、接口、算法和验收细节。

## 11. 当前架构缺口

当前最重要的缺口是：

1. **Runtime Core 状态模型**：命令、Effect、暂停、状态版本和原子事务尚未形成完整专题文档。
2. **Runtime Service 协议**：命令、完整状态、增量状态、加载状态和错误契约尚未冻结。
3. **资源接口**：资源 Key、MIME、缓存 Header 和错误行为尚未正式定义。
4. **CLI 契约**：参数、退出码、日志和宿主选择尚未形成正式规范。
5. **统一错误模型**：游戏包、Repository、Session 和 Runtime 错误尚未统一分类。
6. **测试基准**：原创游戏包夹具、Golden Data 和端到端启动测试尚未建立。
7. **安全模型**：不可信游戏包、路径逃逸、资源访问和 Hostra Origin 限制仍需统一设计。
8. **存档系统**：已明确暂缓，后续单独设计。

## 12. 当前结论

LoomRealm 第一阶段核心链路是：

```text
只读游戏包
→ 轻量 Game Catalog
→ 地图和人物按需异步加载
→ Session Coordinator 协调
→ Runtime Core 同步执行权威事务
→ Runtime Service 提供状态与资源接口
→ Web Client 呈现
```

Session Coordinator 必须保持薄；Repository 负责读取和缓存；Runtime Core 负责游戏规则、统一暂停和权威状态。