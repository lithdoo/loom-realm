# 运行时启动与连接建立系统

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：游戏启动后各进程 / Worker 的创建顺序、Subsystem Bootstrap、Control Connection 与 System Data Connection 的建立关系  
> 依赖：[系统架构总览](./system-overview.md)、[运行承载系统](./runtime-hosting-system.md)、[通信系统](./communication-system.md)  
> 被以下文档实现：[程序主系统模块](../20-modules/main-system/README.md)、[Hostra 桌面宿主](../20-modules/desktop-host/README.md)、[PWA 宿主](../20-modules/pwa-host/README.md)  
> 最近复核：2026-08-02

## 1. 设计目标

本系统定义 LoomRealm 会话启动后，各个运行实体如何被创建、如何确认可用，以及各类长期通信连接如何建立。

核心原则：

> LoomRealm Main 是会话与运行拓扑的编排者；游戏入口声明本次会话全部 Subsystem 及其启动方式；Subsystem 由 Main 启动后主动连接 Main Control Endpoint；Renderer 不自行发现或启动 Subsystem，而是根据 Main 发布的连接授权建立每 System 一条数据连接。

Bootstrap 只决定进程 / Worker 与连接是否存在，不决定业务 Render 生命周期。

## 2. 参与方

桌面 Profile：

```text
LoomRealm Main Process
    会话、Subsystem 启动、Frame Stack、Input Target、连接授权

FSDB Content Service Process
    只读 Content API

Hostra Electron Main Process
    BrowserWindow 与桌面生命周期

Hostra Renderer Process
    LoomRealm Web Renderer

Subsystem Process: <systemId>
    一个声明的业务子系统进程
```

PWA 使用 Main Runtime Worker、System Worker、Window Renderer、Service Worker 映射相同逻辑边界，但具体 Launcher 能力受浏览器限制。

## 3. 游戏入口与 Subsystem Descriptor

程序主系统读取游戏入口时，除初始调用信息外，还必须得到本次会话全部 Subsystem Descriptor。

概念结构：

```text
Game Entry
├── initial
│   ├── systemId
│   └── params
└── subsystems[]
    ├── id
    ├── name
    ├── launcher
    │   ├── type
    │   └── entry
    └── env
```

Subsystem Descriptor 描述“这个 System 如何启动”，不是当前进程实例。

当前第一阶段只要求一种 Launcher Profile：

```text
launcher.type = javascript
launcher.entry = 一个受游戏入口明确声明的 JavaScript 入口
```

后续可以增加 `shell`、`executable` 或其他 Launcher Profile。平台遇到自身不支持的 Launcher Type 时必须明确拒绝启动，不能静默采用其他方式。

游戏声明的环境变量与 LoomRealm 保留环境变量属于不同命名空间。游戏不能覆盖 Main 注入的控制连接地址、`systemId` 或其他安全身份字段。

## 4. Main 基础设施启动

会话启动后，LoomRealm Main 首先建立自身基础设施：

```text
loom-realm start <installation>
→ 创建 Session
→ 启动 Main Control Endpoint
→ 启动 Renderer Web Service
→ 启动或取得 Readonly Content Service
→ 读取并校验 Game Manifest / Entry
→ 建立 Subsystem Descriptor Registry
```

Main Control Endpoint 必须先于业务 Subsystem 启动可用，因为该 Endpoint 会通过启动环境传入所有桌面 Subsystem Process。

Renderer Web Service 和 Content Service 的具体进程承载可以变化，但在 Renderer 或 Subsystem 使用相应能力前必须 ready。

## 5. 桌面 Subsystem Bootstrap

第一阶段桌面会话启动时，Main 根据 Game Entry 中声明的全部 Subsystem Descriptor 启动对应进程。

对于一个 Subsystem：

```text
Main
→ 解析 launcher
→ 准备启动环境
→ spawn Subsystem Process
→ 等待该 Process 主动连接 Main Control WebSocket
→ 验证连接身份
→ 等待 Subsystem 自身初始化
→ 接收 ready(systemId)
→ 将 Runtime Container 标记为 ready
```

Main 注入的保留环境至少在概念上包含：

```text
LOOM_SYSTEM_ID
LOOM_MAIN_CONTROL_ENDPOINT
```

还可以包含后续协议需要的 Session、授权或诊断字段。精确环境变量名和认证字段由契约层冻结。

