# Main ⇄ Subsystem Runtime Control Application Profile v1

> 层级：正式契约 / Application Profile  
> 状态：Active / Normative / Stabilizing  
> Profile 版本：1  
> 主要定义：同一 Main ⇄ Subsystem Control Connection 上 Subsystem Control v1 与 Frame / Call v1 的组合、版本绑定、single reader/dispatcher、strict-monotonic Request ID namespace、JSON-text mapping、deadline/terminal mechanics  
> 依赖：[Subsystem Control v1](./subsystem-control-protocol-v1.md)、[Frame / Call v1](./frame-call-protocol-v1.md)  
> 实现收口：[ADR 0021](../decisions/0021-runtime-control-preimplementation-closure.md)  
> 最近复核：2026-08-21

本文不新增 Runtime/Frame method，也不拥有 Main/Subsystem application authority。

核心原则：

> **Runtime lifecycle 使用 Subsystem Control v1；Frame transaction 使用 Frame / Call v1。共享同一 Control Connection 只共享 carrier/dispatcher/Request-ID/profile mechanics，不合并两套 protocol/application state machine。**

---

## 1. Composition / Static Binding

```text
Runtime Control Application Profile v1
├── Subsystem Control Protocol v1
└── Frame / Call Protocol v1
```

固定版本：

```text
Subsystem Control = 1
Frame / Call      = 1
```

Profile 自身不是新的 wire handshake。

Profile 由 Runtime deployment/implementation 静态选择，不由 Game params、Frame RPC、Renderer 或 Platform manifest 动态协商。

不存在：

```text
runtime.profile.hello
frame.hello
frame.version
frame.capabilities
```

`subsystem.hello.protocolVersions` 只协商 Subsystem Control。Current conformant Runtime MUST advertise/support Control 1；Main 选择 Control 1 后 Frame / Call 1 由本 Profile 静态绑定。

---

## 2. Application Unit / Wire Boundary

固定：

```text
one carrier application unit
= one UTF-8 JSON text string
= exactly one JSON-RPC message object
```

JSON-RPC Batch Array禁止。

Typical bindings：

```text
Hostra WebSocket  one complete text message
PWA MessagePort   postMessage(string)
MemoryCarrier     string
```

Structured Clone / Transferable 只用于 Platform bootstrap/provisioning，不扩大 Runtime Control application value model。

Generic JSON representation由 `@loomrealm/wire` 定义；Runtime Control Profile在其上增加 domain/profile limits、direction/state/error semantics。

### Duplicate source members

ADR 0021 当前 v1 收口：

```text
raw JSON text
→ frozen Wire parseJsonText / ECMAScript JSON.parse observable semantics
→ parsed JsonValue
→ Runtime Control closed-schema validation
```

因此 source-level duplicate JSON object member不由 Runtime Control另建 parser检测。Parsed result仍必须满足 exact closed schema。

Runtime Control MUST NOT私藏 second JSON tokenizer/parser。

---

## 3. Bootstrap / Ready

```text
obtain current Control carrier
→ subsystem.hello
→ identified
→ optional initializing
→ ready
```

新 connection 的第一条 LoomRealm application message MUST是 Subsystem → Main `subsystem.hello` Request。

hello Success 前：

```text
no bound subsystem identity
no subsystem.status
no Frame / Call operation
no Data operation
```

`ready` 表示 Runtime required initialization完成，并能完整承担 Frame / Call v1 Subsystem role。

`ready` MUST NOT表示：

```text
Renderer Data Connection exists
Data endpoint/Port/ticket known
DataAuthority granted
Renderer connected
Frame/Render/InputTarget exists
Content capability distributed
```

---

## 4. Shared Control Connection

同一 authenticated Control Connection 承载：

```text
Subsystem Control
    subsystem.hello
    subsystem.status
    subsystem.shutdown

Frame / Call
    frame.initialize
    frame.activate
    frame.suspend
    frame.resume
    frame.close
    frame.call
    frame.return
```

Frame method只在 hello Success、connection 已绑定 descriptor.key 后合法。

Data/User Input/Render/Content 不进入本 connection/profile。

---

## 5. One Connection-wide Reader / Dispatcher

Control + Frame MUST由 exactly one connection-wide reader消费唯一 inbound `MessageCarrier.messages()` stream：

