# JSON-RPC 通信与客户端状态同步

> 状态：**Active Design**  
> 适用范围：程序主系统、模块子系统和 Web 渲染端  
> 最近复核：2026-07-28  
> 主要定义：JSON-RPC 方法、控制面与数据面、前台控制语义、消息顺序、Scope 同步和恢复

相关文档：

- [`main-system-and-subsystems.md`](./main-system-and-subsystems.md)：调用栈、前台控制和进程职责；
- [`client-state-tree-protocol.md`](./client-state-tree-protocol.md)：Scope Tree 数据格式；
- [`client-state-projector.md`](./client-state-projector.md)：子系统如何生成 Scope；
- [`../design/web-client-reconciliation.md`](../design/web-client-reconciliation.md)：渲染端如何应用状态。

核心原则：

> 所有进程间语义使用 JSON-RPC 2.0；程序主系统只承载调用栈、前台控制和生命周期控制；普通用户输入和 Scope 更新由模块子系统与渲染端直接交换。Frame 失去栈顶位置只撤销普通输入和普通调用权限，不要求暂停子系统进程或后台任务。

## 1. 通信拓扑

```text
                     控制面
程序主系统  ⇄  模块子系统
程序主系统  ⇄  Web 渲染端

                     数据面
模块子系统  ⇄  Web 渲染端
```

控制面低频、严格有序，负责 `call`、`return`、前台控制和连接管理。

数据面高频，负责输入、Scope 状态和一次性事件，不经过程序主系统转发。

非栈顶 Frame 的数据通道可以继续存在。普通输入仍只发送给程序主系统声明的当前输入目标。

## 2. JSON-RPC 定位

JSON-RPC 负责：

- 请求与响应关联；
- 通知封装；
- 方法名称空间；
- 协议错误；
- 跨语言实现的一致消息语义。

JSON-RPC 不负责：

- 规定子系统内部架构；
- 定义地图、菜单或对话业务 DTO；
- 生成 Scope Tree；
- 操作 DOM；
- 传递可执行代码；
- 解决传输层连接和加密；
- 暂停操作系统进程或线程。

协议与传输分离，可使用：

```text
MessagePort
stdio 长度前缀帧
Unix Domain Socket
Windows Named Pipe
WebSocket
```

同一连接上必须保持 JSON-RPC 消息顺序。

## 3. 公共元数据和时序域

所有与调用帧有关的方法参数至少包含：

```ts
interface FrameMeta {
  readonly frameId: string;
  readonly activationId: string;
}
```

状态和事件通知还应包含发送方向上的单调序号：

```ts
interface StreamMeta extends FrameMeta {
  readonly sequence: number;
}
```

必须区分：

```text
frameId
    一次子系统调用实例

activationId
    Frame 的一次前台控制周期和数据 Epoch

sequence
    一条具体数据连接上的消息顺序

stackRevision
    程序主系统调用栈镜像版本

stateRevision
    一个 Frame 的客户端目标状态版本

scopeRevision
    单个 Scope 的内容版本

subsystemRevision
    子系统内部权威状态版本，可选
```

这些编号不得混用。

`activationId` 不是进程 ID、连接 ID 或后台任务 ID。`sequence` 在连接重建后可以重新开始，而 State/Scope Revision 可以保持原值。

## 4. 程序主系统与子系统

### 4.1 初始化

主系统请求：

```json
{
  "jsonrpc": "2.0",
  "id": "init-1",
  "method": "system.initialize",
  "params": {
    "frameId": "frame-dialog-3",
    "systemId": "loom.dialog",
    "input": {
      "dialogId": "dialog/old-man"
    }
  }
}
```

子系统响应成功后必须已完成参数验证和必要初始化，但尚不接收普通输入。

首次前台激活：

```json
{
  "jsonrpc": "2.0",
  "method": "system.activate",
  "params": {
    "frameId": "frame-dialog-3",
    "activationId": "activation-9"
  }
}
```

### 4.2 前台失活

当新的 Frame 入栈时，主系统通知旧栈顶：

```json
{
  "jsonrpc": "2.0",
  "method": "system.suspend",
  "params": {
    "frameId": "frame-map-1",
    "activationId": "activation-8",
    "reason": "covered-by-child"
  }
}
```

`system.suspend` 的通用协议语义：

- Frame 不再是普通输入目标；
- Frame 不再拥有普通 `system.call` / `system.return` 权限；
- `activationId` 不在收到 suspend 时立即作废；
- 子系统进程和数据通道默认保持存活；
- 子系统可以继续后台任务和允许的状态发布；
- 是否停止业务 Tick、定时器或异步 I/O，由具体子系统决定；
- 普通输入必须因为 Frame 不是当前 `inputTarget` 而被拒绝。

