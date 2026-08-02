# 程序主系统与模块子系统架构

> 状态：**Active Design**  
> 适用范围：LoomRealm 通用运行架构  
> 最近复核：2026-07-28  
> 主要定义：程序主系统、子系统调用栈、前台控制权、后台执行、调用参数与返回结果、控制面与数据面

相关文档：

- [`system-overview.md`](./system-overview.md)：总体架构入口；
- [`runtime-rpc-and-state-sync.md`](./runtime-rpc-and-state-sync.md)：JSON-RPC 方法、消息顺序和连接恢复；
- [`client-state-tree-protocol.md`](./client-state-tree-protocol.md)：Scope 与 Client Node 数据结构；
- [`../contracts/game-package-v1.md`](../contracts/game-package-v1.md)：游戏包入口文件；
- [`../design/web-client-reconciliation.md`](../design/web-client-reconciliation.md)：渲染端 Store、输入路由与 DOM 协调。

核心模型：

> LoomRealm 由一个程序主系统和若干模块子系统组成。程序主系统维护子系统调用栈；入口文件指定初始子系统；子系统可以携带参数调用另一个子系统入栈，也可以出栈并向调用者返回结果。调用栈只决定前台控制关系、普通输入目标和普通 `call` / `return` 权限，不等同于暂停、挂起或终止子系统进程。非栈顶子系统可以继续运行后台任务，并在协议允许时继续发布自己 Frame 的状态。

## 1. 两类程序单元

### 1.1 程序主系统

程序主系统负责：

- 读取游戏包和入口文件；
- 解析初始子系统；
- 启动、连接、监督和关闭子系统进程；
- 维护唯一的前台子系统调用栈；
- 执行 `call`、`return`、前台失活和恢复；
- 将调用参数交给被调用子系统；
- 将返回结果交回调用者；
- 建立子系统与渲染端之间的数据通道；
- 处理子系统异常退出和栈恢复；
- 向渲染端发布当前栈和普通输入目标。

程序主系统不负责：

- 地图移动、菜单导航、对话推进等业务规则；
- 子系统内部权威状态；
- 子系统 Scope 的内容生成；
- DOM、CSS、动画和资源解码；
- 转发每一条普通用户输入或 Scope 更新；
- 决定所有子系统后台任务是否继续运行。

### 1.2 模块子系统

模块子系统是独立进程。每个子系统调用实例对应一个 Frame。子系统负责：

- 接收一次调用的输入参数；
- 维护本次调用对应的内部状态；
- 在拥有普通输入权时直接接收渲染端输入；
- 生成并发布自己拥有的 Scope；
- 产生一次性客户端事件；
- 通过程序主系统继续调用其他子系统；
- 完成、取消或失败时返回结果并出栈；
- 自行定义失去前台控制后的执行策略。

子系统可以使用不同语言和运行时。正式扩展边界是 JSON-RPC 协议，不是 TypeScript Module、Node ABI 或 npm 包接口。

## 2. 入口与启动

游戏包根目录包含入口文件。第一阶段标准入口文件为 `realm.entry.json`：

```json
{
  "format": "loom-realm-entry",
  "formatVersion": 1,
  "system": "loom.map",
  "params": {
    "mapId": "map.definition/lappet-town",
    "playerActorId": "actor.definition/player"
  }
}
```

程序主系统启动流程：

```text
loom-realm start ./game
→ 打开并校验游戏包
→ 读取 realm.entry.json
→ 解析 system 与 params
→ 解析子系统实现
→ 创建初始调用帧
→ 启动并初始化子系统
→ 将初始调用帧压栈
→ 建立子系统与渲染端的数据通道
→ 将初始 Frame 设为前台控制 Frame
```

程序主系统只验证入口文件的公共结构。`params` 的业务 Schema 由目标子系统定义和验证。

## 3. 调用栈

程序主系统维护一个后进先出的前台调用栈：

```ts
interface SystemFrame {
  readonly frameId: string;
  readonly activationId: string;
  readonly systemId: string;
  readonly callerFrameId: string | null;
  readonly state: "starting" | "active" | "suspended" | "closing";
}
```

