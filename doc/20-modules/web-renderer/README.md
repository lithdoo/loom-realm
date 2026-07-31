# Web 渲染端模块设计

> 层级：模块设计  
> 状态：Active Design  
> 稳定程度：Experimental  
> 主要定义：Web 渲染端内部模块、输入上行、视图状态下行和呈现依赖方向  
> 依赖：[渲染系统](../../10-architecture/rendering-system.md)、[Frame 数据通道 v1](../../15-contracts/frame-data-channel-v1.md)、[Client State Tree v1](../../15-contracts/client-state-tree-v1.md)  
> 最近复核：2026-08-01

## 1. 建议模块

```text
Web Renderer
├── Main Control Connection
├── Stack Store
├── Frame Connection Registry
├── Frame Message Validator
├── Frame / Scope Store
├── Input Router
├── State Coalescer
├── Event Queue
├── Render Scheduler
├── Scope Reconciler
├── Scene Renderer Registry
├── Node Registry
├── Resource Client
├── Presentation Clock
└── Presentation State
```

## 2. Main Control Connection

连接程序主系统控制面，接收：

- `stack.snapshot`；
- Frame 入栈、暂停、恢复和出栈；
- Frame 可见性；
- Input Target；
- Frame Channel Grant；
- 会话失败和诊断。

桌面实现使用 localhost WebSocket；PWA 实现使用与 Main Runtime Worker 的 MessagePort。上层控制语义一致。

## 3. Stack Store

只接受程序主系统控制消息，保存：

```text
Stack Revision
Frame 描述和顺序
Frame 可见性
当前 Input Target
```

不得根据 DOM 层级、z-index 或已连接 Frame 猜测栈顶。

## 4. Frame Connection Registry

按 `frameId` 管理独立双向数据连接：

```ts
interface FrameConnectionRecord {
  readonly frameId: string;
  readonly systemId: string;
  readonly activationId: string;
  readonly connectionId: string;
  readonly transport: FrameDataTransport;
}
```

职责：

- 建立、认证和替换 Frame 连接；
- 将上行输入发送给对应 Frame；
- 将下行 State 和 Event 交给 Validator；
- 断线时停止输入并通知 Main；
- Frame 出栈时关闭连接和拒绝迟到消息。

一个 System Container 可以对应多个 Frame Connection。

## 5. Frame Message Validator

下行消息依次校验：

- Frame 是否存在；
- Activation 和 Connection 是否匹配；
- 下行 Sequence 是否连续；
- State/Scope Revision 是否可接受；
- Scope 数量、树深和消息大小；
- Key 是否在 Scope 内唯一；
- Tag 是否已注册；
- Data 是否满足 Tag Schema；
- Event 是否满足类型 Schema。

非法 State 不进入 Store。Sequence 缺口或验证失败触发 `state.resync`。

## 6. Frame / Scope Store

每个 Frame 独立保存：

```ts
interface ClientFrameState {
  readonly frameId: string;
  readonly activationId: string;
  readonly stateRevision: number;
  readonly lastSubsystemSequence: number;
  readonly scopes: ReadonlyMap<string, ClientScope>;
}
```

消息先校验并原子提交 Store，再进入呈现阶段。

Store 是 Renderer 的恢复目标；DOM、Canvas Scene 和 WebGL Scene 都不是恢复源。

## 7. Input Router

- 采集键盘、手柄、触摸和节点事件；
- 将浏览器事件归一化为协议输入；
- 只发送给 Stack Store 当前 Input Target；
- 维护每个设备的持续方向意图；
- 页面失焦、Frame 暂停或目标变化时释放意图；
- 将节点事件绑定完整 Frame、Activation、Scope 和 Key 来源；
- 离散输入保持顺序并使用有界队列。

Input Router 不决定移动、碰撞、跳跃、选择或调用结果。

## 8. State Coalescer

State Coalescer 管理已提交 Store 与尚未呈现状态之间的合并：

- 同一 Frame/Scope 在一次显示帧内只保留最新 dirty 标记；
- 不回滚已经提交的 Store；
- 不修改协议 State Revision；
- 不将 Event 合并为最新值；
- Frame Snapshot 可以使该 Frame 的旧 dirty Scope 集合失效并重新计算。

子系统发送前的投影合并仍由子系统 Projector Scheduler 负责。

## 9. Event Queue

Event Queue 处理一次性表现行为：

- 保持下行 Sequence 顺序；
- 按 Frame 和 Activation 隔离；
- 设置最大事件数和最大字节数；
- Frame 出栈时清空；
- 过期 Activation 的 Event 丢弃；
- 溢出时按 Profile 明确降级、丢弃非关键 Event 或断开连接。

Event 不写入可恢复 Frame/Scope Store。

## 10. Render Scheduler

Render Scheduler 每个 `requestAnimationFrame` 最多提交一次画面更新：

```text
读取 dirty Frame/Scope
→ 读取当前 Store 最新状态
→ 协调 Frame 容器顺序和可见性
→ 调用 Scope Reconciler 或 Scene Renderer
→ 派发当前帧 Event
→ 更新 Presentation State
```

