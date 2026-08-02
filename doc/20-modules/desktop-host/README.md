# Hostra 桌面宿主模块设计

> 层级：模块设计  
> 状态：Active Design  
> 稳定程度：Experimental  
> 主要定义：Hostra 窗口宿主、LoomRealm Desktop Runtime 拓扑、WebSocket/HTTP 适配和安全边界  
> 依赖：[运行时启动与连接建立系统](../../10-architecture/runtime-bootstrap-system.md)、[运行承载系统](../../10-architecture/runtime-hosting-system.md)、[通信系统](../../10-architecture/communication-system.md)  
> 最近复核：2026-08-02

## 1. Hostra 边界

Hostra 是独立 Electron Shell，通过自己的 JSON-RPC 接口打开本地 Web UI 窗口。

Hostra：

- 创建/管理 BrowserWindow；
- 提供桌面生命周期；
- 不承载 LoomRealm Main；
- 不启动 LoomRealm Subsystem；
- 不解释 Subsystem、Frame、Activation、Render、Input 或 Content Payload；
- 不代理 Renderer ⇄ Subsystem 业务数据。

Desktop MVP 的 LoomRealm 通信使用：

```text
Control / System Data
    localhost WebSocket

Content
    localhost HTTP
```

## 2. Desktop 进程结构

```text
LoomRealm Main Process
├── Session / Subsystem Descriptor Registry
├── Launcher / Runtime Supervisor
├── Control Connection Registry
├── Frame Stack / Input Target
└── System Data Connection Authority

FSDB Content Service Process
└── Readonly HTTP Content API

Hostra Electron Main Process
└── BrowserWindow / desktop lifecycle

Hostra Renderer Process
└── LoomRealm Web Renderer

每个已声明 Subsystem 一个 Subsystem Process
├── Main Control WebSocket Client
├── Renderer Data WebSocket Endpoint
├── 0..N Frame/Input Context
└── 0..N Render Context
```

进程隔离粒度 = Subsystem，不是 Frame。

## 3. Hostra Window Adapter

```text
LoomRealm Main 启动 Renderer Web Service
→ 生成 Renderer URL
→ Hostra openWindow(Renderer URL)
→ Hostra 创建 BrowserWindow
→ Renderer 加载 LoomRealm Web 应用
→ Renderer 连接 LoomRealm Main Control WebSocket
```

Adapter 不把 LoomRealm Payload 经 Hostra Main 转发。

## 4. Renderer Web Service

要求：

- loopback only；
- 随机端口；
- 限制可导航 Origin；
- CSP；
- 不暴露目录列表；
- 控制 WebSocket 使用明确路径；
- Session 退出后关闭服务。

## 5. Main Control WebSocket

Renderer ⇄ Main 一条会话级长期 WebSocket，负责：

- Session / Subsystem Runtime State；
- Frame Stack / Activation / Input Target；
- System Data Grant / replace / revoke；
- 会话错误、诊断和 Renderer reconnect。

不承载普通 User Input、Render Update 或资源主体。

## 6. Main ⇄ Subsystem Control WebSocket

连接方向：

```text
Subsystem Process
    ── connect ──▶
LoomRealm Main Control WebSocket Server
```

单个 Runtime Bootstrap：

```text
Main Node.js Launcher spawn process
→ Process connects Main
→ subsystem.hello(key, bootstrapToken, protocolVersions)
→ Connection identified
→ subsystem.status(initializing?)
→ subsystem.status(ready + rendererDataEndpoint)
```

`connected ≠ identified ≠ ready`。

Control identity 由 hello 绑定；ready status 不重新声明 Subsystem identity。

后续同一连接可以承载 Frame / Call Control、shutdown、heartbeat 和诊断。

## 7. Subsystem Process Launcher Adapter

Desktop MVP：

```text
launcher.type = nodejs
```

Process Launcher：

- 根据 Descriptor Key 启动一个独立 Node.js Subsystem Process；
- 为每次 Launch Attempt 生成 Bootstrap Credential；
- 注入 Main Control Endpoint、Descriptor Key、Credential 和 descriptor env；
- 监听退出和错误；
- 执行有限关闭期限；
- 不使用 PID 作为协议身份；
- 同一 Subsystem Process 可以承载多个 Frame/Input Context 和多个 Render Context。

当前 MVP 不声称 Rust/C++/Go/Java/.NET/Shell/Executable Launcher 已受支持。未来可增加其他受控 Launcher Type，但需要新契约能力。

`launcher.entry` 的最终路径基准和安全规则仍待冻结。

