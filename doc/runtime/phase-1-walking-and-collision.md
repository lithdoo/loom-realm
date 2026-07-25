# 第一阶段人物行走与碰撞运行时（已替代）

> 状态：**Superseded**  
> 替代日期：2026-07-25

本文档曾独立定义方向意图、人物状态、移动时序、碰撞和 Portal 衔接。后续 Runtime Core、Runtime Execution Loop 和 Pokémon Essentials 兼容设计已经形成更完整且相互一致的权威边界。

当前实现依据：

- [第一阶段 Runtime Core](./phase-1-runtime-core.md)：人物权威状态、Move Command、Tick、碰撞、Portal Event/Effect 和原子事务；
- [第一阶段 Runtime Execution Loop](./phase-1-runtime-execution-loop.md)：固定 `20ms / 50Hz` Tick、单调时钟、队列和 Effect Barrier；
- [Pokémon Essentials v21.1 地图与行走运行时](./phase-1-pokemon-essentials-map-runtime.md)：三层 Tile、方向通行、Priority、人物行走图和兼容编译；
- [第一阶段 Session Coordinator](./phase-1-session-coordinator.md)：异步地图准备和地图切换协调；
- [Web Client 状态协调与 DOM 呈现](../design/web-client-reconciliation.md)：人物移动的非权威 CSS 表现。

当前冻结边界：

```text
Runtime Service
→ Runtime Execution Loop
→ Runtime Core
→ Runtime Snapshot
→ Client State Projector
→ Web Client
```

- Runtime Core 决定人物是否移动以及最终位置；
- Execution Loop 决定 Core 命令和 Tick 的执行顺序；
- 兼容编译层生成标准方向通行网格；
- Portal 在人物完成一步并稳定进入目标格后检测；
- Web Client 只表现权威移动状态，不根据 DOM 动画推进游戏逻辑；
- Tick 默认值已经在 Execution Loop 文档冻结，不再属于开放问题。

历史内容已由 Git 版本记录保留。本页不再重复定义可能与 Runtime Core 冲突的状态模型。