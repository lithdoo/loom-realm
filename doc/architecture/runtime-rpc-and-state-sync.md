# 运行时通信与状态同步

## 1. 文档目的

本文档定义 LoomRealm Runtime Server 与 Web Client 之间的通信方向、状态同步语义、事件边界和传输适配规则。

相关文档：

- [`client-state-tree-protocol.md`](./client-state-tree-protocol.md)：定义 Client State、Scope、Roots 和 Client Node；
- [`client-state-projector.md`](./client-state-projector.md)：定义 Runtime/Session 快照到 Client State 的原子投影；
- [`../runtime/phase-1-runtime-execution-loop.md`](../runtime/phase-1-runtime-execution-loop.md)：定义命令、Tick 和控制操作的串行执行；
- [`../runtime/phase-1-session-coordinator.md`](../runtime/phase-1-session-coordinator.md)：定义异步地图切换和 Session 状态。

核心原则：

> Runtime RPC 只承载通用状态同步、事件传递和资源访问，不围绕地图、人物、菜单或其他业务增加固定 RPC DTO。

## 2. 模块链路

```text
Web Client
    ↓ 归一化命令 / 节点事件
Runtime Service
    ↓ submitCommand / control
Runtime Execution Loop
    ↓ serialized synchronous call
Runtime Core
    ↓ RuntimeTransaction + RuntimeSnapshot
Projection Scheduler
    ↓ latest ProjectionFrame
Client State Projector
    ↓ ProjectionCommit
Runtime Service
    ↓ state.snapshot / scope.replace / event
Web Client
```

边界：

- Runtime Service 不直接调用 Runtime Core；
- Runtime Service 通过 Execution Loop 提交命令和控制操作；
- Runtime Service 不自行拼接 Client State；
- Client State Revision 和 Scope Revision 由 Client State Projector 分配；
- Runtime Service 只把 Projection Commit 转换成通信消息；
- Runtime Event 与 Client State 使用独立发布通道。

## 3. 通信能力

第一阶段建立三类能力：

```text
状态同步
    描述客户端现在应该呈现什么

事件传递
    描述一次用户意图或瞬时通知

资源访问
    按逻辑资源 Key 获取静态资源主体
```

业务差异体现在：

- Scope 名称；
- Client Node Tag；
- Tag 对应的 Data Schema；
- 事件名称和事件 Data；
- 逻辑资源 Key。

基础通信层不预定义固定 RPG 业务 DTO。

## 4. 权威状态原则

Runtime Core 是游戏规则和游戏状态的权威来源。

Runtime Core 负责决定：

- 人物位置、朝向和移动结果；
- 碰撞结果；
- Portal 和地图切换结果；
- 暂停和恢复结果；
- 其他影响游戏规则的状态变化。

Session Coordinator 负责异步内容准备和会话控制状态。

Client State Projector 读取 Runtime Snapshot 和 Session Snapshot，生成客户端目标状态。它不能修改 Runtime 或 Session。

Web Client 负责：

- 采集并归一化用户输入；
- 维护 Client State 本地镜像；
- 将 Scoped State Tree 协调为 DOM；
- 管理不影响游戏规则的临时视觉状态；
- 按资源 Key 请求和缓存资源。

客户端不得通过直接修改共享对象或 DOM 来改变权威状态。

## 5. Runtime State 与 Client State

Runtime 内部状态不能直接序列化给客户端。

```text
Runtime Core
    权威状态和游戏规则
        ↓ RuntimeSnapshot

Session Coordinator
    会话控制状态
        ↓ SessionSnapshot

Projection Scheduler
        ↓ ProjectionFrame
Client State Projector
        ↓ Scoped State Tree
Runtime Service
        ↓ Runtime RPC
Web Client
```

Client State 使用通用树：

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

具体结构、Key 规则、Tag 注册、Roots 和 DOM 映射由 Client Scoped State Tree 协议定义。

## 6. JSON-RPC 定位

第一阶段使用 JSON-RPC 作为消息承载语义。

