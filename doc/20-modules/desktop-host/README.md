# Hostra 桌面宿主模块设计

> 层级：模块设计  
> 状态：Active Design  
> 稳定程度：Experimental  
> 主要定义：Hostra 窗口宿主、LoomRealm Desktop Runtime 拓扑、WebSocket/HTTP 适配和安全边界  
> 依赖：[运行时启动与连接建立系统](../../10-architecture/runtime-bootstrap-system.md)、[Desktop Node.js Launcher Profile v1](../../15-contracts/nodejs-launcher-profile-v1.md)、[Subsystem Control Protocol v1](../../15-contracts/subsystem-control-lifecycle-protocol.md)、[Frame / Call Protocol v1](../../15-contracts/frame-call-protocol-v1.md)、[运行承载系统](../../10-architecture/runtime-hosting-system.md)、[通信系统](../../10-architecture/communication-system.md)  
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

Desktop LoomRealm transport：

```text
Control / System Data
    localhost WebSocket

Content
    localhost HTTP
```

## 2. Desktop Process Topology

```text
LoomRealm Main Process
├── Session / Subsystem Descriptor Registry
├── Launcher Target Resolver
├── Launch Attempt / Runtime Supervisor
├── Control Connection Registry
├── Frame Registry / Stack / Activation / Input Target
└── System Data Connection Authority

FSDB Content Service Process
└── Readonly HTTP Content API

Hostra Electron Main Process
└── BrowserWindow / desktop lifecycle

Hostra Renderer Process
└── LoomRealm Web Renderer

per-Subsystem Process
├── Main Control WebSocket Client
├── Renderer Data WebSocket Endpoint
├── 0..N Frame/Input Context
└── 0..N Render Context
```

Process isolation granularity = Subsystem, not Frame。

## 3. Hostra Window Adapter

```text
LoomRealm Main starts Renderer Web Service
→ Hostra openWindow(Renderer URL)
→ BrowserWindow
→ Renderer loads LoomRealm Web app
→ Renderer connects LoomRealm Main
```

Hostra Adapter 不转发 LoomRealm business payload。

## 4. Renderer Web Service

要求：

- loopback only；
- random port；
- restricted navigation Origin；
- CSP；
- no directory listing；
- explicit Control WebSocket path；
- Session end 后关闭服务。

## 5. Renderer ⇄ Main Control WebSocket

每 Session 一条长期 Control WebSocket，负责：

- Session / Subsystem Runtime State；
- Frame Stack / lifecycle mirror / Activation / Input Target；
- System Data Grant / replace / revoke；
- session error / diagnostics / reconnect。

不承载 ordinary User Input、Render Update 或 Content body。

Renderer 不拥有 Frame authority。

## 6. Main ⇄ Subsystem Control WebSocket

连接方向：

```text
Subsystem Process
    ── connect ──▶ LoomRealm Main Control WebSocket Server
```

启动：

```text
Launcher chain
→ spawn + Supervisor
→ public state starting
→ Process connects Main
→ connected
→ subsystem.hello
→ identified
→ optional initializing
→ ready
```

同一已认证 WebSocket 逻辑复用两个协议域：

```text
Subsystem Control Protocol v1
    Frozen
    Runtime identity / lifecycle / shutdown

Frame / Call Protocol v1
    Batch A Frozen
    Batch B-F Draft
```

共享物理 WebSocket MUST NOT 合并两套状态机。

Frame Batch A 当前必须保持：

```text
frameId Main-generated / Session unique / never reused
permanent Frame → descriptor.key assignment
callerFrameId immutable
lifecycle = starting / active / suspended / closing / closed
outcome separate from lifecycle
no Frame ready / frame.status
Activation unique / never reused / never rolls back
only active Frame has current Activation
```

## 7. Subsystem Process Launcher / Supervisor

Desktop v1：

```text
launcher.type = nodejs
```

Launcher：

- only validated `ResolvedLauncherTarget`；
- Host-selected Node Runtime；
- no Game-supplied flags / argv；
- `shell = false`；
- `cwd = Installation Root`；
- Bootstrap Token registered before spawn；
- explicit safe child environment；
- PID / launchId / Process Handle not protocol identity；
- no automatic restart。

Supervisor 配合 Main-owned shutdown intent：

