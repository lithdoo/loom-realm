# `@loomrealm/subsystem`

> 状态：M4 Runtime/Frame + M8 Data Role Implemented；M10 Input Preimplementation Closed  
> 阶段：M10 User Input implementation next；M11 Render / M12 Content pending  
> 最近复核：2026-09-07  
> 目标：为业务 Subsystem 提供稳定、平台无关、协议机械细节不可见的 author SDK，并给 trusted Runner 提供最小 host integration surface。  
> 架构：[Subsystem Model](../../doc/10-architecture/subsystem-model.md)  
> 正式语义：[Runtime Control v1](../../doc/15-contracts/runtime-control-profile-v1.md) · [Frame / Call v1](../../doc/15-contracts/frame-call-protocol-v1.md) · [Renderer Data Profile v1](../../doc/15-contracts/renderer-data-profile-v1.md) · [User Input v1](../../doc/15-contracts/user-input-v1.md)  
> Input correction：[ADR 0029](../../doc/decisions/0029-user-input-v1-mutation-gate-state-convergence.md)

> **业务只表达业务；SDK把 Frozen protocol 映射为不可绕过的 Frame/Input/Render/Content capability；Platform Runner只注入 role-local ports。**

---

## 1. Package Boundary

```text
Game logical subsystem key
→ Platform-selected Definition Module
→ Host-owned Runner
→ @loomrealm/subsystem/host
→ @loomrealm/subsystem author surface
→ Business Definition
```

Author root不得依赖或暴露：

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

`@loomrealm/subsystem/host` 是 trusted integration surface，可消费 Platform Ports / Runtime Control / Data。

---

## 2. Capability Readiness

```text
M4  Definition/lifecycle + Frame/Outcome       implemented / qualified
M4  Host Runtime Control mapping              implemented / qualified
M8  role-local Data peer lifecycle            implemented / qualified
M10 InputListener + InputManager               preimplementation closed
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

## 4. Author / Host Surface

Author root当前/目标只暴露业务概念：

```text
defineSubsystem
SubsystemDefinitionFactory / SubsystemScope
Frame / FrameOutcome / FrameFailure
completed / cancelled / failed
business-safe Frame errors
InputListener                  // M10
RenderDomain                   // M11
ContentClient                  // M12
```

Host surface：

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

Role-specific deadline数值属于 Subsystem Host policy，不属于 Platform capability。

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

Author不见 activationId。

Frame outcome直接对应 protocol：

```text
completed(value)
cancelled
failed(error)
```

Child outcome是 normal Promise resolution value；明确 pre-commit target rejection可 typed reject；ambiguous/fatal绝不重新进入业务 continuation。

---

## 8. FrameRuntime as Local Authority Source

Main拥有 public Frame/Activation authority；Subsystem内部 `FrameRuntime` 是 local context/Activation/mutation-gate 唯一事实源。

InputManager不得保存第二份 Frame lifecycle/Activation registry。

M10 wiring固定为 same-package direct integration：

```text
FrameRuntime
    query/hook current local Frame/Activation/mutation-gate facts
        ↓
InputManager
```

允许几个窄 private method/hook；禁止 EventBus、Observer、generic lifecycle framework。

Frame close protocol success成立前，FrameRuntime必须先要求 InputManager完成该 Frame local input cleanup。

---

## 9. Mutation Gate

每个 Frame有 commit-sensitive ordinary-mutation gate：

```text
pending frame.call
pending frame.return
administrative suspend
closing/closed
Runtime terminal
```

M10后必须区分：

```text
State retention eligibility
!= business delivery eligibility
```

pending mutation期间 same-current-Activation State可 retain latest但 suppress delivery；Event drop；current Reset清 retained State。

明确 known-no-commit 且 same Activation恢复时，InputManager local-deliver at most one latest State/channel；Event不 replay。

commit/revoke/suspend/close/terminal/Data retire均清除对应 suppressed State。

---

## 10. One InputManager per Instance

SubsystemHost exactly once创建：

```text
one InputManager
```

并把它同时连接到：

```text
SubsystemScope.createInputListener
FrameRuntime local lifecycle
current SubsystemDataPeer handlers/sendInterest
```

InputManager拥有：

```text
listener records
DesiredRegistry = Map<frameId, Set<channel>>
immutable retained State by current F/A/state-channel
business delivery
latest-only Interest publication
```

它不拥有 Main InputTarget、Data currentness、carrier reader、protocol schema、Frame lifecycle或 generation。

---

## 11. Input Author API

```ts
interface CreateInputListenerOptions {
  readonly frame: Frame;
  readonly channels: readonly InputChannel[];
}

