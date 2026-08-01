# LoomRealm 系统架构总览

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：顶层系统划分、状态所有权、运行承载和系统关系  
> 依赖：[产品设计总览](../00-overview/product-vision.md)  
> 最近复核：2026-08-01

本文档只描述 LoomRealm 由哪些系统组成、各系统为什么存在以及它们如何协作。精确消息字段、模块拆分和分包方案分别由下层文档定义。

## 1. 顶层结构

```text
游戏包与静态内容
        ↓
只读 Content Service
        ⇅
程序主系统
├── 栈式运行系统
├── Runtime Container Registry
├── Frame 生命周期
└── System 数据连接授权
        ⇅ 控制面
模块子系统 Runtime Container
├── 每个 systemId 一个 Container
├── 多个独立 Frame Runtime
├── 各 Frame 权威业务状态
└── 各 Frame Client State Projector
        ⇅ 每 System 一条数据连接
        ⇅ 连接内多路复用 Frame Logical Stream
Web 渲染系统
├── 调用栈镜像
├── System Data Connection Registry
├── Frame / Scope Store
├── 输入路由
└── DOM / Canvas / WebGL 呈现
```

桌面由独立 LoomRealm Main Process、FSDB Content Service、Hostra 和各 System Process 组成。PWA 使用 Window、Main Runtime Worker、每 System 一个 Dedicated Worker、Service Worker 和 OPFS 实现相同逻辑边界。

## 2. 系统划分

### 栈式运行系统

负责入口 Frame、子系统调用栈、激活周期、输入目标和调用返回关系。

详见：[栈式运行系统](./stack-runtime-system.md)。

### 运行承载系统

负责 System、Runtime Container、Frame、桌面进程和 PWA Worker 的映射。

核心规则：

```text
每个 systemId 一个 Runtime Container
每个 Container 可以承载多个 Frame
每个 Container 与 Renderer 之间一个长期数据连接
每个 Frame 独立拥有权威状态、Projector 和逻辑数据流
```

物理连接粒度与 Runtime Container 一致；Frame 是连接内部的逻辑路由和状态隔离单元，不拥有独立物理连接。

详见：[运行承载系统](./runtime-hosting-system.md)。

### 通信系统

负责主系统、Runtime Container、Frame Runtime、渲染端和 Content Service 之间的控制面、System 数据面和内容面语义，包括多路复用、顺序、重连、背压和错误边界。

详见：[通信系统](./communication-system.md)。

### 渲染系统

负责维护调用栈和 Client State 的本地镜像，将 Scope Tree 协调为可信 DOM、Canvas 或 WebGL 视图，并管理不影响业务规则的本地表现状态。

详见：[渲染系统](./rendering-system.md)。

### 存储与内容系统

负责只读游戏包、安装实例、内容索引、逻辑 Content API、Repository、资源 Key 和路径安全。

详见：[存储与内容系统](./storage-system.md)。

### 模块子系统模型

规定子系统作为业务扩展单元的职责、状态所有权、调用关系、Container 共享边界和 Frame 呈现边界。

详见：[模块子系统模型](./subsystem-model.md)。

## 3. 核心边界

```text
程序主系统
    拥有 System/Container Registry、调用栈、Frame 生命周期、Activation、Input Target 和连接授权

Runtime Container
    拥有 System 级共享只读资源、Frame 实例路由和 Renderer 数据连接端点

Frame Runtime
    拥有本次调用的权威业务状态、规则、队列、Client State Projector 和逻辑数据流状态

渲染系统
    拥有 Stack/Frame/Scope Store、System Data Connection Registry、DOM/Canvas/WebGL 和非权威表现状态

存储与内容系统
    拥有安装登记、只读内容定位、校验和资源交付
```

任何状态都必须能够回答：

- 谁是权威拥有者；
- 谁可以修改；
- 谁只能读取或投影；
- 断线或重载后从哪里恢复。

## 4. 桌面承载

```text
LoomRealm Main Process
    调用栈、生命周期、进程监督、连接授权

FSDB Content Service Process
    localhost Readonly HTTP Content API

Hostra Electron Main + Renderer
    窗口宿主和 Web Renderer

每个 systemId 一个 Subsystem Process
    多个 Frame Runtime
```

通信：

```text
Renderer ⇄ Main
    每会话一条 localhost WebSocket

Main ⇄ Subsystem Process
    每 System 一条 localhost WebSocket

Renderer ⇄ Subsystem Process
    每 System 一条 localhost WebSocket
    在连接内多路复用该 System 的 Frame Logical Stream

静态内容和资源
    localhost HTTP Fetch
```

Hostra 不承载 LoomRealm Main，也不解释 Frame、Scope 或业务消息。

## 5. PWA 承载

```text
Window
    Web Renderer 和页面宿主能力

Main Runtime Dedicated Worker
    调用栈、生命周期和连接授权

每个 systemId 一个 Dedicated Worker
    多个 Frame Runtime

Service Worker
    same-origin Readonly Content API

OPFS / Cache Storage
    已安装游戏包和资源
```

通信：

```text
Window ⇄ Main Runtime Worker
    一条控制 MessagePort

Main Runtime Worker ⇄ System Worker
    每 System 一条控制 MessagePort

Window ⇄ System Worker
    每 System 一条数据 MessagePort
    在 Port 内多路复用该 System 的 Frame Logical Stream

静态内容和资源
    same-origin Fetch
```