`state` 的平台语义：

```text
starting
    子系统正在初始化，尚未获得普通输入权

active
    当前前台控制 Frame，默认拥有普通输入权和普通 call / return 权限

suspended
    Frame 被更高层调用覆盖，失去普通输入权和普通 call / return 权限；
    不表示进程、事件循环、I/O、定时器或后台任务被操作系统暂停

closing
    Frame 正在退出，不能再接受新的普通业务操作
```

规则：

1. 初始子系统是栈底帧；
2. 只有当前栈顶帧可以发起普通 `system.call` 或 `system.return`；
3. 调用新子系统时，当前栈顶失去前台控制，新帧压栈并成为前台控制 Frame；
4. 子系统返回时，只能弹出当前栈顶帧；
5. 弹栈后恢复上一帧，并把结果发送给它；
6. 默认只有栈顶帧拥有普通用户输入权；
7. 下层帧的 Scope 可以继续保留显示，直到其自身出栈；
8. 下层帧可以继续执行后台任务，是否暂停业务 Tick 由该子系统自行决定；
9. 栈只表达前台调用关系，不保存子系统内部业务状态；
10. 非栈顶帧不能因为后台事件绕过栈顶规则发起普通 `system.call`。

示例：

```text
启动                   [map]
map 调用 menu          [map, menu]
menu 调用 dialog       [map, menu, dialog]
dialog 返回            [map, menu]
menu 返回              [map]
```

上例只描述前台控制权。`map` 和 `menu` 的进程是否继续执行后台工作，由各自子系统契约决定。

## 4. 前台控制与后台执行

必须区分三类状态：

```text
进程状态
    starting / running / exited

Frame 控制状态
    starting / active / suspended / closing

子系统业务状态
    由具体子系统定义
```

调用栈跳转只直接改变 Frame 控制状态。

`system.suspend` 的通用含义是：

- 撤销当前 Frame 的普通输入资格；
- 撤销当前 Frame 的普通 `system.call` / `system.return` 资格；
- 通知子系统它已不再是前台控制 Frame；
- 保留 Frame、子系统进程和数据通道，除非发生关闭或故障；
- 不要求暂停进程、线程、事件循环、I/O、定时器或所有内部任务。

子系统可以选择：

- 继续全部后台工作；
- 继续 I/O、缓存和预加载，但停止业务 Tick；
- 降低更新频率；
- 只维护可恢复状态；
- 根据自己的业务契约暂停部分内部状态机。

例如第一阶段 `loom.map` 可以在失去前台控制时停止人物移动 Tick，但这是地图子系统策略，不是程序主系统对所有子系统的固定要求。

## 5. 子系统调用

子系统通过程序主系统发起 JSON-RPC 请求：

```json
{
  "jsonrpc": "2.0",
  "id": "request-42",
  "method": "system.call",
  "params": {
    "callerFrameId": "frame-map-1",
    "system": "loom.dialog",
    "input": {
      "dialogId": "dialog/old-man",
      "entryNodeId": "start"
    }
  }
}
```

程序主系统执行：

```text
验证 callerFrameId 是当前栈顶
→ 解析目标 system
→ 启动或连接目标子系统进程
→ 创建新 frameId
→ 初始化目标子系统并传入 input
→ 等待 ready
→ 将调用者标记为 suspended
→ 压栈并激活目标帧
→ 建立目标帧与渲染端通道
→ 更新渲染端的栈和普通输入目标
→ 返回 call 已建立
```

调用者进入 `suspended` 后仍然可以继续后台执行，但不能发起普通嵌套调用或接收普通输入。

`system.call` 的 JSON-RPC 响应只表示调用是否成功建立。子系统的最终业务结果通过后续恢复消息交回调用者。

## 6. 子系统返回

统一返回类型：

```ts
type SystemResult<T> =
  | { readonly status: "completed"; readonly value: T }
  | { readonly status: "cancelled" }
  | {
      readonly status: "failed";
      readonly error: {
        readonly code: string;
        readonly message: string;
        readonly data?: unknown;
      };
    };
```

