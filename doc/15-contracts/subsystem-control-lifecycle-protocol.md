# Main ⇄ Subsystem Control Protocol v1

> 层级：正式契约  
> 状态：Active / Normative  
> 协议版本：1  
> 稳定程度：Frozen  
> 主要定义：Main ⇄ Subsystem Control Connection 的 Bootstrap、Subsystem 身份绑定、Runtime Lifecycle、Shutdown、错误与连接失败语义  
> 依赖：[运行时启动与连接建立系统](../10-architecture/runtime-bootstrap-system.md)、[运行承载系统](../10-architecture/runtime-hosting-system.md)、[通信系统](../10-architecture/communication-system.md)、[Game Package v2](./game-package-v2.md)、[Desktop Node.js Launcher Profile v1](./nodejs-launcher-profile-v1.md)  
> 被以下协议继续使用：[Frame / Call Protocol v1](./frame-call-protocol-v1.md)  
> 决策记录：[ADR 0009：冻结 Subsystem Control Protocol v1](../decisions/0009-freeze-subsystem-control-protocol-v1.md)  
> 最近复核：2026-08-04

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

`BOOTSTRAP_AUTHENTICATION_FAILED` 统一覆盖：unknown key、missing active Launch Attempt、invalid token、consumed token、key/token mismatch及其他 Bootstrap identity/credential 校验失败。

每个 Launch Attempt 最多一条成功 identified 的 Control Connection。已有 identified connection 时，新的 hello MUST 返回 `DUPLICATE_CONTROL_CONNECTION` 并关闭新连接；v1 不自动替换旧连接。

Hello fatal error：

```text
return JSON-RPC Error
→ close Control Connection
→ Launch Attempt / Runtime Bootstrap fails
```

## 8. Main-observed State 与 Runtime-reported Status

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

type SubsystemRuntimeStatus =
  | "initializing"
  | "ready"
  | "stopping"
  | "failed";
