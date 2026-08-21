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
> 实现收口：[ADR 0021](../decisions/0021-runtime-control-preimplementation-closure.md)  
> 最近复核：2026-08-21

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

Typical realization：

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

Platform负责建立/交付 carrier，但不得改变 identity/lifecycle semantics。这些是 Platform Binding，不是额外 Host application protocol。

Source-level duplicate JSON member observable semantics由 enclosing Runtime Control Profile/Wire定义；Control v1不建立第二 parser。

---

## 3. Connection Bootstrap

新 Control Connection 第一条 LoomRealm application message MUST是 `subsystem.hello` Request。

hello Success 前：

```text
no bound subsystem identity
no subsystem.status
no Frame / Call
no Data control operation
```

第一条 message不是合法 hello → Main MUST fail closed。

同一 connection 第二个 hello → fatal protocol state error。

---

## 4. Bootstrap Credential

`bootstrapToken` 是 Main 为一次 Launch Attempt建立的一次性 bearer credential。

MUST：

```text
bind unique Launch Attempt + descriptor.key
fresh each Launch Attempt
registered before Runtime can execute
one successful consumption
consumed atomically as part of successful hello authority decision
not derived from PID/port/path/launchId
not logged
```

Authentication failure externally unified：

```text
BOOTSTRAP_AUTHENTICATION_FAILED
```

不得区分：

```text
unknown key
bad token
consumed token
key/token mismatch
inactive Launch Attempt
```

`DUPLICATE_CONTROL_CONNECTION` remains a separate semantic failure because it expresses a connection-state conflict rather than credential detail。

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

Exact schema；no optional/extension fields。

Main authority validates：

```text
key exists in current logical Subsystem Registry
active Launch Attempt exists for key
token belongs to attempt
token unconsumed
no already-successful Control Connection for same attempt
```

`key` case-sensitive/exact string identity，与 Game/Runtime subsystem key一致。

---

## 6. Mechanics vs Authority Ownership

`@loomrealm/runtime-control` mechanics owns：

```text
hello wire/schema validation
hello-first / hello-one-shot
protocolVersions limits/duplicates
Control version selection
state gating
connection-local bound key after accepted hello
JSON-RPC Response/error mechanics
```

Main owns：

```text
Subsystem Registry
Launch Attempt Registry
bootstrapToken creation/storage/consumption
connection authority conflict decision
Runtime observed authority state outside connection-local mechanics
```

Runtime Control implementation MUST request an injected Main authentication decision；不得自行 mint/store Launch Attempt credentials。

Token consumption / successful authority decision MUST happen before a hello Success is emitted。If the Success Response later cannot be delivered due carrier failure, token/attempt authority MUST NOT roll back；Main handles resulting Runtime failure according to lifecycle policy。

---

## 7. Version Negotiation

`protocolVersions` only negotiates `loomrealm.subsystem-control`。

```text
array length 1..16
entries positive safe integers
no duplicates
selected = max(intersection(peerVersions, supportedVersions))
```

Current conformant Runtime MUST advertise `1`；current Main MUST support `1`。

No intersection：

```text
CONTROL_PROTOCOL_UNSUPPORTED
```

Not negotiated here：

```text
Frame / Call
Renderer Control
Renderer Data Profile
User Input
Render Update
Content API
```

Frame v1 is statically bound by Runtime Control Profile v1。

---

## 8. Identity Binding

Accepted hello authority：

```text
consume token / commit Main auth decision
→ permanently bind Control Connection to descriptor.key
→ emit hello Success
→ connection becomes usable as identified
```

Connection identity never changes。

Subsequent Control/Frame messages use connection-bound identity；they do not repeat key except where Frame business method explicitly references a target subsystem key。

Same Launch Attempt has at most one successful identified Control Connection。

---

## 9. Runtime State Model

Main observed product state may contain：

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

Runtime-reported Control status：

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

Connection-local protocol state only projects the report legality needed to enforce v1。`declared/starting/connected/stopped` contain Main/Platform facts outside this protocol mechanics。

