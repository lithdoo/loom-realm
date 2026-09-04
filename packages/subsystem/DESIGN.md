# `@loomrealm/subsystem`

> 状态：M4 Runtime/Frame + M8 Data Role Integration Implemented / Full Package Evolving
> 阶段：M8 Data peer lifecycle closure；M10/M11/M12 business capability slices pending
> 最近复核：2026-09-04
> 目标：为 LoomRealm 业务 Subsystem 提供稳定、平台无关、协议机械细节不可见的 author SDK，并定义 Platform Runner 可消费的最小 host integration surface。  
> 上层架构：[平台组合系统](../../doc/10-architecture/platform-composition-system.md)、[Subsystem 模型](../../doc/10-architecture/subsystem-model.md)  
> 平台能力契约：[`@loomrealm/platform-ports`](../platform-ports/DESIGN.md)  
> 正式语义：[Runtime Control Profile v1](../../doc/15-contracts/runtime-control-profile-v1.md)、[Frame / Call v1](../../doc/15-contracts/frame-call-protocol-v1.md)、[Renderer Data Profile v1](../../doc/15-contracts/renderer-data-profile-v1.md)  
> 核心原则：**业务定义只表达业务；SDK 把正式协议映射成不可绕过的 capability/control-flow；Platform Runner 注入 role-local ports；Game/Platform launch config、physical carrier 与 capability lifetime分离。**

---

## 0. Document Scope / Capability Readiness

本文描述的是 `@loomrealm/subsystem` **完整目标 package boundary**。它不是某一个 milestone 的实现清单，也不表示本文所有 capability 已经同时具备实现前提。

必须区分：

```text
Package Scope
!= Current Implementable Slice
!= Milestone Closure
```

`@loomrealm/subsystem` 是一个 platform-neutral Subsystem role SDK；Runtime/Frame、Data、Input、Render、Content 都属于同一 role boundary，但它们依赖的正式契约成熟度与 implementation gate 不同。

### Phase 1 capability readiness

| Capability slice | Primary contract/capability dependency | Current implementation meaning | Phase 1 gate |
| --- | --- | --- | --- |
| Definition/lifecycle + Frame/Outcome | Runtime Control Profile v1 + Frame/Call v1 | Implemented Baseline / executable semantics qualified | M4 |
| Host Runtime Control mapping | `@loomrealm/platform-ports` M4 slice + `@loomrealm/runtime-control` typed Subsystem peer | real Subsystem-side Platform Port / Runtime Control consumer qualified | M4 |
| role-local Data peer + `SubsystemDataBinding` integration | Renderer Data Profile v1 | Implemented / lifecycle and failure isolation qualified | M8 |
| `InputListener` + InputManager | User Input v1 | author/input behavior closes with Input protocol implementation | M10 |
| `RenderDomain` + RenderManager | Render Update v1 | author/render behavior closes with Render protocol implementation | M11 |
| `ContentClient` author mapping | Content capability/contracts | closes with Content implementation | M12 |

因此，M4完成后允许声明：

```text
Subsystem Runtime/Frame Core Implemented
Subsystem Host Runtime Control consumer qualified
```

但不得声明：

```text
@loomrealm/subsystem full package implemented
Subsystem Data/Input/Render/Content complete
```

后续 M8/M10/M11/M12 继续在**同一个 `@loomrealm/subsystem` role package** 中实现对应 capability；milestone split 不产生新的 Subsystem ownership，也不缩小本文定义的最终 package responsibility。

---

## 1. Package Position

```text
Game Entry
    declares logical subsystem key only
        │
        ▼
Platform LaunchPlan
    selects current-platform Definition Module
        │
        ▼
Host-owned Node/Worker Runner
        │
        ├── implements @loomrealm/platform-ports
        │
        ▼
@loomrealm/subsystem/host   integration surface
        │
        ▼
@loomrealm/subsystem        author surface
        │
        ▼
Business Definition
```

`@loomrealm/subsystem` 不是 Desktop/PWA platform layer，也不是 Runtime Control protocol package，也不负责解析 `game.json` / `launch.hostra.json` / `launch.pwa.json`。

业务 Subsystem MUST NOT直接依赖：

