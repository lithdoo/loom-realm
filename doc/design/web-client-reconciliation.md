# Web 渲染端 Frame/Scope 状态协调与 DOM 呈现

> 状态：**Active Design**  
> 适用范围：第一阶段 Web 渲染端  
> 最近复核：2026-07-28  
> 主要定义：调用栈镜像、普通输入路由、Frame/Scope Store、后台状态接收、节点协调和本地表现状态

相关文档：

- [`../architecture/main-system-and-subsystems.md`](../architecture/main-system-and-subsystems.md)：主系统、前台调用栈和后台执行边界；
- [`../architecture/client-state-tree-protocol.md`](../architecture/client-state-tree-protocol.md)：Frame Client State、Scope 和 Node；
- [`../architecture/runtime-rpc-and-state-sync.md`](../architecture/runtime-rpc-and-state-sync.md)：JSON-RPC、Activation、Sequence 和恢复；
- [`../architecture/client-state-projector.md`](../architecture/client-state-projector.md)：子系统状态投影。

核心原则：

> 程序主系统决定当前调用栈和普通输入目标；各模块子系统决定自己 Frame 的 Client State；Web 渲染端维护这些状态的本地镜像，并将 Scope Tree 协调为 DOM。Frame 失去栈顶位置只改变前台控制和输入路由，不表示子系统进程或数据通道停止。

## 1. 模块结构

```text
程序主系统控制通道
→ Stack Store / Input Target

模块子系统数据通道
→ Frame Connection Session
→ Frame Scope Store
→ Scope Tree Reconciler
→ Custom Node Registry
→ DOM / CSS
```

渲染端同时连接：

- 一个程序主系统控制面；
- 当前调用栈中一个或多个有效子系统数据面。

非栈顶 Frame 的数据通道可以保持连接，以接收该 Frame 合法的后台状态。

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
  readonly activationId: string;
  readonly state: "starting" | "active" | "suspended" | "closing";
  readonly visible: boolean;
}

interface InputTarget {
  readonly frameId: string;
  readonly activationId: string;
}
```

Stack Store 只由程序主系统消息更新。渲染端不得根据 DOM 层级、数据通道活跃程度或子系统消息推断当前栈顶。

`state: "suspended"` 的客户端含义：

- 不向该 Frame 发送普通输入和节点事件；
- 保留 Frame Store、数据通道和 DOM；
- 继续接收该 Frame 当前数据 Epoch 下合法的后台状态；
- 不推断子系统进程、I/O、定时器或业务 Tick 是否停止。

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

Frame 的 Stack Descriptor 和 Frame State 来自不同通道：

```text
Main Control
    Frame 是否 active / suspended / closing
    当前 inputTarget
    当前 activationId

Subsystem Data
    State Revision
    Scope Revision
    Scope Tree
    Event
```

两者不能相互推断。

## 4. Frame Connection Session

每个有效 Frame 对应一个独立连接会话：

```ts
interface FrameConnectionSession {
  readonly frameId: string;
  readonly activationId: string;
  readonly state: "binding" | "connected" | "draining" | "closed";
  readonly lastSequence: number;
}
```

连接会话负责：

- 校验端口属于预期 Frame；
- 维护当前数据 Epoch；
- 维护每条连接的 Sequence；
- 管理 Pending Resync；
- 应用消息方法白名单；
- 执行大小和速率限制；
- 在 Frame 出栈时幂等关闭；
- 清理监听器、队列和 Pending RPC。

Frame 进入 `suspended` 不自动关闭连接。Frame 出栈、子系统失败或 Main 明确撤销端口时才关闭。

## 5. 连接建立与恢复

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
→ 更新普通输入目标
```

Frame 被覆盖：

```text
frame.suspended
→ 停止向该 Frame 发送普通输入
→ 保留连接、Store 和 DOM
→ 继续接收当前 Activation 下合法后台状态
```

Frame 恢复：

```text
frame.resumed(new activationId)
→ 更新 Frame Descriptor 和 Frame Connection 的 Activation
→ 丢弃旧 Activation 的迟到消息
→ 必要时请求完整 Snapshot
→ 根据 inputTarget 恢复输入
```

Frame 出栈：

```text
frame.popped
→ 关闭通道
→ 取消 Pending Resync
→ 删除 Frame Store
→ 销毁该 Frame 全部 Scope DOM
→ 清理事件、动画和资源引用
→ 更新普通输入目标
```

## 6. 普通输入路由

渲染端统一采集键盘、手柄、触摸和节点事件，但不解释业务规则。

普通输入只发送给 `inputTarget`：

```ts
function dispatchInput(input: NormalizedInput): void {
  const target = store.stack.inputTarget;
  if (!target) return;

  const frame = store.stack.frames.find(
    candidate => candidate.frameId === target.frameId,
  );

  if (!frame || frame.state !== "active") return;
  if (frame.activationId !== target.activationId) return;

  connections.get(target.frameId)?.notify("input.dispatch", {
    frameId: target.frameId,
    activationId: target.activationId,
    sequence: nextInputSequence(target.frameId),
    input,
  });
}
```

规则：

- 不向非 `inputTarget` Frame 发送普通输入；
- 不发送原始 Browser Event；
- 页面失焦时释放持续方向意图；
- 输入目标切换后立即停止向旧 Frame 发送；
- 高频方向输入可以合并成最新意图；
- 确认、取消等离散输入必须保持顺序；
- 数据通道仍连接不代表该 Frame 有输入权；
- Activation 匹配也不代表该 Frame 有输入权。

## 7. 节点事件

节点 Renderer 产生事件时，渲染端附加完整来源：

