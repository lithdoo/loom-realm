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
        │                       ├── Frame Input Registry
        │                       └── DOM / Canvas / WebGL
        │
        └──────────────▶ Readonly Content Service
```

桌面由独立 LoomRealm Main Process、FSDB Content Service、Hostra 和各 Subsystem Process 组成。PWA 使用 Window、Main Runtime Worker、每 System 一个 Dedicated Worker、Service Worker 和 OPFS 映射相同逻辑边界。

## 2. 核心对象

### Subsystem / System

Game Entry 中的 Subsystem Descriptor 使用全局唯一、稳定的 `key` 作为 Descriptor 身份，例如 `loom.map`、`loom.menu`。

现有部分 v1 数据协议仍使用 `systemId`。`systemId` 与 Descriptor `key` 的最终 wire 迁移或统一方式由对应协议版本冻结；架构层不通过全局替换提前改变旧协议字段含义。

### Runtime Container

一个 Subsystem 对应一个有效 Runtime Container：桌面为独立进程，PWA 为 Dedicated Worker。Container 是 Subsystem/System 级承载单元，不等于 Frame。

### Frame

Frame 是 Main 管理的一次调用 / 用户输入上下文。它用于：

- 调用栈关系；
- `frameId`；
- Activation；
- Input Target；
- 用户输入路由；
- 调用返回关系。

Frame 不是 Render 身份，也不是平台强制的业务状态所有权单元。平台不要求每个 Frame 拥有独立 Runtime Core、Projector、Render Tree、Revision 或 Renderer Store。

### Render

Render 是 Subsystem 完全拥有的呈现上下文。Subsystem 决定 Render 的创建、销毁、目标状态、排序、组合、可见性、更新和恢复。

公共架构不定义 Frame 与 Render 的所有权关系。Subsystem 可以在内部手动关联二者，也可以完全不关联。

## 3. 运行时启动

当前桌面 MVP：

```text
Main Control Endpoint ready
→ 一次性读取全部 Subsystem Descriptor
→ 校验 key 唯一、launcher.type = nodejs、env 公共约束
→ Main 启动全部声明的 Subsystem Process
→ 为每次 Launch Attempt 注入 descriptor key、Control Endpoint 和 Bootstrap Credential
→ Subsystem 主动连接 Main
→ subsystem.hello 完成身份绑定与协议版本协商
→ Main 将连接标记为 identified
→ Subsystem 通过 subsystem.status 报告 initializing / ready / stopping / failed
→ 全部声明 Subsystem ready
→ Subsystem Bootstrap 完成
→ Renderer 根据 Main 授权连接各 ready Subsystem
```

因此：

```text
connected ≠ identified ≠ ready
```

MVP 中所有 Descriptor 都是启动必需项；任一 unsupported Launcher 或任一声明 Subsystem 无法进入 ready 都使 Game Bootstrap 失败。当前不定义 `lazy` 字段。

Bootstrap 的精确 wire schema 由 [Main ⇄ Subsystem 控制与运行时生命周期协议 v1](../15-contracts/subsystem-control-lifecycle-protocol.md) 定义；架构层不复制其字段定义。

详见：[运行时启动与连接建立系统](./runtime-bootstrap-system.md)。

## 4. 栈式运行系统

负责 Frame 调用栈、激活周期、输入目标和调用返回关系。

调用栈只控制 Frame / Input，不控制 Render 生命周期。

详见：[栈式运行系统](./stack-runtime-system.md)。

## 5. 运行承载系统

核心规则：

```text
每个 Subsystem / System 一个 Runtime Container
每个 Container 可以承载 0..N Frame / Input Context
每个 Container 可以拥有 0..N Render Context
每个 Container 与 Renderer 之间最多一条长期 System Data Connection
Frame 与 Render 没有平台级所有权绑定
```

详见：[运行承载系统](./runtime-hosting-system.md)。

## 6. 通信系统

通信分为：

```text
Control Plane
    Subsystem ⇄ Main
    Renderer ⇄ Main

