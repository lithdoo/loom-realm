# Main ⇄ Subsystem Control Protocol v1

> 层级：正式契约  
> 状态：Active / Normative  
> 协议版本：1  
> 稳定程度：Frozen  
> 主要定义：Main ⇄ Subsystem Control Connection 的 Bootstrap、Subsystem 身份绑定、Runtime Lifecycle、Shutdown、错误与连接失败语义  
> 依赖：[运行时启动与连接建立系统](../10-architecture/runtime-bootstrap-system.md)、[运行承载系统](../10-architecture/runtime-hosting-system.md)、[通信系统](../10-architecture/communication-system.md)、[Game Package v2](./game-package-v2.md)、[Desktop Node.js Launcher Profile v1](./nodejs-launcher-profile-v1.md)  
> 被以下协议继续使用：[Frame 生命周期与调用协议草案](./system-lifecycle-protocol.md)  
> 决策记录：[ADR 0009：冻结 Subsystem Control Protocol v1](../decisions/0009-freeze-subsystem-control-protocol-v1.md)  
> 最近复核：2026-08-03

本文使用 `MUST`、`MUST NOT`、`SHOULD`、`MAY` 表达规范强度。

核心原则：

> Subsystem Control Protocol 只管理 Runtime Container 级身份和生命周期。Frame / Call 是独立协议域，可以复用已经认证的 Control Connection，但不得重新定义 Runtime Bootstrap、Subsystem identity、ready、shutdown 或 restart 语义。

## 1. 适用范围

```text
LoomRealm Main
        ⇅
Main ⇄ Subsystem Control Connection
        ⇅
Subsystem Runtime Container
```

v1 负责：

```text
Control Connection Bootstrap
Subsystem identity binding
Runtime initializing / ready / failed
Main-requested Runtime shutdown
Control Connection failure
Protocol version negotiation
Subsystem Control error / limit semantics
```

v1 不负责：

```text
Frame lifecycle / call / return
Renderer Data Connection authentication / Grant
Render Update
User Input
Content API
Runtime restart / resume / checkpoint
application-level heartbeat / health probe
```

Desktop v1 Transport 为 localhost WebSocket + JSON-RPC 2.0。PWA Transport / Bootstrap Credential Profile 暂缓，但未来 Profile MUST 保持本文的身份与生命周期语义，除非提升协议版本。

## 2. 前置条件

Main 在启动 Subsystem 前已经：

```text
读取完整 Game Entry / Descriptor 集合
→ 完成 Game Package v2 校验
→ 创建 Launch Attempt
→ 注册 Bootstrap Credential
→ 启动并监督 Runtime Container
```

Desktop v1 启动上下文由 [Desktop Node.js Launcher Profile v1](./nodejs-launcher-profile-v1.md) 冻结。

基础关系：

```text
spawn success ≠ connected ≠ identified ≠ ready
```

## 3. Transport 与连接方向

Desktop v1：

```text
Transport     localhost WebSocket
Application   JSON-RPC 2.0
Direction     Subsystem → Main 主动建立连接
```

Main Control Endpoint MUST 在 Runtime Process 开始执行前可连接。

WebSocket 建立只产生：

```text
Main observed state = connected
```

此时连接仍没有 Subsystem identity。

## 4. Connection Bootstrap 规则

新 Control Connection 的第一条 LoomRealm application message MUST 是：

```text
subsystem.hello
```

hello 成功前：

- Connection 尚未绑定 Subsystem identity；
- Subsystem MUST NOT 发送 `subsystem.status`；
- 双方 MUST NOT 在该连接上执行 Frame / Call 或其他已认证 Control operation。

第一条 LoomRealm application message 不是合法 `subsystem.hello` 时，Main MUST 将该连接视为 fatal Bootstrap / Protocol Error 并关闭连接。

## 5. Bootstrap Token

`bootstrapToken` 是 Main 为一次 Launch Attempt 生成的一次性 bearer-style Bootstrap Credential。

它 MUST：

