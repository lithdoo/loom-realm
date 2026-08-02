# Main ⇄ Subsystem 控制与运行时生命周期协议 v1 Schema 草案

> 层级：正式契约  
> 状态：Draft  
> 协议版本：1  
> 稳定程度：Stabilizing  
> 主要定义：Main ⇄ Subsystem Control Connection 的 Bootstrap、Subsystem 身份绑定、Runtime 生命周期状态 Schema、状态转换与错误行为  
> 依赖：[运行时启动与连接建立系统](../10-architecture/runtime-bootstrap-system.md)、[运行承载系统](../10-architecture/runtime-hosting-system.md)、[通信系统](../10-architecture/communication-system.md)、[Subsystem Descriptor MVP ADR](../decisions/0007-subsystem-descriptor-mvp.md)  
> 被以下草案继续使用：[模块子系统生命周期与调用协议草案](./system-lifecycle-protocol.md)  
> 最近复核：2026-08-02

本文档冻结 LoomRealm Control Protocol v1 中已经确认的 Main ⇄ Subsystem Bootstrap 与 Runtime Lifecycle wire schema。

核心原则：

> `ready` 不是独立协议，而是 `subsystem.status` 中的一个 Runtime 生命周期状态。Main 同时结合 Process / Worker Supervisor、Control Connection 状态、`subsystem.hello` 身份绑定结果和 Runtime 自报告状态，维护最终 Runtime Container 状态。

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

PWA 或其他 Host Profile 可以使用不同 Transport，但 MUST 保持本文的身份、状态和生命周期语义。

公共协议使用 `Subsystem`、`Runtime`、`Runtime Container`、`Control Connection`，不将 OS Process 作为业务身份。

### 1.1 本协议冻结

- Subsystem 主动连接 Main；
- `subsystem.hello` Request 的最终 v1 字段；
- Bootstrap Token 的使用语义；
- Control Protocol Version 协商；
- Control Connection 与 `descriptor.key` 的永久绑定；
- `subsystem.status` Notification 的最终 v1 discriminated union；
- `initializing / ready / stopping / failed` 的合法转换；
- 重复状态和逆向状态转换的 fatal error 行为；
- Main-observed State 与 Runtime-reported Status 的职责分离；
- Desktop v1 Renderer Data Endpoint Schema；
- Runtime `ready`、`failed` 与 Game Bootstrap 的关系。

### 1.2 本协议不冻结

- Frame create / activate / suspend / resume / close；
- Subsystem 调用和返回；
- Renderer Data Connection 的 Grant / Credential / Authentication；
- Render Update；
- User Input；
- Content API；
- graceful shutdown 的 Main → Subsystem 方法；
- heartbeat / health；
- Runtime restart / resume；
- Bootstrap Token 的字节长度和编码；
- JSON-RPC application error 的最终整数 code；
- 各 timeout 的默认数值；
- PWA Bootstrap Credential Transport Profile。

## 2. 前置条件

Main 建立本协议前已经：

```text
读取 Game Entry
→ 一次性读取全部 Subsystem Descriptor
→ 校验完整 Descriptor 集合
→ 为每个 Descriptor 创建 Launch Attempt
→ 启动全部 required Subsystem
```

当前 Descriptor 概念结构：

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

`descriptor.key` 是稳定 Subsystem identity。本协议不重新冻结其字符集或命名空间格式。

## 3. Control Connection 分层

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

v1 Bootstrap 成功后，同一条 Control Connection MAY 继续承载后续控制方法。

## 4. Transport 与连接方向

桌面 MVP 使用 localhost WebSocket。

连接方向固定为：

```text
Subsystem Runtime
    ── connect ──▶
LoomRealm Main Control WebSocket Server
```

Main MUST 在启动 Subsystem Runtime 前使 Main Control Endpoint 可连接。

Transport connected 只表示底层连接建立：

```text
connected ≠ identified ≠ ready
```

## 5. 启动上下文

Main 启动每个 Subsystem Runtime 时 MUST 提供至少：

```text
Subsystem Descriptor Key
Main Control Endpoint
Bootstrap Token
```

