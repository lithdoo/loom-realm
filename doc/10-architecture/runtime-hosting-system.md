# 运行承载系统

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：System、Runtime Container、Frame/Input、Render、进程、Worker 与平台宿主之间的承载关系  
> 依赖：[系统架构总览](./system-overview.md)、[运行时启动与连接建立系统](./runtime-bootstrap-system.md)、[栈式运行系统](./stack-runtime-system.md)  
> 被以下文档实现：[程序主系统模块](../20-modules/main-system/README.md)、[桌面宿主模块](../20-modules/desktop-host/README.md)、[PWA 宿主模块](../20-modules/pwa-host/README.md)  
> 最近复核：2026-08-02

## 1. 设计目标

运行承载系统定义 LoomRealm 的逻辑 System 如何映射到桌面进程和浏览器 Worker，同时保持 System、Frame/Input、Render、通信和内容访问的所有权边界清晰。

核心结论：

> 每个 `systemId` 对应一个可复用的 Runtime Container；Frame 是 Main 管理的调用 / 输入上下文；Render 是 Subsystem 自主拥有的呈现上下文。Frame 和 Render 都不是独立进程或独立物理连接，且二者之间不存在平台级所有权绑定。

## 2. 核心术语

```text
System
    以 systemId 标识的业务扩展单元，例如 loom.map 或 loom.menu

Subsystem Descriptor
    Game Entry 中声明的 System 启动描述
    包含 id、name、launcher、env 等概念字段

Runtime Container
    System 的运行承载单元
    桌面为独立 OS 进程
    PWA 为 Dedicated Worker

System Data Connection
    Renderer 与一个 Runtime Container 之间的长期双向数据 Transport
    桌面为 localhost WebSocket
    PWA 为 MessagePort

Frame
    Main 管理的一次调用 / User Input 上下文
    拥有 frameId、调用关系和 Activation

Render Context
    Subsystem 管理的呈现上下文
    拥有独立 Render 身份与生命周期

Host
    提供窗口、页面、进程或 Worker 创建、平台生命周期与安全边界
```

进程 ID、Worker 身份、Connection ID、Frame ID 和 Render ID 不能互相替代。

## 3. 承载粒度

```text
每个 systemId
    一个有效 Runtime Container

每个 Runtime Container
    零个或多个 Frame / Input Context
    零个或多个 Render Context
    与 Renderer 最多一个有效 System Data Connection

每个 Frame
    一个调用 / 输入路由上下文

每个 Render Context
    一个 Subsystem 自主管理的呈现上下文
```

平台不规定：

```text
一个 Frame 必须有一个 Render
一个 Frame 必须有独立业务状态
一个 Render 必须属于某个 Frame
Frame close 必须删除 Render
```

这些关系如果存在，全部属于 Subsystem 内部实现。

## 4. Subsystem Descriptor 与 Container 启动

当前会话全部 Subsystem 由 Game Entry 的 Descriptor 声明。

第一阶段桌面 Profile 启动流程：

```text
Main 读取全部 Descriptor
→ 根据 launcher.type 选择 Launcher
→ 启动每个声明的 Subsystem Process
→ 通过环境注入 systemId、Main Control Endpoint 和 descriptor env
→ Subsystem 主动连接 Main
→ ready(systemId)
→ Registry 标记 Container ready
```

当前第一阶段只要求 JavaScript Entry Launcher。未来 Shell / Executable 等 Profile 由平台能力决定是否支持。

详细顺序见：[运行时启动与连接建立系统](./runtime-bootstrap-system.md)。

## 5. Container 级共享与内部自由度

Runtime Container 可以共享：

- 系统代码和 Schema；
- 协议编解码器；
- Renderer System Data Connection；
- 只读 Content Client；
- Repository 和并发请求去重；
- 已解析的不可变内容；
- WASM Module、纹理描述和其他只读缓存；
- Subsystem 自己定义的共享业务状态；
- Render Manager 与 Render Registry。

