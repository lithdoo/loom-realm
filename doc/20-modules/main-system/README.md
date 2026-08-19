# 程序主系统模块设计

> 层级：模块设计  
> 状态：Active Design  
> 稳定程度：Experimental  
> 主要定义：Main 内部 authority/transaction/recovery 模块，以及 Main-facing Platform ports  
> 依赖：[系统架构总览](../../10-architecture/system-overview.md)、[运行时启动系统](../../10-architecture/runtime-bootstrap-system.md)、[Runtime Control Profile v1](../../15-contracts/runtime-control-profile-v1.md)、[Frame / Call v1](../../15-contracts/frame-call-protocol-v1.md)、[Renderer Control v1](../../15-contracts/main-renderer-control-v1.md)、[Renderer Data Profile v1](../../15-contracts/renderer-data-profile-v1.md)  
> 最近复核：2026-08-19

Main 是 Session / Runtime / Frame / Activation / InputTarget / DataAuthority application authority，但不直接等于 Process/Worker/WebSocket/MessagePort realization。

---

## 1. Internal Modules

```text
Main System
├── Game Package Bootstrap
├── Descriptor Registry {key,module}
├── Launch Attempt Registry
├── Runtime Registry / Supervisor Coordinator
├── Runtime Control Registry / Dispatcher integration
├── Frame / Activation Registry
├── Stack Mutation Coordinator
├── Frame Deadline / Failure Classifier
├── Runtime Failure Unwind Coordinator
├── Renderer Control Publisher
├── DataAuthority Registry
└── Platform Port Coordination
```

Core不 import Hostra/child_process/Worker/WebSocket/MessagePort/filesystem implementation。

---

## 2. Main-facing Platform Ports

```text
RuntimeHosting
    create/supervise Host-owned Runner Runtime

RuntimeControlHost
    establish current Launch Attempt Control carrier

RendererHosting
    realize current Renderer participant

RendererControlHost
    establish Renderer Control carrier

DataConnectionBroker
    realize current DataAuthority on Renderer + Subsystem sides

ContentServiceIntegration
    expose platform Content implementation
```

Port只提供 physical capability/facts；Main仍拥有 application authority。

---

## 3. Game Package / Runner Bootstrap

Descriptor：

```ts
{ key, module }
```

Main：

```text
validate complete descriptors
→ create Launch Attempt/token
→ ask RuntimeHosting to launch Runner for module
→ accept Control carrier
→ hello/identified/ready
```

Platform决定 Node Runner / Worker Runner；Main不把 `module` 当 process API。

```text
launch != connected != identified != ready
ready != Data current
```

---

## 4. Runtime Control

```text
Control v1 + Frame v1 = Runtime Control Profile v1
```

Main-side integration保持：

```text
one Control carrier reader/dispatcher
shared sender Request ID namespace
one UTF-8 JSON text per JSON-RPC message
no Batch
```

Control loss/ambiguity进入 Runtime failure，无 same-attempt reconnect。

---

## 5. Frame / Activation Registry

保证：

```text
frameId never reused
subsystemKey permanent
caller immutable
only active Frame has current Activation
Activation never reused
outcome/lifecycle separate
```

Main唯一签发/revoke Activation。

---

## 6. Stack Mutation Coordinator

normal transaction和 failure recovery共享 serial authority。

```text
Initial
initialize ACK → activate fresh A ACK → publish target

Call
accept/revoke/suspend/push/null target
→ call Response
→ child initialize/activate
→ ACK → publish child target

Return
accept outcome/revoke/closing/null target
→ return Response
→ close/pop
→ fresh resume Caller ACK
→ publish caller target
```

Response-before-dependent-RPC；ACK-before-publication。

---

## 7. Failure Classifier / Unwind

```text
Success        → known commit
Explicit Error → protocol-defined known no-commit/fatal
Timeout/loss   → ambiguous
```

ambiguous/divergence/protocol failure → Runtime failed；no retry/replay。

Unwind：

```text
failedRuntimeKeys
→ lowest live failed-runtime occurrence
→ whole suffix doomed
→ cleanup Top→Bottom
→ fixed-point expansion
→ preserve accepted outcome
→ fresh healthy Caller resume or empty Stack
```

Platform Supervisor不能选择 unwind root。

---

## 8. Renderer Control Publisher

只发布 committed：

```text
Runtime projection
Frame Stack / Activation
InputTarget
DataAuthority {subsystemKey,generation,dataProfile}
```

不携：

```text
Data endpoint/ticket/Port
Platform provisioning handle
Interest Registry
Render State
Content Grant
```

---

## 9. DataAuthority Registry

```ts
interface DataAuthority {
  subsystemKey: string;
  generation: number;
  dataProfile: string;
}
```

当前 Profile：

```text
loomrealm.renderer-data/1
```

Main负责：

```text
mint/increment generation
select dataProfile
replace/revoke authority
publish through Renderer Control
```

Profile改变 MUST fresh generation。

---

## 10. DataConnectionBroker Coordination

```text
Main current DataAuthority(S,G,P)
→ Platform DataConnectionBroker
→ matching RendererDataBinding side
→ matching SubsystemDataBinding side
```

Broker不拥有 G/P。

Hostra可通过 Runner provisioning IPC给已运行 Subsystem提供 endpoint/ticket；PWA可 transfer MessagePort。

这些 physical mechanisms不进入 Main authority model。

```text
DataAuthority exists != carrier current
Data loss/provision failure != Runtime failure/Frame unwind
```

---

## 11. Input / Render Boundary

Main只拥有：

```text
Frame / Activation / InputTarget
DataAuthority
```

不拥有：

```text
Interest[F]
Input Producer
Render Domain State
```

Renderer ordinary input gate = Main authority × Frame Interest × Producer × current Data。

Render Domain lifecycle由 Subsystem控制。

---

## 12. Platform Realizations

```text
Hostra Desktop
    RuntimeHosting        Node Runner Process
    RuntimeControlHost    WebSocket
    RendererHosting       BrowserWindow
    RendererControlHost   WebSocket
    DataConnectionBroker Data WS + Runner provisioning IPC

PWA
    RuntimeHosting        Worker Runner
    RuntimeControlHost    MessagePort
    RendererHosting       Window
    RendererControlHost   MessagePort
    DataConnectionBroker MessageChannel / Port transfer
```

Main-facing logical ports相同。

---

## 13. Tests

至少：

```text
Descriptor {key,module} bootstrap
fake RuntimeHosting/Runner
Control Profile fixtures
Frame Main-role conformance
failure unwind golden traces
Renderer Control snapshot/dataProfile
profile-change-fresh-generation
fake DataConnectionBroker does not mint authority
data provisioning/loss does not mutate Runtime/Frame authority
Hostra/PWA abstract-trace equivalence
```

---

## 14. Final Invariants

1. Main core platform-neutral；
2. Platform ports不获得 Main authority；
3. Game Package module与 physical Runner分离；
4. Runtime Control = Control1 + Frame1；
5. ready不携 Data；
6. Frame/Stack mutation serial；
7. Response-before-dependent-RPC / ACK-before-publication；
8. ambiguous Runtime-fatal/no retry；
9. failure unwind Main-only；
10. DataAuthority = S/G/dataProfile；
11. profile change需要 fresh generation；
12. Broker/provisioning只实现 physical carrier，不拥有 authority；
13. Data loss/provision failure不等于 Runtime/Frame failure；
14. Main不拥有 Interest/Render Domain。