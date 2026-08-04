# PWA 宿主模块设计

> 层级：模块设计  
> 状态：Active Design  
> 稳定程度：Experimental  
> 主要定义：Window、Main Runtime Worker、Subsystem Worker、MessagePort、Service Worker 和 OPFS 的平台适配  
> 依赖：[运行承载系统](../../10-architecture/runtime-hosting-system.md)、[通信系统](../../10-architecture/communication-system.md)、[Subsystem Control Protocol v1](../../15-contracts/subsystem-control-lifecycle-protocol.md)、[Frame / Call Protocol v1](../../15-contracts/frame-call-protocol-v1.md)、[Content API v1](../../15-contracts/content-api-v1.md)  
> 最近复核：2026-08-04

## 1. Authority / Topology

Window 只拥有浏览器 UI/gesture 能力和 Web Renderer，不拥有 Frame Stack、Activation authority、Subsystem business state 或 Render authority。

Main Runtime Worker 是 Desktop Main 的 PWA 对应物：Session、Runtime Registry、Frame Registry/Stack/transaction coordinator、Activation/InputTarget、Data Connection Authority。

每个 declared Subsystem 一个 Dedicated Worker；一个 Worker 可承载 0..N Frame/Input Context、0..N Render Context 和一个 Renderer Data MessagePort。

## 2. PWA Bootstrap Boundary

PWA Descriptor→Worker script、Bootstrap Credential transfer、Control MessagePort bootstrap 尚未冻结。

已经固定：eager create all required Workers、one Main Control Port per Subsystem、one Renderer Data Port per Subsystem、one Runtime Container per Subsystem。

future PWA Profile MUST preserve Subsystem Control v1 与 Frame Batch A/B/C exact application semantics。

## 3. Control MessagePort Mapping

```text
Subsystem Control v1      Frozen
Frame / Call Batch A/B/C   Frozen
Frame / Call Batch D-F     Draft
```

Batch B exact methods必须原样映射，MessagePort envelope/transfer list/Port identity 不进入 Frame application Schema。

PWA adapter MUST NOT 增加 caller/close reason/system method/optional completed.value 等变体。

## 4. Batch C Ordering

MessagePort adapter 必须保持：

```text
frame.call Request
→ Main acceptance commit
→ frame.call Response
→ dependent Child initialize / activate
```

```text
frame.return Request
→ Main acceptance commit
→ frame.return Response
→ dependent close / resume
```

ordinary call 不通过 reverse `frame.suspend` 建立 Caller suspension。

实现 MUST NOT 要求入站 `frame.call/frame.return` handler pending 时同时处理并等待反向 Frame Request。same-Subsystem recursive call 即使共享同一 MessagePort 也必须正确工作。

## 5. Subsystem Worker Mutation Gate

Worker SDK 在 outbound call/return pending 时：

```text
stop new ordinary input dispatch
block second call/return
```

call Error → gate release / Caller remains active / old Activation remains valid。

call Success → local Caller suspended / old Activation permanently revoked。

return Error → gate release / Frame remains active。

return Success → local Frame closing / old Activation permanently revoked，等待 Main `frame.close`。

## 6. InputTarget Publication

Main Worker→Window Control mapping必须满足：

```text
frame.activate ACK
    happens-before Child InputTarget publication

frame.resume ACK
    happens-before Caller replacement InputTarget publication
```

transaction gap `InputTarget=null` 合法。Window MUST NOT 继续沿用旧 target，也不得恢复缓存 old Activation。

## 7. Frame Input Context

ordinary User Input 至少要求：Frame active、provided Activation=current、Frame=current Main InputTarget、当前没有 outbound mutation gate 阻止 dispatch。

revoked Activation 永久 reject。

`suspended/closing/closed` 不关闭 Data Port、不 destroy Render、不删除 shared business state。

## 8. Frame RPC Semantics

- `frame.resume` 一次完成 Child outcome delivery + replacement Activation installation；
- `frame.call` success 返回 childFrameId，只表示 logical call accepted，不表示 Child active；
- `frame.return` success 表示 outcome accepted + closing begun，不表示 close/resume complete；
- `frame.suspend` 只保留为 Main 主动 quiesce / terminal preparation，不是 ordinary call step。

## 9. System Data MessagePort / Render

Window 与每个 Subsystem Worker 最多一条 Data Port：Connection Layer / Render Update / User Input。Port 与 Frame 数量无关，可 zero Frame 服务 Render。

Subsystem Worker 完全控制 Render lifecycle，Renderer 不能从 Frame Stack 推导 Render visibility/order/destroy。

## 10. Page Lifecycle

页面隐藏只停止 raw ordinary input capture / reset local input state，不改变 Main-owned Frame/Activation authority。

恢复时只恢复 Main 当前 committed Stack/current Activation/InputTarget；不得 revive revoked Activation或未 commit transaction state。Render 独立恢复。

## 11. Worker Resource / Failure

当前 one Subsystem→one Worker、all required eager。lazy/idle recycle/composite Container 需要新契约。

Worker unexpected termination → Runtime failure；Runtime failure revoke affected Activation；Frame lifecycle 不设置 `failed`，Batch E 负责 multi-Frame unwind；Data Port failure stop ordinary input，Render 独立 recovery。

## 12. Security

Worker script 来自受信任启动边界；Data Port 只转移给目标 Worker/Window；User Input 校验 active/current Activation；Render Update 限制 Subsystem namespace；Content API 只访问登记 installation。

## 13. Core Invariants

- one Subsystem = one Dedicated Worker；
- Subsystem Control v1 + Frame A/B/C application semantics preserved；
- exactly seven Frame RPC methods even over MessagePort；
- Caller Main-owned，不进入 Subsystem wire；
- ordinary call no reverse-suspend dependency；
- call/return Response precedes dependent reverse RPC；
- activate/resume ACK precedes Window InputTarget publication；
- outbound call/return mutation gate required；
- post-commit failure不恢复旧 Activation；
- same-Subsystem recursion 不要求 nested handler reentrancy；
- Frame lifecycle 不控制 Render/Data Port；
- PWA Transport differences do not redefine application protocol。
