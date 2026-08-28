# 程序主系统模块设计

> 层级：模块设计  
> 状态：M5 Implemented Baseline / M7+ Active Design  
> 稳定程度：M5 Frozen Baseline / Later Slices Evolving  
> 主要定义：Main 内部 authority/transaction/recovery 模块、LogicalGameBootstrap input、session-scoped concrete Platform composition，以及 Main-facing narrow capability view  
> 依赖：[系统架构总览](../../10-architecture/system-overview.md)、[运行时启动系统](../../10-architecture/runtime-bootstrap-system.md)、[ADR 0020](../../decisions/0020-game-entry-consumer-boundary.md)、[ADR 0026](../../decisions/0026-session-scoped-platform-instance.md)、[Runtime Control Profile v1](../../15-contracts/runtime-control-profile-v1.md)、[Frame / Call v1](../../15-contracts/frame-call-protocol-v1.md)、[Renderer Control v1](../../15-contracts/main-renderer-control-v1.md)、[Renderer Data Profile v1](../../15-contracts/renderer-data-profile-v1.md)  
> 最近复核：2026-08-28

Main 是 Session / Runtime / Frame / Activation / InputTarget / DataAuthority application authority。它不拥有 Game Entry document contract、Platform executable binding，也不等于 Process/Worker/WebSocket/MessagePort realization。

当前 M5 已实现 Session/Runtime/Frame/Activation/InputTarget 与 failure unwind；Renderer Control/DataAuthority 属于后续 M7+ slice，不作为 M5 closure 条件。

---

## 1. Internal Modules

```text
Main System
├── LogicalGameBootstrap Installer
├── Subsystem Registry {key}
├── Initial Target/Input
├── Launch Attempt Registry
├── Runtime Registry / Supervisor Coordinator
├── Runtime Control Registry / Dispatcher integration
├── Frame / Activation Registry
├── Stack Mutation Coordinator
├── Frame Deadline / Failure Classifier
├── Runtime Failure Unwind Coordinator
├── Renderer Control Publisher
├── DataAuthority Registry
└── Platform Port Coordination
```

Core MUST NOT import：

```text
@loomrealm/game-package
GameEntryV1 / ValidatedGameEntryV1
@loomrealm/game-launcher-hostra/pwa
raw game.json parser
raw Platform Launch Manifest
filesystem/module resolver
child_process / Worker
WebSocket / MessagePort
```

---

## 2. Main Bootstrap Input

Main receives immutable logical facts only：

```ts
interface LogicalGameBootstrap {
  readonly subsystemKeys: readonly string[];
  readonly initial: {
    readonly subsystemKey: string;
    readonly input: JsonValue;
  };
}
```

Main MUST validate only its own bootstrap invariants（例如 internal duplicate/declared-target defensive assertions if justified），但 MUST NOT重新执行 GameEntryV1 document validation or depend on `formatVersion`。

The bootstrap contains no executable capability。

---

## 3. Prepared Platform Boundary

Before Main physical Runtime bootstrap, matching Platform Launcher/Composition has already completed：

```text
Game Entry validation
→ Platform Launch Manifest validation
→ exact key-set join
→ all executable resolution
→ hosting/security capability preflight
→ immutable PlatformLaunchPlan
→ immutable LogicalGameBootstrap
```

Main starts from：

```text
LogicalGameBootstrap
+
session-scoped prepared concrete Platform instance
    exposed through Main's narrow capability view
```

not from raw documents。

Composition model：

```ts
const platform = createPwaPlatform(/* current environment/policy */);
const prepared = await platform.prepareGame(source);

await runMain({
  bootstrap: prepared.logicalBootstrap,
  platform,
});
```

Main MUST NOT call `prepareGame()`；PREPARE belongs to product composition / concrete Platform before Main starts.

---

## 4. Main-facing Platform Ports

M5 已冻结并由真实 Main consumer 验证的 consumer-owned role-local view：

```ts
interface MainPlatform {
  readonly scheduler: DeadlineScheduler;
  readonly bootstrapTokens: BootstrapTokenGenerator;
  readonly runtimeHosting: RuntimeHosting;
}
```

