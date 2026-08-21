# `@loomrealm/runtime-control` 设计

> 状态：Implementation Ready / Core Contract Frozen  
> 阶段：M3 Runtime Control first implementation baseline  
> 最近复核：2026-08-21  
> 目标：把 Subsystem Control v1、Frame / Call v1 与 Runtime Control Application Profile v1 落成可执行、可测试、transport-independent 的协议 mechanics；不拥有 Main Frame/Stack authority，也不拥有 Subsystem business authority。  
> 正式 Profile：[Runtime Control Application Profile v1](../../doc/15-contracts/runtime-control-profile-v1.md)  
> Control：[Subsystem Control Protocol v1](../../doc/15-contracts/subsystem-control-protocol-v1.md)  
> Frame：[Frame / Call Protocol v1](../../doc/15-contracts/frame-call-protocol-v1.md)  
> 首次实现前收口：[ADR 0021](../../doc/decisions/0021-runtime-control-preimplementation-closure.md)  
> 实施：[第一阶段交付计划](../../doc/30-implementation/phase-1-delivery-plan.md)

核心原则：

> **`@loomrealm/runtime-control` 拥有“如何正确说 Runtime Control 协议”的 mechanics 与 connection-local protocol state；Main / Subsystem Host 拥有真正 application authority。业务作者不直接消费本包。**

---

## 1. Position

```text
already-established MessageCarrier<string>
                ↓
      @loomrealm/runtime-control
                │
                ├── bounded JSON/Profile validation
                ├── one connection-wide reader/dispatcher
                ├── shared strict-monotonic Request IDs
                ├── Subsystem Control protocol state
                ├── Frame protocol mechanics
                ├── typed semantic replies/outcomes
                ├── Response causal barrier
                ├── finite deadline machinery
                └── terminal / late-response classification
                ↓
         role-specific typed peers
             /             \
            /               \
         Main           Subsystem Host
      authority          local role state
```

Runtime Control Profile v1 静态组合：

```text
Subsystem Control v1
+
Frame / Call v1
```

共享：

```text
Control carrier
one inbound reader
one dispatcher
same-sender Request ID namespace
profile message/depth limits
terminal connection fact
```

不共享：

```text
Control lifecycle state machine
Frame/Call application authority
Main Stack mutation
Subsystem business continuation
```

---

## 2. Authority Boundary

本包 MUST 拥有：

```text
Control/Frame wire schema validation
method direction
JSON-RPC dispatch/correlation
shared sender Request ID allocation/validation
hello-first / hello-one-shot gating
connection-bound key after accepted hello
Control reported-state legality
bounded profile decode/encode preflight
pending request table
finite deadline scheduling
late-response classification
Response-before-afterResponse causal barrier
carrier terminal observation
connection terminal first-wins
protocol-fatal classification
```

本包 MUST NOT 拥有：

```text
Main Runtime Registry / Supervisor
Launch Attempt Registry
bootstrap token storage
Main Frame Registry / Stack / Activation allocation
InputTarget publication
Runtime failure unwind authority commit
Subsystem business Frame object model
ordinary input dispatch
Subsystem author API
Renderer/Data/User Input/Render/Content authority
WebSocket / MessagePort establishment
Process / Worker lifecycle
Game Package / Launcher / Platform composition
```

Owner split：

```text
JSON representation                 → @loomrealm/wire
Runtime Control profile mechanics   → @loomrealm/runtime-control
hello authentication authority      → Main
Frame/Stack application commit      → Main
Subsystem local Frame/Input state   → @loomrealm/subsystem/host
transport establishment             → Platform adapter/composition
Runtime failure unwind              → Main
```

---

## 3. Dependency Boundary

Runtime dependencies exactly：

```text
@loomrealm/foundation
    MessageCarrier / CarrierClosed only

@loomrealm/wire
    JsonValue / JSON text / JSON-RPC representation primitives
```

```text
foundation       wire
      \           /
       \         /
     runtime-control
         ↑     ↑
       Main   Subsystem Host
```

MUST NOT depend on：

