# Hostra 桌面宿主模块设计

> 层级：模块设计  
> 状态：Active Design  
> 稳定程度：Experimental  
> 主要定义：Hostra 窗口宿主、LoomRealm Desktop Runtime 拓扑、WebSocket/HTTP 适配和安全边界  
> 依赖：[运行时启动与连接建立系统](../../10-architecture/runtime-bootstrap-system.md)、[Desktop Node.js Launcher Profile v1](../../15-contracts/nodejs-launcher-profile-v1.md)、[Subsystem Control Protocol v1](../../15-contracts/subsystem-control-lifecycle-protocol.md)、[Frame / Call Protocol v1](../../15-contracts/frame-call-protocol-v1.md)、[运行承载系统](../../10-architecture/runtime-hosting-system.md)  
> 最近复核：2026-08-04

## 1. Hostra 边界

Hostra 是独立 Electron Shell，只负责 BrowserWindow / desktop lifecycle。

Hostra 不承载 LoomRealm Main，不启动 Subsystem，不解释 Subsystem/Frame/Activation/Render/Input/Content Payload，也不代理 Renderer ⇄ Subsystem 业务数据。

Desktop LoomRealm 通信：Control / System Data 使用 localhost WebSocket；Content 使用 localhost HTTP。

## 2. Desktop Process Topology

```text
LoomRealm Main Process
├── Descriptor / Launch Attempt Registry
├── Launcher Target Resolver
├── Runtime Supervisor
├── Control Connection Registry
├── Frame Stack / Activation / Input Target
└── System Data Connection Authority

FSDB Content Service Process
Hostra Electron Main Process
Hostra Renderer Process / Web Renderer

每个 declared Subsystem 一个 Subsystem Process
├── Main Control WebSocket Client
├── Renderer Data WebSocket Endpoint
├── 0..N Frame/Input Context
└── 0..N Render Context
```

进程隔离粒度 = Subsystem，不是 Frame。

## 3. Renderer Window / Web Service

Main 启动 Renderer Web Service、生成 Renderer URL，通过 Hostra Window Adapter 打开 BrowserWindow。

Renderer Web Service 要求 loopback-only、随机端口、受限 Origin/CSP、无目录列表、明确 Control WebSocket path，并在 Session end 后关闭。

Hostra 不转发 LoomRealm Payload。

## 4. Renderer ⇄ Main Control WebSocket

每 Session 一条长期 Control WebSocket，负责：Runtime State、Frame Stack/lifecycle mirror/current Activation/Input Target、Data Grant/revoke/replace、session error/reconnect。

不承载 ordinary User Input、Render Update 或 Content body。Renderer 不拥有 Frame authority。

## 5. Main ⇄ Subsystem Control WebSocket

连接方向：

```text
Subsystem Process
    ── connect ──▶ LoomRealm Main Control WebSocket Server
```

启动：

```text
Launcher
→ spawn + Supervisor
→ starting
→ Process connects Main
→ connected
→ subsystem.hello
→ identified
→ optional initializing
→ ready
```

同一已认证 WebSocket 逻辑复用两个协议域，但状态机必须分离：

```text
Subsystem Control Protocol v1
    Active / Normative / Frozen

Frame / Call Protocol v1
    overall Draft
    Batch A Frozen
    Batch B Frozen
    Batch C-F Draft
```

## 6. Desktop Frame / Call Adapter

Desktop WebSocket adapter MUST 原样映射 Batch B exact application methods：

```text
Main → Subsystem
    frame.initialize({ frameId, input })
    frame.activate({ frameId, activationId })
    frame.suspend({ frameId, activationId })
    frame.resume({ frameId, activationId, returnedFrameId, result })
    frame.close({ frameId })

Subsystem → Main
    frame.call({ frameId, activationId, targetSubsystemKey, input })
        → { childFrameId }
    frame.return({ frameId, activationId, result })
        → {}
```

全部是 JSON-RPC Request。

Transport adapter MUST NOT：

- 把 `system.call/system.return` 当兼容别名；
- 给 Main→Subsystem RPC 增加 source `systemId/subsystemKey`；
- 给 initialize/return 增加 `callerFrameId`；
- 给 `frame.close` 增加 reason；
- 拆分 `frame.resume` 为 resume + activate；
- 增加 `frame.result`；
- 允许 `completed` 缺失 value；无返回值必须 `value:null`。

