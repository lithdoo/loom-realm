# `@loomrealm/main` 设计草案

> 状态：Draft  
> 阶段：Package boundary / role core / transaction & recovery / implementation planning  
> 最近复核：2026-08-20  
> 目标：把 LoomRealm Main 落成平台无关、可执行、可测试的 Session / Runtime / Frame / Activation / InputTarget / DataAuthority authority core，并通过 typed capability packages 与 Main-facing Platform ports 驱动物理 Runtime、Renderer 与 Data connection realization。  
> 上层架构：[系统架构总览](../../doc/10-architecture/system-overview.md)、[运行承载系统](../../doc/10-architecture/runtime-hosting-system.md)、[运行时启动系统](../../doc/10-architecture/runtime-bootstrap-system.md)  
> 正式语义：[Game Package v1](../../doc/15-contracts/game-package-v1.md)、[Runtime Control Profile v1](../../doc/15-contracts/runtime-control-profile-v1.md)、[Frame / Call v1](../../doc/15-contracts/frame-call-protocol-v1.md)、[Renderer Control v1](../../doc/15-contracts/main-renderer-control-v1.md)

核心原则：

> **Main 拥有 LoomRealm application authority 与状态事务；capability package 实现协议机械；Platform port 实现物理世界。Main 不知道 Hostra/PWA、module/path/URL、Process/Worker 或具体 Transport。**

---

## 1. Package Position

```text
Validated Game Entry
    logical topology {key} + initial
              │
              ▼
       @loomrealm/main
       application authority
              │
      ┌───────┼────────┐
      ▼       ▼        ▼
runtime-   renderer-   Main-facing
control    control     Platform Ports
      │       │        │
      │       │   ┌────┴────────────┐
      │       │   ▼                 ▼
      │       │ Hostra             PWA
      │       │ RuntimeHosting     RuntimeHosting
      │       │ Node/WS/...        Worker/Port/...
      │       │
      └───────┴──────────────► role peers
```

Main 与 `@loomrealm/subsystem` 一样，是 platform-neutral role package。

必须保持：

```text
Main application authority
!= Runtime Control protocol mechanics
!= Renderer Control protocol mechanics
!= Platform executable binding
!= Runtime process/Worker hosting
!= Data carrier establishment
```

---

## 2. Main Owns

Main 是以下状态的唯一 application authority：

```text
Session logical lifecycle
Logical Subsystem Registry
Runtime public lifecycle
Launch Attempt identity
Frame identity / caller / lifecycle / accepted outcome
Frame Stack
Activation identity / currentness
InputTarget
normal Stack mutation transaction
Runtime failure classification policy
fixed-point failure unwind
Renderer authority source projection
DataAuthority {subsystemKey,generation,dataProfile}
```

Main 可以维护实现所需的 private indexes、epochs、pending operations 和 mutation tokens，但这些不能形成第二套跨角色 protocol authority。

---

## 3. Main Does Not Own

```text
Game executable module binding
Platform Launch Manifest
PlatformLaunchPlan contents
module/path/URL resolution
Node executable / Worker entry
Process/Worker/window/socket/Port lifecycle implementation
Runtime Control JSON-RPC machinery
Renderer Control wire machinery
Subsystem business state
Subsystem Input Interest
Renderer Input Producer
Render Domain authoritative state
Renderer render replica
Data Connection child protocol state
Content bytes / filesystem / Fetch
Save/checkpoint/replay/restart policy
```

尤其禁止：

```text
@loomrealm/main → @loomrealm/game-launcher-hostra
@loomrealm/main → @loomrealm/game-launcher-pwa
@loomrealm/main → child_process / Worker
@loomrealm/main → WebSocket / MessagePort
@loomrealm/main → filesystem module resolver
```

---

## 4. Direct Package Dependencies

当前目标依赖：

```text
@loomrealm/game-package
    ValidatedGameEntry / logical key topology / initial input

@loomrealm/runtime-control
    typed Main-side Runtime Control peer/session
    Control + Frozen Frame protocol mechanics
    deadline/commit-evidence results

@loomrealm/renderer-control
    typed Main-side Renderer Control publication/synchronization
```

依赖方向：

```text
game-package      runtime-control      renderer-control
      \                  |                  /
       \                 |                 /
                    @loomrealm/main
```

当前 Main Core **不需要直接依赖**：

```text
@loomrealm/game-launcher-hostra
@loomrealm/game-launcher-pwa
@loomrealm/data
@loomrealm/content
concrete transport adapters
```

`DataAuthority.dataProfile` 对 Main 是正式 profile identity；Data protocol child state 由 Data capability/roles拥有。

