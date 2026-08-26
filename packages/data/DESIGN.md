# `@loomrealm/data` 设计

> 状态：Implementation Ready / Core Package Contract Frozen  
> 阶段：M8 Renderer Data Profile + Data Connection Core preimplementation closure  
> 最近复核：2026-08-26  
> 目标：把 Frozen Data Connection v1、User Input v1、Render Update v1 与 Renderer Data Profile v1 落成 transport-independent、role-typed、可测试的 shared Data application mechanics；不建立 physical connection，不拥有 Main/Subsystem/Renderer application authority。  
> 正式 Profile：[Renderer Data Application Profile v1](../../doc/15-contracts/renderer-data-profile-v1.md)  
> Profile Conformance：[Renderer Data Profile v1 Conformance](../../doc/15-contracts/renderer-data-profile-conformance-v1.md)  
> Connection：[Data Connection v1](../../doc/15-contracts/renderer-subsystem-data-connection-v1.md)  
> Input：[User Input v1](../../doc/15-contracts/user-input-v1.md)  
> Render：[Render Update v1](../../doc/15-contracts/render-update-v1.md)  
> 首次实现前收口：[ADR 0025](../../doc/decisions/0025-renderer-data-profile-v1-preimplementation-closure.md)  
> 实施：[第一阶段交付计划](../../doc/30-implementation/phase-1-delivery-plan.md)

核心原则：

> **`@loomrealm/data` 拥有“如何正确承载 Renderer Data Profile v1”的 connection-local mechanics；Main/Platform拥有 DataAuthority/current installation，Subsystem/Renderer role managers拥有 Input/Render application state。业务作者不直接消费本包。**

---

## 1. Position

```text
Platform DataConnectionBroker
    candidate / paired readiness / current install
                    │
                    ▼
     already-current MessageCarrier<string>
                    │
                    ▼
             @loomrealm/data
                    │
                    ├── Profile identity / binding validation
                    ├── common 1 MiB / depth-64 preflight
                    ├── frozen Wire JSON parse/representation
                    ├── one inbound reader / ordered dispatcher
                    ├── exact role direction / namespace routing
                    ├── child static codecs / validators
                    ├── one outbound serialized writer
                    ├── typed child semantic disposition
                    └── terminal first-wins / close mechanics
                    │
              role-specific peers
              /                \
             /                  \
    Subsystem DataPlane       Renderer role
       M8 integration         M8 integration
         │      │
       M10    M11
    InputMgr RenderMgr
```

Shared carrier mechanics：

```text
one current carrier
one inbound reader
one ordered dispatcher
one outbound serialized writer
one terminal fact
```

Not shared/owned by this package：

```text
Main DataAuthority / InputTarget
Platform candidate/current installation authority
Frame / Activation authority
Subsystem Desired Interest lifetime
Renderer Producer availability
Render business Domain ownership
InputListener / RenderDomain author objects
WebSocket / MessagePort / Worker / Process
```

---

## 2. Authority / Dependency Boundary

### Data package owns

```text
Profile identity/version combination
trusted current binding shape validation
common UTF-8/depth preflight
Wire parse/representation integration
exact top-level namespace/type discrimination
role direction validation
Input/Render static schema/limit validation
one carrier.messages() reader
carrier-order handler dispatch
one serialized carrier.send writer
send outcome / terminal settlement
remote protocol-fatal classification from static validation
explicit child stateful protocol-fatal propagation
fresh peer starts with no inherited writer/reader publication state
```

### Data package does not own

```text
Main Renderer Control Snapshot / DataAuthority mutation
Session/Renderer participant currentness
candidate authentication / ticket / endpoint
paired installation / slot cutover
same-generation reprovision decision
InputTarget / Frame / Activation allocation
Input Interest business configuration
Input effective gate / retained role state
Render Registry/Domain business desired state
Renderer presentation policy
Runtime/Frame failure authority
Content
```

Owner split：

