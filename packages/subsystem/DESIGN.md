# `@loomrealm/subsystem`

> 状态：M4 Runtime/Frame + M8 Data Role + **M10 Input Implemented / Qualified** + **M11 Render Implementation Frozen / Ready**  
> 阶段：M11 Render / M12 Content pending  
> 最近复核：2026-09-07  
> 架构：[Subsystem Model](../../doc/10-architecture/subsystem-model.md) · [Rendering System](../../doc/10-architecture/rendering-system.md)  
> 正式语义：[Runtime Control v1](../../doc/15-contracts/runtime-control-profile-v1.md) · [Frame / Call v1](../../doc/15-contracts/frame-call-protocol-v1.md) · [Renderer Data Profile v1](../../doc/15-contracts/renderer-data-profile-v1.md) · [User Input v1](../../doc/15-contracts/user-input-v1.md) · [Render Update v1](../../doc/15-contracts/render-update-v1.md)  
> Input correction：[ADR 0029](../../doc/decisions/0029-user-input-v1-mutation-gate-state-convergence.md)  
> Exact M10 surface：[M10 / 01](../../M10_01_SUBSYSTEM_INPUT_MANAGER.md)  
> Exact M11 surface：[M11 / 01](../../M11_01_SUBSYSTEM_RENDER_MANAGER.md)  

> **业务只表达业务；SDK把 Frozen protocol 投影为窄 author capability。M11 不新增 Platform Port、service locator、public RenderManager、EventBus 或第二份 Frame/Input/Render authority。**

---

## 1. Package / Consumer Boundary

```text
Game logical subsystem key
→ Platform-selected Definition Module
→ Host-owned Runner
→ @loomrealm/subsystem/host
→ @loomrealm/subsystem author root
→ Business Definition
```

Business Definition source只 import `@loomrealm/subsystem`，不得直接 import Runtime Control、Data、Platform Ports、Wire、carrier、launch manifest 或 Hostra/PWA details。

Package implementation MAY 在 trusted host/internal code依赖现有 shared protocol/port/wire packages；这不授权把 protocol envelope、peer、carrier或 platform capability暴露到 author root。

---

## 2. Capability Readiness

```text
M4  Definition/lifecycle + Frame/Outcome       implemented / qualified
M4  Host Runtime Control mapping              implemented / qualified
M8  role-local Data peer lifecycle            implemented / qualified
M10 InputListener + InputManager               implemented / qualified
M11 RenderDomain + RenderManager               implementation frozen / ready
M12 ContentClient author mapping               pending
```

`Package Scope != Current Implementable Slice != Milestone Closure`。

---

## 3. Definition ABI

```ts
import { defineSubsystem, completed } from "@loomrealm/subsystem";

export default defineSubsystem(scope => ({
  async initialize() {},
  async frame(frame) {
    return completed(null);
  },
  async shutdown() {},
}));
```

Module load不等于 Runtime start；module path不等于 Runtime identity。Definition不得拥有 physical provisioning 或读取 Platform Launch Manifest。

---

## 4. Root / Host Surface

Author root through M10：

```text
defineSubsystem
SubsystemDefinitionFactory / SubsystemScope
Frame / FrameOutcome / FrameFailure
completed / cancelled / failed
business-safe Frame errors

InputStateChannel
InputEventChannel
InputChannel
KeyboardStateInput
KeyboardEventInput
PointerStateInput
PointerEventInput
GamepadStateInput
GamepadEventInput
InputPayload
InputHandler
Unsubscribe
CreateInputListenerOptions
InputListener
```

`SubsystemScope` 增加 `createInputListener(...)`。

**不单独 root-export** keyboard code、pointer sample/button/kind、gamepad sample/axes/buttons/button-name、custom JSON object 等 supporting aliases。它们没有独立 author lifecycle/behavior；业务可从六个 payload 类型通过 indexed access获得精确类型。

M11 root **只新增**：

