# Main ⇄ Subsystem Frame 生命周期与调用协议草案（Legacy 路径）

> 层级：正式契约 / 兼容入口  
> 状态：Legacy / Superseded  
> 稳定程度：Historical Redirect  
> 当前权威文档：[Frame / Call Protocol v1](./frame-call-protocol-v1.md)  
> 替代决策：[ADR 0010：Batch A](../decisions/0010-freeze-frame-call-protocol-v1-batch-a.md)、[ADR 0011：Batch B](../decisions/0011-freeze-frame-call-protocol-v1-batch-b.md)、[ADR 0012：Batch C](../decisions/0012-freeze-frame-call-protocol-v1-batch-c.md)  
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
    local pre/postcondition

Batch C Frozen
    Stack transaction serialization
    call/return acceptance barrier
    Response-before-dependent-RPC
    activate/resume ACK-before-InputTarget-publication
    pre-commit abort / post-commit forward recovery
    no reverse frame.suspend dependency for ordinary call
    no nested request-handler reentrancy requirement

Batch D-F Draft
```

旧 `system.call/system.return`、Frame ready/status、Caller-on-wire、`frame.result`、`frame.close(reason)`、Activation rollback，以及 `call → reverse frame.suspend → child` 顺序都不得作为新增实现依据。

本文件只保留旧链接兼容和 Git 历史说明。