```text
MessageCarrier
      ↓ one reader
bounded decode/classify
      ├── Response → pending correlation immediately
      └── Request/Notification → ordered role dispatch lane
```

不得让 Control parser、Frame parser或 peer helper各自竞争 carrier reader。

关键：

> **one reader != one blocking application handler loop。Reader MUST remain able to correlate a later Response while an earlier role handler is still awaiting completion。**

Request/Notification role dispatch MUST preserve inbound carrier order。

Response只有 `id`；pending correlation table必须 connection-wide。

---

## 6. One Serialized Writer

同一 connection 的所有 outbound JSON-RPC messages MUST通过 one serialized writer调用 `MessageCarrier.send()`。

Writer order用于保证：

```text
strict Request-ID issue/send order
Control + Frame causal ordering
Response-before-afterResponse barrier
terminal diagnostic reply order
```

Concurrent high-level API calls不得直接并发调用 carrier.send 并把顺序交给 event-loop timing。

`MessageCarrier.send()` resolve只表示 local adapter acceptance/order，不表示 remote business commit。

---

## 7. Shared Strict-monotonic Sender Request ID Namespace

ADR 0021 收紧 current v1：same sender / same Control Connection：

```text
positive safe integer 1..2^53-1
strictly monotonically increasing
Control + Frame Requests share namespace
never reused
never wrap
```

Subsystem sender Requests：

```text
subsystem.hello
frame.call
frame.return
```

Main sender Requests：

```text
subsystem.shutdown
frame.initialize
frame.activate
frame.suspend
frame.resume
frame.close
```

`subsystem.status` 是 Notification，不消耗 Request ID。

Main/Subsystem 两个 sender direction namespace独立。

Receiver MUST reject：

```text
Request id <= last successfully accepted remote Request id
```

as protocol-fatal。实现可用 O(1) `lastRemoteRequestId`；不得要求 connection-lifetime all-seen Set。

Allocator exhaustion MUST NOT wrap/reuse。

Request ID只做 correlation，不是 operation ID/idempotency key。

---

## 8. Inbound Decode / Validation Order

固定 pipeline：

```text
carrier string
↓
actual UTF-8 byte gate <= 1 MiB
↓
Wire parseJsonText
↓
JSON container depth <= 64
↓
profile/domain hard limits
↓
Wire decodeJsonRpcMessage
↓
Runtime Control Request-ID rule
↓
direction / method
↓
method exact schema
↓
Control/Profile state gate
↓
typed role handler
```

Representation invalid、oversize、depth/limit violation、invalid JSON-RPC envelope、wrong direction、invalid params 等不得进入 role business authority callback。

---

## 9. JSON / Message Limits

Connection-wide：

```text
max application message              1,048,576 UTF-8 bytes
max JSON container nesting depth     64
plain JSON-compatible representation
closed method/result/error schemas
```

Control additionally：

```text
protocolVersions entries             1..16
bootstrapToken                       1..4096 UTF-8 bytes
SubsystemRuntimeError.code           1..128 ASCII chars
SubsystemRuntimeError.message        0..4096 UTF-8 bytes
```

Frame additionally follows Frozen Frame v1：

```text
standalone business JsonValue        <= 524,288 bytes
JsonValue string                     <= 262,144 UTF-8 bytes
JSON object key                      <= 256 UTF-8 bytes
array elements                       <= 16,384
object members                       <= 16,384
frameId / activationId               1..128 UTF-8 bytes
targetSubsystemKey                   1..256 UTF-8 bytes
FrameFailure.code                    1..128 ASCII chars
FrameFailure.message                 0..4096 UTF-8 bytes
```

Unpaired surrogate rejected by profile/domain validation。

All platforms measure actual UTF-8 JSON text carrier unit；不存在 PWA structured-object/reference-equivalent sizing。

---

## 10. Outbound Preflight

Sender MUST validate method/schema/profile limits before the message enters carrier writer。

Hard byte limit MUST be enforced without first materializing an arbitrarily expanding serialized shared DAG。

Conformant strategy：

```text
validate JsonValue with Wire semantics
→ bounded serialized UTF-8 size measurement, stop > limit
→ only when within limit call Wire stringifyJson
→ serialized writer
```

