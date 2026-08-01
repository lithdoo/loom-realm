# 渲染系统

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：Subsystem-owned Render、Render Store、声明式视图状态、DOM/Canvas/WebGL 呈现和输入边界  
> 依赖：[系统架构总览](./system-overview.md)、[通信系统](./communication-system.md)、[模块子系统模型](./subsystem-model.md)  
> 最近复核：2026-08-02

## 1. 设计目标

渲染系统将各 Subsystem 发布的声明式 Render State 呈现为 Web UI，同时保持业务状态、Frame/Input、物理 Transport 和本地表现状态之间的边界。

核心链路：

```text
Subsystem business state / Render Manager
→ Render State
→ Render Update Protocol
→ Renderer Render Store
→ Render Scheduler
→ DOM / Canvas / WebGL
```

Renderer Store 是目标状态镜像，实际 DOM / Canvas Scene / WebGL Scene 是 Store 的派生结果。

## 2. 核心原则

> Render 完全由 Subsystem 控制。Main 不维护 Render Registry，Frame 不拥有 Render，Renderer 不从 Frame Stack 推导 Render 生命周期。

因此以下平台级行为均不存在：

```text
frame.activate → show render
frame.suspend  → hide render
frame.resume   → restore render
frame.close    → destroy render
```

Subsystem 可以在内部根据 Frame 事件主动执行上述任意行为，但必须通过自身 Render 管理逻辑和 Render Update Protocol 显式完成。

## 3. 职责

Renderer 负责：

- 按 `systemId` 维护 Renderer ⇄ Runtime Container 的 System Data Connection；
- 接收和校验 Render Update Protocol 消息；
- 按 System / Render 身份维护 Render Store；
- 校验和应用完整或增量 Render State；
- 使用稳定 Key 将声明式 Node 协调为可信视图组件；
- 选择 DOM、Canvas 或 WebGL 呈现后端；
- 管理动画、缓存、焦点、插值等非权威表现状态；
- 采集并归一化键盘、手柄、触摸和 UI Interaction；
- 根据 Main 发布的 Input Target 把普通输入交给 User Input Protocol。

## 4. 非职责

Renderer 不负责：

- 决定地图移动、碰撞、菜单选择或对话推进；
- 创建或销毁 Subsystem 的权威 Render；
- 根据 Frame Stack 决定 Render 显示、隐藏或顺序；
- 把某个 Render 自动绑定到某个 Frame；
- 从 DOM / Canvas / WebGL 推断调用栈、业务状态或 Input Target；
- 把浏览器原始事件直接发送给 Subsystem；
- 解释游戏包物理路径；
- 接收任意 HTML、脚本或远程 DOM 命令；
- 将本地插值结果写回为权威业务状态。

## 5. Render Context

Render Context 是 Subsystem 发布到 Renderer 的呈现身份。

概念身份：

```text
systemId + renderId
```

因为 System Data Connection 已绑定 `systemId`，具体 Render Update 消息通常只需要携带连接内唯一的 `renderId`。

一个 Subsystem 可以同时拥有：

```text
render world
render hud
render menu-overlay
render loading
render debug
```

这些 Render 是否与任何 Frame 有关系，不属于公共渲染协议。

## 6. Render State 与 Scope

Render Context 可以包含一个或多个 Scope，以便按更新频率和事务原子性拆分声明式目标状态。

概念身份：

```text
renderId + scopeId
```

节点身份：

```text
renderId + scopeId + key
```

不同 Render 可以复用相同局部 Scope 名和 Node Key。

Render 被 Subsystem 显式销毁时，Renderer 才清理该 Render 的 Store 和派生呈现对象。Frame 出栈、暂停或 Activation 变化不能触发隐式清理。

## 7. 声明式 Node 模型

Client / Render Node 由以下概念组成：

- `key`：Scope 内稳定身份；
- `tag`：可信 Renderer 类型；
- `data`：声明式 JSON 目标状态；
- `children`：直接子节点及顺序。

