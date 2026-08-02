# Client Scoped State Tree 协议

> 状态：**Active / Normative**  
> 适用范围：所有模块子系统与 Web 渲染端  
> 最近复核：2026-07-28  
> 主要定义：Frame Client State、Scope、Roots、Client Node、身份、Activation 数据 Epoch 和事件定位

相关文档：

- [`main-system-and-subsystems.md`](./main-system-and-subsystems.md)：Frame、前台控制和子系统边界；
- [`runtime-rpc-and-state-sync.md`](./runtime-rpc-and-state-sync.md)：状态消息、输入授权和恢复；
- [`client-state-projector.md`](./client-state-projector.md)：子系统投影；
- [`../design/web-client-reconciliation.md`](../design/web-client-reconciliation.md)：DOM 协调。

核心原则：

> 每个模块子系统调用帧拥有一组 Scope；Scope 包含有序根节点；每个 Client Node 对应一个 DOM Element。客户端状态只描述应该呈现什么，不包含子系统内部状态或 DOM 指令。Frame 失去前台控制后，其 Scope 可以继续显示和更新；普通输入权由程序主系统的 `inputTarget` 单独决定。

## 1. 状态层次

```text
子系统权威状态
        ↓ 子系统投影
Frame Client State
        ↓ Scope Tree 协调
DOM Tree
```

程序主系统不生成业务 Scope。每个模块子系统只生成自己当前 `frameId` 的 Client State。

调用栈状态和 Client State 是两个不同维度：

```text
Frame Control State
    active / suspended / closing

Frame Client State
    revision + scopes
```

`Frame Control State: suspended` 不表示 Frame Client State 冻结，也不表示子系统进程停止。

## 2. 基础类型

```ts
type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

interface FrameClientState {
  readonly version: 1;
  readonly frameId: string;
  readonly activationId: string;
  readonly revision: number;
  readonly scopes: Readonly<Record<string, ClientScope>>;
}

interface ClientScope {
  readonly revision: number;
  readonly roots: readonly ClientNode[];
}

interface ClientNode {
  readonly key: string;
  readonly tag: string;
  readonly data: JsonValue;
  readonly children: readonly ClientNode[];
}
```

字段名称在第一阶段冻结。

## 3. Frame 所有权和 Activation

完整 Scope 身份是：

```text
frameId + scopeId
```

规则：

- 同一 Frame 内 `scopeId` 唯一；
- 不同 Frame 可以使用相同 `scopeId`；
- 子系统只能发布自己 Frame 的 Scope；
- Frame 出栈时，其全部 Scope 一并删除；
- Frame 失去前台控制时 Scope 可以保留显示和继续更新；
- `activationId` 标识该 Frame 当前的数据 Epoch；
- Frame 进入 `suspended` 时，当前 `activationId` 不立即失效；
- Frame 恢复前台控制并获得新 `activationId` 后，旧 Epoch 的迟到状态必须拒绝；
- Frame 关闭后，该 Frame 的所有 Activation 均失效。

渲染端 Store 可以表示为：

```ts
interface ClientFrameStore {
  readonly frames: ReadonlyMap<string, FrameClientState>;
}
```

### 3.1 状态资格与输入资格

必须区分：

```text
状态消息资格
    Frame 存在
    + 数据通道有效
    + activationId 是该 Frame 当前数据 Epoch
    + Sequence / Revision 有效

普通输入资格
    状态消息资格
    + frameId / activationId 等于 Main 当前 inputTarget
```

因此：

- 暂停 Frame 可以继续发布合法后台状态；
- 暂停 Frame 默认不能接收普通输入或节点事件；
- 匹配 `activationId` 不等于拥有输入权；
- Renderer 不得根据 Scope 是否变化推断输入目标。

## 4. Scope

Scope 是客户端状态的功能隔离、更新和挂载单位。

协议不预定义 Scope 枚举。示例：

```text
world
hud
menu
dialog
overlay
debug
```

这些名称只在所属 Frame 内有意义。

### 4.1 挂载

渲染端根据 Frame 层级和 Scope Registry 决定挂载容器。概念结构：

```html
<div data-lr-frame="frame-map-1">
  <div data-lr-scope="world"></div>
  <div data-lr-scope="hud"></div>
</div>
<div data-lr-frame="frame-dialog-3">
  <div data-lr-scope="dialog"></div>
</div>
```

挂载容器由渲染端拥有，不属于同步树节点。

### 4.2 `roots`

一个 Scope 可以包含多个有序根节点：

```json
{
  "revision": 12,
  "roots": [
    {
      "key": "map",
      "tag": "lr-map",
      "data": {},
      "children": []
    },
    {
      "key": "actors",
      "tag": "lr-actor-layer",
      "data": {},
      "children": []
    }
  ]
}
```