桌面 MVP MAY 通过 Main 保留环境变量传递这些值。

Descriptor 自定义 `env` MUST NOT 覆盖 LoomRealm 保留启动字段。

精确保留环境变量名不由本协议冻结。

## 6. Bootstrap Token

`bootstrapToken` 是 Main 为一次 Launch Attempt 生成的一次性 bearer-style Bootstrap Credential。

协议语义：

- MUST 每次 Launch Attempt 重新生成；
- MUST 绑定到一个确定的 Launch Attempt 与 `descriptor.key`；
- MUST 只允许成功认证一次；
- `subsystem.hello` 成功后 MUST 立即视为 consumed；
- consumed token MUST NOT 再次成功认证；
- MUST NOT 使用 PID、端口号或 Worker 名称代替；
- SHOULD NOT 出现在普通日志或用户可见错误信息中。

Wire Schema 中 `bootstrapToken` 是 opaque non-empty string。

Token 的字节长度、随机算法和字符串编码不在本版本冻结。

## 7. Main 内部 Launch Attempt

Main SHOULD 维护内部 Launch Attempt identity，例如：

```ts
interface SubsystemLaunchRecord {
  descriptorKey: string;
  launchId: string;
  bootstrapToken: string;
  observedState: MainObservedSubsystemState;
  reportedStatus?: SubsystemRuntimeStatus;
}
```

`launchId` 不属于 v1 wire schema。

同一个 `descriptor.key` 重新启动时 MUST 使用新的 Launch Attempt 和新的 Bootstrap Token。

## 8. Main-observed State 与 Runtime-reported Status

两套状态来源不同，MUST 分开维护。

### 8.1 Main-observed Runtime Container State

```ts
type MainObservedSubsystemState =
  | "declared"
  | "starting"
  | "connected"
  | "identified"
  | "ready"
  | "stopping"
  | "stopped"
  | "failed";
```

来源：

```text
declared
    Game Entry / Descriptor Registry

starting
    Launcher invoked

connected
    Control Transport accepted

identified
    subsystem.hello accepted

ready
    legal subsystem.status(state="ready") accepted

stopping
    legal subsystem.status(state="stopping") accepted
    or Main has begun a future explicit shutdown flow

stopped
    Supervisor confirms normal Runtime exit

failed
    Supervisor / Transport / Protocol / subsystem.status(failed)
```

### 8.2 Subsystem-reported Runtime Status

```ts
type SubsystemRuntimeStatus =
  | "initializing"
  | "ready"
  | "stopping"
  | "failed";
```

`stopped` MUST NOT 由 Subsystem 自报告；它是 Main Supervisor 对实际 Runtime 退出的观察结果。

## 9. Connection Bootstrap 规则

新 Control Connection 建立后：

```text
starting → connected
```

在 `subsystem.hello` 成功前：

- 连接尚未绑定 Subsystem identity；
- Subsystem MUST NOT 发送普通业务 Control Method；
- 第一条业务协议消息 MUST 是 `subsystem.hello`。

如果第一条业务消息不是 `subsystem.hello`，Main MUST 将其视为 fatal Control Protocol Error 并关闭该连接。

## 10. `subsystem.hello`

### 10.1 Method

```text
Method: subsystem.hello
JSON-RPC Type: Request
Direction: Subsystem → Main
Control Protocol Version: 1
```

### 10.2 Final v1 Request Schema

```ts
interface SubsystemHelloParams {
  key: string;
  bootstrapToken: string;
  protocolVersions: readonly number[];
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
    "bootstrapToken": "<opaque-bootstrap-token>",
    "protocolVersions": [1]
  }
}
```

v1 `params` MUST NOT 依赖以下字段：

```text
pid
name
launcherType
entry
runtimeVersion
nodeVersion
capabilities
sessionId
launchId
```

未来版本可以新增字段，但 v1 实现不得把上述信息作为 Bootstrap 成功条件。

### 10.3 `key`

`key` MUST 是 non-empty string。

Main MUST 使用大小写敏感、逐字符精确匹配，在本 Session Descriptor Registry 中寻找：

