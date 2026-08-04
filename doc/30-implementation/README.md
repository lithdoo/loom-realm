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

第一阶段实现可以直接依赖：

- Game Package v2；
- Desktop Node.js Launcher Profile v1；
- Subsystem Control Protocol v1；
- Frame / Call Protocol v1 **Batch A / B / C**；
- Content API v1。

当前状态：

```text
Launcher v1            Frozen
Subsystem Control v1   Frozen

Frame / Call v1
    Batch A  identity / authority / lifecycle / Activation     Frozen
    Batch B  exact seven RPC / Schema / local semantics         Frozen
    Batch C  transaction / commit barrier / rollback            Frozen
    Batch D  error / timeout / retry / cancellation             Next
    Batch E  Runtime failure unwind                              Draft
    Batch F  limits / fixtures / profile completion             Draft
```

Batch C 已经可以直接实现 transaction coordinator / trace fixture：

```text
initial:
    initialize ACK
    → activate ACK
    → publish InputTarget

call:
    call acceptance commit
    → frame.call Result
    → child initialize / activate
    → activate ACK
    → publish child InputTarget

return:
    return acceptance commit
    → frame.return Result
    → close ACK / pop
    → resume ACK
    → publish caller InputTarget
```

实现不得：

- ordinary call 中重新插入 reverse `frame.suspend`；
- 在 `frame.call` Response 前依赖 Child initialize/activate；
- 在 `frame.return` Response 前依赖 close/resume；
- activate/resume ACK 前发布新 Activation；
- post-commit failure 时恢复旧 Activation 或撤销 accepted outcome；
- 因 Desktop/PWA Transport 差异要求 nested bidirectional Request handler reentrancy。

## 实施原则

1. Frozen Contract 先写 conformance fixture，再写两端实现；
2. 部分冻结协议必须明确 Frozen Batch 与 Draft Batch；
3. Batch D-F 不得静默修改 A/B/C 已冻结的 identity/lifecycle/wire/transaction semantics；
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
Frame / Call Batch D                         ← next
    semantic error / timeout / retry / cancellation
    ↓
Frame / Call Batch E
    Runtime failure unwind
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

Main ⇄ Renderer Control 现在已经有来自 Batch C 的强制 causal constraints：activate/resume ACK 必须先于对应 InputTarget publication；未来 wire 设计不得反向改变它们。