Descriptor 中声明的 `env` 作为额外启动参数注入，但不能覆盖 LoomRealm 保留环境。

## 6. Main ⇄ Subsystem Control Connection

桌面 Control Connection 的连接方向固定为：

```text
Subsystem Process
    ── connect ──▶
LoomRealm Main Control WebSocket Server
```

Main 不需要等待子进程先开放随机控制端口再反向连接。

Container 概念状态至少区分：

```text
declared
→ starting
→ connected
→ ready
→ stopping / failed
```

其中：

```text
WebSocket connected ≠ Subsystem ready
```

只有当 Subsystem 完成自身初始化，并通过已建立的 Control Connection 发送与启动 Descriptor 相同 `systemId` 的 `ready` 事件后，Main 才将该 Runtime Container 视为 ready。

连接建立、认证、ready 方法名、超时和重复连接规则由后续 Control Protocol 契约冻结。

## 7. Renderer Bootstrap

Main 基础 Web 服务可用后，通过 Hostra 的现有窗口 RPC 请求打开 Renderer URL：

```text
LoomRealm Main
→ Hostra openWindow(Renderer URL)
→ Hostra Main 创建 BrowserWindow
→ Renderer 加载 LoomRealm Web 应用
→ Renderer 主动连接 LoomRealm Main Control Connection
```

Hostra 不解释 LoomRealm 的 System、Frame、Render 或 Input Payload，也不作为 Renderer ⇄ Subsystem 数据代理。

Renderer ⇄ Main Control Connection 是 Renderer 会话级长期连接，负责接收：

- Session 和当前 System 状态；
- Frame Stack / Activation / Input Target；
- System Data Connection 建立、替换和撤销信息；
- 会话错误和诊断。

普通 User Input 和 Render Update 不通过 Main 转发。

## 8. Renderer ⇄ Subsystem System Data Connection

当某 Subsystem 已 ready，并允许 Renderer 与其直接交换数据时，Main 为该 `systemId` 发布 System Data Connection Grant / Connection Information。

桌面链路：

```text
Subsystem ready
→ Subsystem Renderer Data Endpoint 可用
→ Main 生成 System Data Connection 授权
→ Main 通过 Renderer Control Connection 发布授权
→ Renderer 主动连接 Subsystem Data WebSocket
→ Connection Layer 完成认证 / 协商
→ System Data Connection ready
```

物理连接粒度固定为：

```text
Renderer × systemId
    最多一条有效 System Data Connection
```

它与 Frame 数量无关。一个 System 可以在零个 Frame 存在时保持 Renderer Data Connection，也可以同时服务多个 Frame Input Context 和多个 Render Context。

## 9. Frame / Input 与 Render 的独立启动链

System Data Connection ready 以后，平台不定义“创建 Frame 就自动创建 Render”的规则。

Frame / Input 链：

```text
Main
→ 建立 Frame 调用 / 输入上下文
→ 分配 frameId
→ Activation
→ Input Target
→ Renderer User Input Protocol
→ Subsystem 对应 Frame Input Handler
```

Render 链完全由 Subsystem 控制：

```text
Subsystem
→ 创建任意 Render Context
→ Render Update Protocol
→ Renderer Render Store
→ DOM / Canvas / WebGL
```

两条链可以在时间上交错：

- Subsystem 可以在没有任何 Frame 时发布 Render；
- Frame 尚未入栈或未成为 Input Target 时，已有 Render 可以继续存在；
- Frame suspend / resume / close 不产生任何隐式 Render 行为；
- 如果某个 Subsystem 希望 Frame 生命周期驱动 Render 生命周期，必须由该 Subsystem 自己显式实现。

## 10. 桌面总体拓扑

```text
                            Hostra Main
                                │
                                │ BrowserWindow
                                ▼
                             Renderer
                         ┌───────┼────────┐
                         │       │        │
                Control WS       │        │ System Data WS / systemId
                         │       │        ▼
                         ▼       │   Subsystem Process A
                  LoomRealm Main │        ▲
                         ▲       │        │ Control WS
                         │       │        │
                         └───────┼────────┘
                                 │
                                 └──── System Data WS ──▶ Subsystem Process B

LoomRealm Main / Renderer / Subsystems
            │
            └──── HTTP Fetch ────▶ FSDB Content Service
```

对于多个 System：

