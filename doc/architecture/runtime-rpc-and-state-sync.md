# JSON-RPC 通信与客户端状态同步

> 状态：**Active Design**  
> 适用范围：程序主系统、模块子系统和 Web 渲染端  
> 最近复核：2026-07-28  
> 主要定义：JSON-RPC 方法、控制面与数据面、消息顺序、Scope 同步和恢复

相关文档：

- [`main-system-and-subsystems.md`](./main-system-and-subsystems.md)：调用栈和进程职责；
- [`client-state-tree-protocol.md`](./client-state-tree-protocol.md)：Scope Tree 数据格式；
- [`client-state-projector.md`](./client-state-projector.md)：子系统如何生成 Scope；
- [`../design/web-client-reconciliation.md`](../design/web-client-reconciliation.md)：渲染端如何应用状态。

核心原则：

> 所有进程间语义使用 JSON-RPC 2.0；程序主系统只承载调用栈和生命周期控制；普通用户输入和 Scope 更新由模块子系统与渲染端直接交换。

## 1. 通信拓扑

```text
                     控制面
程序主系统  ⇄  模块子系统
程序主系统  ⇄  Web 渲染端

                     数据面
模块子系统  ⇄  Web 渲染端
```

控制面低频、严格有序，负责 `call`、`return`、激活和连接管理。

数据面高频，负责输入、Scope 状态和一次性事件，不经过程序主系统转发。

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
- 解决传输层连接和加密。

协议与传输分离，可使用：

```text
MessagePort
stdio 长度前缀帧
Unix Domain Socket
Windows Named Pipe
WebSocket
```

同一连接上必须保持 JSON-RPC 消息顺序。

## 3. 公共元数据

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
    一次活动周期

sequence
    一条连接或数据流上的消息顺序

scopeRevision
    单个 Scope 的内容版本

subsystemRevision
    子系统内部权威状态版本，可选
```

这些编号不得混用。

## 4. 程序主系统与子系统

### 4.1 主系统调用子系统

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

激活：

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

暂停：

```json
{
  "jsonrpc": "2.0",
  "method": "system.suspend",
  "params": {
    "frameId": "frame-map-1",
    "activationId": "activation-8"
  }
}
```

恢复：

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

关闭：

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

### 4.2 子系统调用另一个子系统

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

### 4.3 子系统返回

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

只有当前栈顶帧可以返回。程序主系统完成弹栈后，通过 `system.resume` 把结果交给上一帧。

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
        "visible": true
      },
      {
        "frameId": "frame-dialog-3",
        "systemId": "loom.dialog",
        "state": "active",
        "visible": true
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

## 6. 渲染端与子系统

### 6.1 用户输入

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

规则：

- 渲染端只向程序主系统声明的输入目标发送普通输入；
- 子系统验证 `frameId` 和 `activationId`；
- 不发送原始 Browser Event 对象；
- 输入类型和 Data Schema 由目标子系统定义；
- 暂停帧必须拒绝普通输入。

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

子系统必须验证 Scope、Key、Tag、事件名称和 Data Schema。

## 7. Scope 完整状态

每个子系统连接维护自己的 Scope 数据流。首次激活、渲染端重连或 Resync 时发送：

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

1. 验证连接和 Activation；
2. 验证 Sequence；
3. 验证 Scope Tree；
4. 原子替换该 Frame 的 Scope 集合；
5. 协调受影响 DOM。

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

## 9. 一次性事件

子系统向渲染端发送：

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

可恢复界面内容必须进入 Scope，不应只使用 Event。

## 10. Sequence 与恢复

每条子系统数据流独立维护 Sequence：

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

## 11. Activation 切换

子系统暂停时：

- 旧 `activationId` 失效；
- 子系统停止接受普通输入；
- 已发布 Scope 可以继续显示；
- 在途旧输入被拒绝。

子系统恢复时：

- 程序主系统签发新 `activationId`；
- 渲染端更新输入目标；
- 子系统可以发送完整 Snapshot 或继续已有 Scope Revision；
- 任何旧 Activation 消息都必须被忽略。

## 12. Frame 出栈

程序主系统发送 `frame.popped` 后，渲染端必须：

- 关闭该 Frame 的子系统数据通道；
- 删除 `frameId` 拥有的所有 Scope；
- 清理 DOM Element、事件监听、动画和资源引用；
- 不再接受该 Frame 的迟到状态或事件。

## 13. 背压

建议策略：

```text
Scope State
    同一 Frame/Scope 只保留最新目标状态

Event
    有序、有界、不可静默丢弃关键事件

Input
    有序、有界；高频方向输入可以合并为最新意图

Control RPC
    不丢弃；超时产生明确错误
```

不要让大型资源内容与输入和 Scope 消息共用同一高优先级队列。

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

精确参数 Schema 可以在实现前继续细化，但不得改变控制面和数据面的职责边界。

## 17. 当前结论

```text
主系统控制面
    管理 Frame、call、return 和连接

子系统数据面
    直接接收输入并发布 Scope

渲染端
    按 Frame 合并 Scope，并将目标树协调为 DOM
```

JSON-RPC 是统一的跨进程语义；程序主系统不成为普通用户输入和 Client State 的转发瓶颈。