```text
@loomrealm/main
@loomrealm/subsystem
@loomrealm/game-package
@loomrealm/game-launcher-*
WebSocket / MessagePort / Worker
node:*
filesystem
Fetch
```

Foundation 当前不增加通用 Clock。M3 的真实 deadline 需求由本包自己的最小 scheduler port 承担；只有出现第二个独立稳定消费者后才重新评估是否提升到 Foundation。

---

## 4. Package / Publish Surface

首批只发布：

```text
@loomrealm/runtime-control
```

不发布：

```text
/control
/frame
/profile
/testing
/internal
/node
/browser
```

Source directory MAY 按 protocol 分层，但 source directory 不自动成为 npm subpath contract。

Package metadata baseline：

```text
name = @loomrealm/runtime-control
version = 0.1.0-alpha.0
ESM
Node >= 20
browser-compatible source
sideEffects = false
root export only
runtime dependencies = foundation + wire
```

---

## 5. Exact Root API Shape

首批 root surface 只包含以下 protocol-facing categories：

```text
Control/Frame v1 params/results/status/outcome/error-data types
RuntimeControlScheduler
RuntimeControlHandlerReply
RuntimeControlRequestOutcome
RuntimeControlTerminal
MainRuntimeControlHandlers / Options / Peer
SubsystemRuntimeControlHandlers / ConnectOptions / Peer
createMainRuntimeControlPeer
connectSubsystemRuntimeControl
```

不导出：

```text
RuntimeControlDispatcher
RequestIdAllocator
PendingTable
bounded encoder internals
schema helper internals
terminal controller
state-machine mutable implementation
```

Conceptual public mechanics：

```ts
export interface RuntimeControlScheduler {
  schedule(delayMs: number, callback: () => void): () => void;
}

export type RuntimeControlHandlerReply<Result, SemanticError> =
  | {
      readonly kind: "success";
      readonly result: Result;
      readonly afterResponse?: () => void | Promise<void>;
    }
  | {
      readonly kind: "semantic-error";
      readonly error: SemanticError;
      readonly afterResponse?: () => void | Promise<void>;
    };

export type RuntimeControlRequestOutcome<Result, SemanticError> =
  | { readonly kind: "success"; readonly result: Result }
  | { readonly kind: "semantic-error"; readonly error: SemanticError }
  | { readonly kind: "timeout" }
  | { readonly kind: "terminal"; readonly terminal: RuntimeControlTerminal };

export type RuntimeControlTerminal =
  | { readonly kind: "carrier-closed" }
  | { readonly kind: "carrier-lost"; readonly cause?: unknown }
  | { readonly kind: "protocol-fatal"; readonly cause?: unknown }
  | {
      readonly kind: "request-timeout";
      readonly method: RuntimeControlRequestMethod;
      readonly id: number;
    }
  | { readonly kind: "local-fatal"; readonly cause: unknown };
```

`message`/diagnostic wording不形成 compatibility contract；role code只按 typed outcome/terminal kind 分支。

---

## 6. Role-specific Peers

禁止动态：

```ts
createRuntimeControlSession({ role: "main" | "subsystem" })
```

首批使用 role-specific constructors，使错误方向 API 在类型层不存在。

### Main

```ts
createMainRuntimeControlPeer(options): MainRuntimeControlPeer
```

Main peer protocol surface：

```text
receives
    subsystem.hello
    subsystem.status
    frame.call
    frame.return

sends
    subsystem.shutdown
    frame.initialize
    frame.activate
    frame.suspend
    frame.resume
    frame.close
```

### Subsystem

```ts
await connectSubsystemRuntimeControl(options)
    → SubsystemRuntimeControlPeer
```

`connectSubsystemRuntimeControl` 内部发送 `subsystem.hello`，只有 hello Success 后才返回 usable peer。

Subsystem peer protocol surface：

```text
sends
    subsystem.status
    frame.call
    frame.return

receives
    subsystem.shutdown
    frame.initialize
    frame.activate
    frame.suspend
    frame.resume
    frame.close
```

因此：

```text
hello-before-status/frame
```

