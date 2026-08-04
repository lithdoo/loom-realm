# Main ⇄ Subsystem Frame 生命周期与调用协议草案（Legacy 路径）

> 层级：正式契约 / 兼容入口  
> 状态：Legacy / Superseded  
> 稳定程度：Historical Redirect  
> 当前权威文档：[Frame / Call Protocol v1](./frame-call-protocol-v1.md)  
> 替代决策：[ADR 0010：Batch A](../decisions/0010-freeze-frame-call-protocol-v1-batch-a.md)、[ADR 0011：Batch B](../decisions/0011-freeze-frame-call-protocol-v1-batch-b.md)  
> 最近复核：2026-08-04

此路径曾承载 Frame lifecycle / call / return 草案。随着 Runtime lifecycle 已由 [Subsystem Control Protocol v1](./subsystem-control-lifecycle-protocol.md) 独立冻结，`system-lifecycle-protocol.md` 这个名称容易把 Runtime lifecycle 与 Frame lifecycle 混淆，因此不再作为当前 Frame 协议权威入口。

当前设计请使用：

- [Frame / Call Protocol v1](./frame-call-protocol-v1.md)；
- [Subsystem Control Protocol v1](./subsystem-control-lifecycle-protocol.md)。

当前 Frame / Call v1 已完成：

```text
Batch A Frozen
    identity / authority / lifecycle / Activation

Batch B Frozen
    exact seven JSON-RPC Request methods
    params/result Schema
    FrameOutcome wire union
    local pre/postcondition

Batch C-F Draft
```

Batch B 已明确不再使用 `system.call / system.return`，不向 Subsystem 下发 `callerFrameId`，不定义独立 `frame.result`，`frame.close` 不携带 reason，`frame.resume` 同时交付 Child Outcome 与 replacement Activation。

后续 transaction / commit barrier / error / timeout / Runtime failure unwind / limits/profile 继续在 `frame-call-protocol-v1.md` 分批冻结。

本文件只保留旧链接兼容和 Git 历史说明，不得作为新增实现或协议设计依据。