JSON-RPC 负责：

- 请求与响应关联；
- 通知消息封装；
- 方法名称空间；
- 协议级错误结果封装。

JSON-RPC 不负责：

- 建模地图和人物；
- 定义 Client Node Tag；
- 生成 Client State；
- 决定 Runtime 内部模块；
- 充当 DOM 操作协议；
- 传递可执行代码。

协议与传输分离：

```text
Runtime RPC
├── 远程 WebSocket
├── 本机 WebSocket
├── Dedicated Worker MessagePort
└── 后续其他双向传输
```

不同传输适配必须承载相同的状态、事件和资源语义。

## 7. Server 消息顺序

每个 Server → Client 的状态或事件通知必须包含单调递增的消息序号：

```ts
interface RuntimeMessageMeta {
  readonly protocolVersion: 1;
  readonly sequence: number;
}
```

规则：

```text
sequence <= lastSequence
→ 忽略重复或过期消息

sequence == lastSequence + 1
→ 正常应用

sequence > lastSequence + 1
→ 状态基础不确定，请求完整快照
```

重新建立连接后，客户端不能假定旧连接的 Sequence 连续，应先获取完整状态。

必须区分：

```text
RuntimeTransaction.id
    Core 操作顺序

RuntimeState.revision
    权威游戏状态版本

SessionSnapshot.revision
    会话控制状态版本

ClientState.revision
    客户端目标状态版本

ClientScope.revision
    单个 Scope 版本

Runtime RPC sequence
    Server 通知顺序
```

这些编号不得混用。

## 8. Projection Commit 到消息

Client State Projector 返回传输无关的 Projection Commit：

```text
unchanged
snapshot
scope-replace
```

Runtime Service 转换规则：

```text
ProjectionUnchanged
→ 不发送状态消息

ProjectionSnapshot
→ state.snapshot

ProjectionScopeReplace
→ scope.replace
```

Runtime Service 不重新计算 Scope 差异，不修改 Projection Commit 中的 Revision。

## 9. 完整状态同步

```ts
interface ClientStateSnapshotMessage {
  readonly type: "state.snapshot";
  readonly state: ClientState;
}
```

完整状态用于：

- 首次投影；
- 首次连接；
- 页面重新加载；
- 网络重新连接；
- Sequence 或 Revision 出现缺口；
- 客户端状态验证失败；
- 多个 Scope 在一次投影中变化；
- 地图切换提交；
- Projector 明确设置 `forceSnapshot`；
- 客户端主动请求恢复。

客户端收到完整状态后：

1. 验证协议版本；
2. 验证 Scope 和节点结构；
3. 用新 Client State 替换本地镜像；
4. 按 Scope 和 Key 协调 DOM；
5. 记录该消息 Sequence。

重新发送已有 Client State 用于 Resync 时，不增加 Client State Revision，只增加 Runtime RPC Sequence。

## 10. Scope 替换

第一阶段正常增量同步只支持替换单个 Scope：

```ts
interface ClientScopeReplaceMessage {
  readonly type: "scope.replace";
  readonly stateRevision: number;
  readonly scope: string;
  readonly value: ClientScope | null;
}
```

语义：

```text
value = ClientScope
→ 替换该 Scope 的目标 Roots Tree

value = null
→ 删除整个 Scope
```

Scope 内容为空时使用：

```json
{
  "revision": 13,
  "roots": []
}
```

空 Scope 与删除 Scope 不同。

客户端可以通过稳定 Key 对新旧 Scope Tree 做 DOM 协调，不要求销毁所有未变化节点。

## 11. 发布原子性

当前协议没有多 Scope 原子 Patch。

因此第一阶段冻结：

```text
0 个 Scope 变化
→ 不发送状态消息

1 个 Scope 变化
→ scope.replace

2 个或更多 Scope 变化
→ state.snapshot

地图切换提交
→ state.snapshot
```

Runtime Service 不得将一个 Projection Snapshot 拆成多个 `scope.replace`。