---

## 5. Public Package Surface

候选：

```text
@loomrealm/main
@loomrealm/main/testing
```

不建立类似 `@loomrealm/main/hostra` / `@loomrealm/main/pwa` 的平台 subpath。

候选入口：

```ts
interface MainOptions {
  readonly game: ValidatedGameEntry;
  readonly platform: MainPlatformPorts;
}

interface MainSession {
  start(): Promise<void>;
  shutdown(): Promise<void>;
  snapshot(): MainAuthoritySnapshot;
  readonly closed: Promise<MainSessionResult>;
}

function createMain(options: MainOptions): MainSession;
```

具体公开 symbol 在实现前可继续收敛，但必须保持：

```text
raw Game JSON不进入 Main Core
raw Platform Launch Manifest不进入 Main Core
module/path/URL不进入 Main public API
Platform concrete type不进入 Main public API
```

---

## 6. Main-facing Platform Ports

Main 只消费 role-local capability，不知道它们怎样在当前平台实现。

概念集合：

```ts
interface MainPlatformPorts {
  readonly runtimeHosting: RuntimeHosting;
  readonly runtimeControl: RuntimeControlHost;
  readonly rendererHosting: RendererHosting;
  readonly rendererControl: RendererControlHost;
  readonly dataConnections: DataConnectionBroker;
}
```

Content Service 是独立 readonly plane；除非未来 Main 获得明确的 Session-level Content lifecycle 职责，否则不把 business Content query 放进 Main port surface。

### 6.1 `RuntimeHosting`

语义：

```text
logical launch intent by subsystemKey
physical Runner Runtime creation
physical supervision facts
bounded terminate capability
```

候选：

```ts
interface RuntimeHosting {
  launch(
    subsystemKey: string,
    attempt: RuntimeLaunchAttempt,
    signal?: AbortSignal,
  ): Promise<RuntimeHostHandle>;

  terminate(
    handle: RuntimeHostHandle,
    signal?: AbortSignal,
  ): Promise<void>;
}
```

`RuntimeHosting` MUST 已经由 Platform Composition 封闭绑定 immutable PlatformLaunchPlan。

Main MUST NOT传：

```text
module
resolvedPath
URL
Node executable
Worker entry
argv/env
transport endpoint
```

### 6.2 `RuntimeControlHost`

负责把某个 Main Launch Attempt 与一条已经物理建立、认证/绑定完成的 Runtime Control capability 对接。

Main 从该 port 获得可交给 `@loomrealm/runtime-control` Main-side machinery 的 typed binding/session capability；Main 不负责 WebSocket/MessagePort establishment。

必须满足：

```text
one Launch Attempt
→ at most one successful identified Control lifetime

same-attempt Control reconnect = forbidden
```

### 6.3 `RendererHosting`

只实现 current Renderer participant 的物理 realization / termination facts。

不拥有：

```text
Renderer authority Snapshot
Frame Stack
InputTarget
DataAuthority
```

### 6.4 `RendererControlHost`

只提供 Main ⇄ current Renderer 的 Control capability。

协议 sequencing / snapshot/revision mechanics 由 `@loomrealm/renderer-control` 实现；Main 提供 committed authority source。

### 6.5 `DataConnectionBroker`

实现当前 Main `DataAuthority(S,G,P)` 的物理 Data connection realization。

```text
Main authority
    DataAuthority(S,G,P)
          │
          ▼
DataConnectionBroker
      /              \
 Renderer side      Subsystem side
```

Broker：

```text
MUST NOT mint generation
MUST NOT choose/replace dataProfile authority
MUST NOT mutate Runtime/Frame authority on provisioning failure
```

Hostra/PWA 的 WebSocket、ticket、MessageChannel、Port transfer 等均留在 Platform realization。

---

## 7. Game Bootstrap Input

Main 只接受 `@loomrealm/game-package` 已验证结果。

概念：

```text
ValidatedGameEntry
├── formatVersion
├── initial {subsystem,input}
└── complete required subsystem keys
```

Main 建立 immutable logical registry：

```text
SubsystemRegistry
    key → LogicalSubsystemRecord
```

核心 identity invariant：

```text
Subsystem application identity = subsystemKey

NOT module path
NOT resolved URL/path
NOT PID
NOT Worker id
NOT RuntimeHostHandle
NOT Control connection id
```

Phase 1：全部 declared Subsystem eager + required。

---

## 8. Platform Preflight Is a Precondition, Not Main Logic

Current Platform 在 first business Runtime side effect前已经完成：

