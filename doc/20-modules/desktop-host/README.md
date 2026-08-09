# Hostra 桌面宿主模块设计

> 层级：模块设计  
> 状态：Active Design  
> 稳定程度：Experimental  
> 主要定义：Hostra 窗口宿主、Desktop Runtime 拓扑、WebSocket/HTTP 适配和安全边界  
> 依赖：[运行时启动与连接建立系统](../../10-architecture/runtime-bootstrap-system.md)、[Subsystem Control v2](../../15-contracts/subsystem-control-protocol-v2.md)、[Runtime Control Profile v2](../../15-contracts/runtime-control-profile-v2.md)、[Frame / Call Protocol v1](../../15-contracts/frame-call-protocol-v1.md)、[Data Connection v1](../../15-contracts/renderer-subsystem-data-connection-v1.md)  
> 最近复核：2026-08-09

## 1. Hostra 边界

Hostra是独立 Electron Shell，只负责 BrowserWindow / desktop lifecycle 与受控平台 binding。它不拥有 LoomRealm Frame Stack、Activation、failure unwind、Subsystem business state或 Render authority。

Desktop LoomRealm：

```text
Main⇄Subsystem Control      localhost WebSocket
Main⇄Renderer Control       localhost WebSocket
Renderer⇄Subsystem Data     Host-established carrier
Content                     localhost HTTP
```

Hostra可以参与 carrier/bootstrap material的安全交付，但不得把自己变成协议 authority。

## 2. Desktop Topology

```text
LoomRealm Main Process
├── Runtime Supervisor
├── Frame Stack / Transaction Coordinator
├── Activation / InputTarget
├── Renderer Control Authority
└── DataAuthority

per-Subsystem Process
├── Main Control WebSocket
├── 0..N Frame/Input Context
└── 0..N Render Domains

Web Renderer
├── Main Renderer Control WebSocket
└── 0..1 current Data carrier per Subsystem
```

进程隔离粒度=Subsystem，不是 Frame。

## 3. Runtime Control WebSocket

同一 authenticated Main⇄Subsystem Control WebSocket复用：

```text
Subsystem Control v2
Frame / Call v1
```

并由：

```text
Runtime Control Application Profile v2
```

静态组合。

Control v1/Profile v1已实现前废弃，不属于 Desktop compatibility target。

`subsystem.hello.protocolVersions`当前必须支持/选择 version 2；Frame v1不发送独立 version handshake。

## 4. `ready` 与 Data 完全分离

Control v2：

```json
{"state":"ready"}
```

不得携带：

```text
Renderer Data WebSocket URL
Data ticket
Data credential
DataAuthority generation
```

因此 Desktop Host MUST NOT实现旧链路：

```text
Runtime ready.rendererDataEndpoint
→ Main forwards endpoint
```

当前链路是：

```text
Main commits DataAuthority(S,G)
→ Renderer Control publishes logical authority
→ Desktop Host/Transport Binding establishes carrier for Session/current Renderer/S/G
→ Data Connection installs at most one current carrier
```

## 5. Control Message Mapping

当前 Runtime Control Profile v2要求：

```text
one complete WebSocket text message
=
one JSON-RPC application message
```

JSON-RPC Batch禁止。

Frame / Call v1 exactly seven methods原样映射；WebSocket envelope/connection ID/ping-pong不进入 Frame application schema。

Adapter MUST保持 per-direction发送顺序，不得 duplicate/retry/replay state-changing Frame operation。

## 6. JSON / Limits

Control与Frame共享 carrier入口时使用组成协议的更严格限制：

```text
application message <= 1 MiB
JSON depth <= 64
Request ID = positive safe integer
sender-side Connection lifetime never reused
```

Frame message额外满足：

```text
business JsonValue <= 512 KiB
frameId / activationId <= 128 UTF-8 bytes
targetSubsystemKey <= 256 UTF-8 bytes
```

Desktop receiver必须按实际完整 WebSocket text UTF-8 bytes执行 hard cap，不能只按 parse后重新序列化大小判断。

## 7. Shared Request ID Namespace

同一发送方在同一 Runtime Control WebSocket上的 Control + Frame Request共用 one-shot ID namespace。

Subsystem sender包括：

```text
subsystem.hello
frame.call
frame.return
```

