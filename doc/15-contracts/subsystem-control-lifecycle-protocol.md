# Main ⇄ Subsystem 控制与运行时生命周期协议草案

> 层级：正式契约  
> 状态：Draft  
> 稳定程度：Experimental  
> 主要定义：Main ⇄ Subsystem Control Connection 的建立、Subsystem 身份绑定、Runtime 生命周期状态报告与 ready 语义  
> 依赖：[运行时启动与连接建立系统](../10-architecture/runtime-bootstrap-system.md)、[运行承载系统](../10-architecture/runtime-hosting-system.md)、[通信系统](../10-architecture/communication-system.md)、[Subsystem Descriptor MVP ADR](../decisions/0007-subsystem-descriptor-mvp.md)  
> 被以下草案继续使用：[模块子系统生命周期与调用协议草案](./system-lifecycle-protocol.md)  
> 最近复核：2026-08-02

本文档定义一个已经由 LoomRealm Main 启动的 Subsystem Runtime Container，如何主动连接 Main、完成身份绑定，并通过长期 Control Connection 报告 Runtime 生命周期状态。

核心原则：

> `ready` 不是独立协议，而是 Subsystem Runtime Lifecycle Protocol 中的一个状态。Main 同时结合 Process / Worker Supervisor、Control Connection 状态、身份绑定结果和 Subsystem 自报告状态，维护最终 Runtime Container 状态。

本文使用 `MUST`、`MUST NOT`、`SHOULD`、`MAY` 表达规范强度。

## 1. 适用范围

本协议适用于：

```text
LoomRealm Main
        ⇅
Main ⇄ Subsystem Control Connection
        ⇅
Subsystem Runtime Container
```

桌面 MVP：

```text
Main
    LoomRealm Main Process

Subsystem
    一个 descriptor.key 对应的 Node.js Process

Transport
    localhost WebSocket
```

PWA 或其他 Host Profile 可以使用不同 Transport，但必须保持本协议的身份、状态和生命周期语义。

协议公共语义使用 `Subsystem`、`Runtime`、`Runtime Container`、`Control Connection`，不将 OS Process 作为业务身份。

### 1.1 本协议包含

- Subsystem 主动连接 Main；
- Bootstrap Credential；
- `subsystem.hello`；
- Control Protocol Version 协商；
- Control Connection 与 `descriptor.key` 的绑定；
- `subsystem.status`；
- `initializing / ready / stopping / failed` Runtime Status；
- Main 观察状态与 Runtime 自报告状态的映射；
- 启动阶段的故障和重复连接原则。

### 1.2 本协议不包含

- Frame create / activate / suspend / resume / close；
- Subsystem 调用和返回；
- Renderer Data Connection 的 Grant 或认证；
- Render Update；
- User Input；
- Content API；
- Runtime restart / resume 的完整协议。

## 2. 前置条件

在建立本协议连接前，Main 已经：

```text
读取 Game Entry
→ 一次性读取全部 Subsystem Descriptor
→ 校验完整 Descriptor 集合
→ 为每个 Descriptor 创建启动记录
→ 启动全部 required Subsystem
```

当前 MVP Descriptor 概念结构：

```ts
interface SubsystemDescriptor {
  readonly key: string;
  readonly launcher: {
    readonly type: "nodejs";
    readonly entry: string;
  };
  readonly env?: Readonly<Record<string, string>>;
}
```

`descriptor.key` 是 Subsystem 的全局唯一、稳定身份。本协议不重新定义 Descriptor Schema、`key` 字符集或 `launcher.entry` 路径安全规则。

## 3. Control Connection 协议分层

Main ⇄ Subsystem 长期 Control Connection 至少区分：

```text
Main ⇄ Subsystem Control Connection
│
├── Connection / Bootstrap
│   └── subsystem.hello
│
├── Runtime Lifecycle
│   └── subsystem.status
│
└── 后续 Control Protocol
    ├── Frame Control
    ├── Shutdown
    └── 其他控制能力
```

本协议只冻结前两个职责域。

成功完成 Bootstrap 后，同一条 Control Connection 可以继续承载后续 Main ⇄ Subsystem Control Protocol；不要求重新建立物理连接。

## 4. Transport

桌面 MVP 使用 localhost WebSocket。

