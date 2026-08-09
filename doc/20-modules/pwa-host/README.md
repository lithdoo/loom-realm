# PWA 宿主模块设计

> 层级：模块设计  
> 状态：Active Design  
> 稳定程度：Experimental  
> 主要定义：Window、Main Runtime Worker、Subsystem Worker、MessagePort、Service Worker 和 OPFS 的平台适配  
> 依赖：[运行承载系统](../../10-architecture/runtime-hosting-system.md)、[通信系统](../../10-architecture/communication-system.md)、[Subsystem Control v1](../../15-contracts/subsystem-control-protocol-v1.md)、[Runtime Control Profile v1](../../15-contracts/runtime-control-profile-v1.md)、[Frame / Call Protocol v1](../../15-contracts/frame-call-protocol-v1.md)、[Renderer Control v1](../../15-contracts/main-renderer-control-v1.md)  
> 最近复核：2026-08-09

## 1. Authority / Topology

Window只拥有浏览器 UI/gesture能力和 Web Renderer，不拥有 Frame Stack、Activation、failure unwind、Subsystem business state或 Render authority。

Main Runtime Worker拥有：

```text
Session
Runtime Registry
Frame Registry/Stack
transaction/error/failure-unwind coordinator
Activation/InputTarget
Renderer Control authority
DataAuthority
```

每个 declared Subsystem一个 Dedicated Worker；一个 Worker可承载：

```text
0..N Frame/Input Context
0..N Render Domains
one Main Control Port
```

Renderer对每个 Subsystem至多一条 current Data Connection。

## 2. PWA Bootstrap Boundary

Descriptor→Worker script、Bootstrap Credential transfer、Control MessagePort establishment属于独立 PWA Host Profile。

Runtime lifecycle：

```text
Subsystem Control v1
```

Runtime Control组合：

```text
Runtime Control Application Profile v1
=
Subsystem Control v1
+
Frame / Call v1
```

## 3. Subsystem Control v1 Mapping

authenticated Control Port建立后：

```text
port establish
→ subsystem.hello(protocolVersions includes 1)
→ identified
→ optional initializing
→ subsystem.status({state:"ready"})
```

`ready`只表示 Runtime readiness，不携 Data Port/endpoint，也不表示 Renderer Data Connection存在。

```text
one postMessage payload
=
one JSON-RPC application message object
```

Profile禁止 JSON-RPC Batch。

## 4. Frame / Call v1 Mapping

```text
Main → Subsystem
    initialize / activate / suspend / resume / close
Subsystem → Main
    call / return
```

one `postMessage` plain JSON-compatible object = one Frame JSON-RPC application message。

Structured Clone不得扩大 Frame value model，禁止依赖：

```text
undefined
BigInt
ArrayBuffer / TypedArray
MessagePort
Blob / File
Date / Map / Set
Host object
```

## 5. Shared Request ID / Limits

Control v1与 Frame v1共享 Control Port时，同一 sender使用 connection-lifetime one-shot Request ID namespace。

```text
positive safe integer ID
message <=1 MiB
JSON depth <=64
```

Frame额外：

```text
business JsonValue <=512 KiB
frameId / activationId <=128 UTF-8 bytes
targetSubsystemKey <=256 UTF-8 bytes
Frame deadlines 1,000..300,000ms sender-local monotonic
```

PWA adapter不 retry/replay Frame operation。

## 6. Normal Frame Ordering

必须保持：

```text
frame.call Response before dependent Child initialize/activate
frame.return Response before dependent close/resume
ordinary call has no reverse frame.suspend dependency
activate/resume ACK before InputTarget publication
```

same-Subsystem recursion共享同一 Control Port时不能要求 nested reverse-request handler。

administrative `frame.suspend`按 Frozen clarification处理：v1无 generic reactivation。

## 7. Runtime Failure Recovery

failure unwind只在 Main Worker：

```text
failedRuntimeKeys
→ lowest failed-runtime Frame
→ whole suffix
→ Top→Bottom cleanup
→ fixed-point expansion
→ accepted outcome preserved
→ fresh final Caller resume or Stack empty
```

Window、Subsystem Worker wrapper、MessagePort adapter、Data Connection均不得自行改变 root/Stack/Activation。

## 8. Renderer Control v1

Window/Web Renderer通过 Main-owned Renderer Control获得：

```text
full authority Snapshot
Runtime projection
Frame Stack / Activation / InputTarget
DataAuthority { subsystemKey, generation, connectionProfile }
```

Renderer Control不携 Data MessagePort、endpoint或 bearer Data credential。

Control loss：

```text
stop ordinary input
invalidate InputTarget
invalidate DataAuthority
retire/close Renderer⇄Subsystem Data Connections
→ reconnect Renderer Control
→ obtain current full Snapshot
```

## 9. Renderer ⇄ Subsystem Data

PWA Host建立 MessagePort carrier：

```text
Main publishes DataAuthority(S,G)
→ Host creates/transfers matching Data carrier
→ bind carrier to Session/current Renderer/S/G
→ install at most one current connection
```

Data Port bootstrap不进入 Renderer Control Snapshot，也不进入 Subsystem Control `ready`。

同 generation仍授权时，旧 carrier retired后 MAY建立 fresh carrier。

```text
Data loss != Runtime failure
Data loss != Frame unwind
```

## 10. User Input

ordinary input authority：

```text
current Data Connection
∩ Main current InputTarget/Activation
∩ current Input Interest
∩ Producer availability
```

Renderer Control target变化终止旧 Activation普通输入；旧 input不得 replay到 fresh Activation。

fresh Data Connection从 empty Interest开始，State重新 baseline，Event不重放。

## 11. Render

Render由 Subsystem拥有，可以 zero Frame存在。

```text
Frame close/unwind != Render destroy
Data Connection close != Render destroy
Renderer Control reconnect != Frame recovery
```

当前 Render Update closure candidate：

```text
Registry
Snapshot(revision)
Patch(R→R+1)
Event
```

fresh Data carrier通过 Registry + fresh Snapshots恢复，不从 cached baseline继续 Patch。

## 12. Content

PWA Content API：

```text
same-origin Fetch
Service Worker
OPFS / Cache Storage
```

Content API与 Control/Data plane分离。Service Worker不得承担 Frame Stack、Runtime Tick、Renderer Control或input authority。

## 13. Cross-platform Conformance

Desktop WebSocket / PWA MessagePort对相同 abstract trace必须保持：

```text
Control v1 lifecycle
Frame v1 authority/outcome/unwind
Renderer Control authority
Data Connection identity/lifecycle
User Input recovery
Render recovery
```

平台允许不同 bootstrap carrier，不允许不同 application authority semantics。

## 14. Core Invariants

- one Subsystem=one Dedicated Worker in Phase 1；
- Runtime Control=Control v1 + Frame v1；
- Control ready不携 Data endpoint/Port；
- Structured Clone不能扩大协议 JSON类型；
- ACK-before-publication；
- no Frame retry/replay；
- fixed-point unwind只在 Main Worker；
- Renderer Control只复制逻辑 authority；
- Data Port bootstrap属于 Host Profile；
- Control loss撤销 Input/Data authority；
- Data loss不等于 Runtime/Frame failure；
- Frame lifecycle不控制 Render/Data lifecycle。
