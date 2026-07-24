# LoomRealm 总体架构

## 1. 文档目的

本文档是 LoomRealm 项目架构的核心入口。

本文档只定义系统定位、核心模块、职责边界和主要运行流程，不展开游戏目录 Schema、存档字段、通信消息、地图算法或 DOM 实现细节。

专题文档必须服从本文档中的模块边界。

## 2. 系统定位

LoomRealm 是一个约定游戏目录结构和存档格式、通过命令行启动、由权威运行时驱动并使用 Web 客户端呈现的 RPG 运行平台。

典型启动方式：

```bash
loom-realm start ./game --save ./game.0.lrsav
```

其中：

- `./game` 是只读游戏包目录；
- `./game.0.lrsav` 是可写存档文件；
- LoomRealm 负责加载游戏包、恢复存档、运行游戏并承载客户端；
- LoomRealm 不提供游戏内容编辑器，也不提供项目创作接口。

## 3. 核心对象

LoomRealm 围绕三个核心对象运行：

```text
只读游戏包
    +
可写存档
    ↓
运行会话
```

### 3.1 游戏包

游戏包保存静态游戏定义和资源，例如：

- 游戏清单和格式版本；
- 地图、Tile、Tileset 和人物定义；
- Portal 和其他静态关系；
- 图片资源；
- 可选的预编译产物。

游戏运行期间原则上不修改游戏包。

### 3.2 存档

存档保存可变游戏状态，例如：

- 当前地图；
- 玩家位置和朝向；
- 世界变量和永久变化；
- 游戏时间；
- 后续扩展的队伍、背包和任务状态。

存档必须与对应游戏包进行身份和版本兼容校验。

### 3.3 运行会话

运行会话由一个游戏包和一个可选存档创建。

运行会话持有当前权威状态，处理用户意图，并生成客户端可见状态和新的存档快照。

## 4. 架构原则

1. **游戏包只读**：运行过程不把玩家进度写回游戏目录。
2. **存档独立可写**：可变世界状态只写入独立存档。
3. **运行时权威**：地图、人物、移动、碰撞和地图切换结果由 Runtime Core 决定。
4. **客户端只做投影**：Web Client 发送归一化用户意图，并将客户端可见状态投影为 DOM。
5. **加载与运行分离**：文件系统、FSDB 和兼容格式先转换为稳定游戏快照，再进入 Runtime Core。
6. **状态与资源分离**：状态服务描述画面和行为，资源服务交付图片内容。
7. **协议与部署分离**：同一运行时语义可通过本机 WebSocket、远程 WebSocket 或 Worker 通道承载。
8. **桌面宿主与游戏逻辑分离**：Hostra 管理 Electron 窗口和进程，不参与游戏规则。
9. **不提供创作能力**：游戏目录由外部工具、人或 AI 按 LoomRealm 规范生成和维护。

## 5. 总体结构

```text
loom-realm CLI
        │
        ├── 游戏包目录
        └── 可选存档文件
                ↓
       Game Loader & Compiler
                ↓
          Game Snapshot
                +
          Save Snapshot
                ↓
          Runtime Core
                ↓
         Runtime Service
        ├── 状态与事件
        ├── 图片资源
        └── 健康检查
                ↓
           Web Client
                ↓
        浏览器或 Hostra
```

Pokémon Essentials v21.1 导出、地图转换和 Autotile 编译属于游戏包生产工具链。它们用于生成符合 LoomRealm 规范的游戏包，但不属于游戏启动时必须存在的编辑能力。

## 6. 核心模块

### 6.1 Game Package Specification

游戏包规范定义 `loom-realm start <directory>` 所接受目录的结构和语义。

它负责约定：

- 游戏清单文件；
- 格式版本；
- 游戏唯一标识；
- 初始地图和玩家入口；
- FSDB 数据位置；
- 静态资源位置；
- 构建产物位置；
- 数据 Key、资源 Key 和引用规则。

游戏包规范是 LoomRealm 最主要的公开内容契约。

### 6.2 Game Loader & Compiler

游戏加载与编译模块负责把游戏目录转换为 Runtime Core 可以使用的不可变游戏快照。

它负责：

- 发现和读取游戏清单；
- 检查格式版本；
- 读取和校验 FSDB；
- 校验数据与资源引用；
- 加载或生成运行时构建产物；
- 创建 `Game Snapshot`；
- 输出加载错误和诊断信息。

对于 Pokémon Essentials 兼容游戏包，该模块使用已经标准化或预编译的地图、通行和渲染数据。运行中的人物移动逻辑不直接读取 `.rxdata` 或解释原始 Ruby 对象。

### 6.3 Save System