```text
Validated Game Entry
+
current Platform Launch Manifest
→ exact key-set join
→ resolve every required implementation
→ hosting/security capability preflight
→ immutable PlatformLaunchPlan
```

Main 不重复执行这些验证，也不读取 LaunchPlan 内容。

Main 的前置假设：

> 注入的 `RuntimeHosting` 已经绑定一个与当前 `ValidatedGameEntry` 完整闭合的 current-platform LaunchPlan。

因此普通 Runtime launch path 是：

```text
Main launch(subsystemKey)
→ RuntimeHosting lookup frozen plan internally
→ physical Runner Runtime
```

而不是：

```text
Main
→ parse platform config
→ resolve module
→ decide Node/Worker
```

---

## 9. Internal Module Map

目标内部结构：

```text
Main Core
├── SessionCoordinator
├── SubsystemRegistry
├── LaunchAttemptRegistry
├── RuntimeRegistry
├── RuntimeBootstrapCoordinator
├── FrameRegistry
├── ActivationRegistry
├── StackState
├── StackMutationCoordinator
├── InputTargetRegistry
├── FrameDeadline / FailureClassifier
├── RuntimeFailureUnwindCoordinator
├── DataAuthorityRegistry
├── RendererAuthorityProjector
├── RendererControlCoordinator
└── ShutdownCoordinator
```

原则：

> 不建立一个可以被任意 handler 直接修改的巨大 mutable `MainState`。

所有 authority mutation 必须通过明确 owner/coordinator。

---

## 10. SessionCoordinator

负责 Main Session 的顶层 one-shot 生命周期：

```text
created
→ starting
→ running
→ stopping
→ closed
```

Phase 1 bootstrap：

```text
validated logical topology already available
platform LaunchPlan already preflight-closed
→ create one Launch Attempt for every required subsystem
→ request physical Runtime launch
→ bind Runtime Control
→ identify every subsystem
→ wait every required Runtime ready
→ establish Renderer participant/control
→ create initial Frame
→ running
```

如果任一 required Runtime bootstrap失败：

```text
whole Game bootstrap fails
→ stop accepting new application work
→ bounded cleanup all started physical resources
→ closed(failed)
```

不得让“部分 required Runtime ready”变成一个正常 running Session。

---

## 11. Launch Attempt Registry

每次 physical Runtime lifetime 都对应 fresh Main Launch Attempt。

概念：

```ts
interface RuntimeLaunchAttempt {
  readonly id: LaunchAttemptId;
  readonly subsystemKey: string;
  readonly bootstrapToken: string;
}
```

要求：

```text
attempt id unique within Session
bootstrap token fresh per attempt
subsystemKey immutable
attempt never reused after terminal
new Runtime after failure/restart policy (future) = fresh attempt
```

Phase 1 无 automatic restart。

Launch Attempt 是 bootstrap/supervision identity，不替代 Subsystem application identity。

---

## 12. Runtime Registry

Main owns public Runtime lifecycle projection。

候选状态：

```text
starting
connected
identified
initializing
ready
stopping
failed
stopped
```

来源：

```text
starting
    Main accepted Launch Attempt

connected
    Runtime Control capability physically accepted

identified
    successful subsystem.hello

initializing
    valid subsystem status / local bootstrap phase when applicable

ready
    valid subsystem.status(ready)

stopping
    Main shutdown intent

failed
    Runtime/Control failure classification

stopped
    actual physical termination observation from Supervisor
```

必须保持：

```text
launch requested != container created
container created != connected
connected != identified
identified != ready
ready != DataAuthority exists
ready != Data carrier current
failed != stopped
```

`stopped` 只能来自 actual physical termination fact。

---

## 13. Runtime Bootstrap Coordinator

每个 required Subsystem：

```text
Main creates Launch Attempt
→ register/bind bootstrap authority
→ RuntimeHosting.launch(key, attempt)
→ physical RuntimeHostHandle
→ RuntimeControlHost provides current attempt Control capability
→ @loomrealm/runtime-control Main peer/session
→ subsystem.hello
→ bind hello identity to expected key
→ identified
→ optional initializing
→ ready
```

非法情况：

```text
hello key != expected key
second hello
second Control lifetime for same attempt
Control loss before/after ready
unexpected physical exit
```

都按当前正式协议/Runtime failure规则收敛，不从 module/PID 推测 identity。

---

## 14. Runtime Control Integration

Main 使用 `@loomrealm/runtime-control`，不自己实现 JSON-RPC。

`runtime-control` owns：