```text
params.key === descriptor.key
```

本协议不冻结 `key` 的 lower-case、字符集或命名空间规则；这些属于 Game Package Contract。

### 10.4 `bootstrapToken`

`bootstrapToken` MUST 是 non-empty opaque string。

Main MUST 验证：

```text
存在与 key 对应的 active Launch Attempt
bootstrapToken 属于该 Launch Attempt
bootstrapToken 未 consumed
```

认证成功后 Main MUST consume 该 token。

Main MUST NOT 在 wire error 中区分“未知 key”和“错误 token”，避免通过 Control Endpoint 探测当前 Session 的 Subsystem identity。

### 10.5 `protocolVersions`

`protocolVersions` 表示 Subsystem 支持的 Main ⇄ Subsystem Control Protocol 版本。

约束：

- MUST 是非空数组；
- 每项 MUST 是正整数；
- MUST NOT 包含重复值；
- SHOULD 按从高到低排列。

Main 从双方支持版本交集中选择最高版本：

```text
selectedVersion = max(
  subsystem.protocolVersions ∩ main.supportedProtocolVersions
)
```

如果交集为空，`subsystem.hello` MUST 失败。

本 `hello` 只协商 Main ⇄ Subsystem Control Protocol，不协商：

- Renderer ⇄ Subsystem Connection Protocol；
- Render Update Protocol；
- User Input Protocol；
- Content API。

### 10.6 Final v1 Success Result

```ts
interface SubsystemHelloResult {
  protocolVersion: number;
}
```

示例：

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "protocolVersion": 1
  }
}
```

### 10.7 Hello 成功后的 Identity

`subsystem.hello` 成功后：

```text
connected → identified
```

Main MUST 将当前 Control Connection 永久绑定到本次 `descriptor.key`，直到连接关闭。

连接身份 MUST NOT 在同一条 Control Connection 生命周期内改变。

后续 Runtime Lifecycle 或其他 Control Message MUST 根据 connection-bound identity 确定 Subsystem；MUST NOT 依赖消息再次携带 `key`。

## 11. Hello Error Behavior

`subsystem.hello` 是 Request，因此 Bootstrap 失败 MUST 返回 JSON-RPC Error，然后关闭 Control Connection。

v1 冻结以下 wire-level 语义错误类别：

```text
BOOTSTRAP_AUTHENTICATION_FAILED
CONTROL_PROTOCOL_UNSUPPORTED
DUPLICATE_CONTROL_CONNECTION
PROTOCOL_STATE_ERROR
```

其中：

### `BOOTSTRAP_AUTHENTICATION_FAILED`

统一覆盖：

- 未知 `key`；
- 没有对应 active Launch Attempt；
- `bootstrapToken` 不匹配；
- token 已 consumed；
- 其他 Bootstrap identity / credential 校验失败。

Wire Response MUST NOT 暴露这些内部失败原因之间的差异。

### `CONTROL_PROTOCOL_UNSUPPORTED`

双方不存在共同 `protocolVersions`。

### `DUPLICATE_CONTROL_CONNECTION`

当前 Launch Attempt 已存在成功 identified 的 Control Connection。

### `PROTOCOL_STATE_ERROR`

当前连接或 Launch Attempt 状态不允许执行 hello。

JSON-RPC application error 的最终整数 `code` 尚未冻结；实现 MUST 保留以上可机器识别的语义类别，不得只依赖自然语言 `message`。

## 12. Connection-bound Identity

Hello 成功以后，以下形式是 v1 正确模型：

```text
Control Connection
    └── descriptor.key = loom.map
```

因此：

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

MUST NOT 通过额外 `key` 字段建立第二身份来源。

## 13. `subsystem.status`

### 13.1 Method

```text
Method: subsystem.status
JSON-RPC Type: Notification
Direction: Subsystem → Main
```

`subsystem.status` 表示 Runtime 已进入一个新的生命周期状态。

由于它是 Notification，Main 不发送业务 ACK。

Main MUST 校验 Schema 与状态转换；非法 Status 是 fatal Control Protocol Error。

### 13.2 Final v1 Schema

```ts
type SubsystemStatusParams =
  | SubsystemInitializingStatus
  | SubsystemReadyStatus
  | SubsystemStoppingStatus
  | SubsystemFailedStatus;