- 每次 Launch Attempt 重新生成；
- 绑定唯一 Launch Attempt 与 `descriptor.key`；
- 只允许成功消费一次；
- 在 hello 成功后立即 consumed；
- 不允许 consumed token 再次认证；
- 不使用 PID、端口、launchId、Worker 名称或 runtime metadata 替代；
- 不在普通日志或用户可见错误中明文输出。

Wire 中 `bootstrapToken` 是 opaque non-empty string。

精确熵、随机算法与底层字节编码属于安全实现 Profile，不属于本协议版本冻结内容。

## 6. `subsystem.hello`

### 6.1 Method

```text
Method:    subsystem.hello
Type:      JSON-RPC Request
Direction: Subsystem → Main
```

### 6.2 Request

```ts
interface SubsystemHelloParams {
  readonly key: string;
  readonly bootstrapToken: string;
  readonly protocolVersions: readonly number[];
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

v1 hello MUST NOT 依赖：

```text
pid
name
launcherType
entry
nodeVersion
runtimeVersion
capabilities
sessionId
launchId
```

### 6.3 Identity Validation

Main MUST 验证：

```text
key 存在于当前 Descriptor Registry
存在该 key 的 active Launch Attempt
bootstrapToken 属于该 Launch Attempt
bootstrapToken 尚未 consumed
```

`key` MUST 使用大小写敏感、逐字符精确匹配。

Main MUST NOT 在 wire error 中区分 unknown key、invalid token、consumed token 或 key/token mismatch。

### 6.4 Version Negotiation

`protocolVersions` 只协商 **Subsystem Control Protocol**，不协商 Frame / Call、Renderer Data、Render Update、User Input 或 Content API。

约束：

- MUST 是非空数组；
- 每项 MUST 是正整数；
- MUST NOT 重复；
- 项数 MUST 为 `1..16`。

Main 选择双方支持版本交集中的最大值：

```text
selectedVersion = max(
  subsystem.protocolVersions
  ∩
  main.supportedSubsystemControlVersions
)
```

没有交集时 hello MUST 失败。

### 6.5 Success Result

```ts
interface SubsystemHelloResult {
  readonly protocolVersion: number;
}
```

v1：

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "protocolVersion": 1
  }
}
```

hello 成功后 Main MUST：

```text
consume bootstrapToken
→ permanently bind this Control Connection to descriptor.key
→ observed state: connected → identified
```

同一条 Control Connection 生命周期内 identity MUST NOT 改变。

后续 Subsystem Control Message MUST 依赖 connection-bound identity，MUST NOT 再携带 `key` 建立第二身份来源。

## 7. Hello Error

v1 冻结语义错误：

```text
BOOTSTRAP_AUTHENTICATION_FAILED
CONTROL_PROTOCOL_UNSUPPORTED
DUPLICATE_CONTROL_CONNECTION
PROTOCOL_STATE_ERROR
```

`BOOTSTRAP_AUTHENTICATION_FAILED` 统一覆盖：

- unknown key；
- missing active Launch Attempt；
- invalid token；
- consumed token；
- key/token mismatch；
- 其他 Bootstrap identity / credential 校验失败。

每个 Launch Attempt 最多一条成功 identified 的 Control Connection。已有 identified connection 时，新的 hello MUST 返回 `DUPLICATE_CONTROL_CONNECTION` 并关闭新连接；v1 不自动替换旧连接。

Hello fatal error：

```text
return JSON-RPC Error
→ close Control Connection
→ Launch Attempt / Runtime Bootstrap fails
```

## 8. Main-observed State 与 Runtime-reported Status

Main 与 Runtime MUST 分开维护两套来源不同的状态。

### 8.1 Main-observed State

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
declared     Descriptor Registry
starting     Launcher / Launch Attempt
connected    Control Transport accepted
identified   subsystem.hello accepted
ready        legal status(ready) accepted
stopping     Main established shutdown intent
stopped      Supervisor confirms expected termination
failed       Supervisor / Transport / Protocol / status(failed)
```

### 8.2 Runtime-reported Status

```ts
type SubsystemRuntimeStatus =
  | "initializing"
  | "ready"
  | "stopping"
  | "failed";
