# ADR 0004：Client State 渲染流水线

> 状态：Accepted  
> 日期：2026-08-01  
> 影响范围：模块子系统、Frame 数据通道、Web Renderer、DOM/Canvas/WebGL

## 背景

子系统拥有权威业务状态，Renderer 负责 Web 呈现。需要同时支持菜单、对话等 DOM UI，以及地图、平台跳跃和格斗等高频 2D 场景。

直接从子系统发送 DOM 命令会破坏安全、恢复和跨渲染后端能力。把每个 Tile、角色和粒子展开为 DOM Node 也会造成不必要的性能成本。

## 考虑过的方案

### 子系统远程操作 DOM

优点：表达直接。

代价：无法可靠校验和恢复，安全边界差，Renderer 与业务逻辑耦合。

### 发送完整像素帧

优点：Renderer 简单。

代价：带宽和延迟成本高，失去 DOM UI、资源缓存和本地动画能力。

### 声明式 Client State + 本地协调

优点：可恢复、可校验、支持背压和多种呈现后端。

代价：需要 Store、Projector、Reconciler 和可信 Renderer Registry。

## 决定

采用：

```text
Frame 权威状态
→ Client State Projector
→ Frame Data Channel
→ Renderer Validator
→ Frame/Scope Store
→ Render Scheduler
→ DOM / Canvas / WebGL
```

Client Node 是可信视图组件节点，不要求每个游戏对象对应一个 DOM Element。

菜单、对话、HUD 和表单优先使用 DOM。地图、角色、粒子和战斗场景使用可信 Canvas/WebGL Scene Tag。

## 结果

- Store 是 Renderer 的恢复目标，DOM 和 Scene 是派生结果；
- State 消息先原子提交 Store，再在 `requestAnimationFrame` 中呈现；
- 同一 Frame/Scope 未呈现 State 可以合并为最新目标；
- Event 保持独立有界队列；
- Renderer 可以执行非权威视觉插值，但不能改变碰撞、伤害、选择或调用结果；
- Scope 按更新频率和事务原子性划分；
- 第一阶段使用 Snapshot 和 Scope Replace，不定义远程 DOM Patch。

## 重新评估条件

- 大型场景 State 序列化成为主要性能瓶颈；
- 需要共享内存或二进制 Scene State Profile；
- 引入原生非 Web Renderer；
- 节点级 Patch 能显著降低开销且不破坏恢复和安全语义；
- 需要服务端或远程串流渲染 Profile。