```text
MessageCarrier lifetime primitive         → @loomrealm/foundation
JSON representation                       → @loomrealm/wire
Data Profile shared mechanics              → @loomrealm/data
DataAuthority/current installation         → Main + Platform Broker
Subsystem Data role mapping                → @loomrealm/subsystem/host + internal DataPlane
Subsystem Input/Render managers            → @loomrealm/subsystem
Renderer Input/Render role state           → @loomrealm/renderer
physical transport/provisioning            → Platform adapters/composition
```

Runtime dependencies exactly：

```text
@loomrealm/foundation
@loomrealm/wire
```

MUST NOT depend on：

```text
@loomrealm/main
@loomrealm/subsystem
@loomrealm/renderer
@loomrealm/runtime-control
@loomrealm/renderer-control
@loomrealm/game-package
@loomrealm/game-launcher-*
WebSocket / MessagePort / Worker
node:*
filesystem / Fetch
```

---

## 3. Package / Publish Surface

首批只发布：

```text
@loomrealm/data
```

不发布：

```text
/input
/render
/profile
/connection
/testing
/internal
/node
/browser
```

Package metadata baseline：

```text
name = @loomrealm/data
version = 0.1.0-alpha.0
ESM
Node >= 20
browser-compatible source
sideEffects = false
root export only
runtime dependencies = foundation + wire
```

source layout MAY内部拆分：

```text
src/
├── profile.ts
├── input-codec.ts
├── render-codec.ts
├── reader.ts
├── writer.ts
├── subsystem-peer.ts
├── renderer-peer.ts
└── index.ts
```

source layout不是 npm subpath contract。

---

## 4. Profile / Binding Exports

```ts
import type { MessageCarrier } from "@loomrealm/foundation";

export const RENDERER_DATA_PROFILE_V1: "loomrealm.renderer-data/1";

export type RendererDataProfileV1 =
  typeof RENDERER_DATA_PROFILE_V1;

export interface DataCurrentBindingV1 {
  readonly carrier: MessageCarrier;
  readonly subsystemKey: string;
  readonly generation: number;
  readonly dataProfile: RendererDataProfileV1;
}
```

`subsystemKey` 的 grammar/limit 属于 upstream logical key/DataAuthority contract；本包不创建第二套 key grammar。它只验证 trusted binding 的基础 representation，并要求 surrounding paired installation 已经把该 logical key 绑定到正确 target Runtime。

本包本地必须验证：

```text
subsystemKey is string and non-empty
generation is positive safe integer
dataProfile is exact "loomrealm.renderer-data/1"
carrier satisfies MessageCarrier integration contract
```

`DataCurrentBindingV1` 不重复 Session/Renderer participant/Runtime instance identity；这些由 trusted paired installation surrounding binding保证。

Constructor/binding validation必须在第一次 `carrier.messages()` / `carrier.send()` 副作用前完成。invalid trusted integration config：

```text
→ TypeError
→ no carrier side effect
```

---

## 5. Frozen Wire-model Exports

Public wire-model types必须 **field-for-field** 对应 Frozen child contracts；不得加 `metadata`、extension bag、platform object，也不得用更宽的 `unknown/string` 类型冒充 closed protocol domain。

User Input exports：

```text
InputChannelV1
InputStateChannelV1
InputEventChannelV1
FrameInputInterestV1
InputInterestV1
InputStateV1
InputEventV1
InputResetV1
KeyboardCodeV1
KeyboardStatePayloadV1
KeyboardEventPayloadV1
PointerKindV1
PointerButtonV1
PointerSampleV1
PointerStatePayloadV1
PointerEventPayloadV1
GamepadAxesV1
GamepadButtonsV1
GamepadSampleV1
GamepadStatePayloadV1
GamepadButtonNameV1
GamepadEventPayloadV1
UserInputMessageV1
```

Render exports：

```text
RenderDomainsV1
RenderSnapshotV1
RenderPatchV1
RenderEventV1
RenderNodeV1
RenderPatchOpV1
RenderNodeInsertV1
RenderNodeRemoveV1
RenderNodeMoveV1
RenderNodeUpdateV1
StringMapDeltaV1
JsonObjectDeltaV1
RenderUpdateMessageV1
```