规则：

- 数组顺序就是容器内 DOM 顺序；
- `roots` 可以为空；
- 不要求创建无业务含义的虚拟根；
- 根节点和后代节点遵守相同规则。

### 4.3 空 Scope 与删除 Scope

空 Scope：

```json
{
  "revision": 13,
  "roots": []
}
```

表示 Scope 仍存在但没有节点。

删除 Scope 使用 `scope.replace` 的 `value: null`。

## 5. 节点身份 `key`

`key` 是节点在一个 Scope 内的稳定身份。

规则：

- `key` 在整个 Scope 内唯一，不只要求同级唯一；
- 节点业务身份不变时，Key 必须稳定；
- 位置、坐标、数量或样式变化不应改变 Key；
- Key 不等于 DOM `id`；
- 渲染端使用 `frameId + scopeId + key` 定位 Element。

正确示例：

```text
actor/player
tile-layer/ground
menu/continue-button
```

不应把变化数据编码进 Key：

```text
player-12-8
player-13-8
```

## 6. 节点类型 `tag`

`tag` 表示渲染端注册的可信节点类型：

```ts
renderer.register("lr-map", MapNodeRenderer);
renderer.register("lr-actor", ActorNodeRenderer);
renderer.register("lr-dialog", DialogNodeRenderer);
```

规则：

- 渲染端只接受注册表中的 Tag；
- Tag 决定对应 Renderer 和 Data Schema；
- 未注册 Tag 产生渲染诊断；
- Tag 不用于下发任意 HTML 标签；
- 子系统不能通过 Tag 或 Data 下发 JavaScript。

不同子系统可以使用不同 Tag Registry，但最终渲染端必须安装相应可信实现。

## 7. 节点数据 `data`

`data` 是交给对应节点实现的 JSON 数据。

```ts
interface ClientNodeDataRegistry {
  "lr-map": MapNodeData;
  "lr-actor": ActorNodeData;
  "lr-dialog": DialogNodeData;
}
```

规则：

- Data 必须满足 Tag 对应 Schema；
- Data 应声明目标状态，不应描述 DOM 操作步骤；
- Data 可以携带逻辑资源 Key；
- Data 不得暴露游戏包物理路径、文件句柄或可执行代码。

正确：

```json
{
  "sprite": "actor.sprite/player"
}
```

错误：

```json
{
  "path": "/home/user/game/player.png",
  "script": "..."
}
```

## 8. 子节点 `children`

树关系必须由 `children` 表达，不能隐藏在 `data` 中。

规则：

- 数组顺序对应直接子 Element 顺序；
- 每个 Child Node 对应一个直接子 Element；
- 渲染端通过 Key 复用、移动、创建或销毁节点；
- 节点实现不得任意修改父节点或兄弟节点；
- 复杂组件可以使用 Shadow DOM，但协议只管理外部节点边界。

## 9. DOM 映射

第一阶段冻结：

1. 每个 Client Node 对应一个 DOM Element；
2. `tag` 决定 Element 类型或 Renderer；
3. `key` 决定身份和复用；
4. `data` 更新节点自身状态；
5. `children` 决定直接子 Element；
6. `roots` 决定 Scope 容器的直接子 Element；
7. 节点销毁时清理事件、动画和资源引用。

最小 Renderer：

```ts
interface ClientNodeRenderer {
  create(node: ClientNode): Element;

  update(
    element: Element,
    previous: ClientNode,
    next: ClientNode,
  ): void;

  destroy?(element: Element, node: ClientNode): void;
}
```

## 10. 状态消息

### 10.1 Frame 完整状态

```ts
interface FrameStateSnapshotMessage {
  readonly frameId: string;
  readonly activationId: string;
  readonly sequence: number;
  readonly state: FrameClientState;
}
```

用于：

- Frame 首次激活；
- 渲染端重新连接；
- Sequence 缺口；
- 客户端验证失败；
- 多 Scope 同时变化；
- 主动 Resync；
- Activation 恢复后需要重新建立完整状态时。

Snapshot 必须原子替换该 Frame 的 Scope 集合。

### 10.2 Scope 替换

```ts
interface ClientScopeReplaceMessage {
  readonly frameId: string;
  readonly activationId: string;
  readonly sequence: number;
  readonly stateRevision: number;
  readonly scopeId: string;
  readonly value: ClientScope | null;
}
```

规则：