消息接收不等待 `requestAnimationFrame`，Store 可以即时提交；只有昂贵的画面操作被批量调度。

## 11. Scope Reconciler

适用于 DOM 或组件树 Scope：

- 相同 Key 且 Tag 相同时复用 Element；
- Data 变化调用 `update`；
- Children 顺序变化移动已有 Element；
- Tag 变化销毁并重建；
- 删除节点调用 `destroy`；
- 未变化节点不重建；
- 单 Scope Replace 不协调其他 Scope。

第一阶段不接收远程 DOM 命令或任意 HTML。

## 12. Scene Renderer Registry

高频 2D 场景使用可信 Canvas/WebGL Tag，例如：

```text
loom.map.scene
loom.platformer.scene
loom.fighting.scene
```

一个场景 Tag 可以对应一个 Canvas Element，并在 Renderer 内部维护：

- 地图层和 Sprite；
- 实体表现对象；
- 摄像机；
- 粒子和光照；
- GPU 资源；
- 插值缓冲。

Client Node 是视图组件节点，不要求每个 Tile 或实体成为 DOM Node。

Scene Renderer 只能根据 Store 中的声明式目标和本地 Presentation State 呈现，不能改变权威业务结果。

## 13. Node Registry

Registry 将可信 Tag 绑定到：

```text
Data Schema
Renderer Backend
create / update / destroy
允许的事件 Schema
资源引用规则
```

Registry 不接受运行时下发 JavaScript、任意 HTML、CSS 代码或物理文件路径。

## 14. Resource Client

通过 `resourceKey + contentVersion` 访问只读 Content API：

- 桌面使用 localhost HTTP；
- PWA 使用 same-origin Fetch，由 Service Worker 响应；
- 验证 MIME 和内容版本；
- 管理 Blob、ImageBitmap、AudioBuffer 和 GPU 资源缓存；
- 资源失败显示占位或诊断，不破坏 Store；
- Frame 出栈时释放不再引用的呈现资源。

## 15. Presentation Clock

Presentation Clock 提供：

- `requestAnimationFrame` 时间；
- 可选模拟 Tick 和事务时间映射；
- 插值 alpha；
- 页面隐藏和恢复检测；
- 长帧与呈现延迟诊断。

它不改变子系统固定 Tick，也不生成权威时间。

## 16. Presentation State

只保存非权威表现信息：

- DOM、Canvas Scene 和 GPU 对象引用；
- CSS 动画和过渡进度；
- 插值起点、目标和显示时间；
- 焦点、滚动和 Hover；
- 图片解码和音频播放状态；
- 临时粒子、伤害数字和屏幕震动。

不得改变碰撞、选择、伤害、调用或存档结果。

## 17. 完整下行流程

```text
Frame 数据连接收到消息
→ Frame Message Validator
→ Frame/Scope Store 原子提交
→ State Coalescer 标记 dirty
→ Render Scheduler 在 rAF 中运行
→ Scope Reconciler / Scene Renderer
→ DOM / Canvas / WebGL
```

Snapshot 验证失败时旧 Store 和旧画面保持不变，并向 Frame Runtime 请求 Resync。

## 18. Frame 生命周期处理

### 入栈

```text
Main 发布 frame.pushed
→ Registry 建立 Frame 数据连接
→ 请求或等待首次 Snapshot
→ Store 原子创建 Frame
→ Render Scheduler 创建 Frame 容器
→ Main 更新 Input Target 后开始输入
```

### 暂停

- 停止普通输入并释放持续意图；
- 保留 Store 和画面；
- 丢弃旧 Activation 的迟到消息；
- 可以继续纯本地动画，但不能改变业务状态。

### 恢复

- 更新 Activation；
- 重建或更新数据连接；
- 请求 Snapshot；
- 恢复 Input Target。

### 出栈

```text
关闭连接
→ 删除 Frame Store
→ 销毁全部 Scope、Scene 和 Event
→ 清理资源引用
→ 拒绝迟到消息
```

## 19. 核心不变量

- Stack Store 只由 Main 控制消息更新；
- 一个 Scope 的完整身份包含 Frame；
- 旧 Activation、旧 Sequence 和旧 Revision 不覆盖新状态；
- State 先提交 Store，再更新画面；
- DOM 和 Scene 不是恢复源；
- Frame 出栈后整体清理；
- 一个 Frame 的节点事件不能任意调用另一个 Frame；
- Scene Renderer 的插值不改变权威业务结果；
- WebSocket 和 MessagePort Transport 得到相同 Store 结果。

## 20. 测试入口

- Stack Snapshot 与 Revision 缺口；
- Frame Snapshot、Scope Replace 和删除；
- 下行 Sequence 缺口与 Resync；
- Key 复用、移动、删除和 Tag 变化；
- 同一显示帧 State 合并；
- Event 保序和溢出；
- Input Target 切换和持续意图释放；
- DOM 与 Canvas Scene 混合呈现；
- Renderer 重载恢复；
- Frame 出栈资源清理；
- 桌面 WebSocket 与 PWA MessagePort Conformance Fixture。

现有详细资料：[Web 渲染端 Frame/Scope 状态协调与 DOM 呈现](../../design/web-client-reconciliation.md)。