interface SubsystemInitializingStatus {
  state: "initializing";
}

interface SubsystemReadyStatus {
  state: "ready";
  rendererDataEndpoint: RendererDataEndpoint;
}

interface SubsystemStoppingStatus {
  state: "stopping";
}

interface SubsystemFailedStatus {
  state: "failed";
  error: SubsystemRuntimeError;
}

interface RendererDataEndpoint {
  transport: "websocket";
  url: string;
}

interface SubsystemRuntimeError {
  code: string;
  message?: string;
}
```

v1 生命周期消息不包含：

```text
key
timestamp
sequence
statusRevision
pid
runtime metadata
```

Control WebSocket 自身提供同一连接内的可靠有序传输，因此 v1 不建立额外 Status Sequence。

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

- `subsystem.hello` 已成功；
- Runtime 正在执行 required initialization；
- Runtime 尚未 ready。

`initializing` Notification 在 v1 中是 OPTIONAL。

Hello 成功后，即使 Runtime 没有显式发送 `initializing`，Main 也已经知道该 Runtime 处于：

```text
identified but not ready
```

因此允许直接：

```text
identified → ready
```

## 15. `ready`

### 15.1 Desktop v1 Schema

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

Desktop v1 `rendererDataEndpoint` MUST 满足：

```ts
interface RendererDataEndpoint {
  transport: "websocket";
  url: string;
}
```

`url` MUST 是语法合法的 WebSocket URL。Loopback host 的进一步安全限制属于 Desktop Host Profile / Connection Contract，不在本协议重复冻结。

### 15.2 `ready` 语义

Subsystem 报告 `ready` MUST 表示：

1. 当前 Control Connection 已 identified；
2. required Runtime initialization 已完成；
3. Runtime 可以接受后续 Main Control Protocol；
4. Renderer Data Endpoint 已经建立并可供后续 Connection Grant 使用。

`ready` MUST NOT 被解释为：

- Renderer 已连接；
- Renderer Data Connection 已认证；
- 存在任何 Frame；
- 存在任何 Render；
- 存在 Input Target；
- 游戏内容已全部预加载。

Main 接受合法 `ready` 后：

```text
identified / initializing → ready
```

## 16. Renderer Data Endpoint 与 Grant 分离

`rendererDataEndpoint` 只回答：

> Renderer Data Server 在哪里。

它不代表授权。

```text
Subsystem Runtime Lifecycle
    提供 endpoint

Main Connection Authority
    签发 grant / credential

Renderer ⇄ Subsystem Connection Layer
    建立并认证 data connection