```text
schema/encoder/parser
one carrier reader/dispatcher
Request ID namespace
request/response correlation
deadlines
method direction
hello/profile gating
wire error classification
commit-evidence result
```

Main owns：

```text
whether a valid request may mutate application authority
Frame/Activation allocation
Stack transaction
InputTarget publication
Runtime lifecycle interpretation
failure unwind commit
```

核心边界：

> **runtime-control 负责“协议上发生了什么”；Main 负责“这些协议事实允许 application authority 怎样改变”。**

---

## 15. Frame Registry

Main 是 Frame identity/lifecycle/outcome 的唯一 authority。

每个 Frame 至少有：

```text
frameId
subsystemKey
caller (none | parent frame identity)
initial params/input
lifecycle
accepted outcome (optional)
current activation (optional)
```

Invariants：

```text
frameId never reused in Session
subsystemKey immutable
caller immutable after allocation
accepted outcome once committed is immutable
closed Frame never becomes live again
physical Runtime handle/module not part of Frame identity
```

Main 不把 Subsystem SDK 的 author `Frame` object 直接存为 authority model。

---

## 16. Activation Registry

Activation 表示某 Frame 某次 active epoch。

要求：

```text
Activation identity minted only by Main
Activation never reused
only active Frame may have current Activation
suspend/revoke makes old Activation permanently stale
resume always creates fresh Activation
Frame return/close revokes current Activation
```

任何来自 Subsystem 的 activation-scoped Request 必须匹配 current Activation，否则拒绝且不得产生 authority mutation。

Activation identity 不依赖 physical connection、module 或 process。

---

## 17. Stack State

Main owns ordered live Frame Stack。

概念：

```text
Bottom
  F1 suspended
  F2 suspended
  F3 active
Top
```

Phase 1 正常情况下：

```text
0 or 1 active Frame
active Frame = top live Frame
InputTarget references only current active Frame/Activation
```

Stack snapshot 对外只暴露 committed state。

Pending mutation 中间态不得被 Renderer publisher 当成 committed authority 发布。

---

## 18. StackMutationCoordinator

所有影响 Frame Stack / Activation / InputTarget 的普通事务和 failure recovery 必须经过一个 serial mutation authority。

禁止：

```text
Runtime handler directly mutates Stack
Frame.call handler directly publishes InputTarget
Supervisor callback directly pops Frame
Renderer callback directly changes Activation
```

目标：

```text
one mutation at a time
explicit begin/commit/abort-or-fail semantics
stale async completion quarantined
committed snapshot publication only after barriers
```

可以用 internal serialized executor / mutation epoch 实现，但 primitive 不是 domain authority。

---

## 19. Initial Frame Transaction

Session required Runtime ready 后创建 initial Frame：

```text
allocate F0 for game.initial.subsystem/input
→ frame.initialize(F0)
→ initialize Success
→ mint A0
→ frame.activate(F0,A0)
→ activate ACK
→ commit active F0/A0
→ publish InputTarget(F0,A0)
→ publish Renderer authority
```

必须保持：

```text
activate ACK-before-publication
```

Initialize/activate timeout/loss 的 ambiguity 按 Frozen Frame rules 处理；不得 retry/replay。

---

## 20. `frame.call` Transaction

收到 Subsystem `frame.call` 时，Main 先验证：

```text
caller Frame exists
caller subsystem matches connection/runtime identity
activationId == current Activation
caller currently active
no conflicting mutation
callee key declared
callee Runtime usable
```

Accepted call 的概念顺序：

```text
current Caller F/A
→ enter mutation gate
→ revoke ordinary input publication
→ commit caller suspension according to Frame protocol
→ allocate child Frame C
→ push C as logical child
→ send frame.call Success containing child identity
────────────────────────────────────────────
Response-before-dependent-RPC barrier
→ frame.initialize(C)
→ mint fresh child Activation AC
→ frame.activate(C,AC)
→ activate ACK
→ commit/publish child active + InputTarget
```

如果 target missing/unavailable 是正式协议定义的 **known pre-commit recoverable rejection**：

```text
no caller suspension commit
no child Frame
caller Activation remains current
request receives explicit recoverable Error
```

如果 post/ambiguous failure：

```text
MUST NOT guess rollback
MUST NOT retry call
→ Runtime failure classification / unwind
```

---

## 21. `frame.return` Transaction

Return 首先验证 Frame/Activation/currentness，然后接受 immutable outcome：

```text
completed(value)
cancelled
failed(error)
```

Accepted return 概念顺序：

