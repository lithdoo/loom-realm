# 程序主系统与模块子系统架构

> 状态：**Active Design**  
> 适用范围：LoomRealm 通用运行架构  
> 最近复核：2026-07-28  
> 主要定义：程序主系统、子系统调用栈、调用参数与返回结果、JSON-RPC 控制面、子系统与渲染端数据面

相关文档：

- [`system-overview.md`](./system-overview.md)：总体架构入口；
- [`runtime-rpc-and-state-sync.md`](./runtime-rpc-and-state-sync.md)：JSON-RPC 方法、消息顺序和连接恢复；
- [`client-state-tree-protocol.md`](./client-state-tree-protocol.md)：Scope 与 Client Node 数据结构；
- [`../contracts/game-package-v1.md`](../contracts/game-package-v1.md)：游戏包入口文件；
- [`../design/web-client-reconciliation.md`](../design/web-client-reconciliation.md)：渲染端 Store 与 DOM 协调。

核心模型：

> LoomRealm 由一个程序主系统和若干模块子系统组成。程序主系统维护子系统调用栈；入口文件指定初始子系统；子系统可以携带参数调用另一个子系统入栈，也可以出栈并向调用者返回结果。所有进程间控制通信使用 JSON-RPC。活动子系统可以直接与渲染端通信，接收用户输入并更新自己拥有的 Scope。

## 1. 两类程序单元

### 1.1 程序主系统

程序主系统负责：

- 读取游戏包和入口文件；
- 解析初始子系统；
- 启动、连接、监督和关闭子系统进程；
- 维护唯一的子系统调用栈；
- 执行 `call`、`return`、暂停和恢复；
- 将调用参数交给被调用子系统；
- 将返回结果交回调用者；
- 建立子系统与渲染端之间的直接通信通道；
- 处理子系统异常退出和栈恢复；
- 向渲染端发布当前栈和输入目标。

程序主系统不负责：

- 地图移动、菜单导航、对话推进等业务规则；
- 子系统内部权威状态；
- 子系统 Scope 的内容生成；
- DOM、CSS、动画和资源解码；
- 转发每一条普通用户输入或 Scope 更新。

### 1.2 模块子系统

模块子系统是独立进程。每个子系统负责：

- 接收一次调用的输入参数；
- 维护本次调用对应的内部状态；
- 直接接收渲染端用户输入；
- 生成并发布自己拥有的 Scope；
- 产生一次性客户端事件；
- 通过程序主系统继续调用其他子系统；
- 完成、取消或失败时返回结果并出栈。

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
→ 激活初始子系统
```

程序主系统只验证入口文件的公共结构。`params` 的业务 Schema 由目标子系统定义和验证。

## 3. 调用栈

程序主系统维护一个后进先出的调用栈：

```ts
interface SystemFrame {
  readonly frameId: string;
  readonly activationId: string;
  readonly systemId: string;
  readonly callerFrameId: string | null;
  readonly state: "starting" | "active" | "suspended" | "closing";
}
```

规则：

1. 初始子系统是栈底帧；
2. 只有当前栈顶帧可以发起普通 `system.call` 或 `system.return`；
3. 调用新子系统时，当前栈顶暂停，新帧压栈并激活；
4. 子系统返回时，只能弹出当前栈顶帧；
5. 弹栈后恢复上一帧，并把结果发送给它；
6. 默认只有栈顶帧拥有用户输入权；
7. 下层帧的 Scope 可以继续保留显示，直到其自身出栈；
8. 栈只表达系统调用关系，不保存子系统内部业务状态。

示例：

```text
启动                   [map]
map 调用 menu          [map, menu]
menu 调用 dialog       [map, menu, dialog]
dialog 返回            [map, menu]
menu 返回              [map]
```

## 4. 子系统调用

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
→ 暂停调用者
→ 压栈并激活目标帧
→ 建立目标帧与渲染端通道
→ 更新渲染端的栈和输入目标
→ 返回 call 已建立
```

`system.call` 的 JSON-RPC 响应只表示调用是否成功建立。子系统的最终业务结果通过后续 `system.returned` 交回调用者。

