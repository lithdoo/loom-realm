# LoomRealm 旧文档状态表（Legacy）

> 状态：Legacy  
> 主要定义：历史文档状态表的退役说明  
> 最近复核：2026-08-04

本文件来自文档分层重构前的旧状态表。其“单一真相源”列表和优先级规则已经失效，**不得用于判断当前架构或契约权威来源**。

当前治理由 [文档分层与变更规则](../00-overview/document-governance.md) 定义：

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

## 旧目录处理原则

旧 `overview/`、`architecture/`、`contracts/`、`design/`、`game-package/`、`runtime/`、`fsdb/`、`roadmap/` 资料只作为迁移、实现细节或历史参考。若旧路径与当前分层冲突，以当前 `00/10/15` 权威文档为准。

## 当前已确认失效的旧模型

不得恢复：

- 每 Frame 一个独立 Runtime Process/Worker 或 Renderer Transport；
- Frame 必须拥有独立业务 Runtime/Projector/Client State；
- Frame close 自动删除 Render/Data Connection；
- Renderer 根据 Frame Stack 推导 Render visibility/z-order；
- Game Entry 只声明 Legacy `systemId`、由固定 Registry 提供实现；
- eager 模型首次 Frame call 才启动 Subsystem；
- Process spawn = Runtime ready；failed Runtime automatic restart；
- Frame 公共 `ready / initialized / frame.status`；
- `failed/completed/cancelled` 作为 Frame lifecycle；
- closed frameId reuse；old activationId 在 resume 后恢复有效；
- Renderer reload 从本地缓存恢复旧 Activation；
- Legacy `systemId` 作为新 Frame ownership identity；
- `system.call / system.return / frame.result` 作为当前 Frame RPC；
- `frame.close(reason)` 或 callerFrameId-on-wire；
- ordinary `frame.call` 必须 reverse `frame.suspend` 才能建立 Child；
- `frame.call` success = Child active；
- `frame.return` success = Child closed / Caller resumed；
- activate/resume ACK 前发布新 Activation；
- post-commit failure 恢复 revoked Activation 或撤销 accepted outcome；
- same-Subsystem recursive call 依赖 nested bidirectional handler；
- Frame RPC timeout 自动重发/重试；
- JSON-RPC id 作为 operationId/idempotency key；
- timeout 后释放 mutation gate继续旧 Activation；
- Frame control divergence 通过 reinitialize/resync 修复；
- Renderer/Data reconnect 用于恢复 Frame Control authority；
- caller-driven `frame.cancel`；
- 把 `FrameOutcome.cancelled` 解释成远程 Caller cancellation。

## 当前 Frame 协议迁移状态

旧 `15-contracts/system-lifecycle-protocol.md` 已降为 Legacy / redirect；当前权威入口是 `15-contracts/frame-call-protocol-v1.md`。

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
    Next

Batch F
    Draft
```

Batch D 当前迁移规则：所有 Frame Request finite deadline；Success=known commit；Explicit Error=known no-commit；timeout/loss=ambiguous→Runtime failure；no automatic retry/replay；recoverable rejection与 Runtime-fatal divergence/protocol error分离；no caller-driven Frame cancellation。

历史方案需要追溯时使用 Git 历史和 ADR 0010/0011/0012/0013；Legacy 路径不得反向覆盖已冻结语义。