```

`stopped` MUST NOT 由 Runtime 自报告；Supervisor 是 Runtime Process / Worker 是否实际存在的权威来源。

## 9. `subsystem.status`

### 9.1 Method

```text
Method:    subsystem.status
Type:      JSON-RPC Notification
Direction: Subsystem → Main
```

### 9.2 Schema

```ts
type SubsystemStatusParams =
  | { readonly state: "initializing" }
  | {
      readonly state: "ready";
      readonly rendererDataEndpoint: RendererDataEndpoint;
    }
  | { readonly state: "stopping" }
  | {
      readonly state: "failed";
      readonly error: SubsystemRuntimeError;
    };

interface RendererDataEndpoint {
  readonly transport: "websocket";
  readonly url: string;
}

interface SubsystemRuntimeError {
  readonly code: string;
  readonly message?: string;
}
```

Lifecycle message MUST NOT 包含：

```text
key
pid
launchId
timestamp
sequence
statusRevision
arbitrary runtime metadata
```

WebSocket 已提供单连接可靠有序传输，v1 不增加 Status Sequence / Revision / Replay。

## 10. `initializing`

`initializing` 是 OPTIONAL。

合法：

```text
identified → initializing
identified → ready
```

其语义只表示：

```text
identity established
required Runtime initialization not completed yet
```

它不代表 Frame、Render 或 Renderer Data Connection 状态。

## 11. `ready`

Desktop v1 `ready` MUST 携带：

```ts
interface RendererDataEndpoint {
  readonly transport: "websocket";
  readonly url: string;
}
```

Subsystem 报告 `ready` MUST 表示：

1. 当前 Control Connection 已 identified；
2. required Runtime initialization 已完成；
3. Runtime 可以接受后续 Control Profile 中允许的 Control operation；
4. Renderer Data Endpoint 已建立，可供后续 Main Connection Authority 使用。

`ready` MUST NOT 被解释为：

```text
Renderer 已连接
Renderer Data Connection 已认证
存在 Frame
存在 Render
存在 Input Target
全部游戏内容已预加载
```

`rendererDataEndpoint` 只表示 endpoint location，不表示授权。Data Grant、credential 和 Renderer authentication 属于 Renderer ⇄ Subsystem Connection Protocol。

## 12. `failed`

```text
subsystem.status(state="failed")
```

表示 Runtime 自己确认发生不可恢复错误。

`failed` 是 terminal Runtime-reported Status。

发送后 Runtime：

- MUST NOT 发起新的正常 Control operation；
- SHOULD 进行有限 cleanup；
- SHOULD 尽快退出。

Main MAY 在 Host-defined grace period 后强制终止 Runtime。

不允许：

```text
failed → initializing
failed → ready
failed → stopping
```

恢复只能使用：

```text
new Launch Attempt
→ new bootstrapToken
→ new Runtime Container
→ new Control Connection
→ new subsystem.hello
```

v1 不支持 restart / resume / same-attempt reconnect。

## 13. `subsystem.shutdown`

### 13.1 Method

```text
Method:    subsystem.shutdown
Type:      JSON-RPC Request
Direction: Main → Subsystem
```

### 13.2 Params

```ts
type SubsystemShutdownReason =
  | "session-end"
  | "bootstrap-abort";

interface SubsystemShutdownParams {
  readonly reason: SubsystemShutdownReason;
}
```

### 13.3 Result

```ts
interface SubsystemShutdownResult {}
```

Success Response 只表示：

```text
Runtime accepted the graceful shutdown request
```

它 MUST NOT 被解释为：

```text
Process / Worker 已退出
cleanup 已完成
Main observed state 已 stopped
```

## 14. Shutdown Ownership 与 Ordering

Main 拥有正常 Runtime shutdown intent。

Main 允许在下列已 identified 阶段发起 shutdown：

```text
identified
initializing
ready
```

在发送 `subsystem.shutdown` 前，Main MUST 原子地建立该 Runtime 的 shutdown intent，并将 Main-observed state 进入：

```text
stopping
```

这样即使 Runtime 在发送 shutdown Response 前先发送 `status(stopping)`，该 Notification 仍具有确定合法语义。

典型 reason：

```text
session-end
    正常 Session termination

