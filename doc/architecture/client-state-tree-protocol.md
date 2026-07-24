# Client Scoped State Tree 协议

## 1. 文档目的

本文档定义 LoomRealm Runtime Server 向 Web Client 同步客户端可见状态时使用的通用数据格式。

该协议不围绕地图、人物、菜单、对话框或加载界面分别定义固定 DTO。业务功能通过 Scope、节点 Tag 和节点 Data Schema 扩展，基础同步协议保持稳定。

核心原则：

> 客户端状态由多个 Scope 组成；每个 Scope 包含一组有序根节点；每个节点对应一个 DOM 节点，并通过 `tag` 选择客户端注册的自定义节点实现。

## 2. 状态层次

```text
Runtime 权威状态
        ↓ 业务投影
Client Scoped State Tree
        ↓ 客户端协调与节点复用
DOM Tree
```

Runtime Core 的内部对象不得直接序列化给客户端。

业务投影器只负责把权威状态转换成客户端树。客户端只解释 Scope、节点结构和已注册 Tag，不理解 FSDB、Repository、碰撞索引或游戏包物理路径。

## 3. 基础类型

```ts
type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

interface ClientState {
  readonly version: 1;
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

第一阶段冻结字段名称：

```text
ClientState
├── version
├── revision
└── scopes

ClientScope
├── revision
└── roots

ClientNode
├── key
├── tag
├── data
└── children
```

## 4. Scope

Scope 是客户端状态的功能隔离、更新和挂载单位。

```text
Client State
└── Scopes
    ├── Scope A
    │   └── Roots[]
    └── Scope B
        └── Roots[]
```

协议不预定义 Scope 名称枚举。业务可以注册例如：

```text
world
hud
overlay
menu
dialog
debug
```

这些名称只是示例，不属于协议固定字段。

### 4.1 Scope 挂载

每个 Scope 在客户端对应一个挂载容器：

```html
<div data-lr-scope="world"></div>
<div data-lr-scope="overlay"></div>
```

挂载容器由客户端应用拥有，不属于同步树节点。

### 4.2 `roots`

一个 Scope 可以直接包含多个顶层节点：

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

对应 DOM：

```html
<div data-lr-scope="world">
  <lr-map></lr-map>
  <lr-actor-layer></lr-actor-layer>
</div>
```

规则：

- `roots` 的数组顺序就是 Scope 容器内的 DOM 顺序；
- `roots` 可以为空数组；
- 协议不要求创建没有业务含义的虚拟根节点；
- 根节点和后代节点遵守相同的 Key、Tag、Data 和 Children 规则。

### 4.3 空 Scope 与删除 Scope

空 Scope：

```json
{
  "revision": 13,
  "roots": []
}
```

表示 Scope 仍然存在，但没有 DOM 子节点。

删除 Scope 使用同步消息中的 `value: null`，表示客户端应移除该 Scope 的状态和所有节点。

## 5. 节点身份 `key`

`key` 是节点在一个 Scope 内的稳定身份。

规则：

- `key` 在整个 Scope 内唯一，不仅要求同级唯一；
- 根节点与所有后代共享同一个 Key 命名空间；
- 节点业务身份未改变时，Key 必须保持稳定；
- 节点位置、坐标或显示数据变化时，不应因此改变 Key；
- Key 不等同于 DOM `id`；
- 客户端内部使用 `scope + key` 定位元素。

正确示例：

```text
world:actor/player
world:tile-layer/ground
hud:player-status
```

不应将变化数据编码进 Key：

```text
player-12-8
player-13-8
```

客户端依据稳定 Key 复用对应 DOM Element。

## 6. 节点类型 `tag`

`tag` 表示客户端已经注册的可信节点类型。

```ts
renderer.register("lr-map", MapNodeRenderer);
renderer.register("lr-actor", ActorNodeRenderer);
renderer.register("lr-loading", LoadingNodeRenderer);
```

也可以直接使用 Web Component：

```ts
customElements.define("lr-actor", LoomActorElement);
```

规则：

- `tag` 不允许任意创建原生 HTML 标签；
- 客户端只接受注册表中的 Tag；
- 未注册 Tag 必须产生协议或渲染诊断；
- Tag 决定对应 Data Schema 和节点实现；
- Server 不通过 Tag 或 Data 下发可执行 JavaScript。

协议层只规定 `tag` 是字符串，不规定具体业务 Tag 列表。

## 7. 节点数据 `data`

`data` 是交给对应自定义节点实现的 JSON 数据。

```text
tag
→ 对应客户端节点实现
→ 对应 Data Schema
```

例如业务代码可以定义：

```ts
interface ClientNodeDataRegistry {
  "lr-map": MapNodeData;
  "lr-actor": ActorNodeData;
  "lr-loading": LoadingNodeData;
}
```

这些 Schema 属于具体 Tag，不属于基础状态协议。

`data` 中可以保存逻辑资源 Key，但不得暴露游戏包文件路径：

```json
{
  "sprite": "actor.sprite/player"
}
```

不得发送：

```json
{
  "path": "/home/user/game/data/player.png"
}
```

## 8. 子节点 `children`

树关系必须由协议级 `children` 字段表达，不能隐藏在 `data` 中。

规则：

- `children` 数组顺序对应直接子 DOM Element 顺序；
- 每个 Child Node 对应一个直接子 Element；
- 客户端通过 Key 复用、移动、创建或销毁节点；
- 节点实现不得任意修改父节点或兄弟节点；
- 复杂组件内部可以使用 Shadow DOM，但协议只管理外部自定义元素。

## 9. 节点与 DOM 的映射

第一阶段冻结：

1. 每个 `ClientNode` 对应一个 DOM `Element`；
2. `tag` 决定 Element 类型或节点渲染器；
3. `key` 决定 Element 身份和复用；
4. `data` 更新 Element 自身状态；
5. `children` 决定其直接子 Element；
6. `roots` 决定 Scope 容器的直接子 Element；
7. 节点销毁时必须清理事件监听、动画和本地资源引用。

客户端可以使用以下最小接口：

```ts
interface ClientNodeRenderer {
  create(node: ClientNode): Element;