Exact field types使用 `@loomrealm/wire` 的 `JsonValue` / `JsonObject` 等 frozen JSON-compatible representation primitive。Channel grammar、standard payload finite set、optional member、numeric/count/UTF-8 limits继续以 User Input v1 / Render Update v1 为唯一 normative source。

TypeScript 类型不能静态表达的 grammar/byte/depth constraints必须由 runtime validator强制；不得因为 TS type较宽就扩大 wire acceptance。

Package tests必须逐字段锁定 exact closed schema，无 compatibility alias。

---

## 6. Terminal / Outcome Exports

```ts
export type DataProtocolFamily =
  | "profile"
  | "input"
  | "render";

export type DataTerminal =
  | { readonly kind: "carrier-closed" }
  | { readonly kind: "carrier-lost"; readonly cause?: unknown }
  | {
      readonly kind: "protocol-fatal";
      readonly protocol: DataProtocolFamily;
      readonly cause?: unknown;
    }
  | { readonly kind: "local-fatal"; readonly cause: unknown };

export type DataSendOutcome =
  | { readonly kind: "sent" }
  | { readonly kind: "terminal"; readonly terminal: DataTerminal };

export type DataInboundDisposition =
  | { readonly kind: "accepted" }
  | { readonly kind: "protocol-fatal"; readonly cause?: unknown };
```

`accepted` 包含 child contract明确规定的 well-formed stale/inapplicable drop；因为从 Profile 角度该 message已被 child合法处理。

Stable compatibility facts：

```text
union kind
protocol family
sent/terminal distinction
```

Non-contractual diagnostics：

```text
Error.message
stack
cause concrete type/text
```

---

## 7. Exact Subsystem-side Public API

Subsystem inbound只有 ordinary User Input：

```ts
export interface SubsystemDataHandlers {
  onInputState(
    message: InputStateV1,
  ): DataInboundDisposition | Promise<DataInboundDisposition>;

  onInputEvent(
    message: InputEventV1,
  ): DataInboundDisposition | Promise<DataInboundDisposition>;

  onInputReset(
    message: InputResetV1,
  ): DataInboundDisposition | Promise<DataInboundDisposition>;
}

export interface SubsystemDataPeerOptions {
  readonly binding: DataCurrentBindingV1;
  readonly handlers: SubsystemDataHandlers;
}
```

Subsystem outbound：

```ts
export interface SubsystemInputDataPeer {
  sendInterest(
    message: InputInterestV1,
  ): Promise<DataSendOutcome>;
}

export interface SubsystemRenderDataPeer {
  sendDomains(message: RenderDomainsV1): Promise<DataSendOutcome>;
  sendSnapshot(message: RenderSnapshotV1): Promise<DataSendOutcome>;
  sendPatch(message: RenderPatchV1): Promise<DataSendOutcome>;
  sendEvent(message: RenderEventV1): Promise<DataSendOutcome>;
}

export interface SubsystemDataPeer {
  readonly binding: Readonly<{
    subsystemKey: string;
    generation: number;
    dataProfile: RendererDataProfileV1;
  }>;
  readonly input: SubsystemInputDataPeer;
  readonly render: SubsystemRenderDataPeer;
  readonly terminal: Promise<DataTerminal>;
  close(): Promise<void>;
}

export function createSubsystemDataPeer(
  options: SubsystemDataPeerOptions,
): SubsystemDataPeer;
```

没有 `connectSubsystemData(url)`：physical connect / paired installation不属于本包。

---

## 8. Exact Renderer-side Public API

Renderer inbound：Interest + Render。

```ts
export interface RendererDataHandlers {
  onInputInterest(
    message: InputInterestV1,
  ): DataInboundDisposition | Promise<DataInboundDisposition>;

  onRenderDomains(
    message: RenderDomainsV1,
  ): DataInboundDisposition | Promise<DataInboundDisposition>;

  onRenderSnapshot(
    message: RenderSnapshotV1,
  ): DataInboundDisposition | Promise<DataInboundDisposition>;

  onRenderPatch(
    message: RenderPatchV1,
  ): DataInboundDisposition | Promise<DataInboundDisposition>;

  onRenderEvent(
    message: RenderEventV1,
  ): DataInboundDisposition | Promise<DataInboundDisposition>;
}

export interface RendererDataPeerOptions {
  readonly binding: DataCurrentBindingV1;
  readonly handlers: RendererDataHandlers;
}
```

