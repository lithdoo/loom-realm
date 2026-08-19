# 程序主系统模块设计

> 层级：模块设计  
> 状态：Active Design  
> 稳定程度：Experimental  
> 主要定义：LoomRealm Main 内部 authority/transaction/recovery 模块，以及 Main-facing Platform ports  
> 依赖：[系统架构总览](../../10-architecture/system-overview.md)、[平台组合系统](../../10-architecture/platform-composition-system.md)、[运行时启动与连接建立系统](../../10-architecture/runtime-bootstrap-system.md)、[Runtime Control Profile v1](../../15-contracts/runtime-control-profile-v1.md)、[Frame / Call Protocol v1](../../15-contracts/frame-call-protocol-v1.md)  
> 最近复核：2026-08-19

Main 是 Session / Runtime / Frame / Activation / InputTarget / DataAuthority 的 application authority，但不直接等于某个平台的 Process/Worker/WebSocket 实现。

## 1. 建议模块

```text
Main System
├── Game Package Bootstrap
├── Subsystem Descriptor Registry
├── Launch Attempt Registry
├── Runtime Container Registry
├── Runtime Supervisor Coordinator
├── Control Connection Registry
├── Control Request ID Allocator
├── Frame Registry / Activation Registry
├── Frame Stack / Mutation Coordinator
├── Frame Protocol Validator
├── Frame RPC Deadline / Failure Classifier
├── Runtime Failure Unwind Coordinator
├── Renderer Control Publisher
├── DataAuthority Registry
└── Platform Port Adapters
```

Main 的纯 application logic 不直接 import `child_process`、`Worker`、`WebSocket`、`MessagePort`、Hostra API 或 filesystem/HTTP implementation。

---

## 2. Main-facing Platform Ports

Main 需要 Platform Composition 提供以下逻辑能力：

```text
RuntimeHosting
    launch physical Runtime Container
    observe termination
    bounded cleanup/force termination

RuntimeControlHost
    provide/accept Control carrier binding for Launch Attempt

RendererHosting
    realize current Renderer participant

RendererControlHost
    establish Renderer Control carrier

DataConnectionBroker
    establish physical Renderer⇄Subsystem carrier for current DataAuthority

ContentServiceIntegration
    expose current platform Content implementation
```

这些名称是模块边界，不要求一项对应一个 public npm package。

Platform port 只提供物理事实/连接；Main 仍拥有 application authority。

---

## 3. Runtime Bootstrap / Control

Main 的逻辑 bootstrap：

```text
validate Game Package / descriptors
→ create Launch Attempt + bootstrap auth state
→ ask RuntimeHosting to launch
→ Runtime Control carrier established
→ subsystem.hello
→ identified
→ subsystem.status(ready)
```

```text
physical launch success != connected != identified != ready
ready != Data Connection exists
```

`ready` 不携 Renderer Data endpoint。

Runtime Control：

```text
Subsystem Control v1
+
Frame / Call v1
=
Runtime Control Application Profile v1
```

Hostra Desktop 可用 Node process + WebSocket；PWA 可用 Worker + MessagePort，但 Main protocol logic 相同。

---

## 4. Frame / Activation Registry

Frame Registry 保证：

```text
frameId never reused
subsystemKey permanent
caller immutable
only active Frame has current Activation
outcome/lifecycle separate
```

Main 是 Activation 唯一签发方。每次 activate/resume 使用 fresh Activation；离开 active 即 revoke；revoked never valid again。

---

## 5. Shared Control Dispatcher

Runtime Control Profile v1 允许同一 authenticated carrier 承载：

```text
Subsystem Control v1
Frame / Call v1
```

要求：

```text
one transport unit = one JSON-RPC message
no JSON-RPC Batch
hello success before Frame operation
shared sender-side Request ID namespace
```

Transport/Platform 不得改变这些规则。

---

## 6. Stack Mutation Coordinator

normal transaction 与 Runtime failure recovery 共用单一 serial coordinator。