```text
@loomrealm/runtime-control
@loomrealm/platform-ports
@loomrealm/wire
@loomrealm/game-launcher-hostra
@loomrealm/game-launcher-pwa
MessageCarrier
WebSocket / MessagePort
child_process / Worker
Hostra
bootstrapToken
Data generation/profile
module physical/logical path
Platform Launch Manifest
```

`@loomrealm/subsystem/host` 是 trusted integration surface，M4 MAY依赖 `@loomrealm/platform-ports` 与 `@loomrealm/runtime-control`；author root MUST NOT re-export它们。

---

## 2. Public Surface Split

### 2.1 Author surface

```text
@loomrealm/subsystem
```

只暴露业务概念：

```text
defineSubsystem
SubsystemDefinitionFactory
SubsystemScope
Frame
FrameOutcome / FrameFailure
completed / cancelled / failed
InputListener
RenderDomain
ContentClient
business-safe local errors
```

M4 actual published root is intentionally narrower and exactly contains：

```text
defineSubsystem
completed / cancelled / failed
FrameCallRejectedError / FrameBusyError / FrameInactiveError / FrameClosedError
Frame / FrameFailure / FrameOutcome
RuntimeFailure
SubsystemDefinition / SubsystemDefinitionFactory / SubsystemScope
```

Input/Render/Content symbols remain target package responsibility but are not published before M10/M11/M12。

### 2.2 Host integration surface

```text
@loomrealm/subsystem/host
```

供 trusted Runner / composition 使用。

M4 published host slice：

```text
runSubsystem
SubsystemRuntimeFatalError
RunSubsystemOptions
SubsystemLaunchContext
SubsystemRuntimeControlPolicy
```

M4 Platform capability types不在这里重复定义；直接消费：

```text
@loomrealm/platform-ports
    DeadlineScheduler
    RuntimeControlBinding
```

后续 Data/Content host integration 由 M8/M12 再按真实 capability contract 落地，不是 M4 public surface 的 closure 条件。

---

## 3. Subsystem Definition Module ABI

Game Package v1不再声明 Definition Module。当前 Platform Launch Manifest/Planner把 Game logical `subsystemKey` 绑定为该平台的 executable `.mjs` **Subsystem Definition Module**。

规范形态：

```ts
import { defineSubsystem } from "@loomrealm/subsystem";

export default defineSubsystem(scope => ({
  async initialize() {},
  async frame(frame) {
    return completed(null);
  },
  async shutdown() {},
}));
```

要求：

```text
default export = SubsystemDefinitionFactory
module load != Runtime start
module path != Runtime identity
module MUST NOT read Game/Platform Launch Manifest
module MUST NOT probe Desktop/PWA to branch business semantics
module MUST NOT open Control/Data carrier
module MUST NOT read Host bootstrap globals for portable semantics
```

Host-owned Node/Worker Runner负责加载 PlatformLaunchPlan 选定的 Module并验证 default export。

Hostra/PWA MAY引用同一 artifact，也 MAY引用不同 platform build artifact；两个 artifact都必须实现同一 author/host ABI，并在相同 logical scenario 下满足等价 observable semantics。

---

## 4. Layering

```text
Business Author API
────────────────────────
Frame / FrameOutcome
InputListener
RenderDomain
ContentClient
lifecycle hooks

Capability Managers
────────────────────────
FrameRegistry
InputManager
RenderManager

Protocol Planes
────────────────────────
RuntimeControlPlane
DataPlane

Role Host Orchestration
────────────────────────
runSubsystem
SubsystemRuntimeControlPolicy

Platform Capability Contracts
────────────────────────
@loomrealm/platform-ports
DeadlineScheduler
RuntimeControlBinding
(future ports land only at their milestone)

Foundation
────────────────────────
MessageCarrier（payload 固定为 string）
```

必须保持：

```text
Protocol Plane != physical connection
Capability lifetime != carrier lifetime
Frame lifetime != Data Connection lifetime
Interest lifetime != Activation lifetime
Render Domain lifetime != Frame lifetime
```

---

## 5. MessageCarrier Boundary

Host Runtime Control path消费 `@loomrealm/platform-ports` 提供的 `RuntimeControlBinding`，其 successful acquire result 是 `@loomrealm/foundation` 已建立的 `MessageCarrier<string>`。

Carrier 表示一条**已经建立**的 string message pipe，不表达 establishment/identity/reconnect policy。