```text
active child C/AC
→ enter mutation gate
→ accept/persist outcome
→ revoke AC / null ordinary InputTarget
→ move C toward closing
→ send frame.return Success
────────────────────────────────────────────
Response-before-dependent-RPC barrier
→ frame.close(C)
→ pop/close C
→ if healthy caller exists:
       mint fresh caller Activation A'
       frame.resume(caller,A')
       resume ACK
       commit/publish caller active + InputTarget
  else:
       Stack may become empty
```

重要：

> 已被 Main 接受的 child outcome 在后续 cleanup/failure 中必须按 Frozen Frame semantics preserve；不能因 close/resume 后续故障而改写成另一 outcome。

---

## 22. Administrative Suspend / Resume / Close

Main 可能因 application transaction/failure cleanup 发起：

```text
frame.suspend
frame.resume
frame.close
```

规则：

```text
suspend/revoke old Activation before ordinary input can target it
resume always uses fresh Activation
resume ACK-before-publication
close is terminal for that Frame
no same-Frame Activation reuse
```

Subsystem 内 business task cancellation/discard 由 `@loomrealm/subsystem` SDK 映射；Main只依据 formal response/commit evidence推进 authority。

---

## 23. InputTarget Registry

Main 只拥有 ordinary input 的 authority target：

```ts
interface InputTarget {
  readonly subsystemKey: string;
  readonly frameId: FrameId;
  readonly activationId: ActivationId;
}
```

Main 不拥有：

```text
Subsystem Interest[F]
Renderer Producer
raw browser/device input
```

Publication rules：

```text
no current Activation → InputTarget = null
pending Stack mutation → null or previous committed target only when protocol allows
new activate/resume → ACK before publishing new target
Runtime failure/unwind → revoke affected target before exposing recovered state
```

Renderer 最终 effective ordinary input gate 仍由：

```text
Main InputTarget
× current Activation
× Subsystem Interest[F]
× Renderer Producer
× matching Data Connection
```

共同决定。

---

## 24. FailureClassifier

Main 不在各 handler 中散落 ad-hoc timeout/connection logic。

目标集中为：

```text
Frame/Control protocol evidence
Supervisor physical facts
Runtime self-reported status
Main invariant checks
        ↓
FailureClassifier
        ↓
recoverable known-no-commit
or RuntimeFailure
```

核心分类：

```text
Success
    known committed according to protocol

Explicit recoverable Error
    known no-commit only where contract explicitly defines

Explicit fatal Error
    Runtime-fatal according to contract

Timeout / carrier loss during state-changing operation
    ambiguous commit
    → Runtime-fatal

Protocol violation / identity divergence / invariant corruption
    → Runtime-fatal

unexpected physical Runtime exit
    → Runtime-fatal
```

不得把 transport timeout当作“失败所以没发生”。

---

## 25. No Retry / No Replay

对 Frozen Frame state-changing Requests：

```text
no automatic retry
no replay after timeout
no speculative rollback
no request-id reuse to infer idempotence
```

理由：timeout/loss 不能证明远端未 commit。

Main 的恢复动作是 Runtime failure + authority unwind，不是重发业务 mutation。

---

## 26. RuntimeFailureUnwindCoordinator

Main failure recovery 是一等 authority algorithm。

输入：

```text
failedRuntimeKeys
current live Stack
accepted outcomes
current Runtime health
```

固定点流程：

```text
1. 找出 Stack 中最低位置的 failed-runtime occurrence
2. 该位置及其上方整个 suffix doomed
3. revoke affected InputTarget / Activations
4. cleanup doomed Frames from Top → Bottom
5. cleanup 本身若暴露新的 Runtime failure，扩展 failedRuntimeKeys
6. 重新计算最低 doomed root
7. 重复直到 fixed point
8. 保留已接受 outcome
9. 若存在健康 surviving direct caller：fresh Activation resume + ACK + publish
10. 否则 Stack 收敛为空/Session-level terminal path
```

必须保证：

```text
failure unwind owns Stack mutation while active
ordinary call/return cannot interleave
fresh resume Activation never reuses old id
stale late responses/tasks cannot resurrect doomed state
```

Platform Supervisor 只能报告 physical failure facts，不能选择 unwind root。

---

## 27. Physical Runtime Failure vs `stopped`

```text
Runtime failed
    application/runtime-control interpretation

Runtime stopped
    actual physical termination observation
```

所以：

```text
failed may precede stopped
shutdown requested does not mean stopped
exit code 0 does not automatically mean healthy completion
```

Main 在 failure path 可以请求 `RuntimeHosting.terminate(handle)`，但 public `stopped` 仍只在 Supervisor fact 到达后 commit。

---

