# `@loomrealm/subsystem` 设计草案

> 状态：Draft  
> 阶段：Package boundary / author API / host integration / implementation planning  
> 最近复核：2026-08-19  
> 目标：为 LoomRealm 业务 Subsystem 提供稳定、平台无关、协议机械细节不可见的 author SDK，并定义 Platform Runner 可消费的最小 host integration surface。  
> 上层架构：[平台组合系统](../../doc/10-architecture/platform-composition-system.md)  
> 正式语义：[Runtime Control Profile v1](../../doc/15-contracts/runtime-control-profile-v1.md)、[Frame / Call v1](../../doc/15-contracts/frame-call-protocol-v1.md)、[Renderer Data Profile v1](../../doc/15-contracts/renderer-data-profile-v1.md)  
> 核心原则：**业务定义只表达业务；SDK 把正式协议映射成不可绕过的 capability/control-flow；Platform Runner 注入 role-local ports；physical carrier 与 capability lifetime 分离。**

---

## 1. Package Position

```text
Subsystem Definition Module
        │
        ▼
@loomrealm/subsystem        author surface
        │
        ▼
@loomrealm/subsystem/host   integration surface
        │
        ▼
Subsystem-facing Platform Ports
        │
        ▼
Hostra Node Runner / PWA Worker Runner
```

`@loomrealm/subsystem` 不是 Desktop/PWA platform layer，也不是 Runtime Control protocol package。

业务 Subsystem MUST NOT直接依赖：

```text
@loomrealm/runtime-control
@loomrealm/wire
MessageCarrier
WebSocket / MessagePort
child_process / Worker
Hostra
bootstrapToken
Data generation/profile
```

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

### 2.2 Host integration surface

```text
@loomrealm/subsystem/host
```

供 trusted Runner / composition 使用：

```text
runSubsystem
SubsystemPlatformPorts
RuntimeControlBinding
SubsystemDataBinding
SubsystemLaunchContext
```

Host surface MAY引用 `MessageCarrier`；author root MUST NOT re-export它。

---

## 3. Subsystem Definition Module ABI

Game Package v1 的 `descriptor.module` 指向一个 platform-neutral `.mjs` **Subsystem Definition Module**。

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
module MUST NOT probe Desktop/PWA
module MUST NOT open Control/Data carrier
module MUST NOT read Host bootstrap globals for portable semantics
```

Host-owned Node/Worker Runner负责加载 Module并验证 default export。

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

Subsystem Platform Ports
────────────────────────
RuntimeControlBinding
SubsystemDataBinding
ContentClient

Foundation
────────────────────────
MessageCarrier<string>
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

Host surface使用 `@loomrealm/foundation` 已建立 message carrier：

```ts
interface MessageCarrier {
  send(message: string): void | Promise<void>;
  messages(): AsyncIterable<string>;
  readonly closed: Promise<CarrierClosed>;
  close(): void | Promise<void>;
}
```

Carrier 表示一条**已经建立**的 string message pipe，不表达 establishment/identity/reconnect policy。

当前 Runtime Control 与 Renderer Data Profile 都把 application unit冻结为 UTF-8 JSON text string，因此 WebSocket/MessagePort adapter 对 Core 暴露相同 string carrier。

---

## 6. Subsystem-facing Platform Ports

### 6.1 Runtime Control

一次 Launch Attempt 的 Control one-shot：

```ts
interface RuntimeControlBinding {
  acquire(signal?: AbortSignal): Promise<MessageCarrier>;
}
```

同一 Subsystem instance MUST最多成功 acquire一次；Control loss进入 Runtime failure，无 same-attempt reconnect。

### 6.2 Data

Subsystem side port 命名为 `SubsystemDataBinding`，避免与 Renderer role 的 `RendererDataBinding` 混淆：

```ts
interface SubsystemDataConnection {
  readonly generation: number;
  readonly dataProfile: string;
  readonly carrier: MessageCarrier;
}

interface SubsystemDataBinding {
  connections(
    signal?: AbortSignal
  ): AsyncIterable<SubsystemDataConnection>;
}
```

语义：

```text
Platform Broker/Runner adapter
    establishes/provisions physical carrier
        ↓
SubsystemDataBinding
    yields already-bound S/G/Profile carrier
        ↓
SDK DataPlane
```

SDK 不创建 endpoint/ticket/Port，也不拥有 generation/profile。

同 generation/profile MAY sequential reconnect；fresh carrier child state重新 baseline。

### 6.3 Content

`ContentClient` 是 platform-neutral logical client；Hostra HTTP / PWA Fetch/SW 已在更低层绑定。

---

## 7. Launch Context / `runSubsystem`

Host integration不使用单一 `{carrier}`。

```ts
interface SubsystemLaunchContext {
  readonly subsystemKey: string;
  readonly bootstrapToken: string;
  readonly controlProtocolVersions: readonly number[];
}

