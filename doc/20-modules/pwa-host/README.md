# PWA 宿主模块设计

> 层级：模块设计  
> 状态：Active Design  
> 稳定程度：Experimental  
> 主要定义：Window、Main Runtime Worker、Subsystem Worker、MessagePort、Service Worker 和 OPFS 的平台适配  
> 依赖：[运行承载系统](../../10-architecture/runtime-hosting-system.md)、[通信系统](../../10-architecture/communication-system.md)、[Frame / Call Protocol v1](../../15-contracts/frame-call-protocol-v1.md)、[Frame / Call v1 Conformance Profile](../../15-contracts/frame-call-conformance-v1.md)  
> 最近复核：2026-08-05

## 1. Authority / Topology

Window只拥有浏览器 UI/gesture能力和 Web Renderer，不拥有 Frame Stack、Activation、failure unwind、Subsystem business state或 Render authority。

Main Runtime Worker对应 Desktop Main：Session、Runtime Registry、Frame Registry/Stack、transaction/error/failure-unwind coordinator、Protocol Validator、Activation/InputTarget、Data Connection Authority。

每 declared Subsystem一个 Dedicated Worker；一个 Worker可承载 0..N Frame/Input Context + 0..N Render Context。

## 2. PWA Bootstrap Boundary

Descriptor→Worker script、Bootstrap Credential transfer、Control MessagePort establishment仍是独立待冻结 PWA Profile。

这不阻塞 Frame / Call v1 application mapping：一旦 authenticated Control MessagePort建立，Frame v1 JSON/limits/deadline/transaction/failure semantics已经 Frozen。

## 3. Control MessagePort Mapping

```text
Subsystem Control v1       Frozen
Frame / Call Protocol v1   Active / Normative / Frozen
```

Frame exact seven methods原样映射；MessagePort envelope/Port identity不进入 Frame schema。

Frozen mapping：

```text
one postMessage payload
=
one JSON-RPC application message object
```

Payload MUST是 plain JSON-compatible object。Frame / Call message MUST NOT依赖 transfer list/Transferable。

## 4. Structured Clone Boundary

Structured Clone technically支持更多类型，但 Frame v1禁止使用：

```text
undefined
BigInt
ArrayBuffer / TypedArray
MessagePort
Blob / File
Date / Map / Set
DOM/Host object
```

发送/接收都必须经过与 Desktop 相同的 Frame JSON validator。

Message/payload limit用 Reference Compact JSON UTF-8 equivalent计算，而不是浏览器内部 clone byte size。

## 5. Frozen Limits

```text
message <= 1 MiB
JSON depth <= 64
business JsonValue <= 512 KiB
JsonValue string <= 256 KiB UTF-8
frameId / activationId <= 128 UTF-8 bytes
targetSubsystemKey <= 256 UTF-8 bytes
```

PWA adapter不得因为 MessagePort能力更强而放宽这些限制。

## 6. Request ID

同一 sender在 Control Port生命周期内 outbound JSON-RPC ID：positive safe integer `1..2^53-1`，never reused。

Main Worker SHOULD跨 Subsystem Control + Frame / Call使用 connection-wide allocator；Subsystem Worker有独立 sender namespace。两个方向可同时使用同一数值。

## 7. Normal Ordering

MessagePort adapter保持：call Response-before-Child initialize/activate、return Response-before-close/resume、ordinary call no reverse-suspend、activate/resume ACK-before-InputTarget publication。

same-Subsystem recursive call共享同一 Control Port时不能要求 nested reverse-request handler。

## 8. Mutation Gate / Deadline

outbound call/return pending停止新 ordinary input并 block second call/return。

```text
Success             → local commit
Recoverable Error   → release gate
Fatal Error/timeout → Runtime failure
```

每个 endpoint为自己发送的 Frame Request使用 connection-stable sender-local deadline profile；每项 `1,000..300,000ms`，monotonic clock。

MessagePort不得被解释成 operation replay；PWA adapter不 retry、不定义 operationId/idempotency journal。Late Response不能恢复 failed Runtime。

## 9. Batch E Main-worker-only Recovery

Failure unwind算法只在 Main Worker：

```text
failedRuntimeKeys
→ lowest failed-runtime Frame
→ whole suffix
→ Top→Bottom cleanup
→ expand failed set/root when cleanup fails
→ final Caller resume or Stack empty
```

Window、Subsystem Worker wrapper、MessagePort adapter不得自行修改 Stack/root或增加 recovery RPC。

## 10. Failed Worker / Healthy Worker Cleanup

Subsystem Worker terminal failed后，Main不依赖新的 Frame RPC ACK清理其 Frame；Main logical retire。

健康 descendant Worker只接收 doomed Frame的 best-effort `frame.close`；不要求额外 suspend-before-close。close timeout/divergence会让该 Worker Runtime也 failed并可能扩展 root。

## 11. Outcome / Recovery Resume

已 Return Acceptance的 outcome不能被 Worker crash覆盖。root没有 accepted outcome时 Main生成 `failed(SUBSYSTEM_RUNTIME_FAILED)`。

只向 final root下方 direct healthy Caller发送 fresh resume；resume ACK后 Main Worker才向 Window发布新 InputTarget。Resume failure继续扩大 failed set。

## 12. Window Input / Control State

Window必须接受 recovery期间 `InputTarget=null`、Stack suffix连续缩短、zero active Frame。不得恢复 cached old Activation或根据 Worker/Data Port状态自行重建 Frame authority。

## 13. Version Binding

Frame / Call v1没有独立 `frame.hello/version/capabilities`。

`subsystem.hello.protocolVersions`继续只协商 Subsystem Control。PWA未来 Bootstrap/Control Profile若声明 Frame v1，必须静态绑定完整 Frame / Call v1角色，而不是定义自己的 partial/downgraded Frame版本。

## 14. Cross-platform Conformance

PWA adapter必须通过 [Frame / Call v1 Conformance Profile](../../15-contracts/frame-call-conformance-v1.md) 中 MessagePort + cross-transport fixtures。

同一 abstract trace在 Desktop WebSocket与PWA MessagePort上必须得到相同 Frame authority/outcome/Activation/failure-unwind结果。

PWA Bootstrap Profile未完成不等于 Frame application protocol未冻结；它只决定 Port如何安全建立。

## 15. Page / Data / Render Lifecycle

页面隐藏/恢复不等于 Frame cancellation或 Runtime failure recovery。Data Port reconnect不能撤销 Frame unwind。

Render由 Subsystem控制，可 zero Frame存在；Frame close/unwind不自动 destroy Render。

## 16. Cancellation

v1无 caller-driven `frame.cancel`。`FrameOutcome.cancelled`只由 active Frame自行 return。页面关闭/Session termination使用更高层 lifecycle。

## 17. Core Invariants

- one Subsystem=one Dedicated Worker；
- Frame / Call v1 application semantics Frozen；
- one postMessage plain JSON object=one RPC；
- no Transferable/non-JSON Frame payload；
- exact shared limits / Request ID / deadline profile；
- no reverse-suspend/nested-handler requirement；
- ACK-before-publication；
- no application retry/replay；
- fixed-point unwind只在 Main Worker；
- accepted outcome preserved / fresh final resume；
- no Frame handshake/downgrade；
- PWA bootstrap与 Frame application protocol分层；
- Frame lifecycle不控制 Render/Data Port。
