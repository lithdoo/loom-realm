# M7 / 01 — `@loomrealm/renderer-control` Package

> 状态：Active Design / Draft  
> 阶段：M7 Renderer Control  
> 落地顺序：01  
> 最近复核：2026-09-03  
> 目标：把 Main ⇄ Renderer Control Protocol v1 落成 transport-independent、可测试的协议 mechanics；只复制 Main 已提交的 Renderer-visible authority，不拥有 Main Runtime/Frame/Data authority，也不拥有 Renderer presentation/input/data-plane authority。  
> 正式协议：[Main ⇄ Renderer Control Protocol v1](doc/15-contracts/main-renderer-control-v1.md)  
> 系统架构：[系统架构总览](doc/10-architecture/system-overview.md)  
> 分包边界：[独立分包与发布架构](doc/30-implementation/package-architecture.md)  
> 实施顺序：[第一阶段交付计划](doc/30-implementation/phase-1-delivery-plan.md)

规范优先级：

```text
formal protocol contract
→ package/publish boundary
→ M7 root implementation documents
→ source layout / implementation detail
```

如果真实实现证明正式协议或 package boundary 不足，先 reopen 上位文档；不得通过 package-local helper、optional extension field 或 transport-specific behavior 静默扩张协议。

核心原则：

> **`@loomrealm/renderer-control` 拥有“如何正确传输、验证和应用 Renderer Control v1”的 connection/protocol mechanics；Main 是 Runtime / Frame / Activation / InputTarget / DataAuthority / AuthorityRevision 的唯一公共 authority，Renderer 只是 committed authority 的只读 mirror。**

---

## 1. M7 Position

本文件只负责 M7 的第一步：`@loomrealm/renderer-control` capability package。

后续跨包落地按以下文档继续：

```text
M7_01_RENDERER_CONTROL_PACKAGE.md
→ M7_02_MAIN_AUTHORITY_PROJECTION.md
→ M7_03_RENDERER_CONTROL_STORE.md
→ M7_04_VERTICAL_INTEGRATION.md
→ M7_05_QUALIFICATION_CLOSURE.md
```

Package position：

```text
Main committed authority
        │
        │ full immutable RendererAuthoritySnapshotV1
        ↓
@loomrealm/renderer-control
        │
        ├── renderer.hello
        ├── protocol version negotiation
        ├── closed wire schema validation
        ├── full Snapshot validation
        ├── session/revision protocol rules
        ├── bounded latest-state publication
        ├── connection replacement / terminal mechanics
        └── typed Main / Renderer peers
        │
        ↓
already-established MessageCarrier<string>
        │
        ↓
@loomrealm/renderer-control
        │
        ↓
Renderer Control Store / role integration
```

Protocol v1 application surface remains exactly：

```text
renderer.hello   Renderer → Main Request
renderer.state   Main → Renderer Notification
```

The package does not introduce a generic RPC/session framework.

---

## 2. Authority Boundary

### Main owns

```text
Session identity
Runtime observed state
live Frame Stack
Frame lifecycle
current Activation
InputTarget
DataAuthority generation/profile
AuthorityRevision
rendererControlToken authentication decision
committed Snapshot source state
```

### Renderer role owns

```text
current applied Control Store
ordinary-input sender-side enforcement using current authority
Data Connection retirement after authority loss/replacement
presentation state
Renderer-local producer availability
Frame Interest mirror from Data plane
```

### `@loomrealm/renderer-control` owns

```text
Renderer Control v1 wire representation/mechanics
renderer.hello first-message / one-shot protocol state
version negotiation mechanics
request/response correlation needed by hello
closed schema validation
whole-message/profile limits
full Snapshot structural and relational validation
session/revision application rules
strictly increasing emitted/applied revision checks
hello-result-before-state publication ordering
bounded latest Snapshot publication/coalescing mechanics
connection terminal classification
protocol error / semantic error representation
transport-independent typed outcomes
```

