# 运行时通信与状态同步

## 1. 背景

LoomRealm 的 Web 前端既可能连接远程服务端，也可能连接浏览器本地运行时。为了避免前端直接依赖具体部署方式，前端与运行时之间统一使用 JSON-RPC 2.0 语义通信。

运行时可以部署为：

- 真实远程服务端；
- 浏览器 Dedicated Worker；
- 后续根据需要扩展为 Shared Worker；
- Service Worker 主要负责离线缓存、资源代理和持久化协助，不作为默认的持续游戏运行时。

通信设计的核心目标是：

> 统一协议语义，隔离具体传输方式，使相同的前端和运行时核心能够在本地模式与远程模式之间切换。

---

## 2. 基本架构原则

系统将通信拆分为两个层次：

1. **协议层**：定义 JSON-RPC 方法、参数、返回值、通知、错误和版本兼容规则。
2. **传输层**：负责实际发送和接收 JSON-RPC 消息。

协议层不应依赖 WebSocket、DOM、Worker 或具体服务器框架。

传输方式根据运行环境选择：

- 远程服务端：WebSocket；
- 浏览器本地运行时：Dedicated Worker 的 MessagePort；
- 多窗口共享运行时：可在后续评估 Shared Worker；
- Service Worker：只作为特殊适配器或基础设施组件，而不是第一阶段的常驻世界状态容器。

JSON-RPC 消息格式在不同传输方式下保持一致，因此上层业务逻辑不需要感知运行时位于远程还是本地。

---

## 3. 为什么采用 JSON-RPC

JSON-RPC 适合 LoomRealm 的原因包括：

- 协议简单，容易被 Web 前端、Node.js 服务端和 Worker 共同实现；
- 支持请求、响应和单向通知；
- 方法名能够表达明确的领域语义；
- 错误格式统一；
- 不与具体传输协议绑定；
- JSON 数据容易记录、调试、回放和由 AI 分析；
- 后续可以为协议消息增加 JSON Schema 校验。

JSON-RPC 只负责消息调用模型，不负责：

- 网络重连；
- 消息顺序恢复；
- 状态版本管理；
- 客户端预测；
- 权限认证；
- 大型二进制资源传输。

这些能力需要在 LoomRealm 的协议约定或传输适配层中单独处理。

---

## 4. 传输层抽象

前端 RPC 客户端应依赖一个最小传输接口，而不是直接操作 WebSocket 或 Worker：

```ts
interface RpcTransport {
  send(message: JsonRpcMessage): void;
  onMessage(handler: (message: JsonRpcMessage) => void): () => void;
  close(): void;
}
```

第一阶段至少需要实现：

- `WebSocketTransport`：连接真实服务端；
- `MessagePortTransport`：连接 Dedicated Worker。

传输层只处理：

- 建立和关闭连接；
- 发送和接收完整消息；
- 连接异常；
- 必要的序列化与反序列化。

传输层不应处理地图加载、角色移动、碰撞或状态变更等领域逻辑。

---

## 5. Service Worker 的定位

Service Worker 可以参与 LoomRealm 的本地架构，但不应作为第一阶段默认的实时运行时。

原因是 Service Worker 的生命周期由浏览器管理。即使页面仍然打开，浏览器也可能在没有待处理事件时终止 Service Worker，之后再按需重新启动。

因此，不应只在 Service Worker 内存中保存以下状态：

- 当前地图实例；
- 玩家实时位置；
- 当前按键状态；
- 游戏循环；
- 尚未持久化的世界状态；
- 必须持续存在的 WebSocket 会话；
- 依赖定时器连续执行的模拟状态。

Service Worker 更适合负责：

- 静态资源和项目文件缓存；
- 离线加载；
- 网络请求代理；
- FSDB 文件读取请求的缓存层；
- 版本更新；
- 持久化协助；
- 远程服务不可用时的有限降级。

第一阶段的浏览器本地运行时优先使用 Dedicated Worker。Dedicated Worker 的生命周期与当前页面会话一致，更适合持续持有地图、角色和输入状态。

---

## 6. 状态权威模型

运行时是游戏逻辑状态的唯一权威来源。

前端负责：

- 采集键盘、鼠标和触摸输入；
- 渲染画面；
- 显示编辑器 UI；
- 保存短期视觉插值状态；
- 展示运行时返回的数据和错误。

运行时负责：

