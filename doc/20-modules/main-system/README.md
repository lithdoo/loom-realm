# 程序主系统模块设计

> 层级：模块设计  
> 状态：Active Design  
> 稳定程度：Experimental  
> 主要定义：Main 内部 authority/transaction/recovery 模块，以及 plan-bound Main-facing Platform ports  
> 依赖：[系统架构总览](../../10-architecture/system-overview.md)、[运行时启动系统](../../10-architecture/runtime-bootstrap-system.md)、[Runtime Control Profile v1](../../15-contracts/runtime-control-profile-v1.md)、[Frame / Call v1](../../15-contracts/frame-call-protocol-v1.md)、[Renderer Control v1](../../15-contracts/main-renderer-control-v1.md)、[Renderer Data Profile v1](../../15-contracts/renderer-data-profile-v1.md)  
> 最近复核：2026-08-20

Main 是 Session / Runtime / Frame / Activation / InputTarget / DataAuthority application authority，但不拥有 Platform executable binding，也不直接等于 Process/Worker/WebSocket/MessagePort realization。

---

## 1. Internal Modules

```text
Main System
├── Game Logical Topology Bootstrap
├── Subsystem Registry {key}
├── Initial Target/Input
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

Core不 import：

```text
@loomrealm/game-launcher-hostra/pwa
Hostra
child_process / Worker
WebSocket / MessagePort
filesystem/module resolver
raw Platform Launch Manifest
```

---

## 2. Main-facing Platform Ports

```text
RuntimeHosting
    launch/supervise Host-owned Runner Runtime by logical subsystemKey

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

`RuntimeHosting`在 Platform composition中已经绑定 immutable PlatformLaunchPlan；Main不需要 module resolver API。

---

## 3. Game Package / Platform Launch Boundary

Game Package：

```ts
{ key }
```

并提供 `initial {subsystem,input}`。

Current Platform在 Main开始 physical Runtime bootstrap前已经完成：

```text
Platform Launch Manifest
→ exact Game key-set join
→ all required executable resolution
→ hosting/security capability preflight
→ immutable PlatformLaunchPlan
```

Main：

```text
install complete logical key registry
→ create Launch Attempt/token
→ ask RuntimeHosting.launch(key)
→ accept Control carrier
→ hello/identified/ready
```

Main MUST NOT把 module/path/URL/Node/Worker options放进 Launch Attempt application model。

```text
launch != module loaded != connected != identified != ready
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

Executable module或 Runtime physical handle不参与 Frame identity。

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

Platform physical launch/material不能绕过这些 causal barriers。

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

Platform Supervisor只能报告 physical facts，不能选择 unwind root。

---

## 8. Runtime Hosting / Supervisor Facts

RuntimeHosting可以报告：

```text
container create success/failure
alive/exited
exit code/signal/reason
termination request/result
```

Main解释这些 facts为 public Runtime lifecycle。

`stopped`只来自 actual termination observation；unexpected exit即使 code 0也可成为 Runtime failure。

No automatic restart；新 Runtime必须 fresh Launch Attempt。

---

## 9. Renderer Control Publisher

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
PlatformLaunchPlan/module/path/URL
Interest Registry
Render State
Content Grant
```

---

## 10. DataAuthority Registry

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

## 11. DataConnectionBroker Coordination

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

## 12. Input / Render Boundary

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

## 13. Platform Realizations

```text
Hostra Desktop
    RuntimeHosting        HostraLaunchPlan → Node Runner Process
    RuntimeControlHost    WebSocket
    RendererHosting       BrowserWindow
    RendererControlHost   WebSocket
    DataConnectionBroker  Data WS + Runner provisioning IPC

PWA
    RuntimeHosting        PwaLaunchPlan → Worker Runner
    RuntimeControlHost    MessagePort
    RendererHosting       Window
    RendererControlHost   MessagePort
    DataConnectionBroker  MessageChannel / Port transfer
```

Main-facing logical ports相同；Platform module artifact可以不同。

---

## 14. Tests

至少：

```text
Game logical Descriptor {key} bootstrap
initial target/input
fake RuntimeHosting bound to immutable plan
Main launch request contains key but no module/path/url
undeclared key cannot launch
physical launch facts do not mutate authority without Main decision
Control Profile fixtures
Frame Main-role conformance
failure unwind golden traces
Renderer Control snapshot/dataProfile
profile-change-fresh-generation
fake DataConnectionBroker does not mint authority
data provisioning/loss does not mutate Runtime/Frame authority
Hostra/PWA platform-specific bindings produce equivalent abstract trace
```

---

## 15. Final Invariants

1. Main core platform-neutral；
2. Main只拥有 Game logical key registry，不拥有 executable binding；
3. Platform ports不获得 Main authority；
4. RuntimeHosting封闭绑定 PlatformLaunchPlan，Main launch只使用 key；
5. Game/Platform preflight在 Main physical Runtime bootstrap前闭合；
6. Runtime Control = Control1 + Frame1；
7. ready不携 Data或 executable material；
8. Frame/Stack mutation serial；
9. Response-before-dependent-RPC / ACK-before-publication；
10. ambiguous Runtime-fatal/no retry；
11. failure unwind Main-only；
12. stopped只来自 actual physical termination；
13. DataAuthority = S/G/dataProfile；
14. profile change需要 fresh generation；
15. Broker/provisioning只实现 physical carrier，不拥有 authority；
16. Data loss/provision failure不等于 Runtime/Frame failure；
17. Main不拥有 Interest/Render Domain；
18. Hostra/PWA module/path/Runner差异不进入 Main state。
