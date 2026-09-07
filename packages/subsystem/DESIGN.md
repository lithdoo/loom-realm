# `@loomrealm/subsystem`

> 状态：M4 Runtime/Frame + M8 Data Role Implemented；**M10 Input Implementation Frozen / Ready for Implementation**  
> 阶段：M10 User Input implementation next；M11 Render / M12 Content pending  
> 最近复核：2026-09-07  
> 目标：为业务 Subsystem 提供稳定、平台无关、协议机械细节不可见的 author SDK，并给 trusted Runner 提供最小 host integration surface。  
> 架构：[Subsystem Model](../../doc/10-architecture/subsystem-model.md)  
> 正式语义：[Runtime Control v1](../../doc/15-contracts/runtime-control-profile-v1.md) · [Frame / Call v1](../../doc/15-contracts/frame-call-protocol-v1.md) · [Renderer Data Profile v1](../../doc/15-contracts/renderer-data-profile-v1.md) · [User Input v1](../../doc/15-contracts/user-input-v1.md)  
> Input correction：[ADR 0029](../../doc/decisions/0029-user-input-v1-mutation-gate-state-convergence.md)

> **业务只表达业务；SDK把 Frozen protocol 映射为不可绕过的 Frame/Input/Render/Content capability；Platform Runner只注入 role-local ports。M10 author-visible Input behavior已冻结，编码阶段只允许 private realization choices。**

---

## 1. Package / Consumer Boundary

```text
Game logical subsystem key
→ Platform-selected Definition Module
→ Host-owned Runner
→ @loomrealm/subsystem/host
→ @loomrealm/subsystem author surface
→ Business Definition
```

**Business Definition source** 只 import `@loomrealm/subsystem`，不得直接 import：

```text
@loomrealm/runtime-control
@loomrealm/platform-ports
@loomrealm/data
@loomrealm/wire
MessageCarrier / WebSocket / MessagePort
bootstrapToken / generation / dataProfile
Game/Platform Launch Manifest
Hostra/PWA detection
```

这不等于 npm package 本身不能依赖 shared primitives。`@loomrealm/subsystem` implementation MAY：

```text
use @loomrealm/wire shared JSON types internally/type-only
use @loomrealm/runtime-control / @loomrealm/data / @loomrealm/platform-ports in trusted host/internal code
```

但 author root不得暴露 protocol envelope、peer、carrier、platform capability或要求业务直接 import这些 package。

`@loomrealm/subsystem/host` 是 trusted integration surface。

---

## 2. Capability Readiness

```text
M4  Definition/lifecycle + Frame/Outcome       implemented / qualified
M4  Host Runtime Control mapping              implemented / qualified
M8  role-local Data peer lifecycle            implemented / qualified
M10 InputListener + InputManager               implementation frozen / ready
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

`default export = SubsystemDefinitionFactory`。Module load不等于 Runtime start；module path不等于 Runtime identity。

Definition不得读取 launch manifest、探测平台改变业务语义、打开 carrier、读取 bootstrap globals 或拥有 physical provisioning。

---

## 4. Root / Host Surface

Author root必须暴露：

```text
defineSubsystem
SubsystemDefinitionFactory / SubsystemScope
Frame / FrameOutcome / FrameFailure
completed / cancelled / failed
business-safe Frame errors

M10 exact Input surface:
    InputStateChannel / InputEventChannel / InputChannel
    InputPayload / InputHandler / Unsubscribe
    CreateInputListenerOptions / InputListener
    standard canonical author Input payload/supporting types
```

Host surface继续：

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

Reusable platform capability contract的唯一事实源是 `@loomrealm/platform-ports`。

M4/M8 current host needs：

```text
DeadlineScheduler
RuntimeControlBinding
SubsystemDataBinding
```

M10 不新增 Platform Port；Input business behavior建立在 current Data peer之上。

---

## 6. Runtime Startup

```text
Runner loads selected Definition Module
→ validate ABI
→ create FrameRuntime + InputManager(M10) + scope
→ definition factory(scope)
→ RuntimeControlBinding.acquire
→ connect Runtime Control
→ hello / identified
→ definition.initialize
→ status ready
→ start optional Data acquire
→ accept Frames
```

`ready != Data exists != Renderer exists != Input baseline exists`。

Data acquire/loss独立于 Runtime ready；Data failure不自动失败 Runtime/Frame。

---

## 7. Frame Model

`frame.initialize`只建立 local context；首次 successful activate后业务 handler启动 exactly once。

```ts
interface Frame<TParams extends JsonValue = JsonValue> {
  readonly id: string;
  readonly params: TParams;
  readonly signal: AbortSignal;
  call<TResult extends JsonValue = JsonValue>(
    subsystem: string,
    params: JsonValue,
  ): Promise<FrameOutcome<TResult>>;
}
```

`JsonValue` MAY来自 package内部 shared Wire type declaration；业务无需 import `@loomrealm/wire` 才能使用 `Frame`。

Author不见 activationId。

Frame outcome直接对应 protocol：

```text
completed(value)
cancelled
failed(error)
```

Child outcome是 normal Promise resolution value；明确 pre-commit target rejection可 typed reject；ambiguous/fatal绝不重新进入业务 continuation。

---

## 8. FrameRuntime as Local Fact Source

Main拥有 public Frame/Activation authority；Subsystem内部 `FrameRuntime` 是 local context/Activation/mutation-gate 唯一事实源。

InputManager不得保存第二份 Frame lifecycle/Activation registry。

M10 wiring固定为 same-package direct integration：

```text
FrameRuntime
    query/hook current local Frame/Activation/mutation-gate facts
        ↓