Runtime Control owns profile budget；Wire remains generic representation authority。

Outbound local schema/profile violation is local-fatal/programming error, not a remote semantic Error and MUST NOT be emitted as business Frame failure。

---

## 11. Response Causal Barrier

Inbound Request handler may produce：

```text
Success result OR typed semantic Error
+ optional afterResponse action
```

Connection mechanics MUST execute：

```text
handler reply ready
→ encode/preflight Response
→ serialized carrier.send(Response)
→ await local send acceptance/order
→ afterResponse
```

This directly supports Frozen Frame requirements：

```text
frame.call Response happens-before Child initialize/activate
frame.return Response happens-before close/resume
```

Application commit itself remains Main/Subsystem Host authority；Profile only defines the response causal barrier。

---

## 12. Outbound Request / Deadline Lifecycle

Each Request：

```text
validate/preflight
→ allocate next strict-monotonic ID
→ insert pending correlation
→ arm finite relative deadline
→ serialized carrier.send(Request)
→ await correlated terminal Response / timeout / connection terminal
```

Deadline covers local send wait + remote response wait，preventing unbounded operation if local send stalls。

Pending settlement：

```text
first-wins
```

If valid correlated Response settles first：deadline cancel/retire。  
If deadline callback settles first：Request timeout；ID remains consumed；later Response is late diagnostics only。

No application retry/replay/reconnect replay。

---

## 13. Domain-specific Deadline Policy

Shared connection does not mean shared timeout value。

Frame seven Requests：

```text
1000 <= frameDeadlineMs <= 300000
integer ms
finite
sender-local
stable for one Control Connection
relative elapsed-time scheduler
not in RPC params
not negotiated per Request
```

Control：

```text
hello deadline      finite positive Host/role policy
shutdown deadline   finite positive Host/role policy
termination policy  Supervisor/Platform concern
```

Frame deadline MUST NOT silently substitute for hello/shutdown deadline。

Shutdown timeout does not mean Runtime stopped；actual stopped仍要求 Supervisor physical termination observation。

---

## 14. Error / Fatal Mapping

Standard JSON-RPC wire codes：

```text
-32700 Parse error
-32600 Invalid Request
-32601 Method not found
-32602 Invalid params
```

LoomRealm semantic：

```text
error.code = -32000
error.data.code = stable semantic code
```

Expected classification：

```text
malformed JSON
    → best-effort -32700 id:null
    → protocol-fatal

Batch / invalid envelope
    → best-effort -32600 id:null
    → protocol-fatal

unknown or wrong-direction valid Request method
    → -32601 using trusted Request id
    → protocol-fatal

known Request invalid params
    → -32602
    → protocol-fatal

invalid Notification
    → no Response
    → protocol-fatal

valid known semantic rejection
    → -32000 typed error.data
    → semantic code defines recoverable/fatal

invalid/unsolicited Response
    → no Response
    → protocol-fatal

non-monotonic/reused remote Request ID
    → protocol-fatal

unexpected role handler throw
    → local-fatal
    → MUST NOT masquerade as semantic/business error
```

Fatal diagnostic reply is best-effort；failure to send it does not undo terminal state。

---

## 15. Control State Mechanics

Profile implementation MUST enforce Subsystem Control legality，not optional helper。

Fatal cases include：

```text
second hello
status before hello
Frame before hello
repeated status
ready → initializing
stopping → ready
failed → normal operation
status(stopping) without Main shutdown intent
```

`stopped` is not a Control wire state/report；only Supervisor actual termination produces it。

hello authentication authority仍属于 Main；Runtime Control package only owns mechanics/version/gating。

---

## 16. Frame Commit / Ambiguity Boundary

Frame：

```text
Success
    → known committed local postcondition

explicit recoverable semantic Error
    → protocol-defined known no-commit

divergence/protocol error
    → fatal

timeout/carrier loss
    → applied/not-applied unknown
    → ambiguous
    → Runtime-fatal role path
```

No retry/replay/resync。

Runtime Control package may enforce only protocol-side call/return pending mutation gate；ordinary input dispatch gate belongs to Subsystem Host。

Main Stack recovery continues according to Frozen Frame fixed-point unwind；not implemented by this Profile/package。

---

## 17. Terminal Connection Semantics