interface SubsystemPlatformPorts {
  readonly runtimeControl: RuntimeControlBinding;
  readonly data: SubsystemDataBinding;
  readonly content: ContentClient;
}

interface RunSubsystemOptions {
  readonly definition: SubsystemDefinitionFactory;
  readonly platform: SubsystemPlatformPorts;
  readonly launch: SubsystemLaunchContext;
}

function runSubsystem(
  options: RunSubsystemOptions
): Promise<void>;
```

`controlEndpoint` / MessagePort / WebSocket / Runner provisioning handle不进入 `SubsystemLaunchContext`；它们已被 Platform adapter吸收到 bindings 中。

---

## 8. Runtime Startup

逻辑顺序：

```text
Runner validates Definition Module ABI
→ create per-instance managers/scope
→ invoke definition factory(scope)
→ acquire Runtime Control carrier
→ create RuntimeControlPlane
→ subsystem.hello
→ identified
→ definition.initialize()
→ establish all local capabilities required for Runtime Control Profile
→ subsystem.status(ready)
→ accept Frames
```

关键规则：

```text
ready != Data Connection exists
ready != Renderer exists
ready != Input/Render baseline published
```

`SubsystemDataBinding` / DataPlane 可以独立监听 connection stream；Data availability不是 Runtime readiness前置条件。

Definition factory / `initialize()` 在 ready 前失败时，SDK进入 Runtime bootstrap failure，不伪造 Frame outcome。

---

## 9. Per-instance Author Scope

不建立万能 `SubsystemRuntime` service locator，也不使用 module-global current runtime。

```ts
interface SubsystemScope {
  readonly createInputListener: (
    options: CreateInputListenerOptions
  ) => InputListener;

  readonly createRenderDomain: (
    options?: CreateRenderDomainOptions
  ) => RenderDomain;

  readonly content: ContentClient;
  readonly signal: AbortSignal;
}
```

这些 factory/client只是同一 Subsystem instance 的 scoped dependencies，不表示 Runtime拥有 Input/Render/Content。

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

`frame.initialize` success只建立 local Frame/Input Context：

```text
validate/create local context
store params
create branded Frame capability
DO NOT start business frame handler yet
```

业务 handler 只在首次 successful `frame.activate` 安装 fresh Activation后启动一次。

这样业务永远不会在 `starting` Frame 上意外调用 `frame.call()` 或消费 ordinary input。

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
close ordinary input/call/return gate
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

都会阻止新的 ordinary mutation/input delivery。

可暴露 local usage errors：

```text
FrameBusyError
FrameInactiveError
FrameClosedError
```

这些不是 wire protocol errors。

---

## 19. Runtime Terminal Hooks

一个 Subsystem instance只有一个 first terminal cause：

```text
gracious Main shutdown intent
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

同一 instance 不重复调用两个 terminal hook；terminal hook自身异常只进入 diagnostics/cleanup classification，不重新开放 Runtime。

---

## 20. Input API

Input 是独立 capability，但通过 branded `Frame` capability绑定正确 owner/identity：

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

SDK SHOULD拒绝：

```text
foreign Subsystem Frame capability
already closed/administratively suspended Frame for new listener
invalid channel
```

协议对 stale/unknown Interest 的容忍是 cross-plane recovery rule，不代表 author API需要接受错误 local binding。

---

## 21. Input Interest Aggregation

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

## 22. Input Lifecycle

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

## 23. Input Receive Gate

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

## 24. Render API

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

## 25. Render / Data Lifetime

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

## 26. DataPlane

Subsystem SDK只有一个 connection-wide DataPlane reader/writer：

```text
SubsystemDataBinding
        ↓
DataPlane
      /       \
 InputManager RenderManager
```

DataPlane：

```text
validates generation/profile/current installation
owns one carrier reader
JSON text parse
Renderer Data Profile demux
fresh-carrier notification
retirement cleanup
```

InputManager/RenderManager MUST NOT分别竞争消费 `carrier.messages()`。

---

## 27. Platform Independence / Runner Boundary

Core package MUST NOT：

```text
probe Desktop/PWA
import concrete WebSocket/MessagePort
spawn Process/Worker
own DataConnectionBroker
open Hostra window
read module-global current platform
```

Hostra Node Runner / PWA Worker Runner负责：

