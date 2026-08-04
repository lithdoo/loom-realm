# LoomRealm 旧文档状态表（Legacy）

> 状态：Legacy  
> 主要定义：历史文档状态表的退役说明  
> 最近复核：2026-08-04

本文件来自文档分层重构前的旧状态表。其“单一真相源”列表和优先级规则已经失效，**不得用于判断当前架构或契约权威来源**。

当前治理：

```text
00-overview
→ 10-architecture
→ 15-contracts
→ 20-modules
→ 30-implementation
```

当前推荐入口：

- [LoomRealm 设计文档](../README.md)；
- [系统架构总览](../10-architecture/system-overview.md)；
- [正式契约目录](../15-contracts/README.md)；
- [Subsystem Control Protocol v1](../15-contracts/subsystem-control-lifecycle-protocol.md)；
- [Frame / Call Protocol v1](../15-contracts/frame-call-protocol-v1.md)。

## 当前已确认失效的旧模型

不得恢复：

- 每 Frame 一个独立 Runtime Process/Worker 或 Renderer Transport；
- Frame 必须拥有独立业务 Runtime/Projector/Client State；
- Frame close 自动删除 Render/Data Connection；
- Renderer 根据 Frame Stack 推导 Render visibility/z-order；
- Process spawn = Runtime ready；failed Runtime automatic restart；
- Frame 公共 `ready / initialized / frame.status`；
- `failed/completed/cancelled` 作为 Frame lifecycle；
- closed frameId reuse / old activationId resume后复活；
- Renderer reload 恢复旧 Activation；
- `system.call / system.return / frame.result` 作为当前 Frame RPC；
- `frame.close(reason)` 或 callerFrameId-on-wire；
- ordinary call reverse `frame.suspend` dependency；
- `frame.call` success = Child active；
- `frame.return` success = Child closed / Caller resumed；
- activate/resume ACK前发布新 Activation；
- post-commit failure恢复 revoked Activation或撤销 accepted outcome；
- same-Subsystem recursive call依赖 nested bidirectional handler；
- Frame RPC timeout automatic retry/replay；
- JSON-RPC id作为 operationId/idempotency key；
- timeout后释放 mutation gate继续旧 Activation；
- Frame control divergence通过 reinitialize/resync修复；
- Renderer/Data reconnect恢复 Frame Control authority；
- caller-driven `frame.cancel`；
- `FrameOutcome.cancelled` = remote Caller cancellation；
- Runtime failure只删除当前 top Frame；
- Runtime failure只删除相同 subsystemKey 的 Frame而保留 descendants；
- 同一 failed Runtime多次出现在 Stack时只从最近 occurrence unwind；
- failed Runtime上继续依赖 `frame.close ACK` 后才能移除 Frame；
- Batch E cleanup timeout 后 retry 或继续把 Runtime当 healthy；
- recovery固定使用首次 root，不因新 failed Runtime向下扩展；
- Runtime crash覆盖已经 accepted 的 completed/cancelled/failed outcome；
- 对 doomed intermediate Frame逐层 resume；
- recovery恢复 Caller old Activation；
- 新增 `frame.abort / frame.unwind` 或 recovery replay/resync作为 v1实现捷径。

## 当前 Frame 协议迁移状态

旧 `15-contracts/system-lifecycle-protocol.md` 已 Legacy / redirect；当前权威入口是 `15-contracts/frame-call-protocol-v1.md`。

```text
Frame / Call v1 overall
    Draft

Batch A
    Identity / Authority / Lifecycle / Activation
    Normative / Frozen

Batch B
    RPC Wire Schema / Direction / Local Semantics
    Normative / Frozen

Batch C
    Transaction / Commit Barrier / Rollback
    Normative / Frozen

Batch D
    Error / Timeout / Retry / Cancellation
    Normative / Frozen

Batch E
    Runtime Failure Unwind
    Normative / Frozen

Batch F
    Limits / Fixtures / Profile / Version Completion
    Next / Final
```

Batch E 当前迁移规则：Runtime failure按 `descriptor.key` 进入 failed set；lowest failed-runtime Frame为 root；root..top whole suffix Top→Bottom unwind；failed Runtime Frame logical retire无 Frame RPC ACK；healthy descendant best-effort close；cleanup failure扩大 failed set并重新计算 root；accepted outcome保留；root无 outcome使用 `SUBSYSTEM_RUNTIME_FAILED`；只 fresh-resume final direct healthy Caller或清空 Stack。

历史方案需要追溯时使用 Git 历史和 ADR 0010-0014；Legacy 路径不得反向覆盖已冻结语义。
