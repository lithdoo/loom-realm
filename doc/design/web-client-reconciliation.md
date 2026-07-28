# Web 渲染端 Frame/Scope 状态协调与 DOM 呈现

> 状态：**Active Design**  
> 适用范围：第一阶段 Web 渲染端  
> 最近复核：2026-07-28  
> 主要定义：调用栈镜像、输入路由、Frame/Scope Store、节点协调和本地表现状态

相关文档：

- [`../architecture/main-system-and-subsystems.md`](../architecture/main-system-and-subsystems.md)：主系统和子系统调用栈；
- [`../architecture/client-state-tree-protocol.md`](../architecture/client-state-tree-protocol.md)：Frame Client State、Scope 和 Node；
- [`../architecture/runtime-rpc-and-state-sync.md`](../architecture/runtime-rpc-and-state-sync.md)：JSON-RPC、Sequence 和恢复；
- [`../architecture/client-state-projector.md`](../architecture/client-state-projector.md)：子系统状态投影。

核心原则：

> 程序主系统决定当前调用栈和输入目标；各模块子系统决定自己 Frame 的 Client State；Web 渲染端维护这些状态的本地镜像，并将 Scope Tree 协调为 DOM。DOM 不是业务状态来源。

## 1. 模块结构

```text
程序主系统控制通道
→ Stack Store / Input Target

模块子系统数据通道
→ Frame Scope Store
→ Scope Tree Reconciler
→ Custom Node Registry
→ DOM / CSS
```

渲染端同时连接：

- 一个程序主系统控制面；
- 当前调用栈中一个或多个有效子系统数据面。

## 2. Stack Store

```ts
interface ClientStackStore {
  readonly revision: number;
  readonly frames: readonly ClientFrameDescriptor[];
  readonly inputTarget: InputTarget | null;
}

interface ClientFrameDescriptor {
  readonly frameId: string;
  readonly systemId: string;
  readonly state: "starting" | "active" | "suspended" | "closing";
  readonly visible: boolean;
}

interface InputTarget {
  readonly frameId: string;
  readonly activationId: string;
}
```

Stack Store 只由程序主系统消息更新。渲染端不得根据 DOM 层级推断当前栈顶。

## 3. Frame/Scope Store

```ts
interface ClientFrameState {
  readonly frameId: string;
  readonly activationId: string;
  readonly stateRevision: number;
  readonly lastSequence: number;
  readonly scopes: Readonly<Record<string, ClientScope>>;
}

interface ClientStore {
  readonly stack: ClientStackStore;
  readonly frames: ReadonlyMap<string, ClientFrameState>;
}
```

完整 Scope 身份：

```text
frameId + scopeId
```

节点身份：

```text
frameId + scopeId + key
```

不同 Frame 可以使用相同的 `scopeId` 和 Node Key，不会冲突。

## 4. 连接建立

启动或重连流程：

```text
连接程序主系统
→ 获取 stack.snapshot
→ 为每个有效 Frame 建立子系统数据通道
→ 向每个子系统请求 state.snapshot
→ 原子填充 Frame/Scope Store
→ 协调 DOM
```

Frame 入栈：

```text
frame.pushed
→ 建立新子系统通道
→ 等待该 Frame 首次 Snapshot
→ 创建 Frame 容器
→ 挂载其 Scope
→ 更新输入目标
```

Frame 出栈：

```text
frame.popped
→ 关闭通道
→ 删除 Frame Store
→ 销毁该 Frame 全部 Scope DOM
→ 清理事件、动画和资源引用
→ 更新输入目标
```

## 5. 用户输入路由

渲染端统一采集键盘、手柄、触摸和节点事件，但不解释业务规则。

普通输入只发送给 `inputTarget`：

```ts
function dispatchInput(input: NormalizedInput): void {
  const target = store.stack.inputTarget;
  if (!target) return;

  connections.get(target.frameId)?.notify("input.dispatch", {
    frameId: target.frameId,
    activationId: target.activationId,
    sequence: nextInputSequence(),
    input,
  });
}
```

规则：

- 不向暂停 Frame 发送普通输入；
- 不发送原始 Browser Event；
- 页面失焦时释放持续方向意图；
- 输入目标切换后立即停止向旧 Frame 发送；
- 高频方向输入可以合并成最新意图，但确认、取消等离散输入必须保持顺序。

## 6. 节点事件

节点 Renderer 产生事件时，渲染端附加完整来源：

```ts
interface NodeEventSource {
  readonly frameId: string;
  readonly activationId: string;
  readonly scopeId: string;
  readonly key: string;
}
```

事件直接发送给拥有该 Frame 的子系统。渲染端不把事件路由给程序主系统，也不让一个 Frame 的节点任意调用另一个 Frame。

## 7. 状态消息处理

### 7.1 完整 Frame Snapshot

```text
验证 frameId 和 activationId
→ 验证 Sequence
→ 验证全部 Scope Tree
→ 原子替换该 Frame 的 Store
→ 计算需要创建、更新和删除的 Scope
→ 在一次渲染提交中协调 DOM
```

Snapshot 失败时保留旧 Frame State，并请求 Resync。

### 7.2 Scope Replace

```text
验证 Frame 和 Activation
→ 验证 Sequence
→ 验证 State/Scope Revision
→ 替换或删除单个 Scope
→ 只协调受影响 Scope
```

消息回调不得直接散布 DOM 操作。必须先提交 Store，再由协调阶段更新 DOM。

## 8. Sequence 和 Revision

每个 Frame 数据连接独立维护 `lastSequence`。

```text
重复或过期消息
→ 忽略

连续消息
→ 应用

Sequence 缺口
→ 暂停应用该 Frame 的增量消息
→ 请求 state.resync
```