InputManager
```

允许少量 private method/hook；禁止 EventBus、Observer、generic lifecycle framework。

Frame close protocol success成立前，FrameRuntime必须先要求 InputManager完成该 Frame local input cleanup。

---

## 9. Exact Input Author Types

M10 root surface冻结为：

```ts
export type InputStateChannel =
  | "keyboard.state"
  | "pointer.state"
  | "gamepad.state"
  | `x.${string}.state`;

export type InputEventChannel =
  | "keyboard.event"
  | "pointer.event"
  | "gamepad.event"
  | `x.${string}.event`;

export type InputChannel = InputStateChannel | InputEventChannel;

export type InputPayload<C extends InputChannel> =
  C extends "keyboard.state" ? KeyboardStateInput :
  C extends "keyboard.event" ? KeyboardEventInput :
  C extends "pointer.state" ? PointerStateInput :
  C extends "pointer.event" ? PointerEventInput :
  C extends "gamepad.state" ? GamepadStateInput :
  C extends "gamepad.event" ? GamepadEventInput :
  C extends `x.${string}.state` | `x.${string}.event` ? JsonObject :
  never;

export type InputHandler<C extends InputChannel> =
  (value: InputPayload<C>) => void | Promise<void>;

export type Unsubscribe = () => void;
```

`KeyboardStateInput` / `KeyboardEventInput` / Pointer / Gamepad author types及 supporting canonical types与 User Input v1 对应 payload **结构等价**；不得建立不同字段、range、ordering语义。

Custom `x.*` handler value是 JSON object payload。

Handler只收到 payload；author surface不暴露 `frameId`、`activationId`、message `type` 或 Data identity。

---

## 10. Exact InputListener Surface

```ts
interface CreateInputListenerOptions {
  readonly frame: Frame;
  readonly channels: readonly InputChannel[];
}

interface InputListener {
  on<C extends InputChannel>(
    channel: C,
    handler: InputHandler<C>,
  ): Unsubscribe;

  setChannels(channels: readonly InputChannel[]): void;
  close(): void;
}

interface SubsystemScope {
  readonly signal: AbortSignal;
  createInputListener(options: CreateInputListenerOptions): InputListener;
}
```

Semantics：

```text
channels contribution
    solely owns this listener's Interest contribution

on()
    callback registration only
    MUST NOT change Interest
    channel must currently be in contribution

setChannels()
    changes contribution only
    keeps handler registrations
    removed handlers dormant; re-add reactivates

unsubscribe()
    removes one registration only
    no Interest change
    idempotent

close()
    atomically disables registrations + removes contribution
    idempotent
```

`channels=[]` 合法。

`on/setChannels` after close → `TypeError`。Foreign/invalid Frame → `TypeError`；known local closed Frame → existing `FrameClosedError`。Invalid/duplicate channels → `TypeError`；candidate Registry hard-limit overflow → `RangeError`。

不新增 Input-specific error hierarchy。

---

## 11. Desired Interest / Validation

多个 listener对同一 Frame贡献 union：

```text
DesiredRegistry[F] = union(live listener contributions)
```

Author config mutation：

```text
validate exact channel grammar + candidate union representability
→ atomic local commit
→ local eligibility立即更新
→ required local retained-State baseline
→ only if derived DesiredRegistry changed, queue latest full Interest Registry
```

失败保持：

```text
old contribution/DesiredRegistry unchanged
wire send = 0
Data peer unchanged
```

`on/unsubscribe` 永不发送 Interest。

InputManager Interest publisher只有：

```text
0..1 sendInterest inFlight
0..1 pendingLatest full Registry
```

---

## 12. Retained State / Listener Baseline

收到 well-formed State先验证 retention eligibility：

```text
current Data peer
local Frame exists
activationId == local current Activation
channel ∈ Desired Interest[F]
```

满足即可更新 latest **detached deep-immutable** retained payload；只有 Frame active + mutation gate open才交业务。

State handler首次 locally eligible且已有 retained State时：

```text
on(state, handler)
OR setChannels reactivates existing state registration
→ commit registration/config
→ synchronously invoke one latest retained baseline before method returns
```

如果 derived union曾真正移除该 state channel，retained State必须已清，因此 later re-add等待 fresh Renderer baseline。

`.event` registration/reactivation永不 replay历史 Event。

---

## 13. Deterministic Handler Delivery

每次 delivery捕获 stable matching-registration snapshot。

```text
single channel
    registration order