### `@loomrealm/renderer-control` does not own

```text
Main authority mutation / revision allocation
Frame call/return/unwind decisions
Runtime lifecycle authority
DataAuthority policy/allocation
rendererControlToken mint/storage/consumption authority
Renderer Data Connection provisioning
WebSocket endpoint/ticket/MessagePort
User Input payload or Frame Interest
Render Update / Render Store
Content API
DOM / Canvas / WebGL
business state
Process / Worker / BrowserWindow lifecycle
```

A protocol peer MAY validate and transport an `AuthorityRevision`; it MUST NOT invent the revision because a message is sent.

---

## 3. Dependency Boundary

M7 target runtime dependencies：

```text
@loomrealm/foundation
    MessageCarrier / CarrierClosed

@loomrealm/wire
    JsonValue / JSON text / JSON-RPC representation primitives
```

MUST NOT depend on：

```text
@loomrealm/main
@loomrealm/renderer
@loomrealm/runtime-control
@loomrealm/data
@loomrealm/subsystem
@loomrealm/game-package
@loomrealm/game-launcher-*
WebSocket / MessagePort / Worker
node:*
filesystem
DOM APIs
```

Main and Renderer consume this package through typed role-specific surfaces. Platform/composition supplies an already-established `MessageCarrier<string>`; transport setup is outside this package.

Do not extract current similarity with Runtime Control into：

```text
GenericRpcPeer
GenericSchemaCodec
UniversalProtocolSession
transport-websocket dependency
transport-messageport dependency
```

If a genuinely stable shared primitive emerges from two implemented protocol consumers, reassess it separately rather than predicting it in M7.

---

## 4. Package / Publish Surface

Initial publish surface：

```text
@loomrealm/renderer-control
```

Do not publish subpaths such as：

```text
/main
/renderer
/schema
/profile
/testing
/internal
/node
/browser
```

Target package metadata：

```text
name = @loomrealm/renderer-control
version = 0.1.0-alpha.0
ESM
Node >= 20 for repository/tooling baseline
browser-compatible runtime source
sideEffects = false
root export only
```

M7 implementation MUST keep source layout an internal concern; source folders do not imply npm subpath contracts.

---

## 5. Exact v1 Wire Model

The formal contract remains the field-level source of truth. M7 package types are expected to represent at least the following exact models without extension bags or transport metadata：

```ts
interface RendererHelloParamsV1 {
  readonly rendererControlToken: string;
  readonly protocolVersions: readonly number[];
}

interface RendererHelloResultV1 {
  readonly protocolVersion: 1;
  readonly snapshot: RendererAuthoritySnapshotV1;
}

interface RendererStateParamsV1 {
  readonly snapshot: RendererAuthoritySnapshotV1;
}

interface RendererAuthoritySnapshotV1 {
  readonly sessionId: string;
  readonly revision: number;
  readonly runtimes: readonly RendererRuntimeStateV1[];
  readonly stack: readonly RendererFrameStateV1[];
  readonly inputTarget: RendererInputTargetV1 | null;
  readonly dataAuthorities: readonly RendererDataAuthorityV1[];
}

type RendererRuntimeLifecycleV1 =
  | "declared"
  | "starting"
  | "connected"
  | "identified"
  | "ready"
  | "stopping"
  | "stopped"
  | "failed";

interface RendererRuntimeStateV1 {
  readonly subsystemKey: string;
  readonly state: RendererRuntimeLifecycleV1;
}

type RendererFrameLifecycleV1 =
  | "starting"
  | "active"
  | "suspended"
  | "closing";

interface RendererFrameStateV1 {
  readonly frameId: string;
  readonly subsystemKey: string;
  readonly lifecycle: RendererFrameLifecycleV1;
  readonly activationId?: string;
}

interface RendererInputTargetV1 {
  readonly subsystemKey: string;
  readonly frameId: string;
  readonly activationId: string;
}

interface RendererDataAuthorityV1 {
  readonly subsystemKey: string;
  readonly generation: number;
  readonly dataProfile: string;
}
```