较旧的 State Revision 或 Scope Revision 不得覆盖较新状态。

程序主系统的 `stackRevision` 与子系统数据连接的 `sequence` 相互独立。

## 9. Activation 切换

收到 `frame.suspended`：

- 停止发送输入；
- 保留 Frame Store 和 DOM；
- 停止接受旧 Activation 的新消息；
- 可以继续运行纯客户端动画，但不能改变业务状态。

收到 `frame.resumed`：

- 更新 `activationId`；
- 恢复输入目标；
- 允许子系统发送新 Snapshot 或增量状态；
- 丢弃旧 Activation 的迟到消息。

## 10. Frame 和 Scope 容器

推荐 DOM 结构：

```html
<div id="loom-root">
  <section data-lr-frame="frame-map-1">
    <div data-lr-scope="world"></div>
    <div data-lr-scope="hud"></div>
  </section>
  <section data-lr-frame="frame-dialog-3">
    <div data-lr-scope="dialog"></div>
  </section>
</div>
```

Frame 顺序由程序主系统调用栈决定。默认后入栈 Frame 位于更高呈现层。

第一阶段默认：

- 栈中所有未关闭 Frame 可以保持可见；
- 只有栈顶 Frame 接收输入；
- 子系统可以通过自己的 Scope 决定是否覆盖全部页面；
- 后续如需隐藏下层 Frame，应由主系统 Frame 描述显式给出，不由客户端猜测。

## 11. Scope Tree Reconciler

每个 Scope 独立协调：

```text
新旧 Roots
→ 建立 key → node / element 索引
→ 复用相同 Key 且相同 Tag 的 Element
→ 更新 Data
→ 调整直接子节点顺序
→ 创建新节点
→ 销毁删除节点
```

规则：

- Key 在 Scope 内唯一；
- Tag 变化时销毁旧 Element 并创建新 Element；
- 节点换父级时移动已有 Element；
- 未变化节点不应重建；
- Frame 出栈时可以整体销毁，不需要逐 Scope 等待子系统通知。

## 12. Custom Node Registry

```ts
interface ClientNodeRenderer {
  create(node: ClientNode, context: NodeContext): Element;
  update(element: Element, previous: ClientNode, next: ClientNode): void;
  destroy?(element: Element, node: ClientNode): void;
}
```

Registry 绑定：

```text
Tag
→ Data Schema
→ Renderer
→ 允许事件 Schema
```

安全规则：

- 只允许已安装的可信 Tag；
- 不执行 Data 中的脚本；
- 不解析任意 HTML 字符串；
- 节点事件只能发送给所属 Frame 的子系统；
- 节点不得修改其他 Frame 容器。

## 13. 本地表现状态

只保留在渲染端：

- DOM Element 引用；
- CSS 动画和过渡进度；
- 图片解码和浏览器缓存；
- 焦点、滚动位置和临时 hover；
- 输入设备瞬时状态；
- 不影响业务规则的视觉插值。

子系统状态决定目标结果，本地表现状态负责平滑呈现。

例如地图移动：

```text
地图子系统确认目标格
→ world Scope 更新目标位置
→ 客户端从旧像素位置插值到新位置
```

客户端不得自行决定碰撞结果。

## 14. 状态与 Event

Scope State：

- 可恢复；
- 可以合并为最新目标；
- 重连时通过 Snapshot 恢复。

Event：

- 一次性；
- 通常有序；
- 不应替代对话文本、菜单状态等可恢复内容；
- Frame 出栈后不得作用于其他 Frame。

## 15. 资源

Client Node Data 使用逻辑资源 Key：

```json
{
  "sprite": "actor.sprite/player"
}
```

资源缓存 Key 至少包含：

```text
resourceKey + contentVersion
```

资源接口可以由平台资源服务或子系统授权接口提供，但不能让 Client State 暴露本机路径。

资源加载失败不应破坏 Frame/Scope Store。Renderer 应显示诊断或占位内容。

## 16. 背压和渲染频率

- 同一 Frame/Scope 的未呈现状态可以合并为最新值；
- DOM 每个 `requestAnimationFrame` 最多协调一次；
- Event 队列必须有界且显式处理溢出；
- 大型资源内容使用独立通道；
- 程序主系统控制消息不得被 Scope 洪峰阻塞。

## 17. 故障恢复

### 子系统数据通道断开

```text
标记 Frame 数据不可用
→ 停止向其发送输入
→ 通知程序主系统
→ 保留或清理旧 DOM 由主系统栈状态决定
```

### 渲染端重载

```text
获取 stack.snapshot
→ 重建 Frame 连接
→ 获取每个 Frame state.snapshot
→ 重建 Store 和 DOM
```

### 非法 Scope Tree

```text
拒绝新状态
→ 保留旧状态
→ 记录诊断
→ 请求该 Frame Resync
```

## 18. 第一阶段验收

至少验证：

- 初始地图 Frame 的 `world` 和 `hud`；
- 子 Frame 入栈后下层 Scope 保留显示；
- 输入只发送给栈顶；
- 子 Frame 出栈后全部 Scope 自动删除；
- 调用者恢复后使用新 Activation；
- 旧 Activation 输入和 Scope 被拒绝；
- 单 Scope Replace 不重建其他 Scope；
- 渲染端重载后从 Stack + Frame Snapshot 恢复。

## 19. 当前结论

```text
程序主系统
→ 提供调用栈和输入目标

每个模块子系统
→ 直接提供所属 Frame 的 Scope State

Web 渲染端
→ 按 Frame/Scope 存储
→ 按 Key 协调 DOM
→ 将输入直接发送给当前活动子系统
```

渲染端是多子系统 Client State 的组合器，但不是调用栈或业务规则的权威。