## 8. Renderer ⇄ Subsystem System Data WebSocket

每个 Runtime Container 与 Renderer 最多一条长期 Data WebSocket：

```text
Renderer
    ⇄ System Data WebSocket
Subsystem Process
    ├── Connection Layer
    ├── Render Update Protocol
    └── User Input Protocol
```

物理连接与 Frame 数量无关。

Data WebSocket 可以同时服务：

```text
0..N Render Context
0..N Frame Input Context
```

Main 签发 System Data Grant。当前旧协议示例使用：

```text
sessionId
systemId
connectionId
endpoint
token
expiresAt
```

其中 `systemId` 与 Descriptor `key` 的最终字段统一方式由 Connection Contract 冻结。

Grant 不绑定 `frameId`、`activationId` 或 Render identity。

## 9. Data Protocol 域

### Connection Layer

- 认证 Main Grant；
- 绑定 Session / Subsystem / Connection；
- 版本协商；
- heartbeat / replace / close。

### Render Update Protocol

- Subsystem → Renderer 为主；
- 使用独立 Render identity；
- Render State / Event / Recovery；
- 不受 Frame Activation 控制。

### User Input Protocol

- Renderer → Subsystem 为主；
- 使用 `frameId + activationId`；
- 只向当前 Main-declared Input Target 发送普通输入。

不得再使用统一 Frame Logical Stream 管理 Render State 与 User Input。

## 10. Renderer 重载

```text
Renderer 重载
→ reconnect Main Control
→ restore ready Subsystem / Frame / Input control state
→ Main 重新发布需要的 System Data Grant
→ Renderer 按 Subsystem 重建 Data WebSocket
→ restore Frame Input Registry
→ each Subsystem independently restores Render State
```

不能按当前 Frame 集合推导所有需要恢复的 Data Connection；零 Frame 的 Subsystem 仍可能拥有 Render。

不能逐 Frame `state.resync` 作为 Render 恢复模型。

## 11. FSDB Content Service

独立 Content Service 提供：

```text
GET /_lr/v1/games/{installationId}/manifest
GET /_lr/v1/games/{installationId}/records/{namespace}/{key}
GET /_lr/v1/games/{installationId}/groups/{namespace}/{key}
GET /_lr/v1/games/{installationId}/resources/{namespace}/{key}
```

Subsystem Runtime 和 Renderer Resource Client 使用 Fetch 访问；Content Service 不接受任意物理路径。

## 12. Desktop 安全策略

Hostra：

- `contextIsolation = true`；
- `nodeIntegration = false`；
- 尽可能启用 Sandbox；
- 限制导航、`window.open` 和外部 URL；
- 不暴露通用 Electron IPC。

LoomRealm localhost services：

- loopback only；
- 随机端口 / 高熵 credential；
- Origin 校验；
- Bootstrap Token 绑定 Launch Attempt 与 Descriptor Key；
- System Data Grant 绑定 Session / Subsystem / Connection；
- User Input 校验 Frame / Activation；
- Render Update 限制当前 Subsystem Render namespace；
- 大小、速率与并发限制；
- 错误不泄露路径、token 或内部堆栈。

## 13. 故障处理

- hello/token/version 失败：Runtime Bootstrap fatal；
- Runtime 无法 ready：MVP Game Bootstrap 失败；
- System Data WebSocket 断开：停止该 Subsystem 普通输入，Render Store 按 Render Protocol 保留/恢复；
- 单 Frame 输入错误：只影响该 Frame/Input Context；
- 单 Render 错误：只进入该 Render 的恢复/失败路径；
- Subsystem Process 崩溃：其 Control/Data Connection 失效，Main 处理全部受影响 Frame；
- Renderer 崩溃：Subsystem Process 可继续存在；
- LoomRealm Main 崩溃：第一阶段终止其管理的 Subsystem；
- Content Service 崩溃：内容请求失败，不隐式改变 Frame 或 Render 生命周期。

## 14. 核心不变量

- Hostra 不承载 LoomRealm Main；
- Hostra 不解释 LoomRealm 业务协议；
- 每个 Subsystem 一个独立 Process；
- 每个 Process 可以承载多个 Frame/Input Context；
- Renderer 与每个 Process 最多一条 Data WebSocket；
- Frame 生命周期不控制 Data WebSocket；
- Frame 生命周期不控制 Render；
- Desktop MVP Launcher = `nodejs`；
- Content = readonly HTTP API；
- 普通 User Input 和 Render Update 不通过 Main/Hostra 转发。