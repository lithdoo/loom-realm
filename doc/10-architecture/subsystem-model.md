# 模块子系统模型

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：Subsystem 的职责、Runtime Control、Frame/Input Context、Frame-scoped Input Interest、Render Domain、错误收敛与 Platform-facing boundary  
> 依赖：[平台组合系统](./platform-composition-system.md)、[运行承载系统](./runtime-hosting-system.md)、[栈式运行系统](./stack-runtime-system.md)、[渲染系统](./rendering-system.md)  
> 下层契约：[Subsystem Control v1](../15-contracts/subsystem-control-protocol-v1.md)、[Runtime Control Profile v1](../15-contracts/runtime-control-profile-v1.md)、[Frame / Call Protocol v1](../15-contracts/frame-call-protocol-v1.md)、[User Input v1](../15-contracts/user-input-v1.md)、[Render Update v1](../15-contracts/render-update-v1.md)  
> 最近复核：2026-08-19

## 1. Subsystem 职责

Subsystem Runtime 负责：

```text
business state
Runtime lifecycle reporting
local Frame/Input Context
outbound Frame call/return
Frame-scoped Input Interest configuration
ordinary input receive validation
Render Domain Registry / authoritative state
Content client usage
```

它不负责建立整个系统的 Platform topology。

Hostra Desktop / PWA 通过 System Platform Composition 向 Subsystem role 提供所需 connection/content ports；Subsystem application semantics 保持一致。

当前 Runtime Control：

```text
Subsystem Control v1
+
Frame / Call v1
=
Runtime Control Application Profile v1
```

---

## 2. Authority Boundary

```text
Main
    Runtime Registry / shutdown intent
    Frame identity / caller / lifecycle / outcome
    Stack / transaction / failure unwind
    Activation / InputTarget
    DataAuthority

Subsystem Runtime
    Runtime status reporting
    business state
    local Frame/Input Context
    mutation gate
    Frame Interest Registry desired state
    Render Domain Registry / State

Renderer
    Main committed authority mirror
    Data Connection replica endpoint
    Input producer/enforcement state
    Render replica / presentation

Platform
    physical Runtime/Renderer/connection/content topology
```

Subsystem 不得创建公共 frameId/activationId、修改 Main Stack/Caller、维护第二份 public recovery authority，或从本地决定 lower Frame resume。

---

## 3. Subsystem-facing Platform Boundary

Subsystem logical role需要类似：

```text
Runtime Control connection source
Renderer Data connection source
Content client/binding
```

这些是 system Platform 在 Subsystem side 的 local projection。

重要：

```text
role-local connection binding != whole Platform architecture
MessageCarrier != connection establishment policy
```

Subsystem SDK 不应探测 Desktop/PWA，也不直接选择 WebSocket/MessagePort。

---

## 4. Runtime Lifecycle / Ready

Subsystem 通过：

```text
subsystem.hello
subsystem.status
subsystem.shutdown
```

参与 Runtime lifecycle。

```text
launch != connected != identified != ready
```

`ready` 只表示 required initialization 完成并能承担 Runtime Control Profile v1。

`ready` 不表示：

```text
Renderer connected
Data Connection exists
Frame exists
Render Domain exists
InputTarget exists
```

也不得携 Renderer Data endpoint/Port/ticket。

---

## 5. Runtime Control / Frame

Frame lifecycle：

```text
starting / active / suspended / closing / closed
```

Activation：one-shot / never reused。

RPC exactly seven：

```text
Main → Subsystem
    initialize / activate / suspend / resume / close
Subsystem → Main
    call / return
```

同一 Control carrier 上 Control + Frame 共享 sender-side Request ID namespace；no JSON-RPC Batch。

Desktop WebSocket / PWA MessagePort 建立后必须共享相同 application semantics。

---

## 6. Local Frame Context / Mutation Gate

Subsystem SDK 内部维护：

```text
frameId
business params
lifecycle
current Activation when active
outbound mutation gate
```

业务 author 不需要接触 `activationId`。

pending `frame.call` / return commit 时：

```text
hold mutation gate
stop ordinary input delivery for Frame
reject second ordinary mutation
```

Success/Explicit Error/timeout 的处理服从 Frame v1；ambiguous timeout/loss 不恢复 old Activation，也不 retry。

---

## 7. Frame Call Continuation

高层 SDK 可把：

```text
frame.call Request
→ caller suspended
→ child lifecycle
→ child return/close
→ caller resume(fresh Activation)
```

封装为普通 async continuation：

```text
await frame.call(...)
```

只有 fresh resume 完成后 business continuation 才恢复。

业务不需要监听 wire `frame.resume`，也不需要重建 Input configuration。

---

## 8. User Input Interest

Input configuration scope = Frame：

```text
InterestRegistry = Map<frameId, Set<channel>>
```

