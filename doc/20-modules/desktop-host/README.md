# Hostra 桌面宿主模块设计

> 层级：模块设计  
> 状态：Active Design  
> 稳定程度：Experimental  
> 主要定义：Hostra 窗口宿主、Desktop Runtime 拓扑、WebSocket/HTTP 适配和安全边界  
> 依赖：[运行时启动与连接建立系统](../../10-architecture/runtime-bootstrap-system.md)、[Frame / Call Protocol v1](../../15-contracts/frame-call-protocol-v1.md)、[Frame / Call v1 Conformance Profile](../../15-contracts/frame-call-conformance-v1.md)  
> 最近复核：2026-08-05

## 1. Hostra 边界

Hostra 是独立 Electron Shell，只负责 BrowserWindow / desktop lifecycle。它不承载 LoomRealm Main，不启动 Subsystem，不解释 Frame recovery，也不代理 Renderer⇄Subsystem 数据。

Desktop LoomRealm：Control/System Data 使用 localhost WebSocket；Content 使用 localhost HTTP。

## 2. Desktop Topology

```text
LoomRealm Main Process
├── Runtime Supervisor
├── Frame Stack / Transaction Coordinator
├── Frame Protocol Validator / Request ID Allocator
├── Frame Deadline / Failure Classifier
├── Runtime Failure Unwind Coordinator
├── Activation / InputTarget
└── Data Connection Authority

per-Subsystem Process
├── Main Control WebSocket
├── Renderer Data WebSocket
├── 0..N Frame/Input Context
└── 0..N Render Context
```

进程隔离粒度=Subsystem，不是 Frame。

## 3. Control WebSocket

同一已认证 Control WebSocket复用：

```text
Subsystem Control v1        Frozen
Frame / Call Protocol v1    Active / Normative / Frozen
```

Frame v1 exactly seven methods原样映射；WebSocket envelope/connection ID/ping-pong不进入 Frame application schema。

## 4. Desktop Frame Message Mapping

Frozen mapping：

```text
one complete WebSocket text message
=
one JSON-RPC Request or Response
```

Frame / Call v1 不使用 WebSocket binary message，也不使用 JSON-RPC Batch。

底层 WebSocket fragmentation不改变 application message边界。

Adapter MUST保持 per-direction发送顺序，不得 batch/coalesce/duplicate/retry/replay Frame operation。

## 5. JSON / Limit Validation

Desktop adapter与PWA使用同一 Frame validator：plain JSON-only、valid Unicode、finite number/safe integer、closed schema。

```text
message <= 1 MiB
JSON depth <= 64
business JsonValue <= 512 KiB
JsonValue string <= 256 KiB UTF-8
frameId / activationId <= 128 UTF-8 bytes
targetSubsystemKey <= 256 UTF-8 bytes
```

WebSocket text按 compact JSON UTF-8实际 bytes判断；outbound message在发送前 preflight。

## 6. Request ID

承载 Frame v1 的 Control WebSocket上，同一发送方 outbound JSON-RPC ID必须：

```text
positive safe integer 1..2^53-1
Connection lifetime never reused
```

Main SHOULD为 Subsystem Control + Frame / Call使用 connection-wide allocator；Subsystem独立维护自身 outbound namespace。Request ID不是 operationId。

## 7. Normal Ordering / Publication

Desktop adapter MUST preserve：

```text
call acceptance → call Response → Child initialize/activate
return acceptance → return Response → close/resume
activate/resume ACK → InputTarget publication
```

ordinary call无 reverse suspend；same-Subsystem call不要求 nested reverse-request handler。

## 8. Deadline / Retry Boundary

每个 endpoint为自己发送的 Frame Request使用 connection-stable sender-local deadline profile；每项 `1,000..300,000ms`，使用 monotonic clock。

```text
Success        → known commit
Explicit Error → known no-commit
Timeout/loss   → ambiguous → Runtime failure
```

WebSocket/TCP可靠传输不等于 application Frame replay。Adapter不得在 timeout后重发 operation、不实现 idempotency journal。Late Response不恢复 failure。

## 9. Runtime Failure Recovery

`RuntimeFailureUnwindCoordinator`只位于 LoomRealm Main，不位于 Hostra、WebSocket adapter 或 Process wrapper。

```text
failedRuntimeKeys
→ lowest failed-runtime Frame
→ whole suffix Top→Bottom
→ failed logical retire / healthy close
→ cleanup failure expands root
→ accepted outcome or SUBSYSTEM_RUNTIME_FAILED
→ fresh final Caller resume or empty Stack
```

Transport不得自行选择 root、为 recovery重发 close/resume、根据 PID决定 suffix、或新增 abort/unwind RPC。

## 10. Failed / Healthy Runtime Cleanup

failed Process对应 Frame不依赖 Frame RPC ACK；Main logical retire，Supervisor处理 Process existence/termination。

healthy descendant Process只收到 doomed Frame的 best-effort `frame.close`；不额外要求 suspend-before-close。close timeout/divergence使该 Runtime也 failed并可能扩大 root。

## 11. Launcher / Supervisor

Desktop v1 `launcher.type=nodejs`：validated target、Host-selected Node、`shell=false`、固定 cwd、Token-before-spawn、explicit child env、no automatic restart。

Runtime terminal failure后的 Process cleanup由 Supervisor负责，不通过 Frame close模拟 Runtime termination。

## 12. Renderer Data WebSocket

每 Runtime与 Renderer最多一条长期 Data WebSocket：Connection / Render Update / User Input。Data reconnect不得用于修复 Frame timeout/divergence，也不能撤销 failure unwind。

## 13. Version Binding

Desktop Runtime deployment profile静态绑定 Subsystem Control v1 + Frame / Call v1。

`subsystem.hello.protocolVersions`仍只协商 Subsystem Control；Desktop Frame v1不等待/发送 `frame.hello/version/capabilities`。

Runtime在该 profile下进入 ready表示完整实现其 Frame v1角色；部分 Frame method support不属于 conformant Desktop profile。

## 14. Conformance

Desktop Control adapter必须通过 [Frame / Call v1 Conformance Profile](../../15-contracts/frame-call-conformance-v1.md) 的 Desktop WebSocket + cross-transport适用 fixtures。

协议冻结不等于这些 executable tests已经通过；实现阶段必须实际运行后才能声明 `Frame / Call v1 Transport Adapter Conformant`。

## 15. Cancellation / Render

v1无 caller-driven `frame.cancel`。`cancelled`只由 active Frame自行 return。Frame unwind不隐式 destroy Render/Data Connection。

## 16. Core Invariants

- Hostra不承载 Main；
- one Subsystem=one Process；
- Frame / Call v1 application semantics Frozen；
- WebSocket text message一一对应 JSON-RPC application message；
- no JSON-RPC Batch / binary Frame carrier / application retry；
- shared JSON/ID/limit/deadline profile；
- failure unwind root/fixed-point只在 Main；
- failed Runtime Frame可无 Frame RPC ACK retire；
- accepted outcome preserved / fresh final resume；
- Frame lifecycle不控制 Data WebSocket/Render。