成为 construction invariant，而不是 business caller 自己维护的布尔 flag。

---

## 7. Hello / Authentication Ownership

Runtime Control owns：

```text
hello exact schema
hello must be first application Request
hello one-shot
protocolVersions shape/limits/no duplicates
Control version selection
selected Control 1
connection key binding after accepted hello
Frame/status gating before hello
```

Main owns：

```text
key exists in current logical registry?
active Launch Attempt exists?
bootstrapToken matches attempt?
token unconsumed?
duplicate successful Control connection?
atomic token consumption / Launch Attempt authority
```

Main injects an authentication callback; Runtime Control MUST NOT store or mint bootstrap credentials。

Authentication rejection externally remains generic `BOOTSTRAP_AUTHENTICATION_FAILED` except the separately defined `DUPLICATE_CONTROL_CONNECTION` semantic error；unknown-key/bad-token/consumed-token/mismatch不得被细分泄露。

`CONTROL_PROTOCOL_UNSUPPORTED` 由 Runtime Control 根据 `protocolVersions ∩ {1}` 直接决定，不委托 Main business authority。

---

## 8. Control Protocol State

Runtime Control MUST implement connection-local protocol legality；不再是 optional helper。

Main-side protocol projection：

```text
awaiting-hello
    ↓ hello accepted
identified
    ↓ status(initializing)?
initializing
    ↓ status(ready)
ready
    ↓ Main shutdown intent
stopping

identified/initializing/ready/stopping
    → status(failed)
    → failed
```

Subsystem-side protocol projection mirrors the legal report/request sequence。

Fatal protocol state cases include：

```text
second hello
status before hello
Frame before hello
repeated status
ready → initializing
stopping → ready
failed → any normal operation
status(stopping) without Main shutdown intent
```

`stopped` MUST NOT be synthesized by this package；它只来自 Platform/Supervisor actual Runtime termination observation。

---

## 9. Frozen Frame Surface

Exactly seven Requests：

```text
Main → Subsystem
    frame.initialize
    frame.activate
    frame.suspend
    frame.resume
    frame.close

Subsystem → Main
    frame.call
    frame.return
```

本包拥有：

```text
exact params/results/outcome/failure representation
method direction
closed schema
profile limits
semantic error envelope/data validation
request/response correlation
deadline/late-response mechanics
protocol-side call/return mutation gate
```

本包不拥有：

```text
Frame/Activation ID allocation
Main Stack
InputTarget
call acceptance transaction
return acceptance transaction
failure unwind commit
ordinary input dispatch
business continuation
```

Frame semantic error data 以 Frozen Frame / Call v1 的 exhaustive union 为准。Unknown `-32000 error.data.code` MUST be protocol-fatal，不允许降级成 generic business failure。

---

## 10. One Reader / Dispatcher

同一 Control Connection：

```text
MessageCarrier.messages()
        ↓ exactly one reader
bounded decode / classify
        ├── Response
        │      → pending correlation immediately
        │
        └── Request / Notification
               → role dispatch lane
```

必须同时满足：

```text
exactly one code path iterates carrier.messages()
Control + Frame share one dispatcher
pending table connection-wide
Responses cannot be hidden behind a second reader
```

关键规则：

> **single reader != single blocking handler loop。reader MUST NOT await role handler completion when that would prevent a later Response from reaching pending correlation。**

Request/Notification 的 application dispatch 顺序 MUST preserve inbound carrier order；具体内部 queue/task strategy不是 public API。

---

## 11. Serialized Writer

所有 outbound JSON-RPC message 通过同一个 connection writer 串行进入 `carrier.send()`。

原因：

```text
Request ID issue order
Response causal barriers
Control/Frame shared carrier order
terminal error reply ordering
```

不得让多个 role helper 直接并发调用 carrier.send 并依赖 scheduler timing 猜顺序。

Foundation `send()` resolution 只表示 local adapter acceptance/order，不表示 remote business commit。

---

## 12. Request ID Namespace

ADR 0021 收紧 current v1：同一 sender / same Control Connection：

