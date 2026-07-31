# Hostra 桌面宿主模块设计

> 层级：模块设计  
> 状态：Active Design  
> 稳定程度：Experimental  
> 主要定义：Hostra 窗口宿主、LoomRealm 桌面连接和安全边界  
> 依赖：[运行承载系统](../../10-architecture/runtime-hosting-system.md)、[通信系统](../../10-architecture/communication-system.md)  
> 最近复核：2026-08-01

## 1. 当前事实

Hostra 是独立 Electron Shell，通过 WebSocket JSON-RPC 打开本地 Web UI 窗口。LoomRealm 不运行在 Hostra Electron Main 中，也不能直接创建 `MessageChannelMain` 或取得通用 Preload IPC。

因此桌面第一阶段正式使用：

```text
控制和 Frame 数据
    localhost WebSocket

FSDB 与资源
    localhost HTTP Content API
```

Electron MessagePort Broker 仅作为未来可选增强，不是当前依赖。

## 2. 桌面进程结构

```text
LoomRealm Main Process
├── Frame Stack
├── Runtime Container Registry
├── Subsystem Process Supervisor
└── Channel / Content Grant Authority

FSDB Content Service Process
└── Readonly HTTP Content API

Hostra Electron Main Process
└── BrowserWindow 与桌面生命周期

Hostra Renderer Process
└── LoomRealm Web Renderer

Subsystem Process: <systemId>
└── 多个 Frame Runtime
```

Hostra 不理解 System、Frame、Activation、Scope 或 FSDB 业务语义。

## 3. Hostra Window Adapter

LoomRealm 通过 Hostra 已有 JSON-RPC 入口请求打开 Renderer URL：

```text
LoomRealm Main 启动本地 Web 应用服务
→ 生成 Renderer 启动 URL
→ 调用 Hostra openWindow
→ Hostra 创建 BrowserWindow
→ Renderer 连接 LoomRealm Main 控制 WebSocket
```

Window Adapter 负责：

- 请求创建和关闭窗口；
- 传递应用 URL、窗口大小和允许的宿主选项；
- 接收窗口关闭和崩溃通知；
- 不将 LoomRealm 协议 Payload 经 Hostra Main 转发。

## 4. Renderer Web 应用服务

LoomRealm 可以由 Main Process 或独立静态服务提供 Renderer 资源：

```text
http://127.0.0.1:<random-port>/
```

要求：

- 只监听 loopback；
- 使用随机端口；
- 限制可导航 Origin；
- 设置 CSP；
- 不暴露目录列表；
- 静态文件和控制 WebSocket 使用明确路径；
- 会话退出后关闭服务。

## 5. Main 控制 WebSocket

Renderer 与 LoomRealm Main 建立长期控制连接，负责：

- Stack Snapshot；
- Frame 生命周期通知；
- Input Target；
- Frame Channel Grant；
- 会话错误和诊断；
- Renderer 重连。

该连接不承载普通输入、Client State 或资源字节。

## 6. Frame 数据 WebSocket

每个 Frame 有独立数据连接：

```text
Hostra Renderer
⇄ localhost WebSocket
⇄ 对应 Subsystem Process 内的 Frame Runtime
```

程序主系统签发 Frame Channel Grant：

```text
sessionId
systemId
frameId
activationId
connectionId
endpoint
一次性 token
expiresAt
```

Renderer 首条请求完成认证后，普通输入和 Client State 直接在 Renderer 与 Frame Runtime 之间传输。

一个 Subsystem Process 可以接受多个 Frame WebSocket，并按 `frameId` 路由到独立 Frame Runtime。

## 7. Subsystem Process Adapter

程序主系统而不是 Hostra 负责启动业务子系统进程。

Process Adapter：

- 按 `systemId` 启动一个独立进程；
- 支持 Node.js、Rust、C++、Go、Java、.NET 等实现；
- 建立 Main ⇄ Container 控制 WebSocket；
- 监听进程退出和错误；
- 执行有限关闭期限；
- 不使用 PID 作为 Frame 身份；
- 同一进程承载多个 Frame Runtime。

