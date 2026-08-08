# PWA 宿主模块设计

> 层级：模块设计  
> 状态：Active Design  
> 稳定程度：Experimental  
> 主要定义：Window、Main Runtime Worker、Subsystem Worker、MessagePort、Service Worker 和 OPFS 的平台适配  
> 依赖：[运行承载系统](../../10-architecture/runtime-hosting-system.md)、[通信系统](../../10-architecture/communication-system.md)、[Subsystem Control v2 Draft](../../15-contracts/subsystem-control-protocol-v2.md)、[Frame / Call Protocol v1](../../15-contracts/frame-call-protocol-v1.md)、[Renderer Control v1 Draft](../../15-contracts/main-renderer-control-v1.md)  
> 最近复核：2026-08-08

## 1. Authority / Topology

Window只拥有浏览器 UI/gesture能力和 Web Renderer，不拥有 Frame Stack、Activation、failure unwind、Subsystem business state或 Render authority。

Main Runtime Worker对应 Desktop Main，拥有：

```text
Session
Runtime Registry
Frame Registry/Stack
transaction/error/failure-unwind coordinator
Activation/InputTarget
Renderer Control authority
Data Connection authority
```

每个 declared Subsystem一个 Dedicated Worker；一个 Worker可承载：

```text
0..N Frame/Input Context
0..N Render Context
one Main Control Port
at most one Renderer Data Connection generation
```

## 2. PWA Bootstrap Boundary

Descriptor→Worker script、Bootstrap Credential transfer、Control MessagePort establishment仍是独立待冻结 PWA Host Profile。

PWA后续 Runtime lifecycle目标使用：

```text
Subsystem Control v2
```

而不是把 Subsystem Control v1 的 Desktop `ready.rendererDataEndpoint` 扩展成 MessagePort字段。

这是 protocol-version boundary；Subsystem Control v1保持 Frozen。

## 3. Subsystem Control v2 Mapping

authenticated Control Port建立后：

```text
connect/port establish
→ subsystem.hello
→ identified
→ optional initializing
→ ready
```

`ready` 只表示 Runtime readiness，不携带 Data Port/endpoint。

```text
one postMessage payload
=
one JSON-RPC application message object
```

Port bootstrap方式属于 Host Profile；建立后 lifecycle semantics必须与其他 Subsystem Control v2 transport profile一致。

## 4. Frame / Call v1 Mapping

Frame / Call v1 application semantics保持 Frozen，不因 Control版本升级而变化。

```text
Main → Subsystem
    initialize / activate / suspend / resume / close
Subsystem → Main
    call / return
```

one `postMessage` plain JSON-compatible object = one Frame JSON-RPC application message。

Structured Clone不得扩大 Frame value model。

禁止依赖：

```text
undefined
BigInt
ArrayBuffer / TypedArray
MessagePort
Blob / File
Date / Map / Set
Host object
```

## 5. Frame Limits / Deadline

保持 Frame v1：

```text
message <=1 MiB reference compact equivalent
JSON depth <=64
business JsonValue <=512 KiB
frameId / activationId <=128 UTF-8 bytes
targetSubsystemKey <=256 UTF-8 bytes
Request ID positive safe integer / sender Connection lifetime never reused
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

显式 administrative `frame.suspend` 按 Frozen clarification处理：v1无 generic reactivation；普通 child-call suspension仍只通过 child outcome `frame.resume` 恢复。

## 7. Runtime Failure Recovery

failure unwind只在 Main Worker：

```text
failedRuntimeKeys
→ lowest failed-runtime Frame
→ whole suffix
→ Top→Bottom cleanup
→ fixed-point expansion
→ accepted outcome preserve
→ fresh final Caller resume or Stack empty
```

Window、Subsystem Worker wrapper、MessagePort adapter、Data Connection均不得自行改变 root/Stack/Activation。

Late Frame Response不能恢复 failed Runtime。

## 8. Renderer Control v1

Window/Web Renderer通过 Main-owned Renderer Control Port获得：

```text
full authority Snapshot
monotonic revision
Runtime projection
Frame Stack
Activation/InputTarget
DataAuthority generation
```

Renderer Control不携带 Data MessagePort 或 bearer Data credential。

Control loss时 Window MUST：

```text
stop ordinary input
invalidate InputTarget
invalidate DataAuthority
close Renderer⇄Subsystem Data Connections
```

随后重新建立 Renderer Control并取得 current full Snapshot。

## 9. Renderer ⇄ Subsystem Data

PWA Data Connection目标使用独立 MessagePort-based Connection Profile。

Main发布逻辑：

```text
subsystemKey + generation + connectionProfile
```

Host/Profile负责把 matching Data Port bootstrap material交给双方。

Data Port transfer/bootstrap不进入 Renderer Control Snapshot，也不进入 Subsystem Control `ready`。

建立后的 Connection identity/lifecycle必须与 Desktop Profile保持相同抽象语义。

## 10. User Input

普通输入只根据 Main current InputTarget：

```text
Frame exists
active
activationId current
matching Data generation connected
```

Renderer Control revision从旧 target直接跳到新 target时，也必须终止旧 Activation的持续输入意图；不依赖一定看到中间 null Snapshot。

旧 input不得 replay到新 Activation。

## 11. Render

Render由 Subsystem拥有，可以 zero Frame存在。

```text
Frame close/unwind != Render destroy
Data Connection close != Render destroy
Renderer Control reconnect != Frame recovery
```

Data reconnect后的 Render Store恢复由 Render Update/State protocol独立完成。

## 12. Content

PWA Content API：

```text
same-origin Fetch
Service Worker
OPFS / Cache Storage
```

Content API与 Control/Data plane分离。

Service Worker不得承担 Frame Stack、Runtime Tick、Renderer Control或input authority。

## 13. Cross-platform Conformance

Frame v1继续要求 Desktop WebSocket / PWA MessagePort 对同一 abstract Frame trace得到相同：

```text
Frame authority
outcome
Activation
failure-unwind result
```

Subsystem Control v2与未来 Data Connection v1也应各自建立 Desktop/PWA abstract trace conformance；不同平台允许不同 bootstrap carrier，但不允许不同 application authority semantics。

## 14. Core Invariants

- one Subsystem=one Dedicated Worker in Phase 1；
- PWA Runtime lifecycle方向使用 Subsystem Control v2；
- Control v2 ready不携Data endpoint/Port；
- Frame / Call v1保持 Frozen；
- Structured Clone不能扩大 Frame类型；
- ACK-before-publication；
- no Frame retry/replay；
- fixed-point unwind只在 Main Worker；
- Renderer Control只复制逻辑 authority；
- Data Port bootstrap属于独立 Profile；
- Control loss撤销 Input/Data authority；
- Frame lifecycle不控制 Render/Data lifecycle。