```text
shutdown intent
→ subsystem.shutdown
→ finite deadline
→ force terminate if required
→ actual exit observation
→ stopped
```

没有 shutdown intent 的 Process exit 是 failure，即使 exit code = 0。

## 8. Node.js Trust Boundary

Desktop v1 Subsystem JavaScript 是 trusted executable code。

```text
safe launcher.entry
    limits what Main executes

Node.js sandbox
    not provided by v1
```

## 9. Renderer ⇄ Subsystem System Data WebSocket

每 Runtime Container 与 Renderer 最多一条长期 Data WebSocket：

```text
Renderer
    ⇄ System Data WebSocket
Subsystem
    ├── Connection Layer
    ├── Render Update Protocol
    └── User Input Protocol
```

物理连接与 Frame 数量无关。

Main Grant 不绑定 `frameId`、`activationId` 或 Render identity。

## 10. User Input 与 Frame Batch A

Renderer ordinary input 必须使用 Main 当前 Input Target。

Subsystem Frame Input Router 至少校验：

```text
Frame exists
Frame lifecycle == active
activationId == currentActivationId
Frame is Main-authorized target
```

revoked / stale Activation 永久拒绝。

Desktop Transport 或 Renderer reload 不允许让旧 Activation 重新有效。

Frame suspend / closing / closed 不关闭 Data WebSocket，也不隐式修改 Render。

## 11. Render Update

- Subsystem → Renderer 为主；
- independent Render identity；
- Frame Activation 不作为 Render epoch；
- Frame lifecycle 不控制 Render visibility / destroy / recovery。

## 12. Renderer Reload

```text
Renderer reload
→ reconnect Main Control
→ restore Runtime / Stack / current Activation / Input Target
→ rebuild authorized per-Subsystem Data WebSocket
→ only current Activation resumes ordinary input
→ each Subsystem independently restores Render State
```

不得恢复 revoked Activation，也不得从 Frame 集合推导全部 Render/Data lifecycle。

## 13. FSDB Content Service

Desktop localhost HTTP 提供 Manifest / Record / Group / Resource 的只读 Content API。

Content capability 与 Node Process OS capability 是不同安全边界。

## 14. Desktop Security

Hostra：

- `contextIsolation = true`；
- `nodeIntegration = false`；
- 尽可能启用 sandbox；
- 限制 navigation / `window.open`；
- 不暴露通用 Electron IPC。

LoomRealm localhost services / Launcher：

- loopback only；
- random port / high-entropy credential；
- Origin validation；
- Launcher containment；
- no Shell process creation；
- Bootstrap Token binding；
- explicit child environment；
- Control semantic error 不泄露 secret；
- Data Grant binding；
- User Input active/current Activation validation；
- Render namespace validation；
- bounded size/rate/concurrency。

## 15. Failure Handling

- Launcher / spawn / pre-ready Process failure → Game Bootstrap failure；
- hello/token/version failure → Runtime Bootstrap failure；
- invalid Runtime status → fatal Subsystem Control failure；
- no shutdown intent + Control loss / Process exit → Runtime failure；
- shutdown timeout → Supervisor force termination；
- terminal failed 后 exit 不改回 stopped；
- Runtime failure → revoke affected Frame current Activation；
- Runtime failure MUST NOT set Frame lifecycle to `failed`；Frame termination uses failed outcome + `closing → closed` according to Frame Batch E；
- Data WebSocket failure → ordinary input stops; Render recovery independent；
- Renderer crash does not require Subsystem termination；
- Main crash first phase terminates managed Subsystems；
- Content failure does not implicitly alter Frame/Render lifecycle。

## 16. Core Invariants

- Hostra 不承载 LoomRealm Main；
- one Subsystem = one Process；
- one Process = 0..N Frame + 0..N Render；
- one authenticated Main Control WebSocket per Runtime；
- Subsystem Control v1 and Frame / Call v1 remain separate logical protocols；
- Frame ID / Activation ID never reuse；
- Frame v1 has no ready/status；
- outcome ≠ lifecycle；
- only active Frame owns current Activation；
- stale Activation never becomes valid again；
- Frame lifecycle does not control Runtime/Data/Render lifecycle；
- ordinary User Input / Render Update do not flow through Hostra/Main business forwarding。