```text
Initial
initialize ACK → activate(fresh A) ACK → publish

Call
Call Acceptance Commit
→ call Success
→ Child initialize/activate
→ activate ACK → publish

Return
Return Acceptance Commit
→ return Success
→ close ACK/pop
→ resume Caller(fresh Activation) ACK → publish
```

Response-before-dependent-RPC；ACK-before-publication。

---

## 7. Deadline / Runtime Failure

```text
Success        → known commit
Explicit Error → known no-commit
Timeout/loss   → ambiguous
```

ambiguous/divergence/protocol failure 进入 Runtime failure；no retry/replay；late response 不恢复 terminal failure。

Runtime Failure Unwind：

```text
failedRuntimeKeys
→ lowest live failed-runtime Frame
→ whole suffix doomed
→ cleanup Top→Bottom
→ fixed-point expansion
→ accepted outcome preserved
→ fresh final Caller resume or empty Stack
```

Platform Supervisor 只能报告实际 Runtime termination，不能选择 unwind root 或修改 Stack。

---

## 8. Renderer Control Publisher

Publisher 只发布 Main 已 commit state：

```text
Runtime projection
Frame Stack
Activation
InputTarget
DataAuthority
```

Snapshot 不携：

```text
Data endpoint / ticket / MessagePort
Render State
Content Grant
```

Renderer Control carrier 由 Platform RendererControlHost 建立；authority 内容由 Main 决定。

---

## 9. DataAuthority / Data Connection Broker

```text
DataAuthority {
  subsystemKey,
  generation,
  connectionProfile
}
```

Main 负责 generation replacement/revocation。

实际 carrier：

```text
Main current DataAuthority(S,G)
→ Platform DataConnectionBroker
→ Renderer + Subsystem matching endpoints
```

Broker 不拥有 generation，也不能从 endpoint/Port 推导 authority。

```text
Runtime ready != DataAuthority necessarily present
DataAuthority present != carrier established
Data loss != Runtime failure / Frame unwind
```

---

## 10. Input / Render Boundary

Main 不代理 ordinary User Input / Render Update，也不拥有 Render Domain State。

Main 只拥有：

```text
Frame / Activation / InputTarget
DataAuthority
```

Input Interest 是 Subsystem-owned Frame-scoped configuration；Renderer Core执行 sender-side conjunction gate。

Render Domain lifecycle 完全由 Subsystem 控制。

---

## 11. Hostra Desktop / PWA

```text
Hostra Desktop
    RuntimeHosting        Node child process
    RuntimeControlHost    localhost WebSocket
    RendererHosting       Hostra/Electron BrowserWindow
    RendererControlHost   localhost WebSocket
    DataConnectionBroker authenticated localhost carrier

PWA
    RuntimeHosting        Dedicated Worker
    RuntimeControlHost    MessagePort
    RendererHosting       browser Window
    RendererControlHost   MessagePort
    DataConnectionBroker MessageChannel / transferred Port
```

Main-facing ports 相同，physical implementation 不同。

---

## 12. Conformance

Main 至少需要：

- Subsystem Control v1 fixtures；
- Runtime Control Profile v1 integration fixtures；
- Frame / Call v1 Main-role fixtures；
- Renderer Control / Data Connection applicable fixtures；
- Platform port fake/in-memory integration；
- Hostra/PWA semantic-equivalence E2E。

---

## 13. 核心不变量

- Main application core platform-neutral；
- Platform port 不获得 Main authority；
- Runtime Control = Control v1 + Frame v1；
- ready 不携 Data endpoint；
- Frame / Call v1 exact seven Requests；
- Stack mutation serial；
- Response-before-dependent-RPC；ACK-before-publication；
- revoked Activation 永久失效；accepted outcome 不可撤销；
- ambiguous/divergence/protocol error Runtime-fatal/no retry；
- Runtime failure lowest-root whole-suffix fixed-point unwind；
- DataAuthority 与 physical carrier/bootstrap 分离；
- Data Connection Broker 不拥有 generation；
- Data loss不等于 Runtime/Frame failure；
- Main 不拥有 Render Domain lifecycle/state。