Wire objects are closed schema. No package-local `metadata`, `extensions`, transport endpoint, credential or physical handle may be added.

---

## 6. Snapshot Validation

A Snapshot is a single self-contained authority projection. Validation MUST cover the whole object before a Renderer-side peer exposes it as accepted.

At minimum：

```text
sessionId valid
revision positive safe integer
runtime subsystemKey unique
frameId unique
all Frames reference a Runtime
at most one active Frame
active Frame, if present, is stack top
active Frame has activationId
non-active Frame has no activationId
InputTarget = null or exactly references active Frame + current activationId
DataAuthority subsystemKey unique
generation positive safe integer
dataProfile valid logical profile identity
all topology limits respected
```

No partial repair：

```text
invalid field
invalid relation
revision regression/duplicate
invalid authority topology
oversize/depth/profile violation
→ protocol failure / fail closed
```

The package MUST NOT make an invalid Snapshot acceptable by dropping entries or normalizing identifiers.

---

## 7. Session / Revision Mechanics

`sessionId` identifies one Main authority universe.

`AuthorityRevision` semantics：

```text
positive safe integer
Session-local
strictly increasing on Renderer-visible committed authority change
never reused / never wrap
```

Ownership split：

```text
Main allocates/commits revisions
renderer-control validates/transports revisions
Renderer applies only a newer valid revision
```

Revision is not：

```text
event sequence
transport packet number
replay cursor
connection generation
```

Same Session：

```text
new revision > applied revision  → eligible after whole-Snapshot validation
revision gap                     → valid
new revision <= applied revision → protocol failure
```

New Session：Renderer role integration discards the previous authority universe and atomically installs the new hello Snapshot after validation.

---

## 8. Full Snapshot / No Replay

v1 intentionally uses complete Snapshots：

```text
renderer.hello Result(snapshot R)
renderer.state(snapshot R+n)
```

No：

```text
delta
JSON Patch
revision ACK
subscribe-from-revision
historical replay
resync request
```

Reconnect/reload：

```text
fresh carrier + fresh rendererControlToken
→ renderer.hello
→ current full Snapshot
```

The package MUST NOT accumulate an unbounded history in order to support recovery.

---

## 9. Main-side Publication Mechanics

Renderer Control may publish only authority already committed by Main.

Causal boundary remains：

```text
frame.activate ACK accepted
→ Main commits fresh Activation/InputTarget
→ snapshot may expose it

frame.resume ACK accepted
→ Main commits fresh Activation/InputTarget
→ snapshot may expose it
```

The package MUST NOT observe tentative Main operations and predict their success.

Main-side publication target：

```text
0..1 in-flight write
+
at most one replaceable latest unsent Snapshot
```

Intermediate committed revisions MAY be coalesced before send. The newest unsent Snapshot replaces the previous unsent Snapshot; no historical queue is required.

Connection ordering：

```text
successful renderer.hello Result(R)
BEFORE
all renderer.state notifications with revision > R
```

A replaced/non-current Renderer Control Connection MUST stop receiving publication.

Detailed Main adaptation is defined by `M7_02_MAIN_AUTHORITY_PROJECTION.md`.

---

## 10. Renderer-side Application Mechanics

Renderer-side protocol mechanics should produce only validated typed snapshots/outcomes. The Renderer role owns the actual Control Store.

Application rule：

```text
receive complete JSON text
→ bounded parse/profile validation
→ method/schema validation
→ whole Snapshot validation
→ session/revision validation
→ typed accepted Snapshot
→ Renderer role atomically replaces Control Store
```

The protocol package MUST NOT expose a sequence of field-level mutations that can make Renderer observe half an authority transition.

Control connection loss is a role-significant terminal fact. Renderer integration must then revoke local ordinary-input authority and DataAuthority usage; the protocol package reports the terminal condition but does not own Data Connection objects or presentation cleanup.

