# 运行时通信与状态同步

## 1. 文档目的

本文档定义 LoomRealm Runtime Server 与 Web Client 之间的通信方向、状态同步语义、事件边界和传输适配规则。

客户端状态的具体数据结构由以下文档定义：

- [`client-state-tree-protocol.md`](./client-state-tree-protocol.md)

核心原则：

> 通信协议提供通用状态同步和事件传递能力，不围绕地图、人物、菜单、对话框或其他具体业务不断增加固定 RPC 接口。

## 2. 通信能力

Runtime RPC 只建立两类通用能力：

```text
状态同步
    描述客户端现在应该呈现什么

事件传递
    描述客户端或运行时发生了一次什么动作
```

业务差异体现在：

- Scope 名称；
- Client Node Tag；
- Tag 对应的 Data Schema；
- 事件名称和事件 Data。

基础通信层不预定义固定 RPG 业务 DTO。

## 3. 权威状态原则

Runtime Core 是游戏规则和会话状态的权威来源。

Runtime 负责决定：

- 当前游戏状态；
- 人物位置和行为结果；
- 碰撞结果；
- Portal 和地图切换结果；
- 暂停和恢复结果；
- 其他影响游戏规则的状态变化。

Web Client 负责：

- 采集并归一化用户输入；
- 维护 Client State 本地镜像；
- 将 Scoped State Tree 协调为 DOM；
- 管理不影响游戏规则的临时视觉状态；
- 按资源 Key 请求和缓存资源。

客户端不得通过直接修改共享对象来改变权威状态。客户端发送事件或输入意图，由 Runtime 处理并同步新的客户端状态。

## 4. Runtime 状态与 Client State

Runtime 内部状态不能直接序列化给客户端。

```text
Runtime Core
    权威状态和游戏规则
        ↓
Client State Projectors
    投影为 Scope Tree
        ↓
Runtime Service
    发送状态消息
        ↓
Web Client
    更新 Client Store 和 DOM
```

Client State 使用通用 Scope Tree：

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

## 5. JSON-RPC 的定位

第一阶段使用 JSON-RPC 作为消息承载语义。

JSON-RPC 负责：

- 请求与响应关联；
- 通知消息封装；
- 方法名称空间；
- 错误结果封装。

JSON-RPC 不负责：

- 建模地图和人物；
- 定义 Client Node Tag；
- 决定 Runtime 内部模块；
- 充当 DOM 操作协议；
- 传递可执行代码。

协议层与传输层分离：

```text
Runtime RPC 语义
├── 远程 WebSocket
├── 本机 WebSocket
├── Dedicated Worker MessagePort
└── 后续其他双向传输
```

不同传输适配必须承载相同的状态与事件语义。

## 6. 消息顺序

每个 Server → Client 状态或事件通知必须包含单调递增的消息序号：

```ts
interface RuntimeMessageMeta {
  readonly protocolVersion: 1;
  readonly sequence: number;
}
```

客户端维护最后成功应用的序号。

规则：

```text
sequence <= lastSequence
→ 忽略重复或过期消息

sequence == lastSequence + 1
→ 正常应用

sequence > lastSequence + 1
→ 状态基础不确定，请求完整快照
```

重新建立连接后，客户端不能假定旧连接的消息仍然连续，应先获取完整状态。

## 7. 完整状态同步

完整状态用于：

- 首次连接；
- 页面重新加载；
- 网络重新连接；
- 检测到 Sequence 缺口；
- 客户端状态校验失败；
- 客户端主动请求恢复。

状态内容：

```ts
interface ClientStateSnapshotMessage {
  readonly type: "state.snapshot";
  readonly state: ClientState;
}
```

客户端收到完整状态后：

1. 验证协议版本；
2. 验证 Scope 和节点结构；
3. 用新 Client State 替换本地镜像；
4. 按 Scope 和 Key 协调 DOM；
5. 将该消息 Sequence 记录为最新序号。

完整状态描述目标结果，不要求客户端重放此前事件。

## 8. Scope 替换

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

这与删除 Scope 不同。

客户端收到 `scope.replace` 后，可以通过稳定 Key 对新旧树做 DOM 协调，不要求销毁所有节点。

第一阶段不实现：

- 节点级 Patch；
- JSON Patch；
- 服务端 DOM 指令；
- ECS Component Replication；
- 任意 HTML 字符串替换。

## 9. 状态版本

状态树内部有两级版本：

```text
ClientState.revision
    整个客户端目标状态版本

ClientScope.revision
    单个 Scope 目标树版本
```

版本和消息 Sequence 的用途不同：

```text
sequence
    检测通信消息顺序和缺口

revision
    判断客户端状态内容的新旧关系
```

客户端不得使用较旧 Scope Revision 覆盖较新 Scope。

当 Revision 关系与消息 Sequence 无法一致解释时，应放弃局部更新并请求完整状态。

## 10. Client Store

Web Client 应维护独立于 DOM 的状态镜像：

```ts
interface ClientStore {
  readonly state: ClientState | null;
  readonly lastSequence: number;
}
```

消息处理应先更新 Client Store，再由渲染协调器更新 DOM。

```text
Runtime Message
→ 验证 Sequence 和 Revision
→ 更新 Client Store
→ 协调受影响 Scope
→ 更新 DOM
```

WebSocket、Worker 或其他传输回调不得直接散布 DOM 修改逻辑。