```text
positive safe integer 1..Number.MAX_SAFE_INTEGER
strictly monotonically increasing
Control + Frame shared namespace
never reused
never wrap
```

两个 sender 方向 namespace 独立。

首批 allocator：

```text
1, 2, 3, ... Number.MAX_SAFE_INTEGER
```

耗尽：

```text
no wrap
no reuse
→ local fatal / connection unusable for new Request
```

Receiver 保存 `lastRemoteRequestId` 即可；incoming Request：

```text
id <= lastRemoteRequestId
→ protocol fatal
```

Request ID 只做 correlation，不是 operation identity/idempotency token。

---

## 13. Inbound Pipeline

唯一顺序：

```text
MessageCarrier.messages(): string
↓
actual UTF-8 bytes <= 1 MiB
↓
@loomrealm/wire.parseJsonText
↓
JSON depth <= 64
↓
Runtime Control profile limits
↓
@loomrealm/wire.decodeJsonRpcMessage
↓
Runtime Control Request-ID rules
↓
direction / method
↓
method exact schema
↓
protocol state gate
↓
typed role handler
```

Runtime Control Profile owns the resource/schema limits above Wire representation；Wire不因此获得 Runtime/Frame domain authority。

Source-level duplicate JSON member 不在 M3 建第二 parser：observable semantics 跟随 frozen Wire / ECMAScript `JSON.parse`。Parsed object 仍必须满足 closed schema。

---

## 14. Profile Limits

Connection-wide hard入口：

```text
max application message          1,048,576 UTF-8 bytes
max JSON container depth         64
```

Control 继续满足：

```text
protocolVersions entries         1..16
bootstrapToken                   1..4096 UTF-8 bytes
SubsystemRuntimeError.code       1..128 ASCII chars
SubsystemRuntimeError.message    0..4096 UTF-8 bytes
```

Frame 继续满足 Frozen limits：

```text
business JsonValue               <= 524,288 bytes
JsonValue string                 <= 262,144 UTF-8 bytes
object key                       <= 256 UTF-8 bytes
array elements                   <= 16,384
object members                   <= 16,384
frameId / activationId           1..128 UTF-8 bytes
targetSubsystemKey               1..256 UTF-8 bytes
FrameFailure.code                1..128 ASCII chars
FrameFailure.message             0..4096 UTF-8 bytes
```

Unpaired surrogate MUST reject at Runtime Control profile validation even though generic Wire representation can carry a JS string containing it。

---

## 15. Outbound Preflight / Bounded Encoding

Outbound path：

```text
typed method value
↓
method/profile schema validation
↓
bounded serialized-size measurement
↓
@loomrealm/wire.stringifyJson
↓
serialized writer
```

MUST NOT：

```text
stringify an arbitrarily expanding shared DAG
then discover it exceeds 1 MiB
```

Internal bounded measurement MUST count JSON wire expansion per occurrence and stop as soon as a hard limit is exceeded。只有证明 serialized result <= hard limit 后才调用 Wire stringify。

这不是第二套 JSON semantics：

```text
Wire owns JsonValue validity/serialization semantics
Runtime Control owns profile resource budget
```

---

## 16. JSON-RPC Error / Fatal Table

Expected behavior 冻结为：

| inbound fact | wire behavior | local classification |
|---|---|---|
| malformed JSON text | best-effort `-32700`, `id:null` | protocol-fatal |
| JSON-RPC Batch / invalid envelope | best-effort `-32600`, `id:null` | protocol-fatal |
| unknown or wrong-direction Request method | `-32601` for trusted Request id | protocol-fatal |
| known Request with invalid params | `-32602` | protocol-fatal |
| invalid Notification | no Response | protocol-fatal |
| valid LoomRealm semantic rejection | `-32000` + typed `error.data` | code-specific recoverable/fatal |
| invalid/unsolicited/late-after-nonterminal Response | no Response | protocol-fatal |
| non-monotonic/reused remote Request id | protocol error reply when safely addressable | protocol-fatal |
| unexpected role handler throw | MUST NOT masquerade as semantic error | local-fatal |