Detailed Renderer adaptation is defined by `M7_03_RENDERER_CONTROL_STORE.md`.

---

## 11. DataAuthority Boundary

Renderer Control carries only：

```text
{subsystemKey, generation, dataProfile}
```

It MUST NOT carry：

```text
WebSocket URL
MessagePort
bearer token / ticket
connection nonce
Platform provisioning handle
physical path
```

`dataProfile` is logical application-profile identity, not transport or credential.

The protocol package validates DataAuthority representation and replacement facts. It does not establish or retire physical Data Connections itself.

Control/Data planes have no cross-connection total order. Do not add a protocol barrier/join between Renderer Control and Renderer Data merely to make observation order convenient.

---

## 12. Input / Render Boundary

Renderer Control publishes Main-owned `InputTarget`; it does not carry Frame Interest, producer availability or User Input payload.

Effective ordinary input remains a Renderer-role composition of current facts：

```text
Main InputTarget authority
× matching current Data Connection
× mirrored active Frame/Activation
× Subsystem Frame Interest
× Renderer-local Producer availability
```

Interest and Producer may only restrict authority; neither creates or expands InputTarget.

Renderer Control Snapshot MUST NOT include：

```text
Frame Interest Registry
Input subscriptions
Producer availability
Render Registry
Render Domain state
Render revision
DOM / Canvas / WebGL state
```

Render lifecycle remains independent from Frame removal and Data Connection retirement.

---

## 13. Transport Boundary

The package consumes an already-established string carrier.

Application unit：

```text
one MessageCarrier<string> message
= one UTF-8 JSON text
= one JSON-RPC message object
```

Physical mappings MAY later be：

```text
Desktop WebSocket text message
PWA MessagePort postMessage(string)
```

But WebSocket/MessagePort establishment, endpoint selection, token delivery and physical transport lifetime policy belong to Platform composition/adapters.

M7 package qualification MUST use deterministic transport-independent carriers first. Desktop BrowserWindow/PWA physical composition is not part of this package closure.

No binary application payload, Structured Clone application object, retry, duplicate or adapter replay is introduced by Renderer Control v1.

---

## 14. Limits / Fail-closed

Formal limits include：

```text
max application message          1 MiB
max JSON nesting depth           64
max array/object members         16,384
max Runtime entries              256
max live Frame Stack entries     64
max DataAuthority entries        256

sessionId                        1..128 UTF-8 bytes
subsystemKey                     1..256 UTF-8 bytes
frameId                          1..128 UTF-8 bytes
activationId                     1..128 UTF-8 bytes
rendererControlToken             1..4096 UTF-8 bytes
dataProfile                      1..256 ASCII bytes
revision/generation              positive safe integer
protocolVersions entries         1..16
```

Renderer-side invalid input must become terminal/fail-closed rather than partial acceptance.

Main-side outbound Snapshot MUST be preflighted against the same representation/topology constraints before publication.

---

## 15. Errors

Only `renderer.hello` is a Request in v1.

Request ID：

```text
positive safe integer
connection-lifetime sender-side never reused
```

Stable semantic error data includes：

```text
RENDERER_AUTHENTICATION_FAILED
RENDERER_CONTROL_PROTOCOL_UNSUPPORTED
PROTOCOL_STATE_ERROR
```

Authentication failure MUST NOT reveal whether a token is unknown, expired, wrong or already consumed.

Protocol corruption / invalid Snapshot is not converted into recoverable business state.

---

## 16. Source Shape

Implementation source shape is intentionally not frozen yet. A likely narrow shape is：

```text
packages/renderer-control/
├─ README.md
├─ package.json
├─ tsconfig.json
├─ src/
│  ├─ index.ts
│  ├─ model.ts
│  ├─ codec.ts
│  ├─ main-peer.ts
│  └─ renderer-peer.ts
└─ test/
   └─ ...
```

This is a working layout, not a public contract. Files may be merged/split while keeping package ownership and root-only publish surface unchanged.