```

Grant、Data Connection Credential 与 Renderer Authentication 不属于本协议。

## 17. `stopping`

```json
{
  "jsonrpc": "2.0",
  "method": "subsystem.status",
  "params": {
    "state": "stopping"
  }
}
```

`stopping` 表示 Runtime 已开始正常终止流程。

它不是 terminal 状态，也不证明 Process / Worker 已经退出。

真正的 `stopped` MUST 由 Main 根据 Supervisor / Transport 观察确认。

## 18. `failed`

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

`failed` 表示 Runtime 自己确认发生不可恢复错误。

`failed` 在 v1 中是 terminal Runtime-reported Status。

发送 `failed` 后：

- Runtime MUST NOT 再发送正常业务 Control Message；
- Runtime SHOULD 进行有限 cleanup 并退出；
- Main MAY 在 graceful-exit window 后强制终止 Runtime。

恢复必须通过新的 Launch Attempt 完成：

```text
new Launch Attempt
→ new bootstrapToken
→ new Control Connection
```

v1 不允许：

```text
failed → initializing
failed → ready
```

## 19. Runtime Status 有限状态机

`identified` 是 Main-observed pre-status 状态，不属于 `SubsystemRuntimeStatus` enum。

v1 合法转换：

| 当前状态 | 收到 `subsystem.status` | 结果 |
|---|---|---|
| `identified` | `initializing` | 合法 → `initializing` |
| `identified` | `ready` | 合法 → `ready` |
| `identified` | `failed` | 合法 → `failed` |
| `initializing` | `ready` | 合法 → `ready` |
| `initializing` | `failed` | 合法 → `failed` |
| `ready` | `stopping` | 合法 → `stopping` |
| `ready` | `failed` | 合法 → `failed` |
| `stopping` | `failed` | 合法 → `failed` |

除表中列出的转换外，其他全部非法。

特别地，以下均为 fatal Protocol Error：

```text
initializing → initializing
ready → ready
stopping → stopping
failed → failed
ready → initializing
stopping → ready
failed → initializing
failed → ready
```

v1 不提供 Status replay / retry 语义。

## 20. 非法 `subsystem.status` 的错误行为

以下任一情况 MUST 视为 fatal Control Protocol Error：

- hello 成功前发送 `subsystem.status`；
- `params` 不符合 discriminated union；
- 未知 `state`；
- `ready` 缺少 `rendererDataEndpoint`；
- Desktop v1 endpoint `transport` 不是 `websocket`；
- endpoint URL Schema 非法；
- `failed` 缺少合法 `error.code`；
- 重复发送同一状态；
- 任何非法状态转换。

Main MUST：

```text
mark Runtime failed
→ close Control Connection
→ terminate Runtime if necessary
```

Main MUST NOT 静默忽略非法 Status，否则双方生命周期状态可能永久分叉。

因为 `subsystem.status` 是 Notification，Main 不为该消息发送 JSON-RPC Error Response；Protocol Error 通过连接终止和 Main-observed `failed` 表达。

## 21. `failed` 不是唯一故障来源

Main MUST NOT 依赖 `subsystem.status(state="failed")` 作为唯一故障检测机制。

以下情况均可使 Main 进入 `failed`：

- spawn error；
- connect timeout；
- hello timeout；
- Bootstrap Authentication failure；
- unsupported Control Protocol Version；
- duplicate identified Control Connection；
- ready timeout；
- Control Connection 非预期关闭；
- Process / Worker 非正常退出；
- fatal Control Protocol Error。

Runtime 可能在崩溃前来不及发送 `failed`。

## 22. 重复 Control Connection 与 Token Replay

每个 Launch Attempt 最多一条成功 identified 的 Control Connection。

如果已有 identified Control Connection：

```text
new subsystem.hello for same Launch Attempt
→ DUPLICATE_CONTROL_CONNECTION
→ reject
→ close new connection
```

MVP MUST NOT 自动使用新连接替换旧连接。

成功 hello 后旧 `bootstrapToken` 已 consumed；即使原 Control Connection 随后断开，也 MUST NOT 重新使用旧 token。

## 23. Timeout

实现 MUST 支持：

```text
connect timeout
hello timeout
ready timeout
graceful stopping timeout
```

本协议只冻结这些 timeout phase 必须存在；默认数值由 Host Profile / Runtime Configuration 定义。

## 24. Control Connection 非预期断开

若 Runtime 在 `connected / identified / ready` 等非正常关闭阶段失去 Control Connection：

```text
Main observed state → failed
```

v1 不支持同一 Launch Attempt 自动 reconnect / resume。

## 25. Process / Worker Exit

Supervisor 观察 Runtime Container 退出时：

- 如果此前进入合法 `stopping` 且退出符合正常 shutdown 流程，Main MAY 转为 `stopped`；
- 否则 Main MUST 转为 `failed`。

精确 exit code 映射属于 Host Profile / Supervisor 实现细节。

## 26. Main 综合状态转换

正常路径：

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
    │ optional status(initializing)
    │ status(ready)
    ▼
READY
    │ status(stopping)
    ▼
STOPPING
    │ Supervisor confirms normal exit
    ▼
STOPPED
```

任一非终止阶段均可能进入：

```text
FAILED
```

Main Registry SHOULD 分开保存：

```ts
interface SubsystemRuntimeRecord {
  observedState: MainObservedSubsystemState;
  reportedStatus?: SubsystemRuntimeStatus;
}
```

