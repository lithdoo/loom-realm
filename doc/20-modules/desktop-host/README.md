# Hostra 桌面宿主模块设计

> 层级：模块设计  
> 状态：Active Design  
> 稳定程度：Experimental  
> 主要定义：Hostra 窗口宿主、Desktop Runtime 拓扑、WebSocket/HTTP 适配和安全边界  
> 依赖：[运行时启动与连接建立系统](../../10-architecture/runtime-bootstrap-system.md)、[Desktop Node.js Launcher Profile v1](../../15-contracts/nodejs-launcher-profile-v1.md)、[Subsystem Control Protocol v1](../../15-contracts/subsystem-control-lifecycle-protocol.md)、[Frame / Call Protocol v1](../../15-contracts/frame-call-protocol-v1.md)、[运行承载系统](../../10-architecture/runtime-hosting-system.md)  
> 最近复核：2026-08-04

## 1. Hostra 边界

Hostra 是独立 Electron Shell，只负责 BrowserWindow / desktop lifecycle。它不承载 LoomRealm Main，不启动 Subsystem，不解释 Subsystem/Frame/Activation/Render/Input/Content Payload，也不代理 Renderer⇄Subsystem 业务数据。

Desktop LoomRealm：Control/System Data 使用 localhost WebSocket；Content 使用 localhost HTTP。

## 2. Desktop Topology

```text
LoomRealm Main Process
├── Runtime Supervisor
├── Control Connection Registry
├── Frame Stack / Transaction Coordinator
├── Activation / InputTarget
└── Data Connection Authority

FSDB Content Service
Hostra Electron Main
Hostra Renderer / Web Renderer
per-Subsystem Process
    ├── Main Control WebSocket
    ├── Renderer Data WebSocket
    ├── 0..N Frame/Input Context
    └── 0..N Render Context
```

进程隔离粒度 = Subsystem，不是 Frame。

## 3. Main ⇄ Subsystem Control WebSocket

同一已认证 WebSocket 逻辑复用：

```text
Subsystem Control Protocol v1        Frozen
Frame / Call Batch A/B/C             Frozen
Frame / Call Batch D-F               Draft
```

Batch B exact methods必须原样映射；WebSocket envelope、connection ID、ping/pong 不得进入应用 RPC Schema。

## 4. Batch C Transport Ordering

Desktop adapter MUST preserve：

```text
frame.call Request
→ Main acceptance commit
→ frame.call Response
→ dependent Child frame.initialize / frame.activate
```

以及：

```text
frame.return Request
→ Main acceptance commit
→ frame.return Response
→ dependent frame.close / frame.resume
```

ordinary call 不发送 reverse `frame.suspend` 作为建立步骤。

WebSocket adapter MUST NOT 要求“入站 Request handler pending 时处理并等待反向 Request”才能正常完成 same-Subsystem recursive call。

## 5. Renderer Control Publication

Desktop Renderer⇄Main Control WebSocket 只发布 Main 已 commit state。

必须满足：

```text
frame.activate ACK
    happens-before Child InputTarget publication

frame.resume ACK
    happens-before Caller replacement InputTarget publication
```

transaction gap 可以为 `InputTarget=null`。revoked Activation 不得重新发布；不得同时发布两个 ordinary InputTargets。

Renderer 不直接参与 Frame RPC。

## 6. Subsystem-side Mutation Gate

Desktop Subsystem SDK 在 outbound `frame.call / frame.return` pending 时必须停止对应 Frame 的新 ordinary input dispatch，并禁止第二个 call/return。

call success 本地 commit Caller suspended + old Activation revoked；return success 本地 commit Frame closing + old Activation revoked。

具体 pending input drop/buffer/reset 由 User Input Protocol 后续冻结。

## 7. Launcher / Supervisor

Desktop v1 `launcher.type=nodejs`：validated target only、Host-selected Node、no Game flags/argv、`shell=false`、固定 cwd、Token-before-spawn、explicit child env、no automatic restart。

```text
shutdown intent
→ subsystem.shutdown
→ finite deadline
→ force terminate if required
→ actual exit observation
→ stopped
```

无 shutdown intent 的 Process exit 是 failure，即使 exit code=0。

## 8. Trust Boundary

Desktop v1 Subsystem JavaScript 是 trusted executable code。safe launcher entry 只约束 Main 执行哪个 Installation 文件，不构成 Node.js OS sandbox。

## 9. Renderer ⇄ Subsystem Data WebSocket

每 Runtime 与 Renderer 最多一条长期 Data WebSocket：Connection Layer / Render Update / User Input。连接与 Frame 数量无关，可服务 0..N Frame Input Context + 0..N Render Context。

Data Connection heartbeat/reconnect 不得与 Subsystem Control 或 Frame transaction semantics 混淆。

## 10. User Input

只有 Main-declared active/current `frameId + activationId` 合法。revoked Activation 永久拒绝。

Batch C transaction gap 时 Main 可以没有 InputTarget；Desktop Input Router 必须停止 ordinary input，而不是沿用旧 target。

## 11. Renderer Reload

reload 后只恢复 Main 当前 committed Runtime/Stack/Activation/InputTarget，重建 Data Grants/Connections，Render 独立恢复。不得恢复缓存旧 Activation或未 commit transaction state。

## 12. Security / Failure

- localhost services loopback-only；
- Hostra `contextIsolation=true` / `nodeIntegration=false`；
- credential / Data Grant 绑定正确 Session/Subsystem；
- Launcher containment + no shell；
- User Input 校验 active/current Activation；
- unexpected Control/Process loss → Runtime failure；
- Data WebSocket loss → stop ordinary input，Render 独立 recovery；
- Main crash 第一阶段终止受管理 Subsystem。

## 13. 核心不变量

- Hostra 不承载 Main 或业务协议；
- 每 Subsystem 一个 Process，可承载多个 Frame/Render；
- Subsystem Control 与 Frame / Call 共享物理 WebSocket但协议独立；
- Frame A/B/C application semantics 不因 Desktop Transport 改变；
- ordinary call no reverse-suspend dependency；
- call/return Response precedes dependent reverse RPC；
- activate/resume ACK precedes Renderer publication；
- post-commit failure不恢复旧 Activation；
- same-Subsystem recursion 不要求 nested handler reentrancy；
- Frame lifecycle 不控制 Data WebSocket 或 Render。
