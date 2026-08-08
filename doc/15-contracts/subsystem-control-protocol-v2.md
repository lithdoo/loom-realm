# Main ⇄ Subsystem Control Protocol v2

> 层级：正式契约  
> 状态：Active Design / Draft  
> 协议版本：2  
> 协议标识：`loomrealm.subsystem-control`  
> 稳定程度：Evolving  
> 主要定义：Main ⇄ Subsystem Runtime Container 的 Bootstrap、身份绑定、Runtime lifecycle 与 shutdown；不再承载 Renderer Data endpoint  
> 依赖：[Game Package v2](./game-package-v2.md)、[Desktop Node.js Launcher Profile v1](./nodejs-launcher-profile-v1.md)、[ADR 0016](../decisions/0016-protocol-boundary-cleanup.md)  
> 最近复核：2026-08-08

本文使用 `MUST`、`MUST NOT`、`SHOULD`、`MAY` 表达规范强度。

核心原则：

> **Subsystem Control 只管理 Runtime Container identity 与 lifecycle。Data endpoint、Renderer Data Connection、Frame、Render、Content 都是独立协议域。**

## 1. 与 v1 的关系

v2 保留 v1 的核心 Runtime semantics：

```text
spawn success != connected != identified != ready
Main owns normal shutdown intent
stopping != stopped
stopped only from Supervisor observation
unexpected Control loss / Runtime exit without shutdown intent = failure
no same-attempt reconnect/resume
no automatic restart
```

v2 的主要不兼容 wire 变化：

```text
subsystem.status({state:"ready"})
```

不再携带 `rendererDataEndpoint`。

因此 v2 可以在 Desktop WebSocket Control Transport 和 PWA MessagePort Control Transport 上保持同一 Runtime lifecycle schema。

Subsystem Control v1 保持 Frozen，不静默修改。

## 2. 协议范围

```text
Subsystem → Main
    subsystem.hello      Request
    subsystem.status     Notification

Main → Subsystem
    subsystem.shutdown   Request
```

v2 负责：

```text
Control bootstrap
descriptor.key identity binding
Runtime initializing / ready / failed
Main-requested shutdown
Control loss lifecycle mapping
Subsystem Control version negotiation
```

v2 不负责：

```text
Frame / Call
Renderer Data endpoint discovery
Renderer Data lease / connection auth
User Input
Render Update / Render State
Content Grant distribution
Runtime restart/checkpoint
application heartbeat
```

## 3. Transport Independence

Subsystem Control v2 application semantics不固定 Data Transport。

可由 Host Profile绑定：

```text
Desktop Control  → localhost WebSocket
PWA Control      → authenticated MessagePort
```

Host Profile负责安全建立 Control carrier，但不得改变本文 Runtime identity/lifecycle semantics。

每个 transport application unit承载 exactly one JSON-RPC message object；JSON-RPC Batch不属于 v2 Core Profile。

## 4. Connection Bootstrap

新 Control Connection / Port 的第一条 LoomRealm application message MUST 是 `subsystem.hello`。

hello成功前：

```text
connection has no bound subsystem identity
no subsystem.status
no Frame / Call
no Data-lease control operation
```

第一条 LoomRealm application message不是合法 hello时，Main MUST fail closed。

## 5. Bootstrap Credential

`bootstrapToken` 继续是 Main 为一次 Launch Attempt建立的一次性 bearer credential。

它 MUST：

- 绑定唯一 Launch Attempt 与 `descriptor.key`；
- 每次 Launch Attempt新生成；
- 在 Runtime可执行前注册到 Main authentication state；
- 只允许成功消费一次；
- hello成功后立即 consumed；
- 不用 PID/端口/path/launchId替代；
- 不进入普通日志或用户可见错误。

## 6. `subsystem.hello`

```text
Method:    subsystem.hello
Type:      JSON-RPC Request
Direction: Subsystem → Main
```

