# 模块子系统模型

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：Subsystem logical role、Definition Module、Runtime/Frame local context、FrameOutcome、Input Interest、Render Domain、错误收敛与 role-facing Platform boundary  
> 依赖：[系统架构总览](./system-overview.md)、[运行承载系统](./runtime-hosting-system.md)、[栈式运行系统](./stack-runtime-system.md)、[通信系统](./communication-system.md)、[渲染系统](./rendering-system.md)  
> 被以下文档使用：[运行时启动系统](./runtime-bootstrap-system.md)  
> 正式化：[Subsystem Control v1](../15-contracts/subsystem-control-protocol-v1.md)、[Frame / Call v1](../15-contracts/frame-call-protocol-v1.md)、[User Input v1](../15-contracts/user-input-v1.md)、[Render Update v1](../15-contracts/render-update-v1.md)  
> 实现草案：[packages/subsystem/DESIGN.md](../../packages/subsystem/DESIGN.md)  
> 最近复核：2026-08-19

---

## 1. Role Boundary

Subsystem Runtime负责：

```text
business state
Runtime status reporting
local Frame/Input Context
outbound Frame call/return role
Frame-scoped Input Interest desired state
ordinary input receive validation
Render Domain authoritative state
Content client usage
```

Subsystem不建立完整 Platform topology，也不拥有 Main public Frame/Data authority。

---

## 2. Definition Module

Game Package `descriptor.module` 加载一个 platform-neutral Subsystem Definition Module：

```text
default export = SubsystemDefinitionFactory
```

同一 module由 Hostra Node Runner / PWA Worker Runner加载。

Definition Module不：

```text
open WebSocket/MessagePort
read platform bootstrap material
spawn Process/Worker
own DataConnectionBroker
```

---

## 3. Authority Boundary

```text
Main
    Runtime public lifecycle/shutdown intent
    Frame identity/caller/lifecycle/outcome/Stack
    Activation/InputTarget
    transaction/failure unwind
    DataAuthority generation/profile

Subsystem
    business state
    Runtime-reported status
    local Frame/Input Context
    mutation gate
    Interest[F]
    Render Domain Registry/State

Renderer
    Main committed mirror
    Data endpoint
    Input producer/gate
    Render replica/presentation

Platform
    physical Runner/connection/content topology
    bootstrap/provisioning
```

Subsystem不得建立第二份 public Stack/recovery authority。

---

## 4. Subsystem-facing Platform Ports

Subsystem role消费：

```text
RuntimeControlBinding
SubsystemDataBinding
ContentClient
```

这些只是 System Platform 在 Subsystem side 的投影。

```text
RuntimeControlBinding
    one-shot per Launch Attempt

SubsystemDataBinding
    stream of already-bound {generation,dataProfile,carrier}
```

SDK不探测 Desktop/PWA或自行选择 transport。

---

## 5. Runtime Lifecycle / Ready

```text
subsystem.hello
subsystem.status
subsystem.shutdown
```

```text
launch != connected != identified != ready
```

`ready` 只表示 required initialization完成并能承担 Runtime Control Profile。

不表示：

```text
Renderer exists
DataAuthority/Data carrier exists
Data provisioning occurred
Frame/Render/InputTarget exists
```

---

## 6. Local Frame Context

`frame.initialize`：

```text
create local context
store business params
create branded Frame capability
DO NOT start author frame handler
```

`frame.activate` successful 后：

```text
install fresh Activation
mark active
start author frame handler exactly once
```

这样业务不会在 `starting` context上执行 ordinary mutation/input。

---

## 7. FrameOutcome Mapping

业务直接使用正式三态：

```text
completed(value)
cancelled
failed(error)
```

Author handler返回 `FrameOutcome`；SDK转成 protocol `frame.return`。

Child `frame.call()`：

```text
child completed/cancelled/failed
→ resolve Promise<FrameOutcome>
```

不是 JS reject。

只有明确 pre-commit recoverable call rejection MAY reject typed `FrameCallRejectedError` 并继续当前 Activation。

---

## 8. Runtime-fatal Continuation Rule

以下：

```text
Control loss
ambiguous Frame timeout/loss
divergence/fatal protocol error
Runtime terminal failure
```

MUST NOT 作为可 catch 后继续的普通业务 rejection重新进入 suspended continuation。

SDK固定：

```text
keep mutation gate closed
abort instance/frame signals
quarantine outstanding business tasks
no business continuation resume
```

这是 Frozen Frame commit semantics的 author-level投影。

---

## 9. Business Exception Boundary

active Frame handler未捕获 ordinary business exception：