不得把两套来源不同的状态强行压缩为一个单一真相源。

## 27. Game Bootstrap 完成条件

当前 MVP 中所有 Game Entry Descriptor 都是 required。

因此：

```text
every declared Subsystem observedState == "ready"
```

是 Subsystem Bootstrap Complete 的必要条件。

任一 required Subsystem 在启动阶段进入 `failed`：

```text
Game Bootstrap → FAILED
```

MVP 不支持 unavailable-but-continue，也不定义 lazy Subsystem。

## 28. JSON-RPC 与 Protocol Error 分层

错误分三层：

```text
JSON-RPC Layer
    malformed request
    invalid params
    unknown method

Bootstrap Layer
    authentication failed
    unsupported control protocol
    duplicate connection
    invalid bootstrap state

Runtime Lifecycle Layer
    status before hello
    malformed status
    illegal transition
```

Bootstrap fatal error：

```text
return JSON-RPC Error for subsystem.hello
→ close Control Connection
```

Runtime Lifecycle fatal error：

```text
mark Runtime failed
→ close Control Connection
```

业务错误 MUST NOT 混入 Bootstrap / Runtime Lifecycle Error。

## 29. Security Requirements

- Bootstrap Token MUST 被视为 secret；
- Main MUST NOT 在 hello wire error 中区分未知 `key` 与错误 / consumed token；
- 错误响应 MUST NOT 回显 `bootstrapToken`；
- 普通日志 SHOULD 对 Bootstrap Token 脱敏；
- Process ID、端口和客户端自报 runtime metadata MUST NOT 代替 Bootstrap Authentication；
- connection-bound identity MUST 是 hello 后后续 Control Message 的唯一 Subsystem identity 来源。

## 30. Successful Bootstrap Sequence

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
 │ key + bootstrapToken + protocolVersions    │
 │                                            │
 │ validate authentication / version          │
 │ consume bootstrapToken                     │
 │ bind connection to descriptor.key          │
 │                                            │
 │          subsystem.hello Response          │
 │             protocolVersion = 1            │
 │───────────────────────────────────────────▶│
 │                                            │
 │                 initialize runtime         │
 │                                            │
 │   status(initializing) [optional]           │
 │◀───────────────────────────────────────────│
 │                                            │
 │             start Data Endpoint            │
 │                                            │
 │             status(ready)                  │
 │◀───────────────────────────────────────────│
 │          rendererDataEndpoint              │
 │                                            │
 │ Main observedState = READY                 │
```

## 31. Failure Sequence

### 31.1 Runtime 主动失败

```text
hello accepted
→ initializing
→ subsystem.status(failed)
→ Main observedState = FAILED
→ Runtime exits
```

### 31.2 Runtime 崩溃

```text
hello accepted
→ process / worker crashes
→ Supervisor / Control Connection detects loss
→ Main observedState = FAILED
```

### 31.3 非法 Status

```text
ready
→ duplicate status(ready)
→ fatal Protocol Error
→ Main observedState = FAILED
→ close Control Connection
```

## 32. v1 Wire Surface Summary

Subsystem → Main 只有两个本协议方法：

| Method | JSON-RPC 类型 | 方向 | 职责 |
|---|---|---|---|
| `subsystem.hello` | Request | Subsystem → Main | Bootstrap Authentication、identity binding、Control Protocol version negotiation |
| `subsystem.status` | Notification | Subsystem → Main | Runtime lifecycle status transition |

最终类型摘要：

```ts
interface SubsystemHelloParams {
  key: string;
  bootstrapToken: string;
  protocolVersions: readonly number[];
}

interface SubsystemHelloResult {
  protocolVersion: number;
}

type SubsystemStatusParams =
  | { state: "initializing" }
  | {
      state: "ready";
      rendererDataEndpoint: {
        transport: "websocket";
        url: string;
      };
    }
  | { state: "stopping" }
  | {
      state: "failed";
      error: {
        code: string;
        message?: string;
      };
    };