## 28. Renderer Authority Projection

Main 是 Renderer 可观察 authority 的 source of truth，但 wire/sync mechanics 交给 `@loomrealm/renderer-control`。

Main projection 至少包括：

```text
Runtime projection
Frame Stack
current Activation
InputTarget
DataAuthority
```

Main MUST NOT通过 Renderer Control 发布：

```text
module/path/URL
PID/Worker handle
PlatformLaunchPlan
Data endpoint/ticket/Port
Subsystem Interest Registry
Render Domain state
Content bytes/credential
```

Publication 原则：

```text
only committed authority
causal barrier completed first
no pending transaction intermediate state
```

Renderer revision/snapshot/delta encoding 由 renderer-control contract/package拥有。

---

## 29. DataAuthority Registry

Main owns：

```ts
interface DataAuthority {
  readonly subsystemKey: string;
  readonly generation: number;
  readonly dataProfile: string;
}
```

规则：

```text
subsystemKey must be declared/currently eligible
generation is Main-minted authority epoch
dataProfile is complete application profile identity
same generation/profile immutable
profile change → fresh generation
replacement/revocation → publish through Renderer Control
```

当前 Profile：

```text
loomrealm.renderer-data/1
```

Main 不解析 Data Profile child protocol payload。

---

## 30. DataConnectionBroker Coordination

概念：

```text
Main commits DataAuthority(S,G,P)
→ Renderer Control publishes S/G/P
→ Main/Platform coordination asks Broker to realize S/G/P
→ Platform provisions Renderer + Subsystem physical carrier
```

必须允许：

```text
DataAuthority exists
while
no Data carrier currently established
```

以及：

```text
carrier loss/provisioning failure
→ current physical realization unavailable
→ Runtime remains healthy
→ Frame Stack unchanged
→ Main DataAuthority unchanged unless Main explicitly replaces/revokes it
```

同 S/G/P MAY sequential reconnect，由 Broker/Data roles 管 physical/current carrier lifecycle。

---

## 31. Renderer Bootstrap / Reload

Main Renderer authority 与 physical Renderer lifetime分离。

概念：

```text
Main requests current Renderer participant
→ RendererHosting realizes it
→ RendererControlHost binds Control
→ renderer handshake/profile validation
→ send current full committed authority Snapshot
→ incremental publication
```

Renderer reload/replacement：

```text
MUST NOT create new Runtime identities
MUST NOT recreate Frame Stack
MUST NOT mint new Data generation solely because UI reloaded
MAY require fresh physical Renderer Control/Data connections
```

Main authority 先存在；Renderer 是其 replica consumer。

---

## 32. Concurrency Model

Main 有多个异步来源：

```text
Runtime Control inbound request/status
outbound Runtime Control completion
Supervisor exit facts
Renderer Control lifecycle
Data Broker facts
shutdown request
timeouts
```

它们不能并发直接修改 authority。

目标：

```text
all authority mutations serialized
I/O performed outside or across controlled transaction stages
completion revalidates mutation/epoch/currentness
late stale completion discarded/quarantined
```

可以使用：

```text
serialized mutation executor
operation epoch/token
immutable snapshots
explicit pending operation records
```

但不可依赖“JavaScript 单线程”作为 domain-level serialization guarantee。

---

## 33. Mutation Gate

在下列 operation pending 时必须 gate conflicting mutation：

```text
call acceptance / suspension
return acceptance / close/resume
administrative suspend/resume/close
Runtime failure unwind
Session shutdown
Renderer authority replacement where causal ordering requires
```

Gate 不是 global deadlock lock；它是 Main authority transaction ownership。

每个 pending operation 必须有明确：

```text
owner
expected current state
commit evidence
terminal/failure transition
late-completion policy
```

---

## 34. Shutdown

Phase 1 Session shutdown：

```text
enter stopping
→ reject/stop new ordinary application mutations
→ revoke ordinary InputTarget
→ stop Renderer/Data provisioning work as appropriate
→ request identified/ready Runtime subsystem.shutdown
→ bounded wait
→ request Platform terminate for remaining Runtime Containers
→ observe actual termination
→ release Renderer/platform resources
→ closed
```

原则：

```text
shutdown intent != stopped
late Frame business completion cannot reopen Session
Runtime shutdown timeout may require physical terminate
no automatic restart during shutdown
```

具体 physical cleanup order 由 Platform capability实现，Main只拥有 logical shutdown coordination。

---

## 35. Error Surface

Main public errors应区分：

