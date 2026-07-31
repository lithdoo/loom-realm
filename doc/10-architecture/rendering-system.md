# 渲染系统

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：Client State、Frame/Scope Store、视图状态下行、DOM/Canvas/WebGL 呈现和输入路由边界  
> 依赖：[系统架构总览](./system-overview.md)、[通信系统](./communication-system.md)  
> 最近复核：2026-08-01

## 1. 设计目标

渲染系统将各模块子系统发布的声明式 Client State 呈现为 Web UI，同时保持业务状态、调用关系和本地表现状态之间的边界。

核心链路：

```text
子系统权威状态
→ Frame Client State
→ 渲染端 Store
→ DOM / Canvas / WebGL
```

Store 是渲染端的目标状态镜像，实际呈现树是 Store 的派生结果。

## 2. 职责

- 维护程序主系统发布的调用栈镜像；
- 维护当前普通输入目标；
- 维护每个 Frame 独立的 Scope Store；
- 校验和应用 Snapshot、Scope Replace 与 Scope 删除；
- 使用稳定 Key 将 Client Node 协调为可信视图组件；
- 选择 DOM、Canvas 或 WebGL 呈现后端；
- 采集并归一化键盘、手柄、触摸和节点事件；
- 管理动画、缓存、焦点和插值等非权威表现状态；
- 在 Frame 出栈时清理其全部 Store、呈现对象和资源引用。

## 3. 非职责

- 不决定地图移动、碰撞、菜单选择或对话推进；
- 不从 DOM 或 Canvas 推断调用栈；
- 不把浏览器原始事件直接发送给子系统；
- 不解释游戏包物理路径；
- 不在多个 Frame 之间自行转发业务事件；
- 不允许子系统直接发送 DOM 操作、任意 HTML 或脚本；
- 不将本地插值结果写回为权威业务状态。

## 4. 状态层次

```text
Frame Runtime 权威状态
→ Client State Projector
→ Frame Client State
→ Renderer Frame/Scope Store
→ Presentation Backend
```

权威状态只存在于子系统 Frame Runtime。Client State 是声明式目标投影。Renderer Store 是可恢复的本地镜像。DOM、Canvas Scene 和 WebGL Scene 是表现结果。

## 5. Frame 与 Scope

完整 Scope 身份：

```text
frameId + scopeId
```

完整节点身份：

```text
frameId + scopeId + key
```

不同 Frame 可以使用相同的局部 Scope 名称和 Node Key。Frame 出栈时整体删除，不要求子系统逐个删除 Scope。

暂停 Frame 的 Scope 可以继续显示，但不接收普通输入。

## 6. Client Node 模型

Client Node 由以下概念组成：

- `key`：Scope 内稳定身份；
- `tag`：可信 Renderer 类型；
- `data`：声明式 JSON 目标状态；
- `children`：直接子节点及顺序。

渲染端只允许已注册 Tag，并为每个 Tag 绑定 Data Schema、Renderer、允许的事件 Schema 和呈现后端。

Client Node 是视图组件节点，不要求每个 Tile、角色、粒子或场景对象对应一个 DOM Element。

## 7. 视图状态下行链路

```text
Frame Runtime 提交权威状态
→ Client State Projector 原子投影
→ state.snapshot / scope.replace / event.emit
→ Frame 数据连接
→ Renderer Validator
→ Frame/Scope Store 原子提交
→ 标记 dirty Scope
→ requestAnimationFrame 调度
→ Scope Reconciler / Scene Renderer
```

消息回调不得直接分散操作 DOM 或 Scene。必须先校验并提交 Store，再进入呈现阶段。

## 8. Store 提交

收到状态消息时依次验证：

- Frame 是否仍然存在；
- Activation 是否匹配；
- 数据 Sequence 是否连续；
- State Revision 和 Scope Revision 是否可接受；
- Scope 数量、树深和消息大小；
- Key 是否在 Scope 内唯一；
- Tag 是否已注册；
- Data 是否满足 Tag Schema。

验证成功后原子提交新的 Frame 或 Scope Store。验证失败时保留旧 Store 和旧画面，并请求该 Frame Resync。

较旧 State Revision 或 Scope Revision 不得覆盖较新状态。

## 9. Render Scheduler

Renderer 将状态接收和画面提交分离：

```text
任意时刻接收 State
→ Store 立即原子更新
→ dirty Scope 合并
→ 每个 requestAnimationFrame 最多提交一次呈现
```

同一显示帧内同一 Frame/Scope 的多个未呈现 State 可以合并为最新值。Event 不采用相同的 latest-wins 规则。

Render Scheduler 不改变协议 Revision；它只决定何时将当前 Store 呈现到画面。

## 10. DOM 协调原则

- 相同 Key 且相同 Tag 时复用 Element；
- Data 变化时更新节点自身；
- Children 顺序变化时移动已有 Element；
- Tag 变化时销毁旧 Element 并重新创建；
- 未变化节点不应重建；
- 节点从一个父级移动到另一个父级时复用身份兼容的 Element；
- Snapshot 校验失败时保留旧状态并请求 Resync。