存档系统负责读取、校验和写入 `.lrsav` 文件。

它负责：

- 从存档恢复 `Save Snapshot`；
- 新游戏时创建初始存档状态；
- 校验游戏 ID、存档版本和内容兼容性；
- 从 Runtime Core 获取可持久化状态；
- 原子写入存档；
- 处理损坏、版本不支持和写入失败。

命令：

```bash
loom-realm start ./game --save ./game.0.lrsav
```

建议语义：

- 存档存在时读取并继续；
- 存档不存在时从游戏初始状态启动，并在保存时创建；
- 未提供 `--save` 时启动临时会话，不保证退出后保留状态。

### 6.4 Runtime Core

Runtime Core 是游戏规则和权威状态的核心。

输入：

```text
Game Snapshot
+
可选 Save Snapshot
+
User Intent
```

职责：

- 初始化运行会话；
- 建立运行时地图；
- 维护当前地图和人物状态；
- 处理方向意图和人物行走；
- 执行碰撞判定；
- 处理 Portal 和地图切换；
- 维护权威状态事务；
- 生成客户端可见状态；
- 生成可持久化存档快照。

Runtime Core 不依赖文件系统目录、DOM、Electron、Hostra、WebSocket 或 HTTP。

### 6.5 Runtime Service

Runtime Service 将 Runtime Core 暴露给客户端和本地宿主。

它负责：

- 状态同步；
- 用户事件传递；
- 完整状态和增量状态；
- 状态版本与恢复；
- 运行时错误和通知；
- 图片资源接口；
- Web Client 静态文件；
- 健康检查和服务就绪状态；
- 调用 Save System 执行保存。

Runtime Service 不实现人物移动、碰撞或地图切换规则。

### 6.6 Web Client

Web Client 是环境独立的普通 Web 应用。

它负责：

- 连接 Runtime Service；
- 接收完整状态和增量状态；
- 维护客户端状态镜像；
- 将键盘输入归一化为用户意图；
- 加载状态引用的图片资源；
- 使用 DOM/CSS 渲染地图和人物；
- 管理动画帧、CSS 插值、加载和调试状态。

Web Client 不读取完整游戏目录，不读取存档文件，不判断碰撞，也不通过 DOM 反向修改权威状态。

### 6.7 CLI & Session Bootstrap

`loom-realm` CLI 是游戏启动和运行会话协调入口。

它负责：

- 解析命令和参数；
- 定位游戏包目录；
- 选择可选存档；
- 调用 Game Loader & Compiler；
- 调用 Save System；
- 初始化 Runtime Core；
- 启动 Runtime Service；
- 选择浏览器或桌面宿主；
- 管理启动失败和退出流程。

CLI 只协调模块，不承载游戏规则，也不修改游戏内容。

### 6.8 Hostra Desktop Adapter

Hostra 是可选的 Electron 桌面宿主适配器。

它负责：

- 启动或承载本地 Runtime Service 子进程；
- 管理 BrowserWindow；
- 在 Runtime 就绪后打开 Web Client；
- 管理窗口和子进程生命周期；
- 提供受限制的桌面能力。

Hostra 控制 RPC 与 LoomRealm Runtime RPC 是两套独立通道。Hostra 不读取游戏包和存档业务数据，也不保存、代理或修改权威游戏状态。

## 7. 主要运行流程

### 7.1 启动游戏

```text
loom-realm start ./game --save ./game.0.lrsav
→ 解析参数
→ 加载并校验游戏包
→ 读取或创建存档快照
→ 初始化 Runtime Core
→ 启动 Runtime Service
→ 打开 Web Client
→ 同步完整客户端状态
```

### 7.2 用户操作

```text
用户输入
→ Web Client 归一化意图
→ Runtime Service 传递事件
→ Runtime Core 处理移动、碰撞和 Portal
→ 更新权威状态
→ 同步客户端可见状态
→ Web Client 更新 DOM 表现
```

### 7.3 资源加载

```text
客户端状态中的资源 Key
→ Runtime Service 资源接口
→ 图片内容与版本
→ Web Client 缓存和 DOM/CSS 使用
```

### 7.4 保存游戏

```text
保存请求或保存时机
→ Runtime Core 生成 Save Snapshot
→ Save System 校验和序列化
→ 原子写入 .lrsav
```

保存过程不修改游戏包。

### 7.5 地图切换

```text
人物合法完成一步
→ Runtime Core 检测 Portal
→ 原子切换地图和人物位置
→ 同步新地图完整状态
→ Web Client 准备资源和新场景
→ 原子替换旧 DOM 场景
```

## 8. 数据边界