```ts
interface NodeEventSource {
  readonly frameId: string;
  readonly activationId: string;
  readonly scopeId: string;
  readonly key: string;
}
```

第一阶段节点事件只允许发送给当前普通输入目标。暂停 Frame 的 Scope 可以继续显示，但默认不接受节点交互。

渲染端不把事件路由给程序主系统，也不让一个 Frame 的节点任意调用另一个 Frame。

## 8. 状态消息处理

### 8.1 验证顺序

状态消息必须按以下顺序验证：

```text
连接仍绑定该 frameId
→ Frame 尚未出栈
→ activationId 等于该 Frame 当前数据 Epoch
→ sequence 连续
→ State/Scope Revision 不倒退
→ Scope Tree Schema 有效
→ 提交 Store
→ 协调 DOM
```

不能因为 Frame 处于 `suspended` 就拒绝状态消息。

### 8.2 完整 Frame Snapshot

```text
验证 Frame、Activation 和 Sequence
→ 验证全部 Scope Tree
→ 原子替换该 Frame 的 Store
→ 计算需要创建、更新和删除的 Scope
→ 在一次渲染提交中协调 DOM
```

Snapshot 失败时保留旧 Frame State，并请求 Resync。

### 8.3 Scope Replace

```text
验证 Frame、Activation 和 Sequence
→ 验证 State/Scope Revision
→ 替换或删除单个 Scope
→ 只协调受影响 Scope
```

消息回调不得直接散布 DOM 操作。必须先提交 Store，再由协调阶段更新 DOM。

## 9. Sequence、Revision 和 Activation

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

Activation 规则：

```text
frame.suspended
    保留当前 activationId 作为后台数据 Epoch
    停止普通输入

frame.resumed(new activationId)
    新 Epoch 生效
    旧 Activation 的迟到状态、事件和输入全部丢弃

frame.popped
    该 Frame 所有 Epoch 失效
```

## 10. 后台状态

非栈顶 Frame 可以继续更新可恢复状态，例如：

- 资源预加载；
- 网络状态；
- 调试指标；
- 后台计算结果；
- 仍属于该 Frame 的世界状态。

渲染端只负责应用合法状态，不推断子系统为何在后台更新。

一次性 Event 需要更谨慎：

- 允许后台立即投递的 Event 应由事件类型或子系统契约明确；
- 可能干扰当前前台体验的 Event 可以延迟或取消；
- 可恢复内容必须使用 Scope；
- Frame 出栈后 Event 不得影响其他 Frame。

## 11. Frame 和 Scope 容器

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
- 只有 `inputTarget` Frame 接收普通输入；
- 非栈顶 Frame 可以继续更新合法后台状态；
- 子系统可以通过自己的 Scope 决定是否覆盖全部页面；
- 如需隐藏下层 Frame，应由主系统 Frame 描述显式给出，不由客户端猜测。

## 12. Scope Tree Reconciler

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

## 13. Custom Node Registry

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
- 节点事件只能发送给当前获授权的所属 Frame；
- 节点不得修改其他 Frame 容器。

## 14. 本地表现状态

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

## 15. 状态与 Event

Scope State：

- 可恢复；
- 可以合并为最新目标；
- 重连时通过 Snapshot 恢复；
- 可以由非栈顶 Frame 继续发布。

Event：

- 一次性；
- 通常有序；
- 不应替代对话文本、菜单状态等可恢复内容；
- 后台投递策略由事件类型或子系统契约定义；
- Frame 出栈后不得作用于其他 Frame。

## 16. 资源

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

## 17. 背压和渲染频率

- 同一 Frame/Scope 的未呈现状态可以合并为最新值；
- DOM 每个 `requestAnimationFrame` 最多协调一次；
- Event 队列必须有界且显式处理溢出；
- 大型资源内容使用独立通道；
- 程序主系统控制消息不得被 Scope 洪峰阻塞；
- 暂停 Frame 的后台更新同样受限速和合并策略约束。

## 18. 故障恢复

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
→ 重建每个有效 Frame 的连接
→ 获取每个 Frame state.snapshot
→ 重建 Store 和 DOM
```

恢复过程中必须处理竞态：

- Snapshot 中存在的 Frame 可能在建连时已经出栈；
- 旧连接返回的消息不能进入新连接 Epoch；
- 新 `stackRevision` 到达时应放弃过时的恢复计划。

### 非法 Scope Tree

```text
拒绝新状态
→ 保留旧状态
→ 记录诊断
→ 请求该 Frame Resync
```

## 19. 第一阶段验收

至少验证：

- 初始地图 Frame 的 `world` 和 `hud`；
- 子 Frame 入栈后下层 Scope 保留显示；
- 普通输入只发送给栈顶；
- 下层 Frame 进程和数据通道不因入栈自动关闭；
- 下层 Frame 可以继续发布合法后台 Scope；
- 在途普通输入在 Frame 失去输入权后被拒绝；
- 调用者恢复后使用新 Activation；
- 新 Activation 生效后旧状态和输入被拒绝；
- 子 Frame 出栈后全部 Scope 自动删除；
- 单 Scope Replace 不重建其他 Scope；
- 渲染端重载后从 Stack + Frame Snapshot 恢复。

## 20. 当前结论

```text
程序主系统
→ 提供调用栈、Frame 控制状态和普通输入目标

每个模块子系统
→ 直接提供所属 Frame 的 Scope State
→ 可以在非栈顶期间继续后台运行和状态发布

Web 渲染端
→ 按 Frame/Scope 存储
→ 按 Key 协调 DOM
→ 只把普通输入发送给当前 inputTarget
```

渲染端是多子系统 Client State 的组合器，但不是调用栈、业务规则或子系统执行策略的权威。
