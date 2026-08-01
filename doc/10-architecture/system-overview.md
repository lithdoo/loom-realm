# LoomRealm 系统架构总览

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：顶层系统划分、状态所有权、运行承载、启动拓扑和系统关系  
> 依赖：[产品设计总览](../00-overview/product-vision.md)  
> 最近复核：2026-08-02

本文档只描述 LoomRealm 由哪些系统组成、各系统为什么存在以及它们如何协作。精确消息字段、模块拆分和分包方案分别由下层文档定义。

## 1. 顶层结构

```text
游戏包
├── Manifest / Entry
├── Subsystem Descriptors
├── FSDB 数据
└── 资源主体
        │
        ├──────────────▶ LoomRealm Main
        │                  ├── Session / Subsystem Registry
        │                  ├── Runtime Container Supervisor
        │                  ├── Frame Stack / Activation
        │                  ├── Input Target
        │                  └── Connection Authority
        │                           │
        │                           │ Control Plane
        │                           ▼
        │                  Subsystem Runtime Container
        │                  ├── System 业务状态与规则
        │                  ├── 可选 Frame / Input Context
        │                  ├── Render Manager / Render Contexts
        │                  └── Renderer Data Endpoint
        │                           │
        │                           │ System Data Connection
        │                           ▼
        │                       Web Renderer
        │                       ├── System Connection Registry
        │                       ├── Render Store / Scheduler
        │                       ├── Input Router
        │                       └── DOM / Canvas / WebGL
        │
        └──────────────▶ Readonly Content Service
```

桌面由独立 LoomRealm Main Process、FSDB Content Service、Hostra 和各 Subsystem Process 组成。PWA 使用 Window、Main Runtime Worker、每 System 一个 Dedicated Worker、Service Worker 和 OPFS 映射相同逻辑边界。

## 2. 核心对象

### System / Subsystem

`systemId` 标识一个业务扩展单元，例如 `loom.map` 或 `loom.menu`。当前会话可用的 System 由 Game Entry 中的 Subsystem Descriptor 声明。

### Runtime Container

一个 `systemId` 对应一个有效 Runtime Container：桌面为独立进程，PWA 为 Dedicated Worker。Container 是 System 级承载单元，不等于 Frame。

### Frame

Frame 是 Main 管理的一次调用 / 用户输入上下文。它用于：

- 调用栈关系；
- `frameId`；
- Activation；
- Input Target；
- 用户输入路由；
- 调用返回关系。

Frame 不是 Render 身份，也不是平台强制的业务状态所有权单元。平台不要求每个 Frame 拥有独立 Projector、Render Tree 或 Renderer Store。

### Render

Render 是 Subsystem 完全拥有的呈现上下文。Subsystem 决定 Render 的：

- 创建和销毁；
- 当前声明式目标状态；
- 排序与组合；
- 可见性；
- 更新和恢复。

公共架构不定义 Frame 与 Render 的所有权关系。Subsystem 可以在内部手动关联二者，也可以完全不关联。

## 3. 系统划分

### 运行时启动与连接建立系统

负责 Game Entry 中的 Subsystem Descriptor、Launcher、Subsystem Process / Worker Bootstrap、Main Control Connection、Renderer Bootstrap 和 System Data Connection 的建立顺序。

核心桌面规则：

```text
Main Control Endpoint ready
→ 读取全部 Subsystem Descriptor
→ Main 启动全部声明的 Subsystem Process
→ 注入 systemId + Main Control Endpoint + descriptor env
→ Subsystem 主动连接 Main
→ ready(systemId)
→ Main 标记 System ready
→ Renderer 根据 Main 授权连接各 ready System
```

详见：[运行时启动与连接建立系统](./runtime-bootstrap-system.md)。

### 栈式运行系统

负责 Frame 调用栈、激活周期、输入目标和调用返回关系。

调用栈只控制 Frame / Input，不控制 Render 生命周期。

详见：[栈式运行系统](./stack-runtime-system.md)。

### 运行承载系统

负责 System、Runtime Container、Frame、Render 承载边界以及桌面进程和 PWA Worker 的映射。

核心规则：

```text
每个 systemId 一个 Runtime Container
每个 Container 可以承载零个或多个 Frame / Input Context
每个 Container 可以拥有零个或多个 Render Context
每个 Container 与 Renderer 之间最多一个长期 System Data Connection
Frame 与 Render 没有平台级所有权绑定
```

