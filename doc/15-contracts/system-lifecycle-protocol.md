# Main ⇄ Subsystem Frame 生命周期与调用协议草案（Legacy 路径）

> 层级：正式契约 / 兼容入口  
> 状态：Legacy / Superseded  
> 稳定程度：Historical Redirect  
> 当前权威文档：[Frame / Call Protocol v1](./frame-call-protocol-v1.md)  
> Conformance：[Frame / Call Protocol v1 Conformance Profile](./frame-call-conformance-v1.md)  
> 替代决策：[ADR 0010](../decisions/0010-freeze-frame-call-protocol-v1-batch-a.md)、[ADR 0011](../decisions/0011-freeze-frame-call-protocol-v1-batch-b.md)、[ADR 0012](../decisions/0012-freeze-frame-call-protocol-v1-batch-c.md)、[ADR 0013](../decisions/0013-freeze-frame-call-protocol-v1-batch-d.md)、[ADR 0014](../decisions/0014-freeze-frame-call-protocol-v1-batch-e.md)、[ADR 0015](../decisions/0015-freeze-frame-call-protocol-v1-batch-f.md)  
> 最近复核：2026-08-05

此路径曾承载 Frame lifecycle / call / return 草案。Runtime lifecycle 已由 [Subsystem Control Protocol v1](./subsystem-control-lifecycle-protocol.md) 独立冻结，Frame / Call 已由 [Frame / Call Protocol v1](./frame-call-protocol-v1.md) 整体冻结，因此此文件只保留旧链接兼容。

当前状态：

```text
Frame / Call Protocol v1
    protocol = loomrealm.frame-call / 1
    Active / Normative / Frozen

Design provenance
    Batch A-F all Frozen
```

v1 最终还冻结 JSON/Request-ID/message limits、finite deadline profile、Desktop WebSocket/PWA MessagePort application mapping、静态 version binding 与正式 conformance profile。

旧模型不得作为新增实现依据，包括：

```text
system.call / system.return / frame.result
Frame ready/status / failed lifecycle
Caller-on-wire / frame.close(reason)
Activation rollback/reuse
ordinary call reverse-suspend dependency
frame.call success = Child active
frame.return success = Child closed/Caller resumed
activate/resume ACK前发布 Activation
timeout → retry/replay
Frame state resync
caller remote cancel
partial failed-runtime deletion
Runtime crash覆盖 accepted outcome
PWA Structured Clone扩展 Frame value type
JSON-RPC Batch Frame messages
Request ID reuse
Frame independent hello/version/capabilities
partial Batch compatibility = v1 compatibility
```

当前实现与设计请直接使用权威 Frame / Call v1 与 Conformance Profile。本文件只保留历史入口。