Fatal error reply is diagnostic/best-effort；session terminal fact first-wins，send failure不得恢复 session。

Protocol corruption MUST NOT 被转成 `FrameFailure` business outcome。

---

## 17. Response Causal Barrier

Frozen Frame 要求：

```text
frame.call Response
    happens-before
Child initialize / activate

frame.return Response
    happens-before
close / resume
```

因此 inbound Request handler 可以返回：

```text
reply + optional afterResponse
```

Runtime Control 固定执行：

```text
handler returns success/semantic-error reply
↓
encode / outbound preflight
↓
serialized carrier.send(Response)
↓ await local send acceptance/order
afterResponse()
```

`afterResponse` MUST NOT 在 Response `carrier.send()` resolve 前执行。

Main 在 `frame.call`/`frame.return` 的 application commit 仍发生在 Main；Runtime Control 只提供 causal barrier，不拥有 Stack authority。

---

## 18. Outbound Request Lifecycle

唯一顺序：

```text
validate params
↓
bounded encode/preflight
↓
allocate next monotonic Request ID
↓
insert pending correlation
↓
arm finite relative deadline
↓
serialized carrier.send(Request)
↓
wait for terminal Response / timeout / connection terminal
```

Deadline covers local send wait + remote response wait；MUST NOT 因 local send stalled 而形成无界 Request。

Race rule：

```text
pending settlement first-wins
```

如果 valid correlated Response 先 settle：cancel deadline。  
如果 deadline callback 先 settle：Request becomes timeout；后续 Response 是 late diagnostics only。

ID 一经分配即永久 consumed，不因 pre-send failure/timeout/semantic error而复用。

---

## 19. Deadline Domains

Frame seven Requests：

```text
1000 <= frameDeadlineMs <= 300000
integer milliseconds
sender-local
stable for one Control Connection
finite
relative elapsed-time scheduler
not in RPC params
not negotiated per Request
```

Control deadlines 独立：

```text
hello deadline
shutdown deadline
```

Control deadline 是 Host/role policy，但 MUST finite positive integer。

不得：

```text
use frameDeadlineMs as shutdown deadline implicitly
put deadlineMs in wire params
retry after timeout
```

`RuntimeControlScheduler.schedule(delayMs, callback)` 是 relative-time port；production adapter 与 deterministic fake 都必须保持 once-or-cancel semantics。returned cancel function MUST be idempotent。

---

## 20. Timeout / Commit Classification

Frame Request：

```text
Success
    → known committed postcondition

explicit recoverable semantic Error
    → known not committed where Frozen protocol says so

divergence / protocol Error
    → fatal

timeout / carrier loss
    → applied-or-not unknown
    → ambiguous
    → connection terminal / Runtime-fatal mapping by role
```

No application retry/replay/resync。

Hello timeout：bootstrap/session terminal。  
Shutdown timeout：does NOT manufacture `stopped`；Supervisor/Platform decides escalation/actual termination。

---

## 21. Call / Return Mutation Gate Boundary

Runtime Control protocol-side guarantee：

```text
while one outbound frame.call/frame.return is pending
    second outbound frame.call/frame.return MUST be rejected locally
```

Only recoverable pre-commit semantic rejection releases the protocol-side gate for the still-current Activation。

Runtime Control cannot gate ordinary input because it does not own input dispatch。

`@loomrealm/subsystem/host` M4 MUST map this pending mutation fact to：

```text
stop ordinary input dispatch
no second business call/return
```

Fatal/ambiguous outcome MUST NOT re-enter old business continuation。

---

## 22. Terminal Model

Connection terminal first-wins：

```text
carrier closed
carrier lost
protocol fatal
request timeout
local fatal
```

MUST：

```text
terminal immutable
terminal Promise settles once
all pending Requests settle exactly once
all deadline handles cancelled/retired
no new normal send after terminal
close() idempotent
no same-attempt reconnect/reuse
late Response cannot restore authority/outcome
```

Runtime Control reports connection fact；Main/Supervisor decides whether physical Runtime is `failed` or later `stopped` according to shutdown intent/termination observation。

---

