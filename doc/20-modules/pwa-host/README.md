# PWA 宿主模块设计

> 层级：模块设计  
> 状态：Active Design  
> 稳定程度：Experimental  
> 主要定义：Window、Main Runtime Worker、Subsystem Worker、MessagePort、Service Worker 和 OPFS 的平台适配  
> 依赖：[运行承载系统](../../10-architecture/runtime-hosting-system.md)、[通信系统](../../10-architecture/communication-system.md)、[Frame / Call Protocol v1](../../15-contracts/frame-call-protocol-v1.md)  
> 最近复核：2026-08-04

## 1. Authority / Topology

Window只拥有浏览器 UI/gesture 能力和 Web Renderer，不拥有 Frame Stack、Activation、failure unwind、Subsystem business state或 Render authority。

Main Runtime Worker对应 Desktop Main：Session、Runtime Registry、Frame Registry/Stack、transaction/error/failure-unwind coordinator、Activation/InputTarget、Data Connection Authority。

每 declared Subsystem 一个 Dedicated Worker；一个 Worker可承载 0..N Frame/Input Context + 0..N Render Context。

## 2. PWA Bootstrap Boundary

Descriptor→Worker script、Bootstrap Credential transfer、Control MessagePort bootstrap尚未最终冻结。

Future PWA Profile MUST preserve Subsystem Control v1与 Frame Batch A-E application semantics。

## 3. Control MessagePort Mapping

```text
Subsystem Control v1       Frozen
Frame / Call Batch A-E     Frozen
Frame / Call Batch F       Next
```

Batch B exact methods原样映射；MessagePort envelope/transfer list/Port identity不进入 Frame schema。

## 4. Normal Ordering

MessagePort adapter保持：call Response-before-Child initialize/activate、return Response-before-close/resume、ordinary call no reverse-suspend、activate/resume ACK-before-InputTarget publication。

same-Subsystem recursive call共享同一 Control Port时也不能要求 nested reverse-request handler。

## 5. Mutation Gate / Deadline

outbound call/return pending停止新 ordinary input + block second call/return。

```text
Success        → local commit
Recoverable Error → release gate
Fatal Error / timeout/loss → Runtime failure
```

全部 Frame Request finite deadline。MessagePort不得被解释成 application operation replay；PWA adapter不自动 retry、不定义 operationId/idempotency journal。Late Response不能恢复 failed Runtime。

## 6. Batch E Main-worker-only Recovery

Failure unwind root/fixed-point算法只在 Main Worker：

```text
failedRuntimeKeys
→ lowest failed-runtime Frame
→ whole suffix
→ Top→Bottom cleanup
→ expand failed set/root when cleanup fails
→ final Caller resume or Stack empty
```

Window、Subsystem Worker wrapper、MessagePort adapter都不得自行修改 Stack/root或增加 recovery RPC。

## 7. Failed Worker / Healthy Worker Cleanup

Subsystem Worker terminal failed后，Main不依赖新的 Frame RPC ACK清理其 Frame；Main logical retire，Worker lifecycle由 PWA Runtime/Supervisor-equivalent authority处理。

健康 descendant Worker只接收 doomed Frame的 best-effort `frame.close`；不要求额外 suspend-before-close。close timeout/divergence会让该 Worker Runtime也 failed，并可能把 root向下扩展。

## 8. Outcome / Recovery Resume

已 Return Acceptance 的 outcome不能被 Worker crash覆盖。root没有 accepted outcome时 Main生成 `failed(SUBSYSTEM_RUNTIME_FAILED)`。

只向 final root下方 direct healthy Caller发送 fresh resume；resume ACK后 Main Worker才向 Window发布新 InputTarget。Resume failure继续扩大 failed set。

## 9. Window Input / Control State

Window必须接受 recovery期间：

```text
InputTarget=null
Stack suffix连续缩短
zero active Frame
```

Window不得恢复 cached old Activation或根据 Worker/Data Port状态自行重建 Frame authority。

## 10. Page / Data / Render Lifecycle

页面隐藏/恢复不等于 Frame cancellation或 Runtime failure recovery。Data Port reconnect不能撤销 Batch E unwind。

Render由 Subsystem控制，可 zero Frame存在；Frame close/unwind不自动 destroy Render。

## 11. Cancellation

v1无 caller-driven `frame.cancel`。`FrameOutcome.cancelled`只由 active Frame自行 return。页面关闭/Session termination使用更高层 lifecycle。

## 12. Core Invariants

- one Subsystem=one Dedicated Worker；
- Frame A-E semantics preserved；
- exactly seven Frame RPC；
- no reverse-suspend/nested-handler requirement；
- ACK-before-publication；
- finite deadline/no application retry；
- fixed-point unwind只在 Main Worker；
- failed Worker Frame logical retire，无 Frame ACK依赖；
- healthy descendant best-effort close；
- accepted outcome preserved / fresh final resume；
- no recovery abort-unwind/replay wire；
- Frame lifecycle不控制 Render/Data Port。