## 11. 事件传递

事件用于表达一次动作或瞬时通知。

事件通道是双向的：

```text
Web Client
→ 用户输入或节点事件
→ Runtime Service

Runtime Service
→ 一次性通知或表现事件
→ Web Client
```

### 11.1 节点事件

自定义节点可以通过 Scope 和 Key 定位事件来源：

```ts
interface ClientNodeEvent {
  readonly type: "node.event";
  readonly scope: string;
  readonly key: string;
  readonly event: string;
  readonly data?: JsonValue;
}
```

节点事件不代表客户端可以任意调用 Runtime 内部方法。Runtime Service 必须根据当前 Client State 和业务路由验证事件来源与权限。

### 11.2 全局输入

键盘方向、手柄轴等高频全局输入可以使用独立的归一化输入事件。

基础协议不要求把所有输入伪装成 DOM 节点事件。

客户端不得发送原始 Browser Event 对象。

### 11.3 Runtime 事件

Runtime → Client 的一次性事件适用于：

- 音效或短暂表现触发；
- 日志、警告和错误通知；
- 不需要重新连接后恢复的提示；
- 客户端本地过渡行为。

需要重新连接后恢复的内容必须进入 Client State，而不能只依赖事件。

## 12. 状态与事件边界

```text
状态
    系统当前可观察结果
    可通过完整同步恢复

事件
    一次动作或瞬时通知
    不作为长期状态来源
```

原则：

- 用户输入属于事件；
- 用户输入产生的最终结果属于状态；
- 可恢复界面内容属于 Scope Tree；
- 一次性表现可以使用事件；
- 事件可以触发状态变化，但不能替代状态同步。

## 13. 资源传输边界

图片等资源主体不进入 Client State Tree。

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

## 14. Hostra 边界

Hostra Control RPC 与 LoomRealm Runtime RPC 是两个独立协议域：

```text
Hostra Control RPC
    窗口、宿主和进程协调

LoomRealm Runtime RPC
    Client State、事件和资源访问
```

Hostra 不保存、代理或修改权威游戏状态。

Hostra 桌面模式下，Web Client 仍然直接使用 Runtime RPC 语义连接本地 Runtime Service。

## 15. 运行环境

### 15.1 远程 Runtime

```text
Web Client
→ WebSocket
→ Runtime Service
```

### 15.2 Hostra 本地 Runtime

```text
Hostra
→ 启动本地 Runtime Service
→ 打开 Web Client
→ Web Client 连接本机 Runtime RPC
```

### 15.3 浏览器本地 Runtime

```text
Web Client
→ Dedicated Worker MessagePort
→ 浏览器本地 Runtime
```

Service Worker 不作为第一阶段默认持续 Runtime，因为其生命周期不适合保存唯一权威会话状态。

## 16. 错误与恢复

以下情况需要请求完整状态：

- 消息 Sequence 出现缺口；
- State Revision 不连续或倒退；
- Scope Revision 冲突；
- 一个 Scope 内出现重复 Key；
- Tag 未注册；
- Tree 验证失败；
- 客户端协调器出现不可恢复错误。

客户端不得在状态基础不确定时继续盲目应用局部更新。

协议错误应与业务命令拒绝分开：

```text
协议错误
    消息、版本、Tree 或 Sequence 无效

业务拒绝
    当前游戏状态不接受某次用户意图
```

## 17. 第一阶段闭环

```text
用户输入
→ Client 发送归一化事件
→ Runtime Service 调用 Runtime Core
→ Runtime 更新权威状态
→ Client State Projector 更新 Scope Tree
→ Runtime Service 发送 state.snapshot 或 scope.replace
→ Client Store 应用状态
→ DOM 协调器按 Scope、Key 和 Tag 更新 DOM
```

地图和人物图片由资源接口另行加载。

## 18. 第一阶段不实现

- 固定地图、人物、HUD 或菜单 RPC；
- 固定 RPG Client DTO；
- 节点级 Patch；
- 客户端预测和 Server 校正；
- 多人同步；
- 复杂断线重放；
- 通用分布式状态系统；
- Hostra Control RPC 承载游戏业务；
- Server 下发任意 HTML、CSS 或 JavaScript；
- 客户端直接修改 Runtime 权威状态。

## 19. 已冻结决策

| 问题 | 第一阶段结论 |
|---|---|
| 消息承载 | JSON-RPC |
| 传输 | WebSocket 或 MessagePort 适配 |
| 权威状态 | Runtime Core |
| 客户端状态 | Scoped State Tree |
| 完整同步 | `state.snapshot` |
| 正常状态更新 | `scope.replace` |
| 消息顺序 | 单调递增 `sequence` |
| 状态版本 | State Revision + Scope Revision |
| 业务扩展 | Scope + Tag + Data Schema |
| 节点事件 | Scope + Key + Event + Data |
| 资源 | 独立资源接口 |
| 节点级 Patch | 第一阶段不实现 |
| 固定业务 DTO | 不定义 |
| Runtime 状态直传 | 禁止 |

## 20. 当前结论

LoomRealm 的 Runtime 通信使用通用状态同步和事件通道。客户端可见状态统一投影为 Scoped State Tree，通过完整快照和 Scope 替换保持一致；业务通过 Scope、Tag 和 Data Schema 扩展，不通过新增固定 RPC 或固定 RPG DTO 扩展基础协议。