Renderer outbound ordinary Input：

```ts
export interface RendererInputDataPeer {
  sendState(message: InputStateV1): Promise<DataSendOutcome>;
  sendEvent(message: InputEventV1): Promise<DataSendOutcome>;
  sendReset(message: InputResetV1): Promise<DataSendOutcome>;
}

export interface RendererDataPeer {
  readonly binding: Readonly<{
    subsystemKey: string;
    generation: number;
    dataProfile: RendererDataProfileV1;
  }>;
  readonly input: RendererInputDataPeer;
  readonly terminal: Promise<DataTerminal>;
  close(): Promise<void>;
}

export function createRendererDataPeer(
  options: RendererDataPeerOptions,
): RendererDataPeer;
```

Renderer没有 Render outbound API；Subsystem没有 Renderer-only ordinary Input send surface。

---

## 9. Reader / Ordered Dispatch Mechanics

每个 peer创建后只允许：

```text
carrier.messages() exactly once
```

Inbound pipeline：

```text
string unit
→ actual UTF-8 <= 1 MiB
→ Wire parseJsonText
→ representation + depth <= 64
→ type namespace/direction
→ exact child static validation
→ role handler
→ DataInboundDisposition
```

Dispatcher MUST preserve carrier order：

```text
message N handler/disposition settles
before
message N+1 protocol effect is exposed
```

不允许为了 throughput 并行 apply 多条 inbound message；Render revision、Input State/Event causality依赖 ordered effect。

Role handler不是业务用户 callback。它应首先完成 protocol/local state transition，再自行将 business/presentation work解耦；不得让慢业务 handler阻塞 shared Data stream。

Static invalid：

```text
→ protocol-fatal(input|render|profile)
→ terminal
→ no role handler call
```

handler显式 `protocol-fatal`：

```text
→ protocol-fatal(child family)
→ terminal
```

handler throw/reject：

```text
→ local-fatal
```

它不是 remote protocol-invalid 的证据。

---

## 10. Writer Mechanics

所有 public send method：

```text
trusted local message
→ exact role/static child validation
→ compact Wire stringify/materialization
→ UTF-8 <= 1 MiB preflight
→ enqueue shared writer
→ serialized carrier.send
→ sent / terminal outcome
```

Local caller构造 invalid message：

```text
invalid bytes are NOT sent
→ local-fatal terminal
```

Writer：

```text
at most one carrier.send pending
FIFO by accepted public send invocation
bounded queue
terminal settles queued operations exactly once
```

Data writer MUST NOT：

```text
coalesce Input State
coalesce Render commits
reorder barrier
retry send
replay old send
migrate old queue to fresh carrier
```

Coalescing/drop/materialization属于 InputManager/RenderManager sender policy，必须发生在进入 Data writer之前。

`send*()` resolve `{kind:"sent"}` 只表示 current carrier local send boundary accepted；绝不表示 remote ACK/business apply。

---

## 11. Terminal Mechanics

`terminal` first-wins。

Sources：

```text
carrier.closed = closed
carrier.closed = lost
inbound profile/static protocol fatal
child explicit stateful protocol fatal
outbound local invalid/local invariant failure
carrier.send reject / terminal
unexpected reader/writer internal failure
```

On local protocol/local fatal：

```text
record first terminal
→ stop accepting new send
→ stop further inbound effect
→ settle pending sends
→ best-effort carrier.close()
```

Carrier terminal races不得覆盖 first fact。

Peer `close()`：

```text
idempotent
→ request carrier.close()
→ no wire close message
```

Connection v1仍然 zero application message；`close()`不是 `data.close`。

Data terminal只上报 role integration，不直接 fail Runtime/Frame。

---

## 12. Fresh Carrier / Peer Re-creation

一个 Data peer实例绑定一个 current Connection instance，never rebind。

