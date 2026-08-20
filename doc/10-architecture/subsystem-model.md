# 模块子系统模型

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：Subsystem logical role、Definition Module ABI、Runtime/Frame local context、FrameOutcome、Input Interest、Render Domain、错误收敛与 role-facing Platform boundary  
> 依赖：[系统架构总览](./system-overview.md)、[运行承载系统](./runtime-hosting-system.md)、[栈式运行系统](./stack-runtime-system.md)、[通信系统](./communication-system.md)、[渲染系统](./rendering-system.md)  
> 实现草案：[packages/subsystem/DESIGN.md](../../packages/subsystem/DESIGN.md)  
> 最近复核：2026-08-20

---

## 1. Role Boundary

Subsystem Runtime负责：

```text
business state
Runtime-level business initialization/cleanup
local Frame/Input Context
outbound Frame call/return role
Frame-scoped Input Interest
ordinary input receive validation
Render Domain authoritative state
Content client usage
```

Subsystem不负责：

```text
Game/Platform Launch Manifest parsing
executable module selection
Process/Worker creation
Main public Frame/Stack/Activation authority
DataAuthority minting
Renderer hosting
DataConnectionBroker
```

---

## 2. Definition Module ABI

当前 Platform LaunchPlan为每个 Game logical key选择一个 executable Definition Module：

```text
.mjs ESM
default export = SubsystemDefinitionFactory
```

Hostra/PWA MAY选择不同 artifact，但都进入同一 `@loomrealm/subsystem` author/host ABI。

Definition Module不得：

```text
read launch.hostra.json / launch.pwa.json
probe Desktop/PWA to branch business semantics
open WebSocket/MessagePort
read bootstrap token/endpoint directly
spawn Process/Worker
own DataConnectionBroker
```

Game Package不再声明 module path。

---

## 3. Authority Boundary

```text
Main
    Runtime public lifecycle/shutdown intent
    Frame/Stack/Activation/InputTarget
    transaction/failure unwind
    DataAuthority generation/profile

Subsystem
    business state
    Runtime-reported status
    local Frame/Input Context + mutation gate
    Interest[F]
    Render Domain Registry/State

Platform Launcher
    executable binding/preflight/RuntimeHosting/Runner integration

Platform Composition
    complete physical topology/bootstrap/provisioning
```

Physical module/Runner ownership不产生第二份 Runtime/Frame authority。

---

## 4. Subsystem-facing Platform Ports

```text
RuntimeControlBinding
SubsystemDataBinding
ContentClient
```

Platform Runner把 physical resources转换成这些 role-local ports。SDK不探测 Desktop/PWA，不自己选择 transport/module。

---

## 5. Runtime Startup / Ready

```text
Runner loads planned Definition Module
→ validates ABI
→ create Subsystem SDK instance
→ acquire Runtime Control
→ hello / identified
→ definition.initialize
→ ready
```

```text
ready != Data Connection exists
ready != Renderer exists
ready != Frame exists
ready != Render baseline exists
```

Module load/ABI/initialize failure属于 bootstrap failure，不伪造 Frame outcome。

---

## 6. Local Frame Context

一个 Runtime可以同时保存多个 local live Frame Context，但 Main仍拥有公共 Stack/Activation authority。

`frame.initialize`成功只建立 local context：

```text
validate/create context
store params
create branded Frame capability
DO NOT start business handler
```

首次 successful `frame.activate`安装 fresh Activation后，SDK才启动 author handler exactly once。

---

## 7. Frame Capability / Params

业务 Frame至少看到：

```text
id
params
signal
call(subsystem, params)
```

Author不见 activationId。`params`是业务调用输入，不是 User Input。

`frame.signal` normal child-call suspension时存活；administrative suspend/close/Runtime terminal时 abort。

---

## 8. FrameOutcome

业务结果直接对应正式 Frame v1：

```text
completed(value)
cancelled
failed(error)
```

不建立 raw-return/exception第二套 terminal semantics。

---

## 9. `frame.call()` Control-flow

Accepted child call：

```text
caller current Activation
→ Main commits suspension/revocation
→ child Frame lifecycle
→ child terminal outcome
→ child close
→ caller fresh resume
→ SDK installs fresh Activation
→ Promise resolves FrameOutcome
```

Child completed/cancelled/failed都是正常 resolution value。

只有明确 **pre-commit** recoverable rejection可以 typed reject并确认 current Activation仍有效。

Runtime-fatal/ambiguous：

```text
Control loss
Frame timeout/loss with unknown commit
divergence/fatal protocol error
```

MUST NOT重新进入 suspended business continuation。

---

## 10. Mutation Gate / Handler Completion

每个 local Frame Context有 commit-sensitive mutation gate。pending call/return、administrative suspend、closing/closed、Runtime terminal都会阻止 ordinary mutation/input delivery。

Handler返回 FrameOutcome后，SDK先 terminalize local ordinary surface，再发送 `frame.return`。Author不直接调用 wire return。

---

## 11. Business Exception vs Runtime Failure

ordinary uncaught business exception在 authority仍明确健康时：

```text
→ sanitized FrameOutcome.failed
→ normal frame.return path
```

protocol ambiguity、SDK invariant corruption、Control loss：

```text
→ Runtime failure
```

不得互相降级/升级混用。

---

## 12. Administrative Suspend