bootstrap-abort
    Game Bootstrap 已失败或取消，需要清理已启动 Runtime
```

v1 没有单独的 runtime-stop / restart operation；当前全部 Subsystem eager + required。

## 15. `stopping`

`subsystem.status(state="stopping")` 只有在 Main 已经建立该 Runtime 的 shutdown intent 后合法。

Runtime MUST NOT 在正常运行期间自行执行：

```text
ready → stopping
```

如果 Runtime 无法继续正常提供服务，正确表达是：

```text
status(failed)
```

收到合法 shutdown 后，Runtime SHOULD 在连接仍可用时发送一次 `status(stopping)`，但该 Notification 不是 Process 退出的必要证据；Runtime MAY 在来得及发送 stopping 前完成快速退出。

`stopping` 不等于 `stopped`。

## 16. Runtime Status 状态机

没有 shutdown intent 时合法转换：

| 当前 Runtime phase | 收到 Status | 结果 |
|---|---|---|
| `identified` | `initializing` | 合法 |
| `identified` | `ready` | 合法 |
| `identified` | `failed` | 合法 |
| `initializing` | `ready` | 合法 |
| `initializing` | `failed` | 合法 |
| `ready` | `failed` | 合法 |

Main 已建立 shutdown intent 后，额外允许：

| 当前 Runtime phase | 收到 Status | 结果 |
|---|---|---|
| `identified` | `stopping` | 合法 |
| `initializing` | `stopping` | 合法 |
| `ready` | `stopping` | 合法 |
| `stopping` | `failed` | 合法，进入 terminal failed |

除上述转换外全部非法。

特别地：

```text
initializing → initializing
ready → ready
stopping → stopping
ready → initializing
stopping → ready
failed → anything
```

均为 fatal Control Protocol Error。

## 17. Shutdown Timeout 与 Force Termination

Shutdown MUST 有有限 deadline，具体默认数值属于 Host Runtime Policy，Game Package MUST NOT 覆盖。

v1 不进行 application-level shutdown retry。

如果 shutdown Response 超时、Runtime 不退出或 cleanup 超时：

```text
Main keeps shutdown intent
→ Supervisor termination escalation
→ force terminate if required
```

Supervisor 确认 Runtime 已不存在后：

```text
Main observed state = stopped
```

即使最终使用了 force termination，也不增加 `forced-stopped` 等公共状态；实现 SHOULD 把 graceful / forced 记录为内部诊断。

如果 Supervisor 无法确认 Runtime 已终止，则：

```text
Main observed state = failed
```

若 Runtime 已经合法报告 `failed`，后续 Process exit MUST NOT 把 terminal `failed` 改回 `stopped`。

## 18. Control Connection 非预期断开

没有 shutdown intent 时：

```text
Control Connection unexpectedly closes
→ Main observed state = failed
```

Main MUST 进入 Runtime failure / termination cleanup。

v1 不支持：

```text
same Launch Attempt reconnect
Control Connection resume
old Bootstrap Token reuse
transparent replacement
```

已有 shutdown intent 时，Control Connection 关闭不立即构成新的 Runtime failure；Main 继续依赖 Supervisor：

```text
Runtime exits / is terminated within deadline
→ stopped

termination cannot be confirmed
→ failed
```

## 19. Process / Worker Exit

Supervisor 是 Runtime Container existence 的权威来源。

没有 shutdown intent：

```text
Runtime exits
→ failed
```

即使 exit code 为 0 也一样。

已有 shutdown intent：

```text
Runtime exits
→ stopped
```

但若 Runtime 此前已经进入 terminal `failed`，则 failed 保持 terminal。

## 20. JSON-RPC Error Model

标准 JSON-RPC Layer 使用标准 code：

```text
-32700 Parse error
-32600 Invalid Request
-32601 Method not found
-32602 Invalid params
```

LoomRealm semantic error 统一使用：

```text
JSON-RPC error.code = -32000
```

并冻结：

```ts
interface LoomRealmRpcErrorData {
  readonly code: string;
}
```

示例：

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32000,
    "message": "LoomRealm protocol error",
    "data": {
      "code": "BOOTSTRAP_AUTHENTICATION_FAILED"
    }
  }
}
```