连接方向固定为：

```text
Subsystem Runtime
    ── connect ──▶
LoomRealm Main Control WebSocket Server
```

Main MUST 在启动 Subsystem Runtime 前使 Main Control Endpoint 可连接。

Subsystem 不需要为 Main Control 自行开放监听端口。

Transport Connected 只表示底层连接已经建立，不表示 Main 已确认对端身份，也不表示 Runtime ready。

## 5. 启动上下文

Main 启动一个 Subsystem Runtime 时，MUST 向该 Runtime 提供至少以下概念信息：

```text
Subsystem Descriptor Key
Main Control Endpoint
Bootstrap Credential
```

桌面 MVP 可以通过 Main 保留环境变量注入这些值。

精确环境变量名不在本协议中冻结。

Descriptor 自定义 `env` MUST NOT 覆盖 LoomRealm 保留启动字段。

## 6. Bootstrap Credential

Main MUST 为每一次 Subsystem Launch Attempt 生成独立 Bootstrap Credential。

MVP 推荐使用高熵随机 Bootstrap Token。

Bootstrap Credential MUST 满足：

- 每次 Launch Attempt 重新生成；
- 只绑定一个 Launch Attempt；
- 只允许成功认证一次；
- 成功认证后不可再次使用；
- 不应出现在普通日志中；
- 不以 OS PID、端口号或 Worker 名称代替。

Bootstrap Credential 用于证明：

> 当前连接者持有 Main 启动该 Subsystem Runtime 时注入的启动秘密。

Bootstrap Credential 不是稳定 Subsystem identity。稳定身份始终是 `descriptor.key`。

Bootstrap Token 的精确字节长度和编码格式待后续冻结。

## 7. Main Launch Record

Main SHOULD 为每次启动维护内部 Launch Record，例如：

```ts
interface SubsystemLaunchRecord {
  descriptorKey: string;
  launchId: string;
  bootstrapCredential: string;
  status: MainObservedSubsystemState;
}
```

`launchId` 用于 Main 内部区分同一个 `descriptor.key` 的不同启动尝试。

MVP 不要求 `launchId` 出现在公共协议中。

重新启动同一个 Descriptor 时 SHOULD 生成新的 `launchId` 和新的 Bootstrap Credential。

## 8. 两套状态必须分离

本协议区分：

1. Main-observed Runtime Container State；
2. Subsystem-reported Runtime Status。

Runtime 自报告状态不是 Process / Worker Supervisor 的替代品。

### 8.1 Main-observed Runtime Container State

Main 综合本地监督和协议事件维护：

```text
declared
→ starting
→ connected
→ identified
→ ready
→ stopping
→ stopped
```

任意有效运行阶段都可能进入：

```text
failed
```

定义：

- `declared`：Descriptor 已进入本次会话 Registry；
- `starting`：Main 已开始启动 Runtime；
- `connected`：Control Transport 已建立，但身份尚未确认；
- `identified`：`subsystem.hello` 成功，连接已绑定到确定的 `descriptor.key`；
- `ready`：Main 已收到并接受合法 `subsystem.status(state = "ready")`；
- `stopping`：Runtime 正在正常终止；
- `stopped`：Runtime 已正常停止；
- `failed`：Runtime 无法继续提供合法服务。

### 8.2 Subsystem-reported Runtime Status

MVP Runtime Status：

```ts
type SubsystemRuntimeStatus =
  | "initializing"
  | "ready"
  | "stopping"
  | "failed";
```

这些状态表达 Runtime 自己认为当前处于什么生命周期阶段。

## 9. Connection Bootstrap

WebSocket 建立成功后：

```text
Main observed state:
starting → connected
```

此时连接：

- 尚未绑定 Subsystem identity；
- MUST NOT 调用普通业务 Control Method；
- MUST 首先完成 `subsystem.hello`。

新 Control Connection 上第一条业务协议消息 MUST 是 `subsystem.hello`。

## 10. `subsystem.hello`

### 10.1 类型和方向

```text
Method: subsystem.hello
JSON-RPC Type: Request
Direction: Subsystem → Main
```

### 10.2 目的

`subsystem.hello` 完成：