平台只要求不同 Frame 输入路由身份不能混淆，不要求业务状态、Runtime Core、Tick 或 Projector 必须按 Frame 拆分。

Subsystem 可以采用：

```text
一个共享 world state + 多个 Frame Input Handler
多个独立 session state + 多个 Render
没有 Frame 但持续存在的 Render
其他满足协议边界的内部结构
```

## 6. Frame 隔离边界

Frame 必须独立维护的公共语义只有调用 / 输入相关身份，例如：

- `frameId`；
- 所属 `systemId`；
- 调用者关系；
- 当前状态；
- `activationId`；
- User Input 路由和必要的输入顺序状态。

以下内容不再是平台要求的 Frame 必备状态：

- 权威业务世界状态；
- Runtime Core；
- Execution Loop；
- Client State Projector；
- Render State Revision；
- Render Scope；
- Render Event Queue。

这些内容由 Subsystem / Render Protocol 自己定义。

## 7. Render 承载边界

Render Context 由 Runtime Container 创建、更新和销毁。

一个 Container 可以：

- 在任何 Frame 创建前建立 Render；
- 在 Frame suspended 时继续更新 Render；
- 在 Frame close 后保留某些 Render；
- 同时维护多个 Render；
- 根据自身业务手动将某个 Frame 与某个 Render 关联。

Main 不维护 Render Registry。Renderer 也不能从 Main Stack 推导哪些 Render 应存在。

## 8. 程序主系统位置

程序主系统独立于业务子系统，拥有：

```text
Session
Subsystem Descriptor Registry
Runtime Container Registry
Frame Registry
Frame Stack
Activation
Input Target
Container Control Connections
System Data Channel Authority
```

程序主系统不持有子系统业务状态，不维护 Render Registry，也不转发普通 User Input 或 Render Update Payload。

## 9. 桌面承载 Profile

```text
LoomRealm Main Process
├── Session / Subsystem Registry
├── Frame Stack
├── Runtime Container Registry
├── Subsystem Process Supervisor
└── System Data Channel Authority

FSDB Content Service Process
└── Readonly Content API → 游戏包目录

Hostra Electron Main Process
└── 窗口与桌面宿主

Hostra Renderer Process
├── Main Control State
├── System Data Connection Registry
├── Render Store
├── Input Router
└── DOM / Canvas / WebGL

Subsystem Process: loom.map
├── Main Control WebSocket Client
├── Renderer Data WebSocket Server / Endpoint
├── Frame/Input Contexts
└── Render Contexts
```

桌面使用 localhost WebSocket 承载 Renderer ⇄ Main、Subsystem ⇄ Main 和 Renderer ⇄ Subsystem 连接。localhost HTTP 承载只读 Content API。

Hostra 只负责打开和管理 Web 窗口，不承载 LoomRealm Main，不解释 System、Frame 或 Render。

## 10. PWA 承载 Profile

```text
Window
└── Web Renderer

Main Runtime Dedicated Worker
├── Frame Stack
├── System Worker Registry
└── System Data Channel Authority

Dedicated Worker: loom.map
├── Main Control MessagePort
├── Renderer Data MessagePort
├── Frame/Input Contexts
└── Render Contexts

Service Worker
└── Readonly Content API

OPFS / Cache Storage
└── 已安装游戏包和资源
```

PWA 只支持浏览器可实现的 Launcher Profile。Shell / Native Executable 等桌面 Profile 不适用于 PWA。

## 11. Container 生命周期

概念状态：

```text
declared
→ starting
→ connected
→ ready
→ idle / serving
→ closing
→ absent

starting / connected / ready / serving
→ failed
```

其中：

- `starting`：Main 已根据 Descriptor 启动 Process / Worker；
- `connected`：Control Connection 已建立；
- `ready`：Subsystem 已完成自身初始化并发送合法 `ready(systemId)`；
- ready 不表示任何 Frame 或 Render 必须已经存在。