## 23. Semantic Error Envelope

LoomRealm semantic error：

```text
JSON-RPC error.code = -32000
error.data.code = stable semantic code
```

Control v1：

```text
BOOTSTRAP_AUTHENTICATION_FAILED
CONTROL_PROTOCOL_UNSUPPORTED
DUPLICATE_CONTROL_CONNECTION
PROTOCOL_STATE_ERROR
```

Frame v1 exhaustive union：

```text
FRAME_CALL_TARGET_NOT_FOUND
FRAME_CALL_TARGET_UNAVAILABLE
FRAME_INITIALIZE_REJECTED
FRAME_NOT_FOUND
FRAME_STATE_MISMATCH
ACTIVATION_MISMATCH
FRAME_STACK_MISMATCH
FRAME_OWNERSHIP_MISMATCH
```

Recoverable Frame codes only：

```text
FRAME_CALL_TARGET_NOT_FOUND
FRAME_CALL_TARGET_UNAVAILABLE
FRAME_INITIALIZE_REJECTED
```

Unknown/malformed semantic error data = protocol-fatal。

---

## 24. File Layout

Target first implementation：

```text
packages/runtime-control/
├── DESIGN.md
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts
│   ├── scheduler.ts
│   ├── terminal.ts
│   ├── limits.ts
│   ├── encoding.ts
│   ├── dispatcher.ts
│   ├── writer.ts
│   ├── request-ids.ts
│   ├── pending.ts
│   ├── control/
│   │   ├── model.ts
│   │   ├── schema.ts
│   │   └── state.ts
│   ├── frame/
│   │   ├── model.ts
│   │   ├── schema.ts
│   │   └── errors.ts
│   ├── main-peer.ts
│   └── subsystem-peer.ts
└── test/
    ├── encoding.test.mjs
    ├── dispatcher.test.mjs
    ├── request-ids.test.mjs
    ├── control.test.mjs
    ├── frame.test.mjs
    ├── deadline.test.mjs
    ├── terminal.test.mjs
    └── package-boundary.test.mjs
```

不建立：

```text
generic-rpc/
schema-dsl/
codec-framework/
transport/
node/
browser/
```

---

## 25. Automated Closure Matrix

```text
representation/profile
    actual-utf8-message-1mib
    json-depth-64
    no-batch
    malformed-json
    unpaired-surrogate
    string/key/member/array/frame/control limits
    duplicate-json-source-follows-wire-json-parse

reader/dispatcher
    exactly-one-carrier-reader
    control-frame-same-dispatcher
    response-correlation-not-blocked-by-handler
    inbound-request-order-preserved

writer/barrier
    one-serialized-writer
    response-send-accepted-before-afterResponse
    frame-call-response-before-child-rpc
    frame-return-response-before-close-resume

request-id
    positive-safe-integer
    strict-monotonic-local-allocation
    shared-control-frame-namespace
    remote-nonmonotonic-rejected
    exhaustion-no-wrap
    late-response-never-recorrelates

hello/control
    hello-first
    hello-one-shot
    version-list-1..16-no-duplicate
    select-control-1
    generic-auth-failure
    auth-callback-main-owned
    status-frame-before-hello-fatal
    legal-state-transitions
    repeated/retrograde-state-fatal
    stopping-requires-shutdown-intent
    stopped-never-fabricated

frame
    exact-seven-methods
    exact-directions
    closed-params-results
    semantic-error-union
    unknown-semantic-code-fatal
    second-call-return-pending-rejected

deadline
    deterministic-injected-scheduler
    frame-1000-300000-bounds
    stable-per-connection
    deadline-not-in-wire
    deadline-covers-send-and-response
    first-settlement-wins
    timeout-ambiguous-no-retry
    late-response-diagnostics-only

terminal
    first-wins
    pending-settled-once
    carrier-closed/lost
    protocol-fatal
    local-handler-throw
    request-timeout
    idempotent-close
    no-same-attempt-reconnect

package
    root-export-only
    foundation-wire-only
    no-node-websocket-messageport
    npm-pack-dry-run
```

