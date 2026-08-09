# 模块子系统模型

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：Subsystem 的职责、Runtime Control、Frame/Input 适配、Render Domain、mutation gate、协议校验、错误收敛与 Runtime failure unwind 边界  
> 依赖：[运行承载系统](./runtime-hosting-system.md)、[栈式运行系统](./stack-runtime-system.md)、[渲染系统](./rendering-system.md)  
> 下层契约：[Subsystem Control v2](../15-contracts/subsystem-control-protocol-v2.md)、[Runtime Control Profile v2](../15-contracts/runtime-control-profile-v2.md)、[Frame / Call Protocol v1](../15-contracts/frame-call-protocol-v1.md)  
> 最近复核：2026-08-09

## 1. Subsystem 职责

Subsystem负责自身 business state、Runtime lifecycle reporting、Frame/Input Context、ordinary User Input校验、Render Domain Registry / Domain Tree State、Content Client与 Frame / Call adapter。平台不要求 per-Frame Core/Render/Tick。

当前 Runtime Control组合：

```text
Subsystem Control v2
+
Frame / Call v1
=
Runtime Control Application Profile v2
```

Control v1/Profile v1已实现前废弃。

## 2. Authority Boundary

```text
Main
    Runtime Registry / Supervisor / shutdown intent
    Frame identity / caller / lifecycle / outcome
    Stack / transaction / Runtime-failure unwind
    Activation / InputTarget
    DataAuthority
    Frame error classification

Subsystem Runtime
    Runtime status reporting under Control v2
    business state
    Frame/Input Context
    Frame Protocol Validator
    outbound Request ID allocator
    outbound call/return mutation gate
    local deadline/failure handling
    Render Domain Registry / Domain Tree State

Renderer
    Main committed control-state mirror
    Data Connection / User Input producer state / Render Domain presentation
```

Subsystem不得创建公共 frameId/activationId、修改 Main Stack/Caller、维护第二份公共 recovery authority或从本地决定 lower Frame resume。

Subsystem Control `ready`不得携带 Renderer Data endpoint；Data carrier由 Renderer Control DataAuthority + Host/Platform Binding独立建立。

## 3. Runtime Lifecycle / Ready

Subsystem通过 Control v2：

```text
subsystem.hello
subsystem.status
subsystem.shutdown
```

报告/参与 Runtime lifecycle。

```text
spawn != connected != identified != ready
```

`ready`只表示 required initialization完成，并能承担 Runtime Control Profile v2中的完整 Frame / Call v1 Subsystem角色。

`ready`不表示：

```text
Renderer connected
Data Connection exists
Frame exists
Render Domain exists
InputTarget exists
```

## 4. Subsystem Render Domain Model

每个 Subsystem Runtime MAY拥有 `0..N` 个独立 Render Domains。

```text
Subsystem Runtime
├── Domain A
│   ├── zIndex
│   └── roots[]
├── Domain B
│   ├── zIndex
│   └── roots[]
└── ...
```

完整 authority identity由 current Data Connection scope + `domainId`确定；架构层可简写为：

```text
(subsystemKey, domainId)
```

Domain是 Subsystem-owned lifecycle/state/composition unit，不属于 Frame，也不由 Main维护。

Node当前模型：

```text
key       Domain-wide logical identity
tag       logical Renderer Component type
attrs     string→string declarative attributes
data      JSON object component state
children  ordered child nodes
```

Domain Host不是 Render Node；轻量 Domain无需 fake root/container。

Subsystem可以让多个 Frame共享同一 Domain，也可以让 zero Frame Runtime继续拥有 Domain。

## 5. Frozen Frame Model / RPC

```text
lifecycle = starting / active / suspended / closing / closed
outcome   = completed / cancelled / failed
Activation = one-shot / never reused / never rolled back
```

RPC exactly seven：

```text
Main → Subsystem
    initialize / activate / suspend / resume / close
Subsystem → Main
    call / return
```

无 `frame.cancel/frame.abort/frame.unwind/frame.version/frame.capabilities`、Caller wire、close reason、`system.call/system.return/frame.result`。

## 6. Shared Control Connection / Version

Control v2与 Frame v1复用同一 authenticated Control carrier时，按 Runtime Control Profile v2：

```text
one transport unit = one JSON-RPC message
no JSON-RPC Batch
shared sender-side Request ID namespace across Control + Frame
```

`subsystem.hello.protocolVersions`只协商 Subsystem Control，当前 Runtime MUST支持/advertise version 2。

Frame v1无独立 `frame.hello/version/capabilities`；由 Profile v2静态绑定。

Desktop WebSocket与PWA MessagePort建立后必须共享相同 application semantics。

## 7. Outbound Protocol Validation

Subsystem SDK发送 `frame.call / frame.return` 前 MUST执行 Frame v1 validator：

```text
plain JSON values only
finite binary64 / safe integer
valid Unicode scalar strings
closed schema
message <=1 MiB
JSON depth <=64
business JsonValue <=512 KiB
identity/failure field limits
```

PWA Runtime不得借 Structured Clone传 BigInt/ArrayBuffer/MessagePort/Blob等非 Frame JSON value。

## 8. Request ID / Deadline

Subsystem outbound JSON-RPC Request ID是 positive safe integer `1..2^53-1`，同一 Control Connection生命周期内 sender-side不得复用。