Container 生命周期与 Frame 生命周期、Render 生命周期三者彼此独立。

## 12. System Data Connection 生命周期

首次需要 Renderer 与某个 ready System 直接交换 Render / Input 数据时，Main 授权建立 System Data Connection。

连接可以服务：

```text
0..N Frame Input Context
0..N Render Context
```

因此：

- 创建或关闭 Frame 不创建或关闭物理 Data Connection；
- 创建或销毁 Render 不创建或关闭物理 Data Connection；
- 最后一个 Frame 关闭后连接可以继续服务 Render；
- 没有 Frame 时，System Data Connection 仍可存在；
- Container 退出会使该 System Data Connection 失效。

## 13. Container 崩溃

Container 退出或 Worker 发生不可恢复错误时：

```text
Main 标记 Container failed
→ Control Connection 失效
→ 撤销该 System 的 Renderer Data Connection
→ 停止该 System 相关 Frame 的普通输入
→ 按调用栈规则处理受影响 Frame
→ Renderer 保留或清理该 System Render Store 的具体恢复行为由 Render Protocol 冻结
```

第一阶段不要求透明恢复 Subsystem 权威业务状态。Renderer DOM / Canvas / WebGL 不能作为恢复源。

## 14. Renderer 重载

桌面 Renderer 重载时，Main 与 Subsystem Process 可以继续存在。

恢复分成两条独立链：

```text
Control recovery
    Renderer → Main
    → Session / System / Frame / Input Target

System data recovery
    Renderer → 每个需要连接的 ready System
    → 重建 System Data Connection
    → Render Protocol 恢复 Render State
    → User Input Protocol 恢复 Frame Input Context
```

不能通过当前 Frame 集合推导全部 Render，也不能假设每个 Frame 都需要 Render Snapshot。

## 15. 安全边界

- Main 只能启动 Game Entry 明确声明且 Launcher Profile 支持的 Subsystem；
- 游戏声明 env 不能覆盖 LoomRealm 保留启动环境；
- Container 只能声明自己的 `systemId`；
- `ready(systemId)` 必须与 Descriptor 一致；
- System Data Connection 认证绑定 Session、System 和 Connection 身份；
- User Input 消息必须校验 Frame / Activation；
- Render 消息只能修改发送 Subsystem 自己的 Render Namespace；
- Runtime Container 不获得任意宿主进程能力；
- Content API 只提供逻辑只读内容，不提供任意路径访问。

## 16. 架构不变量

1. 每个 `systemId` 同时最多一个有效 Runtime Container；
2. Runtime Container 的启动来源是 Game Entry Subsystem Descriptor；
3. Subsystem 主动连接 Main Control Endpoint；
4. Control Connection 建立不等于 Container ready；
5. Frame 是调用 / 输入上下文，不是业务状态或 Render 所有权单元；
6. 一个 Container 可以承载零个或多个 Frame 和零个或多个 Render；
7. Frame 和 Render 没有平台级所有权关系；
8. 每个 Runtime Container 与 Renderer 同时最多一个有效 System Data Connection；
9. System Data Connection 可以在没有 Frame 时存在；
10. Frame suspend / close 不关闭 System Data Connection，也不隐式改变 Render；
11. Render 的生命周期完全由 Subsystem 控制；
12. Service Worker 和 Content Service 不拥有游戏运行状态。

## 17. 相关文档

- [运行时启动与连接建立系统](./runtime-bootstrap-system.md)；
- [通信系统](./communication-system.md)；
- [模块子系统模型](./subsystem-model.md)；
- [渲染系统](./rendering-system.md)；
- [Renderer–Subsystem 协议分层](./renderer-subsystem-protocol-layers.md)；
- [ADR 0001：每个 System 一个 Runtime Container](../decisions/0001-system-container-per-system-id.md)；
- [ADR 0002：平台传输 Profile](../decisions/0002-platform-transport-profiles.md)。