```text
RenderNode
RenderDomainState
RenderEvent
RenderDomain
```

以及：

```text
SubsystemScope.createRenderDomain(initialState)
```

不 root-export `RenderManager`、protocol envelope、domainId/generation/revision、Snapshot/Patch、supporting JSON aliases或 presentation types。

Host surface保持：

```text
runSubsystem
SubsystemRuntimeFatalError
RunSubsystemOptions
SubsystemLaunchContext
SubsystemRuntimeControlPolicy
```

不得创建万能 `SubsystemRuntime` / `RenderManager` service locator。

---

## 5. Platform Capability Ownership

Current host uses：

```text
DeadlineScheduler
RuntimeControlBinding
SubsystemDataBinding
```

M10/M11 都不新增 Platform Port；Input/Render建立在 current Data peer之上。

---

## 6. Bootstrap-safe Wiring

现有 M4 `FrameRuntime` constructor需要 `SubsystemDefinition`，而 Definition factory又必须先拿到带 author capabilities 的 scope。

固定最小 late-bound wiring：

```text
validate Definition Module ABI
→ create exactly one InputManager
→ create exactly one RenderManager
→ create SubsystemScope
     signal
     createInputListener(...) → same InputManager
     createRenderDomain(...)  → same RenderManager
→ definition factory(scope)
→ create FrameRuntime(definition, ...)
→ one-time bind exact FrameRuntime facts into InputManager
→ Runtime Control acquire/connect
→ initialize
→ ready
→ optional Data acquire
```

RenderManager不需要 FrameRuntime authority binding；Frame lifecycle不拥有 Render Domain。

实现可用 private one-time setter 或 closure over `FrameRuntime | null`；不得为了构造顺序重写 FrameRuntime 成 service locator，也不得建立 dummy/shadow Frame/Render registry。

Input binding必须在任何 protocol Frame能进入 author handler前完成。

---

## 7. Frame Model / Local Fact Source

Author `Frame` 保持：

```text
id
params
signal
call(subsystem, params)
```

Author不见 activationId。

Main拥有 public Frame/Activation authority；Subsystem内部 `FrameRuntime` 是 local Frame Context、current Activation 与 mutation gate 的唯一事实源。

InputManager只通过少量 same-package query/hook消费这些 facts，不复制 Frame lifecycle state machine。

Frame close protocol success成立前，FrameRuntime必须要求 InputManager先完成该 Frame local Input cleanup。RenderManager不复制 Frame state，也不自动把 Frame close 映射为 Domain close。

---

## 8. Minimal Exact Input Types

M10 exact author types以 [M10 / 01](../../M10_01_SUBSYSTEM_INPUT_MANAGER.md) 为唯一详细事实源。

原则：

```text
InputStateChannel / InputEventChannel / InputChannel
    exact User Input v1 channel set/shape

six standard *Input payload names
    structural aliases/projections of User Input v1 canonical payloads

InputPayload<C>
    channel → payload mapping
    custom x.* → bounded JSON object structural type
```

Package implementation可 type-alias复用 `@loomrealm/data` declarations；不得复制第二套 payload fields/range/ordering semantics。

Supporting nested shapes不形成额外 root API。示例：

```ts
type KeyboardCode = KeyboardEventInput["code"];
type Pointer = PointerStateInput["pointers"][number];
type Gamepad = GamepadStateInput["gamepads"][number];
```

Handler只收到 payload，不收到 message type、frameId、activationId 或 Data identity。

---

## 9. InputListener Semantics

```ts
interface CreateInputListenerOptions {
  readonly frame: Frame;
  readonly channels: readonly InputChannel[];
}

interface InputListener {
  on<C extends InputChannel>(channel: C, handler: InputHandler<C>): Unsubscribe;
  setChannels(channels: readonly InputChannel[]): void;
  close(): void;
}
```

Frozen behavior：