稳定的机器可识别错误身份是：

```text
error.data.code
```

不是自然语言 `message`，也不是额外分配的 JSON-RPC integer code。

Subsystem Control v1 冻结 semantic code：

```text
BOOTSTRAP_AUTHENTICATION_FAILED
CONTROL_PROTOCOL_UNSUPPORTED
DUPLICATE_CONTROL_CONNECTION
PROTOCOL_STATE_ERROR
```

## 21. Notification Protocol Error

`subsystem.status` 是 Notification，因此没有业务 Error Response。

以下情况是 fatal Control Protocol Error：

- hello 成功前发送 status；
- params 不符合 discriminated union；
- unknown state；
- ready 缺少合法 endpoint；
- failed 缺少合法 `error.code`；
- stopping 没有 Main shutdown intent；
- duplicate status；
- 任何非法状态转换。

Main MUST：

```text
mark Runtime failed
→ close Control Connection
→ terminate Runtime if necessary
```

不得静默忽略非法 Status。

## 22. Ordering / Retry / Idempotency

Desktop WebSocket 提供单连接可靠有序 delivery。

因此 v1：

```text
no Status Sequence
no Status Revision
no Status Replay
```

`subsystem.hello` 不在同一连接进行 application retry。

`subsystem.status` 重复发送是 Protocol Error，不是 idempotent replay。

`subsystem.shutdown` 不进行 application retry。重复 shutdown Request 在已经存在 shutdown intent 时 MUST 返回 `PROTOCOL_STATE_ERROR`；Main 仍继续既有 termination flow。

状态改变 Request timeout 不通过重发相同 Request 恢复。

## 23. Heartbeat / Health

Subsystem Control Protocol v1 **不定义 application-level heartbeat / health RPC**。

Desktop Host MAY 使用：

```text
WebSocket ping/pong
TCP connection state
Process Supervisor
Host-defined timeout
```

进行 transport / process health 检测。

未来若需要检测“连接仍存在但 Runtime event loop 不健康”等 application health，必须通过显式协议扩展或新版本引入。

## 24. Timeout Phases

实现 MUST 为以下阶段设置有限期限：

```text
connect
hello
ready
shutdown / termination
```

具体默认时间属于 Host Runtime Policy，不进入 Game Package 或本协议 wire schema。

connect / hello / ready timeout 在 Bootstrap / Runtime 正常运行路径中导致 failure。

shutdown timeout 按第 17 节进入 Supervisor termination escalation，不进行 RPC retry。

## 25. Wire Limits

Subsystem Control Protocol v1 冻结：

```text
max JSON-RPC message UTF-8 size   1 MiB
max JSON nesting depth            64
protocolVersions count            1..16
bootstrapToken UTF-8 length       1..4096 bytes
rendererDataEndpoint.url length   1..2048 UTF-8 bytes
SubsystemRuntimeError.code        1..128 ASCII chars
SubsystemRuntimeError.message     0..4096 UTF-8 bytes
```

`SubsystemRuntimeError.code` SHOULD 匹配：

```text
^[A-Z][A-Z0-9_]{0,127}$
```

超过对应限制的 Request 使用标准 JSON-RPC Invalid Params；非法 Status Notification 按 fatal Protocol Error 处理。

## 26. Security Requirements

- Bootstrap Token MUST 视为 secret；
- hello error MUST NOT 区分 unknown key 与 invalid / consumed token；
- error response MUST NOT 回显 Bootstrap Token；
- ordinary log SHOULD 脱敏 credential；
- PID、端口、launchId 与 Runtime 自报 metadata MUST NOT 替代 Bootstrap Authentication；
- hello 成功后的 connection-bound `descriptor.key` 是该 Connection 唯一 Subsystem identity；
- Runtime error / protocol error MUST NOT 泄露不必要的宿主路径、完整环境或 secret。

## 27. Game Bootstrap

当前 Game Package v2 Desktop MVP 中全部 declared Subsystem 都是 eager + required。

Subsystem Bootstrap success requires：

```text
every declared Runtime observedState == ready
```

任意 required Runtime 在 Bootstrap 完成前进入 failed：