interface InputListener {
  on<T>(channel: InputChannel, handler: (value: T) => void): Unsubscribe;
  setChannels(channels: readonly InputChannel[]): void;
  close(): void;
}
```

多个 listener对同一 Frame贡献 union。

Author config mutation：

```text
validate channel + candidate union representability
→ atomic local commit
→ local eligibility立即更新
→ queue latest full Interest Registry
```

非法配置 local reject，旧 state不变、wire send=0、Data不受影响。

---

## 12. Retained State / Listener Delivery

收到 well-formed State先验证：

```text
current Data peer
local Frame exists
activationId == local current Activation
channel ∈ Desired Interest[F]
```

满足即可更新 latest immutable retained State；只有 Frame active + mutation gate open才交业务。

新 `.state` listener若已有 current retained State，安装后得到一次 local current baseline；新增 `.event` listener不 replay历史 Event。

Interest shrink、Reset、Activation revoke、fresh Data、Frame close按正式 User Input v1清 retained State。

Handler throw/rejected Promise必须 contained：不逃逸 Data handler、不 retire Data、不改变 authority，并继续尝试其它匹配 listener。

---

## 13. Interest Publisher

InputManager不创建第二 writer。它只在 typed Data peer之上维护：

```text
0..1 sendInterest inFlight
0..1 pendingLatest full DesiredRegistry snapshot
```

fresh Data peer：

```text
old publisher state discarded
old retained State cleared
DesiredRegistry/listeners remain
→ publish current full Registry
```

不 retry/replay旧 carrier work。

---

## 14. Role-local Data Peer

M8 lifecycle继续保持：

```text
SubsystemDataBinding
→ one current SubsystemDataPeer
→ peer owns one carrier reader / validation / serialized writer
```

Data peer install后 handlers连接到 same InputManager；peer terminal后 InputManager收到 retirement/fresh-peer boundary，但不参与 acquire/reconnect policy。

InputManager/RenderManager不得竞争 `carrier.messages()`。

---

## 15. Business Error vs Runtime Failure

```text
business exception             → Frame failed outcome
Input handler failure          → local callback containment
recoverable pre-commit call    → typed local error
protocol ambiguity/Control loss→ Runtime failure
Data loss/protocol fatal       → Data unavailable/retire, not Frame unwind
```

Runtime-fatal path绝不重新进入 old business continuation。

---

## 16. Render / Content Targets

M11：

```text
scope.createRenderDomain
→ one RenderManager
→ current Data peer
```

Render Domain lifetime独立于 Frame/Activation/Data carrier；fresh Data重新 publication Registry + snapshots。

M12：`ContentClient` 只提供 readonly logical content access；不得变成 arbitrary executable/filesystem capability。

---

## 17. Dependency / Abstraction Budget

M10允许：

```text
one InputManager
listener records + one DesiredRegistry
minimal retained immutable State
small FrameRuntime integration methods
latest-only Interest publisher
```

禁止：

```text
InputStore / EventBus / Observable
Frame/Activation/InputTarget shadow registry
Generic capability/service locator
Generic connection/retry/replay framework
second Data reader/writer
Platform event objects in author API
```

---

## 18. M10 Closure

M10必须通过 current User Input v1 `fixtureSetRevision=2` 的 platform-independent Subsystem obligations，并在 real M9 Desktop Data lifecycle验证：

```text
Interest convergence
fresh Activation/Data baseline
recoverable mutation same-Activation State convergence
listener-local retained baseline
handler failure isolation
Frame close cleanup
```

完整 Hostra/PWA User Input equivalence留到 M16。