Renderer 只允许已注册 Tag，并为每个 Tag 绑定 Data Schema、Renderer、允许的交互 Schema 和呈现后端。

Node 是视图组件节点，不要求每个 Tile、角色、粒子或场景对象对应一个 DOM Element。

## 8. Render Update 下行链路

```text
Subsystem business state / Render Manager
→ Render Projector / state builder
→ Render Update Protocol
→ System Data Connection
→ 根据 renderId 路由
→ Render Message Validator
→ Render Store 原子提交
→ 标记 dirty Scope
→ requestAnimationFrame
→ Scope Reconciler / Scene Renderer
```

消息回调不得直接分散操作 DOM 或 Scene。必须先校验并提交 Store，再进入呈现阶段。

同一 System Data Connection 可以交错承载多个 Render Context 的 State/Event；Renderer 按 Render 身份独立校验 Revision 和 Scope。

## 9. Store 提交

收到 Render State 时至少验证：

- 消息来自正确 `systemId` 的 Data Connection；
- `renderId` 是否在当前 Render Protocol 上可接受；
- Render / Scope Revision 是否可接受；
- Scope 数量、树深和消息大小；
- Key 是否在 Scope 内唯一；
- Tag 是否已注册；
- Data 是否满足 Tag Schema。

验证成功后原子提交新的 Render / Scope Store。验证失败时保留旧 Store 和旧画面，并按 Render Update Protocol 请求对应 Render 的恢复状态。

较旧 Revision 不得覆盖较新状态。

## 10. Render Scheduler

Renderer 将状态接收和画面提交分离：

```text
任意时刻接收 Render State
→ Store 立即原子更新
→ dirty Scope 合并
→ 每个 requestAnimationFrame 最多提交一次呈现
```

同一显示帧内同一 Render/Scope 的多个未呈现 State 可以只呈现最新 Store。Event 不采用相同 latest-wins 规则。

Render Scheduler 不改变协议 Revision；它只决定何时将当前 Store 呈现到画面。

## 11. DOM / Scene 协调原则

- 相同 Key 且相同 Tag 时复用 Element / Scene Object；
- Data 变化时更新节点自身；
- Children 顺序变化时移动已有对象；
- Tag 变化时销毁旧对象并重新创建；
- 未变化节点不重建；
- Snapshot 校验失败时保留旧状态并请求 Render Resync；
- Renderer 不因 Frame 生命周期自行销毁 Render 对象。

第一阶段仍倾向完整 Scope Replace 作为增量单位，不定义任意 DOM 命令或节点级远程 Patch；精确契约将在 Render Update Protocol 中重新冻结。

## 12. 混合呈现后端

推荐将不同内容映射到不同可信 Tag Renderer：

```text
DOM
    菜单、对话、HUD、表单、文本输入和无障碍控件

Canvas / WebGL
    地图、角色、粒子、战斗场景、摄像机和高频动画
```

例如一个 `loom.map.scene` Node 可以对应单个 Canvas Element，其 Renderer 内部维护地图层、角色和粒子的本地表现对象。

## 13. Render 排序与可见性

Render 的业务排序与可见性由发布它的 Subsystem 决定，并通过 Render Update Protocol 的正式状态表达。

当多个 System 同时存在 Render 时，跨 System 的最终合成规则需要由后续 Render Protocol / Renderer Composition 设计明确冻结。Main Frame Stack 不能自动充当 Render z-order。

在该规则冻结前，任何实现都不得假设：

```text
Frame Stack order == Render z-order
active Frame == only visible Render
```

## 14. 输入路由边界

普通 User Input 只发送给 Main 声明的 Input Target：

```text
systemId
frameId
activationId
```

Renderer 根据目标 `systemId` 选择 System Data Connection，再通过 User Input Protocol 发送 Frame 输入。

Render UI Interaction 如何映射到具体 Frame/Input Context 是 User Input Protocol 与 Subsystem Render State 的后续契约问题。Renderer 不能自行假设 `renderId == frameId`。

