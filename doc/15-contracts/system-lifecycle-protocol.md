# Main ⇄ Subsystem Frame 生命周期与调用协议草案（Legacy 路径）

> 层级：正式契约 / 兼容入口  
> 状态：Legacy / Superseded  
> 稳定程度：Historical Redirect  
> 当前权威文档：[Frame / Call Protocol v1](./frame-call-protocol-v1.md)  
> 替代决策：[ADR 0010：Batch A](../decisions/0010-freeze-frame-call-protocol-v1-batch-a.md)、[ADR 0011：Batch B](../decisions/0011-freeze-frame-call-protocol-v1-batch-b.md)、[ADR 0012：Batch C](../decisions/0012-freeze-frame-call-protocol-v1-batch-c.md)、[ADR 0013：Batch D](../decisions/0013-freeze-frame-call-protocol-v1-batch-d.md)  
> 最近复核：2026-08-04

此路径曾承载 Frame lifecycle / call / return 草案。Runtime lifecycle 已由 [Subsystem Control Protocol v1](./subsystem-control-lifecycle-protocol.md) 独立冻结，因此此文件不再是当前 Frame 协议权威入口。

当前设计请使用 [Frame / Call Protocol v1](./frame-call-protocol-v1.md)。

当前状态：

```text
Batch A Frozen
    identity / authority / lifecycle / Activation

Batch B Frozen
    exact seven JSON-RPC Requests
    params/result / FrameOutcome Schema

Batch C Frozen
    Stack transaction / acceptance barriers
    Response-before-dependent-RPC
    ACK-before-InputTarget-publication
    pre-commit abort / post-commit forward recovery

Batch D Frozen
    Success / Explicit Error / Ambiguous result classification
    finite deadline
    no automatic retry/replay
    recoverable initialize/call rejection
    control divergence/protocol error Runtime-fatal
    no caller-driven frame.cancel

Batch E-F Draft
```

旧 `system.call/system.return/frame.result`、Frame ready/status、Caller-on-wire、`frame.close(reason)`、Activation rollback、ordinary call reverse-suspend dependency、timeout→retry、Frame operation replay/resync、caller remote cancel 都不得作为新增实现依据。

本文件只保留旧链接兼容和 Git 历史说明。