multi-channel local convergence
    canonical ASCII channel order
    then registration order
```

Handler在当前 invocation中调用 unsubscribe/close/setChannels/on，只影响后续 delivery，不修改当前 snapshot。

一个 sync throw必须 contained并继续尝试后续 matching handlers。

---

## 14. Async Handler Does Not Control Data

`InputHandler` 可以返回 Promise，但 InputManager：

```text
invokes synchronously
observes Promise rejection only for containment
MUST NOT await it before later handlers
MUST NOT return/chain it into @loomrealm/data inbound dispatcher
```

所以：

```text
sync throw / reject → local containment
never-settling Promise → does not stall Data reader
async completion order → not an Input protocol ordering fact
```

M10不新增 async task/event framework。

---

## 15. Mutation Gate / `frame.call()` Ordering

pending commit-sensitive mutation：

```text
same-current-Activation State → retain latest / suppress delivery
Event → drop
current Reset → clear retained/suppressed State
```

明确 known-no-commit + same Activation恢复时，顺序冻结：

```text
FrameRuntime restores mutation eligibility
→ InputManager synchronously invokes current retained State convergence
   canonical channel order / registration order
→ only after all eligible synchronous invocations attempted
   frame.call Promise becomes rejected with recoverable error
```

异步 handler Promise不等待。

因此业务 `catch` 开始时，current State handlers的同步 side effects已经发生。

commit/revoke/suspend/close/terminal/Data retire均清对应 suppressed State，不交旧 continuation。

---

## 16. Data / Activation / Frame Lifetime

Child-call成功：listener + Desired Interest可跨 suspension保留，但 A1 State/Event不跨到 fresh A2；A2等待 fresh Renderer baseline。

Fresh Data peer：

```text
old publisher state discarded
old retained State cleared
DesiredRegistry/listeners remain
→ publish current full Registry
```

Frame close protocol success成立前：

```text
close bound listeners
remove Desired Interest[F]
clear retained/suppressed State[F]
```

Runtime terminal最终清全部 Input local state。

---

## 17. Role-local Data Peer

M8 lifecycle保持：

```text
SubsystemDataBinding
→ one current SubsystemDataPeer
→ peer owns one carrier reader / validation / serialized writer
```

Data peer install后 handlers连接到 same InputManager；peer terminal后 InputManager收到 retirement/fresh-peer boundary，但不参与 acquire/reconnect policy。

InputManager/RenderManager不得竞争 `carrier.messages()`。

---

## 18. Business Error / Runtime Failure

```text
business frame exception          → Frame failed outcome
Input handler failure             → local callback containment
recoverable pre-commit call       → latest-State convergence then typed rejection
protocol ambiguity/Control loss   → Runtime failure
Data loss/protocol fatal          → Data unavailable/retire, not Frame unwind
```

Runtime-fatal path绝不重新进入 old business continuation。

---

## 19. Render / Content Targets

M11：

```text
scope.createRenderDomain
→ one RenderManager
→ current Data peer
```

Render Domain lifetime独立于 Frame/Activation/Data carrier；fresh Data重新 publication Registry + snapshots。

M12：`ContentClient` 只提供 readonly logical content access；不得变成 arbitrary executable/filesystem capability。

---

## 20. Dependency / Abstraction Budget

M10允许：

```text
one InputManager
listener contribution + registration records
one DesiredRegistry
minimal detached immutable retained State
small FrameRuntime integration methods
latest-only Interest publisher
small JSON detach/freeze helper
```

禁止：

```text
InputStore / EventBus / Observable
Frame/Activation/InputTarget shadow registry
Generic capability/service locator
Generic async scheduler
Generic connection/retry/replay framework
second Data reader/writer
Platform event objects in author API
Input-specific error hierarchy without new requirement
```

---

## 21. M10 Implementation Closure

M10编码不得重新决定 public behavior；必须直接实现：

```text
exact root Input types + createInputListener surface
channel contribution vs handler registration separation
idempotent unsubscribe/close
stable deterministic synchronous handler invocation
async handler isolation from Data flow control
retained immutable State/local baseline
ADR 0029 State convergence before recoverable frame.call rejection
latest-only Interest publication
fresh Activation/Data cleanup/baseline
```

Qualification见根目录 `M10_05_QUALIFICATION_CLOSURE.md`。

完整 Hostra/PWA User Input equivalence留到 M16。