Transport adapter abstract-trace equivalence is later integration qualification；M3 package tests use deterministic `MessageCarrier` fixtures。

---

## 26. Implementation Stages

```text
Stage A  package skeleton / metadata / root export
Stage B  Control + Frame wire models / semantic data
Stage C  profile limits / bounded encode + decode
Stage D  request IDs / pending table / serialized writer
Stage E  single-reader dispatcher / terminal controller
Stage F  hello + Control state
Stage G  Frame typed peers / Response barrier / mutation gate
Stage H  scheduler / finite deadlines / late-response
Stage I  conformance + package boundary + CI
Stage J  real role-consumer qualification
```

A–I 完成后：

```text
Implemented Baseline / Core Contract Frozen
```

Real downstream qualification：

```text
M4 @loomrealm/subsystem/host
M5 @loomrealm/main
```

M3 不构造假的 Subsystem/Main authority 实现来冒充 real consumer qualification。

---

## 27. Explicit Non-goals

```text
Main Runtime Registry / Supervisor
Frame Stack implementation
Activation allocation
InputTarget
Runtime failure unwind implementation
Subsystem business SDK
ordinary input dispatch
Renderer/Data protocols
Platform transport establishment
WebSocket/MessagePort adapter
Process/Worker lifecycle
generic JSON-RPC framework
schema DSL
generic scheduler package
reconnect/resume/retry/idempotency journal
```

---

## 28. Closure Criteria

Runtime Control DESIGN 达到 implementation-ready 的定义：

> **实现者只需要选择 internal data structures / private helper / scheduling mechanics；不再需要自行决定 public package surface、role direction、hello ownership、reader/dispatcher model、Request ID semantics、profile limits、Response causal barrier、deadline start/settlement、semantic/fatal mapping、terminal behavior或 consumer ownership。**

M3 local closure 必须证明：

```text
established MessageCarrier
→ bounded Runtime Control protocol mechanics
→ role-specific typed peer

all expected protocol inputs
→ deterministic typed outcome / terminal

failure
→ no retry/replay/reconnect
→ pending settles once
→ authority owner remains outside package
```

---

## 29. Final Invariants

1. Runtime Control = protocol mechanics / connection-local protocol state，不是 product authority；
2. Control v1 与 Frame v1 保持独立 protocol semantics，Profile只组合 carrier/dispatcher/ID/limits；
3. root export only；不预建 `/control` `/frame` `/testing`；
4. runtime dependencies exactly Foundation + Wire；
5. one Control carrier exactly one inbound reader + one connection dispatcher；
6. single reader不被 blocking role handler阻断 Response correlation；
7. outbound 使用 one serialized writer；
8. same sender Control+Frame Request ID strict monotonically increasing、never reuse/wrap；
9. one carrier unit = one UTF-8 JSON text JSON-RPC object；no Batch；
10. duplicate JSON source member semantics跟随 frozen Wire/JSON.parse，不建立第二 parser；
11. profile limits属于 Runtime Control；Wire只拥有 generic representation；
12. hello auth mechanics属于 Runtime Control，credential/Launch Attempt authority属于 Main；
13. hello成功前无 status/Frame；second hello fatal；
14. stopped只来自 actual termination observation；
15. exactly seven Frame Requests，不新增 Runtime/Frame method；
16. Runtime Control提供 Response causal barrier，但不拥有 Main Stack commit；
17. Frame Request finite deadline；timeout/loss ambiguous；no retry；
18. deadline覆盖 send + response，pending settlement first-wins；
19. late Response只用于 diagnostics，不能恢复 authority/outcome；
20. call/return pending期间 protocol-side second mutation被拒绝；ordinary input gate属于 Subsystem Host；
21. terminal first-wins、immutable、pending settle exactly once；
22. protocol corruption不能伪装成 business Frame failure；
23. Main/Subsystem Host是本包 role consumers；business author只依赖 `@loomrealm/subsystem`；
24. current v1 的 M3 preimplementation correction 不创建 v2/compat parser；后续真实 compatibility obligation形成后遵守正常 version/migration 治理。
