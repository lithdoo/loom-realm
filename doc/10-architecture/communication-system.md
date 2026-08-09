# 通信系统

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：Control Plane、System Data Plane、Content Plane、协议职责域、authority/recovery 与 Transport binding  
> 依赖：[系统架构总览](./system-overview.md)、[运行承载系统](./runtime-hosting-system.md)、[ADR 0016](../decisions/0016-protocol-boundary-cleanup.md)、[ADR 0017](../decisions/0017-abandon-subsystem-control-v1.md)  
> 最近复核：2026-08-09

## 1. 三类通信平面

```text
Control Plane
    Subsystem ⇄ Main
        Subsystem Control v2
        Frame / Call v1

    Renderer ⇄ Main
        Renderer Control v1

System Data Plane
    Renderer ⇄ Subsystem
        Data Connection Contract v1
        User Input v1
        Render Update v1

Content Plane
    Runtime / Renderer ⇄ Readonly Content Service
```

核心：

```text
shared Transport != shared protocol domain
Runtime != Frame != Renderer Control != Data Connection != User Input != Render != Content
```

## 2. Main ⇄ Subsystem Control

当前唯一 Control实现目标：

```text
Subsystem Control v2
    Runtime identity/lifecycle only
    ready has no Data endpoint
```

Subsystem Control v1 已 `Abandoned Before Implementation`，不再实现、advertise或协商。

Control v2 wire：

```text
Subsystem → Main
    subsystem.hello
    subsystem.status

Main → Subsystem
    subsystem.shutdown
```

```text
spawn != connected != identified != ready
ready != Data Connection established
```

Frame / Call v1 Active / Normative / Frozen；Renderer不是 Frame participant。

## 3. Runtime Control Profile v2

当前组合：

```text
Runtime Control Application Profile v2
=
Subsystem Control v2
+
Frame / Call v1
```

同 sender跨协议共享 Connection-lifetime Request-ID namespace；one JSON-RPC message per transport unit；no JSON-RPC Batch。

`subsystem.hello.protocolVersions`只协商 Control，当前选择 version 2；Frame v1由 Profile静态绑定。

旧 Runtime Control Profile v1随 Control v1一起已实现前废弃。

## 4. Frame Failure Boundary

```text
Success        → known commit
Explicit Error → known no-commit
Timeout/loss   → ambiguous → Runtime failure
```

Frame no retry/replay。

Runtime failure：

```text
failedRuntimeKeys
→ lowest failed-runtime Frame
→ whole suffix Top→Bottom
→ failed logical retire / healthy close
→ fixed-point expansion
→ accepted outcome preserved
→ fresh final Caller resume or Stack empty
```

Data/Renderer/Render reconnect不得计算、确认或取消 unwind root。

## 5. Main ⇄ Renderer Control v1

Renderer Control是 committed authority replication：

```text
renderer.hello
renderer.state(full Snapshot)
```

Snapshot包含：

```text
Runtime projection
Frame Stack
Activation
InputTarget
DataAuthority { subsystemKey, generation, connectionProfile }
```

不包含：

```text
Data endpoint / ticket / MessagePort
Render State
Content Grant
```

恢复：

```text
full Snapshot
Session-local monotonic revision
revision gap allowed
latest-state coalescing
no replay/patch
Control loss → revoke InputTarget/DataAuthority → retire Data Connections
```

InputTarget是 one-shot lease；被撤销后 same `frameId + activationId`不得重新成为 ordinary input target。

## 6. Data Authority

Main是 Renderer⇄Subsystem Data authority。

```text
DataAuthority {
    subsystemKey,
    generation,
    connectionProfile
}
```

`generation`：

```text
Subsystem-scoped within Session
positive safe integer
strictly increases on authority replacement
never reused
!= reconnect counter
```

Renderer Control只发布逻辑 authority；Host/Platform carrier establishment不进入 Authority Snapshot，也不进入 Subsystem Control `ready`。

## 7. Renderer ⇄ Subsystem Data Connection

权威草案：[Data Connection Contract v1](../15-contracts/renderer-subsystem-data-connection-v1.md)。

Connection Core零 application methods，只定义 current carrier authority。

Identity：

```text
Session
+ current Renderer participant
+ subsystemKey
+ generation
```

lifecycle：

```text
current → retired
retired terminal
```

每个 `(Session, current Renderer participant, subsystemKey)`同时最多一条 current carrier；installation必须 serialized。

同 generation仍授权时，可在旧 carrier retired后建立 fresh current carrier。

边界：

```text
Data loss != Runtime failure
Data loss != Frame unwind
Frame close != Data retire
Activation replacement != Data generation replacement
Data retire != Render Domain destroy
```

## 8. Host / Platform Binding

实际 carrier建立属于 Host/Platform Profile：

```text
Desktop
    Control: localhost WebSocket
    Data: endpoint/ticket/connection material chosen by Desktop Host binding

PWA
    Control: authenticated MessagePort
    Data: Host-created/transferred MessagePort carrier
```

Binding必须在安装 carrier为current前安全绑定：