  update(
    element: Element,
    previous: ClientNode,
    next: ClientNode,
  ): void;

  destroy?(
    element: Element,
    node: ClientNode,
  ): void;
}
```

## 10. 第一阶段状态消息

第一阶段只实现完整状态和 Scope 替换，不实现节点级 Patch。

### 10.1 完整状态

```ts
interface ClientStateSnapshotMessage {
  readonly type: "state.snapshot";
  readonly state: ClientState;
}
```

适用于：

- 首次连接；
- 客户端重新加载；
- 重新连接；
- 检测到状态版本缺口；
- 客户端请求完整恢复。

### 10.2 替换 Scope

```ts
interface ClientScopeReplaceMessage {
  readonly type: "scope.replace";
  readonly stateRevision: number;
  readonly scope: string;
  readonly value: ClientScope | null;
}
```

语义：

- `value` 为 ClientScope：替换该 Scope 的目标树；
- `value` 为 `null`：删除整个 Scope；
- 客户端可以通过 Key 对新旧 Scope Tree 做 DOM 协调；
- 替换 Scope 不要求销毁所有未变化节点。

第一阶段不定义：

- JSON Patch；
- Node Patch；
- ECS Component Replication；
- 服务端下发 DOM 操作指令；
- 任意 HTML 字符串同步。

## 11. 版本规则

```text
ClientState.revision
    整个客户端状态的版本

ClientScope.revision
    单个 Scope 目标树的版本
```

规则：

- Client State 发生客户端可见变化时递增 `ClientState.revision`；
- Scope 被替换时递增该 Scope 的 `revision`；
- 客户端不得用较旧 Scope Revision 覆盖较新 Scope；
- 无法确认版本连续性时请求 `state.snapshot`；
- 具体传输 Envelope 和消息 Sequence 由 Runtime RPC 文档定义。

## 12. 客户端事件

节点产生的业务事件可以使用 Scope 与 Key 定位来源：

```ts
interface ClientNodeEvent {
  readonly type: "node.event";
  readonly scope: string;
  readonly key: string;
  readonly event: string;
  readonly data?: JsonValue;
}
```

例如：

```json
{
  "type": "node.event",
  "scope": "menu",
  "key": "continue-button",
  "event": "activate",
  "data": null
}
```

事件名称和 Data Schema 由对应业务节点定义。

键盘方向输入等高频全局意图可以使用独立输入事件，不强制伪装为 DOM 节点事件。

## 13. Runtime 投影边界

Runtime Core 不直接持有 Client Tree，也不让客户端树成为权威游戏状态。

推荐关系：

```text
Runtime Core
    权威状态和规则
        ↓
Client State Projectors
    按业务生成或更新 Scope Tree
        ↓
Runtime Service
    发送状态消息
        ↓
Web Client
    协调 DOM Tree
```

一个业务模块可以拥有一个或多个 Scope Projector。增加新的功能通常只需要：

1. 注册新的 Scope 或复用已有 Scope；
2. 注册新的节点 Tag；
3. 定义该 Tag 的 Data Schema；
4. 实现对应客户端自定义节点；
5. 将业务状态投影成 Client Node Tree。

不需要修改基础同步协议。

## 14. 安全和限制

客户端必须验证：

- 协议版本；
- Scope 名称长度和格式；
- Scope Revision；
- 一个 Scope 内 Key 唯一；
- Key 和 Tag 长度；
- Tag 已注册；
- 树最大深度；
- Scope 最大节点数；
- 单节点 Data 大小；
- 整个状态消息大小；
- Data 只包含合法 JSON 值。

客户端不得：

- 执行 Data 中的字符串；
- 将未净化字符串直接设置为 HTML；
- 接受 `script`、`iframe` 等未注册标签；
- 允许节点实现逃逸并任意改写其他 Scope；
- 根据 Server 提供的文件路径读取本地文件。

## 15. 第一阶段已冻结决策

| 问题 | 第一阶段结论 |
|---|---|
| 状态顶层 | `ClientState` |
| 功能隔离 | `scopes` |
| Scope 内容 | 有序 `roots[]` |
| 单根限制 | 不限制，可有多个根节点 |
| 节点字段 | `key/tag/data/children` |
| Key 唯一范围 | 整个 Scope |
| Tag | 客户端注册的自定义节点类型 |
| Data | JSON 值，由 Tag 定义 Schema |
| DOM 映射 | 一个 ClientNode 对应一个 Element |
| Scope 容器 | 客户端拥有，不属于同步树 |
| 初始同步 | `state.snapshot` |
| 正常更新 | `scope.replace` |
| 空 Scope | `roots: []` |
| 删除 Scope | `value: null` |
| 节点级 Patch | 第一阶段不实现 |
| 固定 RPG DTO | 不定义 |
| Runtime 内部状态直传 | 禁止 |
| 资源引用 | 逻辑资源 Key |

## 16. 当前结论

```text
Client State
└── Scopes
    └── Scope
        └── Roots[]
            └── Node
                ├── key
                ├── tag
                ├── data
                └── children[]
```

该格式是 Runtime Server 与 Web Client 之间的通用客户端状态契约。业务功能通过 Scope、Tag 和 Data Schema 扩展，不通过修改基础协议增加固定业务字段。