`frame.suspend` v1是 administrative one-way suspension：revoke Activation、close ordinary gates、abort frame signal、保留 context供 later close cleanup。

已经运行的业务 task late resolve/throw必须 discard，不发送 return。

Child-call suspension不等于 administrative suspend。

---

## 13. Runtime Terminal Hooks

一个 instance只有一个 first terminal cause：graceful Main shutdown或 Runtime-fatal failure。

SDK先 abort relevant signals，再分别进入 bounded `shutdown()` 或 `failed(error)`；同一 instance不重复两种 terminal hook。

---

## 14. Input Interest

InputListener绑定 branded Frame capability。

多个 listener对同一 Frame贡献 union：

```text
Interest[F] = union(listener channel contributions)
```

Interest是 Subsystem-owned Frame-scoped desired config，不是 Main authority。

每次 publication是 full Frame Interest Registry Snapshot，不依赖 incremental subscribe history。

---

## 15. Input Across Activation / Data

Child-call suspension：listener + Interest[F]保留，ordinary delivery停止；fresh resume获得 A2后同一配置重新生效。

old A1 Input State/Event绝不跨到 A2；`.state`重新 baseline。

fresh Data carrier：remote registry/state empty；SDK自动 republish local desired Interest Registry。

Frame close local success前必须关闭 listeners、移除 Interest[F]、清 retained input state。

---

## 16. Input Receive Gate

收到 ordinary State/Event时重新验证：

```text
current Data carrier
local Frame exists/active
activationId == current local Activation
channel ∈ Interest[F]
mutation gate open
```

不满足则 drop；stale input不升级 Runtime failure。

---

## 17. Render Domain

Subsystem author创建 `RenderDomain`表达 desired authoritative presentation state与 transient event。

SDK mint protocol domainId；业务 name不是 protocol identity。

```text
Frame close != Domain destroy
Frame suspend != Domain hide
Activation change != Domain lifecycle
Data retire != authoritative Domain destroy
```

如果业务需要 scope同生共死，由业务显式 close Domain。

---

## 18. Render / Data Reconnect

Data carrier替换时业务 RenderDomain object/desired state保持。

fresh carrier：

```text
current Domain Registry
→ fresh Snapshot each current Domain
→ Patch/Event
```

不能复用旧 patch base/revision。

---

## 19. DataPlane

Subsystem SDK只有一个 connection-wide DataPlane reader：

```text
SubsystemDataBinding
        ↓
DataPlane
      /       \
 InputManager RenderManager
```

DataPlane验证 generation/profile/current installation、拥有 one carrier reader、JSON text parse、Data Profile demux、fresh-carrier notification/retirement cleanup。

Input/Render manager不得竞争消费 raw carrier。

---

## 20. Dynamic Platform Provisioning

Hostra：

```text
Broker → Runner IPC → one-time Data endpoint/ticket → Data WS → SubsystemDataBinding
```

PWA：

```text
Broker → Worker provisioning → transferred MessagePort → SubsystemDataBinding
```

Provisioning不是 Runtime Control、Renderer Data application carrier或 author API。

Provisioning failure不自动失败 Runtime/Frame。

---

## 21. Content

Author只使用 platform-neutral `ContentClient`。Hostra HTTP/fs与 PWA Fetch/SW/OPFS差异在 Platform/Content adapter下吸收。

Executable module resolution与 ordinary Content capability严格分离。

---

## 22. Cross-platform Business Portability

业务依赖：

```text
@loomrealm/map → @loomrealm/subsystem
```

共享的是：

```text
same logical subsystem key
same SubsystemDefinitionFactory ABI
same author capability/control-flow
same business-observable semantics
```

不是：

```text
same module path
same emitted bytes
same Runner/Transport
```

不同平台 build artifact不得通过隐藏 platform branch改变业务语义。

---

## 23. Error / Diagnostics Boundary

Author-safe errors与 wire/protocol/platform errors分域。

```text
business validation/failure → FrameOutcome.failed
pre-commit call rejection → typed recoverable local error
protocol ambiguity/fatal → Runtime failure
module load/ABI → bootstrap failure
platform provisioning failure → Data unavailable
```

Platform path/token/ticket/credential/internal stack不得泄漏给普通业务错误。

---

## 24. Final Invariants

1. Subsystem role platform-neutral；
2. Game Package只声明 logical key；Definition Module由 Platform LaunchPlan选择；
3. Definition Module与 Host-owned Runner/Platform分离；
4. selected artifact可按平台不同，但统一 `SubsystemDefinitionFactory` ABI；
5. role只消费 RuntimeControlBinding/SubsystemDataBinding/ContentClient；
6. ready不携/暗示 Data；
7. Frame public authority = Main；
8. initialize只建 Context，activate后才启动 handler；
9. FrameOutcome与 protocol三态一一对应；
10. child outcomes resolve，只有 pre-commit rejection才可 catch继续；
11. Runtime-fatal绝不重新进入业务 continuation；
12. Interest Frame-scoped，fresh Activation不复用 old input state；
13. fresh Data重新建立 Input/Render baselines；
14. Render Domain独立于 Frame/Data carrier；
15. one DataPlane统一 demux；
16. Platform provisioning不污染 application protocols；
17. executable capability与 ordinary Content capability分离；
18. Hostra/PWA physical/artifact差异不得改变 business-observable semantics。
