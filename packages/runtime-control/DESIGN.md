# `@loomrealm/runtime-control` 设计

> 状态：Implemented Baseline / Core Contract Frozen（Stage A–I local closure complete）
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
                ├── one serialized writer
                ├── shared strict-monotonic Request IDs
                ├── Subsystem Control protocol state
                ├── Frame protocol mechanics
                ├── typed semantic outcomes
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

Runtime Control Profile v1 statically binds：

```text
Subsystem Control v1
+
Frame / Call v1
```

Shared connection mechanics：

```text
one carrier
one inbound reader
one dispatcher
one outbound writer
same-sender Request ID namespace
profile message/depth limits
pending/terminal state
```

Not shared/owned by this package：

```text
Main Frame/Stack/Activation authority
Runtime failure unwind commit
Subsystem business continuation
Renderer/Data/Input/Render/Content authority
```

---

## 2. Authority / Dependency Boundary

### Runtime Control owns

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
protocol/local-fatal classification
```

### Runtime Control does not own

```text
Main Runtime Registry / Supervisor
Launch Attempt Registry
bootstrap token storage/minting
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

Runtime dependencies exactly：

```text
@loomrealm/foundation
    MessageCarrier / CarrierClosed

@loomrealm/wire
    JsonValue / JSON text / JSON-RPC representation primitives
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

Foundation current baseline不增加通用 Clock。M3 deadline由本包自己的 narrow scheduler port承担；只有出现第二个独立稳定消费者后才重新评估提升到 Foundation。

---

## 3. Package / Publish Surface

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

Source directory MAY按 Control/Frame/Profile 分层；source layout不是 npm subpath contract。

---

## 4. Exact Wire-model Exports

以下 public types field-for-field 对应 formal Control/Frame v1；实现不得增加 extension bag 或 optional metadata。

```ts
import type { MessageCarrier } from "@loomrealm/foundation";
import type { JsonValue } from "@loomrealm/wire";

export interface SubsystemHelloParamsV1 {
  readonly key: string;
  readonly bootstrapToken: string;
  readonly protocolVersions: readonly number[];
}

export interface SubsystemHelloResultV1 {
  readonly protocolVersion: 1;
}

export interface SubsystemRuntimeErrorV1 {
  readonly code: string;
  readonly message?: string;
}

export type SubsystemRuntimeStatusV1 =
  | { readonly state: "initializing" }
  | { readonly state: "ready" }
  | { readonly state: "stopping" }
  | {
      readonly state: "failed";
      readonly error: SubsystemRuntimeErrorV1;
    };

export type SubsystemShutdownReasonV1 =
  | "session-end"
  | "bootstrap-abort";

export interface SubsystemShutdownParamsV1 {
  readonly reason: SubsystemShutdownReasonV1;
}

export interface SubsystemShutdownResultV1 {}

export interface FrameFailure {
  readonly code: string;
  readonly message?: string;
  readonly data?: JsonValue;
}

export type FrameOutcome =
  | { readonly type: "completed"; readonly value: JsonValue }
  | { readonly type: "cancelled" }
  | { readonly type: "failed"; readonly error: FrameFailure };

export interface FrameInitializeParams {
  readonly frameId: string;
  readonly input: JsonValue;
}
export interface FrameInitializeResult {}

export interface FrameActivateParams {
  readonly frameId: string;
  readonly activationId: string;
}
export interface FrameActivateResult {}

export interface FrameSuspendParams {
  readonly frameId: string;
  readonly activationId: string;
}
export interface FrameSuspendResult {}

export interface FrameResumeParams {
  readonly frameId: string;
  readonly activationId: string;
  readonly returnedFrameId: string;
  readonly result: FrameOutcome;
}
export interface FrameResumeResult {}

export interface FrameCloseParams {
  readonly frameId: string;
}
export interface FrameCloseResult {}

export interface FrameCallParams {
  readonly frameId: string;
  readonly activationId: string;
  readonly targetSubsystemKey: string;
  readonly input: JsonValue;
}
export interface FrameCallResult {
  readonly childFrameId: string;
}