详见：[运行承载系统](./runtime-hosting-system.md)。

### 通信系统

负责 Main、Runtime Container、Renderer 和 Content Service 之间的控制面、System 数据面和内容面。

Renderer–Subsystem System Data Connection 内进一步区分：

```text
Connection Layer
Render Update Protocol
User Input Protocol
```

Render Update 使用 Render 身份；User Input 使用 Frame / Activation 身份。两者共享 System Transport，但不共享业务生命周期。

详见：[通信系统](./communication-system.md)。

### 渲染系统

负责接收各 Subsystem 发布的声明式 Render State，在本地维护 Render Store，并协调为可信 DOM、Canvas 或 WebGL 视图。

Renderer 不从 Frame Stack 推导哪些 Render 应显示，也不因 Frame suspend / close 自动隐藏或删除 Render。

详见：[渲染系统](./rendering-system.md)。

### 存储与内容系统

负责只读游戏包、安装实例、内容索引、逻辑 Content API、Repository、资源 Key 和路径安全。

Content API 仍然只提供数据与资源；受控 Subsystem Launcher 是 Main 的运行能力，不属于 Content API。

详见：[存储与内容系统](./storage-system.md)。

### 模块子系统模型

规定子系统作为业务扩展单元的职责、业务状态所有权、Frame/Input 适配、Render 所有权和 Container 共享边界。

详见：[模块子系统模型](./subsystem-model.md)。

## 4. 状态所有权

```text
程序主系统
    Session
    Subsystem Descriptor / Runtime Registry
    Runtime Container 生命周期
    Frame Stack / Activation / Input Target
    Connection Authority

Runtime Container / Subsystem
    本 System 的业务状态和规则
    Frame Input Handler / Frame 关联（如需要）
    Render Registry / Render State
    System 级共享资源和缓存

Web Renderer
    Main Control State 的只读镜像
    System Data Connection Registry
    Render Store
    DOM / Canvas / WebGL 与非权威表现状态
    原始输入设备状态

Content Service
    安装登记、只读内容定位、校验和资源交付
```

任何状态都必须能够回答：谁是权威拥有者、谁可以修改、谁只能读取或投影、断线或重载后从哪里恢复。

## 5. 桌面承载

```text
LoomRealm Main Process
    Session、Subsystem 启动监督、Frame Stack、Input Target、连接授权

FSDB Content Service Process
    localhost Readonly HTTP Content API

Hostra Electron Main Process
    BrowserWindow 与桌面宿主

Hostra Renderer Process
    Web Renderer

每个 systemId 一个 Subsystem Process
    System 业务 Runtime
    Frame/Input Contexts（按需）
    Render Contexts（按需）
```

通信：

```text
Subsystem Process → Main
    每 System 一条长期 Control WebSocket

Renderer → Main
    每会话一条长期 Control WebSocket

Renderer ⇄ Subsystem Process
    每 System 一条长期 Data WebSocket

Runtime / Renderer ⇄ Content Service
    localhost HTTP Fetch
```

Hostra 不承载 LoomRealm Main，也不解释 Frame、Render、Input 或业务消息。

## 6. PWA 承载

```text
Window
    Web Renderer 和页面宿主能力

Main Runtime Dedicated Worker
    Session、Frame Stack、Input Target、System Worker Registry

每个 systemId 一个 Dedicated Worker
    System 业务 Runtime
    Frame/Input Contexts
    Render Contexts

Service Worker
    same-origin Readonly Content API

OPFS / Cache Storage
    已安装游戏包和资源
```

PWA Launcher Profile 受浏览器能力限制；例如 JavaScript Worker 可以支持，而 Shell / Native Executable 必须明确报告 unsupported。

## 7. 会话启动链路

```text
loom-realm start <installation>
→ Main 创建 Session / Control Endpoint / Renderer Web Service / Content Service
→ 读取 Manifest / Entry
→ 读取全部 Subsystem Descriptor
→ Main 启动全部声明的 Subsystem
→ Subsystem 主动连接 Main 并发送 ready(systemId)
→ Main 建立 ready System Registry
→ Hostra 打开 Renderer
→ Renderer 连接 Main Control Connection
→ Main 发布 System / Frame / Input 控制状态和 System Data Grant
→ Renderer 每 ready System 建立 Data Connection
→ Connection Layer ready
```

随后 Frame/Input 与 Render 分别演进：

```text
Main → Frame / Activation / Input Target
Renderer → User Input Protocol → Subsystem
```