页面失焦或 Input Target 改变时必须释放持续输入意图。

## 15. 本地表现状态

以下状态可以只保留在 Renderer：

- DOM Element、Canvas Scene 和 GPU 资源引用；
- CSS 动画和过渡进度；
- 图片解码和浏览器缓存；
- 焦点、滚动和 Hover；
- 输入设备瞬时状态；
- 不影响业务规则的视觉插值；
- 粒子、屏幕震动和其他一次性表现对象。

这些本地状态不得改变碰撞、伤害、调用结果或 Subsystem 权威 Render State。

## 16. State 与 Event

Render State 表示当前应该呈现什么：

- 可由完整 Render Snapshot 恢复；
- 可以在未发送或未呈现前合并为最新目标；
- 适合角色位置、菜单内容、HP 和当前对话。

Render Event 表示一次性发生的表现行为：

- 通常需要按 Render 或 Protocol Domain 有序、有界处理；
- 不应替代可恢复 State；
- 适合音效、伤害数字、屏幕震动和短暂粒子。

Event 的精确顺序作用域由 Render Update Protocol 冻结，不再继承 Frame Activation Sequence。

## 17. 资源

Render State 只使用逻辑资源 Key 和内容版本：

```text
resourceKey + contentVersion
```

Renderer Resource Client 通过只读 Content API 获取 MIME 和资源主体。资源加载失败显示诊断或占位，不破坏 Render Store。

Render State 不携带资源字节或本机物理路径。

## 18. 故障与恢复

Renderer 重载时：

```text
重连 Main Control Connection
→ 恢复 ready System / Data Connection 授权
→ 每个需要通信的 System 重建 Data Connection
→ 各 Subsystem 通过 Render Update Protocol 恢复自己的 Render State
→ Main 独立恢复 Frame Stack / Activation / Input Target
```

故障边界：

- System Data Connection 断开时，停止该 System 的普通输入；
- 某 Render 的 State 校验错误只影响对应 Render 恢复上下文，不应自动删除其他 Render；
- Frame suspend / close 与 Render 恢复无关；
- DOM / Scene 不能作为权威恢复源。

## 19. 平台一致性

桌面每个 System Data Connection 使用 localhost WebSocket；PWA 使用 MessagePort。Renderer 上层逻辑保持：

```text
System Data Connection Registry
├── Render Protocol Router → Render Store → Render Scheduler
└── User Input Router → Frame Input Context
```

Transport 差异不能重新引入 Frame-owned Render 语义。

## 20. 架构不变量

1. Render 生命周期完全属于 Subsystem；
2. Frame 不拥有 Render；
3. Main 不维护 Render Registry 或 Render visibility；
4. Renderer 不从 Frame Stack 推导 Render；
5. Render Store 是 Renderer 的恢复目标，DOM / Canvas / WebGL 是派生结果；
6. Render Update 使用独立 Render 身份，不依赖 Frame Activation；
7. Frame suspend / resume / close 不产生隐式 Render 操作；
8. State 先提交 Store，再更新画面；
9. Renderer 本地表现不能改变 Subsystem 权威业务结果。

## 21. 相关下层文档

- [Renderer–Subsystem 协议分层](./renderer-subsystem-protocol-layers.md)；
- [Renderer–Subsystem 数据协议 v1](../15-contracts/frame-data-channel-v1.md)：旧 Frame-scoped 详细契约，待按新协议域迁移；
- [Client State Tree v1](../15-contracts/client-state-tree-v1.md)：旧 Frame-scoped 状态契约，待迁移到 Render 身份模型；
- [Web 渲染端模块设计](../20-modules/web-renderer/README.md)；
- [ADR 0004：Client State 渲染流水线](../decisions/0004-client-state-rendering-pipeline.md)；
- [ADR 0006：Frame 与 Render 生命周期解耦](../decisions/0006-frame-render-decoupling.md)。