`stopped` only comes from Platform/Supervisor actual Runtime termination observation；Subsystem MUST NOT report it through `subsystem.status`。

---

## 10. `subsystem.status`

```text
Method:    subsystem.status
Type:      JSON-RPC Notification
Direction: Subsystem → Main
```

Closed union：

```json
{"state":"initializing"}
{"state":"ready"}
{"state":"stopping"}
{"state":"failed","error":{"code":"..."}}
```

Failed MAY include `message` as specified by limits。

MUST NOT add：

```text
rendererDataEndpoint
dataProfile
dataPort/dataTicket
frameId/activationId/renderId
pid/launchId
statusRevision
arbitrary metadata
```

Since this is a Notification, invalid schema/state receives no JSON-RPC Response and is protocol-fatal for the connection。

---

## 11. `ready`

`ready` means only：

> Runtime required initialization completed and Runtime can fully perform the Subsystem role required by enclosing Runtime Control Application Profile。

Current includes complete Frame / Call v1 Subsystem role。

`ready` MUST NOT imply：

```text
Renderer connected
DataAuthority exists
Data profile available remotely
Data carrier exists
Data provisioning offer exists
Frame/Render/InputTarget exists
Content preloaded
```

Platform provisioning channel existence and Data endpoint/ticket delivery stay outside Control wire。

---

## 12. `failed`

`status(failed)` is Runtime self-reported terminal protocol state。

After sending it, Runtime：

```text
MUST NOT start any new normal Control/Frame operation
SHOULD perform bounded local cleanup
SHOULD terminate promptly
```

No：

```text
failed → ready
failed → initializing
failed → stopping as normal recovery
```

Recovery requires fresh Launch Attempt + token + Runtime + Control Connection。

---

## 13. `subsystem.shutdown`

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

Success means graceful shutdown intent accepted；it does NOT mean physical Runtime has exited。

Before Main sends shutdown：

```text
Main commits shutdown intent
→ connection protocol state allows stopping
→ subsystem.shutdown Request
```

Subsystem handling shutdown MAY then report `status({state:"stopping"})`。

Shutdown timeout/loss MUST NOT synthesize `stopped`；Supervisor/Platform decides physical escalation and observes termination。

---

## 14. Lifecycle Transition Legality

Without shutdown intent：

```text
identified → initializing / ready / failed
initializing → ready / failed
ready → failed
```

With Main shutdown intent：

```text
identified / initializing / ready → stopping
stopping → failed
```

Fatal protocol state error：

```text
status before hello
second hello
repeated identical status
ready → initializing
stopping → ready
failed → any normal Control/Frame operation
stopping without Main shutdown intent
```

Connection mechanics MUST enforce these transitions；not optional helper behavior。

---

## 15. Control Loss / Runtime Exit

Without shutdown intent：

```text
unexpected Control closed/lost → Runtime failed
unexpected Runtime exit        → Runtime failed
```

Exit code 0 does not change this classification。

With shutdown intent, Main/Supervisor uses actual termination context to decide final stopped/failed outcome。

If Runtime already failed, later exit MUST NOT rewrite it as successful stopped recovery。

v1 has no same-attempt Control reconnect/resume。

---

## 16. Error Model

Standard JSON-RPC mechanics are defined by Runtime Control Profile：

```text
-32700 Parse error
-32600 Invalid Request
-32601 Method not found
-32602 Invalid params
```

LoomRealm semantic envelope：

```text
error.code = -32000
error.data.code = stable code
```

Control v1 semantic codes exactly：

```text
BOOTSTRAP_AUTHENTICATION_FAILED
CONTROL_PROTOCOL_UNSUPPORTED
DUPLICATE_CONTROL_CONNECTION
PROTOCOL_STATE_ERROR
```

Authentication detail MUST NOT be exposed through different code/message/data shape。

Unexpected local handler/authority callback exception is local implementation fatal，not a Control semantic error。

---

## 17. Request ID / Limits

Request IDs follow enclosing Runtime Control Profile strict sender rule：