1. Subsystem 身份声明；
2. Bootstrap Credential 校验；
3. 当前 Control Connection 与 Descriptor 绑定；
4. Main ⇄ Subsystem Control Protocol Version 协商。

`subsystem.hello` 成功不表示 Runtime 已完成初始化。

### 10.3 Request Schema

概念 Schema：

```ts
interface SubsystemHelloParams {
  key: string;
  token: string;
  protocols: {
    control: readonly number[];
  };
}
```

示例：

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "subsystem.hello",
  "params": {
    "key": "loom.map",
    "token": "<bootstrap-token>",
    "protocols": {
      "control": [1]
    }
  }
}
```

### 10.4 `key`

`params.key` MUST 对应 Main 当前某个正在启动的 Subsystem Descriptor：

```text
params.key == descriptor.key
```

`key` 不是显示名称。

### 10.5 `token`

`params.token` MUST 是 Main 为该 Launch Attempt 注入的有效 Bootstrap Credential。

Main MUST 验证：

```text
token exists
token belongs to params.key launch attempt
token is not expired
token has not already been consumed
```

成功认证后，Main MUST 使该 Credential 不可再次成功认证其他连接。

### 10.6 Protocol Version Offer

Subsystem 提供自己支持的 Control Protocol Version 集合：

```json
{
  "protocols": {
    "control": [1]
  }
}
```

MVP `hello` 只协商 Main ⇄ Subsystem Control Protocol。

以下协议版本 MUST NOT 因本次 `hello` 而隐式视为已协商：

- Renderer ⇄ Subsystem Connection Protocol；
- Render Update Protocol；
- User Input Protocol；
- Content API。

### 10.7 Main 校验

Main 至少 MUST 校验：

- 当前连接尚未 identified；
- `key` 已在本次会话声明；
- `key` 当前存在 active Launch Attempt；
- Bootstrap Credential 匹配且未消费；
- 没有其他有效 Control Connection 已绑定该 Launch Attempt；
- 存在共同支持的 Control Protocol Version。

全部通过后：

```text
connected → identified
```

Main MUST 将当前 Control Connection 绑定到该 `descriptor.key`。

### 10.8 Hello Response

成功 Response 至少返回最终选择的 Control Protocol Version。

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "protocols": {
      "control": 1
    }
  }
}
```

Session identity、诊断 metadata 或其他能力可以以后扩展，但不是 MVP Bootstrap 成功条件。

## 11. Connection-bound Identity

`subsystem.hello` 成功以后，当前 Control Connection 已具有唯一 Subsystem identity。

后续 Control Method MUST 根据：

```text
current Control Connection → descriptor.key
```

确定当前 Subsystem。

Runtime Lifecycle 消息 SHOULD NOT 重复携带 `key`，避免出现“connection-bound identity”和“message key”两个身份来源。

例如推荐：

```json
{
  "jsonrpc": "2.0",
  "method": "subsystem.status",
  "params": {
    "state": "ready"
  }
}
```

而不是在每条状态消息中重复 `key`。

## 12. Runtime Lifecycle Protocol

Subsystem Runtime 通过统一方法 `subsystem.status` 报告生命周期状态。

```text
Method: subsystem.status
JSON-RPC Type: Notification
Direction: Subsystem → Main
```

该消息表达：

> Runtime 当前进入了某个生命周期状态。

Main 不需要“批准” Runtime 是否已经失败或正在停止，因此 MVP 使用 Notification。

Main MUST 校验状态 Schema 和状态转换是否合法，并据此更新 Main-observed Runtime State。

## 13. `subsystem.status` Schema

概念 Schema：

```ts
type SubsystemStatusParams =
  | InitializingStatus
  | ReadyStatus
  | StoppingStatus
  | FailedStatus;

interface InitializingStatus {
  state: "initializing";
}

interface ReadyStatus {
  state: "ready";
  rendererDataEndpoint: {
    transport: "websocket";
    url: string;
  };
}

interface StoppingStatus {
  state: "stopping";
}

interface FailedStatus {
  state: "failed";
  error: {
    code: string;
    message?: string;
  };
}
```

`rendererDataEndpoint` 的最终跨平台 Schema 仍待 Renderer ⇄ Subsystem Connection Contract 冻结；本协议只冻结 ready 时必须已经具备可供 Main 后续授权使用的 Data Endpoint 信息。