该方法名表达前台控制失活，不表示操作系统级进程暂停。

### 4.3 恢复前台控制

子 Frame 返回后，主系统为调用者签发新的 `activationId`：

```json
{
  "jsonrpc": "2.0",
  "method": "system.resume",
  "params": {
    "frameId": "frame-map-1",
    "activationId": "activation-10",
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

新的 `activationId` 生效后：

- 上一次 Activation 的迟到输入、状态和事件必须拒绝；
- Renderer 更新普通输入目标；
- 子系统可以发送完整 Snapshot 或继续当前 State/Scope Revision；
- 跨 Activation 存活的后台任务必须重新绑定当前发布上下文，或丢弃旧 Epoch 的输出。

### 4.4 关闭

```json
{
  "jsonrpc": "2.0",
  "method": "system.close",
  "params": {
    "frameId": "frame-dialog-3",
    "reason": "returned"
  }
}
```

关闭后该 Frame 的所有 Activation、数据通道、Pending RPC 和 Scope 均失效。

### 4.5 子系统调用另一个子系统

```json
{
  "jsonrpc": "2.0",
  "id": "call-42",
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

主系统响应：

```json
{
  "jsonrpc": "2.0",
  "id": "call-42",
  "result": {
    "accepted": true,
    "frameId": "frame-dialog-3"
  }
}
```

该响应只表示子调用已建立，不包含最终业务结果。

只有当前栈顶 Frame 可以发起普通 `system.call`。非栈顶 Frame 即使继续后台运行，也不能绕过调用栈发起普通嵌套调用。

### 4.6 子系统返回

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

只有当前栈顶 Frame 可以返回。程序主系统完成弹栈后，通过 `system.resume` 把结果和新的 `activationId` 交给上一帧。

## 5. 程序主系统与渲染端

渲染端连接后，程序主系统发送完整栈快照：

```json
{
  "jsonrpc": "2.0",
  "method": "stack.snapshot",
  "params": {
    "stackRevision": 12,
    "frames": [
      {
        "frameId": "frame-map-1",
        "systemId": "loom.map",
        "state": "suspended",
        "visible": true,
        "activationId": "activation-8"
      },
      {
        "frameId": "frame-dialog-3",
        "systemId": "loom.dialog",
        "state": "active",
        "visible": true,
        "activationId": "activation-9"
      }
    ],
    "inputTarget": {
      "frameId": "frame-dialog-3",
      "activationId": "activation-9"
    }
  }
}
```

增量控制通知可以使用：

```text
frame.pushed
frame.suspended
frame.resumed
frame.popped
input.target.changed
system.failed
```

渲染端不得根据自己的 DOM 状态推断调用栈。检测到 `stackRevision` 缺口时，请求新的 `stack.snapshot`。

`frame.suspended` 只要求渲染端停止向该 Frame 发送普通输入。它不要求关闭数据通道，也不要求停止接收该 Frame 合法的后台状态。

## 6. 渲染端与子系统

### 6.1 普通用户输入

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

输入授权规则：

- `frameId` 必须是程序主系统当前声明的 `inputTarget.frameId`；
- `activationId` 必须等于 `inputTarget.activationId`；
- Sequence 必须连续；
- 输入类型和 Data 必须满足目标子系统 Schema；
- 不发送原始 Browser Event 对象；
- 非输入目标 Frame 必须拒绝普通输入，即使 `activationId` 仍是其当前后台数据 Epoch。

### 6.2 节点事件

```json
{
  "jsonrpc": "2.0",
  "method": "node.event",
  "params": {
    "frameId": "frame-menu-2",
    "activationId": "activation-5",
    "scopeId": "menu",
    "key": "continue-button",
    "event": "activate",
    "data": null
  }
}
```

第一阶段节点事件遵循与普通输入相同的前台输入授权。子系统还必须验证 Scope、Key、Tag、事件名称和 Data Schema。

暂停 Frame 的 Scope 可以继续显示，但默认不具有交互权。未来如需并行输入能力，应另行定义输入路由和能力模型。

## 7. Frame 完整状态

每个子系统数据连接维护自己的 Scope 数据流。首次激活、渲染端重连或 Resync 时发送：

```json
{
  "jsonrpc": "2.0",
  "method": "state.snapshot",
  "params": {
    "frameId": "frame-map-1",
    "activationId": "activation-8",
    "sequence": 44,
    "stateRevision": 17,
    "scopes": {
      "world": {
        "revision": 38,
        "roots": []
      },
      "hud": {
        "revision": 12,
        "roots": []
      }
    }
  }
}
```

`state.snapshot` 只包含当前 `frameId` 拥有的 Scope，不包含其他子系统 Frame。

渲染端收到后：

1. 验证连接和 Frame；
2. 验证消息 Activation 是否仍是该 Frame 当前数据 Epoch；
3. 验证 Sequence；
4. 验证 Scope Tree；
5. 原子替换该 Frame 的 Scope 集合；
6. 协调受影响 DOM。

Frame 处于 `suspended` 不构成状态消息无效的理由。只有 Frame 已关闭、连接已替换或新的 Activation 已生效时，旧数据才应被拒绝。

## 8. Scope 替换

```json
{
  "jsonrpc": "2.0",
  "method": "scope.replace",
  "params": {
    "frameId": "frame-map-1",
    "activationId": "activation-8",
    "sequence": 45,
    "stateRevision": 18,
    "scopeId": "world",
    "value": {
      "revision": 39,
      "roots": []
    }
  }
}
```

删除 Scope：

```json
{
  "jsonrpc": "2.0",
  "method": "scope.replace",
  "params": {
    "frameId": "frame-map-1",
    "activationId": "activation-8",
    "sequence": 46,
    "stateRevision": 19,
    "scopeId": "loading",
    "value": null
  }
}
```

空 Scope 与删除 Scope 不同。

同一子系统一次事务改变多个 Scope 时，应发送该 Frame 的 `state.snapshot`。第一阶段不实现多 Scope Batch Patch。

## 9. 后台状态和一次性事件

### 9.1 后台 Scope 状态

非栈顶 Frame 可以继续发布可恢复状态，例如：

- 资源预加载进度；
- 网络连接状态；
- 调试指标；
- 后台计算结果；
- 仍属于该 Frame 的世界状态。

条件：

- Frame 仍存在；
- 数据通道仍有效；
- 消息使用该 Frame 当前数据 Epoch；
- State/Scope Revision 和 Sequence 合法；
- 状态不伪造其他 Frame；
- 子系统契约允许该状态在后台变化。

### 9.2 一次性事件

```json
{
  "jsonrpc": "2.0",
  "method": "event.emit",
  "params": {
    "frameId": "frame-map-1",
    "activationId": "activation-8",
    "sequence": 47,
    "eventId": "event-91",
    "type": "sound.play",
    "data": {
      "resource": "sound.step/grass"
    }
  }
}
```

状态消息可以合并为最新目标状态；一次性事件默认不能随意丢弃或合并。

暂停 Frame 的一次性事件可能影响当前前台体验，因此具体子系统必须明确事件是否：

- 允许在后台立即投递；
- 延迟到恢复后投递；
- 在失去前台控制时取消；
- 转换为可恢复 Scope 状态。

可恢复界面内容必须进入 Scope，不应只使用 Event。

## 10. Sequence、Revision 与连接恢复

每条子系统数据连接独立维护 Sequence：

```text
sequence <= lastSequence
→ 忽略重复或过期消息

sequence == lastSequence + 1
→ 正常应用

sequence > lastSequence + 1
→ 请求该 Frame 的 state.snapshot
```

重连后不能沿用旧连接 Sequence。渲染端先获取主系统的 `stack.snapshot`，再向每个有效 Frame 请求子系统 `state.snapshot`。

Resync 请求：

```json
{
  "jsonrpc": "2.0",
  "id": "resync-7",
  "method": "state.resync",
  "params": {
    "frameId": "frame-map-1",
    "activationId": "activation-8",
    "knownStateRevision": 17
  }
}
```

重新发送相同逻辑状态时可以保持 `stateRevision`，但新连接的 `sequence` 重新开始。

校验顺序应为：

```text
连接仍属于该 Frame
→ Frame 仍存在
→ Activation 是该 Frame 当前数据 Epoch
→ Sequence 连续
→ State/Scope Revision 不倒退
→ Payload Schema 有效
```

不能只比较 Sequence，也不能把 Sequence 当作 State Revision。

## 11. Activation 切换

### 11.1 Frame 失去前台控制

收到 `frame.suspended` / `system.suspend` 后：

- Renderer 立即停止发送普通输入和节点事件；
- Frame 保留当前 `activationId` 作为后台数据 Epoch；
- 子系统进程和数据通道可以继续运行；
- 已发布 Scope 可以继续显示；
- 子系统可以按契约继续发布后台状态；
- 在途普通输入即使 Activation 匹配，也必须因为该 Frame 不是 `inputTarget` 而拒绝。

### 11.2 Frame 恢复前台控制

收到 `frame.resumed` / `system.resume` 后：

- 程序主系统签发新的 `activationId`；
- 渲染端更新该 Frame 的当前数据 Epoch；
- 旧 Activation 的迟到状态、事件和输入全部忽略；
- Renderer 更新普通输入目标；
- 子系统可以发送完整 Snapshot 或继续已有 Revision；
- 后台任务产生的输出在发布前必须重新检查当前 Activation。

### 11.3 Frame 关闭

Frame 关闭后：

- 所有 Activation 失效；
- 数据通道关闭；
- Pending RPC 取消；
- 所有 Scope 删除；
- 迟到状态和事件全部忽略。

## 12. Frame 出栈

程序主系统发送 `frame.popped` 后，渲染端必须：

- 关闭该 Frame 的子系统数据通道；
- 删除 `frameId` 拥有的所有 Scope；
- 清理 DOM Element、事件监听、动画和资源引用；
- 取消该 Frame 的 Pending Resync；
- 不再接受该 Frame 的迟到状态或事件。

## 13. 背压

建议策略：

```text
Scope State
    同一 Frame/Scope 只保留最新目标状态

Event
    有序、有界；关键事件不可静默丢弃

Input
    有序、有界；高频方向输入可以合并为最新意图

Control RPC
    不丢弃；超时产生明确错误
```

不要让大型资源内容与输入和 Scope 消息共用同一高优先级队列。

暂停 Frame 的后台状态仍受相同背压限制，不能因为失去前台控制而无界积累。

## 14. 错误模型

JSON-RPC 错误至少包含：

```ts
interface LoomRpcErrorData {
  readonly code: string;
  readonly retryable: boolean;
  readonly frameId?: string;
  readonly activationId?: string;
  readonly details?: unknown;
}
```

常见错误：

```text
SYSTEM_NOT_FOUND
INVALID_SYSTEM_INPUT
CALLER_NOT_STACK_TOP
RETURNER_NOT_STACK_TOP
FRAME_NOT_INPUT_TARGET
STALE_ACTIVATION
FRAME_NOT_FOUND
INVALID_SCOPE_TREE
SEQUENCE_GAP
SUBSYSTEM_NOT_READY
SUBSYSTEM_PROCESS_EXITED
```

业务拒绝应作为正常方法结果，不应全部映射为 JSON-RPC 协议错误。

## 15. 安全边界

- 所有消息必须验证 Schema 和大小；
- 渲染端只获得窄接口，不获得任意 IPC channel；
- 子系统只能发布自己 `frameId` 的 Scope；
- 子系统不能伪造其他 Frame 的 `activationId`；
- 匹配 Activation 不等于拥有普通输入权；
- 普通输入必须额外验证主系统当前 `inputTarget`；
- Client Node 不允许携带可执行代码或任意 HTML；
- 本机连接也不能被视为天然可信；
- 资源路径不得通过 Scope 暴露给渲染端。

## 16. 第一阶段冻结方法

### 程序主系统 ⇄ 子系统

```text
system.initialize
system.activate
system.suspend
system.resume
system.close
system.call
system.return
system.ready
system.failed
```

### 程序主系统 ⇄ 渲染端

```text
stack.snapshot
frame.pushed
frame.suspended
frame.resumed
frame.popped
input.target.changed
system.failed
```

### 子系统 ⇄ 渲染端

```text
input.dispatch
node.event
state.snapshot
scope.replace
state.resync
event.emit
```

精确参数 Schema 可以在实现前继续细化，但不得改变以下职责边界：

- 调用栈只管理前台控制关系；
- `suspended` 不表示进程暂停；
- 普通输入只发送给当前输入目标；
- 非栈顶 Frame 可以继续合法后台状态发布；
- 新 Activation 才使上一数据 Epoch 失效。

## 17. 当前结论

```text
主系统控制面
    管理 Frame、前台调用关系、普通输入目标和连接

子系统数据面
    直接接收获授权的输入并发布本 Frame 状态

非栈顶 Frame
    失去前台控制，但可以继续后台运行和状态发布

渲染端
    按 Frame 合并 Scope，并将目标树协调为 DOM
```

JSON-RPC 是统一的跨进程语义；程序主系统不成为普通用户输入和 Client State 的转发瓶颈，也不成为所有子系统的执行调度器。