```text
→ sanitized Frame failed outcome
```

而：

```text
protocol ambiguity
SDK invariant corruption
Control loss
```

→ Runtime failure。

业务 bug 与协议/Runtime corruption不能混为一个 error domain。

---

## 10. Mutation Gate

pending：

```text
frame.call
frame.return terminalization
administrative suspend
closing/closed
Runtime terminal
```

阻止新的 ordinary input/call/return。

明确 recoverable pre-commit Error才释放 gate回到 same Activation。

---

## 11. Administrative Suspend

`frame.suspend` success：

```text
revoke local Activation
ordinary mutation/input gate closed
abort Frame-scoped signal
context waits later close cleanup
```

v1无 normal resume；late handler result不得发送 frame.return。

Child-call suspension不是 `frame.suspend`，Frame task/Frame signal继续跨 fresh resume存在。

---

## 12. Input Interest

```text
InterestRegistry = Map<frameId, Set<channel>>
```

Interest是 Subsystem-owned desired config，不是 Main authority。

```text
child-call suspension → MAY retain Interest[F]
fresh Activation      → MAY reuse Interest[F]
Frame close            → MUST remove local Interest[F]
fresh Data carrier     → remote registry empty; republish full desired registry
```

Frame close local success成立前，listeners/Interest/retained input state必须已经清理。

---

## 13. Input Receive Gate

至少：

```text
current Data carrier
local frame exists
Frame active
activationId current
channel ∈ local Interest[F]
mutation gate open
```

否则 drop；stale input不产生 Runtime failure。

---

## 14. DataPlane

Subsystem side只有一个 DataPlane消费唯一 current Data carrier：

```text
SubsystemDataBinding
        ↓
DataPlane
   ┌────┴────┐
 Input     Render
```

DataPlane负责 `dataProfile`/generation/current installation、JSON text parse、`input.*`/`render.*` demux、fresh carrier通知。

Input/Render不得各自竞争读取 raw carrier。

---

## 15. Data Reconnect

old carrier retired：

```text
business state remains
Frame Context remains
InputListener/local desired Interest remains
RenderDomain/local desired state remains
wire child state discarded
```

fresh carrier：

```text
Input → remote Interest/state empty; republish
Render → domains + fresh snapshots
```

Data recovery不是 Frame recovery。

---

## 16. Render Domain

```text
0..N Domains per Runtime
```

Domain由 Subsystem拥有 independent lifecycle/state。

```text
Frame close != Domain destroy
Frame suspend != Domain hide
Activation change != Domain lifecycle
Data retire != authoritative Domain destroy
```

---

## 17. Platform Provisioning Boundary

Desktop已经运行的 Node Runner通过独立 Platform Provisioning Channel取得 later Data physical material，并实现 `SubsystemDataBinding`。

PWA通过 Worker provisioning/Port transfer实现相同 port semantics。

Provisioning channel不是 Runtime Control/Data application/business API。

---

## 18. Runtime Terminal

first terminal cause：

```text
graceful Main shutdown
OR
Runtime failure
```

SDK先 abort scoped signals，再执行 bounded terminal hook：

```text
shutdown()
OR
failed(error)
```

同一 instance不重复触发两个 author terminal hooks。

Runtime terminal后不自行恢复 old Activation/Frame stack。

---

## 19. Business Author Boundary

Author只看到：

```text
SubsystemScope
Frame / FrameOutcome
InputListener
RenderDomain
ContentClient
AbortSignal
```

不看到：

```text
MessageCarrier
WebSocket / MessagePort
bootstrapToken
request ID
activationId
Data generation/profile
Platform provisioning
wire method names
```

---

## 20. Final Invariants

1. Subsystem role platform-neutral；
2. Definition Module与 Runner/Platform分离；
3. role只消费 RuntimeControlBinding/SubsystemDataBinding/ContentClient；
4. ready不携/暗示 Data；
5. Frame public authority = Main；
6. initialize只建 Context，activate后才启动 handler；
7. FrameOutcome与 protocol三态一一对应；
8. child Outcome resolve call，只有 pre-commit recoverable rejection可 reject；
9. Runtime-fatal绝不重新进入业务 continuation；
10. business exception→Frame failed，protocol corruption→Runtime failed；
11. Interest Frame-scoped，可跨 Activation配置复用；
12. Frame close local success前 MUST删除 Interest/listeners/state；
13. fresh Data child state重新 baseline；
14. one DataPlane统一 demux Input/Render；
15. Render Domain独立于 Frame/Data carrier；
16. Platform provisioning不污染 application protocols；
17. same Definition Module可跨 Hostra/PWA运行。