当前 Runtime Control 与 Renderer Data Profile 都把 application unit冻结为 UTF-8 JSON text string，因此 WebSocket/MessagePort adapter 对 Core 暴露相同 string carrier。

Author root不引用/导出 `MessageCarrier`。

---

## 6. Subsystem-facing Platform Capability Ownership

### 6.1 M4 Runtime Control

M4 的 Platform capability 唯一事实源是：

```text
@loomrealm/platform-ports
```

冻结：

```ts
interface DeadlineScheduler {
  schedule(delayMs: number, callback: () => void): () => void;
}

interface RuntimeControlBinding {
  acquire(signal: AbortSignal): Promise<MessageCarrier>;
}
```

本文件不再拥有第二份 `RuntimeControlBinding` contract；若旧草案描述与 `packages/platform-ports/DESIGN.md` 冲突，以后者 frozen M4 slice 为准。

同一 Launch Attempt 的 binding 是 single-use；Host MUST exactly-once consume acquisition path，不做 same-attempt reconnect。

### 6.2 Role-specific Runtime policy

Deadline 数值属于 Subsystem Host policy，不属于 Platform capability：

```ts
interface SubsystemRuntimeControlPolicy {
  readonly scheduler: DeadlineScheduler;
  readonly helloDeadlineMs: number;
  readonly frameDeadlineMs: number;
  readonly terminalCleanupDeadlineMs: number;
}
```

关系：

```text
Platform Ports     how to schedule / how to establish carrier
Subsystem Host     which deadlines apply to this role instance
Runtime Control    how timeout/protocol mechanics settle
```

### 6.3 Data / Content later slices

`SubsystemDataBinding` 与 Content physical binding 是完整 Subsystem role 的未来 Platform-facing needs，但 exact Platform contract 不在 M4 冻结。

M8/M12 时必须遵循同一 ownership：

```text
@loomrealm/platform-ports owns reusable platform capability contract
@loomrealm/subsystem/host consumes it
Subsystem SDK owns Data/Input/Render/Content role semantics
```

M4 MUST NOT定义 fake Data/Content ports 或 stub behavior。

---

## 7. Launch Context / `runSubsystem` M4 Slice

M4 host integration只注入当前真实需要的 Runtime Control capability/policy。

```ts
interface SubsystemLaunchContext {
  readonly subsystemKey: string;
  readonly bootstrapToken: string;
  readonly controlProtocolVersions: readonly number[];
}

interface RunSubsystemOptions {
  readonly definition: SubsystemDefinitionFactory;
  readonly runtimeControl: RuntimeControlBinding;
  readonly runtimePolicy: SubsystemRuntimeControlPolicy;
  readonly launch: SubsystemLaunchContext;
}

function runSubsystem(
  options: RunSubsystemOptions
): Promise<void>;
```

M4 不使用要求 future fake capability 的：

```ts
interface SubsystemPlatformPorts {
  data: ...;
  content: ...;
  // ...
}
```

`controlEndpoint` / MessagePort / WebSocket / Runner provisioning handle不进入 `SubsystemLaunchContext`；它们由 Platform adapter吸收到 capability implementation 中。

同样不得进入 `SubsystemLaunchContext`：

```text
raw Game Entry
raw Platform Launch Manifest
module path / resolved path / module URL
Hostra/PWA Runner entry
Node/Worker policy
```

这些已经由 Platform Launcher/RuntimeHosting/Runner在更外层解析和持有。

后续 capability injection 只在对应 milestone 有真实 consumer 时扩展；M4 不提前决定 M8/M12 exact host option shape。

---

## 8. Runtime Startup

M4逻辑顺序：

```text
Platform RuntimeHosting looks up frozen LaunchPlan
→ Host-owned Runner loads selected Definition Module
→ Runner validates Definition Module ABI
→ create per-instance Runtime/Frame managers + scope
→ invoke definition factory(scope)
→ RuntimeControlBinding.acquire(instance signal)
→ connect @loomrealm/runtime-control Subsystem peer
→ subsystem.hello
→ identified
→ definition.initialize()
→ subsystem.status(ready)
→ accept Frames
```

关键规则：

```text
ready != Data Connection exists
ready != Renderer exists
ready != Input/Render baseline published
```