export interface FrameReturnParams {
  readonly frameId: string;
  readonly activationId: string;
  readonly result: FrameOutcome;
}
export interface FrameReturnResult {}
```

Semantic data exports：

```ts
export type SubsystemHelloErrorDataV1 =
  | { readonly code: "BOOTSTRAP_AUTHENTICATION_FAILED" }
  | { readonly code: "CONTROL_PROTOCOL_UNSUPPORTED" }
  | { readonly code: "DUPLICATE_CONTROL_CONNECTION" };

export type RuntimeControlProtocolStateErrorDataV1 = {
  readonly code: "PROTOCOL_STATE_ERROR";
};

export type FrameRpcErrorData =
  | { readonly code: "FRAME_CALL_TARGET_NOT_FOUND" }
  | { readonly code: "FRAME_CALL_TARGET_UNAVAILABLE" }
  | {
      readonly code: "FRAME_INITIALIZE_REJECTED";
      readonly failure: FrameFailure;
    }
  | { readonly code: "FRAME_NOT_FOUND" }
  | { readonly code: "FRAME_STATE_MISMATCH" }
  | { readonly code: "ACTIVATION_MISMATCH" }
  | { readonly code: "FRAME_STACK_MISMATCH" }
  | { readonly code: "FRAME_OWNERSHIP_MISMATCH" };

export type FrameRecoverableRpcErrorData = Extract<
  FrameRpcErrorData,
  {
    readonly code:
      | "FRAME_CALL_TARGET_NOT_FOUND"
      | "FRAME_CALL_TARGET_UNAVAILABLE"
      | "FRAME_INITIALIZE_REJECTED";
  }
>;

export type FrameFatalRpcErrorData = Exclude<
  FrameRpcErrorData,
  FrameRecoverableRpcErrorData
>;
```

`FrameRpcErrorData` remains the Frozen Frame exhaustive semantic union；Runtime Control does not invent additional Frame business codes。

---

## 5. Exact Mechanics Exports

```ts
export type RuntimeControlRequestMethod =
  | "subsystem.hello"
  | "subsystem.shutdown"
  | "frame.initialize"
  | "frame.activate"
  | "frame.suspend"
  | "frame.resume"
  | "frame.close"
  | "frame.call"
  | "frame.return";

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

export type RuntimeControlSemanticErrorClassification =
  | "recoverable"
  | "fatal";

export type RuntimeControlRequestOutcome<Result, SemanticError> =
  | { readonly kind: "success"; readonly result: Result }
  | {
      readonly kind: "semantic-error";
      readonly error: SemanticError;
      readonly classification: RuntimeControlSemanticErrorClassification;
    }
  | { readonly kind: "timeout" }
  | { readonly kind: "terminal"; readonly terminal: RuntimeControlTerminal };

export type RuntimeControlNotificationOutcome =
  | { readonly kind: "sent" }
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

Stable compatibility facts：union `kind`、semantic error code/data、Request method、terminal category。  
Non-contractual diagnostics：human message、stack wording、`cause` concrete type/text。

`RuntimeControlScheduler.schedule()` cancel function MUST be idempotent；callback executes at most once unless cancelled first。

---

## 6. Exact Main-side Public API

Authentication decision：

```ts
export type MainHelloAuthenticationDecisionV1 =
  | { readonly kind: "accepted" }
  | {
      readonly kind: "rejected";
      readonly code:
        | "BOOTSTRAP_AUTHENTICATION_FAILED"
        | "DUPLICATE_CONTROL_CONNECTION";
    };

export type MainRuntimeControlIdentificationOutcome =
  | {
      readonly kind: "identified";
      readonly key: string;
      readonly protocolVersion: 1;
    }
  | {
      readonly kind: "rejected";
      readonly error: SubsystemHelloErrorDataV1;
    }
  | {
      readonly kind: "terminal";
      readonly terminal: RuntimeControlTerminal;
    };
```

Main inbound handlers：

