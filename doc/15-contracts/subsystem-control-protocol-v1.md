# Main ⇄ Subsystem Control Protocol v1

> 层级：正式契约  
> 状态：Active / Normative  
> 协议版本：1  
> 协议标识：`loomrealm.subsystem-control`  
> 稳定程度：Stabilizing  
> 主要定义：Main ⇄ Subsystem Runtime Container 的 Bootstrap、身份绑定、Runtime lifecycle 与 shutdown；不承载 Renderer Data endpoint  
> 依赖：[Game Package v1](./game-package-v1.md)、[Desktop Node.js Launcher Profile v1](./nodejs-launcher-profile-v1.md)  
> 组合 Profile：[Runtime Control Application Profile v1](./runtime-control-profile-v1.md)  
> 最近复核：2026-08-09

本文使用 `MUST`、`MUST NOT`、`SHOULD`、`MAY` 表达规范强度。

核心原则：

> **Subsystem Control 只管理 Runtime Container identity 与 lifecycle。Data endpoint、Renderer Data Connection、Frame、Render、Content 都是独立协议域。**

## 1. 协议范围

```text
Subsystem → Main
    subsystem.hello      Request
    subsystem.status     Notification

Main → Subsystem
    subsystem.shutdown   Request
```

v1 负责：

```text
Control bootstrap
descriptor.key identity binding
Runtime initializing / ready / failed
Main-requested shutdown
Control loss lifecycle mapping
Subsystem Control version negotiation
```

v1 不负责：

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

`subsystem.status({state:"ready"})` 不携带 `rendererDataEndpoint`。Runtime readiness 与 Renderer⇄Subsystem Data bootstrap 是独立协议域。

## 2. Transport Independence

Subsystem Control v1 application semantics 不固定具体 Control carrier。

可由 Host Profile 绑定：

```text
Desktop Control  → localhost WebSocket
PWA Control      → authenticated MessagePort
```

Host Profile 负责安全建立 Control carrier，但不得改变本文 Runtime identity/lifecycle semantics。

每个 transport application unit 承载 exactly one JSON-RPC message object；当前 Runtime Control Application Profile v1 禁止 JSON-RPC Batch。

## 3. Connection Bootstrap

新 Control Connection / Port 的第一条 LoomRealm application message MUST 是 `subsystem.hello`。

hello 成功前：

```text
connection has no bound subsystem identity
no subsystem.status
no Frame / Call
no Data control operation
```

第一条 LoomRealm application message 不是合法 hello 时，Main MUST fail closed。

## 4. Bootstrap Credential

`bootstrapToken` 是 Main 为一次 Launch Attempt 建立的一次性 bearer credential。

它 MUST：

- 绑定唯一 Launch Attempt 与 `descriptor.key`；
- 每次 Launch Attempt 新生成；
- 在 Runtime 可执行前注册到 Main authentication state；
- 只允许成功消费一次；
- hello 成功后立即 consumed；
- 不用 PID、端口、path、launchId 替代；
- 不进入普通日志或用户可见错误。

## 5. `subsystem.hello`

```text
Method:    subsystem.hello
Type:      JSON-RPC Request
Direction: Subsystem → Main
```

```ts
interface SubsystemHelloParamsV1 {
  readonly key: string;
  readonly bootstrapToken: string;
  readonly protocolVersions: readonly number[];
}

interface SubsystemHelloResultV1 {
  readonly protocolVersion: 1;
}
```

Main 验证：

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

不得通过 wire error 区分 unknown key / invalid token / consumed token / mismatch。

## 6. Version Negotiation

`protocolVersions` 只协商 `loomrealm.subsystem-control`。

```text
1..16 positive integer entries
no duplicates
selectedVersion = max(intersection)
```

当前 conformant Runtime MUST advertise `1`，通常为：

```text
[1]
```

该字段不协商：

```text
Frame / Call
Renderer Control
Renderer⇄Subsystem Connection
User Input
Render Update
Content API
```

## 7. Identity Binding

hello 成功后：

```text
consume bootstrapToken
→ permanently bind current Control Connection to descriptor.key
→ Main observed state = identified
```

同一 Control Connection 生命周期内 identity MUST NOT 改变。

后续消息依赖 connection-bound identity；不得重复携带 key 建立第二身份来源。

同一 Launch Attempt 最多一个成功 identified Control Connection。

## 8. Runtime State Model

Main observed public state：

```ts
type MainObservedSubsystemStateV1 =
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
type SubsystemRuntimeStatusV1 =
  | { readonly state: "initializing" }
  | { readonly state: "ready" }
  | { readonly state: "stopping" }
  | {
      readonly state: "failed";
      readonly error: SubsystemRuntimeErrorV1;
    };

interface SubsystemRuntimeErrorV1 {
  readonly code: string;
  readonly message?: string;
}
```

`stopped` 只来自 Supervisor / Host Runtime existence observation。

## 9. `subsystem.status`

```text
Method:    subsystem.status
Type:      JSON-RPC Notification
Direction: Subsystem → Main
```