以及：

```text
Subsystem → Render Update Protocol → Renderer → DOM / Canvas / WebGL
```

两条链没有隐式绑定。

## 8. 调用链路

```text
当前 active Frame A 发起 call(system B, input)
→ Main 验证 B 已声明且 Runtime Container ready
→ Main 在 B 中建立新的 Frame / Input Context
→ Frame B ready for input
→ Frame A suspend
→ Frame B 入栈并获得新 Activation / Input Target
→ Frame B 返回 result
→ Frame B 出栈
→ Frame A 获得新 Activation 并恢复输入
```

上述流程不要求创建、隐藏或删除任何 Render。B 是否创建菜单、场景或其他 Render，以及 A 的 Render 是否继续显示，完全由对应 Subsystem 自己决定。

## 9. 输入上行链路

```text
键盘 / 手柄 / 触摸 / UI Interaction
→ Renderer Input Router
→ 根据 Main Input Target 取得 systemId + frameId + activationId
→ 对应 System Data Connection
→ User Input Protocol
→ Subsystem Frame Input Handler
→ Subsystem 业务逻辑
```

普通输入不经过 Main 或 Hostra 业务转发。旧 Activation 输入必须拒绝。

## 10. Render 下行链路

```text
Subsystem 业务状态 / Render Manager
→ Render State / Render Event
→ Render Update Protocol
→ 所属 System Data Connection
→ Renderer Render Store
→ Render Scheduler
→ DOM / Canvas / WebGL
```

Render 消息不以 Frame 作为平台级身份。Main 不解释 Render 内容，也不拥有 Render Registry。

Subsystem 可以在没有 Frame、Frame 未 active、Frame suspended 或某 Frame close 后继续维护 Render。

## 11. 三类通信平面

```text
控制面
    Main ⇄ Runtime Container
    Main ⇄ Renderer

System 数据面
    Runtime Container ⇄ Renderer
    每 System 一条物理连接
    ├── Connection Layer
    ├── Render Update Protocol
    └── User Input Protocol

内容面
    Runtime Container / Renderer ⇄ Content Service
```

大型资源内容不能进入控制面或普通 System 数据消息。

## 12. 第一阶段实例

`loom.map` 是第一个完整业务实现。它可以自行采用：

```text
Map Runtime
├── shared / per-session business state
├── Frame Input Adapter
├── Render Manager
├── Render Projector
└── Repository / Content Client
```

`loom.map` 可以内部建立 Frame 与 Render 的关联，但这不构成 LoomRealm 对其他 Subsystem 的要求。

## 13. 架构不变量

1. Game Entry 声明本次会话全部 Subsystem 及其启动 Descriptor；
2. LoomRealm Main 负责启动和监督 Subsystem，Hostra 与 Renderer 不启动业务进程；
3. Subsystem 主动连接 Main Control Endpoint，并以匹配 `systemId` 的 ready 表示加载完成；
4. 每个 `systemId` 同时最多一个有效 Runtime Container；
5. Renderer 与每个 Runtime Container 同时最多一个有效 System Data Connection；
6. Frame 是调用 / 输入上下文，不是进程、物理连接或 Render 身份；
7. Frame suspend / resume / close 不产生任何隐式 Render 行为；
8. Render 的创建、更新、排序、可见性和销毁完全由 Subsystem 控制；
9. Main 不维护 Render Registry，Renderer 不从 Stack 推导 Render；
10. 普通 User Input 和 Render Update 不经过 Main 业务转发；
11. 游戏包运行期间只读，只有明确声明且 Launcher Profile 允许的 Subsystem Entry 可以被受控启动；
12. Service Worker 和 Content Service 不拥有游戏运行状态；
13. 桌面与 PWA Transport 差异不能改变 System、Frame/Input 和 Render 所有权语义。

## 14. 下层文档

- [运行时启动与连接建立系统](./runtime-bootstrap-system.md)；
- [栈式运行系统](./stack-runtime-system.md)；
- [运行承载系统](./runtime-hosting-system.md)；
- [通信系统](./communication-system.md)；
- [渲染系统](./rendering-system.md)；
- [模块子系统模型](./subsystem-model.md)；
- [正式契约目录](../15-contracts/README.md)；
- [模块设计目录](../20-modules/README.md)；
- [实施计划目录](../30-implementation/README.md)；
- [设计决策记录](../decisions/README.md)。