## 14. `initializing`

示例：

```json
{
  "jsonrpc": "2.0",
  "method": "subsystem.status",
  "params": {
    "state": "initializing"
  }
}
```

语义：

- `subsystem.hello` 已完成；
- Runtime 正在执行 required initialization；
- Runtime 尚不可视为 ready。

MVP MAY 将 hello 成功后的默认 Runtime Status 视为 `initializing`。是否强制 Runtime 显式发送第一次 `initializing` Notification，在最终 Schema 冻结时决定。

## 15. `ready`

示例：

```json
{
  "jsonrpc": "2.0",
  "method": "subsystem.status",
  "params": {
    "state": "ready",
    "rendererDataEndpoint": {
      "transport": "websocket",
      "url": "ws://127.0.0.1:49152"
    }
  }
}
```

Subsystem 报告 `ready` MUST 表示：

1. 当前 Control Connection 已完成身份绑定；
2. Runtime required initialization 已完成；
3. Runtime 可以接受后续 Main Control Protocol 请求；
4. Renderer Data Endpoint 已经建立，可以用于后续 Data Connection Bootstrap。

`ready` MUST NOT 被解释为：

- Renderer 已经连接；
- Renderer Data Connection 已认证；
- 已存在任何 Frame；
- 已存在任何 Render；
- 已存在 Input Target；
- 游戏内容已经全部预加载。

Main 接受合法 `ready` 后：

```text
identified → ready
```

## 16. Renderer Data Endpoint 与 Grant 分离

`ready.rendererDataEndpoint` 只表达：

> 当前 Runtime 的 Renderer Data Server 在哪里。

它不授予 Renderer 连接权限。

职责分离：

```text
Subsystem Runtime Lifecycle
    提供 Data Endpoint

Main Connection Authority
    签发 Grant / Credential

Renderer ⇄ Subsystem Connection Layer
    建立并认证 Data Connection
```

Renderer Data Connection Grant / Credential 不属于本协议。

## 17. `stopping`

示例：

```json
{
  "jsonrpc": "2.0",
  "method": "subsystem.status",
  "params": {
    "state": "stopping"
  }
}
```

`stopping` 表示 Runtime 已进入正常终止流程。

它主要用于：

- graceful shutdown；
- Main 状态同步；
- diagnostics。

`stopping` 不表示 Process / Worker 已退出。

最终 `stopped` 由 Control Connection 关闭和 Process / Worker Supervisor 共同确认。

## 18. `failed`

示例：

```json
{
  "jsonrpc": "2.0",
  "method": "subsystem.status",
  "params": {
    "state": "failed",
    "error": {
      "code": "INITIALIZATION_FAILED",
      "message": "Unable to initialize runtime"
    }
  }
}
```

`failed` 表示 Runtime 自己确认发生不可恢复错误，无法继续提供合法 Runtime 服务。

发送 `failed` 后，Runtime SHOULD 进入退出流程或等待 Main 强制终止。

## 19. `failed` 不是唯一故障来源

Main MUST NOT 依赖 `subsystem.status(state = "failed")` 作为唯一故障检测机制。

以下情况均可以直接使 Main 将 Runtime 标记为 `failed`：

- spawn error；
- connect timeout；
- hello timeout；
- invalid Bootstrap Credential；
- unsupported Control Protocol Version；
- Control Connection 非预期关闭；
- ready timeout；
- Process / Worker 非正常退出；
- 非法协议状态转换。

Runtime 可能在崩溃前来不及发送 `failed`。

## 20. Runtime Status 状态转换

正常路径：

```text
initializing
    ↓
ready
    ↓
stopping
```

失败路径：

```text
initializing ─────▶ failed
ready ────────────▶ failed
stopping ─────────▶ failed
```

MVP 以下转换非法：

```text
ready → initializing
failed → ready
stopping → ready
```

未来如需要 Runtime recovery、degraded 或 restart，必须显式扩展状态机，不能把非法转换当作隐式恢复。

## 21. Main 综合状态转换

Main 侧成功路径：