PWA 页面进入后台时不保证 Worker 持续运行。宿主必须暂停输入和模拟，并在恢复时重建必要的 System 数据连接和 Frame Snapshot。

## 6. 启动链路

```text
loom-realm start <installation>
→ 打开并校验游戏包公共结构
→ 读取 realm.entry.json
→ 解析初始 systemId 和 params
→ 取得或启动目标 Runtime Container
→ 确保 Renderer 与该 Container 的 System Data Connection 可用
→ 在 Container 内创建初始 Frame Runtime
→ 建立该 Frame 的 Logical Stream 身份
→ 激活 Frame
→ 子系统发布首次完整 Client State
→ Renderer 提交 Store 并呈现
```

程序主系统不根据入口参数猜测地图、人物或其他业务内容。目标子系统负责验证和加载自己的调用输入。

## 7. 调用链路

```text
活动 Frame A 发起 call(system B, input)
→ Main 取得或启动 B 的 Runtime Container
→ 确保 Renderer ⇄ B 的 System Data Connection 可用
→ 在 B Container 中创建 Frame B
→ Frame B ready
→ Frame A 暂停
→ Frame B 入栈并获得 Input Target
→ Frame B 返回 result 并关闭实例
→ Frame B 出栈
→ Frame A 获得新 Activation 并恢复
```

同一 System 被多次调用时，可以在同一 Container 内同时存在多个独立 Frame；这些 Frame 共享该 Container 与 Renderer 的物理数据连接，但逻辑流、Activation、Sequence 和 Client State 相互隔离。

调用栈只表达系统调用关系，不保存子系统内部业务状态。

## 8. 输入上行链路

```text
键盘 / 手柄 / 触摸 / 节点事件
→ Renderer Input Router
→ 根据 Input Target 取得 frameId / systemId / activationId
→ 对应 System Data Connection
→ 按 frameId + activationId 路由 Logical Stream
→ Frame Runtime 输入队列
→ 权威状态提交
```

普通输入不经过程序主系统或 Hostra 业务转发。

持续方向意图可以合并；离散输入必须保持顺序并有界。旧 Activation 输入必须拒绝。

## 9. 视图状态下行链路

```text
Frame Runtime 权威状态
→ Client State Projector
→ state.snapshot / scope.replace / event.emit
→ 所属 System Data Connection
→ 按 frameId + activationId 路由 Logical Stream
→ Renderer Validator
→ Frame / Scope Store 原子提交
→ Render Scheduler
→ DOM / Canvas / WebGL
```

程序主系统不解释 Scope 内容。Renderer 不从 DOM、Canvas 或 WebGL 推断业务状态或调用栈。

Client Node 是可信视图组件节点，不要求每个 Tile、角色或粒子对应一个 DOM Element。

## 10. 内容链路

```text
Runtime Container / Renderer Resource Client
→ Fetch 逻辑 Content API
→ Package Index
→ 桌面只读目录或 PWA OPFS
```

Content API 使用 `installationId + namespace + key + contentVersion` 等逻辑身份，不暴露物理路径。

Content Fetch 用于初始化、场景切换和资源加载，不进入每 Tick 热路径。

## 11. 三类平面

```text
控制面
    Main ⇄ Runtime Container
    Main ⇄ Renderer

System 数据面
    Runtime Container ⇄ Renderer
    物理连接按 System 建立
    Frame 作为连接内 Logical Stream 多路复用

内容面
    Runtime Container / Renderer ⇄ Content Service
```

控制面负责低频严格生命周期；System 数据面负责各 Frame 的输入、Client State、Event 和 Resync；内容面负责静态数据和资源主体。

大型资源内容不能阻塞控制消息和普通输入。

## 12. 第一阶段实例

第一阶段的初始子系统是 `loom.map`：

```text
Content API
→ Map Repository
→ Session Coordinator
→ Frame Execution Loop
→ Frame Runtime Core
→ Frame Client State Projector
→ loom.map System Data Connection
→ Web Renderer
```

`loom.map` Container 可以承载多个独立地图 Frame，并共享不可变地图定义、资源索引和 Renderer 数据 Transport。

以上内部组件只属于地图子系统，不是平台要求所有子系统实现的固定结构。

## 13. 架构不变量

1. 程序主系统不成为全局游戏业务状态容器；
2. 每个 `systemId` 一个 Runtime Container；
3. 每个 Runtime Container 与 Renderer 之间最多一个有效 System Data Connection；
4. 每个 Frame 是独立业务状态、Activation、Sequence、Revision 和 Logical Stream 单元，不是物理连接单元；
5. 默认只有活动栈顶接收普通输入；
6. 暂停 Frame 的 Scope 可以继续显示；
7. 跨系统状态通过调用输入、返回结果或正式协议显式传递；
8. 游戏包在运行期间只读；
9. Client State 不暴露物理路径或可执行代码；
10. Renderer Store 是恢复目标，DOM/Scene 不是权威状态；
11. Service Worker 和 Content Service 不拥有游戏运行状态；
12. 桌面与 PWA Transport 不改变协议语义；
13. 第一阶段地图实现不得被推广为所有子系统的公共架构。

## 14. 下层文档

- [正式契约目录](../15-contracts/README.md)：跨系统可互操作语义；
- [模块设计目录](../20-modules/README.md)：系统内部模块拆分；
- [实施计划目录](../30-implementation/README.md)：当前仓库落地方案；
- [设计决策记录](../decisions/README.md)：重大架构选择的背景和代价。
