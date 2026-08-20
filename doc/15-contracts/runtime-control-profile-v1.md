# Main ⇄ Subsystem Runtime Control Application Profile v1

> 层级：正式契约 / Application Profile  
> 状态：Active / Normative  
> Profile 版本：1  
> 稳定程度：Stabilizing  
> 主要定义：同一 Main ⇄ Subsystem Control Connection 上 Subsystem Control v1 与 Frame / Call v1 的组合、版本绑定、共享 dispatcher、Request ID namespace 与 JSON-text carrier mapping  
> 依赖：[Subsystem Control v1](./subsystem-control-protocol-v1.md)、[Frame / Call v1](./frame-call-protocol-v1.md)  
> 最近复核：2026-08-19

本文不新增 Runtime/Frame method。

核心原则：

> **Runtime lifecycle 使用 Subsystem Control v1；Frame transaction 使用 Frame / Call v1。共享同一 Control Connection 不意味着共享状态机；Data / Render / User Input 不进入本 Profile。**

---

## 1. Composition

```text
Runtime Control Application Profile v1
├── Subsystem Control Protocol v1
└── Frame / Call Protocol v1
```

固定版本：

```text
Subsystem Control = 1
Frame / Call      = 1
```

Profile自身不是新的 wire handshake。

---

## 2. Profile Selection

Profile由 Runtime deployment/implementation静态选择，不由 Game business params、Frame RPC或 Renderer动态协商。

不存在：

```text
runtime.profile.hello
frame.hello
frame.version
frame.capabilities
```

`subsystem.hello.protocolVersions` 只协商 Subsystem Control。

当前 conformant Runtime MUST支持 Control 1；Main选择 Control 1 后 Frame / Call 1由本 Profile静态绑定。

---

## 3. Bootstrap / Ready

```text
obtain current Control carrier
→ subsystem.hello
→ identified
→ optional initializing
→ ready
```

hello成功前不得执行 Frame / Call。

`subsystem.status({state:"ready"})` 表示 Runtime required initialization完成，并能完整承担 Frame / Call v1 Subsystem role。

`ready` MUST NOT表示：

```text
Renderer Data Connection exists
Data endpoint/Port/ticket known
DataAuthority granted
Renderer connected
Frame/Render/InputTarget exists
Content capability distributed
```

---

## 4. Shared Control Connection

同一 authenticated Control Connection承载：

```text
Subsystem Control
    subsystem.hello
    subsystem.status
    subsystem.shutdown

Frame / Call
    frame.initialize
    frame.activate
    frame.suspend
    frame.resume
    frame.close
    frame.call
    frame.return
```

Frame method只在 hello成功且 connection已绑定 descriptor.key 后合法。

---

## 5. Application Unit / Encoding

固定：

```text
one carrier application unit
= one UTF-8 JSON text string
= exactly one JSON-RPC message object
```

JSON-RPC Batch Array禁止。

Desktop WebSocket：

```text
one complete WebSocket text message = one JSON text unit
```

PWA MessagePort：

```text
postMessage(string) = one JSON text unit
```

Structured Clone / Transferable只用于 Platform bootstrap，不能扩大 Runtime Control payload model。

---

## 6. One Connection-wide Dispatcher

Control + Frame MUST由同一个 connection-wide dispatcher消费唯一 inbound stream：

```text
MessageCarrier
        ↓
RuntimeControlDispatcher
     ┌──┴──┐
 Control Frame
```

不得让两个独立 parser/reader竞争同一 carrier。

---

## 7. Shared Sender-side Request ID Namespace

同一 sender / same Control Connection：

```text
positive safe integer 1..2^53-1
Control + Frame requests shared namespace
never reused during connection lifetime
never wrap
```

Subsystem sender：

```text
subsystem.hello
frame.call
frame.return
```

Main sender：

```text
subsystem.shutdown
frame.initialize/activate/suspend/resume/close
```

`subsystem.status` 是 Notification。

Main/Subsystem 两方向 namespace独立。

---

## 8. JSON / Message Limits

共同入口至少：

```text
max application message <= 1 MiB
max JSON nesting depth  <= 64
plain JSON-compatible values only
closed schema
```

Frame message继续满足 Frozen Frame v1 business/identity/deadline limits；Control message满足 Control v1 token/version/error limits。

所有平台都按实际 UTF-8 JSON text bytes计算 message size，不存在 PWA structured-object替代算法。

---

## 9. Deadlines Remain Domain-specific

共享 Connection不意味着共享 timeout policy。

```text
Control connect/hello/ready/shutdown/termination
    Control/Platform policy

Frame seven Requests
    Frozen Frame v1 sender-local monotonic deadline profile
```

不得用 Frame deadline替代 shutdown deadline，也不得把 shutdown escalation套到普通 Frame request。

---

## 10. Failure Boundary

Control/Frame failure都可能使同一 Runtime terminal failed，但规则由各自 protocol定义。

Frame：

```text
Success             → known committed
Explicit Error       → protocol-defined known no-commit/fatal
Timeout/carrier loss → ambiguous
```

ambiguous/divergence/protocol error进入 Runtime failure；no retry/replay/same-attempt reconnect。

Stack recovery继续由 Main按 Frozen Frame v1 fixed-point unwind执行。

---

## 11. Data Plane Independence

本 Profile MUST NOT增加/承载：

```text
Data endpoint discovery
dataProfile selection
Data ticket/credential
Data Connection handshake
User Input
Render Update
Content Grant
```

Data authority由 Renderer Control发布；实际 carrier由 Platform Data Connection Broker建立；Data application stack由 Renderer Data Application Profile定义。

```text
Runtime ready != Data Connection ready
Frame active   != Data Connection required
```

---

## 12. Platform Binding

Platform Composition可以采用：

```text
Hostra Desktop → localhost WebSocket
PWA            → MessagePort
```

Platform负责安全建立 carrier并交付 Launch Attempt bootstrap material；建立后必须遵守完全相同的 Control/Frame application semantics。

这些是 Platform Binding/Realization，不是新的 Host application protocol。

---

## 13. Version Evolution

Profile v1固定：

```text
Control 1 + Frame 1
```

未来不同组合必须使用明确的新 Runtime Control Profile identity/version；不得静默改变本 Profile。

---

## 14. Conformance

至少：

```text
hello-first-message
control-version-selection-1
hello-before-frame-operation
hello-versions-control-only
ready-has-no-data-endpoint
ready-requires-complete-frame-role
shared-sender-id-namespace-across-control-frame
single-control-dispatcher
no-jsonrpc-batch
websocket-json-text
messageport-json-text
frame-failure-enters-runtime-failed-path
shutdown-deadline-distinct-from-frame-deadline
no-data-method-in-runtime-control-profile
hostra-pwa-equivalent-control-frame-trace
```

---

## 15. Final Invariants

1. Runtime Control Profile v1 = Control v1 + Frame / Call v1；
2. Profile不新增 wire handshake/method/field；
3. `subsystem.hello.protocolVersions`只协商 Control；
4. Frame version由 Profile静态绑定；
5. hello前无 Frame operation；
6. ready不携 Data endpoint并要求完整 Frame role；
7. one connection-wide dispatcher；
8. same sender Control+Frame Request共享 one-shot ID namespace；
9. one application unit = one UTF-8 JSON text JSON-RPC object；
10. JSON-RPC Batch禁止；
11. Control/Frame保持各自 error/deadline semantics；
12. Data/User Input/Render/Content不进入 Profile；
13. Hostra/PWA physical binding不同但 application semantics相同。
