# LoomRealm 实施计划目录

> 层级：实施计划  
> 状态：Tracking  
> 稳定程度：Experimental  
> 主要定义：当前分包、依赖、测试和第一阶段交付入口  
> 依赖：[模块设计目录](../20-modules/README.md)、[正式契约目录](../15-contracts/README.md)  
> 最近复核：2026-08-04

实施层描述当前仓库准备如何落地。包名、目录和交付顺序可以调整，但必须遵守上层架构和正式契约。

## 当前 Tracking 文档

- [仓库与分包方案](./repository-layout.md)；
- [测试策略](./testing-strategy.md)；
- [第一阶段交付计划](./phase-1-delivery-plan.md)。

旧 [第一阶段设计待办](../roadmap/phase-1-design-todos.md) 已标记 **Legacy / Superseded**。

## 当前已冻结的实施前提

第一阶段实现可以直接依赖 Game Package v2、Desktop Node.js Launcher v1、Subsystem Control v1、Frame / Call v1 Batch A/B/C/D 和 Content API v1。

```text
Frame / Call v1
    Batch A  identity / lifecycle / Activation                  Frozen
    Batch B  exact seven RPC / Schema / local semantics         Frozen
    Batch C  transaction / commit barrier / rollback            Frozen
    Batch D  error / timeout / no-retry / cancellation          Frozen
    Batch E  Runtime failure unwind                              Next
    Batch F  limits / fixtures / profile completion             Draft
```

Batch D 现在可直接实现：

```text
finite deadline for every Frame Request
Success        → known committed
Explicit Error → known not committed
Timeout/loss   → ambiguous → Runtime failure
no automatic retry/replay
recoverable call-target / initialize rejection
control divergence / protocol mismatch → Runtime-fatal
no caller-driven frame.cancel
```

实现不得：

- timeout 后重发 Frame operation；
- 把 JSON-RPC id 当 operationId/idempotency key；
- ambiguous 时释放 call/return mutation gate继续旧 Activation；
- 对 Frame state divergence 尝试私有 reinitialize/resync；
- 用 `-32602` 表示游戏业务 input rejection；
- 把 `FrameOutcome.cancelled` 解释成 Caller remote cancellation。

## 实施原则

1. Frozen Contract 先写 conformance fixture，再写两端实现；
2. 部分冻结协议必须明确 Frozen Batch 与 Draft Batch；
3. Batch E/F 不得静默修改 A/B/C/D 已冻结的 identity/lifecycle/wire/transaction/error semantics；
4. Launcher / Control / Frame / Render / Content 能力边界不得因代码便利重新合并；
5. 先完成 test-subsystems，再接复杂地图 Subsystem；
6. 每个 Frozen 结论必须有自动测试或公开 fixture；
7. 实施发现架构问题时先更新上层文档；
8. 路线图只追踪工作，不定义正式行为。

## 当前实施顺序

```text
Game Package v2 / Desktop Launcher v1        Frozen
    ↓
Subsystem Control Protocol v1                Frozen
    ↓
Frame / Call Batch A                         Frozen
    ↓
Frame / Call Batch B                         Frozen
    ↓
Frame / Call Batch C                         Frozen
    ↓
Frame / Call Batch D                         Frozen
    ↓
Frame / Call Batch E                         ← next
    Runtime failure deterministic unwind
    ↓
Frame / Call Batch F
    limits / fixtures / profile completion
    ↓
Main ⇄ Renderer Control
    ↓
Renderer ⇄ Subsystem Connection
    ↓
User Input + Render Update
    ↓
Render State
```

Main ⇄ Renderer Control 已受 Batch C causal constraints 约束；Batch D 进一步规定 Frame Control timeout/divergence 不通过 Renderer reconnect/resync 修复。