M4 不启动 DataPlane，不要求 `SubsystemDataBinding`，也不因为未来 Data capability 尚未实现而阻塞 Runtime ready。

Definition module load/ABI failure、Control acquire/hello failure、definition factory / `initialize()` 在 ready 前失败时，均进入 Runtime bootstrap failure，不伪造 Frame outcome。

---

## 9. Per-instance Author Scope

不建立万能 `SubsystemRuntime` service locator，也不使用 module-global current runtime。

M4 current-ready slice：

```ts
interface SubsystemScope {
  readonly signal: AbortSignal;
}
```

未来随着真实 capability milestone 扩展同一个 scope：

```text
M10 createInputListener
M11 createRenderDomain
M12 content
```

M4 MUST NOT 用 throw-not-implemented/fake object 提前暴露这些 capability。

`signal` 在 graceful shutdown intent 或 Runtime-fatal transition 时 abort，供业务取消长任务。

---

## 10. FrameOutcome：业务与协议一一对应

正式 Frame v1 outcome 直接成为 author-level业务结果：

```ts
type FrameOutcome<T extends JsonValue = JsonValue> =
  | { readonly type: "completed"; readonly value: T }
  | { readonly type: "cancelled" }
  | { readonly type: "failed"; readonly error: FrameFailure };

interface FrameFailure {
  readonly code: string;
  readonly message?: string;
  readonly data?: JsonValue;
}
```

纯 helper：

```ts
completed(value)
cancelled()
failed(error)
```

不增加第二套 SDK outcome model。

---

## 11. `defineSubsystem`

```ts
interface SubsystemDefinition {
  initialize?(): void | Promise<void>;

  frame(
    frame: Frame
  ): FrameOutcome | Promise<FrameOutcome>;

  shutdown?(): void | Promise<void>;
  failed?(error: RuntimeFailure): void | Promise<void>;
}

type SubsystemDefinitionFactory = (
  scope: SubsystemScope
) => SubsystemDefinition;
```

成功、取消、业务失败必须显式形成 Outcome：

```ts
async frame(frame) {
  const battle = await frame.call("loom.battle", {
    enemy: "pikachu"
  });

  switch (battle.type) {
    case "completed":
      return completed(applyBattle(battle.value));
    case "cancelled":
      return cancelled();
    case "failed":
      return failed(battle.error);
  }
}
```

这里的 verbosity 是 intentional：Frame terminal semantics 不再依赖 Promise resolve/reject 的隐式猜测。

---

## 12. Frame Capability

```ts
interface Frame<TParams extends JsonValue = JsonValue> {
  readonly id: string;
  readonly params: TParams;
  readonly signal: AbortSignal;

  call<TResult extends JsonValue = JsonValue>(
    subsystem: string,
    params: JsonValue
  ): Promise<FrameOutcome<TResult>>;
}
```

`params` 对应 `frame.initialize.input` 的业务参数；不使用 `frame.input`，避免与 User Input冲突。

Author不见 `activationId`。

`frame.signal`：

```text
survives normal child-call suspension/resume
aborts on administrative suspend (v1 has no normal resume)
aborts on frame.close/local terminalization
aborts on Runtime shutdown/failure
```

业务可以用它取消 Frame-owned background work，但 Frame protocol correctness不依赖业务主动响应 AbortSignal。

---

## 13. Frame Initialize / Activate Mapping

`frame.initialize` success只建立 local Frame Context：

```text
validate/create local context
store params
create branded Frame capability
DO NOT start business frame handler yet
```

业务 handler 只在首次 successful `frame.activate` 安装 fresh Activation后启动一次。

这样业务永远不会在 `starting` Frame 上意外调用 `frame.call()`。

`FRAME_INITIALIZE_REJECTED` 是 SDK/context establishment级 rejection，不作为普通 author control-flow feature暴露。Phase 1 SDK SHOULD对合法 JsonValue params和可用本地资源确定性建立 context；业务语义验证在 active handler中用 `failed(...)` 表达。

---

## 14. `frame.call()` 精确语义

### 14.1 Child terminal outcome

正常 accepted call：

```text
frame.call Request
→ Main acceptance commits caller suspension/revokes old Activation
→ call Success(childFrameId)
→ child initialize/activate
→ child returns outcome
→ child close
→ caller resume(fresh Activation)
→ SDK atomically installs fresh local Activation
→ frame.call Promise resolves FrameOutcome
```