## 5. 子系统返回

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
→ 恢复上一帧
→ 发送 system.returned(result)
→ 更新渲染端输入目标
```

调用者收到：

```json
{
  "jsonrpc": "2.0",
  "method": "system.returned",
  "params": {
    "frameId": "frame-map-1",
    "returnedFrameId": "frame-dialog-3",
    "result": {
      "status": "completed",
      "value": {
        "choiceId": "accept"
      }
    }
  }
}
```

## 6. Activation ID

`frameId` 标识一次调用帧，`activationId` 标识该帧的一次活动周期。

帧首次激活和每次从子调用恢复时，程序主系统都签发新的 `activationId`。用户输入和子系统 Scope 消息必须携带当前 `activationId`。

```text
旧 activationId 的输入
→ 子系统拒绝

旧 activationId 的 Scope 更新
→ 渲染端忽略
```

它用于隔离暂停、恢复和进程队列中的迟到消息。

## 7. 通信拓扑

通信分为控制面和数据面。

### 7.1 控制面

```text
程序主系统 ⇄ 子系统
```

承载：

- 初始化、暂停、恢复和关闭；
- `system.call`；
- `system.return`；
- `system.returned`；
- ready、heartbeat 和 failure。

```text
程序主系统 ⇄ 渲染端
```

承载：

- `stack.snapshot`；
- `frame.pushed`；
- `frame.popped`；
- `input.target.changed`；
- 子系统连接端口的建立和撤销。

### 7.2 数据面

```text
渲染端 ⇄ 活动子系统
```

承载：

- 用户输入；
- 节点事件；
- Scope Snapshot / Replace / Remove；
- 一次性客户端事件；
- Scope Resync。

程序主系统不转发普通数据面消息。

## 8. 子系统与渲染端

用户输入由渲染端直接发送给当前活动子系统：

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

子系统直接发布自己的 Scope：

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

因此不同调用帧可以使用相同的局部 Scope 名称而不会冲突。

## 9. Scope 生命周期

1. 子系统只能更新自己当前调用帧拥有的 Scope；
2. Scope 可以在子系统暂停期间继续显示；
3. 暂停帧不得继续接收普通用户输入；
4. 暂停帧若需要继续发布状态，必须使用仍有效的显示通道和当前帧标识；
5. 子系统出栈时，渲染端删除该 `frameId` 拥有的全部 Scope；
6. Scope 内容由子系统决定，程序主系统不理解 Tag、Data 或 DOM；
7. Scope Tree 协议不允许下发任意 HTML、CSS 或可执行代码。

## 10. 子系统内部实现

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

## 11. 进程与实例

第一阶段允许一种简单实现：每个调用帧启动一个子系统进程。

后续可以在协议不变的前提下优化为：

- 一个进程承载多个同类调用帧；
- 空闲进程池；
- 本地或远程子系统；
- 不同语言实现同一 `system` ID；
- 根据配置选择系统 Provider。

无论如何优化，所有消息都必须绑定 `frameId`，不能依赖进程 ID 表示调用身份。

## 12. 故障处理

- 子系统初始化失败：调用不入栈，错误返回调用者；
- 栈顶子系统异常退出：主系统生成 `failed` 结果，弹栈并恢复调用者；
- 初始子系统异常退出：整个程序会话失败；
- 非栈顶子系统异常退出：会话失败，因为调用栈已经损坏；
- 渲染端重连：主系统发送完整栈快照，各有效子系统重新发送 Scope Snapshot；
- JSON-RPC 消息 Schema、大小和方法权限必须校验。

## 13. 第一阶段冻结决策

| 主题 | 结论 |
|---|---|
| 顶层结构 | 程序主系统 + 模块子系统 |
| 扩展边界 | 独立进程与 JSON-RPC |
| 控制结构 | 主系统维护单一调用栈 |
| 初始系统 | 由 `realm.entry.json` 定义 |
| 子系统调用 | `system.call(system, input)` |
| 子系统返回 | `system.return(result)` |
| 普通输入 | 渲染端直达当前活动子系统 |
| Scope 更新 | 子系统直达渲染端 |
| Scope 身份 | `frameId + scopeId` |
| 迟到消息隔离 | `activationId` |
| 子系统内部结构 | 不由平台协议规定 |
| 进程间协议 | JSON-RPC 2.0 |

## 14. 当前结论

```text
入口文件
→ 程序主系统创建初始调用帧
→ 初始子系统入栈
→ 子系统直接处理输入并发布 Scope
→ 子系统可以调用另一子系统入栈
→ 被调用子系统出栈并返回结果
→ 调用者恢复并继续运行
```

程序主系统只管理调用关系和进程生命周期；模块子系统管理自身业务状态和客户端 Scope；渲染端直接与活动子系统交换输入和视图状态。