```text
DECLARED
    │ spawn
    ▼
STARTING
    │ Transport connected
    ▼
CONNECTED
    │ subsystem.hello accepted
    ▼
IDENTIFIED
    │ subsystem.status(ready)
    ▼
READY
    │ subsystem.status(stopping)
    ▼
STOPPING
    │ Process / Worker exits normally
    ▼
STOPPED
```

任一相关阶段都可以进入：

```text
FAILED
```

其中：

```text
CONNECTED ≠ IDENTIFIED ≠ READY
```

三者分别表示 Transport 建立、身份确认、Runtime 可服务，不得合并。

## 22. 重复连接与 Credential 重放

MVP：每个 Launch Attempt 最多只有一条成功 identified 的 Control Connection。

若某 Launch Attempt 已处于 `identified / ready / stopping`，又有连接尝试使用同一身份和 Credential 完成 `subsystem.hello`，Main MUST 拒绝。

MVP MUST NOT 自动使用新连接替换旧的 identified Control Connection。

成功完成 `subsystem.hello` 后，Bootstrap Credential MUST 视为 consumed。再次使用相同 Credential MUST 被拒绝，即使第一次 Control Connection 随后断开。

Runtime Restart 必须形成新的 Launch Attempt，并使用新的 Bootstrap Credential。

## 23. Timeout

实现 MUST 支持至少以下概念超时：

```text
connect timeout
hello timeout
ready timeout
graceful stopping timeout
```

本协议冻结这些超时阶段必须存在，但不冻结统一时间数值。

默认数值可以由 Host Profile / Runtime Configuration 定义。

## 24. Control Connection 非预期断开

如果 Runtime 在 `connected / identified / ready` 期间 Control Connection 非预期关闭，Main MUST 认为该 Runtime Control Plane 已失效。

MVP 默认：

```text
→ failed
```

MVP 不支持同一 Launch Attempt 自动重连或 Resume。

未来如需要 Control Connection Resume，必须设计独立恢复协议。

## 25. Process / Worker Exit

Process / Worker Supervisor 发现 Runtime Container 已退出时：

- 若此前处于 `stopping`，且退出符合正常 shutdown 流程，Main MAY 转为 `stopped`；
- 否则 Main MUST 转为 `failed`。

精确 exit code 与 failure reason 映射属于 Host Profile / Supervisor 实现细节。

## 26. Game Bootstrap 完成条件

Runtime `ready` 是单个 Subsystem 的状态。

当前 MVP Game Entry 中全部 Descriptor 都是 required，因此：

```text
every declared Subsystem == READY
```

是 Subsystem Bootstrap Complete 的必要条件。

任一 required Subsystem 在启动阶段进入 `failed`：

```text
Game Bootstrap → FAILED
```

MVP 不支持 unavailable-but-continue，也不定义 lazy Subsystem。

## 27. Protocol Error

以下行为属于 Protocol Error：

- `subsystem.hello` 不是新连接上的第一条业务消息；
- `hello` 使用未知 `key`；
- Bootstrap Credential 不匹配；
- 重放已消费 Credential；
- 没有共同 Control Protocol Version；
- `subsystem.status` 在 hello 成功前发送；
- `ready` 缺少 required Data Endpoint 信息；
- 非法 Runtime Status 状态转换；
- 一个 Launch Attempt 尝试建立第二条 identified Control Connection。

严重 Protocol Error MAY 直接导致：

```text
Control Connection close
Runtime → failed
```

## 28. 错误分类

最终 JSON-RPC Error Code 数值尚未冻结，但错误至少应区分：

```text
BOOTSTRAP_IDENTITY_ERROR
BOOTSTRAP_CREDENTIAL_ERROR
PROTOCOL_VERSION_ERROR
PROTOCOL_STATE_ERROR
INITIALIZATION_FAILED
CONTROL_CONNECTION_LOST
STARTUP_TIMEOUT
RUNTIME_EXITED
```

业务错误 MUST NOT 混入 Bootstrap / Runtime Lifecycle Error。

## 29. 成功时序