```text
Main
├── Control WS ← system A
├── Control WS ← system B
└── Control WS ← system C

Renderer
├── Data WS ⇄ system A
├── Data WS ⇄ system B
└── Data WS ⇄ system C
```

Main 与每个 Subsystem 的 Control Connection、Renderer 与每个 Subsystem 的 Data Connection 是不同连接和不同职责平面。

## 11. 推荐启动时序

```text
1. LoomRealm Main Process 启动
2. 创建 Session
3. Main Control Endpoint ready
4. Renderer Web Service ready
5. Content Service ready
6. 读取 Game Manifest / Entry
7. 读取全部 Subsystem Descriptor
8. Main 启动全部声明的 Subsystem Process
9. 各 Subsystem 主动连接 Main Control WS
10. 各 Subsystem 完成初始化并发送 ready(systemId)
11. Main 维护 ready System 集合
12. Main 请求 Hostra 打开 Renderer
13. Renderer 主动连接 Main Control WS
14. Main 发布当前 System / Frame / Input Control State
15. Main 为可连接的 System 发布 Data Connection Grant
16. Renderer 每 System 建立一条 Data WebSocket
17. Connection Layer ready
18. Frame / Input 生命周期由 Main 控制
19. Render 生命周期由各 Subsystem 独立控制
```

步骤 8–13 的具体并发顺序可以由实现优化，只要满足依赖约束：Main Control Endpoint 必须先于 Subsystem connect；System Data Grant 必须引用有效 Subsystem；Renderer 不自行发现 System。

## 12. Renderer 重载

Renderer 重载时，Main 和 Subsystem Process 可以继续运行。

恢复流程按两个独立域进行：

```text
Renderer
→ 重连 Main Control Connection
→ 恢复当前 System Connection 状态
→ 为需要直接通信的 ready System 重建 Data Connection

Main
→ 恢复 Frame Stack / Activation / Input Target

Subsystem
→ 在各自 System Data Connection 恢复后
→ 按 Render Update Protocol 恢复自身 Render State
```

不能再从当前 Frame 集合推导“哪些 Render 必须恢复”，也不能通过 Frame 出栈推导 Render 删除。

## 13. 故障边界

- Subsystem 在启动期限内未连接 Main：该 System 启动失败；
- Subsystem 已连接但未发送合法 `ready(systemId)`：该 System 不可用；
- `ready` 中的 `systemId` 与 Descriptor 不一致：身份 / 协议错误；
- Subsystem Process 退出：其 Control Connection 和 System Data Connection 失效，Main 更新 System 状态；
- System Data Connection 断开：该 System 的 User Input 暂停；Render 恢复由 Render Update Protocol 负责；
- Renderer 崩溃：不要求结束 Subsystem；恢复时重建 Control / Data Connection；
- Main 崩溃：第一阶段不提供透明会话恢复，宿主应终止其管理的 Subsystem；
- Content Service 故障：新内容请求失败，但不得隐式改变 Frame 或 Render 生命周期。

## 14. 架构不变量

1. 游戏入口声明当前会话全部 Subsystem 及其 Launcher Descriptor；
2. 第一阶段桌面 Main 启动全部声明的 Subsystem Process；
3. Main Control Endpoint 在 Subsystem Process 启动前可用；
4. Subsystem 主动连接 Main，不要求 Main 反向发现子进程控制端口；
5. Control Connection 建立不等于 Subsystem ready；
6. `ready` 的 `systemId` 必须与启动 Descriptor 一致；
7. Renderer 不启动或自行发现 Subsystem；
8. Renderer 与每个 `systemId` 最多一条有效 System Data Connection；
9. Main Control、Subsystem Control 和 System Data Connection 的职责不可混用；
10. Frame / Input 生命周期与 Render 生命周期完全独立；
11. Main 不拥有 Render Registry，也不从 Frame Stack 推导 Render；
12. Render 的创建、更新、可见性、排序和销毁全部由 Subsystem 控制。

## 15. 相关文档

- [系统架构总览](./system-overview.md)；
- [运行承载系统](./runtime-hosting-system.md)；
- [通信系统](./communication-system.md)；
- [Renderer–Subsystem 协议分层](./renderer-subsystem-protocol-layers.md)；
- [栈式运行系统](./stack-runtime-system.md)；
- [模块子系统模型](./subsystem-model.md)。