```ts
export interface MainRuntimeControlHandlers {
  onStatus(
    status: SubsystemRuntimeStatusV1,
  ): void | Promise<void>;

  onFrameCall(
    params: FrameCallParams,
  ):
    | RuntimeControlHandlerReply<FrameCallResult, FrameRpcErrorData>
    | Promise<RuntimeControlHandlerReply<FrameCallResult, FrameRpcErrorData>>;

  onFrameReturn(
    params: FrameReturnParams,
  ):
    | RuntimeControlHandlerReply<FrameReturnResult, FrameRpcErrorData>
    | Promise<RuntimeControlHandlerReply<FrameReturnResult, FrameRpcErrorData>>;
}

export interface MainRuntimeControlPeerOptions {
  readonly carrier: MessageCarrier;
  readonly scheduler: RuntimeControlScheduler;
  readonly frameDeadlineMs: number;
  readonly shutdownDeadlineMs: number;
  readonly handlers: MainRuntimeControlHandlers;
  authenticateHello(
    params: SubsystemHelloParamsV1,
  ):
    | MainHelloAuthenticationDecisionV1
    | Promise<MainHelloAuthenticationDecisionV1>;
}
```

Main outbound surfaces：

```ts
export interface MainSubsystemControlPeer {
  shutdown(
    params: SubsystemShutdownParamsV1,
  ): Promise<
    RuntimeControlRequestOutcome<
      SubsystemShutdownResultV1,
      RuntimeControlProtocolStateErrorDataV1
    >
  >;
}

export interface MainFrameControlPeer {
  initialize(
    params: FrameInitializeParams,
  ): Promise<RuntimeControlRequestOutcome<FrameInitializeResult, FrameRpcErrorData>>;

  activate(
    params: FrameActivateParams,
  ): Promise<RuntimeControlRequestOutcome<FrameActivateResult, FrameRpcErrorData>>;

  suspend(
    params: FrameSuspendParams,
  ): Promise<RuntimeControlRequestOutcome<FrameSuspendResult, FrameRpcErrorData>>;

  resume(
    params: FrameResumeParams,
  ): Promise<RuntimeControlRequestOutcome<FrameResumeResult, FrameRpcErrorData>>;

  closeFrame(
    params: FrameCloseParams,
  ): Promise<RuntimeControlRequestOutcome<FrameCloseResult, FrameRpcErrorData>>;
}

export interface MainRuntimeControlPeer {
  readonly identified: Promise<MainRuntimeControlIdentificationOutcome>;
  readonly control: MainSubsystemControlPeer;
  readonly frame: MainFrameControlPeer;
  readonly terminal: Promise<RuntimeControlTerminal>;
  close(): Promise<void>;
}

export function createMainRuntimeControlPeer(
  options: MainRuntimeControlPeerOptions,
): MainRuntimeControlPeer;
```

`closeFrame` is intentionally distinct from peer `close()`：the former sends `frame.close`; the latter locally closes the Runtime Control connection/carrier。

---

## 7. Exact Subsystem-side Public API

Subsystem inbound handlers：

