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

旧 [第一阶段设计待办](../roadmap/phase-1-design-todos.md) 已标记 **Legacy / Superseded**，不再作为当前待办来源。

## 当前已冻结的实施前提

第一阶段实现可以直接依赖：

- [Game Package v2](../15-contracts/game-package-v2.md)；
- [Desktop Node.js Launcher Profile v1](../15-contracts/nodejs-launcher-profile-v1.md)；
- [Subsystem Control Protocol v1](../15-contracts/subsystem-control-lifecycle-protocol.md)；
- [Frame / Call Protocol v1](../15-contracts/frame-call-protocol-v1.md) 的 **Batch A / B**；
- [Content API v1](../15-contracts/content-api-v1.md)。

当前冻结状态：

```text
Launcher v1
    Frozen

Subsystem Control v1
    Frozen

Frame / Call v1
    Batch A Frozen
        identity / authority / lifecycle / Activation

    Batch B Frozen
        seven RPC methods
        params/result Schema
        FrameOutcome wire union
        local pre/postcondition

    Batch C-F Draft
```

Batch B 已可直接生成 JSON Schema、TypeScript 类型、runtime validator 和 Main/SDK dispatcher：

```text
frame.initialize({ frameId, input })
frame.activate({ frameId, activationId })
frame.suspend({ frameId, activationId })
frame.resume({ frameId, activationId, returnedFrameId, result })
frame.close({ frameId })
frame.call({ frameId, activationId, targetSubsystemKey, input }) → { childFrameId }
frame.return({ frameId, activationId, result }) → {}
```

实现不得自行增加：

```text
system.call / system.return
frame.ready / frame.status / frame.result
callerFrameId on Subsystem wire
frame.close(reason)
optional completed.value
```

## 实施原则

1. 已 Frozen Contract 先写 conformance fixture，再写两端实现；
2. 部分冻结协议必须明确 Frozen Batch 与 Draft Batch；
3. Batch C-F 不得静默修改 Batch A/B 已冻结方法、字段、identity 或 lifecycle；
4. Launcher / Control / Frame / Render / Content 的能力边界不得因代码便利重新合并；
5. 先完成 test-subsystems，再接复杂地图 Subsystem；
6. 公共类型不能引用具体地图 DTO；
7. 每个 Frozen 结论必须有自动测试或公开 fixture；
8. 实施发现架构问题时先修改上层文档；
9. 路线图只追踪工作，不定义正式行为。

## 当前实施顺序

```text
Game Package v2 / Desktop Launcher v1        ← Frozen
    ↓
Subsystem Control Protocol v1                ← Frozen
    ↓
Frame / Call Batch A                         ← Frozen
    ↓
Frame / Call Batch B                         ← Frozen
    ↓
Frame / Call Batch C                         ← next freeze target
    transaction / commit barrier / rollback
    ↓
Frame / Call Batch D
    error / timeout / retry / cancellation
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
    ↓
loom.map vertical slice
```

Main ⇄ Renderer Control 可以在 Batch C 同步验证 Input Target publish barrier，但不得反向改变 Batch A/B。