```text
load Definition Module
obtain platform bootstrap material
construct RuntimeControlBinding
construct SubsystemDataBinding
construct ContentClient
call runSubsystem(...)
```

同一个 Definition Module在两种 Runner下不修改即可运行。

---

## 28. Desktop Dynamic Data Provisioning Boundary

Desktop DataAuthority通常在 Runtime启动之后才出现/替换，因此 Node Runner必须有 platform-internal provisioning source，用来实现 `SubsystemDataBinding`。

概念链：

```text
Main DataAuthority(S,G,P)
→ Desktop DataConnectionBroker
→ platform-local Runner provisioning channel
→ Node Runner receives one-time Data connection material
→ transport-websocket establishes/binds carrier
→ SubsystemDataBinding yields {G,P,carrier}
→ SDK DataPlane installs current
```

该 provisioning channel：

```text
is Platform infrastructure
is not Runtime Control
is not Renderer Data application carrier
is not author API
```

具体 Node IPC payload属于 Hostra composition/Runner implementation；不得把 endpoint/ticket塞入 `subsystem.status(ready)`、Frame params或 Renderer Control Snapshot。

PWA 对应使用 Worker provisioning Port / transferred MessagePort实现相同 `SubsystemDataBinding` semantics。

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
│   ├── input/
│   ├── render/
│   ├── content/
│   ├── host/
│   │   ├── run-subsystem.ts
│   │   └── platform-ports.ts
│   └── internal/
│       ├── runtime-control-plane.ts
│       └── data-plane.ts
└── test/
```

Author root不 re-export host/internal types。

---

## 30. Testing

至少覆盖：

```text
Definition Module default-export ABI
per-instance scope / no global current context
Runtime Control binding one-shot
ready independent from Data connection

frame.initialize-does-not-start-handler
frame.activate-starts-handler-once
child-completed/cancelled/failed-resolve-as-FrameOutcome
recoverable-call-rejection-rejects-and-keeps-current-activation
runtime-fatal-call-never-reenters-business-continuation
handler-uncaught-exception-becomes-frame-failed
administrative-suspend-aborts-frame-signal/discards-late-handler-result
handler-result-sends-exactly-one-return
mutation-gate

multiple-listeners-union-interest
listener-bound-to-local-frame-owner
suspend-retains-interest
fresh-activation-reuses-interest-config-not-state
frame-close-removes-interest-before-local-close-success
fresh-data-carrier-republishes-full-registry
stale-input-receive-gate

one-data-reader-demuxes-input-render
wrong-data-profile-not-installed
render-domain-survives-data-reconnect
fresh-render-registry-snapshots
frame-close-does-not-auto-close-domain

fake Hostra-like ports
fake PWA-like ports
same Definition Module → same abstract business trace
```

---

## 31. Non-goals

当前不做：

```text
万能 game framework
runtime.* service locator
platform-global current Subsystem
automatic Runtime restart
business-visible activationId
per-Frame/per-Domain Data Connection
Input ACK/revision/subscription handshake
Render history replay
Hostra/PWA special business API
SDK catchable Runtime-fatal continuation
```

---

## 32. Final Invariants

1. `@loomrealm/subsystem` 是 platform-neutral author SDK；
2. `@loomrealm/subsystem/host` 是 trusted Runner integration surface；
3. Game Package module默认导出同一个 `SubsystemDefinitionFactory`；
4. Platform通过 `RuntimeControlBinding + SubsystemDataBinding + ContentClient` 注入基础设施；
5. Runtime Control与 Data独立 connection/lifetime；
6. author不见 carrier/bootstrap/generation/profile/activation；
7. FrameOutcome与正式 Frame v1 `completed/cancelled/failed` 一一对应；
8. child terminal outcome resolve `frame.call()`；pre-commit recoverable rejection才 reject；
9. Runtime-fatal/ambiguous path永不重新进入业务 continuation；
10. `frame.initialize`只建 Context，`frame.activate`后才启动 handler；
11. uncaught business exception默认成为 Frame failed，不混同 Runtime protocol failure；
12. InputListener绑定 branded Frame，Interest语义 Frame-scoped；
13. Frame close local success前必须删除 listeners/Interest；
14. fresh Activation复用 Interest config但不复用 Input State/Event；
15. fresh Data carrier child state重新 baseline，business capability object继续存在；
16. RenderDomain与 Frame/Data carrier lifecycle独立；
17. 一个 DataPlane统一消费/分派 Data carrier；
18. Desktop dynamic Data material经 Platform provisioning sideband进入 Runner，不污染 Runtime Control；
19. 同一 Definition Module应在 Hostra Node Runner与 PWA Worker Runner下运行同一业务语义。