```text
Game Bootstrap failed
→ Main establishes bootstrap-abort shutdown intent
→ shutdown / terminate remaining started Runtime Containers
```

## 28. Wire Surface Summary

Subsystem Control Protocol v1 只有三个方法：

| Method | JSON-RPC 类型 | 方向 | 职责 |
|---|---|---|---|
| `subsystem.hello` | Request | Subsystem → Main | Bootstrap authentication、identity binding、Subsystem Control version negotiation |
| `subsystem.status` | Notification | Subsystem → Main | Runtime lifecycle report |
| `subsystem.shutdown` | Request | Main → Subsystem | Main-owned graceful Runtime termination |

v1 没有：

```text
subsystem.ping
subsystem.health
subsystem.restart
subsystem.resume
subsystem.capabilities
```

## 29. 暂缓项

以下项目明确不阻塞 v1：

- Frame / Call Protocol；
- application-level heartbeat / health probe；
- Runtime restart / resume / checkpoint；
- same-attempt reconnect；
- PWA Bootstrap Credential Transport / Control Transport Profile；
- Host timeout 默认秒数；
- Bootstrap Token 精确熵与生成算法；
- Renderer Data Connection authentication / Grant。

实现不得通过私有行为静默改变本文已冻结语义。

## 30. Conformance Tests

实现 v1 至少 MUST 覆盖：

### Hello

- valid hello → `protocolVersion: 1`；
- key 大小写敏感；
- unknown key / invalid token / consumed token wire 上统一认证失败；
- empty / duplicate / invalid protocolVersions；
- unsupported version；
- duplicate identified connection；
- non-hello first application message；
- hello 成功后 status 不携带 key。

### Runtime Status

- `identified → ready`；
- `identified → initializing → ready`；
- `identified / initializing / ready → failed`；
- duplicate initializing / ready；
- `ready → initializing`；
- `failed → ready`；
- status before hello；
- ready missing / invalid endpoint；
- failed missing / invalid error code。

### Shutdown

- identified / initializing / ready 阶段 Main 发起 shutdown；
- shutdown intent 先于可能到达的 status(stopping)；
- shutdown → stopping → Process exit；
- shutdown → Process 快速退出、没有 stopping Notification；
- shutdown timeout → force termination；
- unsolicited status(stopping) → fatal Protocol Error；
- duplicate shutdown → `PROTOCOL_STATE_ERROR`；
- shutdown Response 不等于 stopped。

### Failure / Supervisor

- Control Connection 非预期断开 before ready / after ready；
- Process exit code 0 without shutdown intent → failed；
- Runtime crash；
- status(failed) terminal；
- failed 后 exit 不改回 stopped；
- shutdown intent 下 Connection 先断开、Supervisor 后确认退出 → stopped。

### Limits / Security

- oversized message / URL / error；
- token 不回显；
- PID 不作为 identity；
- old token 不可 reconnect；
- replacement Runtime 必须使用新 Launch Attempt / Token。

## 31. Frozen Invariants

1. Subsystem 主动连接 Main；
2. 第一条 LoomRealm application message 必须是 `subsystem.hello`；
3. hello 成功后 Control Connection 永久绑定 `descriptor.key`；
4. Bootstrap Token 是一次 Launch Attempt 的一次性 credential；
5. `spawn success ≠ connected ≠ identified ≠ ready`；
6. Runtime self-report 与 Supervisor observation 是不同状态来源；
7. `ready` 只表达 Runtime control readiness，不表达 Frame / Render / Renderer readiness；
8. Main 拥有正常 shutdown intent；
9. `stopping` 只有在 Main-requested shutdown 下合法；
10. `stopped` 只能由 Supervisor 确认实际退出；
11. 没有 shutdown intent 的 Runtime exit 是 failure，即使 exit code 为 0；
12. 没有 shutdown intent 的 Control Connection loss 是 Runtime failure；
13. v1 不支持 reconnect / resume / old-token reuse；
14. v1 不支持 automatic restart；
15. v1 不定义 application heartbeat；
16. Frame / Call 是独立协议域，不得重新定义上述 Runtime 级语义。