- 当前地图；
- 玩家逻辑位置；
- 移动规则；
- 碰撞判定；
- Portal 触发与地图跳转；
- FSDB 项目数据；
- 世界状态；
- 状态版本号。

前端不应直接修改权威状态。例如，前端不发送“将玩家位置设为某坐标”，而应发送“向右移动”这一输入意图，由运行时判定移动是否成功，再同步最终状态。

这种设计避免前端状态与运行时状态相互覆盖，也为未来的远程运行和多人协作保留空间。

---

## 7. 输入事件设计

前端不应把原始 DOM 事件直接传给运行时。

以下信息不应成为运行时协议的基础：

- `KeyboardEvent` 对象；
- DOM `target`；
- 浏览器特有字段；
- 具体键盘布局细节；
- UI 组件内部事件。

前端应先把原始事件归一化成游戏动作：

```json
{
  "jsonrpc": "2.0",
  "method": "input.action",
  "params": {
    "sequence": 1034,
    "action": "moveUp",
    "pressed": true
  }
}
```

按键释放时发送：

```json
{
  "jsonrpc": "2.0",
  "method": "input.action",
  "params": {
    "sequence": 1035,
    "action": "moveUp",
    "pressed": false
  }
}
```

运行时维护当前动作状态，并在自身更新循环中执行移动。

输入通知建议包含单调递增的 `sequence`，用于：

- 排查消息丢失或乱序；
- 清理旧输入；
- 未来支持远程服务端确认输入；
- 日志回放。

在页面失焦、连接重建或输入设备切换时，前端应发送 `input.releaseAll`，避免运行时保留卡住的按键状态。

---

## 8. 状态同步模型

状态同步分为三类消息。

### 8.1 完整快照

完整快照用于：

- 初始化；
- 重新连接；
- 地图完整切换；
- 前端检测到版本不一致；
- 调试或恢复。

示例：

```json
{
  "jsonrpc": "2.0",
  "method": "state.snapshot",
  "params": {
    "revision": 42,
    "state": {
      "mapId": "town",
      "player": {
        "x": 128,
        "y": 96,
        "direction": "down",
        "moving": false
      }
    }
  }
}
```

### 8.2 增量更新

日常运行中优先同步变化部分，而不是持续发送完整状态。

```json
{
  "jsonrpc": "2.0",
  "method": "state.patch",
  "params": {
    "baseRevision": 42,
    "revision": 43,
    "changes": [
      {
        "path": "/player/x",
        "value": 132
      },
      {
        "path": "/player/moving",
        "value": true
      }
    ]
  }
}
```

前端只在 `baseRevision` 与本地版本一致时应用 Patch。若版本不一致，应请求新的完整快照，而不是尝试猜测缺失状态。

第一阶段可以先使用简单的路径和值列表，不要求立即采用完整 JSON Patch 标准。具体 Patch 格式由实现阶段根据状态复杂度决定。

### 8.3 领域事件

某些变化具有独立业务意义，不应只表现为字段修改。

例如地图切换：

```json
{
  "jsonrpc": "2.0",
  "method": "world.mapChanged",
  "params": {
    "fromMapId": "town",
    "toMapId": "house",
    "spawn": {
      "x": 96,
      "y": 160
    },
    "revision": 44
  }
}
```

领域事件适合驱动：

- UI 提示；
- 调试日志；
- 音效；
- 过场表现；
- 编辑器运行监视器。

权威渲染状态仍应以 Snapshot 或 Patch 为准，领域事件不能替代状态同步。

---

## 9. 请求与通知的使用规则

JSON-RPC 请求包含 `id`，调用方期待响应。通知不包含 `id`，不要求响应。

建议规则：

### 使用请求

适用于：

- 初始化运行时；
- 加载项目；
- 主动请求地图；
- 请求完整状态；
- 项目校验；
- 查询能力；
- 明确需要成功或失败结果的操作。

### 使用通知

适用于：

- 输入状态变化；
- 状态 Patch 推送；
- 完整快照推送；
- 领域事件；
- 日志；
- 非致命警告。

关键控制操作不应使用无法确认结果的通知。

---

## 10. 初始化与能力协商

连接建立后，前端应首先调用 `runtime.initialize`，交换：

- 协议版本；
- 前端版本；
- 运行时版本；
- 会话 ID；
- 支持的能力；
- 状态同步模式。

示例请求：