```text
Game logical/bootstrap validation should already have failed before Main construction
Platform preflight/Runtime launch failure
Runtime Control failure
Frame transaction recoverable rejection
Runtime-fatal/ambiguous failure
Renderer bootstrap/control failure
Session shutdown/closed
internal invariant violation
```

不要把所有错误压成 `Error("runtime failed")`；但也不要把 wire/Node/Worker concrete error type泄漏到 Main public API。

Platform error应被映射成 stable role-level classification + optional diagnostic cause。

---

## 36. Observability

Main MAY提供结构化 diagnostic events，但 diagnostics 不是 authority API。

候选事件：

```text
session lifecycle
launch attempt created/terminal
runtime lifecycle transition
frame transaction begin/commit/fail
activation mint/revoke
InputTarget publish/revoke
failure unwind root/expansion/fixed-point
DataAuthority replacement
renderer snapshot publication
shutdown progress
```

禁止让日志消费者反向控制 authority。

Diagnostic payload 不默认泄漏：

```text
bootstrapToken
Data ticket
Content credential
full private Platform target
```

---

## 37. Testing Surface

`@loomrealm/main/testing` 可提供：

```text
FakeRuntimeHosting
FakeRuntimeControlHost / scripted Main peer
FakeRendererHosting
FakeRendererControlHost
FakeDataConnectionBroker
DeterministicMainHarness
AuthoritySnapshot helpers
abstract trace recorder
fault injection helpers
```

优先复用 capability package 的 testing primitives，而不是复制 Runtime/Renderer protocol parser。

Main Core 测试不需要：

```text
Electron/Hostra
real child_process
browser Worker
real WebSocket
real MessagePort
filesystem module resolver
```

---

## 38. Required M5 Vertical Slice Tests

M5 关闭至少证明：

```text
1. Validated Game {key} registry安装
2. RuntimeHosting launch request只有 logical key/attempt，没有 module/path/url
3. all required Runtime ready gate
4. initial Frame initialize/activate + ACK-before-publication
5. same-subsystem nested call
6. cross-subsystem nested call
7. child completed return
8. child cancelled return
9. child failed return
10. recoverable pre-commit call rejection preserves caller Activation
11. stale Activation request rejected with zero mutation
12. call/return Response-before-dependent-RPC trace
13. ambiguous Frame mutation → Runtime failure
14. unexpected Runtime exit → Runtime failure
15. lowest failed-runtime root → whole suffix unwind
16. cleanup-induced additional failure → fixed-point expansion
17. accepted outcome preserved during later failure
18. surviving Caller gets fresh Activation
19. InputTarget null/republication barriers
20. Frame/Activation ids never reused
```

这些测试必须先用 fake ports / deterministic protocol fixtures 通过，再接 Hostra/PWA。

---

## 39. Renderer / Data Tests

后续阶段至少：

```text
committed authority only publication
full Renderer bootstrap Snapshot
Renderer reload preserves Main authority
DataAuthority generation monotonic/current rules
profile change → fresh generation
Broker cannot mint generation/profile
Data provisioning failure does not fail Runtime/Frame
Data carrier loss does not unwind Stack
same S/G/P sequential reconnect allowed
physical Platform material never appears in Renderer authority
```

---

## 40. Cross-platform Equivalence

同一 `@loomrealm/main` implementation 在：

```text
Fake Platform
Hostra Platform
PWA Platform
```

对同一 logical Game + protocol scenario 应产生等价 application trace：

```text
Runtime public lifecycle
Frame identities/Stack relations
Activation transitions
Frame outcomes
InputTarget transitions
failure classification/unwind result
DataAuthority transitions
Renderer committed authority
```

不比较：

```text
PID
Worker id
module path/bytes
WebSocket URL
MessagePort identity
bootstrap/provisioning object shape
physical timing noise outside formal deadlines
```

---

## 41. Explicit Non-goals

Phase 1 Main package不做：

```text
lazy/optional Subsystem
multiple Runtime instances per subsystem key
automatic restart/checkpoint
Save System
Frame replay
remote Runtime
multiple Renderer authority
platform implementation negotiation
arbitrary launcher extension registry
process/Worker sandbox policy
business scheduler beyond formal Frame model
Render scene graph
input device mapping
Content repository/cache
```

这些能力未来若加入，必须先明确 authority/lifecycle，不能通过把 Main 变成万能 service locator解决。

---

## 42. Proposed Source Layout