第一阶段不实现：

- 节点级 Patch；
- JSON Patch；
- 多 Scope Batch Patch；
- 服务端 DOM 指令；
- ECS Component Replication；
- 任意 HTML 字符串替换。

## 12. Client Store

Web Client 应维护独立于 DOM 的状态镜像：

```ts
interface ClientStore {
  readonly state: ClientState | null;
  readonly lastSequence: number;
}
```

消息处理顺序：

```text
Runtime Message
→ 验证 Sequence
→ 验证 State/Scope Revision
→ 更新 Client Store
→ 协调受影响 Scope
→ 更新 DOM
```

WebSocket、Worker 或其他传输回调不得直接散布 DOM 修改逻辑。

## 13. 事件传递

事件用于表达一次动作或瞬时通知。

事件通道是双向的：

```text
Web Client
→ 用户输入或节点事件
→ Runtime Service
→ Execution Loop / 业务事件路由

RuntimeTransaction Event
→ Runtime Event Publisher
→ Runtime Service
→ Web Client
```

Runtime Event 不通过 Projection Scheduler 合并。

### 13.1 节点事件

```ts
interface ClientNodeEvent {
  readonly type: "node.event";
  readonly scope: string;
  readonly key: string;
  readonly event: string;
  readonly data?: JsonValue;
}
```

Runtime Service 必须根据当前 Client State 和业务事件路由验证：

- Scope 存在；
- Key 存在；
- Tag 允许该事件；
- Data 满足事件 Schema；
- 当前 Session 状态允许该操作。

节点事件不能任意调用 Runtime 内部方法。

### 13.2 全局输入

键盘方向、手柄轴等高频全局输入可以使用独立归一化输入消息。

客户端不得发送原始 Browser Event 对象。

### 13.3 Runtime Event

Runtime → Client 的一次性事件适用于：

- 音效或短暂表现触发；
- 日志、警告和错误通知；
- 不需要重连恢复的提示；
- 客户端本地过渡行为。

需要重新连接后恢复的内容必须进入 Client State，不能只依赖事件。

## 14. 状态与事件边界

```text
状态
    系统当前可观察结果
    可通过完整同步恢复

事件
    一次动作或瞬时通知
    不作为长期状态来源
```

原则：

- 用户输入属于事件或命令；
- 用户输入产生的最终结果属于状态；
- 可恢复界面内容属于 Scope Tree；
- 一次性表现可以使用事件；
- Projection Scheduler 可以合并状态 Frame；
- Runtime Event 不因状态 Frame 合并而丢失。

## 15. Projection 错误

Client State Projector 投影失败时：

- 不发布部分 Client State；
- 保留最后一个完整 Client State；
- 不回滚已提交 Runtime Transaction；
- 初始投影失败时 Runtime Service 不进入 ready；
- 运行期间投影失败时 Session 进入 failed；
- Execution Loop 应暂停或失败，避免客户端永久停留在旧状态而游戏继续推进；
- Runtime Service 发布明确的投影/服务错误。

Projection Error 与业务命令拒绝、协议错误分开。

## 16. 资源传输边界

资源主体不进入 Client State Tree。

节点 Data 只引用逻辑资源 Key：

```json
{
  "sprite": "actor.sprite/player"
}
```

资源链路：

```text
Client Node Data 中的资源 Key
→ Web Client Resource Cache
→ Runtime Service Resource Endpoint
→ Resource Repository
→ 资源主体
```

Runtime RPC 不暴露游戏包文件系统路径。

资源加载状态通常属于客户端本地状态，不是 Runtime 权威状态。

## 17. Hostra 边界

```text
Hostra Control RPC
    窗口、宿主和进程协调

LoomRealm Runtime RPC
    Client State、事件和资源访问
```

Hostra 不保存、代理或修改权威游戏状态，也不生成 Client State。

Hostra 桌面模式下，Web Client 仍直接使用 Runtime RPC 语义连接本机 Runtime Service。

## 18. 运行环境

