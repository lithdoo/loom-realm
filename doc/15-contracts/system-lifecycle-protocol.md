# Main ⇄ Subsystem Frame 生命周期与调用协议草案（Legacy 路径）

> 层级：正式契约 / 兼容入口  
> 状态：Legacy / Superseded  
> 稳定程度：Historical Redirect  
> 当前权威文档：[Frame / Call Protocol v1](./frame-call-protocol-v1.md)  
> 替代决策：[ADR 0010：冻结 Frame / Call Protocol v1 Batch A](../decisions/0010-freeze-frame-call-protocol-v1-batch-a.md)  
> 最近复核：2026-08-03

此路径曾承载 Frame lifecycle / call / return 草案。随着 [Subsystem Control Protocol v1](./subsystem-control-lifecycle-protocol.md) 已独立冻结 Runtime Container lifecycle，`system-lifecycle-protocol.md` 这个名称容易把 **Runtime lifecycle** 与 **Frame lifecycle** 混淆，因此不再作为当前 Frame 协议权威入口。

当前设计请使用：

- [Frame / Call Protocol v1](./frame-call-protocol-v1.md)；
- [Subsystem Control Protocol v1](./subsystem-control-lifecycle-protocol.md)。

当前 Frame / Call v1 已完成 Batch A 冻结：

```text
Frame identity / descriptor.key assignment
Main-owned Frame / Stack authority
callerFrameId immutability
starting / active / suspended / closing / closed
no Frame ready / frame.status
Activation unique / never reused / never rolls back
completed / cancelled / failed = outcome, not lifecycle state
```

后续 RPC Schema、Call transaction、error / timeout、Runtime failure unwind 继续在 `frame-call-protocol-v1.md` 中分批冻结。

本文件只保留旧链接兼容和 Git 历史说明，不得作为新增实现或协议设计依据。