```text
packages/main/
├── src/
│   ├── index.ts
│   ├── session/
│   │   ├── main-session.ts
│   │   └── shutdown-coordinator.ts
│   ├── game/
│   │   └── subsystem-registry.ts
│   ├── runtime/
│   │   ├── launch-attempt-registry.ts
│   │   ├── runtime-registry.ts
│   │   ├── bootstrap-coordinator.ts
│   │   └── failure-classifier.ts
│   ├── frame/
│   │   ├── frame-registry.ts
│   │   ├── activation-registry.ts
│   │   ├── stack-state.ts
│   │   ├── mutation-coordinator.ts
│   │   └── failure-unwind.ts
│   ├── input/
│   │   └── input-target-registry.ts
│   ├── renderer/
│   │   ├── authority-projector.ts
│   │   └── control-coordinator.ts
│   ├── data/
│   │   └── data-authority-registry.ts
│   ├── platform/
│   │   ├── runtime-hosting.ts
│   │   ├── runtime-control-host.ts
│   │   ├── renderer-hosting.ts
│   │   ├── renderer-control-host.ts
│   │   └── data-connection-broker.ts
│   └── internal/
│       ├── mutation-epoch.ts
│       └── invariants.ts
└── test/
```

这是实现组织建议，不要求每个文件都成为 public export。

---

## 43. Implementation Stages

### Stage A — Core authority model

```text
SubsystemRegistry
LaunchAttemptRegistry
RuntimeRegistry
FrameRegistry
ActivationRegistry
StackState
InputTarget
immutable snapshot
```

纯内存，无真实 protocol/Platform。

### Stage B — Runtime bootstrap with fake ports

```text
ValidatedGameEntry
→ eager Launch Attempts
→ fake RuntimeHosting
→ scripted Runtime Control
→ all-required ready / bootstrap failure cleanup
```

### Stage C — Frozen Frame transaction engine

```text
initial
call
return
suspend/resume/close
mutation gate
causal barriers
```

### Stage D — Failure engine

```text
FailureClassifier
Runtime failed lifecycle
fixed-point unwind
stale completion quarantine
```

### Stage E — Renderer/Data authority

```text
RendererAuthorityProjector
Renderer Control integration
DataAuthorityRegistry
DataConnectionBroker coordination
```

### Stage F — Shutdown/conformance

```text
bounded shutdown
physical stopped observation
M5 golden traces
fault injection
cross-platform abstract trace harness
```

---

## 44. Package Closing Conditions

`@loomrealm/main` Draft 可认为 implementation-ready，当以下全部成立：

```text
1. Main authority与 runtime-control/renderer-control mechanics无重叠
2. Main direct dependency graph不包含 concrete Platform launcher/transport
3. RuntimeHosting只接受 logical key + Launch Attempt material
4. raw Platform manifest/module/path/url永不进入 Main state/API
5. Game key是 Runtime application identity唯一 join key
6. all-required bootstrap failure有确定 cleanup语义
7. Frame/Activation/Stack ownership唯一且 transaction serial
8. ACK-before-publication / Response-before-dependent-RPC可由测试证明
9. timeout/loss ambiguity统一进入 Runtime-fatal，无 retry/replay
10. fixed-point unwind有 executable golden traces
11. stale async completion不能恢复旧 Activation/Frame authority
12. Renderer只看到 committed authority
13. DataAuthority与 Data carrier lifecycle分离
14. Broker/provisioning failure不修改 Runtime/Frame authority
15. Hostra/PWA可在不修改 Main Core 的情况下提供 ports
16. Fake Platform可完整运行 M5 vertical slice
```

---

## 45. Final Invariants

1. **Main is platform-neutral.**  
2. **Main owns application authority; Platform owns physical realization.**  
3. **Game Package supplies logical topology only.**  
4. **Platform executable binding never enters Main authority.**  
5. **Subsystem key is the application identity; physical ids are not.**  
6. **Runtime Control/Renderer Control packages own protocol mechanics, not Main state.**  
7. **Every Frame/Activation/Stack mutation is serialized through Main authority.**  
8. **Activation is one-shot and never reused.**  
9. **Response-before-dependent-RPC and ACK-before-publication are hard causal barriers.**  
10. **Ambiguous state-changing operation is Runtime-fatal; no retry/replay.**  
11. **Failure recovery is Main-owned fixed-point unwind.**  
12. **`stopped` comes only from actual physical termination observation.**  
13. **Renderer receives committed authority only.**  
14. **Main owns DataAuthority, not Data carrier/protocol child state.**  
15. **Data provisioning/loss does not automatically fail Runtime or unwind Frame.**  
16. **Main does not own Subsystem Interest or Render Domain state.**  
17. **No Platform branch is required inside Main Core.**  
18. **The same Main implementation must run against Fake, Hostra, and PWA ports.**
