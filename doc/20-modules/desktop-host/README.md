# Hostra 桌面宿主模块设计

> 层级：模块设计  
> 状态：Active Design  
> 稳定程度：Experimental  
> 主要定义：Hostra 窗口宿主、LoomRealm Desktop Runtime 拓扑、WebSocket/HTTP 适配和安全边界  
> 依赖：[运行时启动与连接建立系统](../../10-architecture/runtime-bootstrap-system.md)、[Desktop Node.js Launcher Profile v1](../../15-contracts/nodejs-launcher-profile-v1.md)、[运行承载系统](../../10-architecture/runtime-hosting-system.md)、[通信系统](../../10-architecture/communication-system.md)  
> 最近复核：2026-08-03

## 1. Hostra 边界

Hostra 是独立 Electron Shell，通过自己的 JSON-RPC 接口打开本地 Web UI 窗口。

Hostra：

- 创建/管理 BrowserWindow；
- 提供桌面生命周期；
- 不承载 LoomRealm Main；
- 不启动 LoomRealm Subsystem；
- 不解释 Subsystem、Frame、Activation、Render、Input 或 Content Payload；
- 不代理 Renderer ⇄ Subsystem 业务数据。

Desktop 的 LoomRealm 通信：

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
├── Launcher Target Resolver
├── Launcher / Launch Attempt Registry
├── Runtime Supervisor
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

链路边界：

```text
链路 1
Main Launcher
→ validated Entry
→ Launch Attempt / Bootstrap Token
→ spawn + Supervisor
→ public state remains starting

链路 2
Process connects Main
→ connected
→ subsystem.hello
→ identified
→ subsystem.status(initializing?)
→ subsystem.status(ready + rendererDataEndpoint)
```

因此：

```text
spawn success ≠ connected ≠ identified ≠ ready
```

后续同一 Control Connection 可以承载 Frame / Call Control，以及未来冻结的 shutdown / heartbeat / diagnostics 能力。

## 7. Subsystem Process Launcher Adapter

Desktop v1：

```text
launcher.type = nodejs
```

Process Launcher 必须遵循 [Desktop Node.js Launcher Profile v1](../../15-contracts/nodejs-launcher-profile-v1.md)：

- 只接受安全解析后的 `ResolvedLauncherTarget`；
- Entry 位于 Installation Root 内，路径链禁止 symlink/junction/reparse redirect；
- Host 选择具体 Node.js Runtime；
- Game Package 不提供 Node flags / argv；
- `shell = false`；
- `cwd = Installation Root`；
- 每次 Launch Attempt 生成新的 Bootstrap Token；
- Token 在 Process spawn 前注册到 Main Control authentication state；
- 通过 `LOOMREALM_BOOTSTRAP_CONTEXT` 传递 version / subsystemKey / controlEndpoint / bootstrapToken；
- child environment 由安全基线 + validated descriptor env + LoomRealm reserved env 显式构造；
- 不默认继承 Main 完整 ambient environment；
- 监听 spawn error / exit / signal；
- 执行有限关闭期限并提供强制终止；
- PID / launchId / Process Handle 不作为协议身份；
- v1 不自动 restart failed Runtime。

当前不支持 Rust/C++/Go/Java/.NET/Shell/Executable 等其他 Launcher Type。

## 8. Node.js Trust Boundary

Desktop v1 的 Subsystem JavaScript 是 trusted executable code。

```text
safe launcher.entry
    = Main 只执行 Installation 内已声明、已验证的 Entry

Node.js sandbox
    = v1 不提供
```

因此不能声称 Node Subsystem 因为使用 Content API 就没有 OS 文件系统、网络或 child_process 能力。

不可信第三方 executable sandbox、Publisher Trust、签名和 OS capability broker 都是后续独立 Profile 的问题。

## 9. Renderer ⇄ Subsystem System Data WebSocket

每个 Runtime Container 与 Renderer 最多一条长期 Data WebSocket：

```text
Renderer
    ⇄ System Data WebSocket
Subsystem Process
    ├── Connection Layer
    ├── Render Update Protocol
    └── User Input Protocol
```

物理连接与 Frame 数量无关，可以同时服务 0..N Render Context 与 0..N Frame Input Context。

Main 签发 System Data Grant。Grant 不绑定 `frameId`、`activationId` 或 Render identity。

## 10. Data Protocol 域

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

不得使用统一 Frame Logical Stream 同时管理 Render State 与 User Input。

## 11. Renderer 重载

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

## 12. FSDB Content Service

独立 Content Service 提供：

```text
GET /_lr/v1/games/{installationId}/manifest
GET /_lr/v1/games/{installationId}/records/{namespace}/{key}
GET /_lr/v1/games/{installationId}/groups/{namespace}/{key}
GET /_lr/v1/games/{installationId}/resources/{namespace}/{key}
```

Subsystem Runtime 的普通业务内容访问与 Renderer Resource Client 使用 Fetch；Content Service 不接受任意物理路径。

Content API 的能力边界与 Node Process 的 OS 权限是不同层次。

## 13. Desktop 安全策略

Hostra：

- `contextIsolation = true`；
- `nodeIntegration = false`；
- 尽可能启用 Sandbox；
- 限制导航、`window.open` 和外部 URL；
- 不暴露通用 Electron IPC。

LoomRealm localhost services / Launcher：

- loopback only；
- 随机端口 / 高熵 credential；
- Origin 校验；
- Launcher Entry Installation containment；
- Process creation 不经过 Shell；
- Bootstrap Token 绑定 Launch Attempt 与 Descriptor Key；
- child environment 不默认继承 Main 全量环境；
- System Data Grant 绑定 Session / Subsystem / Connection；
- User Input 校验 Frame / Activation；
- Render Update 限制当前 Subsystem Render namespace；
- 大小、速率与并发限制；
- 错误不泄露 token 或不必要内部路径。

## 14. 故障处理

- Entry / env / Launcher 校验失败：Game Bootstrap fatal；
- Process spawn 失败：Game Bootstrap fatal；
- Process 在 ready 前退出：Game Bootstrap fatal；
- hello/token/version 失败：Runtime Bootstrap fatal；
- Runtime 无法 ready：Game Bootstrap 失败；
- ready 后 unexpected Process exit：Runtime failure，不自动 restart；
- System Data WebSocket 断开：停止该 Subsystem 普通输入，Render Store 按 Render Protocol 保留/恢复；
- Subsystem Process 崩溃：其 Control/Data Connection 失效，Main 处理全部受影响 Frame；
- Renderer 崩溃：Subsystem Process 可继续存在；
- LoomRealm Main 崩溃：第一阶段终止其管理的 Subsystem；
- Content Service 崩溃：内容请求失败，不隐式改变 Frame 或 Render 生命周期。

## 15. 核心不变量

- Hostra 不承载 LoomRealm Main 或业务协议；
- 每个 Subsystem 一个独立 Process；
- 每个 Process 可以承载多个 Frame/Input Context 和 Render Context；
- Desktop v1 Launcher = `nodejs`；
- Entry 在 spawn 前安全解析；
- Node Runtime 由 Host 选择，shell=false；
- Bootstrap Token 在 spawn 前注册；
- spawn success 仍属于 `starting`；
- Supervisor 观察实际 exit；
- v1 不自动 restart；
- Node.js executable code 是 trusted code，不宣称 sandbox；
- Renderer 与每个 Process 最多一条 Data WebSocket；
- Frame 生命周期不控制 Data WebSocket 或 Render；
- Content = readonly HTTP API；
- 普通 User Input 和 Render Update 不通过 Main/Hostra 转发。
