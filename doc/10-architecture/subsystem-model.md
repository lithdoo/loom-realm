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

Subsystem Runtime负责 business state、Runtime status reporting、local Frame/Input Context、outbound Frame call/return role、Frame-scoped Input Interest、ordinary input receive validation、Render Domain authoritative state与 Content client usage。

Subsystem不建立 Platform topology，也不拥有 Main public Frame/Data authority。

---

## 2. Definition Module ABI

当前 Platform LaunchPlan为每个 logical Subsystem key选择一个 executable Definition Module。

该 module必须：

```text
ESM .mjs
default export = SubsystemDefinitionFactory
```

Hostra/PWA MAY选择不同 artifact，但都进入同一 `@loomrealm/subsystem` author/host ABI。

Definition Module不：

```text
read launch.hostra.json / launch.pwa.json
open WebSocket/MessagePort
read Platform bootstrap material
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

Platform
    launch binding/plan
    physical Runner/connection/content topology
    bootstrap/provisioning
```

---

## 4. Subsystem-facing Platform Ports

Subsystem role消费：

```text
RuntimeControlBinding
SubsystemDataBinding
ContentClient
```

SDK不探测 Desktop/PWA或自行选择 transport/module。

---

## 5. Runtime Lifecycle / Ready

```text
launch != connected != identified != ready
```

`ready`只表示 required initialization完成并能承担 Runtime Control Profile；不表示 Renderer/Data/Frame/Render存在。

---

## 6. Local Frame Context

`frame.initialize`只建立 local context，存 params并创建 branded Frame capability，不启动 author handler。

successful `frame.activate`安装 fresh Activation后才启动 handler exactly once。

---

## 7. FrameOutcome / Call Mapping

业务三态：

```text
completed(value)
cancelled
failed(error)
```

Child outcome正常 resolve `Promise<FrameOutcome>`；只有明确 pre-commit recoverable call rejection MAY typed reject并继续 current Activation。

Runtime-fatal/ambiguous MUST NOT重新进入 suspended business continuation。

---

## 8. Mutation / Exception / Suspend

pending call/return、administrative suspend、closing/closed、Runtime terminal都会关闭 ordinary mutation gate。

ordinary business exception在 authority仍明确健康时 → sanitized Frame failed outcome；protocol ambiguity/SDK invariant corruption/Control loss → Runtime failure。

administrative suspend aborts Frame signal并丢弃 late terminal attempt；child-call suspension不等同 administrative suspend。

---

## 9. Input Interest / DataPlane

Interest是 Subsystem-owned Frame-scoped desired config，不是 Main authority。fresh Activation可复用 config但不能复用 old Input State/Event。

Subsystem side只有一个 DataPlane消费 current Data carrier并 demux `input.*` / `render.*`。fresh Data carrier要求 Input registry/state和 Render replica重新 baseline。

---

## 10. Render Domain

Render Domain由 Subsystem拥有独立 lifecycle：

```text
Frame close != Domain destroy
Frame suspend != Domain hide
Activation change != Domain lifecycle
Data retire != authoritative Domain destroy
```

---

## 11. Platform Provisioning

Hostra通过 Runner provisioning IPC获得 later Data material；PWA通过 Worker provisioning/Port transfer。Provisioning不是 Runtime Control/Data application/business API。

---

## 12. Business Author Boundary

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
Game/Platform Launch Manifest
module path / URL
MessageCarrier
bootstrapToken
request ID / activationId
Data generation/profile
Platform provisioning
```

---

## 13. Cross-platform Business Rule

共享要求是：

```text
same SubsystemDefinitionFactory ABI
same formal role semantics
same logical business behavior
```

不是：

```text
same module path
same output bytes
same physical Runner
```

业务 source SHOULD保持 platform-neutral；不同平台 build artifact不得通过隐藏 Platform branch改变业务语义。

---

## 14. Final Invariants

1. Subsystem role platform-neutral；
2. Definition Module由 Platform LaunchPlan选择，不由 Game Package声明；
3. Definition Module与 Runner/Platform分离；
4. role只消费 RuntimeControlBinding/SubsystemDataBinding/ContentClient；
5. ready不携/暗示 Data；
6. Frame public authority = Main；
7. initialize只建 Context，activate后才启动 handler；
8. FrameOutcome与 protocol三态一一对应；
9. Runtime-fatal绝不重新进入业务 continuation；
10. Interest Frame-scoped；fresh Data重新 baseline；
11. Render Domain独立于 Frame/Data carrier；
12. Platform provisioning不污染 application protocols；
13. Hostra/PWA selected artifact可不同，但必须实现同一 author ABI和等价业务语义。