### 18.1 远程 Runtime

```text
Web Client
→ WebSocket
→ Runtime Service
```

### 18.2 Hostra 本地 Runtime

```text
Hostra
→ 启动本地 Runtime Service
→ 打开 Web Client
→ Web Client 连接本机 Runtime RPC
```

### 18.3 浏览器本地 Runtime

```text
Web Client
→ Dedicated Worker MessagePort
→ 浏览器本地 Runtime
```

Service Worker 不作为第一阶段默认持续 Runtime，因为其生命周期不适合保存唯一权威会话状态。

## 19. 错误与恢复

以下情况需要请求完整状态：

- 消息 Sequence 出现缺口；
- State Revision 不连续或倒退；
- Scope Revision 冲突；
- 一个 Scope 内出现重复 Key；
- Tag 未注册；
- Tree 验证失败；
- Client Store 或 DOM 协调器出现不可恢复错误。

客户端不得在状态基础不确定时继续应用局部更新。

错误分类：

```text
协议错误
    消息、版本、Tree 或 Sequence 无效

业务拒绝
    当前游戏状态不接受某次用户意图

投影错误
    Runtime/Session 状态不能转换为合法 Client State

资源错误
    资源 Key、读取或内容无效
```

## 20. 第一阶段闭环

```text
用户输入
→ Web Client 发送归一化命令
→ Runtime Service 检查 Session
→ Runtime Service 提交 Execution Loop
→ Runtime Core 更新权威状态
→ RuntimeTransaction 发布
→ Projection Scheduler 合并状态 Frame
→ Client State Projector 生成 Projection Commit
→ Runtime Service 发送 state.snapshot 或 scope.replace
→ Client Store 应用状态
→ DOM 协调器按 Scope、Key 和 Tag 更新 DOM
```

Runtime Event 独立发送；地图和人物图片由资源接口另行加载。

## 21. 第一阶段不实现

- 固定地图、人物、HUD 或菜单 RPC；
- 固定 RPG Client DTO；
- 节点级 Patch；
- 多 Scope Batch Patch；
- 客户端预测和 Server 校正；
- 多人同步；
- 复杂断线重放；
- 通用分布式状态系统；
- Hostra Control RPC 承载游戏业务；
- Server 下发任意 HTML、CSS 或 JavaScript；
- 客户端直接修改 Runtime 权威状态；
- Runtime Service 自行生成 Client State。

## 22. 已冻结决策

| 问题 | 第一阶段结论 |
|---|---|
| 消息承载 | JSON-RPC |
| 传输 | WebSocket 或 MessagePort 适配 |
| Core 写入口 | Runtime Execution Loop |
| 权威游戏状态 | Runtime Core |
| 会话控制状态 | Session Coordinator |
| 客户端状态生成 | Client State Projector |
| 客户端状态 | Scoped State Tree |
| 完整同步 | `state.snapshot` |
| 单 Scope 更新 | `scope.replace` |
| 多 Scope 更新 | `state.snapshot` |
| 地图切换 | 强制 `state.snapshot` |
| 消息顺序 | 单调递增 `sequence` |
| 状态版本 | Client State Revision + Scope Revision |
| 业务扩展 | Scope + Tag + Data Schema |
| 节点事件 | Scope + Key + Event + Data |
| Runtime Event | 独立事件通道 |
| 资源 | 独立资源接口 |
| Resync | 重发当前 Client State，不增加 Revision |
| 节点级 Patch | 第一阶段不实现 |
| 固定业务 DTO | 不定义 |
| Runtime 状态直传 | 禁止 |

## 23. 当前结论

LoomRealm Runtime RPC 消费 Client State Projector 产生的 Projection Commit，并通过完整快照或单 Scope 替换保持 Web Client 状态一致。Runtime Service 不直接调用 Core、不生成 Scope Tree、不分配 Client Revision；业务通过 Scope、Tag、Data Schema 和事件 Schema 扩展，而不通过新增固定 RPG RPC 扩展基础协议。