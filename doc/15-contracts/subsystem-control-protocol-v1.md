# Main ⇄ Subsystem Control Protocol v1

> 层级：正式契约  
> 状态：Active / Normative  
> 协议版本：1  
> 协议标识：`loomrealm.subsystem-control`  
> 稳定程度：Stabilizing  
> 主要定义：Main ⇄ Subsystem Runtime Container 的 bootstrap、身份绑定、Runtime lifecycle 与 shutdown；不承载 Renderer Data material  
> 依赖：[Game Package v1](./game-package-v1.md)  
> Desktop realization：[Desktop Node.js Launcher / Subsystem Runner Profile v1](./nodejs-launcher-profile-v1.md)  
> 组合 Profile：[Runtime Control Application Profile v1](./runtime-control-profile-v1.md)  
> 最近复核：2026-08-19

本文使用 `MUST`、`MUST NOT`、`SHOULD`、`MAY` 表达规范强度。

核心原则：

> **Subsystem Control 只管理 Runtime Container identity/lifecycle。Frame、Renderer Data、User Input、Render、Content 与 Platform provisioning 都是独立域。**

---

## 1. Wire Surface

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
initializing / ready / failed
Main-requested shutdown
Control loss lifecycle mapping
Control version negotiation
```

不负责：

```text
Frame / Call
Renderer Data endpoint/ticket/profile provisioning
User Input
Render Update
Content Grant
Runtime restart/checkpoint
heartbeat
```

---

## 2. Platform Independence / Application Unit

Control application semantics不固定物理 carrier。

典型 realization：

```text
Hostra Desktop → localhost WebSocket
PWA            → MessagePort
```

Runtime Control Profile v1统一：

```text
one carrier unit
= one UTF-8 JSON text string
= one JSON-RPC message object
```

Platform负责建立/交付 carrier，但不得改变 identity/lifecycle semantics。

这些是 Platform Binding，不是额外 Host application protocol。

---

## 3. Connection Bootstrap

新 Control Connection第一条 LoomRealm application message MUST是 `subsystem.hello`。

hello成功前：

```text
no bound subsystem identity
no subsystem.status
no Frame / Call
no Data control operation
```

第一条 message不是合法 hello → Main MUST fail closed。

---

## 4. Bootstrap Credential

`bootstrapToken` 是 Main 为一次 Launch Attempt建立的一次性 bearer credential。

MUST：

```text
bind unique Launch Attempt + descriptor.key
fresh each Launch Attempt
registered before Runtime can execute
one successful consumption
consumed immediately on successful hello
not derived from PID/port/path/launchId
not logged
```

认证失败统一：

```text
BOOTSTRAP_AUTHENTICATION_FAILED
```

不得区分 unknown key / bad token / consumed token / mismatch。

---

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

Main验证：

```text
key exists in current Descriptor Registry
active Launch Attempt exists for key
token belongs to attempt
token unconsumed
```

`key` 大小写敏感、逐字符精确。

---

## 6. Version Negotiation

`protocolVersions` 只协商 `loomrealm.subsystem-control`。

```text
1..16 positive integer entries
no duplicates
selected = max(intersection)
```

当前 Runtime MUST advertise `1`。

不协商：

```text
Frame / Call
Renderer Control
Renderer Data Profile
User Input
Render Update
Content API
```

Frame v1由 Runtime Control Profile v1静态绑定。

---

## 7. Identity Binding

hello成功：

```text
consume token
→ permanently bind Control Connection to descriptor.key
→ Main observed state = identified
```

同一 Connection identity不可改变。

后续消息依赖 connection-bound identity，不重复 key。

同一 Launch Attempt最多一个成功 identified Control Connection。

---

## 8. Runtime State Model

Main observed：

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

Runtime-reported：

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

`stopped` 只来自 Platform/Supervisor actual Runtime existence observation。

---

## 9. `subsystem.status`

```text
Method:    subsystem.status
Type:      JSON-RPC Notification
Direction: Subsystem → Main
```

closed union：

```json
{"state":"initializing"}
{"state":"ready"}
{"state":"stopping"}
{"state":"failed","error":{"code":"..."}}
```

不得增加：

```text
rendererDataEndpoint
dataProfile
dataPort/dataTicket
frameId/activationId/renderId
pid/launchId
statusRevision
arbitrary metadata
```

---

## 10. `ready`

只表示：

> Runtime required initialization完成，并能承担 enclosing Runtime Control Application Profile声明的后续 Runtime role。

当前包括完整 Frame / Call v1 Subsystem role。

`ready` MUST NOT表示：

```text
Renderer connected
DataAuthority exists
Data profile supported remotely
Data carrier exists
Data provisioning offer exists
Frame/Render/InputTarget exists
Content预载
```

Platform provisioning channel存在与否、Data endpoint/ticket如何交付都不进入 `ready` wire。

---

## 11. `failed`

`status(failed)` 是 Runtime self-reported terminal failure。

发送后 Runtime：

```text
MUST NOT start new normal Control operation
SHOULD perform bounded cleanup
SHOULD terminate promptly
```

恢复必须 fresh Launch Attempt + token + Runtime + Control Connection。

无 failed→ready。

---

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

Success只表示 graceful shutdown accepted，不表示 Runtime已经退出。

Main发送前 MUST建立 shutdown intent并进入 observed `stopping`。

---

## 13. Lifecycle Transitions

无 shutdown intent：

```text
identified → initializing / ready / failed
initializing → ready / failed
ready → failed
```

有 shutdown intent额外：

```text
identified/initializing/ready → stopping
stopping → failed
```

重复 status、ready→initializing、stopping→ready、failed→anything都是 fatal protocol state error。

---

## 14. Control Loss / Runtime Exit

无 shutdown intent：

```text
unexpected Control loss → failed
unexpected Runtime exit → failed
```

exit code 0不改变分类。

有 shutdown intent时由 Main/Supervisor根据 termination context判定 stopped/failed。

Runtime已 failed后不能因后续 exit恢复为 stopped-success。

v1无 same-attempt Control reconnect。

---

## 15. Error Model

标准 JSON-RPC：

```text
-32700
-32600
-32601
-32602
```

semantic：

```text
error.code = -32000
error.data.code = stable code
```

v1：

```text
BOOTSTRAP_AUTHENTICATION_FAILED
CONTROL_PROTOCOL_UNSUPPORTED
DUPLICATE_CONTROL_CONNECTION
PROTOCOL_STATE_ERROR
```

---

## 16. Request ID / Limits

Request ID：

```text
positive safe integer
sender-side connection lifetime never reused
```

共享 Frame carrier时，Runtime Control Profile定义跨 domain shared sender namespace。

Core limits：

```text
max application message           1 MiB
max JSON nesting depth             64
protocolVersions entries           1..16
bootstrapToken                     1..4096 UTF-8 bytes
SubsystemRuntimeError.code         1..128 ASCII chars
SubsystemRuntimeError.message      0..4096 UTF-8 bytes
```

plain JSON-compatible values；closed schema；no Batch。

---

## 17. Security

- bootstrapToken按 secret处理；
- Platform限制 Control carrier到认可 boundary；
- hello error不泄露 token/key匹配细节；
- logs脱敏；
- connection-bound key是唯一 Runtime protocol identity；
- Data credential/profile不通过 ready传输；
- executable trust/sandbox属于 Platform/Runner realization。

---

## 18. Frame Composition / Data Independence

Runtime Control Profile：

```text
Subsystem Control v1
+ Frame / Call v1
```

MUST NOT顺带加入 Data lease/provisioning methods。

DataAuthority/dataProfile、Data bootstrap、User Input、Render Update均属于独立域。

---

## 19. Conformance

至少：

```text
hello-first-message
valid/invalid/consumed bootstrap credential
version-selection-1
connection-key-binding
ready-has-no-data-endpoint/profile/ticket
ready-does-not-imply-data-connection
stopping-requires-main-intent
stopped-only-from-supervisor
unexpected-control-loss-fails-runtime
unexpected-exit-code-zero-fails-runtime
no-same-attempt-reconnect
closed-status-schema
wire-limits
websocket/messageport-json-text-equivalence
```

---

## 20. Final Invariants

1. Control只拥有 Runtime identity/lifecycle；
2. descriptor.key是唯一 Runtime identity；
3. hello前无 authenticated operation；
4. bootstrapToken一次性；
5. launch != connected != identified != ready；
6. ready不包含/暗示 Data endpoint/profile/provisioning；
7. Data Connection/auth/profile属于独立域；
8. Main拥有正常 shutdown intent；
9. stopped只来自 actual Runtime termination；
10. 无 shutdown intent的 Control loss/Runtime exit是 failure；
11. no reconnect/resume/restart/heartbeat in v1；
12. Frame / Call保持独立协议域；
13. Platform Binding差异不得改变 Control semantics。