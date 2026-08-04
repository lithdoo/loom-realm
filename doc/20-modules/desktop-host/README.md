# Hostra 桌面宿主模块设计

> 层级：模块设计  
> 状态：Active Design  
> 稳定程度：Experimental  
> 主要定义：Hostra 窗口宿主、Desktop Runtime 拓扑、WebSocket/HTTP 适配和安全边界  
> 依赖：[运行时启动与连接建立系统](../../10-architecture/runtime-bootstrap-system.md)、[Frame / Call Protocol v1](../../15-contracts/frame-call-protocol-v1.md)、[运行承载系统](../../10-architecture/runtime-hosting-system.md)  
> 最近复核：2026-08-04

## 1. Hostra 边界

Hostra 是独立 Electron Shell，只负责 BrowserWindow / desktop lifecycle。它不承载 LoomRealm Main，不启动 Subsystem，不解释 Frame recovery，也不代理 Renderer⇄Subsystem 数据。

Desktop LoomRealm：Control/System Data 使用 localhost WebSocket；Content 使用 localhost HTTP。

## 2. Desktop Topology

```text
LoomRealm Main Process
├── Runtime Supervisor
├── Frame Stack / Transaction Coordinator
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

同一已认证 WebSocket复用：

```text
Subsystem Control v1        Frozen
Frame / Call Batch A-E      Frozen
Frame / Call Batch F        Next
```

Batch B exact methods原样映射；WebSocket envelope/connection ID/ping-pong不进入 Frame application schema。

## 4. Normal Ordering / Publication

Desktop adapter MUST preserve：

```text
call acceptance → call Response → Child initialize/activate
return acceptance → return Response → close/resume
activate/resume ACK → InputTarget publication
```

ordinary call无 reverse suspend；same-Subsystem call不要求 nested reverse-request handler。

## 5. Deadline / Retry Boundary

每个 Frame Request finite deadline。

```text
Success        → known commit
Explicit Error → known no-commit
Timeout/loss   → ambiguous → Runtime failure
```

WebSocket/TCP底层可靠传输不等于 application Frame replay。Desktop adapter不得在 timeout后重发同一 operation，不实现 operationId/idempotency journal。Late Response不恢复 failure。

## 6. Batch E Main-only Recovery

`RuntimeFailureUnwindCoordinator` 位于 LoomRealm Main，不位于 Hostra、WebSocket adapter 或 Subsystem Process wrapper。

Transport层不得：

```text
自行选择 unwind root
只关闭 failed subsystem 的最近 Frame
为 recovery 重发 close/resume
新增 frame.abort/frame.unwind
根据 Process PID决定 Frame suffix
```

Main按 `descriptor.key` failed set + lowest live occurrence计算 whole suffix。

## 7. Failed / Healthy Runtime Cleanup

failed Process对应 Frame不再依赖 Frame RPC ACK；Main logical retire，Supervisor处理 Process termination/existence。

healthy descendant Process只收到针对 doomed Frame的 best-effort `frame.close`；不要求额外 suspend-before-close。close timeout/divergence会使该整个 Process Runtime failed，并可能让 Main把 root向更低 Stack层扩展。

## 8. Outcome / Resume

已 accepted Frame outcome即使 Process随后 exit也保持不变。root无 outcome时 Main使用 `SUBSYSTEM_RUNTIME_FAILED`。

只对最终 direct healthy surviving Caller发送 fresh `frame.resume`；ACK后才发布新 InputTarget。Resume failure会使 Caller Process也进入 failed set。

## 9. Launcher / Supervisor

Desktop v1 `launcher.type=nodejs`：validated target、Host-selected Node、`shell=false`、固定 cwd、Token-before-spawn、explicit child env、no automatic restart。

Runtime terminal failure后的 Process cleanup由 Supervisor负责，不通过 Frame close模拟 Runtime termination。

## 10. Renderer Data WebSocket

每 Runtime与 Renderer最多一条长期 Data WebSocket：Connection / Render Update / User Input。Data reconnect不得用于修复 Frame timeout/divergence，也不能撤销 Batch E unwind。

## 11. Renderer Reload / Input

Renderer只恢复 Main current committed Runtime/Stack/Activation/InputTarget；failure recovery期间可长期 `InputTarget=null`。不得 revive old Activation或从本地缓存重建已 logical-retire Frame。

## 12. Cancellation / Render

v1无 caller-driven `frame.cancel`。`cancelled`只由 active Frame自行 return。Frame unwind不隐式 destroy Render/Data Connection。

## 13. Core Invariants

- Hostra不承载 Main；
- one Subsystem=one Process；
- Frame A-E application semantics不因 WebSocket改变；
- finite deadline/no application retry；
- failure unwind root/fixed-point只在 Main；
- failed Runtime Frame可无 Frame RPC ACK retire；
- healthy descendant best-effort close；
- accepted outcome preserved / fresh final resume；
- no recovery abort-unwind/replay wire；
- Frame lifecycle不控制 Data WebSocket/Render。