```text
channels/setChannels → this listener's Interest contribution only
on/unsubscribe       → callback registration only
setChannels          → preserves dormant registrations
unsubscribe          → idempotent; no Interest change
close                → idempotent; removes contribution + registrations
```

`channels=[]` valid。`on/setChannels` after close → TypeError。Foreign Frame → TypeError；known local closed Frame → existing FrameClosedError。Invalid/duplicate channels → TypeError；Registry hard-limit overflow → RangeError。

不新增 Input-specific error hierarchy。

---

## 10. Desired Interest / Validation

```text
DesiredRegistry[F] = union(live listener contributions for F)
```

Author config mutation：

```text
validate exact channel grammar + candidate representability
→ atomic local commit
→ local eligibility immediately updated
→ required retained-State local baseline
→ if derived Registry changed, queue latest full Interest Registry
```

失败：old config unchanged、wire send=0、Data unchanged。

`on/unsubscribe` 永不改变 Interest。

Publisher只有：

```text
0..1 sendInterest inFlight
0..1 pendingLatest full Registry
```

---

## 11. Retained State / Delivery

State retention eligibility：

```text
current Data peer
local Frame exists
activationId == local current Activation
channel ∈ DesiredRegistry[F]
```

满足即保存 latest detached deep-immutable payload。Business delivery另需 Frame active + mutation gate open。

新 `.state` handler / dormant state handler重新 locally eligible时，若 retained State current，则同步交付一次 latest baseline；`.event` 永不 local replay。

Union 真正移除 state channel、Reset、Activation revoke、fresh Data、Frame close均按 User Input v1清理 retained State。

Author-visible payload identity不是 contract；immutable structural value才是。

---

## 12. Handler Ordering / Async Isolation

每次 delivery捕获 stable matching-registration snapshot。

Observable order：

```text
single channel
    matching handlers by successful on() registration order

multi-channel local convergence
    canonical ASCII channel order
    then matching handlers by successful on() registration order
```

这只是行为 contract，**不要求内部 ordinal/counter/ordering helper**。Array insertion order 或任何等价 private representation都合法。

Handler mutation只影响 subsequent delivery。Sync throw contained，后续 matching handlers仍尝试。

Returned Promise：observe rejection only；不得 await后续 handler，不得 chain进 `@loomrealm/data` dispatcher。Never-settling Promise不能 stall Data reader。

---

## 13. Mutation Gate / Recoverable Call Ordering

Pending commit-sensitive mutation：

```text
same-current-Activation State → retain latest / suppress delivery
Event → drop
current Reset → clear retained/suppressed State
```

Known-no-commit + same Activation：

```text
restore mutation eligibility
→ synchronously converge latest retained State
→ only then expose recoverable frame.call rejection to business
```

Async handler Promise不属于该 barrier。

Commit/revoke/admin suspend/close/terminal/Data retire均丢弃对应 suppressed old-Activation State。

---

## 14. Data / Runtime Lifetime

Fresh Data：

```text
old publisher state discarded
old retained State cleared
DesiredRegistry/listeners remain
→ publish current full Registry
```

InputManager不参与 acquire/reconnect policy，也不竞争 `carrier.messages()`。

Business handler failure → local containment。Data loss/protocol fatal → Data unavailable/retire，不自动 Frame unwind。Runtime Control ambiguity/fatal仍由既有 M3/M4 semantics处理。

M11 RenderManager同样不参与 Data acquire/reconnect policy；它只接收 current Data peer变化并重建/退休 publication state。

---

## 15. Render / Content Targets — Frozen M11

Exact M11 author declarations以 [M11 / 01](../../M11_01_SUBSYSTEM_RENDER_MANAGER.md) 为唯一详细事实源。概念形状：

```ts
// internal/type-only aliases may reuse @loomrealm/data declarations
export type RenderNode = RenderNodeV1;

export interface RenderDomainState {
  readonly zIndex: number;
  readonly roots: readonly RenderNode[];
}

export interface RenderEvent {
  readonly targetKey: string;
  readonly name: string;
  readonly data: RenderEventV1["data"];
}

export interface RenderDomain {
  replace(state: RenderDomainState): void;
  emit(event: RenderEvent): void;
  close(): void;
}
```

