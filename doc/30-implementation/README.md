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

旧 [第一阶段设计待办](../roadmap/phase-1-design-todos.md) 已标记为 **Legacy / Superseded**，不再作为当前待办来源。其旧 System Registry、Frame-owned Scope/Render、首次调用启动 Runtime 等内容不得恢复到当前实现。

## 当前已冻结的实施前提

第一阶段实现可以直接依赖：

- [Game Package v2 Bootstrap / Descriptor Contract](../15-contracts/game-package-v2.md)；
- [Desktop Node.js Launcher Profile v1](../15-contracts/nodejs-launcher-profile-v1.md)；
- [Subsystem Control Protocol v1](../15-contracts/subsystem-control-lifecycle-protocol.md)：hello / status / shutdown、identity、Runtime 状态机、semantic error、wire limits、connection / shutdown failure semantics；
- [Content API v1](../15-contracts/content-api-v1.md)。

Desktop Launcher 与 Subsystem Control 当前都不再是开放架构题：

```text
Launcher v1
    Entry / env / spawn / Supervisor / trust model 已冻结

Subsystem Control v1
    hello / status / shutdown 已冻结
    Main-owned shutdown intent
    stopped only from Supervisor observation
    no application heartbeat / reconnect / resume / automatic restart
```

仍待设计冻结的主链从 Frame / Call 开始。PWA Launcher / Control Transport、第二 Launcher Type、Sandbox、Runtime recovery 等属于明确暂缓或后续 Profile。

## 实施原则

1. 先冻结最小协议，再并行实现通信两端；
2. 已冻结 Contract 先写 conformance fixture，再写平台实现；
3. Launcher / Subsystem Control / Frame Call / Render / Content 的能力边界不得因代码便利重新合并；
4. 先完成测试子系统，再接入复杂地图子系统；
5. 先建立纵向最小闭环，再增加兼容内容；
6. 每个包只能依赖上层允许的方向；
7. 公共类型不能引用具体地图 DTO；
8. 每个设计结论必须有自动测试或公开夹具；
9. 实施中发现架构问题时，先修改上层设计文档；
10. 路线图只追踪工作，不定义正式行为。

## 当前实施顺序

```text
Game Package v2 / Desktop Launcher v1        ← Frozen
    ↓
Subsystem Control Protocol v1                ← Frozen
    ↓
Frame / Call                                 ← next freeze target
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

Launcher v1 与 Subsystem Control v1 当前工作应转向 schema、fixture、SDK/Main implementation 和互操作测试，而不是继续扩张已冻结协议范围。