栈顶子系统结束时发送：

```json
{
  "jsonrpc": "2.0",
  "method": "system.return",
  "params": {
    "frameId": "frame-dialog-3",
    "result": {
      "status": "completed",
      "value": {
        "choiceId": "accept"
      }
    }
  }
}
```

程序主系统执行：

```text
验证 frameId 是当前栈顶
→ 将帧标记为 closing
→ 通知渲染端移除该帧拥有的 Scope
→ 关闭或回收子系统调用实例
→ 弹栈
→ 为上一帧签发新的 activationId
→ 恢复上一帧的前台控制权
→ 发送 system.resume(result)
→ 更新渲染端普通输入目标
```

## 7. Activation ID

`frameId` 标识一次调用帧，`activationId` 标识该 Frame 的一次前台控制周期和相应数据 Epoch。

规则：

- Frame 首次获得前台控制时签发 `activationId`；
- Frame 被更高层调用覆盖时，当前 `activationId` 不立即因为 `suspended` 而失效；
- 在 `suspended` 期间，子系统可以使用该 `activationId` 继续发布允许的后台 Scope 状态；
- 普通输入还必须同时满足“该 Frame 是当前输入目标”，因此不能仅凭匹配的 `activationId` 向暂停 Frame 输入；
- Frame 恢复前台控制时签发新的 `activationId`；
- 新 `activationId` 生效后，旧 Activation 的迟到输入、状态和事件必须拒绝；
- Frame 关闭后，该 Frame 的所有 Activation 均失效。

```text
Frame 被覆盖
→ 停止普通输入
→ 保留当前数据 Epoch 供后台状态发布

Frame 恢复
→ 签发新 activationId
→ 旧 Epoch 消息失效
```

`activationId` 不是进程实例 ID、后台任务 ID 或连接 ID。跨 Activation 存活的后台任务必须使用自己的任务身份和取消机制。

## 8. 通信拓扑

通信分为控制面和数据面。

### 8.1 控制面

```text
程序主系统 ⇄ 子系统
```

承载：

- 初始化、前台失活、恢复和关闭；
- `system.call`；
- `system.return`；
- ready、heartbeat 和 failure。

```text
程序主系统 ⇄ 渲染端
```

承载：

- `stack.snapshot`；
- `frame.pushed`；
- `frame.suspended`；
- `frame.resumed`；
- `frame.popped`；
- `input.target.changed`；
- 子系统连接端口的建立和撤销。

### 8.2 数据面

```text
渲染端 ⇄ 有效子系统 Frame
```

承载：

- 普通用户输入；
- 节点事件；
- Scope Snapshot / Replace / Remove；
- 一次性客户端事件；
- Scope Resync。

程序主系统不转发普通数据面消息。

非栈顶 Frame 的数据通道默认可以保持连接。是否允许其发布后台 Scope 或 Event，由公共协议和具体子系统契约共同决定；普通输入默认只发送给栈顶 Frame。

## 9. 子系统与渲染端

普通用户输入由渲染端直接发送给当前输入目标：

```json
{
  "jsonrpc": "2.0",
  "method": "input.dispatch",
  "params": {
    "frameId": "frame-map-1",
    "activationId": "activation-8",
    "sequence": 132,
    "input": {
      "type": "direction.set",
      "data": "up"
    }
  }
}
```

输入授权必须同时满足：

```text
frameId 是程序主系统声明的当前 inputTarget
+ activationId 匹配 inputTarget
+ 消息顺序有效
+ 输入 Schema 有效
```

子系统可以直接发布自己的 Scope：

```json
{
  "jsonrpc": "2.0",
  "method": "scope.replace",
  "params": {
    "frameId": "frame-map-1",
    "activationId": "activation-8",
    "scopeId": "world",
    "scopeRevision": 41,
    "value": {
      "roots": []
    }
  }
}
```

渲染端的 Scope 身份是：

```text
frameId + scopeId
```