```ts
export interface SubsystemRuntimeControlHandlers {
  onShutdown(
    params: SubsystemShutdownParamsV1,
  ):
    | RuntimeControlHandlerReply<SubsystemShutdownResultV1, never>
    | Promise<RuntimeControlHandlerReply<SubsystemShutdownResultV1, never>>;

  onFrameInitialize(
    params: FrameInitializeParams,
  ):
    | RuntimeControlHandlerReply<FrameInitializeResult, FrameRpcErrorData>
    | Promise<RuntimeControlHandlerReply<FrameInitializeResult, FrameRpcErrorData>>;

  onFrameActivate(
    params: FrameActivateParams,
  ):
    | RuntimeControlHandlerReply<FrameActivateResult, FrameRpcErrorData>
    | Promise<RuntimeControlHandlerReply<FrameActivateResult, FrameRpcErrorData>>;

  onFrameSuspend(
    params: FrameSuspendParams,
  ):
    | RuntimeControlHandlerReply<FrameSuspendResult, FrameRpcErrorData>
    | Promise<RuntimeControlHandlerReply<FrameSuspendResult, FrameRpcErrorData>>;

  onFrameResume(
    params: FrameResumeParams,
  ):
    | RuntimeControlHandlerReply<FrameResumeResult, FrameRpcErrorData>
    | Promise<RuntimeControlHandlerReply<FrameResumeResult, FrameRpcErrorData>>;

  onFrameClose(
    params: FrameCloseParams,
  ):
    | RuntimeControlHandlerReply<FrameCloseResult, FrameRpcErrorData>
    | Promise<RuntimeControlHandlerReply<FrameCloseResult, FrameRpcErrorData>>;
}

export interface SubsystemRuntimeControlConnectOptions {
  readonly carrier: MessageCarrier;
  readonly scheduler: RuntimeControlScheduler;
  readonly helloDeadlineMs: number;
  readonly frameDeadlineMs: number;
  readonly hello: SubsystemHelloParamsV1;
  readonly handlers: SubsystemRuntimeControlHandlers;
}

export interface SubsystemControlPeer {
  status(
    status: SubsystemRuntimeStatusV1,
  ): Promise<RuntimeControlNotificationOutcome>;
}

export interface SubsystemFrameControlPeer {
  call(
    params: FrameCallParams,
  ): Promise<RuntimeControlRequestOutcome<FrameCallResult, FrameRpcErrorData>>;

  returnFrame(
    params: FrameReturnParams,
  ): Promise<RuntimeControlRequestOutcome<FrameReturnResult, FrameRpcErrorData>>;
}

export interface SubsystemRuntimeControlPeer {
  readonly control: SubsystemControlPeer;
  readonly frame: SubsystemFrameControlPeer;
  readonly terminal: Promise<RuntimeControlTerminal>;
  close(): Promise<void>;
}

export type SubsystemRuntimeControlConnectOutcome =
  | {
      readonly kind: "connected";
      readonly peer: SubsystemRuntimeControlPeer;
    }
  | {
      readonly kind: "rejected";
      readonly error: SubsystemHelloErrorDataV1;
    }
  | { readonly kind: "timeout" }
  | { readonly kind: "terminal"; readonly terminal: RuntimeControlTerminal };

export function connectSubsystemRuntimeControl(
  options: SubsystemRuntimeControlConnectOptions,
): Promise<SubsystemRuntimeControlConnectOutcome>;
```

`returnFrame` is intentionally distinct from JavaScript keyword-ish/general `return` naming and maps exactly to wire method `frame.return`。

No business `Frame`/InputListener/RenderDomain/ContentClient type enters this root API。

---

## 8. Public API Error Discipline

Before a peer exists, invalid constructor/config values are trusted-integration programming errors：

```text
invalid scheduler/deadline/options
→ TypeError
→ no carrier read/send side effect before validation completes
```

After a peer starts：

```text
expected remote semantic result
→ typed RuntimeControlRequestOutcome

notification local send terminal
→ RuntimeControlNotificationOutcome

network/protocol timeout
→ typed timeout + connection terminal where contract requires

carrier/protocol/local fatal
→ typed terminal
```

Normal peer methods MUST NOT require consumers to inspect English `Error.message` or Wire error classes。

Unexpected handler / `afterResponse` throw：

```text
→ local-fatal terminal
→ MUST NOT be serialized as LoomRealm semantic/business error
```

Local caller attempts an outbound operation illegal in current protocol state：

```text
invalid message is NOT sent
→ local-fatal terminal
→ current operation settles terminal
```

---

## 9. Hello / Authentication Ownership

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
active Launch Attempt exists for key?
bootstrapToken matches attempt?
token unconsumed?
duplicate successful Control connection?
atomic token consumption / Launch Attempt authority
```

`authenticateHello()` is invoked only after hello representation/schema/version-list validation。Runtime Control MUST NOT store/mint bootstrap credentials。

`CONTROL_PROTOCOL_UNSUPPORTED` is decided by Runtime Control before authentication callback。

Rejected hello：

```text
send typed hello semantic Error when possible
→ identification/connect outcome = rejected
→ connection becomes unusable for normal operations
→ local close/terminal cleanup
```

Unknown-key/bad-token/consumed-token/mismatch remain externally indistinguishable as `BOOTSTRAP_AUTHENTICATION_FAILED`。

---

## 10. Control Protocol State

Runtime Control MUST enforce connection-local legality；not optional helper。

Main-side projection：

```text
awaiting-hello
    ↓ hello accepted