第一阶段协议以完整 Scope Replace 为增量单位，不定义任意 DOM 命令或节点级远程 Patch。

## 11. 混合呈现后端

推荐将不同内容映射到不同可信 Tag Renderer：

```text
DOM
    菜单、对话、HUD、表单、文本输入和无障碍控件

Canvas / WebGL
    地图、角色、粒子、战斗场景、摄像机和高频动画
```

例如一个 `loom.map.scene` Client Node 可以对应单个 Canvas Element，其 Renderer 内部维护地图层、角色和粒子的本地表现对象。

Client State Tree 描述视图组件和目标数据，不要求将完整游戏场景展开为大量 DOM Node。

## 12. Scope 划分

Scope 应按更新频率和事务原子性划分，而不只按业务名词划分。

地图 Frame 可以使用：

```text
world.static
    地图和静态场景描述，低频变化

world.dynamic
    实体目标位置、动作和摄像机，高频且原子变化

hud
    HP、物品和提示，低频变化

loading / error
    偶发状态
```

若一次业务事务必须同时改变多个 Scope，第一阶段应发布完整 Frame Snapshot。高频且必须原子变化的数据应放在同一 Scope，避免每 Tick 发送整个 Frame Snapshot。

## 13. 输入路由

普通输入只发送给程序主系统声明的 Input Target。节点事件附带完整 Frame、Activation、Scope 和 Key 来源，直接发送给拥有该 Frame 的子系统。

页面失焦、Frame 暂停或 Input Target 变化时，必须释放持续方向意图，防止旧 Frame 继续接收输入。

渲染端只归一化输入，不决定业务结果。

## 14. 本地表现状态

以下状态可以只保留在渲染端：

- DOM Element、Canvas Scene 和 GPU 资源引用；
- CSS 动画和过渡进度；
- 图片解码和浏览器缓存；
- 焦点、滚动和 Hover；
- 输入设备瞬时状态；
- 不影响业务规则的视觉插值；
- 粒子、屏幕震动和其他一次性表现对象。

客户端可以平滑呈现权威目标位置，但不能自行决定移动是否成功、是否命中或是否允许跳跃。

## 15. State 与 Event

Scope State 表示当前应该呈现什么：

- 可由 Snapshot 恢复；
- 可以在未发送或未呈现前合并为最新目标；
- 适合角色位置、菜单内容、HP 和当前对话。

Event 表示一次性发生的表现行为：

- 通常需要有序、有界处理；
- 不应替代可恢复 State；
- 适合音效、伤害数字、屏幕震动和短暂粒子；
- Frame 出栈后不得作用于其他 Frame。

同一业务提交可以同时产生 State 和 Event，例如更新 HP State 并发出受击表现 Event。

## 16. 资源

Client Node Data 只使用逻辑资源 Key 和内容版本：

```text
resourceKey + contentVersion
```

Renderer Resource Client 通过只读 Content API 获取 MIME 和资源主体。资源加载失败显示诊断或占位，不破坏 Frame/Scope Store。

Client State 不携带资源字节或本机路径。

## 17. 故障与恢复

- Renderer 重载后先获取完整调用栈；
- 为每个有效 Frame 重建数据连接；
- 请求完整 Frame Client State；
- 原子恢复 Store 后重新协调 DOM、Canvas 或 WebGL；
- Frame 数据通道断开时停止向该 Frame 发送输入并通知 Main；
- Frame 出栈后拒绝该 Frame 的迟到状态和 Event；
- DOM 或 Scene 不作为恢复源。

## 18. 平台一致性

桌面 Frame 数据连接使用 localhost WebSocket；PWA 使用 MessagePort。Renderer 上层模块保持一致：

```text
Frame Connection Registry
→ Validator
→ Frame/Scope Store
→ Render Scheduler
→ Reconciler / Scene Renderer
```

Transport 差异不能改变 Store、Revision、Resync 和呈现语义。

## 19. 架构不变量

1. 业务权威状态只属于子系统 Frame Runtime；
2. Store 是 Renderer 的恢复目标，DOM 和 Scene 是派生结果；
3. 状态先提交 Store，再更新画面；
4. 同一 Frame/Scope 的未呈现 State 可以合并，Event 不能静默合并；
5. 暂停 Frame 可以继续显示但不接收普通输入；
6. Renderer 插值不能改变碰撞、选择和调用结果；
7. Frame 出栈时整体清理所有呈现对象和资源引用。

## 20. 相关下层文档

- [Client State Tree v1](../15-contracts/client-state-tree-v1.md)；
- [Frame 数据通道 v1](../15-contracts/frame-data-channel-v1.md)；
- [Web 渲染端模块设计](../20-modules/web-renderer/README.md)；
- [现有详细设计：Web 渲染端协调](../design/web-client-reconciliation.md)；
- [ADR 0004：Client State 渲染流水线](../decisions/0004-client-state-rendering-pipeline.md)。