```json
{
  "jsonrpc": "2.0",
  "method": "runtime.initialize",
  "params": {
    "protocolVersion": "1.0",
    "client": {
      "name": "loom-realm-web",
      "version": "0.1.0"
    },
    "capabilities": {
      "statePatch": true
    }
  },
  "id": 1
}
```

示例响应：

```json
{
  "jsonrpc": "2.0",
  "result": {
    "sessionId": "session-001",
    "protocolVersion": "1.0",
    "runtime": {
      "name": "loom-realm-runtime",
      "version": "0.1.0"
    },
    "capabilities": {
      "statePatch": true,
      "fsdb": true
    }
  },
  "id": 1
}
```

协议版本不兼容时，运行时应明确拒绝初始化，而不是继续执行并产生隐蔽错误。

---

## 11. 第一阶段接口范围

第一阶段只需要极小的接口集合。

### 生命周期

- `runtime.initialize`
- `runtime.shutdown`
- `runtime.getCapabilities`

### 项目

- `project.load`
- `project.validate`

### 地图

- `map.load`
- `map.getCurrent`

### 输入

- `input.action`
- `input.releaseAll`

### 状态

- `state.getSnapshot`
- `state.snapshot`
- `state.patch`

### 运行信息

- `runtime.log`
- `runtime.fault`

Portal 触发不由前端调用。运行时根据玩家位置和地图数据自动判断 Portal，并在完成地图切换后同步新状态。

---

## 12. 远程运行模式的限制

当运行时位于真实远程服务器时，输入和画面状态之间会受到网络往返延迟影响。

第一阶段不处理：

- 客户端预测；
- 服务端状态校正；
- Tick 同步；
- 渲染插值；
- 未确认输入队列；
- 多人状态广播。

第一阶段首先以 Dedicated Worker 本地模式验证协议与状态边界。WebSocket 模式只需保证使用相同的 JSON-RPC 方法和消息结构。

后续若进入实时远程运行或多人模式，再为输入增加客户端 Tick、服务端 Tick 和确认序号等字段。

---

## 13. 错误与恢复

协议实现至少应处理：

- JSON 解析失败；
- JSON-RPC 格式无效；
- 未知方法；
- 参数校验失败；
- 协议版本不兼容；
- 项目加载失败；
- FSDB 校验失败；
- 地图或 Portal 引用不存在；
- 状态版本不一致；
- 连接中断。

状态版本不一致时，标准恢复策略是：

1. 停止应用后续 Patch；
2. 调用 `state.getSnapshot`；
3. 替换前端本地状态；
4. 从新 Revision 继续接收 Patch。

重新连接后，不假设旧会话仍然有效。客户端应重新初始化，并由运行时决定恢复原会话或创建新会话。

---

## 14. 第一阶段验收标准

本通信方案在第一阶段满足以下条件即可视为成立：

1. 同一套 JSON-RPC 方法可以通过 MessagePort 和 WebSocket 调用。
2. Web 前端不直接依赖运行时的具体部署方式。
3. 输入以归一化 Action 传递，而不是传递 DOM 事件。
4. 运行时是地图、玩家位置和碰撞结果的权威来源。
5. 前端能够通过完整快照初始化渲染状态。
6. 前端能够应用带 Revision 的增量状态更新。
7. Revision 不一致时能够请求完整快照恢复。
8. 玩家进入 Portal 后，地图切换由运行时完成。
9. Dedicated Worker 被用作默认浏览器本地运行时。
10. Service Worker 不承担必须持续存活的游戏循环和唯一内存状态。
11. 协议版本不兼容时能够明确报错。
12. 传输断开和运行时故障能够通过统一错误通道反馈给前端。

---

## 15. 当前决策

第一阶段采用以下决策：

- 使用 JSON-RPC 2.0 作为前端与运行时之间的统一调用语义；
- 使用 WebSocket 连接远程运行时；
- 使用 Dedicated Worker 与 MessagePort 承载浏览器本地运行时；
- 不把 Service Worker 作为默认实时运行时；
- 前端只发送输入意图，运行时维护权威状态；
- 状态同步采用完整快照、增量更新和领域事件三种消息；
- 所有状态同步消息包含单调递增的 Revision；
- 第一阶段不实现网络预测、多人同步和复杂重连恢复。

具体模块组织、依赖关系和文件目录由实现阶段根据所选技术栈进一步确定。