identified
    ↓ status(initializing)?
initializing
    ↓ status(ready)
ready
    ↓ Main shutdown intent committed before shutdown send
stopping

identified/initializing/ready/stopping
    → status(failed)
    → failed
```

Fatal inbound cases：

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

For a structurally valid Request rejected solely by connection/profile state：

```text
best-effort -32000 {code:"PROTOCOL_STATE_ERROR"}
→ protocol-fatal terminal
```

This profile-level fatal code may be sent in response to a Frame Request before method-specific Frame semantics are reached；it is NOT a `FrameRpcErrorData` recoverable/fatal application result。The requester classifies it as terminal/profile-fatal。

For an invalid-state Notification：no Response，protocol-fatal。

`stopped` MUST NOT be synthesized by Runtime Control；only Platform/Supervisor actual Runtime termination observation produces it。

---

## 11. Frozen Frame Boundary

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

Runtime Control owns：schema/direction/limits/error-envelope/correlation/deadline/late-response/protocol-side call-return mutation gate。

Runtime Control does NOT own：Frame/Activation allocation、Main Stack、InputTarget、call/return acceptance transaction、failure unwind、ordinary input dispatch/business continuation。

Semantic classification：

```text
FRAME_CALL_TARGET_NOT_FOUND       recoverable
FRAME_CALL_TARGET_UNAVAILABLE     recoverable
FRAME_INITIALIZE_REJECTED         recoverable

FRAME_NOT_FOUND                   fatal
FRAME_STATE_MISMATCH              fatal
ACTIVATION_MISMATCH               fatal
FRAME_STACK_MISMATCH              fatal
FRAME_OWNERSHIP_MISMATCH          fatal
```

When a fatal `FrameRpcErrorData` is received：

```text
request outcome = semantic-error(classification:"fatal")
connection terminal commits before any subsequent normal send
```

Unknown/malformed `-32000 error.data` is protocol-fatal，not a business Frame failure。

---

## 12. One Reader / Dispatcher

```text
MessageCarrier.messages()
        ↓ exactly one reader
bounded decode / classify
        ├── Response
        │      → pending correlation immediately
        └── Request / Notification
               → ordered role dispatch lane
```

MUST：

```text
exactly one code path iterates carrier.messages()
Control + Frame share dispatcher/pending table
Response is correlated even while prior role handler awaits
Request/Notification handlers start in inbound carrier order
```

Key rule：

> **single reader != single blocking handler loop。**

Role dispatch MAY serialize handler completion；whatever internal strategy is chosen MUST NOT block Response correlation。

---

## 13. One Serialized Writer

All outbound JSON-RPC messages use one connection writer and one `carrier.send()` serialization lane。

Writer order is authoritative for：

```text
Request-ID send order
Control/Frame shared carrier order
Response causal barrier
terminal diagnostic reply ordering
```

High-level APIs MUST NOT call `carrier.send()` concurrently outside writer。

Foundation `send()` resolve = local adapter acceptance/order only，not remote business commit。

---

## 14. Request ID Namespace

Same sender / same Control Connection：

```text
positive safe integer 1..Number.MAX_SAFE_INTEGER
strictly monotonically increasing
Control + Frame shared namespace
never reused
never wrap
```

Two directions independent。

Local allocator baseline：

```text
1, 2, 3, ... Number.MAX_SAFE_INTEGER
```

An allocated ID is permanently consumed even if local send later fails/times out/terminates。

Receiver：

```text
incoming Request id <= lastRemoteRequestId
→ protocol-fatal
```

Allocator exhaustion：local-fatal；no wrap/reuse。

Request ID is correlation only，not operation identity/idempotency key。

---

## 15. Inbound Pipeline / Profile Limits

Exact order：

```text
carrier string
↓
actual UTF-8 bytes <= 1,048,576
↓
Wire parseJsonText
↓
JSON container depth <= 64
↓
Runtime Control profile/domain limits
↓
Wire decodeJsonRpcMessage
↓
strict remote Request-ID rule
↓
direction / method
↓
exact method schema
↓
protocol state gate
↓
typed role handler
```

Profile hard limits：

```text
Control
    protocolVersions entries         1..16
    bootstrapToken                   1..4096 UTF-8 bytes
    SubsystemRuntimeError.code       1..128 ASCII chars
    SubsystemRuntimeError.message    0..4096 UTF-8 bytes

