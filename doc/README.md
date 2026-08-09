# LoomRealm 设计文档

LoomRealm 文档按依赖顺序组织：

```text
产品目标与范围
→ 系统架构
→ 正式契约
→ 模块设计
→ 实施计划
```

## 推荐阅读顺序

1. [产品设计总览](./00-overview/product-vision.md)
2. [文档分层与变更规则](./00-overview/document-governance.md)
3. [系统架构总览](./10-architecture/system-overview.md)
4. [运行时启动与连接建立系统](./10-architecture/runtime-bootstrap-system.md)
5. [运行承载系统](./10-architecture/runtime-hosting-system.md)
6. [栈式运行系统](./10-architecture/stack-runtime-system.md)
7. [通信系统](./10-architecture/communication-system.md)
8. [渲染系统](./10-architecture/rendering-system.md)
9. [正式契约目录](./15-contracts/README.md)
10. [Game Package v2](./15-contracts/game-package-v2.md)
11. [Desktop Node.js Launcher Profile v1](./15-contracts/nodejs-launcher-profile-v1.md)
12. [Subsystem Control Protocol v2](./15-contracts/subsystem-control-protocol-v2.md)
13. [Runtime Control Application Profile v2](./15-contracts/runtime-control-profile-v2.md)
14. [Frame / Call Protocol v1](./15-contracts/frame-call-protocol-v1.md)
15. [Frame / Call v1 Conformance Profile](./15-contracts/frame-call-conformance-v1.md)
16. [Frame v1 Suspend Semantics Clarification](./15-contracts/frame-call-v1-suspend-clarification.md)
17. [Main ⇄ Renderer Control Protocol v1](./15-contracts/main-renderer-control-v1.md)
18. [Renderer ⇄ Subsystem Data Connection Contract v1](./15-contracts/renderer-subsystem-data-connection-v1.md)
19. [Renderer ⇄ Subsystem User Input Protocol v1](./15-contracts/user-input-v1.md)
20. [Render Update v1 Incremental Closure](./15-contracts/render-update-v1-incremental-design.md)
21. [只读 Content API v1](./15-contracts/content-api-v1.md)
22. [模块设计目录](./20-modules/README.md)
23. [实施计划目录](./30-implementation/README.md)

历史路径 [Subsystem Control v1](./15-contracts/subsystem-control-lifecycle-protocol.md) 与 [Runtime Control Profile v1](./15-contracts/runtime-control-profile-v1.md) 只用于追溯，均已 `Abandoned Before Implementation`。

## 当前核心结论

```text
Game Package / Desktop Launcher          Stable/Frozen baseline
Subsystem Control v1                     Abandoned Before Implementation
Subsystem Control v2                     Current / Active Normative / Stabilizing
Runtime Control Profile v1               Abandoned Before Implementation
Runtime Control Profile v2               Current = Control v2 + Frame v1
Frame / Call v1                          Frozen
Main ⇄ Renderer Control v1               Draft / near closure
Data Connection Contract v1              Draft / lifecycle closed
User Input v1                            Core semantic closure reviewed
Render Update incremental design         Closure Candidate
Content API v1                           Active / Normative / Evolving
```

协议边界见 [ADR 0016](./decisions/0016-protocol-boundary-cleanup.md)；Control版本治理见 [ADR 0017](./decisions/0017-abandon-subsystem-control-v1.md)。

核心原则：

```text
Runtime != Frame != Renderer Control != Data Connection != User Input != Render != Content
```

## Runtime Control

当前唯一实现组合：

```text
Runtime Control Application Profile v2
=
Subsystem Control v2
+
Frame / Call v1
```

Control v2负责 Runtime identity/lifecycle：

```text
subsystem.hello
subsystem.status
subsystem.shutdown
```

```text
spawn success != connected != identified != ready
ready != Data Connection exists
```

`subsystem.status({state:"ready"})` 不携 Renderer Data endpoint。

`subsystem.hello.protocolVersions`当前只协商 Control version 2；Frame version 1由 Profile v2静态绑定。

## Frame / Call v1

```text
Main → Subsystem
    initialize / activate / suspend / resume / close

Subsystem → Main
    call / return
```

核心：

```text
Main owns Frame/Stack/Activation/InputTarget
Response-before-dependent-RPC
activate/resume ACK-before-publication
Success = known commit
Explicit Error = known no-commit
Timeout/loss = ambiguous → Runtime failure
no retry/replay
lowest failed-runtime root → whole suffix fixed-point unwind
accepted outcome preserved
fresh surviving Caller resume
Frame lifecycle != Render/Data lifecycle
```

## Renderer Control v1

Renderer Control只复制 Main committed authority：

```text
full Authority Snapshot
Session-local monotonic revision
revision gap/coalescing allowed
no patch/replay
```

Snapshot包含 Runtime projection、Frame Stack、Activation/InputTarget 与逻辑：

```text
DataAuthority { subsystemKey, generation, connectionProfile }
```

不包含 Data endpoint / MessagePort / bearer token / Render State / Content Grant。

InputTarget是 one-shot lease；Control loss/replacement撤销 Renderer ordinary input与Data authority。

## Data Connection

Data carrier identity：

```text
Session
+ current Renderer participant
+ subsystemKey
+ generation
```

lifecycle：

```text
current → retired
```