- `value` 为 ClientScope：替换该 Frame 的目标 Scope；
- `value` 为 `null`：删除该 Scope；
- 单 Scope 替换不要求重建其他 Scope；
- 第一阶段不定义节点级 Patch 或多 Scope Batch Patch；
- Frame 处于 `suspended` 不构成拒绝 Replace 的理由；
- 新 Activation 生效后，旧 Activation 的 Replace 必须拒绝。

## 11. 版本和顺序规则

```text
FrameClientState.revision
    当前 Frame 全部 Client State 版本

ClientScope.revision
    单个 Scope 版本

sequence
    当前子系统数据连接上的消息顺序

activationId
    当前 Frame 数据 Epoch
```

规则：

- Frame 客户端可见状态变化时递增 State Revision；
- Scope 内容变化时递增 Scope Revision；
- 较旧 Revision 不得覆盖较新 Revision；
- 无法确认连续性时请求该 Frame 的完整状态；
- 不同 Frame 的 Revision 互相独立；
- 连接重建后 Sequence 可以重新开始；
- Frame `suspended` 时 Sequence 可以在原连接继续递增；
- Frame 恢复后可以使用新 Activation 继续原 Revision；
- 新 Activation 生效后，旧 Activation 消息无论 Sequence 多大都必须拒绝。

推荐校验顺序：

```text
连接属于 frameId
→ Frame 仍存在
→ Activation 是当前数据 Epoch
→ Sequence 连续
→ State/Scope Revision 不倒退
→ Tree Schema 有效
```

## 12. 客户端事件

节点事件定位来源：

```ts
interface ClientNodeEvent {
  readonly frameId: string;
  readonly activationId: string;
  readonly scopeId: string;
  readonly key: string;
  readonly event: string;
  readonly data?: JsonValue;
}
```

子系统必须验证：

- Frame 和 Activation 有效；
- Frame 是当前普通输入目标；
- Scope 存在；
- Key 存在；
- Tag 允许该事件；
- Data 满足事件 Schema。

键盘方向、手柄轴等高频意图可以使用独立 `input.dispatch`，不强制伪装为节点事件。

暂停 Frame 的 Scope 默认不可交互。未来如果支持并行输入，应另行定义输入路由和能力协议，不能只依赖 Activation。

## 13. 状态与一次性 Event

状态表示客户端现在应该呈现什么，可以合并为最新目标。

非栈顶 Frame 可以继续发布可恢复状态，例如：

- 后台加载进度；
- 网络状态；
- 调试指标；
- 后台计算结果。

Event 表示一次性发生的事情，例如：

- 音效触发；
- 短暂震动；
- Toast；
- 调试通知。

可恢复内容必须进入 Scope。

非栈顶 Frame 的 Event 投递策略由事件类型或子系统契约定义，可以立即投递、延迟、取消或转换为 Scope。Frame 被弹出后，其未处理 Event 不得改变其他 Frame 的状态。

## 14. 安全和限制

第一阶段至少限制：

- Frame Scope 数量；
- 单 Scope 节点数量；
- 树深度；
- Key、Tag 和 Scope ID 长度；
- Data JSON 大小；
- 单条消息大小；
- 未注册 Tag；
- 重复 Key；
- 循环或非法树结构；
- 非输入目标 Frame 的输入和节点事件；
- 子系统伪造其他 Frame 或 Activation。

不允许：

- 任意 HTML 字符串；
- DOM 操作指令；
- CSS 或 JavaScript 代码注入；
- 文件系统路径；
- 进程句柄或回调。

## 15. 第一阶段冻结结论

| 主题 | 结论 |
|---|---|
| Frame 所有权 | 每个子系统调用 Frame 拥有自己的 Scope |
| Scope 身份 | `frameId + scopeId` |
| Node 身份 | `frameId + scopeId + key` |
| Node 结构 | `key / tag / data / children` |
| DOM 映射 | 每个 Client Node 对应一个 DOM Element |
| 暂停 Frame | Scope 可以继续显示和更新 |
| 数据 Epoch | `activationId` 在 suspend 时保留，resume 时替换 |
| 普通输入 | 还必须匹配 Main 当前 `inputTarget` |
| 状态恢复 | Snapshot + Sequence + Revision |
| 安全边界 | 不允许任意 HTML、脚本或物理路径 |

## 16. 当前结论

```text
模块子系统 Frame
→ 生成 Frame Client State
→ 发布一个或多个 Scope
→ 渲染端按 frameId + scopeId 存储
→ 按稳定 Key 协调 DOM
→ 非栈顶期间可继续合法后台状态
→ 新 Activation 生效后拒绝旧 Epoch
→ Frame 出栈时整体清理
```

Scope 是视图扩展边界；Frame 是子系统调用实例和 Scope 所有权边界；Activation 是数据 Epoch；普通输入权由调用栈的 `inputTarget` 独立决定。