`SubsystemScope` 增加：

```ts
createRenderDomain(initialState: RenderDomainState): RenderDomain;
```

所有 author operations 是 synchronous local-only：

```text
validate Frozen Render v1 representability
→ detach caller-owned value
→ atomic local commit / bounded Event offer
→ return
```

不得等待 Data/Renderer、返回 publication Promise/send outcome、保留 caller-owned mutable object by reference。

成功 state/event 必须完整满足 Frozen Render v1 schema/semantic/hard-limit 可表示性；live business Domains / Subsystem instance `<= 256`。

Errors：

```text
invalid shape/semantic/stale target/closed handle → TypeError
hard-limit overflow                         → RangeError
```

失败 local-atomic，不产生由该失败调用引起的新 publication，不升级 Data/Runtime/Frame。

Identity/lifetime：

```text
SDK domainId never reused within one Subsystem Runtime instance
business Node key once removed from one business RenderDomain lifetime
→ cannot be reintroduced in that same business Domain lifetime
Frame close/suspend != Domain destroy/hide
Data retire          != business Domain destroy
```

`close()` idempotent；close 后 replace/emit → TypeError。`emit` 要求 targetKey 当前存在于 business authoritative state。

Fresh Data：

```text
render.domains(current Registry)
→ fresh Snapshot each current Domain
→ Patch/Snapshot/Event
```

no current Data 的 Event不带到 future carrier；current unbaselined carrier MAY bounded-pend Event behind establishing Snapshot；carrier loss/Domain removal丢弃 pending Event。Event不 replay。

M12：ContentClient只提供 readonly logical content access；不得变成 executable/filesystem capability。

---

## 16. Abstraction Budget

M10允许：

```text
one InputManager
listener contribution + registration records
one DesiredRegistry
minimal immutable retained State
small FrameRuntime integration methods
latest-only Interest publisher
small JSON detach/freeze helper
```

M11只增加：

```text
one internal RenderManager
RenderDomain handles/records
minimal detached Render state + tree/index validation
one bounded current-carrier publication coordinator
per-generation emitted identity history
per-carrier Domain cursors
```

禁止：

```text
InputStore / EventBus / Observable
public RenderManager / RenderStore author API
registration ordinal abstraction required only by documentation
extra root supporting types only for symmetry
Frame/Activation/InputTarget shadow registry
Frame→Domain implicit ownership registry
Generic capability/service locator
Generic async scheduler
Generic replication/connection/retry/replay framework
business-key → wire-key translation layer
second Data reader/writer
Platform/presentation objects in author API
```

---

## 17. M10 Closure

实现必须直接得到：

```text
minimal exact root Input exports
one InputManager / instance
Interest contribution and handler registration separation
retained immutable State/local baseline
successful-on() registration-order delivery without prescribed private counter
async handler isolation
ADR 0029 convergence before recoverable rejection
latest-only Interest publication
fresh Activation/Data cleanup/baseline
```

Qualification见根目录 `M10_05_QUALIFICATION_CLOSURE.md`。完整 Hostra/PWA User Input equivalence留到 M16。

---

## 18. M11 Implementation Freeze

M11 coding 只允许选择：

```text
private files/classes/data structures
private domainId representation meeting frozen invariants
finite queue capacities within protocol bounds
Patch-vs-Snapshot heuristic
internal test wiring
```

不得重新设计 root Render exports、sync author semantics、validation/error model、Domain/Node lifetime/identity、Data publication lifecycle。只有证明 Frozen Render v1 或 M11 implementation plan 存在 correctness contradiction 才按治理流程重新打开设计。

Qualification见根目录 `M11_05_QUALIFICATION_CLOSURE.md`。
