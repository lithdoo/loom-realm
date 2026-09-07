# `@loomrealm/subsystem`

> 状态：M4 Runtime/Frame + M8 Data Role + **M10 Input Implemented / Regression Verified / Qualification Pending**
> 阶段：M11 Render / M12 Content pending
> 最近复核：2026-09-07  
> 架构：[Subsystem Model](../../doc/10-architecture/subsystem-model.md)  
> 正式语义：[Runtime Control v1](../../doc/15-contracts/runtime-control-profile-v1.md) · [Frame / Call v1](../../doc/15-contracts/frame-call-protocol-v1.md) · [Renderer Data Profile v1](../../doc/15-contracts/renderer-data-profile-v1.md) · [User Input v1](../../doc/15-contracts/user-input-v1.md)  
> Input correction：[ADR 0029](../../doc/decisions/0029-user-input-v1-mutation-gate-state-convergence.md)  
> Exact M10 surface：[M10 / 01](../../M10_01_SUBSYSTEM_INPUT_MANAGER.md)

> **业务只表达业务；SDK把 Frozen protocol 投影为窄 author capability。M10 不新增 Platform Port、service locator、EventBus 或第二份 Frame/Input authority。**

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
M10 InputListener + InputManager               implemented / regression verified / qualification pending
M11 RenderDomain + RenderManager               pending
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

Host surface保持：

```text
runSubsystem
SubsystemRuntimeFatalError
RunSubsystemOptions
SubsystemLaunchContext
SubsystemRuntimeControlPolicy
```

不得创建万能 `SubsystemRuntime` service locator。

---

## 5. Platform Capability Ownership

Current host uses：

```text
DeadlineScheduler
RuntimeControlBinding
SubsystemDataBinding
```

M10 不新增 Platform Port；Input建立在 current Data peer之上。

---

## 6. Bootstrap-safe Wiring

现有 M4 `FrameRuntime` constructor需要 `SubsystemDefinition`，而 Definition factory又必须先拿到带 `createInputListener` 的 scope。

所以 M10固定最小 late-bound wiring：

```text
validate Definition Module ABI
→ create exactly one InputManager
→ create SubsystemScope
     signal
     createInputListener(...) → same InputManager
→ definition factory(scope)
→ create FrameRuntime(definition, ...)
→ one-time bind exact FrameRuntime facts into InputManager
→ Runtime Control acquire/connect
→ initialize
→ ready
→ optional Data acquire
```

实现可用 private one-time setter 或 closure over `FrameRuntime | null`；不得为了构造顺序重写 FrameRuntime 成 service locator，也不得建立 dummy/shadow Frame registry。

Binding必须在任何 protocol Frame能进入 author handler前完成。

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

Frame close protocol success成立前，FrameRuntime必须要求 InputManager先完成该 Frame local Input cleanup。

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

---

## 15. Render / Content Targets

M11：`scope.createRenderDomain` → one RenderManager → current Data peer。Render Domain lifetime独立于 Frame/Activation/Data carrier。

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

禁止：

```text
InputStore / EventBus / Observable
registration ordinal abstraction required only by documentation
extra root supporting types only for symmetry
Frame/Activation/InputTarget shadow registry
Generic capability/service locator
Generic async scheduler
Generic connection/retry/replay framework
second Data reader/writer
Platform event objects in author API
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