Main sender包括：

```text
subsystem.shutdown
frame.initialize
frame.activate
frame.suspend
frame.resume
frame.close
```

两个方向的 sender namespace相互独立。

## 8. Ordering / Deadline / Retry

Desktop adapter MUST preserve：

```text
call acceptance → call Response → Child initialize/activate
return acceptance → return Response → close/resume
activate/resume ACK → InputTarget publication
```

Frame method deadline继续按 Frozen v1 `1,000..300,000ms` sender-local monotonic profile。

```text
Success        → known commit
Explicit Error → known no-commit
Timeout/loss   → ambiguous → Runtime failure
```

Transport不得在 timeout后应用层重发 Frame operation；Late Response不恢复 failure。

## 9. Runtime Failure Recovery

Runtime failure unwind authority只位于 LoomRealm Main：

```text
failedRuntimeKeys
→ lowest failed-runtime Frame
→ whole suffix
→ failed logical retire / healthy close
→ fixed-point expansion
→ accepted outcome preserved
→ fresh final Caller resume or empty Stack
```

Hostra/WebSocket adapter不得自行选择 root、重发 recovery RPC或根据 PID修改 Frame authority。

## 10. Launcher / Supervisor

Desktop Launcher Profile v1继续负责：

```text
validated entry
Host-selected Node
shell=false
fixed cwd
bootstrap token registered before spawn
explicit child env
Supervisor
no automatic restart
```

注意 Launcher/Profile版本1与 Control protocol版本2互相独立。

Runtime terminal failure后的 Process cleanup由 Supervisor负责，不通过 Frame close模拟 Runtime termination。

## 11. Renderer ⇄ Subsystem Data Binding

Data Connection Core不定义 endpoint discovery/handshake method。

Desktop Host/Transport Binding负责建立实际 carrier，并在成为 `current` 前安全绑定：

```text
current Session
current Renderer participant
subsystemKey
current DataAuthority generation
```

具体实现可以使用 localhost WebSocket endpoint + one-shot ticket 等机制，但这些 material：

```text
MUST NOT进入 Subsystem Control ready
MUST NOT进入 Renderer Authority Snapshot
MUST NOT成为 DataAuthority identity
```

同一个 `(Session,current Renderer,subsystemKey)` 同时最多一条 current Data Connection。

## 12. Data Failure Boundary

```text
Data carrier loss
→ current → retired
```

如果同 generation仍被 Main授权，可建立 fresh carrier。

```text
Data loss != Runtime failure
Data loss != Frame unwind
Frame close != Data retire
Data retire != Render Domain destroy
```

Renderer reload/Control loss会使旧 Renderer participant的 Data carriers全部 retired，再依据 fresh Renderer Control Snapshot重建。

## 13. User Input / Render

current Data Connection承载独立 application domains：

```text
User Input
Render Update
```

User Input仍受 Main InputTarget/Activation + Interest + Producer availability gate。

Render lifecycle由 Subsystem控制；当前 Render Update closure candidate使用 Domain Registry + Snapshot + Patch + transient Event。

Hostra不得把 Frame Stack当作 Render z-order或 Domain lifecycle。

## 14. Conformance

Desktop适用实现至少要验证：

```text
Control v2 version selection
no Control v1 fallback
ready has no Data endpoint
Runtime Control Profile v2 shared-ID/no-Batch rules
Frame / Call v1 Desktop transport fixtures
Data carrier bound to current generation
one current Data carrier per Subsystem
same-generation reconnect only after old carrier retired
Data loss does not fail Runtime/unwind Frame
```

## 15. Core Invariants

- Hostra不拥有 Main协议 authority；
- one Subsystem=one Runtime Process；
- current Runtime Control = Control v2 + Frame v1；
- Control v1/Profile v1已实现前废弃；
- Control `ready`不携 Data endpoint；
- WebSocket application unit一一对应 JSON-RPC message；
- no Batch / no application Frame retry；
- shared sender-side Request ID namespace；
- failure unwind只在 Main；
- DataAuthority是逻辑 authority，不是 endpoint/credential；
- Host binding负责 actual Data carrier establishment；
- Data loss不等于 Runtime/Frame failure；
- Frame lifecycle不控制 Data carrier/Render Domain lifecycle。