```text
positive safe integer
strictly monotonically increasing per sender/connection
Control + Frame shared same-sender namespace
never reused
never wrap
```

Two sender directions are independent。

Core Control limits：

```text
max application message           1,048,576 UTF-8 bytes
max JSON nesting depth            64
protocolVersions entries          1..16
bootstrapToken                    1..4096 UTF-8 bytes
SubsystemRuntimeError.code        1..128 ASCII chars
SubsystemRuntimeError.message     0..4096 UTF-8 bytes
```

`SubsystemRuntimeError.code` MUST be non-empty ASCII protocol/business diagnostic code；message is optional human diagnostic and not compatibility branching contract。

Plain JSON-compatible parsed values；closed schema；no Batch；unpaired surrogate rejected by enclosing profile validation。

---

## 18. Control Deadlines

Control timeout policy remains independent from Frame deadline。

Required finite policy domains：

```text
Subsystem hello Request deadline
Main shutdown Request deadline
```

Exact values are Host/role policy，but MUST be positive finite integer milliseconds and use the enclosing Runtime Control relative scheduler mechanics。

Timeout：

```text
hello timeout      → bootstrap/connection terminal
shutdown timeout   → connection/request terminal; no fabricated stopped
```

No automatic retry/replay/reconnect。

---

## 19. Security

- `bootstrapToken` is secret bearer material；
- Platform limits Control carrier to accepted trust boundary；
- auth failure does not reveal key/token matching detail；
- logs redact token and sensitive bootstrap material；
- connection-bound key is Runtime protocol identity；
- Data credential/profile never travels in ready/status；
- executable trust/sandbox stays Platform/Runner realization；
- malformed/protocol-corrupt input MUST fail closed。

---

## 20. Frame Composition / Data Independence

Runtime Control Profile：

```text
Subsystem Control v1
+ Frame / Call v1
```

Control MUST NOT absorb：

```text
Data lease/provisioning methods
Frame lifecycle status messages
Renderer authority
Input/Render application messages
```

DataAuthority/dataProfile、Data bootstrap、User Input、Render Update remain separate protocol domains。

---

## 21. Conformance

At minimum：

```text
hello-first-message
hello-one-shot
valid-invalid-consumed-bootstrap-credential
auth-failure-detail-not-leaked
version-selection-1
version-list-1..16-no-duplicate
connection-key-binding
ready-has-no-data-endpoint-profile-ticket
ready-does-not-imply-data-connection
stopping-requires-main-intent
repeated-status-fatal
retrograde-status-fatal
failed-blocks-normal-operation
stopped-only-from-supervisor
unexpected-control-loss-fails-runtime
unexpected-exit-code-zero-fails-runtime
shutdown-timeout-does-not-produce-stopped
no-same-attempt-reconnect
closed-status-schema
strict-monotonic-request-id-via-profile
wire-profile-limits
websocket-messageport-json-text-equivalence
```

---

## 22. Final Invariants

1. Control only owns Runtime identity/lifecycle protocol semantics；
2. descriptor.key is exact connection-bound Runtime identity；
3. hello is first and one-shot；before hello no status/Frame；
4. bootstrapToken is one-time and Main-owned authority material；
5. Runtime Control package owns hello mechanics，Main owns Launch Attempt/token decision；
6. launch != connected != identified != ready；
7. ready carries/implies no Data/Renderer/Frame existence material；
8. status transitions are closed and enforced；repeated/retrograde status fatal；
9. Main owns normal shutdown intent；
10. stopped only comes from actual Runtime termination observation；
11. without shutdown intent Control loss/Runtime exit is failure；
12. shutdown Success is acceptance，not termination；timeout does not fabricate stopped；
13. Request IDs are strict monotonic same-sender connection lifetime and share namespace with Frame；
14. current carrier unit is UTF-8 JSON text；no Batch/second parser；
15. no reconnect/restart/heartbeat in v1；
16. Frame / Call remains separate application protocol domain；
17. Platform Binding differences MUST NOT change Control semantics。