不同调用帧可以使用相同的局部 Scope 名称而不会冲突。

## 10. Scope 生命周期

1. 子系统只能更新自己当前调用帧拥有的 Scope；
2. Scope 可以在 Frame 失去前台控制期间继续显示；
3. 非输入目标 Frame 不得接收普通用户输入；
4. 非栈顶 Frame 可以继续发布后台状态，但必须使用仍有效的 Frame、数据通道和 Activation；
5. Frame 获得新 `activationId` 后，旧 Activation 的迟到状态必须忽略；
6. 子系统出栈时，渲染端删除该 `frameId` 拥有的全部 Scope；
7. Scope 内容由子系统决定，程序主系统不理解 Tag、Data 或 DOM；
8. Scope Tree 协议不允许下发任意 HTML、CSS 或可执行代码。

## 11. 子系统内部实现

本架构不规定子系统内部必须使用何种结构。

例如初始 `loom.map` 子系统可以内部使用：

```text
内容 Repository
→ Session Coordinator
→ Runtime Execution Loop
→ Runtime Core
→ Client State Projector
```

这些是地图子系统的内部实现，不是程序主系统的固定模块，也不约束其他子系统。

## 12. 进程与实例

第一阶段允许一种简单实现：每个调用帧启动一个子系统进程。

后续可以在协议不变的前提下优化为：

- 一个进程承载多个同类调用帧；
- 空闲进程池；
- 本地或远程子系统；
- 不同语言实现同一 `system` ID；
- 根据配置选择系统 Provider。

无论如何优化：

- 所有消息都必须绑定 `frameId`；
- 不能依赖进程 ID 表示调用身份；
- Frame 进入 `suspended` 不要求暂停对应进程；
- 进程可以承载跨多个 Activation 存活的后台任务；
- Frame 关闭时必须明确取消或转移仍属于该 Frame 的后台任务。

## 13. 故障处理

- 子系统初始化失败：调用不入栈，错误返回调用者；
- 栈顶子系统异常退出：主系统生成 `failed` 结果，弹栈并恢复调用者；
- 初始子系统异常退出：整个程序会话失败；
- 非栈顶子系统异常退出：会话失败，因为前台调用链已经损坏；
- 后台任务失败：由所属子系统决定是否降级、报告 Event 或升级为 `system.failed`；
- 渲染端重连：主系统发送完整栈快照，各有效子系统重新发送 Scope Snapshot；
- JSON-RPC 消息 Schema、大小和方法权限必须校验。

## 14. 第一阶段冻结决策

| 主题 | 结论 |
|---|---|
| 顶层结构 | 程序主系统 + 模块子系统 |
| 扩展边界 | 独立进程与 JSON-RPC |
| 控制结构 | 主系统维护单一前台调用栈 |
| 初始系统 | 由 `realm.entry.json` 定义 |
| 子系统调用 | `system.call(system, input)` |
| 子系统返回 | `system.return(result)` |
| 普通输入 | 渲染端直达当前输入目标 |
| Scope 更新 | 子系统直达渲染端 |
| Scope 身份 | `frameId + scopeId` |
| Activation | 前台控制周期与数据 Epoch |
| 栈失活语义 | 撤销前台控制，不等于暂停进程 |
| 后台执行 | 由子系统契约决定 |
| 子系统内部结构 | 不由平台协议规定 |
| 进程间协议 | JSON-RPC 2.0 |

## 15. 当前结论

```text
入口文件
→ 程序主系统创建初始调用帧
→ 初始子系统入栈并获得前台控制
→ 子系统直接处理输入并发布 Scope
→ 子系统可以调用另一子系统入栈
→ 调用者失去前台控制，但进程可继续后台运行
→ 被调用子系统出栈并返回结果
→ 调用者获得新 activationId 并恢复前台控制
```

程序主系统只管理前台调用关系、Frame 生命周期、普通输入目标和进程监督；模块子系统管理自身业务状态、后台执行策略和客户端 Scope；渲染端直接与有效子系统交换输入和视图状态。