```ts
interface SubsystemHelloParamsV2 {
  readonly key: string;
  readonly bootstrapToken: string;
  readonly protocolVersions: readonly number[];
}

interface SubsystemHelloResultV2 {
  readonly protocolVersion: 2;
}
```

Main验证：

```text
key exists in current Descriptor Registry
active Launch Attempt exists for key
token belongs to that attempt
token is unconsumed
```

`key` 大小写敏感、逐字符精确。

认证失败统一使用：

```text
BOOTSTRAP_AUTHENTICATION_FAILED
```

不得通过 wire error区分 unknown key / invalid token / consumed token / mismatch。

## 7. Version Negotiation

`protocolVersions` 只协商 `loomrealm.subsystem-control`。

```text
1..16 positive integer entries
no duplicates
selectedVersion = max(intersection)
```

v2 endpoint发送 `[2]` 或未来包含其支持版本集合。

该字段不协商：

```text
Frame / Call
Renderer Control
Renderer⇄Subsystem Connection
User Input
Render Update
Content API
```

## 8. Identity Binding

hello成功后：

```text
consume bootstrapToken
→ permanently bind current Control Connection to descriptor.key
→ Main observed state = identified
```

同一 Control Connection生命周期内 identity MUST NOT改变。

后续消息依赖 connection-bound identity；不得重复携带 key建立第二身份来源。

同一 Launch Attempt最多一个成功 identified Control Connection。

## 9. Runtime State Model

Main observed public state：

```ts
type MainObservedSubsystemStateV2 =
  | "declared"
  | "starting"
  | "connected"
  | "identified"
  | "ready"
  | "stopping"
  | "stopped"
  | "failed";
```

Runtime-reported status：

```ts
type SubsystemRuntimeStatusV2 =
  | { readonly state: "initializing" }
  | { readonly state: "ready" }
  | {
      readonly state: "stopping";
    }
  | {
      readonly state: "failed";
      readonly error: SubsystemRuntimeErrorV2;
    };

interface SubsystemRuntimeErrorV2 {
  readonly code: string;
  readonly message?: string;
}
```

`stopped` 仍只来自 Supervisor / Host Runtime existence observation。

## 10. `subsystem.status`

```text
Method:    subsystem.status
Type:      JSON-RPC Notification
Direction: Subsystem → Main
```

v2 closed union：

```json
{"state":"initializing"}
{"state":"ready"}
{"state":"stopping"}
{"state":"failed","error":{"code":"..."}}
```

不得增加：

```text
rendererDataEndpoint
dataPort
dataGrant
frameId
activationId
renderId
pid
launchId
statusRevision
arbitrary metadata
```

## 11. `ready`

`ready` 只表示：

> Runtime required initialization完成，并能够承担 enclosing Runtime Application Profile 声明的后续 Runtime角色。

`ready` MUST NOT解释为：

```text
Renderer已连接
Data Connection存在
Data endpoint已发布
Data lease已授权
存在Frame
存在Render
存在InputTarget
Content已预载
```

Data Connection的 endpoint/Port/credential/generation由独立协议/Profile定义。

## 12. `failed`

`status(failed)` 是 Runtime self-reported terminal failure。

发送后 Runtime：

```text
MUST NOT start new normal Control operation
SHOULD perform bounded cleanup
SHOULD terminate promptly
```

恢复必须是 new Launch Attempt + new bootstrap credential + new Runtime + new Control Connection。

v2无 failed→ready。

## 13. `subsystem.shutdown`

```text
Method:    subsystem.shutdown
Type:      JSON-RPC Request
Direction: Main → Subsystem
```

```ts
type SubsystemShutdownReasonV2 = "session-end" | "bootstrap-abort";
interface SubsystemShutdownParamsV2 {
  readonly reason: SubsystemShutdownReasonV2;
}
interface SubsystemShutdownResultV2 {}
```

Success只表示 graceful shutdown被接受，不表示 Runtime已经退出。

Main在发送前 MUST建立 shutdown intent并进入 observed `stopping`。