Child：

```text
completed
cancelled
failed
```

都属于**正常 Promise resolution value**，不是 JS exception。

### 14.2 Recoverable pre-commit rejection

正式协议明确 caller mutation未 commit 的：

```text
FRAME_CALL_TARGET_NOT_FOUND
FRAME_CALL_TARGET_UNAVAILABLE
```

映射为：

```ts
FrameCallRejectedError
```

`frame.call()` MAY reject该 local/typed error；SDK确认旧 Activation仍 current后释放 mutation gate，业务 continuation可 `catch` 并继续。

### 14.3 Runtime-fatal / ambiguous

以下不能作为普通 Promise rejection交还业务：

```text
Control loss
timeout with ambiguous commit
divergence
fatal protocol error
Runtime terminal failure
```

固定规则：

> **Runtime-fatal path MUST NOT re-enter the suspended business continuation.**

SDK：

```text
enter terminal Runtime failure
keep mutation gate closed
abort instance/frame signals
quarantine outstanding business Frame tasks
frame.call Promise does not settle back into business code
```

禁止：

```ts
try {
  await frame.call(...);
} catch {
  // continue mutating an Activation whose commit state is unknown
}
```

这条规则保证 Frozen Frame v1 的 ambiguous/no-rollback语义不能被 JS `catch` 绕过。

---

## 15. Handler Completion / `frame.return`

业务 handler返回一个 `FrameOutcome`。

如果 Frame仍 active/current、Runtime healthy、mutation gate可进入 terminal return：

```text
handler resolves Outcome
→ atomically terminalize local ordinary-mutation surface
→ hold mutation gate
→ send protocol frame.return(outcome)
```

Author不直接调用 `frame.return()`。

如果 `frame.return` explicit recoverable error理论上与本地 authority矛盾，按 Frozen protocol分类处理；ambiguous/fatal进入 Runtime failure，旧 Activation绝不恢复。

重复 handler completion / second call/return 被本地 usage gate拒绝，不发 wire。

---

## 16. Uncaught Business Exception

当 active Frame handler抛出未捕获 business exception，且 Runtime/Frame authority仍明确健康时，SDK把它转成 sanitized Frame business failure：

```ts
failed({
  code: "UNHANDLED_BUSINESS_EXCEPTION",
  message: safeMessage
})
```

然后走正常 `frame.return(failed)`。

区分：

```text
business exception
    → Frame failed outcome

protocol ambiguity / SDK invariant corruption / Control loss
    → Runtime failure
```

不得把普通业务异常默认升级为整 Runtime fatal；也不得把 Runtime protocol corruption降级成 Frame failed outcome。

---

## 17. Administrative Suspend

`frame.suspend` v1 是 administrative one-way suspension，无 generic normal resume。

成功后 SDK：

```text
revoke local Activation
close ordinary call/return gate
abort frame.signal
keep context only for later frame.close cleanup
```

若已经运行的业务 task忽略 AbortSignal后继续 resolve/throw，SDK MUST discard其 terminal attempt，不发送 `frame.return`。

Child-call suspension不使用 `frame.suspend`，也不 abort `frame.signal`。

---

## 18. Mutation Gate

每个 Frame Context由 SDK拥有 commit-sensitive mutation gate：

```text
pending outbound frame.call
pending terminal frame.return
administrative suspend
closing/closed
Runtime terminal
```

都会阻止新的 ordinary mutation；M10 Input delivery 接入后也必须服从同一个 gate。

可暴露 local usage errors：

```text
FrameBusyError
FrameInactiveError
FrameClosedError
```

这些不是 wire protocol errors。

---

## 19. Runtime Terminal Hooks / `runSubsystem` Settlement

一个 Subsystem instance只有一个 first terminal cause：

```text
graceful Main shutdown intent
OR
Runtime-fatal failure
```

SDK先 abort `scope.signal` 与 relevant frame signals，再进入 bounded terminal handling。

Author hooks：

```text
shutdown()
    first terminal cause = graceful shutdown

failed(error)
    first terminal cause = Runtime failure
```

同一 instance 不重复调用两个 terminal hook；terminal hook自身异常只进入 diagnostics/cleanup classification，不重新开放 Runtime，也不覆盖 primary terminal cause。

