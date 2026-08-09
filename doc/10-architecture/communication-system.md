# 通信系统

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：Control Plane、System Data Plane、Content Plane、协议职责域、authority/recovery 与 Transport binding  
> 依赖：[系统架构总览](./system-overview.md)、[运行承载系统](./runtime-hosting-system.md)、[ADR 0016](../decisions/0016-protocol-boundary-cleanup.md)  
> 最近复核：2026-08-09

## 1. 三类通信平面

```text
Control Plane
    Subsystem ⇄ Main
        Subsystem Control v1
        Frame / Call v1
        Runtime Control Profile v1

    Renderer ⇄ Main
        Renderer Control v1

System Data Plane
    Renderer ⇄ Subsystem
        Data Connection v1
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

## 2. Main ⇄ Subsystem Runtime Control

[Subsystem Control v1](../15-contracts/subsystem-control-protocol-v1.md) 只拥有 Runtime identity/lifecycle：

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

`ready`不携 Data endpoint、MessagePort、Data credential 或 DataAuthority。

当前组合：

```text
Runtime Control Application Profile v1
=
Subsystem Control v1
+
Frame / Call v1
```

同一 sender跨 Control + Frame 共享 Connection-lifetime Request-ID namespace；one JSON-RPC message per transport unit；no JSON-RPC Batch。

`subsystem.hello.protocolVersions`只协商 Control v1；Frame v1由 Profile静态绑定。

## 3. Frame Failure Boundary

```text
Success        → known commit
Explicit Error → known no-commit
Timeout/loss   → ambiguous → Runtime failure
```

Frame v1 no retry/replay。

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

## 4. Main ⇄ Renderer Control v1

Renderer Control复制 Main committed authority：

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

InputTarget是 one-shot lease；撤销后 same `frameId + activationId`不得重新成为 ordinary input target。

## 5. Data Authority

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
never reused
!= transport reconnect counter
```

Renderer Control只发布逻辑 authority；Host/Platform carrier establishment不进入 Authority Snapshot，也不进入 Runtime `ready`。

## 6. Renderer ⇄ Subsystem Data Connection v1

[Data Connection v1](../15-contracts/renderer-subsystem-data-connection-v1.md) 的 Core没有 application methods，只定义 current carrier authority。

Identity：

```text
Session
+ current Renderer participant
+ subsystemKey
+ generation
```

Lifecycle：

```text
current → retired
retired terminal
```

每个 `(Session, current Renderer participant, subsystemKey)`同时最多一条 current carrier；installation必须 serialized。

同 generation仍授权时，旧 carrier retired后 MAY establish fresh carrier。

```text
Data loss != Runtime failure
Data loss != Frame unwind
Frame close != Data retire
Activation replacement != Data generation replacement
Data retire != Render Domain destroy
```

## 7. Host / Platform Binding

实际 carrier建立属于 Host/Platform Profile：

```text
Desktop
    Control: localhost WebSocket
    Data: endpoint/ticket chosen by Desktop Host binding

PWA
    Control: authenticated MessagePort
    Data: Host-created/transferred MessagePort
```

Binding安装 current carrier前必须安全绑定：

```text
current Session
current Renderer participant
subsystemKey
current generation
```

Endpoint、ticket、Port都不是 DataAuthority，也不是 Runtime readiness。

## 8. Data Application Domains

current Data Connection承载两个独立 application domains：

```text
User Input
    Subsystem → Renderer: Input Interest
    Renderer → Subsystem: State / Event / Reset

Render Update
    Subsystem → Renderer: Domain Registry / Snapshot / Patch / Event
```

两者共享 carrier，但独立定义 payload、ordering、backpressure、recovery 与 limits。

## 9. User Input v1

[User Input v1](../15-contracts/user-input-v1.md) 的 authority：

```text
Main InputTarget / Activation
∩ current matching Data Connection
∩ current Subsystem Input Interest
∩ Renderer Producer availability
=
Effective Channel
```

Interest：

```text
Subsystem → Renderer
full replacement exact set
fresh Data Connection default empty
not authority
```

`.state` 每次 non-effective→effective 建立 fresh current snapshot；`.event`只发送 future transient events；Reset清理当前 Frame+Activation input state并形成 ordering barrier。

fresh Data Connection：Interest从 empty重建，Event不重放，State重新 baseline。

## 10. Render Update / Domain Tree

当前模型：

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

方向固定：

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

## 11. Backpressure

Renderer Control：bounded latest-state full-Snapshot coalescing；持续无法 drain 时关闭 Control Connection，以 fresh Snapshot恢复。

Render：authoritative state progress优先于 transient Event backlog。

```text
small desired-state diff   → Patch
large/complex backlog      → full Snapshot
continuity failure         → retire carrier → fresh Registry + Snapshots
```

Event bounded FIFO可以丢；Event loss不破坏 authoritative convergence。

## 12. Content Plane

Readonly Content API定义 logical manifest/record/group/resource access。

```text
Content API
    request/response/cache/version/error/integrity

Content Access Bootstrap/Profile
    capability distribution/rotation
```

Content credential不得进入 Frame、Renderer Authority Snapshot或 Render State。

## 13. Security / Fail Closed

- wire视为不可信；
- Main是 Frame/Input/Data authority；
- Subsystem Control只拥有 Runtime identity/lifecycle；
- Runtime `ready`不得传 Data endpoint/credential；
- Renderer Core是 ordinary InputTarget sender-side trusted enforcement point；
- Input Interest/Producer availability只能过滤，不能授予 authority；
- InputTarget lease撤销后 same `frameId + activationId`不 re-grant；
- Renderer Control不携 Data bootstrap secret；
- Control loss/replacement撤销 Renderer input/Data authority；
- stale Activation input必须拒绝；
- Render tag/data不得成为 executable/DOM command注入面；
- transport不能成为 Runtime/Frame recovery authority。

## 14. 当前推进状态

```text
Game Package v1 / Desktop Launcher v1      current bootstrap baseline
Subsystem Control v1                       Stabilizing
Runtime Control Profile v1                 Stabilizing
Frame / Call v1 + Conformance              Frozen
Renderer Control v1                        Draft / near closure
Data Connection v1                         Draft / lifecycle closed
User Input v1                              Core semantic closure reviewed
Render Update incremental design           Closure Candidate
    ↓
Renderer Component / Input Mapping Profiles
Host Bootstrap / Data Binding Profiles
Content Access Profile
```
