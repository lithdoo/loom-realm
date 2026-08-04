# PWA 宿主模块设计

> 层级：模块设计  
> 状态：Active Design  
> 稳定程度：Experimental  
> 主要定义：Window、Main Runtime Worker、Subsystem Worker、MessagePort、Service Worker 和 OPFS 的平台适配  
> 依赖：[运行承载系统](../../10-architecture/runtime-hosting-system.md)、[通信系统](../../10-architecture/communication-system.md)、[Subsystem Control Protocol v1](../../15-contracts/subsystem-control-lifecycle-protocol.md)、[Frame / Call Protocol v1](../../15-contracts/frame-call-protocol-v1.md)、[Content API v1](../../15-contracts/content-api-v1.md)  
> 最近复核：2026-08-04

## 1. Authority / Topology

Window 只拥有浏览器 UI/gesture 能力和 Web Renderer，不拥有 Frame Stack、Activation authority、Subsystem business state 或 Render authority。

Main Runtime Worker 对应 Desktop Main：Session、Runtime Registry、Frame Registry/Stack/transaction+failure coordinator、Activation/InputTarget、Data Connection Authority。

每个 declared Subsystem 一个 Dedicated Worker；一个 Worker 可承载 0..N Frame/Input Context、0..N Render Context 和一个 Renderer Data MessagePort。

## 2. PWA Bootstrap Boundary

PWA Descriptor→Worker script、Bootstrap Credential transfer、Control MessagePort bootstrap 尚未冻结。

已经固定：eager create all required Workers、one Main Control Port per Subsystem、one Renderer Data Port per Subsystem、one Runtime Container per Subsystem。

future PWA Profile MUST preserve Subsystem Control v1 与 Frame Batch A/B/C/D exact application semantics。

## 3. Control MessagePort Mapping

```text
Subsystem Control v1        Frozen
Frame / Call Batch A/B/C/D   Frozen
Frame / Call Batch E/F       Draft
```

Batch B exact methods必须原样映射；MessagePort envelope/transfer list/Port identity 不进入 Frame application Schema。

## 4. Transaction Ordering

MessagePort adapter保持 call Response-before-Child initialize/activate、return Response-before-close/resume、ordinary call no reverse-suspend、activate/resume ACK-before-InputTarget publication。

same-Subsystem recursive call 即使共享同一 MessagePort 也不能要求 nested reverse-request handler reentrancy。

## 5. Worker Mutation Gate

outbound call/return pending：stop new ordinary input dispatch + block second call/return。

Success分别本地 commit suspended/closing；recoverable Explicit Error release gate；timeout/Response-loss不释放 gate回旧 Activation，而进入 Runtime failure。

## 6. Batch D Deadline / No Retry

所有 Frame Request MUST 有 finite deadline。具体 timeout 数值由未来 PWA Profile/Host policy 选择。

```text
Success        → known committed
Explicit Error → known not committed
Timeout/loss   → ambiguous → Runtime failure
```

MessagePort 的排队/交付特性不得被解释成 application Frame operation replay。PWA adapter 不自动 retry、不定义 operationId/idempotencyKey/dedup journal。

如果 Worker 侧 `frame.call/return` timeout 且 Control Port仍可用，Worker SHOULD `subsystem.status(failed)`；Port已丢失则 Main按 Control loss处理。迟到 Response不能恢复 Runtime。

## 7. Error Classification

Recoverable：`FRAME_CALL_TARGET_NOT_FOUND / FRAME_CALL_TARGET_UNAVAILABLE / FRAME_INITIALIZE_REJECTED`。

Divergence：`FRAME_NOT_FOUND / FRAME_STATE_MISMATCH / ACTIVATION_MISMATCH / FRAME_STACK_MISMATCH / FRAME_OWNERSHIP_MISMATCH`。

Divergence、Frozen JSON-RPC/schema protocol error、ambiguous timeout Runtime-fatal；诊断至少为 `FRAME_CONTROL_TIMEOUT / FRAME_CONTROL_DIVERGENCE / FRAME_CONTROL_PROTOCOL_ERROR`。

## 8. InputTarget / Frame Context

Main Worker→Window必须 obey activate/resume ACK-before-publication；`InputTarget=null` gap合法；Window不得沿用 old target或恢复 cached Activation。

ordinary input要求 Frame active/current Activation/current Main InputTarget/无 mutation gate。

## 9. Frame RPC Semantics

`frame.resume` 一次完成 outcome+replacement Activation；`frame.call` success只表示 logical call accepted；`frame.return` success只表示 outcome accepted+closing begun；`frame.suspend`仅 Main主动 quiesce/terminal preparation。

合法 initialize 业务 rejection使用 `FRAME_INITIALIZE_REJECTED`；合法 activate/suspend/resume/close 的 state mismatch是 divergence。

## 10. Cancellation

v1 无 caller-driven `frame.cancel`。`FrameOutcome.cancelled` 只由 active Frame自行 return。页面隐藏/Session termination不等同 Frame cancellation。

## 11. System Data / Render / Page Lifecycle

Window 与每 Worker 最多一条 Data Port，Connection/Render/User Input域独立。Render由 Subsystem控制，可 zero Frame存在。

页面恢复只恢复 Main current committed state；不得 revive revoked Activation、未 commit transaction 或已 failed Frame Control状态。

## 12. Worker Failure

Worker unexpected termination、Frame Control timeout/divergence/protocol error都进入 Runtime failure。Frame lifecycle不设为 failed；Batch E负责 deterministic multi-Frame unwind。

## 13. Core Invariants

- one Subsystem = one Dedicated Worker；
- Frame A/B/C/D semantics preserved；
- exactly seven Frame RPC methods；
- no reverse-suspend dependency / nested-handler requirement；
- ACK-before-publication；
- finite deadline / no application retry / ambiguous failure；
- no caller-driven cancel；
- Frame lifecycle不控制 Render/Data Port；
- PWA Transport differences do not redefine application protocol。