它是 Subsystem-owned desired configuration，不是 Main authority。

```text
Frame suspension
    may retain Interest[F]

fresh Activation on same Frame
    may reuse Interest[F]

Frame close
    local Interest[F] should be removed

fresh Data Connection
    remote registry starts empty
    Subsystem republishes current full registry
```

Interest 不含 `activationId`，也不产生 InputTarget。

---

## 9. Ordinary Input Receive Gate

收到 Renderer input 至少检查：

```text
message belongs to current Data Connection
frameId exists locally
Frame active
activationId == current local Activation
channel ∈ local Interest[frameId]
mutation gate open
```

否则 drop。

旧 Activation 的 Input State/Event 不得跨 fresh Activation 重解释；fresh `.state` baseline由 User Input v1 保证。

---

## 10. Render Domain Model

每个 Subsystem Runtime MAY拥有 `0..N` Render Domains：

```text
Subsystem Runtime
├── Domain A
├── Domain B
└── ...
```

Domain 是 Subsystem-owned lifecycle/state/composition unit，不属于 Frame，也不由 Main维护。

```text
Frame close != Domain destroy
Frame suspend != Domain hidden
Activation change != Domain lifecycle
Data retire != authoritative Domain destroy
```

Subsystem 可以让多个 Frame共享同一 Domain，也可以让 zero-Frame Runtime继续拥有 Domain。

---

## 11. Render / Presentation Boundary

Render Update 只传 plain authoritative data：

```text
Domain Registry
Snapshot
Patch
Event
```

Node `tag` 是 opaque string。协议/Subsystem Architecture 不定义：

```text
known/unknown component type
Component Bootstrap/Profile
DOM/Canvas/WebGL mapping
executable object in Render State
```

具体 presentation mapping 属于 Renderer implementation。

---

## 12. Data Connection Lifetime

Subsystem-facing Data connection source 可以顺序提供 fresh carriers。

同 generation reconnect：

```text
old carrier retired
→ new carrier current
```

不重建 Runtime/Frame/Render business objects。

fresh carrier child state：

```text
User Input remote Interest Registry = empty
Render replication needs Registry + fresh Snapshots
```

SDK 应自动根据 local desired Input/Render state恢复 publication，业务不参与 reconnect。

---

## 13. Runtime Failure Trigger

Subsystem自身 Frame timeout、Control divergence 或 protocol error：

```text
stop normal Frame processing
keep ambiguous mutation gate closed
report subsystem.status(failed) when Control usable
```

no retry/replay/idempotency journal。

Runtime failure 后 Stack 如何收敛完全由 Main 决定。

Subsystem MUST NOT：

```text
自行选择 lower Frame active
自行恢复旧 Activation
自行逐层 resume suspended Frame
根据本地 Context猜 unwind root
```

---

## 14. Healthy / Failed Cleanup

健康 Runtime 的 doomed Frame 可以接收 Main `frame.close` cleanup；local Frame/Input Context 删除，但 Render Domain/shared business state不由 close 隐式清理。

Runtime terminal failed 后不发起新的 normal Frame operation；迟到 Frame Response 不恢复 terminal failure。

---

## 15. Business Author Boundary

推荐业务只看到：

```text
Frame
InputListener
RenderDomain
ContentClient
lifecycle hooks
```

不看到：

```text
WebSocket / MessagePort
MessageCarrier
bootstrapToken
requestId
activationId
Data generation
wire method names
```

同一 business Subsystem definition 应可由 Hostra Desktop / PWA Platform Composition 运行。

---

## 16. Conformance

Subsystem role implementation必须通过：

- Control v1 / Runtime Control Profile v1 applicable fixtures；
- Frame / Call v1 Subsystem-role fixtures；
- User Input receive/Interest/reconnect fixtures；
- Render Update sender/reconnect fixtures；
- role-facing platform port fake integration；
- Hostra/PWA shared-business abstract-trace equivalence。

---

## 17. 架构不变量

1. Subsystem role platform-neutral；
2. System Platform负责 physical topology，本角色只消费 local ports；
3. Runtime Control Profile v1 = Control v1 + Frame v1；
4. `ready`不携 Data endpoint；
5. Frame/Stack/Activation/recovery authority = Main；
6. exactly seven Frame RPC；
7. call/return pending有 mutation gate；
8. timeout/ambiguous不释放旧 Activation、不 retry；
9. Input Interest 是 Frame-scoped configuration，不是 authority；
10. fresh Activation可复用 Interest config，不可复用 old Input State/Event；
11. fresh Data carrier remote Interest从 empty开始；
12. Render Domain独立于 Frame/Data carrier lifecycle；
13. terminal failed Runtime不尝试本地 Frame recovery；
14. same business definition应可跨 Hostra Desktop/PWA运行。
