# LoomRealm 实施计划目录

> 层级：实施计划  
> 状态：Tracking  
> 稳定程度：Experimental  
> 主要定义：当前分包、依赖、测试和第一阶段交付入口  
> 依赖：[模块设计目录](../20-modules/README.md)、[正式契约目录](../15-contracts/README.md)  
> 最近复核：2026-08-03

实施层描述当前仓库准备如何落地。这里的包名、目录和交付顺序可以随实现调整，只要仍遵守上层架构和正式契约。

## 当前 Tracking 文档

- [仓库与分包方案](./repository-layout.md)；
- [测试策略](./testing-strategy.md)；
- [第一阶段交付计划](./phase-1-delivery-plan.md)。

旧 [第一阶段设计待办](../roadmap/phase-1-design-todos.md) 已标记为 **Legacy / Superseded**，不再作为当前待办来源。

## 当前已冻结的实施前提

第一阶段实现可以直接依赖：

- [Game Package v2 Bootstrap / Descriptor Contract](../15-contracts/game-package-v2.md)；
- [Desktop Node.js Launcher Profile v1](../15-contracts/nodejs-launcher-profile-v1.md)；
- [Subsystem Control Protocol v1](../15-contracts/subsystem-control-lifecycle-protocol.md)；
- [Frame / Call Protocol v1](../15-contracts/frame-call-protocol-v1.md) 的 **Batch A**；
- [Content API v1](../15-contracts/content-api-v1.md)。

当前冻结状态：

```text
Launcher v1
    Frozen

Subsystem Control v1
    Frozen

Frame / Call v1
    Batch A Frozen
        identity
        authority
        lifecycle
        Activation

    Batch B-F Draft
```

Frame Batch A 已经可以直接生成类型、validator 和 state-machine fixture：

```text
frameId
    Main-generated / Session unique / never reused

Frame assignment
    permanent descriptor.key / subsystemKey

callerFrameId
    immutable

lifecycle
    starting / active / suspended / closing / closed

outcome
    completed / cancelled / failed
    separate from lifecycle

Activation
    only active Frame owns current Activation
    unique / never reused / never rolls back

no Frame ready / initialized / frame.status
```

实现不得等 Batch B 才决定这些基础模型，也不得为了代码方便继续使用 `Frame.status = failed`。

## 实施原则

1. 先冻结最小协议，再并行实现通信两端；
2. 已冻结 Contract 先写 conformance fixture，再写平台实现；
3. Launcher / Subsystem Control / Frame Call / Render / Content 的能力边界不得因代码便利重新合并；
4. 部分冻结协议必须明确 Frozen Batch 与 Draft Batch，不能把两者混成一个模糊状态；
5. 先完成测试 Subsystem，再接入复杂地图 Subsystem；
6. 每个包只能依赖上层允许的方向；
7. 公共类型不能引用具体地图 DTO；
8. 每个 Frozen 设计结论必须有自动测试或公开夹具；
9. 实施中发现架构问题时，先修改上层设计文档；
10. 路线图只追踪工作，不定义正式行为。

## 当前实施顺序

```text
Game Package v2 / Desktop Launcher v1        ← Frozen
    ↓
Subsystem Control Protocol v1                ← Frozen
    ↓
Frame / Call Batch A                         ← Frozen
    ↓
Frame / Call Batch B                         ← next freeze target
    7 RPC final Schema / pre-postcondition
    ↓
Frame / Call Batch C-E
    transaction / error / unwind
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

Main ⇄ Renderer Control 在 Frame Batch C 期间可以同步设计 Input Target commit barrier，但不得反向改变 Batch A 已冻结的 Frame identity / lifecycle / Activation。
