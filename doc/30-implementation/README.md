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
- [Main ⇄ Subsystem Control v1](../15-contracts/subsystem-control-lifecycle-protocol.md) 已收敛的 hello/status surface；
- [Content API v1](../15-contracts/content-api-v1.md)。

Desktop Launcher 当前不再是开放架构题：Entry/env/spawn/Supervisor/trust model 已冻结；PWA Launcher、第二 Launcher Type、Sandbox、Runtime restart 等明确暂缓。

## 实施原则

1. 先冻结最小协议，再并行实现通信两端；
2. 已冻结 Contract 先写 conformance fixture，再写平台实现；
3. Launcher / Control / Frame / Render / Content 的能力边界不得因代码便利重新合并；
4. 先完成测试子系统，再接入复杂地图子系统；
5. 先建立纵向最小闭环，再增加兼容内容；
6. 每个包只能依赖上层允许的方向；
7. 公共类型不能引用具体地图 DTO；
8. 每个设计结论必须有自动测试或公开夹具；
9. 实施中发现架构问题时，先修改上层设计文档；
10. 路线图只追踪工作，不定义正式行为。

## 当前实施顺序

```text
Game Package v2 / Desktop Launcher v1
    ↓
Main ⇄ Subsystem Control v1
    ↓
Frame / Call
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

Launcher v1 已完成设计冻结，当前工作应转向 schema/fixture/实现，而不是继续扩张 Launcher 范围。