Frame
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

Unpaired surrogate rejects at Runtime Control profile layer。

Source-level duplicate JSON member observable semantics follow frozen Wire / ECMAScript `JSON.parse`。Parsed object still exact closed schema。M3 MUST NOT create a second parser/tokenizer。

---

## 16. Outbound Bounded Preflight

```text
typed method value
↓
method/profile schema validation
↓
bounded serialized UTF-8 size measurement
↓
Wire stringifyJson
↓
serialized writer
```

MUST NOT stringify an arbitrarily expanding shared DAG first and only then check 1 MiB。

Bounded measurement counts JSON wire expansion per occurrence and stops once a hard limit is exceeded。

```text
Wire owns JsonValue validity/serialization semantics
Runtime Control owns profile resource budget
```

---

## 17. JSON-RPC Error / Fatal Table

| inbound fact | wire behavior | local classification |
|---|---|---|
| malformed JSON | best-effort `-32700`, `id:null` | protocol-fatal |
| Batch / invalid envelope | best-effort `-32600`, `id:null` | protocol-fatal |
| unknown / wrong-direction Request | `-32601` with trusted id | protocol-fatal |
| known Request invalid params | `-32602` | protocol-fatal |
| valid Request invalid only by profile state | `-32000 PROTOCOL_STATE_ERROR` | protocol-fatal |
| invalid Notification | no Response | protocol-fatal |
| valid LoomRealm semantic rejection | `-32000` typed data | recoverable/fatal by code |
| invalid/unsolicited Response | no Response | protocol-fatal |
| non-monotonic/reused Request ID | best-effort fatal reply when safely addressable | protocol-fatal |
| unexpected handler/afterResponse throw | no semantic masquerade | local-fatal |

Fatal diagnostic reply is best-effort；terminal state first-wins and does not depend on reply delivery。

Protocol corruption MUST NOT become `FrameFailure` business outcome。

---

## 18. Response Causal Barrier

Inbound Request handler returns `RuntimeControlHandlerReply`。

Runtime Control sequence：

```text
handler returns success/semantic-error reply
↓
encode / outbound preflight
↓
serialized carrier.send(Response)
↓ await local send acceptance/order
if connection remains usable:
    afterResponse()
```

`afterResponse` MUST NOT start before Response send resolves。

If Response send terminally fails：`afterResponse` MUST NOT run。

If `afterResponse` unexpectedly throws：local-fatal terminal。

Frozen Frame causality：

```text
frame.call Response send accepted
→ Child initialize / activate

frame.return Response send accepted
→ close / resume
```

Main/Subsystem Host application commit remains outside Runtime Control。

---

## 19. Outbound Request Lifecycle / Deadlines

Exact lifecycle：

```text
validate params/options/state
↓
bounded encode/preflight
↓
allocate next monotonic Request ID
↓
insert pending correlation
↓
arm finite relative deadline
↓
enqueue/send through serialized writer
↓
wait for Response / timeout / terminal
```

Deadline covers local writer/send wait + remote Response wait；local send stall cannot create an unbounded Request。

Pending settlement：first-wins。

```text
valid correlated Response first
    → cancel/retire deadline
    → settle request outcome

deadline first
    → settle timeout
    → commit request-timeout terminal where profile requires
    → ID stays consumed
    → later Response diagnostics only
```

Frame deadline：

```text
1000 <= frameDeadlineMs <= 300000
integer milliseconds
sender-local
stable for one Control Connection
finite
not in RPC params
not negotiated per Request
```

Control deadlines：

```text
helloDeadlineMs     finite positive integer
shutdownDeadlineMs  finite positive integer
```

Control values independent from Frame deadline；no implicit reuse。

No application retry/replay/resync。

