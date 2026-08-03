# LoomRealm 系统架构总览

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：顶层系统划分、状态所有权、运行承载、启动拓扑和系统关系  
> 依赖：[产品设计总览](../00-overview/product-vision.md)  
> 最近复核：2026-08-03

本文档只描述 LoomRealm 由哪些系统组成、各系统为什么存在以及它们如何协作。精确 Entry、Launcher、消息字段、模块拆分和分包方案由下层契约与模块文档定义。

## 1. 顶层结构

```text
游戏包
├── Manifest / Entry
├── Subsystem Descriptors
├── Launcher Entries
├── FSDB 数据
└── 资源主体
        │
        ├──────────────▶ LoomRealm Main
        │                  ├── Session / Subsystem Registry
        │                  ├── Launcher / Runtime Supervisor
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

桌面由独立 LoomRealm Main Process、FSDB Content Service、Hostra 和各 Subsystem Process 组成。PWA 使用 Window、Main Runtime Worker、每 Subsystem 一个 Dedicated Worker、Service Worker 和 OPFS 映射相同逻辑边界。

## 2. 核心对象

### Subsystem / System

Game Entry 中的 Subsystem Descriptor 使用全局唯一、稳定的 `key` 作为 Descriptor 身份，例如 `loom.map`、`loom.menu`。

现有部分 v1 数据协议仍使用 `systemId`。`systemId` 与 Descriptor `key` 的最终 wire 迁移或统一方式由对应协议版本冻结；架构层不通过全局替换提前改变旧协议字段含义。

### Runtime Container

一个 Subsystem 对应一个有效 Runtime Container：Desktop 为独立进程，PWA 为 Dedicated Worker。Container 是 Subsystem/System 级承载单元，不等于 Frame。

### Frame

Frame 是 Main 管理的一次调用 / 用户输入上下文。它用于调用栈、`frameId`、Activation、Input Target、输入路由和调用返回关系。

Frame 不是 Render 身份，也不是平台强制的业务状态所有权单元。平台不要求每个 Frame 拥有独立 Runtime Core、Projector、Render Tree、Revision 或 Renderer Store。

### Render

Render 是 Subsystem 完全拥有的呈现上下文。Subsystem 决定 Render 的创建、销毁、目标状态、排序、组合、可见性、更新和恢复。

公共架构不定义 Frame 与 Render 的所有权关系。Subsystem 可以内部显式关联二者，也可以完全不关联。

## 3. 运行时启动与结束

Desktop v1 启动：

```text
Main Control Endpoint ready
→ 一次性读取全部 Subsystem Descriptor
→ 校验完整 Descriptor 集合
→ 安全解析全部 required launcher.entry
→ 为各 Descriptor 创建 Launch Attempt / Bootstrap Token
→ 在 Main Control authentication state 注册 Token
→ Host-selected Node.js + shell=false 启动全部 required Process
→ Runtime Supervisor 接管各 Process
→ Subsystem 主动连接 Main
→ subsystem.hello 完成身份绑定与 Subsystem Control version negotiation
→ identified
→ subsystem.status(initializing?)
→ subsystem.status(ready + rendererDataEndpoint)
→ 全部声明 Subsystem ready
→ Renderer 根据 Main 授权连接各 ready Subsystem
```

因此：

```text
spawn success ≠ connected ≠ identified ≠ ready
```

正常 Runtime 结束由 Main 控制：

```text
Main establishes shutdown intent
→ subsystem.shutdown(reason)
→ subsystem.status(stopping) [optional]
→ Supervisor confirms Runtime exit
→ stopped
```

因此：

```text
shutdown Response ≠ stopped
status(stopping) ≠ stopped
```

没有 Main shutdown intent 的 Runtime exit 或 Control Connection loss 是 failure，即使 Process exit code 为 0。

当前全部 Descriptor 都是 eager / required；任一 unsupported Launcher、Entry/Process failure 或声明 Subsystem 无法进入 ready 都使 Game Bootstrap 失败。当前不定义 `lazy`。

Desktop v1 还冻结：

- `launcher.entry` 是 Installation Root 相对的安全 package path；
- Node Runtime 由 Host 选择；
- Game Package 不能提供 Node flags / argv；
- Process creation 不经过 Shell；
- child environment 显式构造；
- Subsystem Control v1 不支持 same-attempt reconnect / resume / automatic restart；
- Subsystem Control v1 不定义 application-level heartbeat；
- executable Subsystem JavaScript 属于 trusted code，当前不宣称 OS sandbox。

详见：[运行时启动与连接建立系统](./runtime-bootstrap-system.md)、[Game Package v2](../15-contracts/game-package-v2.md)、[Desktop Node.js Launcher Profile v1](../15-contracts/nodejs-launcher-profile-v1.md)、[Subsystem Control Protocol v1](../15-contracts/subsystem-control-lifecycle-protocol.md)。

## 4. 栈式运行系统

负责 Frame 调用栈、激活周期、输入目标和调用返回关系。

调用栈只控制 Frame / Input，不控制 Runtime Container 或 Render 生命周期。

Frame / Call 是独立协议域，可以复用已认证的 Main ⇄ Subsystem Control Connection，但不得重新定义 Runtime Bootstrap、Subsystem identity、ready、shutdown 或 restart 语义。

详见：[栈式运行系统](./stack-runtime-system.md)。

## 5. 运行承载系统

核心规则：

```text
每个 Subsystem / System 一个 Runtime Container
每个 Container 可以承载 0..N Frame / Input Context
每个 Container 可以拥有 0..N Render Context
每个 Container 与 Main 一条长期 Control Connection
每个 Container 与 Renderer 之间最多一条长期 System Data Connection
Frame 与 Render 没有平台级所有权绑定
```

详见：[运行承载系统](./runtime-hosting-system.md)。

## 6. 通信系统

通信分为：

```text
Control Plane
    Subsystem ⇄ Main
        Subsystem Control Protocol v1
        Frame / Call Protocol（独立域，待冻结）
    Renderer ⇄ Main