## 8. FSDB Content Service

独立 Content Service 只提供逻辑只读 HTTP API：

```text
GET /_lr/v1/games/{installationId}/manifest
GET /_lr/v1/games/{installationId}/records/{namespace}/{key}
GET /_lr/v1/games/{installationId}/groups/{namespace}/{key}
GET /_lr/v1/games/{installationId}/resources/{namespace}/{key}
```

Subsystem Process 和 Renderer Resource Client 都使用 Fetch 访问。服务不接受任意物理路径。

## 9. 桌面安全策略

Hostra 应保持：

- `contextIsolation = true`；
- `nodeIntegration = false`；
- 在兼容条件允许时启用 Sandbox；
- 限制导航、`window.open` 和外部 URL；
- 不向页面暴露通用 Electron IPC；
- 不允许 Renderer 启动进程或直接访问文件系统。

LoomRealm 本地服务必须：

- 只监听 `127.0.0.1` / `::1`；
- 使用随机端口和高熵 token；
- 验证 Origin；
- 限制消息和请求大小、速率与并发；
- Frame 出栈后撤销 Grant；
- Content Grant 绑定安装实例；
- 错误不泄露路径、token 和内部堆栈。

## 10. Renderer 重载

```text
Renderer 重载
→ 重新连接 Main 控制 WebSocket
→ 获取 stack.snapshot
→ 为每个有效 Frame 取得新 Grant
→ 重建 Frame WebSocket
→ 请求 state.resync
→ 重建 Store 和画面
```

Main、Subsystem Process 和 Frame Runtime 可以继续存在。

## 11. 故障处理

- Frame WebSocket 断开：停止该 Frame 输入，通知 Main，保留或清理画面由 Stack 状态决定；
- Subsystem Process 崩溃：该 System Container 的全部 Frame 失败；
- Renderer 崩溃：重载并恢复 Stack 和 Snapshot；
- LoomRealm Main 崩溃：第一阶段终止全部子系统并关闭窗口；
- Hostra Main 崩溃：Renderer 消失，LoomRealm 结束当前桌面会话；
- Content Service 崩溃：内容请求失败，但已加载 Frame 权威状态不应被错误地重置。

## 12. 可选 MessagePort Broker

未来 Hostra 可以提供窄化 Broker：

```text
LoomRealm 请求建立 Frame Channel
→ Hostra Main 创建 MessageChannelMain
→ 端口交给 Renderer 和受控 Node Utility Process
```

该 Profile 只适用于 Hostra 明确支持且子系统承载兼容的环境。它不能成为跨语言桌面子系统或 PWA 的公共前提。

即使增加 Broker，Frame 数据通道契约也保持不变。

## 13. 核心不变量

- Hostra 不承载 LoomRealm Main 或业务 Runtime；
- Hostra 不解释 Frame 和 Scope；
- 普通输入和 Client State 不通过 Hostra Main；
- 每个 System 一个独立 Subsystem Process；
- 每个 Frame 一个独立 WebSocket 数据连接；
- 一个 System Process 可以承载多个 Frame；
- FSDB 通过逻辑只读 HTTP API 访问；
- Renderer 不获得通用 Electron IPC、文件系统或子进程能力。

## 14. 测试入口

- Hostra 打开 Renderer URL；
- Main 控制 WebSocket 建立和重连；
- 一个 System Process 中两个 Frame 的独立数据 WebSocket；
- Frame Grant 过期、伪造和撤销；
- Renderer 重载恢复；
- Subsystem Process 崩溃影响多个 Frame；
- Content API CORS、token、MIME 和缓存；
- Hostra 不参与普通输入和 Client State 转发。

旧详细资料：[Hostra 桌面程序主系统与渲染宿主](../../architecture/hostra-desktop-client-host.md)。其中“Hostra Main 承载 LoomRealm Main 和 MessagePort”结论已被本文替代。