Shutdown timeout MUST NOT manufacture `stopped`。

---

## 20. Call / Return Mutation Gate

Subsystem peer protocol-side rule：

```text
while one outbound frame.call/frame.return is pending
    no second frame.call/frame.return may start
```

A local second mutation attempt is not sent and is a trusted-integration state violation；Subsystem Host should prevent this through its business gate。If reached, Runtime Control closes via local-fatal to avoid ambiguous continuation。

Only recoverable pre-commit semantic error leaves the old Activation potentially usable according to Frozen Frame semantics。

Runtime Control cannot stop ordinary input dispatch；M4 `@loomrealm/subsystem/host` maps mutation pending into input/business continuation gating。

Fatal/timeout/terminal MUST NOT re-enter old business continuation。

---

## 21. Terminal Model

Terminal sources：

```text
carrier closed
carrier lost
protocol fatal
request timeout
local fatal
```

MUST：

```text
first-wins
immutable terminal value
terminal Promise settles once
all pending Requests settle exactly once
all deadlines retired/cancelled
no new normal sends
close() idempotent
no same-attempt reconnect/reuse
late Response cannot restore authority/outcome
```

`close()` initiates local carrier close and waits for the same terminal cleanup path；it does not send `subsystem.shutdown`。

Runtime Control reports connection fact；Main/Supervisor decides physical Runtime `failed`/shutdown escalation/actual `stopped` from shutdown intent + termination observation。

---

## 22. File Layout

Target implementation：

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
    ├── exports.test.mjs
    ├── encoding.test.mjs
    ├── dispatcher.test.mjs
    ├── request-ids.test.mjs
    ├── control.test.mjs
    ├── frame.test.mjs
    ├── deadline.test.mjs
    ├── terminal.test.mjs
    └── package-boundary.test.mjs
```

Do not create：

```text
generic-rpc/
schema-dsl/
codec-framework/
transport/
node/
browser/
```

---

## 23. Automated Closure Matrix

```text
public-surface
    exact-runtime-root-runtime-exports
    exact-declaration-type-export-list
    main-peer-exact-methods
    subsystem-peer-exact-methods
    no-internal-dispatcher-id-pending-exports

representation/profile
    actual-utf8-message-1mib
    json-depth-64
    no-batch
    malformed-json
    unpaired-surrogate
    control/frame limits
    duplicate-json-source-follows-wire-json-parse
    bounded-shared-dag-outbound-size

reader/dispatcher
    exactly-one-carrier-reader
    control-frame-same-dispatcher
    response-correlation-not-blocked-by-handler
    inbound-request-notification-order-preserved

writer/barrier
    one-serialized-writer
    request-id-send-order
    response-send-accepted-before-afterResponse
    no-afterResponse-after-send-terminal
    afterResponse-throw-local-fatal
    frame-call-response-before-child-rpc
    frame-return-response-before-close-resume

request-id
    positive-safe-integer
    strict-monotonic-local-allocation
    shared-control-frame-namespace
    remote-equal/lower-id-fatal
    allocated-id-not-reused-after-failure
    exhaustion-no-wrap
    late-response-never-recorrelates

hello/control
    hello-first
    hello-one-shot
    version-list-1..16-no-duplicate
    unsupported-before-auth-callback
    generic-auth-failure
    auth-callback-main-owned
    identification-connected-rejected-terminal-outcomes
    status-frame-before-hello-fatal
    profile-state-request-PROTOCOL_STATE_ERROR-then-fatal
    invalid-state-notification-no-response-fatal
    repeated/retrograde-state-fatal
    stopping-requires-shutdown-intent
    stopped-never-fabricated

frame
    exact-seven-methods
    exact-directions
    closed-params-results
    three-recoverable-five-fatal-semantic-codes
    fatal-semantic-error-terminates-before-next-send
    unknown-semantic-code-fatal
    second-call-return-pending-not-sent

deadline
    deterministic-injected-scheduler
    frame-1000-300000-bounds
    hello-shutdown-positive-finite
    stable-per-connection
    deadline-not-in-wire
    deadline-covers-writer-send-response
    first-settlement-wins
    timeout-ambiguous-no-retry
    late-response-diagnostics-only