M4 `runSubsystem()` settlement 与 host-facing fatal error shape 已在 implementation baseline 中冻结：

```ts
class SubsystemRuntimeFatalError extends Error {
  readonly failure: RuntimeFailure;
}
```

```text
graceful Main shutdown
→ abort signals
→ invoke shutdown() at most once
→ bounded local cleanup
→ close Runtime Control peer
→ resolve

bootstrap / Runtime fatal
→ latch first RuntimeFailure
→ abort signals
→ invoke failed(primary) at most once
→ bounded local cleanup
→ close Runtime Control peer
→ reject with a business-safe host error preserving the primary Runtime failure
```

该 rejection 的 exact exported error shape 在 M4 Subsystem implementation closure 中定稿；terminal hook/cleanup error MUST NOT覆盖 primary failure。

Control acquisition rejection、hello rejection/timeout、unexpected Control terminal、fatal Frame ambiguity 都进入 Runtime bootstrap/fatal path；不得返回旧 business continuation。

Runtime Control terminal classification has exactly one owner：`SubsystemHost` maps immutable `RuntimeControlTerminal` to the business-safe `RuntimeFailure`。`FrameRuntime` only quarantines the old continuation；it MUST NOT synthesize a competing terminal code from the same terminal/timeout/fatal semantic outcome。This prevents observable failure codes from depending on Promise/microtask race order。

---

## 20. Input API (M10 target; not M4 surface)

Input 是后续独立 capability，但通过 branded `Frame` capability绑定正确 owner/identity：

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

这些 API 在 M10 前不是 M4 public implementation requirement，也不得以 fake behavior 提前导出。

---

## 21. Input Interest Aggregation (M10 target)

多个 listener对同一 Frame贡献 union：

```text
A(F1): keyboard.event
B(F1): pointer.state
C(F2): gamepad.event

DesiredRegistry:
F1 → keyboard.event, pointer.state
F2 → gamepad.event
```

内部保存 per-listener contribution + derived：

```text
Map<frameId, Set<channel>>
```

每次 publication都是 full Frame Interest Registry Snapshot，不是 incremental subscribe/unsubscribe。

`setChannels`/`close` 必须先原子更新 local desired registry，再排 publication；因此 late removed-channel input被 receive gate直接 drop。

一个 listener关闭不能移除另一个 listener仍贡献的 channel。

---

## 22. Input Lifecycle (M10 target)

### Child-call suspension/resume

```text
F/A1 active + Interest[F]
→ accepted child call
→ F suspended / A1 revoked
→ listeners + Interest[F] remain
→ ordinary delivery stops
→ fresh resume A2
→ same listeners/config reused
```

old A1 Input State/Event永不跨到 A2；`.state` false→true重新 baseline。

### Frame close

local `frame.close` success成立前 MUST已经：

```text
abort frame.signal
close all listeners bound to F
remove local Interest[F]
clear retained input state for F
```

wire publication可以稍后 coalesce/发送，但 local invariant必须先成立。

### Fresh Data carrier

业务 listener/local desired registry保留；remote registry从 empty开始；InputManager自动 republish current full registry。

---

## 23. Input Receive Gate (M10 target)

收到普通 State/Event 时至少重新验证：

```text
message belongs to current Data carrier
local Frame exists
Frame active
activationId == current local Activation
channel ∈ local Interest[frameId]
mutation gate open
```

否则 drop，不升级 Runtime failure。

---

## 24. Render API (M11 target; not M4 surface)

Render 是 independent presentation capability：

```ts
interface CreateRenderDomainOptions {
  readonly name?: string;
  readonly zIndex?: number;
}

interface RenderDomain {
  set(state: RenderTree): void;
  event(targetKey: string, name: string, data?: JsonObject): void;
  close(): void;
}
```

SDK mint protocol `domainId`；author `name` 只是可选诊断/业务标签，不是 one-shot protocol identity。

不同时提供没有明确不同语义的 `set()` / `update()`；业务表达 desired authoritative state，SDK决定 Snapshot/Patch。

---

## 25. Render / Data Lifetime (M8/M11 target)

```text
RenderDomain
    ↓
RenderManager
    ↓
DataPlane
    ↓
current carrier
```