### 8.1 游戏包静态数据

- 游戏标识和格式版本；
- 地图和 Tile 数据；
- Tileset、Autotile 和人物定义；
- 通行与 Priority 数据；
- Portal 定义；
- 静态资源和构建产物。

### 8.2 存档数据

- 当前地图；
- 玩家位置和朝向；
- 可持久化世界状态；
- 游戏时间；
- 游戏和存档兼容信息。

一步移动的瞬时插值进度是否写入存档由存档专题文档决定，但存档恢复后必须得到一致、可运行的权威状态。

### 8.3 Runtime 权威状态

- 当前地图；
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

## 9. 部署形态

```text
桌面本地模式
CLI → Hostra → 本地 Runtime Service ← Web Client

浏览器模式
CLI → 本地 Runtime Service ← 浏览器 Web Client

远程模式
远程 Runtime Service ← WebSocket → Web Client

浏览器内运行时模式
Web Client → Worker 传输适配 → Runtime Core
```

不同部署方式应共享游戏包规范、存档语义、权威状态原则、客户端状态语义和资源 Key 模型。

## 10. 第一阶段边界

第一阶段验证：

- `loom-realm start <game-directory>` 启动流程；
- 可选 `--save <save-file>` 的读取、创建和写入闭环；
- 一份符合规范的 LoomRealm 游戏包；
- 两张 Pokémon Essentials v21.1 测试地图；
- 三层 Tile、普通 Tile、静态 Autotile、通行和 Priority；
- 一个玩家人物的四方向格子行走；
- 静态碰撞；
- 双向 Portal；
- Runtime 权威状态和客户端同步；
- DOM/CSS 地图与人物渲染；
- 浏览器运行和 Hostra 桌面运行。

第一阶段不包含：

- 游戏内容编辑器；
- 项目创作或修改 API；
- NPC 和通用事件系统；
- 战斗和完整 Pokémon 业务逻辑；
- 插件系统；
- 多人同步；
- 复杂存档迁移和跨版本兼容。

## 11. 配套工具的边界

Pokémon Essentials 导出器、地图转换器、Autotile 编译器和其他内容生产工具可以存在，但它们是配套工具，不是 LoomRealm 运行平台的编辑能力。

它们的输出必须是符合 Game Package Specification 的只读游戏包。

```text
外部内容生产工具
→ LoomRealm 游戏包
→ loom-realm start
```

Runtime Core、Runtime Service 和 Web Client 不依赖某个特定内容生产工具。

## 12. 当前文档关系

```text
总体架构
├── 游戏包规范
├── 存档格式与持久化
├── CLI 与会话启动
├── 游戏加载与编译
├── 运行时通信与状态同步
├── Hostra 桌面客户端宿主
├── Pokémon Essentials 地图兼容运行时
├── 人物行走与碰撞运行时
├── DOM 渲染与渲染状态
└── 第一阶段路线图与设计待办
```

总体架构定义模块和边界。专题文档负责目录格式、Schema、算法、协议和验收细节。

## 13. 当前架构缺口

按照新的系统定位，当前最重要的缺口是：

1. **游戏包规范**：游戏清单名称、目录结构、格式版本、入口和资源位置尚未正式冻结。
2. **存档规范**：`.lrsav` 的身份、版本、数据范围、原子写入和兼容校验尚未设计。
3. **CLI 规范**：`start` 命令、参数、默认值、退出码、日志和宿主选择尚未形成正式契约。
4. **Game Snapshot 边界**：游戏加载后交给 Runtime Core 的不可变模型尚未形成正式 Schema。
5. **运行时状态协议**：完整状态、增量状态、事件、版本和错误契约尚未定义。
6. **资源生命周期**：资源 Key、内容版本、缓存失效和打包规则尚未完整定义。
7. **错误与诊断**：游戏包错误、存档错误、运行时错误和客户端错误尚未统一分类。
8. **测试基准**：原创游戏包夹具、存档夹具、Golden Data 和端到端启动测试尚未形成专题设计。
9. **安全模型**：不可信游戏包、路径穿越、资源访问、远程连接和 Hostra Origin 限制仍需统一设计。

其中最先需要确认的是游戏包规范、存档规范和 CLI 启动契约，因为它们共同定义 LoomRealm 的公开使用入口。

## 14. 当前结论

LoomRealm 的核心链路是：

```text
只读游戏包
+
可写存档
↓
CLI 与会话启动
↓
游戏加载与编译
↓
权威 Runtime Core
↓
状态、事件和资源服务
↓
Web Client
↓
浏览器或 Hostra
```

LoomRealm 约定如何组织和运行游戏，但不负责编辑游戏内容。