terminal
    first-wins
    pending-settled-once
    carrier-closed/lost
    protocol-fatal
    local-handler-afterResponse-throw
    request-timeout
    idempotent-close
    no-new-send-after-terminal
    no-same-attempt-reconnect

package
    foundation-wire-only
    no-node-websocket-messageport-worker
    root-export-only
    npm-pack-dry-run
```

M3 package tests use deterministic `MessageCarrier` fixtures。Hostra/PWA transport equivalence belongs later integration qualification。

---

## 24. Implementation Stages

```text
Stage A  package skeleton / metadata / exact root exports
Stage B  Control + Frame public wire model / semantic data
Stage C  profile limits / bounded encode + decode
Stage D  request IDs / pending table / serialized writer
Stage E  single-reader dispatcher / terminal controller
Stage F  hello/auth mechanics + Control state
Stage G  exact role peers / Frame semantics / Response barrier / mutation gate
Stage H  scheduler / deadlines / race / late-response
Stage I  conformance + package boundary + CI
Stage J  real role-consumer qualification
```

A–I complete：

```text
Implemented Baseline / Core Contract Frozen
```

Real consumers：

```text
M4 @loomrealm/subsystem/host
M5 @loomrealm/main
```

M3 does not build fake role authority to claim M4/M5 qualification。

---

## 25. Explicit Non-goals

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

## 26. Closure Criteria

Implementation-ready means：

> **实现者只需要选择 internal data structures / private algorithms / queue implementation；不再需要自行决定 public export names/signatures、role direction、hello ownership、reader/writer model、Request ID semantics、profile limits、Response barrier、deadline race、semantic/fatal classification、terminal behavior或 consumer ownership。**

M3 local closure：

```text
established MessageCarrier
→ bounded Runtime Control protocol mechanics
→ exact role-specific typed peer

all expected protocol inputs
→ deterministic typed outcome / terminal

failure
→ no retry/replay/reconnect
→ pending settles once
→ authority owner remains outside package
```

---

## 27. Final Invariants

1. Runtime Control is protocol mechanics / connection-local state，not product authority；
2. root package surface and role peer method signatures are exact/frozen；
3. runtime dependencies exactly Foundation + Wire；
4. Control and Frame share carrier/dispatcher/writer/ID mechanics but not application authority；
5. one Control carrier exactly one inbound reader，and reader never blocks Response correlation behind role handler；
6. all outbound messages use one serialized writer；
7. same-sender Control+Frame Request IDs strict monotonic、positive safe integer、never reuse/wrap；
8. one carrier unit = one UTF-8 JSON text JSON-RPC object；Batch forbidden；
9. source duplicate JSON semantics follow frozen Wire/JSON.parse；no second parser；
10. profile limits belong Runtime Control；Wire retains generic representation authority；
11. bounded outbound size preflight precedes full stringify materialization；
12. hello mechanics/version/state belong Runtime Control；Launch Attempt/token authority belongs Main；
13. hello Success before usable Subsystem peer；status/Frame before hello fatal；
14. `stopped` only from actual physical termination observation；
15. exactly seven Frame Requests；no new Runtime/Frame methods；
16. three Frame semantic codes recoverable，five divergence codes fatal；
17. profile state violation Request gets best-effort `PROTOCOL_STATE_ERROR` then fatal；
18. Response send acceptance precedes `afterResponse` and dependent reverse RPC；
19. afterResponse/handler unexpected throw is local-fatal，never semantic/business error；
20. finite deadline covers writer/send + Response wait；pending settlement first-wins；
21. timeout/loss ambiguous for Frame mutation；no retry；late Response diagnostics only；
22. call/return pending gate is protocol-side；ordinary input/business gate belongs Subsystem Host；
23. terminal first-wins、immutable、pending settle once、close idempotent；
24. protocol corruption cannot become business FrameFailure；
25. Main/Subsystem Host are role consumers；business author only imports `@loomrealm/subsystem`；
26. current-v1 M3 correction creates no v2/compat parser；future real compatibility changes use normal version/migration governance。