## 14. Lifecycle Transitions

无 shutdown intent：

```text
identified → initializing / ready / failed
initializing → ready / failed
ready → failed
```

有 shutdown intent额外允许：

```text
identified/initializing/ready → stopping
stopping → failed
```

重复 status、ready→initializing、stopping→ready、failed→anything均为 fatal protocol state error。

## 15. Control Loss / Runtime Exit

无 shutdown intent：

```text
unexpected Control loss → failed
unexpected Runtime exit → failed
```

exit code 0也不改变分类。

有 shutdown intent时由 Supervisor判断 stopped/failed；Runtime已经 failed后不能因后续 exit恢复为 stopped。

v2无 same-attempt Control reconnect。

## 16. Error Model

JSON-RPC标准错误：

```text
-32700
-32600
-32601
-32602
```

LoomRealm semantic error：

```text
error.code = -32000
error.data.code = stable code
```

v2 codes：

```text
BOOTSTRAP_AUTHENTICATION_FAILED
CONTROL_PROTOCOL_UNSUPPORTED
DUPLICATE_CONTROL_CONNECTION
PROTOCOL_STATE_ERROR
```

## 17. Request ID / JSON / Limits

Request ID：

```text
positive safe integer
connection lifetime sender-side never reused
```

若 v2 与其他 JSON-RPC domain共享同一 physical Control Connection，enclosing Application Profile MUST定义跨 domain shared sender namespace。

Core limits：

```text
max application message           1 MiB
max JSON nesting depth             64
protocolVersions entries           1..16
bootstrapToken                     1..4096 UTF-8 bytes
SubsystemRuntimeError.code         1..128 ASCII chars
SubsystemRuntimeError.message      0..4096 UTF-8 bytes
```

plain JSON-compatible values only；closed schema；JSON-RPC Batch是否允许由 enclosing Profile决定，Phase-1 Runtime Profile SHOULD继续禁止。

## 18. Security

- bootstrapToken按 secret处理；
- Control Transport由 Host Profile安全建立/限制；
- hello error不泄露 token/key匹配细节；
- logs应脱敏；
- connection-bound key是唯一 Runtime identity；
- Data credential不得通过 `subsystem.status(ready)` 传输；
- Runtime executable trust / sandbox属于 Host/Launcher Profile。

## 19. 与 Frame / Call v1 的组合

Subsystem Control v2 不修改 Frame / Call v1。

未来 Runtime Control Application Profile v2 可以静态组合：

```text
Subsystem Control v2
Frame / Call v1
+ 已冻结的 Data lease/control domain（如需要）
```

在该 Profile冻结前，不应把 Profile v1 静默解释为包含新 Data方法。

## 20. Conformance Minimum

至少覆盖：

```text
hello-first-message
valid/invalid bootstrap credential
version-selection-2
connection-key-binding
ready-has-no-data-endpoint
ready-does-not-imply-data-connection
stopping-requires-main-intent
stopped-only-from-supervisor
unexpected-control-loss-fails-runtime
unexpected-exit-code-zero-fails-runtime
no-same-attempt-reconnect
closed-status-schema
wire-limits
```

Desktop WebSocket 与 PWA MessagePort Profile应对同一 abstract lifecycle trace得到相同 Main-observed Runtime state。

## 21. v2 Core Invariants

1. Control只拥有 Runtime identity/lifecycle；
2. `descriptor.key`是唯一 Runtime identity；
3. hello前无 authenticated operation；
4. bootstrapToken一次性；
5. `spawn != connected != identified != ready`；
6. ready不包含/暗示 Renderer Data endpoint；
7. Data connection/auth属于独立协议；
8. Main拥有正常 shutdown intent；
9. stopped只来自 Supervisor；
10. 无 shutdown intent的 Control loss/Runtime exit是 failure；
11. no reconnect/resume/restart/heartbeat in v2 Core；
12. Frame / Call v1保持独立且无需升级。