`MainPlatform` 是 Main 当前需要的 capability bundle，不是 universal LoomRealm Platform contract。Concrete `HostraPlatform` / `PwaPlatform` MAY 是更大的 composition object，并 structural-satisfy 这个 view；`@loomrealm/main` 不依赖 concrete type。

Capability 按 milestone 增长：

```text
M5
    DeadlineScheduler
    RuntimeHosting
        → HostedRuntime
            → Main-side Runtime Control establishment
            → physical termination fact
            → termination request capability

M7
    RendererHosting / Renderer Control binding

M8/M9
    DataConnectionBroker
```

Content 若没有 Main-owned Session-level authority，则不穿过 Main；它应由具体 Platform 直接投影到真实 role consumer。

Ports provide physical capability/facts；Main仍拥有 application authority。

Concrete Platform instance 已绑定 immutable PlatformLaunchPlan；其 `RuntimeHosting` capability 内部读取该 plan。Main 不需要 module resolver API。

---

## 5. Logical Registry / Launch Boundary

Main installation：

```text
LogicalGameBootstrap.subsystemKeys
→ complete Subsystem Registry

LogicalGameBootstrap.initial
→ initial logical target/input
```

Then：

```text
create current Launch Attempt
→ BootstrapTokenGenerator.generate()
→ Main validates/registers token against key/attempt
→ RuntimeHosting.launch({subsystemKey:key, bootstrapToken})
→ accept Control carrier
→ hello/identified/ready
```

Main MUST NOT put module/path/URL/Node/Worker options into Launch Attempt application model。

```text
launch != module loaded != connected != identified != ready
ready != Data current
```

---

## 6. Runtime Control

```text
Control v1 + Frame v1 = Runtime Control Profile v1
```

Main-side integration：

```text
one Control carrier reader/dispatcher
shared sender Request ID namespace
one UTF-8 JSON text per JSON-RPC message
no Batch
```

Control loss/ambiguity进入 Runtime failure，无 same-attempt reconnect。

---

## 7. Frame / Activation Registry

Guarantees：

```text
frameId never reused
subsystemKey permanent
caller immutable
only active Frame has current Activation
Activation never reused
outcome/lifecycle separate
```

Main唯一 mint/revoke Activation。

Executable module或 physical Runtime handle不参与 Frame identity。

---

## 8. Stack Mutation Coordinator

Normal transactions与 failure recovery共享 serial authority。

```text
Initial
initialize ACK → activate fresh A ACK → publish target

Call
accept/revoke/suspend/push/null target
→ call Response
→ child initialize/activate
→ ACK → publish child target

Return
accept outcome/revoke/closing/null target
→ return Response
→ close/pop
→ fresh resume Caller ACK
→ publish caller target
```

Response-before-dependent-RPC；ACK-before-publication。

---

## 9. Failure Classifier / Unwind

```text
Success        → known commit
Explicit Error → protocol-defined known no-commit/fatal
Timeout/loss   → ambiguous
```

Ambiguous/divergence/protocol failure → Runtime failed；no retry/replay。

Unwind：

```text
failedRuntimeKeys
→ lowest live failed-runtime occurrence
→ whole suffix doomed
→ cleanup Top→Bottom
→ fixed-point expansion
→ preserve accepted outcome
→ fresh healthy Caller resume or empty Stack
```

Platform Supervisor只能报告 physical facts，不能选择 unwind root。

---

## 10. HostedRuntime / Physical Facts

M5 `RuntimeHosting.launch({subsystemKey,bootstrapToken}, signal)` 返回一个 `HostedRuntime`，把同一 physical Runtime lifetime 的：

```text
Main-side Runtime Control establishment
requestTermination()
terminated Promise
```

自然关联在一起，不再需要平行 RuntimeControlHost/Supervisor handle registry。

`terminated` 只有 **resolve** 才是 actual physical termination fact；rejection/observation failure 不得被解释为 stopped。`requestTermination()` 只请求终止，也不等于 stopped。

M5 public port 暂不暴露 PID/Worker/exit code/signal 等 diagnostics；这些保持 Platform-local，直到真实 portable consumer 证明需要。

