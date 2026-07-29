# 渲染系统

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：Client State、Frame/Scope Store、DOM 呈现和输入路由边界  
> 依赖：[系统架构总览](./system-overview.md)  
> 最近复核：2026-07-29

## 1. 设计目标

渲染系统将各模块子系统发布的声明式 Client State 呈现为 Web UI，同时保持业务状态、调用关系和本地表现状态之间的边界。

## 2. 职责

- 维护程序主系统发布的调用栈镜像；
- 维护当前普通输入目标；
- 维护每个 Frame 独立的 Scope Store；
- 校验和应用 Snapshot、Scope Replace 与 Scope 删除；
- 使用稳定 Key 将 Client Node 协调为 DOM Element；
- 采集并归一化键盘、手柄、触摸和节点事件；
- 管理动画、缓存、焦点等非权威表现状态；
- 在 Frame 出栈时清理其全部 DOM 和资源引用。

## 3. 非职责

- 不决定地图移动、碰撞、菜单选择或对话推进；
- 不从 DOM 推断调用栈；
- 不把浏览器原始事件直接发送给子系统；
- 不解释游戏包物理路径；
- 不在多个 Frame 之间自行转发业务事件。

## 4. 状态层次

```text
子系统权威状态
→ Frame Client State
→ 渲染端 Store
→ DOM Tree
```

Store 是渲染端的目标状态镜像，DOM 是 Store 的派生结果。

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

## 6. 节点模型

Client Node 由以下概念组成：

- `key`：Scope 内稳定身份；
- `tag`：可信 Renderer 类型；
- `data`：声明式 JSON 目标状态；
- `children`：直接子节点及顺序。

渲染端只允许已注册 Tag，并为每个 Tag 绑定 Data Schema、Renderer 和允许的事件 Schema。

## 7. DOM 协调原则

- 相同 Key 且相同 Tag 时复用 Element；
- Data 变化时更新节点自身；
- Children 顺序变化时移动已有 Element；
- Tag 变化时销毁旧 Element 并重新创建；
- 未变化节点不应重建；
- Store 提交和 DOM 更新分阶段执行；
- Snapshot 校验失败时保留旧状态并请求 Resync。

## 8. 输入路由

普通输入只发送给程序主系统声明的输入目标。节点事件附带完整 Frame、Activation、Scope 和 Key 来源，直接发送给拥有该 Frame 的子系统。

页面失焦或输入目标变化时，必须释放持续方向意图，防止旧 Frame 继续接收输入。

## 9. 本地表现状态

以下状态可以只保留在渲染端：

- DOM Element 引用；
- CSS 动画和过渡进度；
- 图片解码和浏览器缓存；
- 焦点、滚动和 Hover；
- 不影响业务规则的视觉插值。

客户端可以平滑呈现目标位置，但不能自行决定移动是否成功。

## 10. 故障与恢复

- 渲染端重载后先获取完整调用栈；
- 为每个有效 Frame 重建数据连接；
- 请求完整 Frame Client State；
- 原子恢复 Store 后重新协调 DOM；
- 资源加载失败显示诊断或占位，不破坏 Store；
- Frame 出栈后拒绝该 Frame 的迟到状态和事件。

## 11. 相关下层文档

- [Client State Tree 契约入口](../15-contracts/client-state-tree-v1.md)；
- [Web 渲染端模块设计](../20-modules/web-renderer/README.md)；
- [现有详细设计：Web 渲染端协调](../design/web-client-reconciliation.md)。
