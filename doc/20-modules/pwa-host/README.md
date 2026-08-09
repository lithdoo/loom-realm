# PWA 宿主模块设计

> 层级：模块设计  
> 状态：Active Design  
> 稳定程度：Experimental  
> 主要定义：Window、Main Worker、Subsystem Worker、MessagePort、Service Worker、OPFS 的平台实现  
> 依赖：[运行承载系统](../../10-architecture/runtime-hosting-system.md)、[Subsystem Control v1](../../15-contracts/subsystem-control-protocol-v1.md)、[Runtime Control Profile v1](../../15-contracts/runtime-control-profile-v1.md)、[Frame / Call v1](../../15-contracts/frame-call-protocol-v1.md)、[Renderer Control v1](../../15-contracts/main-renderer-control-v1.md)、[Data Connection v1](../../15-contracts/renderer-subsystem-data-connection-v1.md)  
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

每个 declared Subsystem一个 Dedicated Worker；一个 Worker可承载 `0..N` Frame/Input Context、`0..N` Render Domains、一个 Main Control carrier。

Renderer对每个 Subsystem至多一条 current Data Connection。

## 2. PWA Host Bootstrap

Descriptor→Worker script解析、bootstrap credential传递、Control MessagePort创建/转移是 **PWA Host implementation**，不是独立 LoomRealm application Profile。

Host 必须保证 Control carrier建立时已绑定预期 Runtime/Session bootstrap context；建立后 application semantics直接使用：

```text
Subsystem Control v1
+
Frame / Call v1
=
Runtime Control Application Profile v1
```

具体 Worker constructor options、MessageChannel创建顺序、Port transfer API、内部 bootstrap object结构可以调整，只要不改变上述协议行为与安全边界。

## 3. Subsystem Control Mapping

authenticated Control Port建立后：

```text
port established by Host
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

Runtime Control Application Profile禁止 JSON-RPC Batch。

## 4. Frame / Call Mapping

```text
Main → Subsystem
    initialize / activate / suspend / resume / close
Subsystem → Main
    call / return
```

one `postMessage` plain JSON-compatible object = one Frame JSON-RPC application message。

Structured Clone不得扩大 Frame value model，禁止依赖非 JSON capability/value。

Control v1与 Frame v1共享 sender-side connection-lifetime Request ID namespace；Frame deadlines保持 sender-local monotonic `1000..300000ms`，adapter不 retry/replay。

必须保持：

```text
frame.call Response before dependent Child initialize/activate
frame.return Response before dependent close/resume
ordinary call has no reverse frame.suspend
activate/resume ACK before InputTarget publication
```

Administrative `frame.suspend` 直接遵守 Frame v1主契约：无 generic reactivation；child-call suspended只通过对应 Child outcome + fresh resume恢复。

## 5. Runtime Failure

failure unwind只在 Main Worker：

```text
failedRuntimeKeys
→ lowest failed-runtime occurrence
→ whole suffix
→ Top→Bottom cleanup
→ fixed-point expansion
→ accepted outcome preserved
→ fresh final Caller resume or Stack empty
```

Window、Worker wrapper、MessagePort adapter、Data Connection不得自行修改 root/Stack/Activation。

## 6. Renderer Control

Window/Web Renderer从 Main获得：

```text
full Authority Snapshot
Runtime projection
Frame Stack / Activation / InputTarget
DataAuthority {subsystemKey, generation, connectionProfile}
```

Renderer Control不携 Data MessagePort、endpoint或 bearer Data credential。

Control loss：

```text
stop ordinary input
invalidate InputTarget/DataAuthority
retire old Renderer⇄Subsystem Data Connections
→ reconnect Renderer Control
→ current full Snapshot
```

Renderer Control bootstrap token/Port如何由 PWA Host交付也是 Host implementation，不额外定义 bootstrap Profile。

## 7. Renderer ⇄ Subsystem Data

PWA Host建立 actual Data MessagePort：

```text
Main publishes DataAuthority(S,G)
→ Host creates MessageChannel/Port
→ securely binds carrier to Session/current Renderer/S/G
→ transfers endpoints to participants
→ installs at most one current Data Connection
```

Port bootstrap不进入 Renderer Control Snapshot，也不进入 Subsystem `ready`。

同 generation仍授权时，旧 carrier retired后 MAY建立 fresh carrier。

```text
Data loss != Runtime failure
Data loss != Frame unwind
```

Host Port creation/transfer schema不是 Data Connection wire surface；只需满足 Data Connection identity/cardinality/retirement requirements。

## 8. User Input

```text
current Data Connection
∩ Main current InputTarget/Activation
∩ current Input Interest
∩ Producer availability
```

fresh Data Connection从 empty Interest开始；State重新 baseline；Event不 replay。

标准 keyboard/pointer/gamepad canonical payload由 User Input v1定义；浏览器 DOM/Gamepad API如何变换到 canonical payload由 Web Renderer implementation负责。

## 9. Render

Render由 Subsystem拥有，可以 zero Frame存在。

```text
Frame close/unwind != Render destroy
Data Connection retire != Render destroy
Renderer Control reconnect != Frame recovery
```

Render Update：

```text
Registry
Snapshot(revision)
Patch(R→R+1)
Event
```

fresh Data carrier以 Registry + fresh Snapshots恢复，不以 cache继续 Patch。

`tag`只作为 opaque string传输；presentation mapping由 Renderer实现。

## 10. Content

```text
same-origin Fetch
Service Worker
OPFS / Cache Storage
```

PWA使用 same-origin authority，不需要复制 Desktop bearer distribution机制，也不存在 Content Access Profile。

Service Worker不得承担 Frame Stack、Runtime Tick、Renderer Control或 Input authority。

Range如果实现，直接遵守标准 HTTP Range；deployment limits属于 implementation configuration。

## 11. Cross-platform Semantic Equivalence

Desktop/PWA 对相同 abstract trace必须保持：

```text
Control Runtime lifecycle
Frame authority/outcome/unwind
Renderer Control authority
Data Connection current/retired identity
User Input canonical semantics/recovery
Render authoritative recovery
Content logical API semantics
```

允许平台在 Worker/Port/WebSocket/token/ticket创建方式上不同。

## 12. Core Invariants

- Phase 1 one Subsystem = one Dedicated Worker；
- Runtime Control = Control v1 + Frame v1；
- Control ready不携 Data endpoint/Port；
- Structured Clone不能扩大协议 JSON value model；
- no Frame retry/replay；
- fixed-point unwind只在 Main Worker；
- Renderer Control只复制 logical authority；
- Control/Data Port bootstrap都是 PWA Host implementation，不形成独立 application Profile；
- Control loss撤销 Input/Data authority；
- Data loss不等于 Runtime/Frame failure；
- Frame lifecycle不控制 Render/Data lifecycle。