Data carrier替换时业务 `RenderDomain` object和 desired state不变。

fresh carrier：

```text
render.domains current full Registry
→ fresh Snapshot each current Domain
→ Patch/Event
```

Frame close/suspend不自动 hide/destroy Domain。

Runtime terminal时 SDK最终关闭本 instance所有 local RenderDomain resources，但这只是 local cleanup，不改写已定义协议 lifecycle。

---

## 26. Role-local Data Peer Lifecycle (M8 implemented)

Subsystem Host只保留当前 Data peer、至多一个 pending acquire和 host-lifetime acquisition-stopped fact：

```text
SubsystemDataBinding platform port
        ↓
createSubsystemDataPeer
        ↓
role-local current peer
```

`@loomrealm/data` peer：

```text
owns one carrier reader
JSON text parse
Renderer Data Profile demux
serialized writer / terminal mechanics
```

Host负责 acquire/install/clear/close/currentness；InputManager/RenderManager MUST NOT分别竞争消费 `carrier.messages()`。

M8 binding contract以当前 `@loomrealm/platform-ports` frozen slice为唯一事实源；M10/M11在 peer之上增加业务状态。

---

## 27. Platform Independence / Runner Boundary

Core package MUST NOT：

```text
probe Desktop/PWA
read launch.hostra.json / launch.pwa.json
resolve executable module
import concrete WebSocket/MessagePort
spawn Process/Worker
own DataConnectionBroker
open Hostra window
read module-global current platform
```

Hostra Node Runner / PWA Worker Runner负责：

```text
receive PlatformLaunchPlan-selected Definition Module
obtain platform bootstrap material
load/validate exact selected Definition Module
implement/provide @loomrealm/platform-ports capabilities
call runSubsystem(...)
```

M4 only：

```text
DeadlineScheduler
RuntimeControlBinding
```

后续 Data/Content capability 在各自 milestone 增加。

两个平台选择的 artifact MAY不同；author surface和 Role semantics不得因此改变。

---

## 28. Dynamic Data Provisioning Boundary (M9 target)

M8只消费 Platform 已决定可交付的 paired carrier；M9为 concrete Runner增加 platform-internal provisioning source来实现现有 Subsystem Data binding port。

Hostra：

```text
Main DataAuthority(S,G,P)
→ Desktop DataConnectionBroker
→ platform-local Runner provisioning channel
→ Node Runner receives one-time Data connection material
→ transport-websocket establishes/binds carrier
→ Subsystem Data port yields {G,P,carrier}
→ Host installs real @loomrealm/data peer
```

PWA：

```text
Main DataAuthority(S,G,P)
→ PWA DataConnectionBroker
→ Worker provisioning Port/path
→ transferred matching MessagePort
→ Subsystem Data port yields {G,P,carrier}
→ Host installs real @loomrealm/data peer
```

Provisioning：

```text
is Platform infrastructure
is not Runtime Control
is not Renderer Data application carrier
is not author API
```

不得把 endpoint/ticket/Port塞入 `subsystem.status(ready)`、Frame params或 Renderer Control Snapshot。

---

## 29. Internal Structure

目标：

```text
packages/subsystem/
├── src/
│   ├── index.ts                 author exports
│   ├── definition/
│   ├── frame/
│   │   ├── frame.ts
│   │   ├── outcome.ts
│   │   ├── context.ts
│   │   ├── registry.ts
│   │   └── mutation-gate.ts
│   ├── input/                   M10
│   ├── render/                  M11
│   ├── content/                 M12
│   ├── host/
│   │   ├── run-subsystem.ts
│   │   └── runtime-policy.ts
│   └── internal/
│       ├── runtime-control-plane.ts
│       └── data-plane.ts        M8
└── test/
```

`platform-ports.ts` 不再由 Subsystem 自己维护；共享 Platform capability contract 来自 `@loomrealm/platform-ports`。

目录按 capability 的真实 implementation gate demand-driven 落地：M4优先 definition/frame/host/runtime-control plane；Data/Input/Render/Content 随 M8/M10/M11/M12 实现。

Author root不 re-export host/internal/platform port types。

---

## 30. Testing

测试同样按 capability slice 渐进落地；以下是完整 Phase 1 target corpus，不是 M4 单 milestone 的验收清单。

至少覆盖：