```text
current Session
current Renderer participant
subsystemKey
current generation
```

Endpoint、ticket、Port都不是 DataAuthority，也不是 Runtime readiness。

## 9. System Data Application Domains

current Data Connection承载两个独立 application domains：

```text
User Input
    Subsystem → Renderer: Input Interest
    Renderer → Subsystem: State / Event / Reset

Render Update
    Subsystem → Renderer: Render Domain Registry/State/Patch/Event
```

两者共享carrier，但独立定义 payload、ordering、backpressure、recovery与limits。

## 10. User Input v1 Core

权威草案：[User Input v1](../15-contracts/user-input-v1.md)。

Authority / Trust：

```text
Main
    owns InputTarget / Activation

Renderer Core
    trusted sender-side InputTarget enforcement point

Subsystem
    validates local Frame/Activation + local Interest
```

Input Channel：

```text
keyboard.state / keyboard.event
pointer.state  / pointer.event
gamepad.state  / gamepad.event
x.<custom-name>.state|event
```

Interest：

```text
Subsystem → Renderer
full replacement exact set
new current Data Connection default = empty
Runtime/Data-Connection scoped
not authority
```

Effective：

```text
current Data Connection
∩ Main current InputTarget/Activation
∩ current Input Interest
∩ Producer availability
```

`.state` non-effective→effective建立 fresh self-contained baseline；`.event`只发送future events；Reset清空当前 Frame+Activation全部 state并形成 ordering barrier。

fresh Data Connection从 empty Interest恢复；Event不重放；State重建baseline。

## 11. Render Update / Domain Tree

当前 Render model：

```text
Subsystem Runtime
    0..N Render Domains

Domain
    domainId
    zIndex
    0..N ordered roots

Node
    key
    tag
    attrs : string→string
    data  : JSON object
    children[] ordered
```

Domain是 Render lifecycle / atomic-state / global-composition unit；Domain Host不是 Render Node。

Render Update方向固定：

```text
Subsystem → Renderer only
```

当前 incremental closure candidate：

```text
render.domains
    full Domain Registry / lifecycle authority

render.snapshot(revision)
    fresh baseline / full commit

render.patch(baseRevision, revision)
    exact R→R+1 atomic incremental commit
    insert / remove / move / update by stable key

render.event
    transient presentation impulse
```

Recovery：

```text
fresh Data Connection
→ current Registry
→ fresh Snapshot for every current Domain
→ ordinary Patch/Event
```

无 ACK/NACK、Patch history replay、resume cursor、Renderer→Subsystem resync RPC。

## 12. Renderer Control Backpressure

Renderer Control full Snapshot使用 bounded latest-state coalescing：

```text
at most one replaceable unsent latest Snapshot
no unbounded historical Snapshot queue
```

slow Renderer持续无法 drain时关闭 Control Connection，以 fresh full Snapshot恢复。

Phase-1 topology：

```text
Runtime <= 256
live Stack <= 64
DataAuthority <= 256
```

## 13. Render Backpressure

Render authoritative state优先于 transient Event backlog。

```text
small desired-state diff
    → Patch

large/complex/backpressured diff
    → full Snapshot

continuity failure / reconnect
    → retire carrier
    → fresh Registry + Snapshots
```

Event bounded FIFO可在overflow时丢失；Event loss不破坏 authoritative convergence。

## 14. Content Plane

Readonly Content API定义 logical manifest/record/group/resource access。

```text
Content API
    request/response/cache/version/error/integrity

Content Access Bootstrap/Profile
    capability distribution/rotation
```

Content credential不得进入 Frame、Renderer Authority Snapshot或 Render State。

## 15. Security / Fail Closed

- wire视为不可信；
- Main是 Frame/Input/Data authority；
- Subsystem Control v2只拥有 Runtime identity/lifecycle；
- Runtime `ready`不得传Data endpoint/credential；
- Renderer Core是 ordinary InputTarget sender-side trusted enforcement point；
- Input Interest/Producer availability只能过滤，不能授予authority；
- InputTarget lease撤销后 same `frameId + activationId`不re-grant；
- Renderer Control不携Data bootstrap secret；
- Control loss/replacement撤销 Renderer input/Data authority；
- stale Activation input必须拒绝；
- Render tag/data不得成为任意 executable/DOM命令注入面；
- transport不能成为 Runtime/Frame recovery authority。

## 16. 当前推进状态

```text
Game Package v2 / Desktop Launcher       Frozen baseline
Subsystem Control v1                     Abandoned Before Implementation
Subsystem Control v2                     Current / Stabilizing
Runtime Control Profile v1               Abandoned Before Implementation
Runtime Control Profile v2               Current / Stabilizing
Frame / Call v1 + Conformance            Frozen
Renderer Control v1                      Draft / near closure
Data Connection Contract v1              Draft / lifecycle closed
User Input v1                            Core semantic closure reviewed
Render Update incremental design         Closure Candidate
    ↓
Renderer Component / Input Mapping Profiles
Host Bootstrap / Data Binding Profiles
Content Access Profile
```