`generation`是 Main-owned Data authority epoch，不是 reconnect count。

实际 carrier建立属于 Host/Platform Binding：

```text
Desktop
    endpoint/ticket/WebSocket

PWA
    MessagePort creation/transfer
```

这些 material既不进入 Runtime `ready`，也不进入 Renderer Authority Snapshot。

```text
Data loss != Runtime failure
Data loss != Frame unwind
Data retire != authoritative Render Domain destroy
```

## User Input v1

```text
Subsystem → Renderer
    Input Interest

Renderer → Subsystem
    State / Event / Reset
```

Effective Channel：

```text
current matching Data Connection
∩ Main current InputTarget / Activation
∩ Subsystem Interest
∩ Producer availability
```

`.state`每次 non-effective→effective建立 fresh baseline；`.event`只发送未来瞬时事件；Reset/implicit reset处理持续输入 teardown。

Standard Input Mapping具体 payload/limits继续由独立 Profile完成。

## Render Domain / Update

每个 Subsystem Runtime拥有：

```text
0..N Render Domains
```

Domain：

```text
domainId
zIndex
0..N ordered roots
```

Node：

```text
key       Domain-lifecycle logical identity
tag       Renderer Component type
attrs     string→string
data      JSON object
children  ordered child nodes
```

当前 Render Update closure candidate：

```text
render.domains
    Domain lifecycle authority

render.snapshot(revision)
    fresh baseline / full commit

render.patch(baseRevision, revision)
    exact R → R+1 atomic incremental commit
    insert / remove / move / update

render.event
    transient presentation impulse
```

关键原则：

```text
recursive Tree remains authoritative model
one-shot domainId / Node key identity
per-Domain published revision
sender lastEmittedRevision publication cursor
Patch isolated candidate + atomic commit
continuity failure → retire Data carrier → fresh Registry/Snapshots
no ACK/NACK/replay/resync RPC
```

剩余主要是 limits、tag/Component Profile和 conformance；完成后应合并回正式 `render-update-v1.md`。

## Content API v1

Content API负责 logical readonly routes、MIME/cache/version、request authorization semantics、errors/integrity，但不负责 Content capability distribution。

```text
Content API semantics
!=
Content Access Bootstrap/Profile
```

## 关键边界速查

```text
spawn success != connected != identified != ready
ready != Data Connection established
shutdown Response != stopped
Frame outcome != Frame lifecycle
Frame lifecycle != Data Connection lifecycle
Frame lifecycle != Render Domain lifecycle
Data Connection retire != authoritative Domain destroy
Renderer/Data reconnect != Frame recovery
Input Interest != Input authority
Producer availability != Input authority
Render Component availability != Input authority
User Input loss != Runtime failure
```

## 当前协议目录

### Current / Active

- [Game Package v2](./15-contracts/game-package-v2.md)
- [Desktop Node.js Launcher Profile v1](./15-contracts/nodejs-launcher-profile-v1.md)
- [Subsystem Control Protocol v2](./15-contracts/subsystem-control-protocol-v2.md)
- [Runtime Control Application Profile v2](./15-contracts/runtime-control-profile-v2.md)
- [Frame / Call Protocol v1](./15-contracts/frame-call-protocol-v1.md)
- [Frame / Call v1 Conformance Profile](./15-contracts/frame-call-conformance-v1.md)
- [Main ⇄ Renderer Control Protocol v1](./15-contracts/main-renderer-control-v1.md)
- [Renderer ⇄ Subsystem Data Connection v1](./15-contracts/renderer-subsystem-data-connection-v1.md)
- [User Input v1](./15-contracts/user-input-v1.md)
- [Render Update v1](./15-contracts/render-update-v1.md)
- [Render Update v1 Incremental Closure](./15-contracts/render-update-v1-incremental-design.md)
- [Content API v1](./15-contracts/content-api-v1.md)

### Historical / Legacy

- [Subsystem Control v1 — Abandoned](./15-contracts/subsystem-control-lifecycle-protocol.md)
- [Runtime Control Profile v1 — Abandoned](./15-contracts/runtime-control-profile-v1.md)
- `game-package-v1.md`
- `system-lifecycle-protocol.md`
- `frame-data-channel-v1.md`
- `client-state-tree-v1.md`
- `resource-protocol.md`

## ADR

- [ADR 0015 · Frame / Call v1 Completion](./decisions/0015-freeze-frame-call-protocol-v1-batch-f.md)
- [ADR 0016 · Protocol Boundary Cleanup](./decisions/0016-protocol-boundary-cleanup.md)
- [ADR 0017 · Abandon Control v1 / Promote v2](./decisions/0017-abandon-subsystem-control-v1.md)

更早 ADR见 [决策目录](./decisions/README.md)。

## 当前推进状态

```text
Control v1 abandonment / Control v2 promotion  Accepted
Subsystem Control v2                          Current / Stabilizing
Runtime Control Profile v2                    Current / Stabilizing
Frame / Call v1                               Frozen
Renderer Control v1                           near closure
Data Connection v1                            lifecycle closed
User Input v1                                 Core closure reviewed
Render Update incremental design              Closure Candidate
    ↓
Render limits/conformance + official merge
Renderer Component Profile
Standard Input Mapping Profile
Desktop/PWA Bootstrap & Data Binding Profiles
Content Access Profile
```