System Data Plane
    Subsystem ⇄ Renderer
    ├── Connection Layer
    ├── Render Update Protocol
    └── User Input Protocol

Content Plane
    Runtime / Renderer ⇄ Readonly Content Service
```

Subsystem Control v1 已冻结 `subsystem.hello / subsystem.status / subsystem.shutdown`、Runtime 状态机、错误 Envelope、limits 与 connection/shutdown failure semantics。

Render Update 使用独立 Render 身份；User Input 使用 Frame / Activation 身份。两者共享 System Transport，但不共享业务生命周期、Sequence 或恢复语义。

详见：[通信系统](./communication-system.md)。

## 7. 渲染系统

Renderer 接收各 Subsystem 发布的声明式 Render State，在本地维护 Render Store，并协调为可信 DOM、Canvas 或 WebGL 视图。

Renderer 不从 Frame Stack 推导哪些 Render 应显示，也不因 Frame suspend / close 自动隐藏或删除 Render。

详见：[渲染系统](./rendering-system.md)。

## 8. 存储、Launcher 与内容系统

Content API 只提供只读逻辑数据与资源。受控 Subsystem Launcher 是 Main 的运行能力，不属于 Content API。

Desktop v1 Launcher Type 为 `nodejs`，其 Entry/path/env/spawn/Supervisor 语义已经冻结。

必须区分：

```text
Content API capability
    不提供任意物理路径或执行能力

Desktop Node.js Process OS capability
    当前 v1 不提供 sandbox；executable code 属于 trusted code
```

不能从 Content API 的限制推导 Node Process 没有 `fs`、network 或 child_process 能力。

详见：[存储与内容系统](./storage-system.md)。

## 9. 状态所有权

```text
LoomRealm Main
    Session
    Subsystem Descriptor / Runtime Registry
    Launcher / Launch Attempt / Runtime Supervisor
    Runtime shutdown intent
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

## 10. Desktop 承载

```text
LoomRealm Main Process
FSDB Content Service Process
Hostra Electron Main Process
Hostra Renderer Process / LoomRealm Web Renderer
每个已声明 Subsystem 一个 Subsystem Process
```

通信 / 启动链：

```text
Main → Subsystem Process
    Desktop Node.js Launcher Profile v1

Subsystem Process ⇄ Main
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
    Session、Frame Stack、Input Target、Subsystem Worker Registry

每个 Subsystem 一个 Dedicated Worker
    业务 Runtime、Frame/Input Contexts、Render Contexts

Service Worker
    same-origin Readonly Content API

OPFS / Cache Storage
    已安装游戏包和资源
```

PWA 的 Launcher Descriptor → Worker Script、Bootstrap Credential 与 Control Transport Profile 尚未冻结；不得把 Desktop `nodejs` Process Profile 直接解释为浏览器 Worker 启动契约。

## 12. 核心不变量

1. 进程 / Worker 隔离粒度是 Subsystem，不是 Frame；
2. Frame 是逻辑调用 / User Input Context；
3. Render 生命周期完全由 Subsystem 控制；
4. Main 不维护 Render Registry；
5. Renderer 不从 Frame Stack 推导 Render；
6. System Data Connection 的存在不依赖 Frame 数量；
7. Desktop v1 使用 `key + nodejs + eager all-required bootstrap`；
8. Entry 在 Process spawn 前安全解析；
9. Bootstrap Token 在 Process spawn 前注册；
10. `spawn success ≠ connected ≠ identified ≠ ready`；
11. Control Bootstrap 使用 connection-bound identity，`ready` 是 Runtime Status；
12. Main 拥有正常 Runtime shutdown intent；
13. `stopped` 只来自 Supervisor 对实际退出的观察；
14. 没有 shutdown intent 的 Runtime exit / Control Connection loss 是 failure；
15. Subsystem Control v1 不定义 application heartbeat、reconnect、resume 或 automatic restart；
16. Frame / Call 与 Subsystem Control 是独立协议域，即使共享同一物理 Control Connection；
17. 旧协议中的 `systemId` 不通过架构文档静默改义；
18. Content API 与 Launcher 是不同能力边界；
19. Entry 路径安全不等于 Node.js Process sandbox。
