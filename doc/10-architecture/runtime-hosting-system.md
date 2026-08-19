# 运行承载系统

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：Subsystem Runtime Container、Runner、Control/Frame/Input/Render 的承载粒度，以及 Platform Runtime Hosting / Supervisor 边界  
> 依赖：[系统架构总览](./system-overview.md)、[平台组合系统](./platform-composition-system.md)  
> 被以下文档细化：[栈式运行系统](./stack-runtime-system.md)、[Subsystem 模型](./subsystem-model.md)、[运行时启动系统](./runtime-bootstrap-system.md)  
> 正式化：[Subsystem Control v1](../15-contracts/subsystem-control-protocol-v1.md)、[Runtime Control Profile v1](../15-contracts/runtime-control-profile-v1.md)、[Frame / Call v1](../15-contracts/frame-call-protocol-v1.md)  
> 最近复核：2026-08-19

---

## 1. Hosting Granularity

```text
one descriptor.key
    → at most one active Runtime Container

one Runtime Container
    → one Host-owned Subsystem Runner
    → one business Definition Module instance
    → 0..N local Frame/Input Contexts
    → 0..N Render Domains
    → 0..1 current Main Control carrier
```

`0..1 current Control carrier` 比“永远 one carrier”更精确：starting前可能尚未建立；loss后 Runtime进入 terminal failure，不 reconnect same attempt。

Renderer Data carrier不属于 Runtime hosting cardinality本身；它由独立 DataAuthority/Broker管理。

---

## 2. Runtime Container vs Business Module

```text
Runtime Container
    physical isolation + Runner + business instance

Definition Module
    platform-neutral business implementation
```

Hostra：

```text
Node child process
→ Host-owned Node Runner
→ import descriptor.module
```

PWA：

```text
Dedicated Worker
→ Host-owned Worker Runner
→ import same descriptor.module
```

业务 module不负责物理 hosting/bootstrap。

---

## 3. Runner Responsibility

Runner位于 Platform与 role Core之间：

```text
Platform bootstrap/provisioning
        ↓
Host-owned Runner
        ↓
Subsystem-facing Platform Ports
        ↓
@loomrealm/subsystem/host
        ↓
Business Definition
```

Runner负责：

```text
Definition Module ABI load/validation
RuntimeControlBinding construction
SubsystemDataBinding construction
ContentClient construction
runSubsystem invocation
platform-local diagnostics/cleanup
```

Runner不拥有 Main Frame/Data authority。

---

## 4. Platform Runtime Hosting

RuntimeHosting负责：

```text
resolve validated module for current installation
create physical Runner Container
provide launch bootstrap material
provide supervision handle
provide bounded terminate capability
```

不负责：

```text
mark ready by itself
create Frame
mint Activation
choose InputTarget
mint Data generation/profile
run failure unwind
```

---

## 5. Supervisor Boundary

Supervisor只报告 physical facts：

```text
container creation success/failure
container alive/exited
exit code/signal/reason
termination request/result
```

Main解释这些 facts 为 public Runtime lifecycle。

```text
spawn/Worker creation success != connected
connected != identified
identified != ready
```

`stopped` 只来自 actual physical termination observation。

---

## 6. Runtime Control Carrier

一个 Launch Attempt最多一个成功 identified Control Connection。

```text
starting
→ physical carrier establishment
→ connected
→ hello
→ identified
```

same-attempt Control reconnect不存在。

Control carrier loss无 shutdown intent → Runtime failed。

Runtime Control application semantics由 Control/Frame/Profile正式契约定义，不由 hosting层定义。

---

## 7. Local Frame/Input Context

一个 Runtime可以承载多个 live local Frame Context，但公共 Stack/Activation authority仍在 Main。

```text
Runtime
├── Frame F1 suspended
├── Frame F2 active
└── possibly other local live contexts over time
```

Local context保存当前协议角色所需状态；不得成为第二份 public Stack authority。

Frame/Input Context lifetime与 Render Domain/Data Connection相互独立。

---

## 8. Render Domains

Runtime可拥有 `0..N` authoritative Render Domains，即使当前：

```text
zero active Frame
zero Data carrier
```

也不自动销毁 Domain。

Runtime terminal cleanup最终会释放该 process/Worker中的 local resources，但不把 Frame close等价为 Domain close。

---

## 9. Data Provisioning Is Adjacent, Not Owned

Data Broker可以向已运行 Runner提供 `SubsystemDataBinding`的新 carrier：

```text
Runtime already ready
→ later DataAuthority appears
→ Platform provisioning
→ Runner establishes/receives carrier
→ SDK DataPlane installs it
```

因此：

```text
Runtime ready != Data current
Runtime hosting != Data connection lifecycle
```

Data provisioning failure不等于 Runtime hosting failure。

---

## 10. Termination

正常：

```text
Main shutdown intent
→ subsystem.shutdown
→ bounded Runner/business cleanup
→ Platform terminate if needed
→ Supervisor observes actual termination
→ stopped
```

异常：

```text
unexpected Runtime exit
Control loss
Runtime self-reported failed
```

进入 Main Runtime failure path。

无 automatic restart；新 Runtime = fresh Launch Attempt。

---

## 11. Cross-platform Realization

```text
Hostra Desktop
    Runtime Container  Node Runner Process
    Supervisor         child process lifecycle
    Control            WebSocket
    provisioning       child IPC/equivalent

PWA
    Runtime Container  Worker Runner
    Supervisor         Worker lifecycle
    Control            MessagePort
    provisioning       Worker Port/message transfer path
```

建立后的 application semantics等价。

---

## 12. Final Invariants

1. one descriptor.key最多一个 active Runtime Container；
2. Runtime Container承载 Host-owned Runner + one business Definition instance；
3. Runtime最多 `0..1 current` Control carrier，same-attempt不 reconnect；
4. Runner是 Platform→Subsystem role ports的适配边界；
5. Supervisor只报告 physical facts；
6. stopped只来自 actual termination；
7. public Frame/Activation authority仍在 Main；
8. local Frame/Input Context不拥有 Render/Data lifecycle；
9. Runtime ready不要求 Data current；
10. Data provisioning failure不等于 Runtime failure；
11. Hostra/PWA hosting机制不同但 role semantics一致。