```

## 33. v1 已冻结不变量

1. Subsystem 主动连接 Main；
2. 新 Control Connection 第一条业务消息必须是 `subsystem.hello`；
3. `subsystem.hello` 是 JSON-RPC Request；
4. hello v1 字段只有 `key / bootstrapToken / protocolVersions`；
5. Hello success result 只有 `protocolVersion`；
6. Hello 成功后 identity 永久绑定到 Control Connection；
7. 后续 Lifecycle Message 不携带 `key`；
8. `subsystem.status` 是 JSON-RPC Notification；
9. `initializing` 可选；
10. `ready` 必须携带 Desktop v1 `rendererDataEndpoint`；
11. `stopping` 不等于 `stopped`；
12. `failed` terminal；
13. 重复 Status 和所有未列入合法转换表的状态转换都是 fatal Protocol Error；
14. Runtime Lifecycle Status 不替代 Process / Worker Supervisor；
15. Runtime ready 不依赖任何 Frame 或 Render；
16. Runtime ready 不意味着 Renderer Data Connection 已建立；
17. Hello authentication wire error 不区分 unknown key 与 invalid / consumed token；
18. Lifecycle v1 不增加 timestamp、sequence、PID 或 runtime metadata。

## 34. 仍待后续冻结

以下内容不阻止当前 wire schema 与状态机作为 Control Protocol v1 Schema 草案实现：

- JSON-RPC application error 的最终整数 code；
- Bootstrap Token 最低熵、字节长度和编码；
- Main 保留环境变量名；
- Desktop endpoint 更严格的 loopback 安全约束；
- 各 timeout 默认数值；
- graceful shutdown Main → Subsystem method；
- heartbeat / health；
- restart / resume；
- PWA Transport Profile。

这些后续补充 MUST NOT 改变本版本已冻结的字段含义、身份绑定和状态转换语义；若需要不兼容修改，必须提升协议版本。

## 35. 最小互操作测试

实现 v1 至少必须覆盖：

### Hello

- 合法 `hello` 返回 `protocolVersion: 1`；
- `key` 使用大小写敏感精确匹配；
- unknown key 与 invalid token 在 wire 上都归类为 `BOOTSTRAP_AUTHENTICATION_FAILED`；
- consumed token replay 被拒绝；
- `protocolVersions` 为空被拒绝；
- `protocolVersions` 包含非正整数或重复值被拒绝；
- 无共同版本时返回 `CONTROL_PROTOCOL_UNSUPPORTED`；
- 第二条 identified connection 被拒绝；
- hello 成功后后续消息不需要 `key`。

### Runtime Status

- `identified → ready` 合法；
- `identified → initializing → ready` 合法；
- `identified / initializing → failed` 合法；
- `ready → stopping` 合法；
- `ready / stopping → failed` 合法；
- 重复 `ready` 是 fatal Protocol Error；
- `ready → initializing` 是 fatal Protocol Error；
- `failed → ready` 是 fatal Protocol Error；
- hello 前发送 status 是 fatal Protocol Error；
- ready 缺少 endpoint 是 fatal Protocol Error；
- failed 缺少 `error.code` 是 fatal Protocol Error。

### Supervisor / Bootstrap

- Control Connection 非预期断开导致 Main observed `failed`；
- Process 在 ready 前退出导致 Runtime / Game Bootstrap failed；
- `stopping` 后正常退出才可进入 Main observed `stopped`；
- 多个 required Subsystem 只有全部 ready 后 Game Bootstrap 才完成；
- Runtime 在零个 Frame、零个 Render 时进入 ready 完全合法。

## 36. 相关文档

- [运行时启动与连接建立系统](../10-architecture/runtime-bootstrap-system.md)；
- [系统架构总览](../10-architecture/system-overview.md)；
- [运行承载系统](../10-architecture/runtime-hosting-system.md)；
- [通信系统](../10-architecture/communication-system.md)；
- [Subsystem Descriptor MVP ADR](../decisions/0007-subsystem-descriptor-mvp.md)；
- [模块子系统生命周期与调用协议草案](./system-lifecycle-protocol.md)；
- [正式契约目录](./README.md)。