Terminal sources：

```text
carrier closed
carrier lost
protocol fatal
Request timeout
local fatal
```

Connection terminal is：

```text
first-wins
immutable
settled once
```

On terminal：

```text
all pending Requests settle exactly once
all active deadline handles retire/cancel
no new normal sends
local close is idempotent
no same-attempt reconnect/reuse
late Response cannot restore authority/outcome
```

Runtime Control reports connection terminal fact。Main/Supervisor maps it to Runtime `failed`/shutdown escalation/actual `stopped` according to protocol and physical termination context。

---

## 18. Data Plane Independence

本 Profile MUST NOT增加/承载：

```text
Data endpoint discovery
dataProfile selection
Data ticket/credential
Data Connection handshake
User Input
Render Update
Content Grant
```

```text
Runtime ready != Data Connection ready
Frame active   != Data Connection required
```

Data authority由 Renderer Control发布；physical Data carrier由 Platform Broker建立；application Data stack由 Renderer Data Profile定义。

---

## 19. Platform Binding

Platform may realize current Control carrier using：

```text
Hostra Desktop → localhost WebSocket
PWA            → MessagePort
```

Platform负责安全 establish/deliver carrier与 Launch Attempt bootstrap material；established 后 application semantics完全由本 Profile/child protocols决定。

Transport adapter不得 retry/duplicate LoomRealm application mutation。

---

## 20. Version Evolution

Profile v1 fixed：

```text
Control 1 + Frame 1
```

ADR 0021 是 first conformant implementation 前 current-v1 mechanics closure：

```text
strict-monotonic sender Request IDs
Wire duplicate-source alignment
single-reader nonblocking-correlation rule
serialized writer / Response barrier
deadline/terminal settlement semantics
```

It does not alter Frame seven methods/authority/commit/unwind semantics。

After first real compatibility obligation, incompatible changes require normal profile/protocol version/migration；ADR 0018/0021 are not permanent exemptions。

---

## 21. Conformance

At minimum：

```text
hello-first-message
control-version-selection-1
hello-before-status-frame
hello-versions-control-only
ready-has-no-data-material
single-control-reader-dispatcher
response-correlation-not-blocked-by-handler
single-serialized-writer
response-send-before-afterResponse
strict-monotonic-shared-sender-id-namespace
remote-id-regression-rejected
request-id-exhaustion-no-wrap
one-json-text-message-unit
no-jsonrpc-batch
actual-utf8-1mib
json-depth-64
profile-limits
unpaired-surrogate-rejected
duplicate-json-source-follows-wire-semantics
finite-frame-deadlines
hello-shutdown-deadline-distinct-from-frame
request-timeout-first-settlement
late-response-no-recovery
terminal-first-wins
pending-settles-once
no-retry-replay-reconnect
hostra-pwa-equivalent-control-frame-trace
```

---

## 22. Final Invariants

1. Runtime Control Profile v1 = Control v1 + Frame / Call v1；
2. Profile不新增 Runtime/Frame handshake/method/field；
3. Control/Frame共享 carrier mechanics，不合并 application state authority；
4. hello前无 authenticated status/Frame operation；
5. `ready` requires complete Frame role但不携 Data/Platform material；
6. one Control Connection exactly one inbound reader / one connection dispatcher；
7. reader不得被 blocking handler阻断 Response correlation；
8. all outbound messages through one serialized writer；
9. same sender Control+Frame Request IDs strict monotonically increase，never reuse/wrap；
10. one application unit = one UTF-8 JSON text JSON-RPC object；Batch禁止；
11. source duplicate JSON member semantics跟随 frozen Wire/JSON.parse；
12. Profile owns 1 MiB/depth/domain resource limits，Wire owns generic JSON representation；
13. outbound hard-limit preflight must be bounded before stringify materialization；
14. Response send acceptance happens-before `afterResponse` dependent operation；
15. finite deadline covers send + response；pending settlement first-wins；
16. Frame timeout/loss ambiguous，no retry/replay；
17. terminal first-wins；pending settle exactly once；late Response cannot recover state；
18. `stopped`只来自 actual Runtime termination observation；
19. Data/User Input/Render/Content不进入本 Profile；
20. Hostra/PWA physical binding可不同但 application semantics必须相同。