```

Main-observed state来源：Descriptor / Launcher / Transport / hello / legal status / shutdown intent / Supervisor。`stopped` MUST NOT 由 Runtime自报告；Supervisor是 Runtime existence的权威。

## 9. `subsystem.status`

```text
Method:    subsystem.status
Type:      JSON-RPC Notification
Direction: Subsystem → Main
```

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

Lifecycle message MUST NOT包含 key/pid/launchId/timestamp/sequence/statusRevision/arbitrary runtime metadata。v1不增加 Status Sequence/Revision/Replay。

## 10. `initializing`

`initializing` OPTIONAL。合法：`identified → initializing → ready` 或 `identified → ready`。它不代表 Frame、Render或 Renderer Data Connection状态。

## 11. `ready`

Desktop v1 `ready` MUST携带 WebSocket `rendererDataEndpoint`。它表示 Runtime required initialization完成且可以接受后续 Control operation；MUST NOT解释为 Renderer已连接、存在 Frame/Render/InputTarget或全部内容已预加载。

Endpoint只表示 location，不表示授权。

## 12. `failed`

`subsystem.status(state="failed")` 表示 Runtime自己确认不可恢复错误。`failed` 是 terminal Runtime-reported Status。

发送后 Runtime：

- MUST NOT 发起新的正常 Control operation；
- SHOULD 有限 cleanup；
- SHOULD 尽快退出。

Main MAY在 Host grace period后终止 Runtime。

不允许 failed→initializing/ready/stopping。恢复只能使用新 Launch Attempt/new token/new Runtime/new Control Connection/new hello；v1无 restart/resume/same-attempt reconnect。

Frame / Call Batch E 可以把 Frame Control timeout/divergence/protocol failure汇入 Runtime terminal failure，但不得改变本节 terminal语义。

## 13. `subsystem.shutdown`

```text
Method:    subsystem.shutdown
Type:      JSON-RPC Request
Direction: Main → Subsystem
```

```ts
type SubsystemShutdownReason = "session-end" | "bootstrap-abort";
interface SubsystemShutdownParams { readonly reason: SubsystemShutdownReason; }
interface SubsystemShutdownResult {}
```

Success只表示 Runtime接受 graceful shutdown request，不表示 Process/Worker已退出或 Main observed stopped。

## 14. Shutdown Ownership 与 Ordering

Main拥有正常 shutdown intent。发送 shutdown前 Main MUST原子建立 shutdown intent并进入 observed `stopping`。

合法发起阶段：identified/initializing/ready。`session-end` 表示正常 Session termination；`bootstrap-abort` 表示 Bootstrap失败后的清理。

## 15. `stopping`

`status(stopping)` 只有 Main已有 shutdown intent时合法。Runtime正常运行中不能自行 ready→stopping；无法继续提供服务时应 `status(failed)`。

`stopping != stopped`。

## 16. Runtime Status 状态机

无 shutdown intent：

```text
identified → initializing / ready / failed
initializing → ready / failed
ready → failed
```

有 shutdown intent额外允许 identified/initializing/ready→stopping，以及 stopping→failed。

重复 initializing/ready/stopping、ready→initializing、stopping→ready、failed→anything均 fatal Protocol Error。

## 17. Shutdown Timeout 与 Force Termination

Shutdown MUST finite deadline，默认数值属于 Host policy；v1无 application-level shutdown retry。

```text
shutdown timeout / Runtime not exiting
→ keep shutdown intent
→ Supervisor termination escalation
→ terminate if required
```

Supervisor确认 Runtime不存在后 observed=`stopped`。若无法确认终止则 `failed`。Runtime已经 terminal failed 后，后续 exit不把 failed改回 stopped。

## 18. Control Connection 非预期断开

没有 shutdown intent：

```text
unexpected Control close → Main observed failed
```

进入 Runtime failure / termination cleanup。v1无 same Launch Attempt reconnect、Control resume、old token reuse或 transparent replacement。

有 shutdown intent时继续依赖 Supervisor判断 stopped/failed。

## 19. Process / Worker Exit

无 shutdown intent：Runtime exit→failed，即使 exit code=0。

有 shutdown intent：Runtime exit→stopped；但此前已 failed则 failed保持 terminal。

## 20. JSON-RPC Error Model

标准 JSON-RPC code：`-32700 / -32600 / -32601 / -32602`。

LoomRealm semantic error统一：

```text
error.code = -32000
error.data.code = stable semantic code
```

```ts
interface LoomRealmRpcErrorData { readonly code: string; }
```

Subsystem Control v1 semantic code：

```text
BOOTSTRAP_AUTHENTICATION_FAILED
CONTROL_PROTOCOL_UNSUPPORTED
DUPLICATE_CONTROL_CONNECTION
PROTOCOL_STATE_ERROR
```

机器可识别 identity 是 `error.data.code`，不是 message。

## 21. Notification Protocol Error

status before hello、invalid union/unknown state、ready endpoint invalid、failed error invalid、stopping without shutdown intent、duplicate status或非法转换都是 fatal Control Protocol Error。

Main MUST mark Runtime failed、close Control Connection、必要时终止 Runtime；不得静默忽略。

## 22. Ordering / Retry / Idempotency

Desktop WebSocket提供单连接有序 delivery。v1无 Status Sequence/Revision/Replay。

hello不在同连接 application retry；status重复是 Protocol Error；shutdown不 application retry。状态改变 Request timeout不通过重发相同 Request恢复。

## 23. Heartbeat / Health

v1不定义 application-level heartbeat/health RPC。Host MAY使用 WebSocket ping/pong、TCP state、Process Supervisor、Host timeout做 transport/process health。

未来 application health必须显式协议扩展/新版本。

## 24. Timeout Phases

实现 MUST为 connect/hello/ready/shutdown+termination设置 finite deadline。具体默认时间属于 Host Runtime Policy，不进入 Game Package或 wire。

## 25. Wire Limits

```text
max JSON-RPC message UTF-8 size   1 MiB
max JSON nesting depth            64
protocolVersions count            1..16
bootstrapToken UTF-8 length       1..4096 bytes
rendererDataEndpoint.url length   1..2048 UTF-8 bytes
SubsystemRuntimeError.code        1..128 ASCII chars
SubsystemRuntimeError.message     0..4096 UTF-8 bytes
```

`SubsystemRuntimeError.code` SHOULD匹配 `^[A-Z][A-Z0-9_]{0,127}$`。

## 26. Security Requirements

Bootstrap Token视为 secret；hello error不区分 unknown key与 invalid/consumed token；error不回显 token；log SHOULD脱敏；PID/端口/launchId不能代替 Bootstrap Authentication；hello后的 connection-bound key是唯一 Subsystem identity；Runtime/protocol error不得泄露不必要宿主信息或 secret。

## 27. Game Bootstrap

当前 Game Package v2 Desktop MVP全部 declared Subsystem eager+required。

Bootstrap success要求 every declared Runtime observedState==ready。任意 required Runtime在 Bootstrap完成前 failed：

```text
Game Bootstrap failed
→ Main establishes bootstrap-abort shutdown intent
→ shutdown / terminate remaining started Runtime Containers
```

## 28. Wire Surface Summary

| Method | JSON-RPC 类型 | 方向 | 职责 |
|---|---|---|---|
| `subsystem.hello` | Request | Subsystem → Main | Bootstrap auth、identity binding、Control version negotiation |
| `subsystem.status` | Notification | Subsystem → Main | Runtime lifecycle report |
| `subsystem.shutdown` | Request | Main → Subsystem | Main-owned graceful Runtime termination |

v1无 subsystem.ping/health/restart/resume/capabilities。

## 29. 暂缓项

以下项目不阻塞 Subsystem Control v1：

- application-level heartbeat / health probe；
- Runtime restart / resume / checkpoint；
- same-attempt reconnect；
- PWA Bootstrap Credential / Control Transport Profile；
- Host timeout默认秒数；
- Bootstrap Token精确熵与生成算法；
- Renderer Data Connection authentication / Grant；
- Frame / Call Protocol v1 的 Batch F limits/fixtures/profile/version completion（Frame / Call A-E 已独立 Frozen）。

实现不得通过私有行为静默改变本文已冻结 Runtime语义。

## 30. Conformance Tests

至少覆盖：valid/invalid hello与 version negotiation；identity/token安全；ready/failed/stopping合法状态转换；shutdown intent/timeout/force termination；unexpected Control loss/Process exit；status(failed) terminal；wire limits/security；old token不可 reconnect；replacement Runtime必须新 Launch Attempt/token。

Frame / Call conformance由独立 Frame / Call Protocol负责，不在本协议重复定义。

## 31. Frozen Invariants

1. Subsystem主动连接 Main；
2. 第一条 LoomRealm application message必须 `subsystem.hello`；
3. hello成功后 Connection永久绑定 `descriptor.key`；
4. Bootstrap Token是一次 Launch Attempt的一次性 credential；
5. `spawn success ≠ connected ≠ identified ≠ ready`；
6. Runtime self-report与 Supervisor observation是不同状态来源；
7. ready只表达 Runtime control readiness；
8. Main拥有正常 shutdown intent；
9. stopping只有 Main-requested shutdown下合法；
10. stopped只能由 Supervisor确认实际退出；
11. 无 shutdown intent的 Runtime exit/Control loss是 failure；
12. v1无 reconnect/resume/old-token reuse/automatic restart/application heartbeat；
13. Frame / Call是独立协议域，不得重新定义上述 Runtime级语义。