v1 closed union：

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

## 10. `ready`

`ready` 只表示：

> Runtime required initialization 完成，并能够承担 enclosing Runtime Application Profile 声明的后续 Runtime 角色。

在当前 [Runtime Control Application Profile v1](./runtime-control-profile-v1.md) 下，这包括完整承担 Frame / Call v1 Subsystem 角色。

`ready` MUST NOT 解释为：

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

Data Connection 的 endpoint/Port/credential/generation 由 Renderer Control + Host/Platform Binding + Data Connection Contract 独立定义。

## 11. `failed`

`status(failed)` 是 Runtime self-reported terminal failure。

发送后 Runtime：

```text
MUST NOT start new normal Control operation
SHOULD perform bounded cleanup
SHOULD terminate promptly
```

恢复必须是 new Launch Attempt + new bootstrap credential + new Runtime + new Control Connection。

v1 无 failed→ready。

## 12. `subsystem.shutdown`

```text
Method:    subsystem.shutdown
Type:      JSON-RPC Request
Direction: Main → Subsystem
```

```ts
type SubsystemShutdownReasonV1 = "session-end" | "bootstrap-abort";
interface SubsystemShutdownParamsV1 {
  readonly reason: SubsystemShutdownReasonV1;
}
interface SubsystemShutdownResultV1 {}
```

Success 只表示 graceful shutdown 被接受，不表示 Runtime 已经退出。

Main 在发送前 MUST 建立 shutdown intent 并进入 observed `stopping`。

## 13. Lifecycle Transitions

无 shutdown intent：

```text
identified → initializing / ready / failed
initializing → ready / failed
ready → failed
```

有 shutdown intent 额外允许：

```text
identified/initializing/ready → stopping
stopping → failed
```

重复 status、ready→initializing、stopping→ready、failed→anything 均为 fatal protocol state error。

## 14. Control Loss / Runtime Exit

无 shutdown intent：

```text
unexpected Control loss → failed
unexpected Runtime exit → failed
```

exit code 0 也不改变分类。

有 shutdown intent 时由 Supervisor 判断 stopped/failed；Runtime 已经 failed 后不能因后续 exit 恢复为 stopped。

v1 无 same-attempt Control reconnect。

## 15. Error Model

JSON-RPC 标准错误：

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

v1 codes：

```text
BOOTSTRAP_AUTHENTICATION_FAILED
CONTROL_PROTOCOL_UNSUPPORTED
DUPLICATE_CONTROL_CONNECTION
PROTOCOL_STATE_ERROR
```

## 16. Request ID / JSON / Limits

Request ID：

```text
positive safe integer
connection lifetime sender-side never reused
```

若 v1 与 Frame / Call v1 共享同一 physical Control Connection，[Runtime Control Application Profile v1](./runtime-control-profile-v1.md) 定义跨 domain shared sender namespace。

Core limits：

```text
max application message           1 MiB
max JSON nesting depth             64
protocolVersions entries           1..16
bootstrapToken                     1..4096 UTF-8 bytes
SubsystemRuntimeError.code         1..128 ASCII chars
SubsystemRuntimeError.message      0..4096 UTF-8 bytes
```

plain JSON-compatible values only；closed schema；当前 Runtime Control Profile v1 禁止 JSON-RPC Batch。

## 17. Security

- bootstrapToken 按 secret 处理；
- Control Transport 由 Host Profile 安全建立/限制；
- hello error 不泄露 token/key 匹配细节；
- logs 应脱敏；
- connection-bound key 是唯一 Runtime identity；
- Data credential 不得通过 `subsystem.status(ready)` 传输；
- Runtime executable trust / sandbox 属于 Host/Launcher Profile。

## 18. 与 Frame / Call v1 的组合

当前正式组合是 [Runtime Control Application Profile v1](./runtime-control-profile-v1.md)：

```text
Subsystem Control v1
+
Frame / Call v1
```

Runtime Control Profile MUST NOT 顺带加入 Data lease/control methods；DataAuthority、Data bootstrap、User Input、Render Update 均属于独立协议域。

## 19. Conformance Minimum

至少覆盖：

```text
hello-first-message
valid/invalid bootstrap credential
version-selection-1
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

Desktop WebSocket 与 PWA MessagePort Profile 应对同一 abstract lifecycle trace 得到相同 Main-observed Runtime state。

## 20. Core Invariants

1. Control 只拥有 Runtime identity/lifecycle；
2. `descriptor.key` 是唯一 Runtime identity；
3. hello 前无 authenticated operation；
4. bootstrapToken 一次性；
5. `spawn != connected != identified != ready`；
6. ready 不包含/暗示 Renderer Data endpoint；
7. Data connection/auth 属于独立协议；
8. Main 拥有正常 shutdown intent；
9. stopped 只来自 Supervisor；
10. 无 shutdown intent 的 Control loss/Runtime exit 是 failure；
11. no reconnect/resume/restart/heartbeat in v1 Core；
12. Frame / Call v1 保持独立协议域。