Do not introduce Manager / Registry / EventBus / generic RPC abstractions solely for anticipated future complexity.

---

## 17. Public API Closure Rule

The empty package scaffold intentionally does not freeze constructor names yet.

Before implementation begins, close the minimum typed surfaces for two real role consumers：

```text
Main side
    consume already-established MessageCarrier<string>
    ask Main-owned authentication callback/decision
    receive immutable committed snapshots from Main integration
    publish bounded latest state
    expose terminal outcome

Renderer side
    consume already-established MessageCarrier<string>
    send one renderer.hello request
    receive/validate initial + later snapshots
    expose accepted typed snapshots / terminal outcome
```

Public API MUST NOT expose：

```text
transport URL/options
WebSocket/MessagePort object
Main internal Registry/Stack objects
Renderer Control Store implementation
Data Connection object
extension bag
arbitrary JSON-RPC method registration
```

Constructor/function names become frozen only with real Main + Renderer consumer qualification.

---

## 18. Package-local Qualification

Package-local conformance must at least cover：

```text
hello first-message
hello auth decision / token one-shot behavior mapping
version selection / unsupported version
hello result before state publication
closed schema
whole-Snapshot relational validation
revision monotonicity / gap accepted / regression rejected
session replacement
empty / active / transitional stack
InputTarget exact active-Activation relation
revoked Activation never reappears in accepted newer state
DataAuthority uniqueness/generation/profile validation
bounded latest-state coalescing
slow writer does not create unbounded Snapshot queue
oversize/depth/topology limits
terminal first-wins
carrier close during hello/publication
no replay/retry
```

Cross-package qualification is deferred to `M7_05_QUALIFICATION_CLOSURE.md`.

---

## 19. Explicit Non-goals

M7/01 does not implement：

```text
Main internal authority projection
Renderer Control Store role package
Renderer Data application plane
DataConnectionBroker
Subsystem Data provisioning
User Input payload / Interest protocol
Render Update
Content
Desktop BrowserWindow composition
PWA Worker/MessagePort composition
multiple current Renderers
Renderer leader election
heartbeat
telemetry
delta / patch / replay
Runtime recovery commands
```

Do not add dormant future capability placeholders to claim forward compatibility.

---

## 20. Step Closure Target

M7/01 is complete when：

```text
@loomrealm/renderer-control package builds
formal v1 wire model is represented exactly
Main-side peer mechanics exist
Renderer-side peer mechanics exist
full Snapshot validation exists
session/revision rules exist
bounded latest publication exists
terminal/fail-closed behavior exists
package-local conformance passes
```

This step MUST NOT be used to claim M7 closure. M7 closes only after the later Main, Renderer and vertical qualification steps complete.

---

## 21. Final Invariants

1. Main is the only Renderer Control authority.
2. Renderer Control transports/validates committed authority; it does not create it.
3. Renderer is a read-only committed mirror through this protocol.
4. Full Snapshot is self-contained and applied atomically by the Renderer role.
5. AuthorityRevision belongs to Main authority, not to a connection writer.
6. Revision is strictly monotonic within one Session; publication gaps are valid.
7. Reconnect obtains current state via fresh hello; no historical replay exists.
8. Fresh Activation/InputTarget cannot be published before the corresponding Frame ACK barrier has committed in Main.
9. Revoked Activation/InputTarget identity is never regranted.
10. DataAuthority contains only logical subsystem/generation/profile identity.
11. Physical Data endpoint/credential/Port never enters Renderer Control Snapshot.
12. Control and Data planes have no cross-connection total order.
13. Input Interest and Render state stay outside Renderer Control.
14. Publication is bounded latest-state, not an unbounded event log.
15. Invalid Snapshot/revision/session state fails closed.
16. Transport establishment and physical lifecycle remain outside this package.
17. No generic RPC framework is published from M7 similarity.
18. Package public API freezes only after real Main + Renderer consumer qualification.