```text
Main                                      Subsystem
 │                                            │
 │ spawn(nodejs)                              │
 │───────────────────────────────────────────▶│
 │                                            │
 │               WebSocket connect            │
 │◀───────────────────────────────────────────│
 │                                            │
 │          subsystem.hello Request           │
 │◀───────────────────────────────────────────│
 │    key + token + protocol version offer    │
 │                                            │
 │ validate identity / credential / version   │
 │ consume bootstrap credential               │
 │ bind Control Connection to descriptor.key  │
 │                                            │
 │          subsystem.hello Response          │
 │───────────────────────────────────────────▶│
 │                                            │
 │                 initialize runtime         │
 │                                            │
 │      subsystem.status(initializing)        │
 │◀───────────────────────────────────────────│
 │                                            │
 │             start Data Endpoint            │
 │                                            │
 │          subsystem.status(ready)           │
 │◀───────────────────────────────────────────│
 │          rendererDataEndpoint              │
 │                                            │
 │ Main marks Runtime READY                   │
 │                                            │
```

## 30. 初始化失败时序

```text
Main                                      Subsystem
 │                                            │
 │               hello complete               │
 │                                            │
 │               initialization               │
 │                                            │
 │          subsystem.status(failed)          │
 │◀───────────────────────────────────────────│
 │                                            │
 │ mark Runtime FAILED                        │
 │ Game Bootstrap FAILED if required          │
```

如果 Runtime 在报告失败前直接崩溃，Main 仍必须通过 Supervisor / Control Connection 断开检测并进入 `failed`。

## 31. 架构不变量

1. 一个 Descriptor `key` 同时最多对应一个有效 Runtime Container；
2. 一个 Launch Attempt 最多绑定一条有效 Main Control Connection；
3. Subsystem 主动连接 Main；
4. Transport Connected 不等于 Runtime identified；
5. `subsystem.hello` 成功后 Control Connection identity 固定；
6. 后续 Runtime Lifecycle 消息不重复携带 Subsystem key；
7. `ready` 是 Runtime Lifecycle Status，不是独立协议；
8. Runtime Lifecycle 自报告状态不替代 Process / Worker Supervisor；
9. Runtime ready 不意味着 Renderer Data Connection 已建立；
10. Runtime ready 不依赖任何 Frame；
11. Runtime ready 不依赖任何 Render；
12. 当前 MVP 任一 required Subsystem 启动失败都会导致 Game Bootstrap 失败。

## 32. 待冻结内容

以下内容留给后续契约细化：

- JSON-RPC Error Code 的精确整数值；
- Bootstrap Token 字节长度和编码格式；
- Main 保留环境变量的精确名称；
- `rendererDataEndpoint` 的最终跨平台 Schema；
- Control Protocol Version Schema 的扩展规则；
- 各阶段 timeout 默认值；
- graceful shutdown 的 Main → Subsystem 方法；
- heartbeat / health protocol；
- Runtime Restart Policy；
- Control Connection Resume；
- PWA Transport Profile 的 Bootstrap Credential 传递方式。

这些开放项不得改变本文已经确定的身份、连接方向和生命周期职责边界。

## 33. 最小互操作测试

协议进入 Normative 前至少需要覆盖：

- 合法 `hello` 成功绑定 `descriptor.key`；
- 未知 `key` 被拒绝；
- 错误 Bootstrap Credential 被拒绝；
- Credential 成功使用后重放被拒绝；
- 无共同 Control Protocol Version 时 Bootstrap 失败；
- hello 前发送 `subsystem.status` 被拒绝；
- `initializing → ready` 成功；
- `ready` 缺少 Data Endpoint 时失败；
- 非法状态转换被拒绝；
- 第二条 identified Control Connection 被拒绝；
- Control Connection 非预期断开导致 Runtime failed；
- Process 在 ready 前退出导致 Runtime / Game Bootstrap failed；
- 多个 required Subsystem 并行启动，只有全部 ready 后 Game Bootstrap 才完成；
- Runtime ready 时没有任何 Frame / Render 仍然合法。

## 34. 相关文档

- [运行时启动与连接建立系统](../10-architecture/runtime-bootstrap-system.md)；
- [系统架构总览](../10-architecture/system-overview.md)；
- [运行承载系统](../10-architecture/runtime-hosting-system.md)；
- [通信系统](../10-architecture/communication-system.md)；
- [Subsystem Descriptor MVP ADR](../decisions/0007-subsystem-descriptor-mvp.md)；
- [模块子系统生命周期与调用协议草案](./system-lifecycle-protocol.md)；
- [正式契约目录](./README.md)。