由于 Control v2与 Frame v1共享 carrier，`subsystem.hello`、`frame.call`、`frame.return`共用 Subsystem sender namespace。

Subsystem为 `frame.call/frame.return`选择 connection-stable sender-local deadline，整数 `1000..300000ms`，使用 monotonic clock。

## 9. Mutation Gate

Subsystem outbound `frame.call / frame.return` pending时停止新的 ordinary input dispatch并阻止第二个 call/return。

```text
Success
    → commit corresponding suspended/closing local state

Recoverable Explicit Error
    → release gate / current active Activation remains

Fatal Explicit Error or timeout/loss
    → MUST NOT release back to old Activation
    → Runtime failure path
```

`Explicit Error=no-commit`不等于 recoverable。

## 10. Incoming Frame Control

`frame.initialize`可用 `FRAME_INITIALIZE_REJECTED + FrameFailure`做合法业务拒绝，表示 Context未 commit且 Runtime healthy。

合法 `activate/suspend/resume/close` 的 identity/lifecycle/Activation mismatch是 control divergence，不做私有 resync。

`resume`同时交付 Child Outcome + replacement Activation；`close`不停止 Runtime、不清共享业务状态、不销毁 Render Domain。

## 11. Runtime Failure Trigger

Subsystem自身 `frame.call/return` timeout、Control divergence或 protocol error时：

```text
stop normal Frame processing
keep ambiguous mutation gate closed
report subsystem.status(failed) when Control v2 carrier is usable
```

诊断至少：`FRAME_CONTROL_TIMEOUT / FRAME_CONTROL_DIVERGENCE / FRAME_CONTROL_PROTOCOL_ERROR`。No retry/replay/idempotency journal。

## 12. Subsystem 不拥有 Unwind

Runtime failure后 Stack如何收敛完全由 Main决定。

Subsystem MUST NOT：

```text
自行选择 lower Frame active
自行恢复旧 Activation
自行逐层 resume suspended Frame
根据本地 Context猜测 unwind root
```

same-Subsystem recursion下 Runtime一旦 terminal failed，所有该 Runtime Frame都由 Main lowest-root/fixed-point authority处理。

## 13. Healthy / Failed Runtime Cleanup

Runtime健康但其 Frame因 ancestor failure成为 doomed descendant时，Main会撤销公共 authority并发送 `frame.close`。Subsystem按普通 close删除对应 Frame/Input Context；Render Domains与共享 business state不由 Frame close隐式删除。

Runtime terminal failed后 MUST NOT发起新的正常 Frame operation。Main也不依赖新的 normal Frame RPC清理该 Runtime上的 Frame。

迟到 Frame Response不恢复 terminal failure。

## 14. Outcome / Ordinary Input

已成功 `frame.return` 的 terminal outcome不会因为 Runtime随后 crash而被覆盖。

ordinary input router至少要求：

```text
current Data Connection
frameId exists
local Context active
activationId current
channel locally interested
no mutation gate
```

Main的公共 ordinary input authority仍由 Renderer Core依据 current InputTarget执行 sender-side gate；Subsystem拒绝 stale Activation与不感兴趣 Channel。

Render Domain/Node/component不是 ordinary input authority。

## 15. Renderer Component Boundary

Subsystem的 Render Node `tag`是逻辑 Renderer Component type，不等于 DOM tag。

Component resolution至少按：

```text
(subsystemKey, tag)
→ Renderer Component Factory
```

Component实现代码/资源如何进入 Renderer属于 Renderer Component Bootstrap/Profile 或 Host/Package loading边界，不属于 Control/Frame协议，也不应由 Render State直接携 executable object。

## 16. Render Update Boundary

Render Update独立于 Control/Frame，运行在 current Renderer⇄Subsystem Data Connection上。

当前 closure candidate使用：

```text
Domain Registry
Snapshot(revision)
Patch(R→R+1)
Event
```

Frame close/unwind不隐式 create/hide/destroy Domain；Data reconnect也不能修复 Frame authority。

## 17. Conformance

Subsystem SDK必须通过：

- Control v2 / Runtime Control Profile v2适用 integration fixtures；
- [Frame / Call v1 Conformance Profile](../15-contracts/frame-call-conformance-v1.md)中 Subsystem角色适用 fixtures。

才能声明当前 Runtime Control角色 conformant。

## 18. 架构不变量

1. 当前 Subsystem Control版本=2；v1已实现前废弃；
2. Runtime Control Profile v2 = Control v2 + Frame v1；
3. `ready`不携 Data endpoint；
4. Frame/Stack/Activation/recovery authority=Main；
5. Subsystem无第二份 Caller/Stack/unwind authority；
6. exactly seven Frame RPC；
7. call/return pending有 mutation gate；
8. timeout/ambiguous不释放旧 Activation、不 retry；
9. initialize business rejection可恢复；divergence/protocol fatal；
10. terminal failed Runtime不尝试本地 Frame recovery；
11. no Frame handshake/downgrade/partial support claim；
12. healthy doomed Frame接受 Main `frame.close` cleanup；
13. accepted outcome不因 Runtime crash改变；
14. 每个 Runtime可拥有 `0..N` Render Domains；
15. Domain/Node不是 Frame/Input authority；
16. Frame lifecycle不控制 Domain/Data/Runtime lifecycle。