System Data Plane
    Subsystem ⇄ Renderer
    ├── Connection Layer
    ├── Render Update Protocol
    └── User Input Protocol

Content Plane
    Runtime / Renderer ⇄ Readonly Content Service
```

Render Update 使用独立 Render 身份；User Input 使用 Frame / Activation 身份。两者共享 System Transport，但不共享业务生命周期、Sequence 或恢复语义。

详见：[通信系统](./communication-system.md)。

## 7. 渲染系统

Renderer 接收各 Subsystem 发布的声明式 Render State，在本地维护 Render Store，并协调为可信 DOM、Canvas 或 WebGL 视图。

Renderer 不从 Frame Stack 推导哪些 Render 应显示，也不因 Frame suspend / close 自动隐藏或删除 Render。

详见：[渲染系统](./rendering-system.md)。

## 8. 存储与内容系统

Content API 只提供只读数据与资源。受控 Subsystem Launcher 是 Main 的运行能力，不属于 Content API。

Desktop MVP 的 Launcher Type 为 `nodejs`；`launcher.entry` 的路径基准和安全规则仍是待冻结契约问题，不能从当前实现推导稳定保证。

详见：[存储与内容系统](./storage-system.md)。

## 9. 状态所有权

```text
LoomRealm Main
    Session
    Subsystem Descriptor / Runtime Registry
    Runtime Container 生命周期观察
    Frame Stack / Activation / Input Target
    Connection Authority

Subsystem Runtime Container
    本 Subsystem 的权威业务状态和规则
    Frame Input Handler / Frame 关联（如需要）
    Render Registry / Render State
    System 级共享资源和缓存

Web Renderer
    Main Control State 的只读镜像
    System Data Connection Registry
    Render Store
    Frame Input 路由状态
    DOM / Canvas / WebGL 与非权威表现状态
    原始输入设备状态

Content Service
    安装登记、只读内容定位、校验和资源交付
```

任何状态都必须能够回答：谁是权威拥有者、谁可以修改、谁只能读取或投影、断线或重载后从哪里恢复。

## 10. 桌面承载

```text
LoomRealm Main Process
FSDB Content Service Process
Hostra Electron Main Process
Hostra Renderer Process / LoomRealm Web Renderer
每个已声明 Subsystem 一个 Subsystem Process
```

通信：

```text
Subsystem Process → Main
    每 Subsystem 一条长期 Control WebSocket

Renderer → Main
    每会话一条长期 Control WebSocket

Renderer ⇄ Subsystem Process
    每 Subsystem 一条长期 Data WebSocket

Runtime / Renderer ⇄ Content Service
    localhost HTTP Fetch
```

Hostra 不承载 LoomRealm Main，也不解释 Frame、Render、Input 或业务消息。

## 11. PWA 承载

```text
Window
    Web Renderer

Main Runtime Dedicated Worker
    Session、Frame Stack、Input Target、System Worker Registry

每个 Subsystem 一个 Dedicated Worker
    业务 Runtime、Frame/Input Contexts、Render Contexts

Service Worker
    same-origin Readonly Content API

OPFS / Cache Storage
    已安装游戏包和资源
```

PWA 的 Launcher Descriptor 映射尚未冻结；不得把 Desktop `nodejs` Profile 直接解释为浏览器 Worker 启动契约。

## 12. 核心不变量

1. 进程 / Worker 隔离粒度是 Subsystem，不是 Frame；
2. Frame 是逻辑调用 / User Input Context；
3. Render 生命周期完全由 Subsystem 控制；
4. Main 不维护 Render Registry；
5. Renderer 不从 Frame Stack 推导 Render；
6. System Data Connection 的存在不依赖 Frame 数量；
7. Desktop MVP 使用 `key + nodejs + eager all-required bootstrap`；
8. Control Bootstrap 使用 connection-bound identity，`ready` 是 Runtime Status；
9. 旧协议中的 `systemId` 不通过架构文档静默改义；
10. Content API 与 Launcher 是不同能力边界。