```text
old current terminal
→ old peer terminal forever
→ optional fresh current carrier installed by Platform
→ create fresh Data peer
```

Fresh peer不得继承：

```text
reader cursor
writer queue
parsed child message
old unsent bytes
Profile terminal state
```

Role层可跨 peer保留：

```text
Desired Interest
current Frame/Activation facts
business Render Domain desired state
same-generation Render wire one-shot history where child contract requires
```

然后按 child contract重新 materialize publication baseline。

---

## 13. M8 vs M10/M11 Boundary

### M8 closes in this package

```text
package metadata/build/test baseline
all frozen wire-model types
static Input/Render codecs/validators
common Profile preflight
single reader/ordered dispatcher
single writer
exact role direction
terminal first-wins
Data Profile executable fixtures
role-specific peer API
MemoryCarrier conformance
```

### M8 role integrations

```text
@loomrealm/subsystem/host
    SubsystemDataBinding → createSubsystemDataPeer

@loomrealm/renderer
    Renderer Data binding → createRendererDataPeer
```

### Deferred to M10

```text
Subsystem InputManager
Frame-scoped Interest aggregation
retained input state / receive gate
InputListener
Renderer Producer / Effective gate / Reset-rebaseline policy
```

### Deferred to M11

```text
Subsystem RenderManager / RenderDomain desired state
Renderer Render Store
Registry/baseline/revision state machine
Patch candidate application
presentation integration
```

M10/M11必须复用 `@loomrealm/data` static codec/shared reader/writer；不得各自再建第二 reader/writer/parser。

---

## 14. Error Discipline

Before peer exists：

```text
invalid binding/options/handler shape
→ TypeError
→ zero carrier side effect
```

After peer starts：

```text
remote malformed/schema/limit/wrong-direction
→ protocol-fatal terminal

child stateful fatal
→ explicit DataInboundDisposition.protocol-fatal
→ protocol-fatal terminal

well-formed stale/inapplicable
→ handler returns accepted after local drop

local invalid send / handler throw / invariant bug
→ local-fatal terminal

carrier close/loss
→ carrier terminal
```

Consumer不得依赖 English `Error.message` 来决定协议语义。

---

## 15. Initial Test Matrix

Package-local tests至少：

```text
profile exact identity/options preflight
wire type roundtrip + exact static invalid cases
1 MiB/depth64 common preflight
one carrier.messages() call
ordered inbound handler dispatch
exact direction rejection
unknown type fatal
Input/Render router separation
max one concurrent carrier.send
writer FIFO
send outcome local-acceptance only
writer pending terminal settlement
no retry/replay/migration
terminal first-wins
protocol fatal best-effort close
fresh peer has no inherited queue/state
MemoryCarrier renderer↔subsystem trace
Profile fixtureSetRevision=1
npm pack dry-run
```

Child conformance fixtures在 M8至少 materialize static/profile-relevant subset；完整 role-state fixtures继续由 M10/M11 consumer qualification关闭。

---

## 16. Implementation Stages

建议按以下顺序直接实现：

```text
Stage A  package skeleton / metadata / exact public types
Stage B  common Profile preflight + Input/Render static codecs
Stage C  serialized writer + terminal settlement
Stage D  one reader / ordered dispatcher + direction routing
Stage E  SubsystemDataPeer
Stage F  RendererDataPeer
Stage G  Profile fixtureSetRevision=1 executable harness
Stage H  package boundary / npm pack / CI
Stage I  M8 Subsystem/Renderer real binding consumers
```

不得用 fake role authority来宣称 M10/M11 complete。

---

## 17. Closure Statement

本设计冻结后，允许开始 `@loomrealm/data` M8 implementation。

M8 package-local closure完成后允许表述：

```text
@loomrealm/data Implemented Baseline / Data Profile Core Frozen
Renderer Data Profile mechanics qualified
```

M8不得表述：

```text
Subsystem Input fully implemented
Render Update role state fully implemented
Renderer presentation fully implemented
Desktop DataConnectionBroker complete
```

这些分别属于 M9/M10/M11 后续 consumer/platform qualification。