No automatic restart；新 Runtime必须 fresh Launch Attempt/token/HostedRuntime/Control lifetime。

---

## 11. Renderer Control Publisher

Only committed：

```text
Runtime projection
Frame Stack / Activation
InputTarget
DataAuthority {subsystemKey,generation,dataProfile}
```

Never：

```text
GameEntryV1 / formatVersion
Data endpoint/ticket/Port
Platform provisioning handle
PlatformLaunchPlan/module/path/URL
Interest Registry
Render State
Content Grant
```

---

## 12. DataAuthority Registry

```ts
interface DataAuthority {
  subsystemKey: string;
  generation: number;
  dataProfile: string;
}
```

Current Profile：

```text
loomrealm.renderer-data/1
```

Main负责 mint/increment generation、select profile、replace/revoke authority、publish through Renderer Control。

Profile change MUST fresh generation。

---

## 13. DataConnectionBroker Coordination

```text
Main current DataAuthority(S,G,P)
→ Platform DataConnectionBroker
→ matching RendererDataBinding
→ matching SubsystemDataBinding
```

Broker不拥有 generation/profile。

Hostra可通过 Runner provisioning IPC；PWA可 transfer MessagePort。

```text
DataAuthority exists != carrier current
Data loss/provision failure != Runtime failure/Frame unwind
```

---

## 14. Input / Render Boundary

Main only owns：

```text
Frame / Activation / InputTarget
DataAuthority
```

Does not own：

```text
Interest[F]
Input Producer
Render Domain State
```

Renderer ordinary input gate = Main authority × Frame Interest × Producer × current Data。

Render Domain lifecycle由 Subsystem控制。

---

## 15. Platform Realizations

```text
Hostra Desktop
    RuntimeHosting        HostraLaunchPlan → Node Runner
    RuntimeControlHost    WebSocket
    RendererHosting       BrowserWindow
    RendererControlHost   WebSocket
    DataConnectionBroker  Data WS + Runner provisioning IPC

PWA
    RuntimeHosting        PwaLaunchPlan → Worker Runner
    RuntimeControlHost    MessagePort
    RendererHosting       Window
    RendererControlHost   MessagePort
    DataConnectionBroker  MessageChannel / Port transfer
```

Main-facing logical ports相同；Platform module artifact可不同。

---

## 16. Tests

M5 executable qualification 已使用 fake physical Platform + real Runtime Control + real Subsystem Host 验证：

```text
LogicalGameBootstrap defensive install
Main public boundary has no Game Package/launcher/concrete Platform dependency
required Runtime hello/identified/ready
cross-Subsystem nested Frame call/return
same-Subsystem recursion without reentrant deadlock
recoverable undeclared target preserves current Activation
child Runtime failure fixed-point unwind + fresh healthy Caller resume
root Runtime loss does not re-enter stale business continuation
duplicate bootstrap token fails closed
root outcome / external abort graceful shutdown
termination observation rejection is not physical termination proof
```

M7+ Renderer/Data tests remain future milestone gates and MUST NOT be used to weaken or reinterpret M5 closure.

---

## 17. Final Invariants

1. Main core platform-neutral；
2. Main consumes `LogicalGameBootstrap`, not GameEntry/ValidatedGameEntry；
3. Main has no `@loomrealm/game-package` or concrete launcher dependency；
4. Main owns logical key registry, not executable binding；
5. RuntimeHosting封闭绑定 PlatformLaunchPlan，Main launch request只投影 key + bootstrapToken；
6. full Platform PREPARE在 Main physical Runtime bootstrap前闭合；
7. Runtime Control = Control1 + Frame1；
8. ready不携 Data/executable material；
9. Frame/Stack mutation serial；
10. ambiguous Runtime-fatal/no retry；
11. failure unwind Main-only；
12. stopped只来自 actual termination；
13. DataAuthority = S/G/dataProfile；
14. Broker/provisioning只实现 physical carrier；
15. Data loss/provision failure不等于 Runtime/Frame failure；
16. Main不拥有 Interest/Render Domain；
17. Hostra/PWA document/module/Runner差异不进入 Main state。