```text
[M4 Runtime/Frame]
Definition Module default-export ABI
per-instance scope / no global current context
RuntimeControlBinding acquisition exactly once
acquire abort never publishes late carrier
ready independent from Data connection
Game/Platform launch config absent from author surface
Hostra/PWA-like RuntimeControlBinding accepted through same contract

frame.initialize-does-not-start-handler
frame.activate-starts-handler-once
child-completed/cancelled/failed-resolve-as-FrameOutcome
recoverable-call-rejection-rejects-and-keeps-current-activation
runtime-fatal-call-never-reenters-business-continuation
handler-uncaught-exception-becomes-frame-failed
administrative-suspend-aborts-frame-signal/discards-late-handler-result
handler-result-sends-exactly-one-return
mutation-gate
runSubsystem-graceful-resolves
runSubsystem-runtime-fatal-rejects-primary-cause
terminal-hook-error-does-not-replace-primary-cause

[M8/M10 Data/Input]
multiple-listeners-union-interest
listener-bound-to-local-frame-owner
suspend-retains-interest
fresh-activation-reuses-interest-config-not-state
frame-close-removes-interest-before-local-close-success
fresh-data-carrier-republishes-full-registry
stale-input-receive-gate

[M8/M11 Data/Render]
one-data-reader-demuxes-input-render
wrong-data-profile-not-installed
render-domain-survives-data-reconnect
fresh-render-registry-snapshots
frame-close-does-not-auto-close-domain

[Cross-platform integration]
fake Hostra-like ports
fake PWA-like ports
platform-specific Definition artifacts → same abstract business trace
```

---

## 31. Non-goals

当前不做：

```text
万能 game framework
runtime.* service locator
platform-global current Subsystem
Platform Launch Manifest API for business
automatic Runtime restart
business-visible activationId
per-Frame/per-Domain Data Connection
Input ACK/revision/subscription handshake
Render history replay
Hostra/PWA special business API
SDK catchable Runtime-fatal continuation
Subsystem-owned duplicate Platform port contracts
future capability stubs in M4
```

---

## 32. Final Invariants

1. `@loomrealm/subsystem` 是 platform-neutral author SDK；
2. `@loomrealm/subsystem/host` 是 trusted Runner integration/orchestration surface；
3. reusable Platform capability contract 的唯一事实源是 `@loomrealm/platform-ports`；
4. M4 Subsystem Host只消费 `DeadlineScheduler + RuntimeControlBinding`；
5. deadline values由 `SubsystemRuntimeControlPolicy` 拥有，不属于 Platform Ports；
6. Game Package只声明 logical key；Platform LaunchPlan选择 Definition Module；
7. 所有 platform-selected Definition Module都必须导出同一 `SubsystemDefinitionFactory` ABI；
8. author不见 carrier/bootstrap/deadline/platform-port/generation/profile/activation/launch manifest/module path；
9. Runtime Control与未来 Data独立 connection/lifetime；
10. FrameOutcome与正式 Frame v1 `completed/cancelled/failed` 一一对应；
11. child terminal outcome resolve `frame.call()`；pre-commit recoverable rejection才 reject；
12. Runtime-fatal/ambiguous path永不重新进入业务 continuation；
13. `frame.initialize`只建 Context，`frame.activate`后才启动 handler；
14. uncaught business exception默认成为 Frame failed，不混同 Runtime protocol failure；
15. M4 `SubsystemScope` 只含 current-ready capability，不 fake Input/Render/Content；
16. `runSubsystem` graceful resolve，Runtime/bootstrap fatal reject，terminal hook failure不覆盖 primary cause；
17. InputListener/RenderDomain/DataPlane 分别由 M10/M11/M8 完成，不是 M4 closure 条件；
18. fresh Activation/Input 与 fresh Data/Render baseline semantics 继续服从各自正式协议；
19. dynamic Data material经 Platform provisioning sideband进入 Runner，不污染 Runtime Control；
20. Hostra/PWA physical implementation/artifact可不同，但 frozen Platform Port 与 author/business observable semantics必须等价；
21. package responsibility 与 milestone implementation slice 分离；M4只关闭 Runtime/Frame core，M8/M10/M11/M12继续完成同一 `@loomrealm/subsystem` 的 Data/Input/Render/Content capability。