WebSocket envelope、connection ID 或 ping/pong 不得进入 Frame RPC Schema。

## 7. Runtime Launcher / Supervisor

Desktop v1 `launcher.type=nodejs`：只接受 validated target，Host-selected Node，no Game flags/argv，`shell=false`，固定 cwd，Token-before-spawn，explicit safe child env，PID/launchId/handle 不作为协议 identity，no automatic restart。

Supervisor 与 Main shutdown intent 配合：

```text
shutdown intent
→ subsystem.shutdown
→ finite deadline
→ force terminate if required
→ actual exit observation
→ stopped
```

无 shutdown intent 的 Process exit 是 failure，即使 exit code=0。

## 8. Node.js Trust Boundary

Desktop v1 Subsystem JavaScript 是 trusted executable code。

```text
safe launcher.entry
    = constrains what Main launches

Node.js sandbox
    = not provided in v1
```

Content API 限制不能解释成 Process 没有 OS fs/network/child_process capability。

## 9. Renderer ⇄ Subsystem System Data WebSocket

每 Runtime Container 与 Renderer 最多一条长期 Data WebSocket：

```text
Connection Layer
Render Update Protocol
User Input Protocol
```

连接与 Frame 数量无关，可服务 0..N Frame Input Context 与 0..N Render Context。Main Data Grant 不绑定 frameId/activationId/Render identity。

Connection Layer 的 heartbeat/reconnect 属于 Data Connection，不得与 Subsystem Control v1 混淆。

## 10. User Input 与 Batch A/B

User Input 使用 Main-declared current Input Target：

```text
subsystem reference
frameId
activationId
```

只有 active/current Activation 合法；revoked Activation 永久拒绝。

`frame.resume` 成功后的 new Activation 何时可以向 Renderer publish，由 Batch C 冻结；Desktop adapter 在此之前不得自行形成兼容性承诺。

## 11. Renderer Reload

```text
Renderer reload
→ reconnect Main Control
→ restore current Runtime/Frame/Input state
→ Main reissues Data Grants
→ rebuild Data WebSockets
→ restore Frame Input Registry
→ each Subsystem independently restores Render State
```

不得从 Frame 集合推导全部 Data Connection，也不得恢复缓存的旧 Activation。

## 12. Content Service

FSDB Content Service 提供 Readonly HTTP Content API。Content API 与 Node Process OS capability 是不同安全边界。

## 13. Desktop Security

- Hostra `contextIsolation=true`、`nodeIntegration=false`、受限 navigation/window.open；
- localhost services loopback-only；
- Bootstrap Token / Data Grant 绑定正确 Session/Subsystem；
- Launcher Entry containment + no Shell；
- child env 不继承全量 Main environment；
- User Input 校验 Frame/Activation；
- Render Update 限制当前 Subsystem Render namespace；
- 错误不泄露 token / 不必要物理路径。

## 14. Failure Handling

- Entry/env/spawn/early-exit/hello/ready failure → Bootstrap failure；
- invalid Runtime status → fatal Subsystem Control error；
- unexpected Control/Process loss → Runtime failure；
- shutdown timeout → Supervisor force termination；
- Data WebSocket loss → stop ordinary input，Render 按 Render Protocol recovery；
- Runtime crash → Main 处理全部受影响 Frame；
- Renderer crash 不自动终止 Subsystem；
- Main crash 第一阶段终止受管理 Subsystem。

## 15. 核心不变量

- Hostra 不承载 Main 或业务协议；
- 每 Subsystem 一个 Process，可承载多个 Frame/Render；
- Subsystem Control v1 与 Frame / Call v1 共享 WebSocket但协议独立；
- Frame Batch A/B 应用层语义不因 Desktop Transport 改变；
- Batch B exactly seven JSON-RPC Request methods；
- Caller relationship 不复制到 Subsystem wire；
- `frame.call` 非 long-running result RPC；
- `frame.resume` 同时 outcome + replacement Activation；
- Frame lifecycle 不控制 Data WebSocket 或 Render；
- ordinary User Input / Render Update 不通过 Main/Hostra 转发。
