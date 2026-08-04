# Main ⇄ Subsystem Frame 生命周期与调用协议草案（Legacy 路径）

> 层级：正式契约 / 兼容入口  
> 状态：Legacy / Superseded  
> 稳定程度：Historical Redirect  
> 当前权威文档：[Frame / Call Protocol v1](./frame-call-protocol-v1.md)  
> 替代决策：[ADR 0010](../decisions/0010-freeze-frame-call-protocol-v1-batch-a.md)、[ADR 0011](../decisions/0011-freeze-frame-call-protocol-v1-batch-b.md)、[ADR 0012](../decisions/0012-freeze-frame-call-protocol-v1-batch-c.md)、[ADR 0013](../decisions/0013-freeze-frame-call-protocol-v1-batch-d.md)、[ADR 0014](../decisions/0014-freeze-frame-call-protocol-v1-batch-e.md)  
> 最近复核：2026-08-04

此路径曾承载 Frame lifecycle / call / return 草案。Runtime lifecycle 已由 [Subsystem Control Protocol v1](./subsystem-control-lifecycle-protocol.md) 独立冻结；当前 Frame 权威入口只使用 [Frame / Call Protocol v1](./frame-call-protocol-v1.md)。

```text
Batch A Frozen   identity / authority / lifecycle / Activation
Batch B Frozen   exact seven RPC / closed wire / FrameOutcome
Batch C Frozen   transaction / acceptance / publication barriers
Batch D Frozen   error / timeout / no-retry / cancellation boundary
Batch E Frozen   Runtime failure lowest-root whole-suffix fixed-point unwind
Batch F Next     limits / fixtures / profile/version completion
```

Batch E 当前禁止恢复的旧 recovery 模型包括：

```text
只删除 failed Runtime 自己的 Frame
只从最近 failed-runtime occurrence unwind
failed Runtime 上继续依赖 frame.close ACK
cleanup timeout 后 retry
Runtime crash 覆盖 accepted terminal outcome
逐层 resume doomed intermediate Frames
恢复 Caller old Activation
新增 frame.abort / frame.unwind / recovery replay/resync
```

旧 `system.call/system.return/frame.result`、Frame ready/status、Caller-on-wire、`frame.close(reason)`、Activation rollback、ordinary call reverse-suspend dependency、timeout→retry、caller remote cancel 同样不得作为新增实现依据。

本文件只保留旧链接兼容和 Git 历史说明。
